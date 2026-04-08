-- Add title column to instructor_profiles for job title (e.g. Professor, Lecturer).
ALTER TABLE public.instructor_profiles ADD COLUMN IF NOT EXISTS title text;
