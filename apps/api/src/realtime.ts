import { EventEmitter } from 'node:events';

export interface RealtimeEvent {
  type: string;
  payload: unknown;
}

/**
 * In-process pub/sub used as the realtime mechanism for local/self-hosted runtime
 * (FR-08.2). The SPA subscribes via SSE. In a Supabase deployment this is replaced by
 * Supabase Realtime channels (the SPA can subscribe with supabase-js); the API contract
 * (channel = `conversation:<id>` / `user:<id>`) stays the same.
 */
export class RealtimeBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(channel: string, event: RealtimeEvent): void {
    this.emitter.emit(channel, event);
  }

  subscribe(channel: string, handler: (event: RealtimeEvent) => void): () => void {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }
}

export const conversationChannel = (id: string): string => `conversation:${id}`;
export const userChannel = (id: string): string => `user:${id}`;
