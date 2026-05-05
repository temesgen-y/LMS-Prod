-- Advisor workflow: advising notes and student holds

CREATE TABLE IF NOT EXISTS public.advising_notes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id   uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id   uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note_body    text        NOT NULL,
  session_date date        NOT NULL DEFAULT CURRENT_DATE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS set_advising_notes_updated_at ON public.advising_notes;
CREATE TRIGGER set_advising_notes_updated_at
  BEFORE UPDATE ON public.advising_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.student_holds (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  placed_by   uuid        NOT NULL REFERENCES public.users(id),
  hold_type   text        NOT NULL CHECK (hold_type IN ('registration','financial','academic','disciplinary','administrative')),
  reason      text        NOT NULL,
  placed_at   timestamptz NOT NULL DEFAULT now(),
  lifted_at   timestamptz,
  lifted_by   uuid        REFERENCES public.users(id),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS set_student_holds_updated_at ON public.student_holds;
CREATE TRIGGER set_student_holds_updated_at
  BEFORE UPDATE ON public.student_holds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.advising_notes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_holds TO anon, authenticated;
