-- 0005 — algorithm versions + candidate/job embeddings with pgvector ivfflat (FR-05.1)

create table algorithm_versions (
  version text primary key,
  description text not null,
  weights jsonb not null,
  embedding_provider text not null,
  embedding_model text not null,
  embedding_dimensions integer not null,
  created_at timestamptz not null default now()
);

-- Seed the current scoring algorithm version (matches ALGORITHM_VERSION in @ars/shared).
insert into algorithm_versions (version, description, weights, embedding_provider, embedding_model, embedding_dimensions)
values (
  'match-v1',
  'Vector recall (pgvector cosine) + weighted explainable rule score normalized to 0-100',
  '{"vector":0.30,"skill":0.35,"experience":0.15,"salary":0.08,"location":0.07,"language":0.05}',
  'mock', 'mock-embedding-384', 384
)
on conflict (version) do nothing;

create table candidate_embeddings (
  candidate_id uuid primary key references candidates (id) on delete cascade,
  embedding vector(384) not null,
  algorithm_version text not null references algorithm_versions (version),
  source_hash text not null,
  updated_at timestamptz not null default now()
);
create index candidate_embeddings_ivf on candidate_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 10);

create table job_embeddings (
  job_id uuid primary key references jobs (id) on delete cascade,
  embedding vector(384) not null,
  algorithm_version text not null references algorithm_versions (version),
  source_hash text not null,
  updated_at timestamptz not null default now()
);
create index job_embeddings_ivf on job_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 10);
