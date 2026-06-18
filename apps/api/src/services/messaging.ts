import {
  type Conversation,
  type ConversationMember,
  type CreateConversationInput,
  type Message,
  type Notification,
  type NotificationType,
  type SendMessageInput,
  type UserRole,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import type { DbClient, RequestContext } from '../db/types.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import type { Principal } from '../http/context.js';
import { conversationChannel, userChannel } from '../realtime.js';
import { toIso } from '../util.js';

const ctx = (p: Principal): RequestContext => ({ role: 'authenticated', userId: p.userId, email: p.email });

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_name: string;
  body: string;
  created_at: unknown;
}

function mapMessage(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderUserId: r.sender_user_id,
    senderName: r.sender_name,
    body: r.body,
    createdAt: toIso(r.created_at),
  };
}

async function loadMembers(
  c: DbClient,
  conversationIds: string[],
): Promise<Map<string, ConversationMember[]>> {
  const map = new Map<string, ConversationMember[]>();
  if (!conversationIds.length) return map;
  const res = await c.query<{ conversation_id: string; user_id: string; display_name: string; role: UserRole }>(
    `select cm.conversation_id, cm.user_id, p.display_name, p.role
     from conversation_members cm join profiles p on p.id = cm.user_id
     where cm.conversation_id = any($1::uuid[])`,
    [`{${conversationIds.join(',')}}`],
  );
  for (const r of res.rows) {
    const arr = map.get(r.conversation_id) ?? [];
    arr.push({ userId: r.user_id, displayName: r.display_name, role: r.role });
    map.set(r.conversation_id, arr);
  }
  return map;
}

export async function createConversation(
  deps: Deps,
  principal: Principal,
  input: CreateConversationInput,
): Promise<Conversation> {
  if (input.participantUserId === principal.userId) {
    throw badRequest('Cannot start a conversation with yourself', 'message.self');
  }
  const exists = await deps.db.service((c) =>
    c.query(`select 1 from profiles where id = $1`, [input.participantUserId]),
  );
  if (!exists.rows.length) throw notFound('Participant not found', 'error.notFound');

  const conversationId = await deps.db.withContext(ctx(principal), async (c) => {
    const found = await c.query<{ id: string }>(
      `select c.id from conversations c
       where c.job_id is not distinct from $2
         and exists(select 1 from conversation_members m1 where m1.conversation_id = c.id and m1.user_id = $1)
         and exists(select 1 from conversation_members m2 where m2.conversation_id = c.id and m2.user_id = $3)
       limit 1`,
      [principal.userId, input.jobId ?? null, input.participantUserId],
    );
    if (found.rows[0]) return found.rows[0].id;

    const created = await c.query<{ id: string }>(
      `insert into conversations (job_id, subject, created_by) values ($1, $2, $3) returning id`,
      [input.jobId ?? null, input.subject ?? null, principal.userId],
    );
    const id = created.rows[0]!.id;
    await c.query(
      `insert into conversation_members (conversation_id, user_id) values ($1, $2), ($1, $3)`,
      [id, principal.userId, input.participantUserId],
    );
    return id;
  });

  if (input.initialMessage) {
    await sendMessage(deps, principal, conversationId, { body: input.initialMessage });
  }
  return getConversation(deps, principal, conversationId);
}

/** Start (or reuse) a conversation with a company's primary contact (FR-08.1). */
export async function startConversationWithCompany(
  deps: Deps,
  principal: Principal,
  input: { companyId: string; subject?: string; initialMessage?: string },
): Promise<Conversation> {
  const contact = await deps.db.service((c) =>
    c.query<{ user_id: string }>(
      `select user_id from company_members where company_id = $1
       order by case when role = 'owner' then 0 else 1 end, created_at asc limit 1`,
      [input.companyId],
    ),
  );
  const participant = contact.rows[0]?.user_id;
  if (!participant) throw notFound('Company has no contact', 'company.notFound');
  return createConversation(deps, principal, {
    participantUserId: participant,
    ...(input.subject ? { subject: input.subject } : {}),
    ...(input.initialMessage ? { initialMessage: input.initialMessage } : {}),
  });
}

