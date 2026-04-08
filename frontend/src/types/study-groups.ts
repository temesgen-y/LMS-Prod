export interface StudyGroup {
  id: string;
  offering_id: string;
  created_by: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  course_offerings?: {
    courses: { code: string; title: string } | null;
  } | null;
  study_group_members?: StudyGroupMember[];
  lastMessage?: StudyGroupMessage | null;
  unreadCount?: number;
}

export interface StudyGroupMember {
  id: string;
  group_id: string;
  student_id: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active' | 'left';
  invited_by: string | null;
  joined_at: string;
  users?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface StudyGroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  body: string | null;
  is_pinned: boolean;
  created_at: string;
  users?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  study_group_attachments?: StudyGroupAttachmentWithFile[];
}

export interface StudyGroupAttachmentWithFile {
  id: string;
  message_id: string;
  attachment_id: string;
  attachments: {
    file_name: string;
    file_url: string;
    mime_type: string;
    size_kb: number;
  };
}

export interface StudyGroupInvitation {
  id: string;
  group_id: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active' | 'left';
  invited_by: string | null;
  joined_at: string;
  study_groups: {
    id: string;
    name: string;
    offering_id: string;
    course_offerings: {
      courses: { code: string; title: string } | null;
    } | null;
  } | null;
  inviter: {
    first_name: string;
    last_name: string;
  } | null;
}

export interface EnrolledCourse {
  offering_id: string;
  course_offerings: {
    id: string;
    courses: { code: string; title: string } | null;
  } | null;
}
