-- =============================================================================
--  Student Registration Approval RPCs
--  version: 2026-03-08 (rev 2 — uppercase role/status to match deployed DB)
--
--  The deployed DB uses uppercase values: 'STUDENT', 'ADMIN', 'PENDING', 'ACTIVE'.
--  Checks use UPPER() so both 'student'/'STUDENT' and 'pending'/'PENDING' are accepted.
--  Writes always use uppercase to satisfy the users_role_check constraint.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- approve_student_registration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_student_registration(
  p_student_id   uuid,
  p_admin_id     uuid,
  p_program      text,
  p_degree_level text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student     record;
  v_year        text;
  v_next_seq    integer;
  v_student_no  text;
BEGIN
  -- Lock the row to prevent two admins approving the same student concurrently
  SELECT id, role, status
  INTO   v_student
  FROM   public.users
  WHERE  id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_not_found'
      USING DETAIL = 'No user exists with the given id.',
            ERRCODE = 'P0001';
  END IF;

  -- Accept both 'student' and 'STUDENT'
  IF UPPER(v_student.role) <> 'STUDENT' THEN
    RAISE EXCEPTION 'not_a_student'
      USING DETAIL = 'The target user is not a student.',
            ERRCODE = 'P0002';
  END IF;

  -- Accept both 'pending' and 'PENDING'
  IF UPPER(v_student.status) <> 'PENDING' THEN
    RAISE EXCEPTION 'not_pending'
      USING DETAIL = format('Student status is ''%s'', expected ''pending''.', v_student.status),
            ERRCODE = 'P0003';
  END IF;

  -- Generate student_no: STU-{YYYY}-{NNNN}, locked against concurrent inserts
  v_year := EXTRACT(YEAR FROM NOW())::text;

  SELECT COALESCE(
           MAX(CAST(SPLIT_PART(student_no, '-', 3) AS integer)),
           0
         ) + 1
  INTO   v_next_seq
  FROM   public.student_profiles
  WHERE  student_no LIKE 'STU-' || v_year || '-%';

  v_student_no := 'STU-' || v_year || '-' || LPAD(v_next_seq::text, 4, '0');

  -- 3a. Activate the user (uppercase to match constraint)
  UPDATE public.users
  SET    status     = 'ACTIVE',
         created_by = p_admin_id
  WHERE  id = p_student_id;

  -- 3b. Create student profile
  INSERT INTO public.student_profiles
    (user_id, student_no, program, degree_level, profile_status, created_by)
  VALUES
    (p_student_id, v_student_no, p_program, p_degree_level, 'ACTIVE', p_admin_id);

  -- 3c. Audit log
  INSERT INTO public.audit_logs
    (actor_id, action, table_name, record_id, old_value, new_value)
  VALUES
    (
      p_admin_id,
      'user.create',
      'users',
      p_student_id,
      jsonb_build_object('status', v_student.status),
      jsonb_build_object('status', 'ACTIVE')
    );

  RETURN jsonb_build_object(
    'student_no', v_student_no,
    'user_id',    p_student_id
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- reject_student_registration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_student_registration(
  p_student_id uuid,
  p_admin_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student record;
BEGIN
  SELECT id, role, status
  INTO   v_student
  FROM   public.users
  WHERE  id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_not_found'
      USING DETAIL = 'No user exists with the given id.',
            ERRCODE = 'P0001';
  END IF;

  IF UPPER(v_student.role) <> 'STUDENT' THEN
    RAISE EXCEPTION 'not_a_student'
      USING DETAIL = 'The target user is not a student.',
            ERRCODE = 'P0002';
  END IF;

  IF UPPER(v_student.status) <> 'PENDING' THEN
    RAISE EXCEPTION 'not_pending'
      USING DETAIL = format('Student status is ''%s'', expected ''pending''.', v_student.status),
            ERRCODE = 'P0003';
  END IF;

  -- 4a. Suspend the user (uppercase to match constraint)
  UPDATE public.users
  SET    status = 'SUSPENDED'
  WHERE  id = p_student_id;

  -- 4b. Audit log
  INSERT INTO public.audit_logs
    (actor_id, action, table_name, record_id, old_value, new_value)
  VALUES
    (
      p_admin_id,
      'user.suspend',
      'users',
      p_student_id,
      jsonb_build_object('status', v_student.status),
      jsonb_build_object('status', 'SUSPENDED')
    );

  RETURN jsonb_build_object('user_id', p_student_id);
END;
$$;
