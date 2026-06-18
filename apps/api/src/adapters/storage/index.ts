import path from 'node:path';
import type { AppConfig } from '../../config.js';
import { FsStorageAdapter } from './fs.js';
import { SupabaseStorageAdapter } from './supabase.js';
import type { StorageAdapter } from './types.js';

export function createStorageAdapter(config: AppConfig): StorageAdapter {
  if (config.ARS_RUNTIME === 'supabase') {
    return new SupabaseStorageAdapter(
      config.SUPABASE_URL ?? '',
      config.SUPABASE_SERVICE_ROLE_KEY ?? '',
      config.SUPABASE_STORAGE_BUCKET,
    );
  }
  const dir = path.isAbsolute(config.LOCAL_STORAGE_DIR)
    ? config.LOCAL_STORAGE_DIR
    : path.join(process.cwd(), config.LOCAL_STORAGE_DIR);
  return new FsStorageAdapter(dir);
}

export type { StorageAdapter } from './types.js';
