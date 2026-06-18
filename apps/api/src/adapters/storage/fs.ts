import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from '../../errors.js';
import type { StorageAdapter } from './types.js';

/** Filesystem storage adapter for local dev/test. Confines all writes under `baseDir`. */
export class FsStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  private resolve(objectPath: string): string {
    const full = path.resolve(this.baseDir, objectPath);
    const base = path.resolve(this.baseDir);
    if (full !== base && !full.startsWith(base + path.sep)) {
      throw new Error('storage path escapes base directory');
    }
    return full;
  }

  async put(objectPath: string, data: Buffer): Promise<void> {
    const full = this.resolve(objectPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(objectPath: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(objectPath));
    } catch {
      throw notFound('Stored object not found', 'resume.file.missing');
    }
  }

  async delete(objectPath: string): Promise<void> {
    await rm(this.resolve(objectPath), { force: true });
  }

  async exists(objectPath: string): Promise<boolean> {
    try {
      await stat(this.resolve(objectPath));
      return true;
    } catch {
      return false;
    }
  }
}
