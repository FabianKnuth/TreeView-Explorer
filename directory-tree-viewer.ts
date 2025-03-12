import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import prompts from 'prompts';

// Configuration
const SYMBOLS: Symbols = {
  BRANCH: '├── ',
  LAST_BRANCH: '└── ',
  INDENT: '│   ',
  INDENT_EMPTY: '    ',
  EXPANDED: '[-]',
  COLLAPSED: '[+]',
  SELECTED: '[✓]',      // White checkmark (fully selected)
  PARTIAL: '[▪]',       // Gray checkmark (partially selected)
  UNSELECTED: '[ ]'
};

// List of directories to ignore for better performance
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.cache'];
// Data structure for our directory tree
class DirectoryNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children: DirectoryNode[];
  expanded: boolean;
  selected: boolean;
  partiallySelected: boolean;  // New property for partial selection state
  childrenCount: number;      // Count of total children (for optimization)
  fileCount: number;          // Count of files (for optimization)

  constructor(path: string, name: string, isDirectory = false) {
    this.path = path;
    this.name = name;
    this.isDirectory = isDirectory;
    this.children = [];
    this.expanded = false; // Start with collapsed directories
    this.selected = false;
    this.partiallySelected = false;
    this.childrenCount = 0;
    this.fileCount = 0;
  }
}

// Main class for our interactive directory tree
class InteractiveDirectoryTree {
  rootPath: string;
  root: DirectoryNode | null;
  nodeMap: Map<string, DirectoryNode>;
  cursorPosition: number;
  visibleNodes: DirectoryNode[];
  rl: any; // Using any for readline interface
  debug: boolean;
  ignoreDirectories: string[];

  constructor(rootPath: string, ignoreDirectories: string[] = IGNORE_DIRS) {
    this.rootPath = resolve(rootPath);
    this.root = null;
    this.nodeMap = new Map(); // For fast access to nodes
    this.cursorPosition = 0;
    this.visibleNodes = []; // Flat list of currently visible nodes
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Debug mode (for development purposes)
    this.debug = false;
    this.ignoreDirectories = ignoreDirectories;
    
    // Override readline's output to prevent it from messing with our display
    const originalWrite = process.stdout.write;
    this.rl._writeToOutput = function _writeToOutput(stringToWrite: string) {
      if (stringToWrite === this._prompt || stringToWrite === this.line) {
        originalWrite.call(process.stdout, stringToWrite);
      }
    };
  }

  // Scan directory structure and build tree
  async buildTree(): Promise<InteractiveDirectoryTree> {
    const rootName = this.rootPath.split('/').pop() || '';
    this.root = new DirectoryNode(this.rootPath, rootName, true);
    this.nodeMap.set(this.rootPath, this.root);
    
    console.log("\x1b[33mScanning directory structure...\x1b[0m");
    await this.scanDirectory(this.root);
    this.updateVisibleNodes();
    
    return this;
  }

  // Recursively scan directory with improved performance
  async scanDirectory(node: DirectoryNode): Promise<void> {
    try {
      const entries = await readdir(node.path);
      
      // Check if this is a directory we should ignore
      const dirName = node.name;
      if (this.ignoreDirectories.includes(dirName)) {
        // Mark as special directory - we'll handle it differently
        node.childrenCount = 999; // Just mark it as having many children
        node.fileCount = 0;
        return;
      }
      
      // Sort: directories first, then files
      const sorted = await Promise.all(entries.map(async entry => {
        const fullPath = join(node.path, entry);
        try {
          const stats = await stat(fullPath);
          return { 
            name: entry, 
            path: fullPath, 
            isDirectory: stats.isDirectory() 
          };
        } catch (error) {
          // Handle permission errors or other issues
          return { 
            name: entry, 
            path: fullPath, 
            isDirectory: false,
            error: true 
          };
        }
      }));
      
      sorted.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      // Create nodes and continue recursively for directories
      let fileCount = 0;
      let totalChildren = 0;
      
      for (const entry of sorted) {
        // Skip entries with errors
        if ('error' in entry && entry.error) continue;
        
        const childNode = new DirectoryNode(entry.path, entry.name, entry.isDirectory);
        node.children.push(childNode);
        this.nodeMap.set(entry.path, childNode);
        totalChildren++;
        
        if (!entry.isDirectory) {
          fileCount++;
        } else {
          await this.scanDirectory(childNode);
          // Accumulate counts from subdirectories
          fileCount += childNode.fileCount;
          totalChildren += childNode.childrenCount;
        }
      }
      
      // Update counts for this node
      node.fileCount = fileCount;
      node.childrenCount = totalChildren;
      
    } catch (error) {
      const err = error as Error;
      console.error(`Error scanning ${node.path}:`, err.message);
    }
  }

