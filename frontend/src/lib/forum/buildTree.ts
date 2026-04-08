import type { ForumPostFlat, ForumPost } from '@/types/forum';

export function buildTree(posts: ForumPostFlat[]): ForumPost[] {
  const map: Record<string, ForumPost> = {};
  const roots: ForumPost[] = [];
  posts.forEach(p => { map[p.id] = { ...p, replies: [] }; });
  posts.forEach(p => {
    if (p.parent_id && map[p.parent_id]) {
      map[p.parent_id].replies.push(map[p.id]);
    } else {
      roots.push(map[p.id]);
    }
  });
  // newest root posts first
  roots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return roots;
}

export function insertIntoTree(tree: ForumPost[], newPost: ForumPostFlat): ForumPost[] {
  const post: ForumPost = { ...newPost, replies: [] };
  if (!post.parent_id) return [post, ...tree];
  const insertDeep = (nodes: ForumPost[]): ForumPost[] =>
    nodes.map(n => n.id === post.parent_id
      ? { ...n, replies: [...n.replies, post] }
      : { ...n, replies: insertDeep(n.replies) });
  return insertDeep(tree);
}
