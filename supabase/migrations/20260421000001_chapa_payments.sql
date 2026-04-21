-- Add Chapa payment fields to the payments table
alter table public.payments
  add column if not exists fee_account_id uuid references public.student_fee_accounts(id),
  add column if not exists chapa_tx_ref   text unique,
  add column if not exists chapa_status   text check (chapa_status in ('pending','success','failed'));

-- Make recorded_by nullable so students can self-initiate Chapa payments
-- (student's own user id is used when recording their own online payment)
alter table public.payments
  alter column recorded_by drop not null;

-- Fast lookup by tx_ref (used in webhook and verify)
create index if not exists idx_payments_chapa_tx_ref on public.payments(chapa_tx_ref);
