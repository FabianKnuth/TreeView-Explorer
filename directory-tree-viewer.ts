// directory-tree-viewer.ts
import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

// Configuration
const SYMBOLS: Symbols = {
  BRANCH: '├── ',
  LAST_BRANCH: '└── ',
  INDENT: '│   ',
  INDENT_EMPTY: '    ',
  EXPANDED: '[-]',
  COLLAPSED: '[+]',
  SELECTED: '[✓]',
  UNSELECTED: '[ ]'
};

// Data structure for our directory tree
class DirectoryNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children: DirectoryNode[];
  expanded: boolean;
  selected: boolean;

  constructor(path: string, name: string, isDirectory = false) {
    this.path = path;
    this.name = name;
    this.isDirectory = isDirectory;
    this.children = [];
    this.expanded = false; // Start with collapsed directories
    this.selected = false;
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

  constructor(rootPath: string) {
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
  }

  // Scan directory structure and build tree
  async buildTree(): Promise<InteractiveDirectoryTree> {
    const rootName = this.rootPath.split('/').pop() || '';
    this.root = new DirectoryNode(this.rootPath, rootName, true);
    this.nodeMap.set(this.rootPath, this.root);
    
    await this.scanDirectory(this.root);
    this.updateVisibleNodes();
    
    return this;
  }

  // Recursively scan directory
  async scanDirectory(node: DirectoryNode): Promise<void> {
    try {
      const entries = await readdir(node.path);
      
      // Sort: directories first, then files
      const sorted = await Promise.all(entries.map(async entry => {
        const fullPath = join(node.path, entry);
        const stats = await stat(fullPath);
        return { 
          name: entry, 
          path: fullPath, 
          isDirectory: stats.isDirectory() 
        };
      }));
      
      sorted.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      // Create nodes and continue recursively for directories
      for (const entry of sorted) {
        const childNode = new DirectoryNode(entry.path, entry.name, entry.isDirectory);
        node.children.push(childNode);
        this.nodeMap.set(entry.path, childNode);
        
        if (entry.isDirectory) {
          await this.scanDirectory(childNode);
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error(`Error scanning ${node.path}:`, err.message);
    }
  }

  // Update the list of currently visible nodes
  updateVisibleNodes(): void {
    // Save reference to current node
    const currentNodePath = this.visibleNodes.length > 0 && this.cursorPosition < this.visibleNodes.length
      ? this.visibleNodes[this.cursorPosition].path
      : null;
    
    if (this.debug) {
      console.log(`DEBUG: Current cursor: ${this.cursorPosition}, Current node: ${currentNodePath}`);
    }
    
    // Build new list of visible nodes
    this.visibleNodes = [];
    if (this.root) {
      // Root is always visible and expanded
      this.root.expanded = true;
      this.addVisibleNodes(this.root, true);
    }
    
    // Try to find the previous node in the new list
    if (currentNodePath) {
      const newIndex = this.visibleNodes.findIndex(node => node.path === currentNodePath);
      
      if (this.debug) {
        console.log(`DEBUG: New index of node ${currentNodePath}: ${newIndex}`);
        console.log(`DEBUG: New visible nodes: ${this.visibleNodes.map(n => n.path).join(', ')}`);
      }
      
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
    
    if (this.debug) {
      console.log(`DEBUG: Final cursor after update: ${this.cursorPosition}`);
    }
  }

  // Helper method to build visible nodes list
  addVisibleNodes(node: DirectoryNode, isVisible: boolean): void {
    if (isVisible) {
      this.visibleNodes.push(node);
    }
    
    if (node.isDirectory && node.expanded && isVisible) {
      for (const child of node.children) {
        this.addVisibleNodes(child, true);
      }
    }
  }

  // Render the tree in the console
  render(): void {
    console.clear();
    console.log('\x1b[1m\x1b[36mInteractive Directory Tree\x1b[0m');
    console.log('\x1b[33mNavigation: ↑/↓ Move, Space: Select, Enter: Expand/Collapse, S: Save, Q: Quit\x1b[0m\n');
    
    // Determine visible area based on terminal height
    const terminalHeight = process.stdout.rows - 10; // Minus header/footer
    
    // Calculate start index for rendering based on cursor position
    let startIdx = Math.max(0, this.cursorPosition - Math.floor(terminalHeight / 2));
    const endIdx = Math.min(startIdx + terminalHeight, this.visibleNodes.length);
    
    // Show a "scroll up" indicator if there are entries above
    if (startIdx > 0) {
      console.log('   \x1b[33m↑ ... (more entries) ...\x1b[0m');
    }
    
    // Only render nodes within the visible area
    for (let i = startIdx; i < endIdx; i++) {
      const node = this.visibleNodes[i];
      
      // Calculate path from root to current node
      const pathToNode: string[] = [];
      let currentNode = node;
      let parent = null;
      
      // Find parent node by path comparison
      for (const [path, possibleParent] of this.nodeMap.entries()) {
        if (currentNode.path.startsWith(path + '/') && path.length > (parent?.path.length || 0)) {
          parent = possibleParent;
        }
      }
      
      // Determine indentation depth and branch position
      const depth = (node.path.match(/\//g) || []).length - (this.root?.path.match(/\//g) || []).length;
      let prefix = '';
      for (let d = 0; d < depth; d++) {
        prefix += '    '; // Simple indentation for each level
      }
      
      // Mark current node with cursor
      const isCurrent = i === this.cursorPosition;
      const indicator = isCurrent ? '\x1b[7m' : ''; // Inverted colors for cursor
      
      // Directory color
      const dirColor = node.isDirectory ? '\x1b[36m' : ''; // Cyan color for directories
      
      const reset = '\x1b[0m'; // Reset all formatting
      
      // Checkbox status and folder status
      let statusSymbol = '';
      if (node.isDirectory) {
        statusSymbol = node.expanded ? SYMBOLS.EXPANDED : SYMBOLS.COLLAPSED;
      }
      const checkSymbol = node.selected ? SYMBOLS.SELECTED : SYMBOLS.UNSELECTED;
      
      // Symbol for branching
      const branchSymbol = (i === endIdx - 1 || i === this.visibleNodes.length - 1) ? 
        SYMBOLS.LAST_BRANCH : SYMBOLS.BRANCH;
      
      console.log(`${indicator}${prefix}${branchSymbol}${checkSymbol} ${statusSymbol} ${dirColor}${node.name}${reset}`);
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

  // Render node with proper indentation and symbols
  renderNode(node: DirectoryNode, prefix: string, isLast: boolean, isRoot = false): void {
    let line = prefix;
    
    if (!isRoot) {
      line += isLast ? SYMBOLS.LAST_BRANCH : SYMBOLS.BRANCH;
    }
    
    // Find the current index of this node in the visible list
    const nodeIndex = this.visibleNodes.findIndex(n => n.path === node.path);
    const isCurrent = nodeIndex === this.cursorPosition;
    
    // Mark current node with cursor
    const indicator = isCurrent ? '\x1b[7m' : ''; // Inverted colors for cursor
    
    // Directory color
    const dirColor = node.isDirectory ? '\x1b[36m' : ''; // Cyan color for directories
    
    const reset = '\x1b[0m'; // Reset all formatting
    
    // Checkbox status and folder status
    let statusSymbol = '';
    if (node.isDirectory) {
      statusSymbol = node.expanded ? SYMBOLS.EXPANDED : SYMBOLS.COLLAPSED;
    }
    const checkSymbol = node.selected ? SYMBOLS.SELECTED : SYMBOLS.UNSELECTED;
    
    console.log(`${indicator}${line}${checkSymbol} ${statusSymbol} ${dirColor}${node.name}${reset}`);
    
    if (node.isDirectory && node.expanded) {
      const childrenCount = node.children.length;
      
      for (let i = 0; i < childrenCount; i++) {
        const child = node.children[i];
        const isChildLast = i === childrenCount - 1;
        const newPrefix = prefix + (isLast ? SYMBOLS.INDENT_EMPTY : SYMBOLS.INDENT);
        
        this.renderNode(child, newPrefix, isChildLast);
      }
    }
  }

  // Expand/collapse directory
  toggleExpand(): void {
    const currentNode = this.visibleNodes[this.cursorPosition];
    if (currentNode && currentNode.isDirectory) {
      currentNode.expanded = !currentNode.expanded;
      this.updateVisibleNodes();
    }
  }

  // Select/deselect node
  toggleSelect(): void {
    const currentNode = this.visibleNodes[this.cursorPosition];
    if (currentNode) {
      currentNode.selected = !currentNode.selected;
      
      // If a directory is selected, also select all subdirectories
      if (currentNode.isDirectory) {
        this.setSelectionRecursive(currentNode, currentNode.selected);
      }
    }
  }

  // Recursively set selection
  setSelectionRecursive(node: DirectoryNode, selected: boolean): void {
    node.selected = selected;
    
    if (node.isDirectory) {
      for (const child of node.children) {
        this.setSelectionRecursive(child, selected);
      }
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
        } else if (key.toLowerCase() === 's') { // S to save
          await this.saveSelection();
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
}

// Main function
async function main(): Promise<void> {
  // Use current directory by default or user argument
  const rootPath = process.argv[2] || '.';
  
  try {
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