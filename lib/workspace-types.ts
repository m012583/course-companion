import type { NoteDraft } from './note-draft';
import type { ChapterTrash } from './course-trash';
import type { ChatImage } from './chat-images';
import type { LearningContext } from './chapter-lesson';
import type { CourseGuide } from './course-guide';
import type { ReviewPlan } from './review-plans';
import type { Evidence, Material, Note } from './knowledge';
import type { StudyLabState, ReadingPosition } from './learning-flow';
export type Message = {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  evidence?: Evidence[];
  retrieved?: Evidence[];
  saved?: boolean;
  images?: ChatImage[];
  deletedAt?: string;
  scope?: {
    selected: number;
    matchedFiles: number;
    passages: number;
    imageCount?: number;
    lessonTitle?: string;
    retrieval?: string;
    truncated?: boolean;
  };
};
export type Session = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
  deletedAt?: string;
  learningContext?: LearningContext;
};
export type Course = {
  reading?: ReadingPosition;
  studyLab?: StudyLabState;
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
  guide?: CourseGuide;
  removedChapters?: ChapterTrash[];
  removedGuides?: { id: string; guide: CourseGuide }[];
  deletedAt?: string;
};
export type ViewId =
  | 'home'
  | 'course'
  | 'lab'
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
export type ApiData = {
  state?: Workspace;
  revision?: number;
  error?: string;
  id?: string;
  answer?: string;
  evidence?: Evidence[];
  retrieved?: Evidence[];
  scope?: Message['scope'];
};
export type Workspace = {
  noteDraft?: NoteDraft;
  courses: Course[];
  notes: Note[];
  courseId?: string;
  sessionId?: string;
  activeView?: ViewId;
  preferences?: Preferences;
  model?: string;
  reviewPlans?: ReviewPlan[];
};
