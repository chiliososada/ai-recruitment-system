import type { ApiErrorBody, FieldIssue } from '@ars/shared';
import { LOCALE_STORAGE_KEY } from '../i18n';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'ars.token';

let token: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

export function setToken(value: string | null): void {
  token = value;
  if (typeof localStorage === 'undefined') return;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return token;
}

/** Error thrown for non-2xx API responses; carries the i18n messageKey for localization. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly messageKey: string | undefined,
    public readonly details: FieldIssue[] = [],
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const locale =
    typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
  if (locale) headers['accept-language'] = locale;
  return headers;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const body = json as ApiErrorBody | undefined;
    throw new ApiError(
      res.status,
      body?.error.code ?? 'INTERNAL',
      body?.error.messageKey,
      body?.error.details ?? [],
    );
  }
  return json as T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = authHeaders();
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
  return parse<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/api${path}`, { method: 'POST', headers: authHeaders(), body: form }).then(
      (r) => parse<T>(r),
    );
  },
  /** Authenticated binary download → object URL the caller must revoke. */
  blobUrl: async (path: string): Promise<string> => {
    const res = await fetch(`${BASE}/api${path}`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError(res.status, 'INTERNAL', undefined);
    return URL.createObjectURL(await res.blob());
  },
  /**
   * Authenticated download saved under the server's file name (RFC 5987 `filename*`
   * first, so Japanese names survive), falling back to `fallbackName`.
   */
  saveFile: async (path: string, fallbackName: string): Promise<void> => {
    const res = await fetch(`${BASE}/api${path}`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError(res.status, 'INTERNAL', undefined);
    const disposition = res.headers.get('content-disposition') ?? '';
    let name = fallbackName;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const plain = /filename="([^"]+)"/i.exec(disposition);
    try {
      if (star?.[1]) name = decodeURIComponent(star[1]);
      else if (plain?.[1]) name = plain[1];
    } catch {
      /* keep fallback */
    }
    const blob = await res.blob();
    if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) {
      const ext: Record<string, string> = {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      };
      name += ext[blob.type.split(';')[0]!.trim()] ?? '';
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
