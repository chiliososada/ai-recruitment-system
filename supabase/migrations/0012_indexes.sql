-- 0012 (DB-1): additive performance indexes from the hot-query review.
-- Talent search default-lists candidates that are open to work, ordered by experience,
-- and filters on years_experience (services/talent.ts). This composite covers that access
-- path (the existing candidates_open_idx only covers the open_to_work predicate).
-- Idempotent + additive + non-destructive — safe to apply forward.
create index if not exists candidates_open_years_idx
  on candidates (open_to_work, years_experience desc);
