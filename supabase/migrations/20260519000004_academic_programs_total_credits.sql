-- Add total_credits to academic_programs for program progress calculation
-- Default 120 credit hours (standard 4-year degree)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'academic_programs'
      AND column_name  = 'total_credits'
  ) THEN
    ALTER TABLE public.academic_programs ADD COLUMN total_credits NUMERIC(5,1) DEFAULT 120;
  END IF;
END $$;
