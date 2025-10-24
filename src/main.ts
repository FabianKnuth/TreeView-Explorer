import { DirectoryTree } from './directoryTree';
import { FileExport } from './fileExport';
import { TreeUI } from './treeUI';

async function main() {
  const rootPath = process.argv[2];

  const fileExport = new FileExport();

  const tree = new DirectoryTree(rootPath);
  await tree.initialize();

  const app = new TreeUI(tree, fileExport);
  await app.initialize();
  app.run();
}

main().catch(console.error);
