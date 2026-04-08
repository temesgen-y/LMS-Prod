export interface ForumThread {
  id: string;
  offering_id: string;
  author_id: string;
  title: string;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  created_at: string;
  last_reply_at: string | null;
  users: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    role: string;
  };
}

export interface ForumPostFlat {
  id: string;
  thread_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  is_answer: boolean;
  upvotes: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  users: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    role: string;
  };
}

export interface ForumPost extends ForumPostFlat {
  replies: ForumPost[];
}
