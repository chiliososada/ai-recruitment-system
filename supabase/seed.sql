-- Reference seed data (non-sensitive). Safe on local + Supabase. Demo users,
-- companies and jobs are created programmatically by `npm run seed -w @ars/api`
-- (via the real services) so password hashes / embeddings / analyses stay consistent.

insert into skills (id, name, display_name, category) values
  (gen_random_uuid(), 'typescript', 'TypeScript', 'Programming'),
  (gen_random_uuid(), 'javascript', 'JavaScript', 'Programming'),
  (gen_random_uuid(), 'react', 'React', 'Frontend'),
  (gen_random_uuid(), 'node.js', 'Node.js', 'Backend'),
  (gen_random_uuid(), 'python', 'Python', 'Programming'),
  (gen_random_uuid(), 'postgresql', 'PostgreSQL', 'Database'),
  (gen_random_uuid(), 'aws', 'AWS', 'Cloud'),
  (gen_random_uuid(), 'docker', 'Docker', 'DevOps'),
  (gen_random_uuid(), 'kubernetes', 'Kubernetes', 'DevOps'),
  (gen_random_uuid(), 'go', 'Go', 'Programming')
on conflict (name) do nothing;
