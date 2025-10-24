import { SelectState } from './selectState';

export class DirectoryTreeNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children: DirectoryTreeNode[];
  parent: DirectoryTreeNode | null;
  expanded: boolean;
  selected: SelectState;
  loaded: boolean;

  constructor(
    path: string,
    name: string,
    parent: DirectoryTreeNode | null,
    isDirectory: boolean
  ) {
    this.path = path;
    this.name = name;
    this.isDirectory = isDirectory;
    this.children = [];
    this.parent = parent;
    this.expanded = false;
    this.selected = SelectState.None;
    this.loaded = false;
  }

  toggleExpand(): boolean {
    if (this.isDirectory) {
      this.expanded = !this.expanded;
    }
    return this.expanded;
  }

  addChild(node: DirectoryTreeNode): void {
    this.children.push(node);
    node.parent = this;
  }

  toString(): string {
    return this.name;
  }

  toggleSelect() {
    if (this.selected === SelectState.None) this.selected = SelectState.Full;
    else this.selected = SelectState.None;
  }
}
