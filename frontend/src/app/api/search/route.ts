import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  category: 'course' | 'assignment' | 'assessment' | 'lesson' | 'announcement' | 'forum' | 'student' | 'instructor';
  link: string;
};

const LIMIT = 5; // max results per category

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single();
  if (!profile) return NextResponse.json({ results: [] });

  const { id: userId, role } = profile;
  const pat = `%${q}%`;
  const results: SearchResult[] = [];

  // ── STUDENT ─────────────────────────────────────────────────────────────
  if (role === 'student') {
    // Get enrolled offering IDs
    const { data: enrRows } = await supabase
      .from('enrollments')
      .select('offering_id')
      .eq('student_id', userId)
      .in('status', ['active', 'completed']);
    const offeringIds = (enrRows ?? []).map((e: any) => e.offering_id);

    if (offeringIds.length > 0) {
      // Courses
      const { data: offerings } = await supabase
        .from('course_offerings')
        .select('id, section_name, courses!fk_course_offerings_course(title, code)')
        .in('id', offeringIds)
        .limit(LIMIT * 4);
      const matchedOfferings = (offerings ?? []).filter((o: any) => {
        const t = (o.courses?.title ?? '').toLowerCase();
        const c = (o.courses?.code ?? '').toLowerCase();
        const lq = q.toLowerCase();
        return t.includes(lq) || c.includes(lq);
      }).slice(0, LIMIT);
      matchedOfferings.forEach((o: any) => {
        results.push({
          id: o.id,
          title: o.courses?.title ?? 'Course',
          subtitle: `${(o.courses?.code ?? '').toUpperCase()} · Section ${o.section_name ?? 'A'}`,
          category: 'course',
          link: `/dashboard/class/${o.id}`,
        });
      });

      // Assignments
      const { data: asgns } = await supabase
        .from('assignments')
        .select('id, title, offering_id')
        .in('offering_id', offeringIds)
        .ilike('title', pat)
        .limit(LIMIT);
      (asgns ?? []).forEach((a: any) => {
        results.push({
          id: a.id,
          title: a.title,
          subtitle: 'Assignment',
          category: 'assignment',
          link: `/dashboard/assignments/${a.id}`,
        });
      });

      // Assessments
      const { data: assmnts } = await supabase
        .from('assessments')
        .select('id, title, type, offering_id')
        .in('offering_id', offeringIds)
        .ilike('title', pat)
        .limit(LIMIT);
      (assmnts ?? []).forEach((a: any) => {
        results.push({
          id: a.id,
          title: a.title,
          subtitle: a.type === 'quiz' ? 'Quiz' : a.type === 'midterm' ? 'Midterm' : a.type === 'final_exam' ? 'Final Exam' : 'Practice',
          category: 'assessment',
          link: `/dashboard/class/${a.offering_id}/assessment/${a.id}`,
        });
      });

      // Lessons — get modules for enrolled offerings, then find lesson items
      const { data: modules } = await supabase
        .from('course_modules')
        .select('id')
        .in('offering_id', offeringIds);
      const moduleIds = (modules ?? []).map((m: any) => m.id);
      if (moduleIds.length > 0) {
        const { data: moduleItems } = await supabase
          .from('course_module_items')
          .select('item_id')
          .in('module_id', moduleIds)
          .eq('item_type', 'lesson');
        const lessonIds = (moduleItems ?? []).map((mi: any) => mi.item_id).filter(Boolean);
        if (lessonIds.length > 0) {
          const { data: lessons } = await supabase
            .from('lessons')
            .select('id, title, type')
            .in('id', lessonIds)
            .ilike('title', pat)
            .limit(LIMIT);
          (lessons ?? []).forEach((l: any) => {
            results.push({
              id: l.id,
              title: l.title,
              subtitle: `Lesson · ${l.type ?? 'content'}`,
              category: 'lesson',
              link: `/dashboard/courses`,
            });
          });
        }
      }

      // Announcements
      const { data: anncs } = await supabase
        .from('announcements')
        .select('id, title, body, offering_id')
        .in('offering_id', offeringIds)
        .or(`title.ilike.${pat},body.ilike.${pat}`)
        .limit(LIMIT);
      (anncs ?? []).forEach((a: any) => {
        results.push({
          id: a.id,
          title: a.title,
          subtitle: 'Announcement',
          category: 'announcement',
          link: `/dashboard/announcements`,
        });
      });

      // Forum threads
      const { data: threads } = await supabase
        .from('forum_threads')
        .select('id, title, offering_id')
        .in('offering_id', offeringIds)
        .ilike('title', pat)
        .limit(LIMIT);
      (threads ?? []).forEach((t: any) => {
        results.push({
          id: t.id,
          title: t.title,
          subtitle: 'Forum Thread',
          category: 'forum',
          link: `/dashboard/class/${t.offering_id}/forums`,
        });
      });
    }
  }

  // ── INSTRUCTOR ──────────────────────────────────────────────────────────
  if (role === 'instructor' || role === 'admin') {
    const { data: ciRows } = await supabase
      .from('course_instructors')
      .select('offering_id')
      .eq('instructor_id', userId);
    const offeringIds: string[] = (ciRows ?? []).map((r: any) => r.offering_id);
    const filterByOffering = role === 'instructor' && offeringIds.length > 0;
    const safeOfferingIds = offeringIds.length > 0 ? offeringIds : ['__none__'];

    // Assessments
    const { data: assmnts } = await (filterByOffering
      ? supabase.from('assessments').select('id, title, type, offering_id').ilike('title', pat).in('offering_id', safeOfferingIds).limit(LIMIT)
      : supabase.from('assessments').select('id, title, type, offering_id').ilike('title', pat).limit(LIMIT));
    (assmnts ?? []).forEach((a: any) => {
      results.push({
        id: a.id,
        title: a.title,
        subtitle: a.type === 'quiz' ? 'Quiz' : a.type === 'midterm' ? 'Midterm' : a.type === 'final_exam' ? 'Final Exam' : 'Practice',
        category: 'assessment',
        link: `/instructor/assessments`,
      });
    });

    // Assignments
    const { data: asgns } = await (filterByOffering
      ? supabase.from('assignments').select('id, title, offering_id').ilike('title', pat).in('offering_id', safeOfferingIds).limit(LIMIT)
      : supabase.from('assignments').select('id, title, offering_id').ilike('title', pat).limit(LIMIT));
    (asgns ?? []).forEach((a: any) => {
      results.push({
        id: a.id,
        title: a.title,
        subtitle: 'Assignment',
        category: 'assignment',
        link: `/instructor/assignments`,
      });
    });

    // Announcements
    const { data: anncs } = await (filterByOffering
      ? supabase.from('announcements').select('id, title, offering_id').ilike('title', pat).in('offering_id', safeOfferingIds).limit(LIMIT)
      : supabase.from('announcements').select('id, title, offering_id').ilike('title', pat).limit(LIMIT));
    (anncs ?? []).forEach((a: any) => {
      results.push({
        id: a.id,
        title: a.title,
        subtitle: 'Announcement',
        category: 'announcement',
        link: `/instructor/announcements`,
      });
    });

    // Students (search by name / email)
    const { data: students } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('role', 'student')
      .or(`first_name.ilike.${pat},last_name.ilike.${pat},email.ilike.${pat}`)
      .limit(LIMIT);
    (students ?? []).forEach((s: any) => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
      results.push({
        id: s.id,
        title: name,
        subtitle: s.email ?? 'Student',
        category: 'student',
        link: role === 'admin' ? `/admin/students` : `/instructor/students`,
      });
    });
  }

  // ── ADMIN extras ─────────────────────────────────────────────────────────
  if (role === 'admin') {
    const { data: instructors } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('role', 'instructor')
      .or(`first_name.ilike.${pat},last_name.ilike.${pat},email.ilike.${pat}`)
      .limit(LIMIT);
    (instructors ?? []).forEach((u: any) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
      results.push({
        id: u.id,
        title: name,
        subtitle: u.email ?? 'Instructor',
        category: 'instructor',
        link: `/admin/instructors`,
      });
    });

    // Courses
    const { data: courses } = await supabase
      .from('courses')
      .select('id, title, code')
      .or(`title.ilike.${pat},code.ilike.${pat}`)
      .limit(LIMIT);
    (courses ?? []).forEach((c: any) => {
      results.push({
        id: c.id,
        title: c.title,
        subtitle: (c.code ?? '').toUpperCase(),
        category: 'course',
        link: `/admin/courses`,
      });
    });
  }

  return NextResponse.json({ results: results.slice(0, 30) });
}
