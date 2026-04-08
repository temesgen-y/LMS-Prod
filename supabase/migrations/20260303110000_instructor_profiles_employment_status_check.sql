-- Fix employment_status check to allow NULL and the values used by the Add Instructor form.
-- Run this if you get: violates check constraint "instructor_profiles_employment_status_check"

ALTER TABLE public.instructor_profiles
  DROP CONSTRAINT IF EXISTS instructor_profiles_employment_status_check;

ALTER TABLE public.instructor_profiles
  ADD CONSTRAINT instructor_profiles_employment_status_check
  CHECK (employment_status IS NULL OR employment_status IN (
    'FULL_TIME',
    'PART_TIME',
    'CONTRACT',
    'ADJUNCT'
  ));
