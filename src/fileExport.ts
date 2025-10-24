import fs from 'node:fs';

export class FileExport {
  private selectedPaths: String[];

  constructor() {
    this.selectedPaths = [];
  }

  addFile(path: string) {
    this.selectedPaths.push(path);
  }

  removeFile(path: string) {
    const index = this.selectedPaths.findIndex((element) => element === path);
    this.selectedPaths.splice(index, 1);
  }

  printFileList() {
    this.selectedPaths.forEach((element) => console.log(element));
  }

  printFileContents() {
    this.selectedPaths.forEach(this.printSingleFileContent);
  }

  private printSingleFileContent(path: string) {
    try {
      const data = fs.readFileSync(path, 'utf8');
      console.log('==========');
      console.log(path);
      console.log('==========');
      console.log(data);
      console.log('');
    } catch (err) {
      console.error(err);
    }
  }
}