export async function getConversation(
  deps: Deps,
  principal: Principal,
  conversationId: string,
): Promise<Conversation> {
  return deps.db.withContext(ctx(principal), async (c) => {
    const res = await c.query<{ id: string; job_id: string | null; subject: string | null; created_at: unknown; last_message_at: unknown; last_preview: string | null; unread: number }>(
      `select c.id, c.job_id, c.subject, c.created_at,
              (select created_at from messages m where m.conversation_id = c.id order by created_at desc limit 1) as last_message_at,
              (select left(body, 120) from messages m where m.conversation_id = c.id order by created_at desc limit 1) as last_preview,
              (select count(*) from messages m where m.conversation_id = c.id and m.sender_user_id <> $2
                and (cm.last_read_at is null or m.created_at > cm.last_read_at))::int as unread
       from conversations c
       join conversation_members cm on cm.conversation_id = c.id and cm.user_id = $2
       where c.id = $1`,
      [conversationId, principal.userId],
    );
    if (!res.rows.length) throw notFound('Conversation not found', 'message.conversation.notFound');
    const row = res.rows[0]!;
    const members = (await loadMembers(c, [conversationId])).get(conversationId) ?? [];
    return {
      id: row.id,
      jobId: row.job_id,
      subject: row.subject,
      members,
      lastMessagePreview: row.last_preview,
      lastMessageAt: row.last_message_at ? toIso(row.last_message_at) : null,
      unreadCount: Number(row.unread),
      createdAt: toIso(row.created_at),
    };
  });
}

export async function listConversations(deps: Deps, principal: Principal): Promise<Conversation[]> {
  return deps.db.withContext(ctx(principal), async (c) => {
    const res = await c.query<{ id: string; job_id: string | null; subject: string | null; created_at: unknown; last_message_at: unknown; last_preview: string | null; unread: number }>(
      `select c.id, c.job_id, c.subject, c.created_at,
              (select created_at from messages m where m.conversation_id = c.id order by created_at desc limit 1) as last_message_at,
              (select left(body, 120) from messages m where m.conversation_id = c.id order by created_at desc limit 1) as last_preview,
              (select count(*) from messages m where m.conversation_id = c.id and m.sender_user_id <> $1
                and (cm.last_read_at is null or m.created_at > cm.last_read_at))::int as unread
       from conversations c
       join conversation_members cm on cm.conversation_id = c.id and cm.user_id = $1
       order by last_message_at desc nulls last, c.created_at desc`,
      [principal.userId],
    );
    const members = await loadMembers(c, res.rows.map((r) => r.id));
    return res.rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      subject: row.subject,
      members: members.get(row.id) ?? [],
      lastMessagePreview: row.last_preview,
      lastMessageAt: row.last_message_at ? toIso(row.last_message_at) : null,
      unreadCount: Number(row.unread),
      createdAt: toIso(row.created_at),
    }));
  });
}

export async function listMessages(
  deps: Deps,
  principal: Principal,
  conversationId: string,
): Promise<Message[]> {
  const messages = await deps.db.withContext(ctx(principal), async (c) => {
    const member = await c.query(`select 1 from conversation_members where conversation_id = $1 and user_id = $2`, [
      conversationId,
      principal.userId,
    ]);
    if (!member.rows.length) throw notFound('Conversation not found', 'message.conversation.notFound');
    const res = await c.query<MessageRow>(
      `select m.id, m.conversation_id, m.sender_user_id, p.display_name as sender_name, m.body, m.created_at
       from messages m join profiles p on p.id = m.sender_user_id
       where m.conversation_id = $1 order by m.created_at asc limit 200`,
      [conversationId],
    );
    await c.query(
      `update conversation_members set last_read_at = now() where conversation_id = $1 and user_id = $2`,
      [conversationId, principal.userId],
    );
    return res.rows.map(mapMessage);
  });
  return messages;
}

