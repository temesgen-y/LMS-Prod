-- Backfill student_no for student_profiles rows where it is NULL.
-- Uses the same format as the approve_student_registration RPC: STU-{YYYY}-{NNNN}
-- Year is taken from the users.created_at timestamp so numbering is consistent.

DO $$
DECLARE
  rec       RECORD;
  v_year    text;
  v_next    integer;
  v_new_no  text;
BEGIN
  FOR rec IN
    SELECT sp.user_id, u.created_at
    FROM   public.student_profiles sp
    JOIN   public.users u ON u.id = sp.user_id
    WHERE  sp.student_no IS NULL
    ORDER  BY u.created_at
  LOOP
    v_year := to_char(rec.created_at, 'YYYY');

    -- Find the next available sequence for this year (lock to avoid races)
    SELECT COALESCE(
      MAX(CAST(SPLIT_PART(student_no, '-', 3) AS integer)), 0
    ) + 1
    INTO  v_next
    FROM  public.student_profiles
    WHERE student_no LIKE 'STU-' || v_year || '-%';

    v_new_no := 'STU-' || v_year || '-' || LPAD(v_next::text, 4, '0');

    UPDATE public.student_profiles
    SET    student_no = v_new_no
    WHERE  user_id = rec.user_id;
  END LOOP;
END;
$$;
