import { z } from 'zod';
import { NotificationTypeSchema, UserRoleSchema } from '../enums.js';

export const ConversationMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  role: UserRoleSchema,
});
export type ConversationMember = z.infer<typeof ConversationMemberSchema>;

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid().nullable(),
  subject: z.string().nullable(),
  members: z.array(ConversationMemberSchema),
  lastMessagePreview: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  unreadCount: z.number().int(),
  createdAt: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  senderName: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

/** FR-08.4: reject empty/over-long; clientToken de-dupes accidental double submits. */
export const SendMessageSchema = z.object({
  body: z.string().trim().min(1, { message: 'message.body.empty' }).max(4000, {
    message: 'message.body.tooLong',
  }),
  clientToken: z.string().uuid().optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

/** Start (or reuse) a conversation with another user, optionally about a job. */
export const CreateConversationSchema = z.object({
  participantUserId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  subject: z.string().trim().max(200).optional(),
  initialMessage: z.string().trim().min(1).max(4000).optional(),
});
export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  /** Stable deep-link target the SPA can route to. */
  link: z.string().nullable(),
  data: z.record(z.unknown()).nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;
