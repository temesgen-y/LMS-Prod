-- Extend audit_logs to support all security-relevant actions.
--
-- Changes:
--   1. Drop the restrictive action check constraint (too narrow for full audit coverage).
--   2. Make table_name and record_id nullable (some actions don't target a specific row).
--   3. Add details jsonb column for structured context.
--   4. Add target_type and target_id text columns as friendlier aliases.
--   5. Widen indexes.

-- 1. Drop restrictive constraint
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS chk_audit_logs_action;

-- 2. Allow nullable table_name and record_id
ALTER TABLE public.audit_logs
  ALTER COLUMN table_name DROP NOT NULL,
  ALTER COLUMN record_id  DROP NOT NULL;

-- 3. Add details + target alias columns (idempotent)
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS details     jsonb,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id   text;

-- 4. Back-fill target_type from table_name for existing rows
UPDATE public.audit_logs
SET target_type = table_name
WHERE target_type IS NULL AND table_name IS NOT NULL;

-- 5. New index on target_type for faster per-resource queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON public.audit_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id   ON public.audit_logs(target_id);
