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
export declare class NodepodFS {
    private _vol;
    constructor(_vol: MemoryVolume);
    writeFile(path: string, data: string | Uint8Array): Promise<void>;
    readFile(path: string, encoding?: "utf-8" | "utf8"): Promise<string>;
    readFile(path: string): Promise<Uint8Array>;
    mkdir(path: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    readdir(path: string): Promise<string[]>;
    exists(path: string): Promise<boolean>;
    stat(path: string): Promise<StatResult>;
    unlink(path: string): Promise<void>;
    rmdir(path: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    watch(path: string, optionsOrCb?: {
        recursive?: boolean;
    } | ((event: string, filename: string | null) => void), cb?: (event: string, filename: string | null) => void): {
        close(): void;
    };
    get volume(): MemoryVolume;
    private _removeRecursive;
    importFile(opts?: {
        multiple?: boolean;
    }): Promise<string[]>;
    importFile(vfsPath?: string, opts?: {
        multiple?: boolean;
    }): Promise<string[]>;
    importFileFromPath(sourcePath: string, targetVfsPath: string): Promise<void>;
    importDirectory(vfsPath?: string, opts?: DirectoryPickerOptions): Promise<string>;
    private _importDirectoryRecursive;
    exportFile(vfsPath: string, opts?: {
        suggestedName?: string;
    }): Promise<string>;
    exportFile(vfsPath: string, targetPath?: string): Promise<string>;
    exportFileToPath(vfsPath: string, targetPath: string): Promise<void>;
    exportDirectory(vfsPath: string): Promise<string>;
    private _exportDirectoryRecursive;
    exportDirectoryToPath(vfsPath: string, targetPath: string): Promise<void>;
    isFileSystemAccessSupported(): boolean;
}
