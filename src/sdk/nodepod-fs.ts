// Async facade over MemoryVolume. Returns Promises even though the
// underlying VFS is synchronous -- keeps the public API consistent.

import type { MemoryVolume } from "../memory-volume";
import type { StatResult } from "./types";

declare global {
  interface Window {
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
  }
}

export interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

export interface SaveFilePickerOptions {
  excludeAcceptAllOption?: boolean;
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

export interface DirectoryPickerOptions {
  mode?: "read" | "readwrite";
}

function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

export class NodepodFS {
  constructor(private _vol: MemoryVolume) {}

  // Auto-creates parent dirs on write
  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const dir = path.substring(0, path.lastIndexOf("/")) || "/";
    if (dir !== "/" && !this._vol.existsSync(dir)) {
      this._vol.mkdirSync(dir, { recursive: true });
    }
    this._vol.writeFileSync(path, data as any);
  }

  async readFile(path: string, encoding?: "utf-8" | "utf8"): Promise<string>;
  async readFile(path: string): Promise<Uint8Array>;
  async readFile(
    path: string,
    encoding?: string,
  ): Promise<string | Uint8Array> {
    if (encoding) return this._vol.readFileSync(path, "utf8") as string;
    return this._vol.readFileSync(path) as any;
  }

  async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
    this._vol.mkdirSync(path, opts);
  }

  async readdir(path: string): Promise<string[]> {
    return this._vol.readdirSync(path) as string[];
  }

  async exists(path: string): Promise<boolean> {
    return this._vol.existsSync(path);
  }

  async stat(path: string): Promise<StatResult> {
    const s = this._vol.statSync(path);
    return {
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      size: s.size,
      mtime: s.mtimeMs ?? Date.now(),
    };
  }

  async unlink(path: string): Promise<void> {
    this._vol.unlinkSync(path);
  }

  async rmdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
    if (opts?.recursive) {
      this._removeRecursive(path);
    } else {
      this._vol.rmdirSync(path);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    this._vol.renameSync(from, to);
  }

  watch(
    path: string,
    optionsOrCb?:
      | { recursive?: boolean }
      | ((event: string, filename: string | null) => void),
    cb?: (event: string, filename: string | null) => void,
  ): { close(): void } {
    if (typeof optionsOrCb === "function") {
      return this._vol.watch(path, optionsOrCb);
    }
    return this._vol.watch(path, optionsOrCb ?? {}, cb!);
  }

  get volume(): MemoryVolume {
    return this._vol;
  }

  private _removeRecursive(dir: string): void {
    for (const name of this._vol.readdirSync(dir) as string[]) {
      const full = `${dir}/${name}`;
      const st = this._vol.statSync(full);
      if (st.isDirectory()) this._removeRecursive(full);
      else this._vol.unlinkSync(full);
    }
    this._vol.rmdirSync(dir);
  }

  async importFile(opts?: { multiple?: boolean }): Promise<string[]>;
  async importFile(vfsPath?: string, opts?: { multiple?: boolean }): Promise<string[]>;
  async importFile(vfsPathOrOpts?: string | { multiple?: boolean }, opts?: { multiple?: boolean }): Promise<string[]> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        "File System Access API is not supported. Use importFileFromPath() instead or ensure you're running in a Chromium-based browser."
      );
    }

    const multiple = typeof vfsPathOrOpts === "object" ? vfsPathOrOpts.multiple : opts?.multiple ?? false;
    const vfsPath = typeof vfsPathOrOpts === "string" ? vfsPathOrOpts : "/";

    const handles = await window.showOpenFilePicker!({
      multiple,
      types: [
        {
          description: "All Files",
          accept: { "*/*": [] },
        },
      ],
    });

    const importedPaths: string[] = [];
    for (const handle of handles) {
      const file = await handle.getFile();
      const fileName = handle.name;
      let targetPath = vfsPath;

      if (vfsPath === "/" || vfsPath === "" || this._vol.statSync(vfsPath).isFile()) {
        targetPath = vfsPath === "/" ? `/${fileName}` : vfsPath;
      } else {
        targetPath = vfsPath.endsWith("/") ? `${vfsPath}${fileName}` : `${vfsPath}/${fileName}`;
      }

      const dir = targetPath.substring(0, targetPath.lastIndexOf("/")) || "/";
      if (dir !== "/" && !this._vol.existsSync(dir)) {
        this._vol.mkdirSync(dir, { recursive: true });
      }

      const content = new Uint8Array(await file.arrayBuffer());
      this._vol.writeFileSync(targetPath, content);
      importedPaths.push(targetPath);
    }

    return importedPaths;
  }

  async importFileFromPath(
    sourcePath: string,
    targetVfsPath: string
  ): Promise<void> {
    const response = await fetch(sourcePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    const content = new Uint8Array(await response.arrayBuffer());

    const dir = targetVfsPath.substring(0, targetVfsPath.lastIndexOf("/")) || "/";
    if (dir !== "/" && !this._vol.existsSync(dir)) {
      this._vol.mkdirSync(dir, { recursive: true });
    }
    this._vol.writeFileSync(targetVfsPath, content);
  }

  async importDirectory(vfsPath?: string, opts?: DirectoryPickerOptions): Promise<string> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        "File System Access API is not supported. Ensure you're running in a Chromium-based browser."
      );
    }

    const targetPath = vfsPath ?? "/";
    const mode = opts?.mode ?? "read";

    const dirHandle = await window.showDirectoryPicker!({ mode });

    const dir = targetPath.endsWith("/") ? targetPath.slice(0, -1) : targetPath;
    const baseName = dirHandle.name;
    const vfsDir = dir === "/" ? `/${baseName}` : `${dir}/${baseName}`;

    if (!this._vol.existsSync(vfsDir)) {
      this._vol.mkdirSync(vfsDir, { recursive: true });
    }

    const importedPaths: string[] = [];
    await this._importDirectoryRecursive(dirHandle, vfsDir, importedPaths);

    return vfsDir;
  }

  private async _importDirectoryRecursive(
    dirHandle: FileSystemDirectoryHandle,
    vfsDir: string,
    importedPaths: string[]
  ): Promise<void> {
    // @ts-expect-error - values() exists on FileSystemDirectoryHandle but TS doesn't know
    const entries: AsyncIterableIterator<FileSystemHandle> = dirHandle.values();
    for await (const entry of entries) {
      const entryVfsPath = `${vfsDir}/${entry.name}`;

      if (entry.kind === "file") {
        const file = await (entry as FileSystemFileHandle).getFile();
        const content = new Uint8Array(await file.arrayBuffer());
        this._vol.writeFileSync(entryVfsPath, content);
        importedPaths.push(entryVfsPath);
      } else if (entry.kind === "directory") {
        if (!this._vol.existsSync(entryVfsPath)) {
          this._vol.mkdirSync(entryVfsPath, { recursive: true });
        }
        await this._importDirectoryRecursive(entry as FileSystemDirectoryHandle, entryVfsPath, importedPaths);
      }
    }
  }

  async exportFile(vfsPath: string, opts?: { suggestedName?: string }): Promise<string>;
  async exportFile(vfsPath: string, targetPath?: string): Promise<string>;
  async exportFile(vfsPath: string, targetPathOrOpts?: string | { suggestedName?: string }): Promise<string> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        "File System Access API is not supported. Use exportFileToPath() instead or ensure you're running in a Chromium-based browser."
      );
    }

    if (!this._vol.existsSync(vfsPath)) {
      throw new Error(`ENOENT: no such file or directory, '${vfsPath}'`);
    }

    if (!this._vol.statSync(vfsPath).isFile()) {
      throw new Error(`EISDIR: illegal operation on a directory, exportFile '${vfsPath}'`);
    }

    const suggestedName = typeof targetPathOrOpts === "object" ? targetPathOrOpts.suggestedName : undefined;
    const fileName = suggestedName ?? vfsPath.split("/").pop() ?? "download";

    const handle = await window.showSaveFilePicker!({
      suggestedName,
      types: [
        {
          description: "All Files",
          accept: { "*/*": [] },
        },
      ],
    });

    const writable = await handle.createWritable();
    const content = this._vol.readFileSync(vfsPath);
    await writable.write(content.buffer as ArrayBuffer);
    await writable.close();

    return handle.name;
  }

  async exportFileToPath(vfsPath: string, targetPath: string): Promise<void> {
    if (!this._vol.existsSync(vfsPath)) {
      throw new Error(`ENOENT: no such file or directory, '${vfsPath}'`);
    }

    const content = this._vol.readFileSync(vfsPath);
    const blob = new Blob([content.buffer as ArrayBuffer]);

    const response = new Response(blob);
    const buffer = await response.arrayBuffer();

    const dir = targetPath.substring(0, targetPath.lastIndexOf("/")) || "/";
    if (dir !== "/" && dir !== "") {
      await this.exportDirectoryToPath("/", dir);
    }

    const handle = await window.showSaveFilePicker!({
      suggestedName: targetPath.split("/").pop(),
      types: [
        {
          description: "All Files",
          accept: { "*/*": [] },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(new Uint8Array(buffer).buffer as ArrayBuffer);
    await writable.close();
  }

  async exportDirectory(vfsPath: string): Promise<string> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        "File System Access API is not supported. Ensure you're running in a Chromium-based browser."
      );
    }

    if (!this._vol.existsSync(vfsPath)) {
      throw new Error(`ENOENT: no such file or directory, '${vfsPath}'`);
    }

    if (!this._vol.statSync(vfsPath).isDirectory()) {
      throw new Error(`ENOTDIR: not a directory, exportDirectory '${vfsPath}'`);
    }

    const dirHandle = await window.showDirectoryPicker!({ mode: "readwrite" });

    await this._exportDirectoryRecursive(vfsPath, dirHandle);

    return dirHandle.name;
  }

  private async _exportDirectoryRecursive(
    vfsPath: string,
    dirHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    const entries = this._vol.readdirSync(vfsPath);

    for (const name of entries) {
      const entryVfsPath = `${vfsPath}/${name}`;
      const stat = this._vol.statSync(entryVfsPath);

      if (stat.isDirectory()) {
        const subDirHandle = await dirHandle.getDirectoryHandle(name, { create: true });
        await this._exportDirectoryRecursive(entryVfsPath, subDirHandle);
      } else {
        const fileHandle = await dirHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        const content = this._vol.readFileSync(entryVfsPath);
        await writable.write(content.buffer as ArrayBuffer);
        await writable.close();
      }
    }
  }

  async exportDirectoryToPath(vfsPath: string, targetPath: string): Promise<void> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        "File System Access API is not supported. Ensure you're running in a Chromium-based browser."
      );
    }

    if (!this._vol.existsSync(vfsPath)) {
      throw new Error(`ENOENT: no such file or directory, '${vfsPath}'`);
    }

    if (!this._vol.statSync(vfsPath).isDirectory()) {
      throw new Error(`ENOTDIR: not a directory, exportDirectory '${vfsPath}'`);
    }

    const dirHandle = await window.showDirectoryPicker!({ mode: "readwrite" });

    await this._exportDirectoryRecursive(vfsPath, dirHandle);
  }

  isFileSystemAccessSupported(): boolean {
    return isFileSystemAccessSupported();
  }
}