  // Update the list of currently visible nodes - with performance optimizations
  updateVisibleNodes(): void {
    // Save reference to current node
    const currentNodePath = this.visibleNodes.length > 0 && this.cursorPosition < this.visibleNodes.length
      ? this.visibleNodes[this.cursorPosition].path
      : null;
    
    // Build new list of visible nodes - more efficiently
    this.visibleNodes = [];
    if (this.root) {
      // Root is always visible and expanded
      this.root.expanded = true;
      
      // Use a non-recursive approach to avoid stack overflow for large directories
      const stack: [DirectoryNode, boolean][] = [[this.root, true]];
      
      while (stack.length > 0) {
        const [node, isVisible] = stack.pop()!;
        
        if (isVisible) {
          this.visibleNodes.push(node);
        }
        
        if (node.isDirectory && node.expanded && isVisible) {
          // Special handling for directories we're ignoring
          const isIgnoredDir = this.ignoreDirectories.includes(node.name);
          
          if (isIgnoredDir && node.children.length === 0) {
            // For ignored directories that haven't been expanded yet
            // Add a placeholder node to show it can be expanded
            const placeholder = new DirectoryNode(
              join(node.path, "..."), 
              `... (large directory, ${node.name})`, 
              true
            );
            this.visibleNodes.push(placeholder);
            continue;
          }
          
          // Add children in reverse order so they appear in correct order when popped
          for (let i = node.children.length - 1; i >= 0; i--) {
            stack.push([node.children[i], true]);
          }
        }
      }
    }
    
    // Try to find the previous node in the new list
    if (currentNodePath) {
      const newIndex = this.visibleNodes.findIndex(node => node.path === currentNodePath);
      
      if (newIndex !== -1) {
        this.cursorPosition = newIndex;
      } else {
        // Node no longer visible, set to next sensible value
        this.cursorPosition = Math.min(this.cursorPosition, this.visibleNodes.length - 1);
      }
    } else {
      // If no current node, set to beginning
      this.cursorPosition = 0;
    }
    
    // Ensure cursor position is always valid
    if (this.cursorPosition < 0 || this.visibleNodes.length === 0) {
      this.cursorPosition = 0;
    } else if (this.cursorPosition >= this.visibleNodes.length) {
      this.cursorPosition = this.visibleNodes.length - 1;
    }
  }

  // Render the tree in the console - with efficiency improvements
  render(): void {
    console.clear();
    console.log('\x1b[1m\x1b[36mInteractive Directory Explorer\x1b[0m');
    console.log('\x1b[33mNavigation: ↑/↓ Move, Space: Select, Enter: Expand/Collapse\x1b[0m');
    console.log('\x1b[33mActions: S: Save Selected Paths, L: List Selected Files, C: View Content, Q: Quit\x1b[0m\n');
    
    // Determine visible area based on terminal height
    const terminalHeight = process.stdout.rows - 10; // Minus header/footer
    
    // Calculate start index for rendering based on cursor position
    let startIdx = Math.max(0, this.cursorPosition - Math.floor(terminalHeight / 2));
    const endIdx = Math.min(startIdx + terminalHeight, this.visibleNodes.length);
    
    // Show a "scroll up" indicator if there are entries above
    if (startIdx > 0) {
      console.log('   \x1b[33m↑ ... (more entries) ...\x1b[0m');
    }
    
    // Only render nodes within the visible area - this is the key optimization
    for (let i = startIdx; i < endIdx; i++) {
      const node = this.visibleNodes[i];
      this.renderVisibleNode(node, i);
    }
    
    // Show a "scroll down" indicator if there are more entries
    if (endIdx < this.visibleNodes.length) {
      console.log('   \x1b[33m↓ ... (more entries) ...\x1b[0m');
    }
    
    console.log('\n');
    
    if (this.debug) {
      // Show debug information
      console.log(`DEBUG INFO: Cursor Position: ${this.cursorPosition}`);
      console.log(`DEBUG INFO: Active node: ${this.visibleNodes[this.cursorPosition]?.path}`);
      console.log(`DEBUG INFO: Total visible nodes: ${this.visibleNodes.length}`);
      console.log(`DEBUG INFO: Visible range: ${startIdx}-${endIdx-1} (${endIdx-startIdx} entries)`);
    }
  }
  
