import type { FastifyInstance } from 'fastify';
import { CreateConversationSchema, SendMessageSchema } from '@ars/shared';
import type { Deps } from '../deps.js';
import { parseOrThrow } from '../errors.js';
import { requireAuth } from '../http/context.js';
import { conversationChannel } from '../realtime.js';
import {
  createConversation,
  getConversation,
  listConversations,
  listMessages,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendMessage,
} from '../services/messaging.js';

export function registerMessagingRoutes(app: FastifyInstance, deps: Deps): void {
  app.post('/conversations', async (req, reply) => {
    const principal = requireAuth(req);
    const convo = await createConversation(deps, principal, parseOrThrow(CreateConversationSchema, req.body));
    return reply.code(201).send(convo);
  });

  app.get('/conversations', async (req) => listConversations(deps, requireAuth(req)));

  app.get<{ Params: { id: string } }>('/conversations/:id', async (req) =>
    getConversation(deps, requireAuth(req), req.params.id),
  );

  app.get<{ Params: { id: string } }>('/conversations/:id/messages', async (req) =>
    listMessages(deps, requireAuth(req), req.params.id),
  );

  app.post<{ Params: { id: string } }>('/conversations/:id/messages', async (req, reply) => {
    const principal = requireAuth(req);
    const msg = await sendMessage(deps, principal, req.params.id, parseOrThrow(SendMessageSchema, req.body));
    return reply.code(201).send(msg);
  });

  // Realtime stream of new messages (SSE) — the local equivalent of Supabase Realtime.
  app.get<{ Params: { id: string } }>('/conversations/:id/events', async (req, reply) => {
    const principal = requireAuth(req);
    await getConversation(deps, principal, req.params.id); // authorizes membership (404 otherwise)
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'x-correlation-id': req.id,
    });
    reply.raw.write('event: ready\ndata: {}\n\n');
    const unsubscribe = deps.bus.subscribe(conversationChannel(req.params.id), (event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
    });
    req.raw.on('close', unsubscribe);
  });

  app.get('/notifications', async (req) => listNotifications(deps, requireAuth(req)));

  app.post<{ Params: { id: string } }>('/notifications/:id/read', async (req, reply) => {
    await markNotificationRead(deps, requireAuth(req), req.params.id);
    return reply.code(204).send();
  });

  app.post('/notifications/read-all', async (req, reply) => {
    await markAllNotificationsRead(deps, requireAuth(req));
    return reply.code(204).send();
  });
}
