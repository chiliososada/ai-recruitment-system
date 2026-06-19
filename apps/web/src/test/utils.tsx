import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../design';
import { AuthProvider } from '../lib/auth';

export function renderWithProviders(ui: ReactElement, route = '/'): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <ToastProvider>{ui}</ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Build a mock `fetch` that maps URL substrings to JSON responses. */
export function mockFetch(handlers: { match: string; status?: number; body: unknown }[]): void {
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const handler = handlers.find((h) => url.includes(h.match));
    const status = handler?.status ?? 200;
    const body = handler ? JSON.stringify(handler.body) : '{}';
    return new Response(status === 204 ? null : body, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fn;
}
