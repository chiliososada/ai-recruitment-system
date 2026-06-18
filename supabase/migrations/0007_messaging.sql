-- 0007 — conversations, members, messages, notifications (FR-08)

create table conversations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs (id) on delete set null,
  subject text,
  created_by uuid not null references profiles (id),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index conversations_job_idx on conversations (job_id);

create table conversation_members (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on conversation_members (user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_user_id uuid not null references profiles (id),
  body text not null,
  client_token uuid,
  created_at timestamptz not null default now(),
  -- De-dupe accidental double submits when a client token is supplied (FR-08.4).
  unique (conversation_id, sender_user_id, client_token)
);
create index messages_conv_idx on messages (conversation_id, created_at);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  link text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;
