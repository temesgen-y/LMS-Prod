import TopicContent from '../_components/TopicContent';

// Dynamic route: handles /t5, /t6, /t7 ... any module number.
// Static routes /t1–/t4 take precedence in Next.js, so this only
// activates for t5 and above (or whichever static files are absent).
export default async function DynamicTopicPage({
  params,
}: {
  params: Promise<{ topicSlug: string }>;
}) {
  const { topicSlug } = await params;
  const match = (topicSlug ?? '').match(/^t(\d+)$/);
  const topicIndex = match ? parseInt(match[1], 10) : 0;

  if (!topicIndex || topicIndex < 1) {
    return (
      <div className="py-16 text-center">
        <span className="text-5xl block mb-4">📭</span>
        <p className="text-gray-500">Topic not found.</p>
      </div>
    );
  }

  return <TopicContent topicIndex={topicIndex} />;
}
