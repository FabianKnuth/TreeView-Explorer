// types.d.ts

// Symbol configuration for tree display
interface Symbols {
    BRANCH: string;
    LAST_BRANCH: string;
    INDENT: string;
    INDENT_EMPTY: string;
    EXPANDED: string;
    COLLAPSED: string;
    SELECTED: string;
    UNSELECTED: string;
  }
  
  // Data structure for a directory node in the tree
  declare class DirectoryNode {
    path: string;
    name: string;
    isDirectory: boolean;
    children: DirectoryNode[];
    expanded: boolean;
    selected: boolean;
  
    constructor(path: string, name: string, isDirectory?: boolean);
  }
  
  // Main class for the interactive directory tree
  declare class InteractiveDirectoryTree {
    rootPath: string;
    root: DirectoryNode | null;
    nodeMap: Map<string, DirectoryNode>;
    cursorPosition: number;
    visibleNodes: DirectoryNode[];
    rl: NodeJS.ReadableStream & { 
      close: () => void;
    };
    debug: boolean;
  
    constructor(rootPath: string);
    
    // Tree building
    buildTree(): Promise<InteractiveDirectoryTree>;
    scanDirectory(node: DirectoryNode): Promise<void>;
    
    // Visible node management
    updateVisibleNodes(): void;
    addVisibleNodes(node: DirectoryNode, isVisible: boolean): void;
    
    // Rendering and UI
    render(): void;
    renderNode(node: DirectoryNode, prefix: string, isLast: boolean, isRoot?: boolean): void;
    
    // Interaction methods
    toggleExpand(): void;
    toggleSelect(): void;
    setSelectionRecursive(node: DirectoryNode, selected: boolean): void;
    moveUp(): void;
    moveDown(): void;
    
    // File management
    saveSelection(filename?: string): Promise<void>;
    getSelectedPaths(): string[];
    
    // Main method to start the application
    start(): Promise<void>;
  }
  
  // Type definitions for Node.js modules used in the script
  declare module 'node:fs/promises' {
    export function readdir(path: string): Promise<string[]>;
    export function stat(path: string): Promise<{
      isDirectory(): boolean;
    }>;
  }
  
  declare module 'node:fs' {
    export function writeFileSync(path: string, data: string): void;
  }
  
  declare module 'node:path' {
    export function join(...paths: string[]): string;
    export function relative(from: string, to: string): string;
    export function resolve(...paths: string[]): string;
  }
  
  declare module 'node:readline' {
    export function createInterface(options: {
      input: NodeJS.ReadableStream;
      output: NodeJS.WritableStream;
    }): NodeJS.ReadableStream & {
      close: () => void;
    };
  }