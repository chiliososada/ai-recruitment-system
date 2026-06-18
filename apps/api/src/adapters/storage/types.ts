/** Pluggable object storage (FR-02.4). fs adapter for local, Supabase Storage for prod. */
export interface StorageAdapter {
  /** Store bytes at an unguessable, server-generated path. `owner` is the user uuid. */
  put(path: string, data: Buffer, contentType: string, owner: string): Promise<void>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
