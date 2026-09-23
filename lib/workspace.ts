import type { Material, Note, Evidence } from './knowledge';
export type Message = {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  evidence?: Evidence[];
  retrieved?: Evidence[];
  saved?: boolean;
  scope?: { selected: number; matchedFiles: number; passages: number };
};

export type Session = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
};

export type Course = {
  id: string;
  name: string;
  code: string;
  materials: Material[];
  graphFocus: string;
  sessions: Session[];
  teacher?: string;
  semester?: string;
  examDate?: string;
  chapters?: string[];
};

export type ViewId =
  | 'home'
  | 'course'
  | 'materials'
  | 'study'
  | 'knowledge'
  | 'graph'
  | 'review';

export type Preferences = {
  brandName: string;
  userName: string;
  semester: string;
};

export type Workspace = {
  reading?: {
    courseId: string;
    materialKey: string;
    passage: number;
    updatedAt: string;
  };
  trash?: TrashEntry[];
  courses: Course[];
  notes: Note[];
  courseId?: string;
  sessionId?: string;
  activeView?: ViewId;
  preferences?: Preferences;
  model?: string;
  tasks?: StudyTask[];
};
export type TrashEntry = {
  id: string;
  kind: 'course' | 'note';
  title: string;
  deletedAt: string;
  course?: Course;
  notes: Note[];
  tasks: StudyTask[];
  links: {
    id: string;
    relatedIds: string[];
    relatedLabels: Record<string, string>;
  }[];
};

export type StudyTask = {
  id: string;
  title: string;
  kind: 'learn' | 'review';
  courseId?: string;
  date?: string;
  status: 'todo' | 'done';
  content?: string;
  createdAt: string;
};
