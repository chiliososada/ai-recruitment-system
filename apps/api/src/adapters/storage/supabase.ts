import { AppError, notFound } from '../../errors.js';
import type { StorageAdapter } from './types.js';

/**
 * Supabase Storage adapter (prod). Uses the service key for server-side writes; per-user
 * access is still enforced by the Storage RLS policies in migration 0010 + API authz.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  private endpoint(objectPath: string): string {
    return `${this.url}/storage/v1/object/${this.bucket}/${objectPath}`;
  }

  async put(objectPath: string, data: Buffer, contentType: string): Promise<void> {
    const res = await fetch(this.endpoint(objectPath), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new AppError('INTERNAL', `Storage upload failed: ${res.status}`);
  }

  async get(objectPath: string): Promise<Buffer> {
    const res = await fetch(this.endpoint(objectPath), {
      headers: { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey },
    });
    if (res.status === 404) throw notFound('Stored object not found', 'resume.file.missing');
    if (!res.ok) throw new AppError('INTERNAL', `Storage download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(objectPath: string): Promise<void> {
    await fetch(this.endpoint(objectPath), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey },
    });
  }

  async exists(objectPath: string): Promise<boolean> {
    const res = await fetch(this.endpoint(objectPath), {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey },
    });
    return res.ok;
  }
}
