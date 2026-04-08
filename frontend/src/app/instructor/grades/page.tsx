import { redirect } from 'next/navigation';

// The public.grades table has been dropped.
// Grade data is now in gradebook_items.
// Use the per-course Gradebook instead.
export default function GradesRedirectPage() {
  redirect('/instructor/gradebook');
}