export async function sendMessage(
  deps: Deps,
  principal: Principal,
  conversationId: string,
  input: SendMessageInput,
): Promise<Message> {
  const message = await deps.db.withContext(ctx(principal), async (c) => {
    const member = await c.query(`select 1 from conversation_members where conversation_id = $1 and user_id = $2`, [
      conversationId,
      principal.userId,
    ]);
    if (!member.rows.length) throw forbidden('Not a member of this conversation', 'error.forbidden');

    const inserted = await c.query<MessageRow>(
      `insert into messages (conversation_id, sender_user_id, body, client_token)
       values ($1, $2, $3, $4)
       on conflict (conversation_id, sender_user_id, client_token) do nothing
       returning id, conversation_id, sender_user_id, $5::text as sender_name, body, created_at`,
      [conversationId, principal.userId, input.body, input.clientToken ?? null, principal.email],
    );
    if (inserted.rows.length) {
      const row = inserted.rows[0]!;
      const name = await c.query<{ display_name: string }>(`select display_name from profiles where id = $1`, [
        principal.userId,
      ]);
      return mapMessage({ ...row, sender_name: name.rows[0]?.display_name ?? 'User' });
    }
    // Duplicate (same client token) — return the original message.
    const existing = await c.query<MessageRow>(
      `select m.id, m.conversation_id, m.sender_user_id, p.display_name as sender_name, m.body, m.created_at
       from messages m join profiles p on p.id = m.sender_user_id
       where m.conversation_id = $1 and m.sender_user_id = $2 and m.client_token = $3`,
      [conversationId, principal.userId, input.clientToken],
    );
    return mapMessage(existing.rows[0]!);
  });

  // Update conversation + notify the other members (trusted server writes).
  await deps.db.service(async (c) => {
    await c.query(`update conversations set last_message_at = now() where id = $1`, [conversationId]);
    const others = await c.query<{ user_id: string }>(
      `select user_id from conversation_members where conversation_id = $1 and user_id <> $2`,
      [conversationId, principal.userId],
    );
    for (const o of others.rows) {
      await createNotification(c, o.user_id, 'message', message.senderName, message.body.slice(0, 120), `/messages/${conversationId}`, {
        conversationId,
        senderName: message.senderName,
      });
      deps.bus.publish(userChannel(o.user_id), { type: 'notification', payload: { conversationId } });
    }
  });
  deps.bus.publish(conversationChannel(conversationId), { type: 'message', payload: message });
  return message;
}

export async function createNotification(
  c: DbClient,
  userId: string,
  type: NotificationType,
  title: string,
  body: string | null,
  link: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  await c.query(
    `insert into notifications (user_id, type, title, body, link, data)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [userId, type, title, body, link, JSON.stringify(data)],
  );
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read_at: unknown;
  created_at: unknown;
}

function mapNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    data: r.data,
    readAt: r.read_at ? toIso(r.read_at) : null,
    createdAt: toIso(r.created_at),
  };
}

export async function listNotifications(deps: Deps, principal: Principal): Promise<Notification[]> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<NotificationRow>(
      `select id, user_id, type, title, body, link, data, read_at, created_at
       from notifications where user_id = $1 order by created_at desc limit 50`,
      [principal.userId],
    ),
  );
  return res.rows.map(mapNotification);
}

export async function markNotificationRead(
  deps: Deps,
  principal: Principal,
  notificationId: string,
): Promise<void> {
  await deps.db.withContext(ctx(principal), (c) =>
    c.query(`update notifications set read_at = now() where id = $1 and user_id = $2`, [
      notificationId,
      principal.userId,
    ]),
  );
}

export async function markAllNotificationsRead(deps: Deps, principal: Principal): Promise<void> {
  await deps.db.withContext(ctx(principal), (c) =>
    c.query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [
      principal.userId,
    ]),
  );
}
