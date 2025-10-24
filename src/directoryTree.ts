import { DirectoryTreeNode } from "./directoryNode";

import fs from "node:fs";
import path from "node:path";

export class DirectoryTree {
    rootPath: string;
    rootNode: DirectoryTreeNode | null;
    nodeMap: Map<string, DirectoryTreeNode> = new Map();

    constructor(rootPath: string, fileSystem?: any) {
        this.rootPath = rootPath;
        this.rootNode = null;
        this.nodeMap = new Map();
    }

    async initialize(): Promise<void> {
        const rootName = this.rootPath.split('/').pop() || this.rootPath;
        this.rootNode = new DirectoryTreeNode(this.rootPath, rootName, null, true);
        this.nodeMap.set(this.rootPath, this.rootNode);

        await this.loadFirstTwoLevels(this.rootNode);
    }

    async loadFirstTwoLevels(node: DirectoryTreeNode): Promise<void> {
        if (!this.rootNode) return;

        // load the first level
        await this.loadChildrenForNode(node);
        this.rootNode.loaded = true;
        this.rootNode.expanded = true;

        // load the second level
        for (const child of this.rootNode.children) {
            if (child.isDirectory) {
                await this.loadChildrenForNode(child);
                child.loaded = true;
            }
        }
    }

    async loadChildrenForNode(node: DirectoryTreeNode): Promise<void> {
        try {
            const entries = fs.readdirSync(node.path, { withFileTypes: true });

            for (const entry of entries) {
                const childPath = path.join(node.path, entry.name);
                const childNode = new DirectoryTreeNode(childPath, entry.name, node, entry.isDirectory());
                node.addChild(childNode);
                this.nodeMap.set(childPath, childNode);
            }

            node.children.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
        } catch (error) {
            console.error(`Error loading children for ${node.path}:`, error);
        }
    }

    async expandNode(path: string): Promise<void> {
        const node = this.nodeMap.get(path);
        if (!node || !node.isDirectory) return null;

        const isExpanding = node.toggleExpand();

        if (isExpanding && !node.loaded) {
            await this.loadChildrenForNode(node);
            node.loaded = true;
        }
        return;
    }

    getTree(): DirectoryTreeNode | null {
        return this.rootNode;
    }
}