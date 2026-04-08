export interface ConversationUser {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export interface MessageAttachmentData {
  id: string;
  attachment_id: string;
  attachments: {
    file_name: string;
    file_url: string;
    mime_type: string;
    size_kb: number;
  };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  message_attachments?: MessageAttachmentData[];
}

export interface ConversationMessage {
  id: string;
  body: string | null;
  sender_id: string;
  is_read: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  offering_id: string;
  student_id: string;
  instructor_id: string;
  created_at: string;
  updated_at: string;
  student: ConversationUser;
  instructor: ConversationUser;
  course_offerings: {
    courses: { code: string; title: string } | null;
  } | null;
  messages: ConversationMessage[];
}