  // Efficient rendering of a single visible node
  renderVisibleNode(node: DirectoryNode, index: number): void {
    // Calculate path depth
    const depth = (node.path.match(/\//g) || []).length - (this.root?.path.match(/\//g) || []).length;
    let prefix = '';
    for (let d = 0; d < depth; d++) {
      prefix += '    '; // Simple indentation for each level
    }
    
    // Mark current node with cursor
    const isCurrent = index === this.cursorPosition;
    const indicator = isCurrent ? '\x1b[7m' : ''; // Inverted colors for cursor
    
    // Directory color
    const dirColor = node.isDirectory ? '\x1b[36m' : ''; // Cyan color for directories
    
    const reset = '\x1b[0m'; // Reset all formatting
    
    // Checkbox status and folder status
    let statusSymbol = '';
    if (node.isDirectory) {
      statusSymbol = node.expanded ? SYMBOLS.EXPANDED : SYMBOLS.COLLAPSED;
    }
    
    // Selection status with partial selection support
    let checkSymbol;
    if (node.selected) {
      checkSymbol = SYMBOLS.SELECTED;
    } else if (node.partiallySelected) {
      // Use dim gray color for partial selection
      //checkSymbol = '\x1b[2m' + SYMBOLS.PARTIAL + '\x1b[0m';
      checkSymbol = SYMBOLS.PARTIAL;
    } else { 
      checkSymbol = SYMBOLS.UNSELECTED;
    }
    
    // Symbol for branching
    const branchSymbol = SYMBOLS.BRANCH;
    
    // Render the node
    console.log(`${indicator}${prefix}${branchSymbol}${checkSymbol} ${statusSymbol} ${dirColor}${node.name}${reset}`);
  }

  // Expand/collapse directory - with special handling for large directories
  toggleExpand(): void {
    const currentNode = this.visibleNodes[this.cursorPosition];
    if (!currentNode || !currentNode.isDirectory) return;
    
    // Special handling for ignored directories
    if (this.ignoreDirectories.includes(currentNode.name) && currentNode.children.length === 0) {
      // First expansion of an ignored directory - load its immediate children
      this.loadLargeDirectoryContents(currentNode);
      return;
    }
    
    // Normal expansion/collapse
    currentNode.expanded = !currentNode.expanded;
    this.updateVisibleNodes();
  }
  
  // Load contents of a large directory that was previously ignored
  async loadLargeDirectoryContents(node: DirectoryNode): Promise<void> {
    console.clear();
    console.log(`\x1b[33mLoading contents of large directory: ${node.path}\x1b[0m`);
    console.log(`\x1b[33mThis may take a moment...\x1b[0m`);
    
    try {
      const entries = await readdir(node.path);
      
      // Just load the direct children, don't recurse
      const sorted = await Promise.all(entries.map(async entry => {
        const fullPath = join(node.path, entry);
        try {
          const stats = await stat(fullPath);
          return { 
            name: entry, 
            path: fullPath, 
            isDirectory: stats.isDirectory() 
          };
        } catch (error) {
          return null; // Skip entries with errors
        }
      }));
      
      // Filter out null entries and sort
      const validEntries = sorted.filter(entry => entry !== null) as {
        name: string;
        path: string;
        isDirectory: boolean;
      }[];
      
      validEntries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      // Create child nodes for immediate children only
      for (const entry of validEntries) {
        const childNode = new DirectoryNode(entry.path, entry.name, entry.isDirectory);
        // Mark directories as having children without scanning them
        if (entry.isDirectory) {
          childNode.childrenCount = 1; // Placeholder, we don't know yet
        }
        node.children.push(childNode);
        this.nodeMap.set(entry.path, childNode);
      }
      
      // Now expand the node
      node.expanded = true;
      this.updateVisibleNodes();
      this.render();
      
    } catch (error) {
      const err = error as Error;
      console.error(`Error loading directory ${node.path}:`, err.message);
      // Brief pause to show the error
      await new Promise(resolve => setTimeout(resolve, 1500));
      this.render();
    }
  }

  // Select/deselect node
  toggleSelect(): void {
    const currentNode = this.visibleNodes[this.cursorPosition];
    if (!currentNode) return;
    
    // Toggle selection
    const newSelectionState = !currentNode.selected;
    currentNode.selected = newSelectionState;
    currentNode.partiallySelected = false; // Clear partial state
    
    // If a directory is selected, also select all subdirectories
    if (currentNode.isDirectory) {
      this.setSelectionRecursive(currentNode, newSelectionState);
    }
    
    // Update parent directories' selection state
    this.updateParentSelectionStates(currentNode);
  }

  // Recursively set selection
  setSelectionRecursive(node: DirectoryNode, selected: boolean): void {
    node.selected = selected;
    node.partiallySelected = false; // Clear partial selection state
    
    if (node.isDirectory) {
      for (const child of node.children) {
        this.setSelectionRecursive(child, selected);
      }
    }
  }
  
  // Update parent directories' selection states
  updateParentSelectionStates(node: DirectoryNode): void {
    // Find the parent node
    let parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
    let parent = this.nodeMap.get(parentPath);
    
    while (parent) {
      this.updateDirectorySelectionState(parent);
      
      // Move up to the next parent
      parentPath = parent.path.substring(0, parent.path.lastIndexOf('/'));
      parent = this.nodeMap.get(parentPath);
    }
  }
  
  // Update a directory's selection state based on its children
  updateDirectorySelectionState(dir: DirectoryNode): void {
    if (!dir.isDirectory || dir.children.length === 0) return;
    
    let allSelected = true;
    let anySelected = false;
    
    for (const child of dir.children) {
      if (child.selected || child.partiallySelected) {
        anySelected = true;
      }
      
      if (!child.selected) {
        allSelected = false;
      }
    }
    
    if (allSelected) {
      // All children are selected
      dir.selected = true;
      dir.partiallySelected = false;
    } else if (anySelected) {
      // Some but not all children are selected
      dir.selected = false;
      dir.partiallySelected = true;
    } else {
      // No children are selected
      dir.selected = false;
      dir.partiallySelected = false;
    }
  }

  // Navigate up
  moveUp(): void {
    if (this.cursorPosition > 0) {
      this.cursorPosition--;
    }
  }

  // Navigate down
  moveDown(): void {
    if (this.cursorPosition < this.visibleNodes.length - 1) {
      this.cursorPosition++;
    }
  }

  // Save selected directories to a file
  async saveSelection(filename = 'selected_directories.txt'): Promise<void> {
    const selected = this.getSelectedPaths();
    
    try {
      writeFileSync(filename, selected.join('\n'));
      console.log(`\x1b[32mSelection saved in '${filename}'.\x1b[0m`);
    } catch (error) {
      const err = error as Error;
      console.error(`\x1b[31mError saving selection:`, err.message, '\x1b[0m');
    }
    
    // Short pause for the message
    return new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // List selected files
  async listSelectedFiles(): Promise<void> {
    const selectedFiles = this.getSelectedFiles();
    
    console.clear();
    console.log('\x1b[1m\x1b[36mSelected Files\x1b[0m');
    console.log('\x1b[33mPress any key to return to the explorer\x1b[0m\n');
    
    if (selectedFiles.length === 0) {
      console.log('\x1b[33mNo files selected. Use Space to select files.\x1b[0m');
    } else {
      selectedFiles.forEach((file, index) => {
        console.log(`${index + 1}. ${file}`);
      });
      console.log(`\nTotal: ${selectedFiles.length} file(s) selected`);
    }
    
    // Wait for any key press
    await this.waitForKeyPress();
  }
  
  // Display content of selected files with paging support
  async viewSelectedContent(outputToFile = false): Promise<void> {
    const selectedFiles = this.getSelectedFiles();
    
    if (selectedFiles.length === 0) {
      console.clear();
      console.log('\x1b[33mNo files selected. Use Space to select files.\x1b[0m');
      await this.waitForKeyPress();
      return;
    }
    
    let outputFilename = 'file_contents.txt';
    
    if (outputToFile) {
      // Use prompts library for better input experience
      try {
        // Temporarily disable raw mode for proper prompts display
        process.stdin.setRawMode(false);
        
        const response = await prompts({
          type: 'text',
          name: 'filename',
          message: 'Enter output filename:',
          initial: outputFilename
        });
        
        // Re-enable raw mode
        process.stdin.setRawMode(true);
        
        if (response.filename) {
          outputFilename = response.filename;
        }
      } catch (error) {
        // If prompts fails, re-enable raw mode and continue with default
        process.stdin.setRawMode(true);
        console.log(`\x1b[33mUsing default filename: ${outputFilename}\x1b[0m`);
      }
    }
    
    console.clear();
    let output = '';
    
    // Filter out binary files
    const textFiles: string[] = [];
    const binaryFiles: string[] = [];
    
    for (const file of selectedFiles) {
      if (this.isBinaryFile(file)) {
        binaryFiles.push(file);
      } else {
        textFiles.push(file);
      }
    }
    
    // Warn about binary files
    if (binaryFiles.length > 0) {
      const binaryWarning = `\nSkipping ${binaryFiles.length} binary file(s):\n` + 
                           binaryFiles.map(f => `- ${f}`).join('\n') + '\n';
      
      if (outputToFile) {
        output += binaryWarning;
      } else {
        console.log('\x1b[33m' + binaryWarning + '\x1b[0m');
      }
    }
    
    // Process text files
    if (!outputToFile && textFiles.length > 0) {
      // Implementation for console paging
      let currentFileIndex = 0;
      let exitViewer = false;
      
      while (currentFileIndex < textFiles.length && !exitViewer) {
        const file = textFiles[currentFileIndex];
        
        try {
          const content = await this.readFile(file);
          const header = `\n${'='.repeat(80)}\nFILE: ${file} (${currentFileIndex + 1}/${textFiles.length})\n${'='.repeat(80)}\n`;
          
          console.clear();
          console.log('\x1b[1m\x1b[36m' + header + '\x1b[0m');
          
          // Split content into pages
          const lines = content.split('\n');
          const pageSize = process.stdout.rows - 10; // Account for header/footer
          const totalPages = Math.ceil(lines.length / pageSize);
          let currentPage = 0;
          
          // Display first page
          this.displayContentPage(lines, currentPage, pageSize, totalPages);
          
          // Handle paging
          while (!exitViewer) {
            console.log('\n\x1b[33mNavigation: n: next file, p: prev file, →: next page, ←: prev page, q: quit\x1b[0m');
            
            const key = await new Promise<string>(resolve => {
              const handleKey = (data: Buffer) => {
                const key = data.toString();
                process.stdin.removeListener('data', handleKey);
                resolve(key);
              };
              process.stdin.once('data', handleKey);
            });
            
            if (key === 'q') {
              exitViewer = true;
              break;
            } else if (key === 'n') {
              // Next file
              currentFileIndex++;
              break;
            } else if (key === 'p') {
              // Previous file
              if (currentFileIndex > 0) {
                currentFileIndex--;
              }
              break;
            } else if (key === '\u001B[C') {
              // Right arrow - next page
              if (currentPage < totalPages - 1) {
                currentPage++;
                console.clear();
                console.log('\x1b[1m\x1b[36m' + header + '\x1b[0m');
                this.displayContentPage(lines, currentPage, pageSize, totalPages);
              }
            } else if (key === '\u001B[D') {
              // Left arrow - previous page
              if (currentPage > 0) {
                currentPage--;
                console.clear();
                console.log('\x1b[1m\x1b[36m' + header + '\x1b[0m');
                this.displayContentPage(lines, currentPage, pageSize, totalPages);
              }
            }
          }
          
        } catch (error) {
          const err = error as Error;
          console.clear();
          console.log(`\x1b[31m\nERROR reading ${file}: ${err.message}\n\x1b[0m`);
          console.log('\n\x1b[33mPress any key to continue...\x1b[0m');
          await this.waitForKeyPress();
        }
      }
    } else if (outputToFile) {
      // Output to file - process all text files without paging
      for (const file of textFiles) {
        try {
          const content = await this.readFile(file);
          const header = `\n${'='.repeat(80)}\nFILE: ${file}\n${'='.repeat(80)}\n`;
          output += header + content + '\n';
        } catch (error) {
          const err = error as Error;
          const errorMsg = `\nERROR reading ${file}: ${err.message}\n`;
          output += errorMsg;
        }
      }
      
      try {
        writeFileSync(outputFilename, output);
        console.log(`\x1b[32mFile contents saved to '${outputFilename}'.\x1b[0m`);
      } catch (error) {
        const err = error as Error;
        console.error(`\x1b[31mError saving file contents:`, err.message, '\x1b[0m');
      }
      
      // Wait for any key press
      console.log('\n\x1b[33mPress any key to return to the explorer\x1b[0m');
      await this.waitForKeyPress();
    } else {
      // No text files to display
      console.log('\x1b[33mNo text files selected to display content.\x1b[0m');
      console.log('\n\x1b[33mPress any key to return to the explorer\x1b[0m');
      await this.waitForKeyPress();
    }
  }
  
  // Helper method to display a page of content
  displayContentPage(lines: string[], page: number, pageSize: number, totalPages: number): void {
    const startLine = page * pageSize;
    const endLine = Math.min(startLine + pageSize, lines.length);
    
    for (let i = startLine; i < endLine; i++) {
      console.log(lines[i]);
    }
    
    console.log(`\n\x1b[33mPage ${page + 1}/${totalPages}\x1b[0m`);
  }
  
  // Helper method to read a file
  async readFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      import('fs').then(fs => {
        fs.readFile(filePath, 'utf8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      }).catch(err => reject(err));
    });
  }
  
  // Helper method to wait for a key press
  waitForKeyPress(): Promise<void> {
    return new Promise(resolve => {
      process.stdin.once('data', () => {
        resolve();
      });
    });
  }
  
  // Helper method to prompt for input
  promptForInput(prompt: string): Promise<string> {
    return new Promise(resolve => {
      console.log(prompt);
      this.rl.question(prompt, (answer: string) => {
        resolve(answer);
      });
    });
  }

  // Collect all selected paths
  getSelectedPaths(): string[] {
    const selected: string[] = [];
    
    const collectSelectedPaths = (node: DirectoryNode) => {
      if (node.selected) {
        selected.push(node.path);
      }
      
      if (node.isDirectory) {
        for (const child of node.children) {
          collectSelectedPaths(child);
        }
      }
    };
    
    if (this.root) {
      collectSelectedPaths(this.root);
    }
    return selected;
  }
  
  // Get only selected files (not directories)
  getSelectedFiles(): string[] {
    const allSelected = this.getSelectedPaths();
    return allSelected.filter(path => {
      const node = this.nodeMap.get(path);
      return node && !node.isDirectory;
    });
  }

  // Start interactive UI
  async start(): Promise<void> {
    // Process keyboard input
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    return new Promise((resolve) => {
      process.stdin.on('data', async (data) => {
        const key = data.toString();
        
        if (key === 'q' || key === '\u0003') { // q or Ctrl+C
          process.stdin.setRawMode(false);
          this.rl.close();
          resolve();
          return;
        }
        
        let needsRender = true;
        
        // Navigation and interaction
        if (key === '\u001B[A') { // Up arrow
          this.moveUp();
        } else if (key === '\u001B[B') { // Down arrow
          this.moveDown();
        } else if (key === ' ') { // Space bar
          this.toggleSelect();
        } else if (key === '\r') { // Enter
          this.toggleExpand();
        } else if (key.toLowerCase() === 's') { // S to save selection
          await this.saveSelection();
        } else if (key.toLowerCase() === 'l') { // L to list selected files
          await this.listSelectedFiles();
        } else if (key.toLowerCase() === 'c') { // C to view content
          // Ask if output should go to file or console
          console.clear();
          console.log('\x1b[1m\x1b[36mView Content Options\x1b[0m');
          console.log('\x1b[33m1. Display on screen\x1b[0m');
          console.log('\x1b[33m2. Save to file\x1b[0m');
          console.log('\x1b[33mESC. Cancel\x1b[0m');
          
          const choice = await new Promise<string>(resolve => {
            const handleChoice = (data: Buffer) => {
              const key = data.toString();
              process.stdin.removeListener('data', handleChoice);
              resolve(key);
            };
            process.stdin.on('data', handleChoice);
          });
          
          if (choice === '1') {
            await this.viewSelectedContent(false);
          } else if (choice === '2') {
            await this.viewSelectedContent(true);
          }
        } else if (key === 'd' && process.env.NODE_ENV === 'development') { // Toggle debug mode
          this.debug = !this.debug;
        } else {
          needsRender = false;
        }
        
        if (needsRender) {
          this.render();
        }
      });
      
      // Initial display
      this.render();
    });
  }
  
  // Check if file is binary
  isBinaryFile(filePath: string): boolean {
    try {
      // Read the first 4KB of the file
      const buffer = readFileSync(filePath, { flag: 'r', encoding: null }).slice(0, 4096);
      
      // Common binary file signatures
      const binarySignatures = [
        Buffer.from([0xFF, 0xD8, 0xFF]), // JPEG
        Buffer.from([0x89, 0x50, 0x4E, 0x47]), // PNG
        Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP/DOCX/XLSX
        Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF
        Buffer.from([0x47, 0x49, 0x46, 0x38]), // GIF
        Buffer.from('RIFF'), // WAV/AVI
        Buffer.from([0x1F, 0x8B]), // GZIP
        Buffer.from([0x42, 0x4D]), // BMP
      ];
      
      // Check for known binary signatures
      for (const signature of binarySignatures) {
        if (buffer.slice(0, signature.length).equals(signature)) {
          return true;
        }
      }
      
      // Heuristic: Count null bytes and control characters
      let nullCount = 0;
      let controlCount = 0;
      
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0) nullCount++;
        else if (buffer[i] < 9) controlCount++;
      }
      
      // If more than 10% of the bytes are null or control chars, likely binary
      const threshold = buffer.length * 0.1;
      return nullCount > threshold || controlCount > threshold;
    } catch (error) {
      // If we can't read the file, assume it's not binary to be safe
      return false;
    }
  }
}

// Main function
async function main(): Promise<void> {
  // Use current directory by default or user argument
  const rootPath = process.argv[2] || '.';
  
  try {
    // Install prompts if not available
    try {
      require('prompts');
    } catch {
      console.log('\x1b[33mInstalling required dependency: prompts...\x1b[0m');
      await new Promise<void>((resolve, reject) => {
        const { exec } = require('child_process');
        exec('npm install prompts', (error: Error | null) => {
          if (error) {
            console.error('\x1b[31mFailed to install prompts. Continuing with basic input.\x1b[0m');
          } else {
            console.log('\x1b[32mDependency installed successfully.\x1b[0m');
          }
          resolve();
        });
      });
    }
    
    const tree = new InteractiveDirectoryTree(rootPath);
    await tree.buildTree();
    await tree.start();
    
    process.exit(0);
  } catch (error) {
    const err = error as Error;
    console.error('\x1b[31mError:', err.message, '\x1b[0m');
    process.exit(1);
  }
}

main();