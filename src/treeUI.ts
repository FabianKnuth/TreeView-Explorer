import * as blessed from 'blessed';
import { DirectoryTreeNode } from './directoryNode';
import { DirectoryTree } from './directoryTree';
import { FileExport } from './fileExport';
import { SelectState } from './selectState';

export class TreeUI {
  private screen: blessed.Widgets.Screen;
  private tree: blessed.Widgets.ListElement;
  private dirTree: DirectoryTree;
  private statusBar: blessed.Widgets.BoxElement;
  private treeItems: string[] = [];
  private nodesByRow: Map<number, DirectoryTreeNode> = new Map();
  private fileExport: FileExport;

  constructor(dirTree: DirectoryTree, fileExport: FileExport) {
    this.dirTree = dirTree;
    this.fileExport = fileExport;

    this.screen = blessed.screen({
      smartCSR: true,
      title: 'LLMCP',
    });

    this.tree = blessed.list({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-1',
      keys: true,
      vi: true,
      mouse: true,
      border: {
        type: 'line',
      },
      style: {
        selected: {
          bg: 'blue',
          fg: 'white',
        },
        item: {
          hover: {
            bg: 'gray',
          },
        },
      },
      scrollbar: {
        ch: ' ',
        track: {
          bg: 'gray',
        },
        style: {
          inverse: true,
        },
      },
    });

    this.statusBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content:
        ' Use arrow keys to navigate, Enter to expand/collapse, Esc to exit',
      style: {
        bg: 'blue',
        fg: 'white',
      },
    });

    this.screen.append(this.tree);
    this.screen.append(this.statusBar);

    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.screen.destroy();
      fileExport.printFileContents();
      process.exit(0);
    });

    this.tree.key(['enter', 'l'], async () => {
      const selectedIndex = this.tree.selected;
      const node = this.nodesByRow.get(selectedIndex);

      if (node && node.isDirectory) {
        await this.toggleNode(node);
        this.renderTree();
        this.screen.render();
      }
    });

    this.tree.key(['space'], () => {
      const selectedIndex = this.tree.selected;
      const node = this.nodesByRow.get(selectedIndex);

      this.selectNode(node);
    });

    this.tree.focus();
  }

  async initialize(): Promise<void> {
    this.renderTree();
    this.screen.render();
  }

  private async toggleNode(node: DirectoryTreeNode): Promise<void> {
    await this.dirTree.expandNode(node.path);
  }

  private renderTree() {
    this.treeItems = [];
    this.nodesByRow = new Map();

    if (this.dirTree.rootNode) {
      this.renderNode(this.dirTree.rootNode, 0);
    }

    this.tree.setItems(this.treeItems);
  }

  private renderNode(node: DirectoryTreeNode, level: number): void {
    const indent = ' '.repeat(2 * level);
    const icon = node.isDirectory ? (node.expanded ? '[-]' : '[+]') : ' ';
    const selected =
      node.selected === SelectState.Full
        ? '(x)'
        : node.selected === SelectState.None
        ? '(_)'
        : '(.)';
    const rowIndex = this.treeItems.length;

    this.treeItems.push(`${indent}${icon}${selected}${node.name}`);
    this.nodesByRow.set(rowIndex, node);

    if (node.expanded && node.children.length > 0) {
      for (const child of node.children) {
        this.renderNode(child, level + 1);
      }
    }
  }

  private selectNode(node: DirectoryTreeNode): void {
    if (!node.selected) {
      this.fileExport.addFile(node.path);
    } else {
      this.fileExport.removeFile(node.path);
    }
    node.toggleSelect();
    this.renderTree();
    this.screen.render();
  }

  run(): void {
    this.screen.render();
  }
}
