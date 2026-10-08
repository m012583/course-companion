'use client';
import type {
  Message,
  Session,
  Course,
  ViewId,
  Preferences,
  ApiData,
  Workspace,
} from '@/lib/workspace-types';
import { locateSource } from '@/lib/source-anchor';
import MaterialReader from '@/components/material-reader';
import LearningFlow from '@/components/learning-flow';
import LearningNext from '@/components/learning-next';
import { readNoteDraft } from '@/lib/note-draft';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import NoteVisuals from '@/components/note-visuals';
import KnowledgeNetwork from '@/components/knowledge-network';
import QuickSearch from '@/components/quick-search';
import ReviewPlanner from '@/components/review-planner';
import StudyLab from '@/components/study-lab';
import BackupPanel from '@/components/backup-panel';
import { demoWorkspace } from '@/lib/demo-course';
import { readEventStream } from '@/lib/event-stream';
import { cleanCitations } from '@/lib/retrieval';
import '@/components/study-lab.css';
import '@/components/learning-flow.css';
import CourseRecycleBin, {
  type CourseTrashItem,
} from '@/components/course-recycle-bin';
import { removeChapter, restoreChapter } from '@/lib/course-trash';
import type { ChatImage } from '@/lib/chat-images';
import {
  makeLearningContext,
  saveLessonToGuide,
  type ChapterLesson,
} from '@/lib/chapter-lesson';
import type { publicAiSettings } from '@/lib/ai-provider';
import CourseGuidePanel, { CourseGuideEditor } from '@/components/course-guide';
import {
  chapterToMarkdown,
  type CourseGuide,
  type GuideChapter,
} from '@/lib/course-guide';
import {
  belongsToCourse,
  isInDeletedCourse,
  trashCourse,
  restoreCourse,
} from '@/lib/course-lifecycle';
import type { ReviewPlan } from '@/lib/review-plans';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  Home as HomeIcon,
  LoaderCircle,
  Menu,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  Trash2,
  Upload,
  X,
  CalendarDays,
  Database,
  Network,
  Star,
  RotateCcw,
  ArrowUpRight,
  Clock3,
  ImagePlus,
} from 'lucide-react';
import {
  coverageLabel,
  normalizeMath,
  selectNotes,
  isDue,
  localDate,
  scheduleReview,
  splitPassages,
  type Coverage,
  type Evidence,
  type Material,
  type Note,
  type Passage,
} from '@/lib/knowledge';
const DEFAULT_PREFERENCES: Preferences = {
  brandName: '课伴',
  userName: '同学',
  semester: '2026 秋季学期',
};
const DEMO_WORKSPACE = demoWorkspace();
const initialCourses: Course[] = DEMO_WORKSPACE.courses;
const EMPTY_COURSE: Course = {
  id: '',
  name: '尚未添加课程',
  code: '',
  materials: [],
  graphFocus: '',
  sessions: [],
};
const tabs: Array<{ id: ViewId; name: string }> = [
  { id: 'course', name: '学习概览' },
  { id: 'materials', name: '教材阅读' },
  { id: 'study', name: 'AI 问答' },
  { id: 'lab', name: '练习与错题' },
];
const shortTitle = (text: string) =>
  text
    .replace(/[#*`\n]/g, '')
    .trim()
    .slice(0, 28) || '新学习对话';
const materialKey = (m: Material) => m.fileId || m.name;
function Modal({
  children,
  labelId,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  labelId: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('[cmdk-input]')?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
const timeLabel = (time: string) =>
  new Date(time).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  );
}
function download(
  text: string,
  name: string,
  type = 'text/markdown;charset=utf-8',
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function extractText(
  file: File,
): Promise<{ passages: Passage[]; coverage: Coverage }> {
  const limit = 400000;
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    const pdf = await loadingTask.promise;
    let characters = 0,
      readPages = 0,
      emptyPages = 0,
      truncated = false;
    const passages: Passage[] = [];
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        if (characters >= limit || i > 500) {
          truncated = true;
          break;
        }
        const page = await pdf.getPage(i);
        const data = await page.getTextContent();
        const raw = data.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        const text = raw.slice(0, limit - characters);
        if (text.length < raw.length) truncated = true;
        if (!text.trim()) emptyPages++;
        characters += text.length;
        readPages = i;
        passages.push(...splitPassages(text, i));
        page.cleanup();
      }
      return {
        passages,
        coverage: {
          characters,
          readPages,
          totalPages: pdf.numPages,
          emptyPages,
          truncated,
        },
      };
    } finally {
      await loadingTask.destroy();
    }
  }
  let raw = '';
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import('mammoth/mammoth.browser');
    raw = (
      await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    ).value;
  } else if (/\.(md|markdown|txt)$/i.test(file.name)) raw = await file.text();
  const text = raw.slice(0, limit);
  return {
    passages: splitPassages(text),
    coverage: { characters: text.length, truncated: raw.length > limit },
  };
}
export default function Home() {
  const [allCourses, setCourses] = useState<Course[]>(initialCourses),
    [allNotes, setNotes] = useState<Note[]>(DEMO_WORKSPACE.notes);
  const courses = useMemo(
    () =>
      allCourses
        .filter((course) => !course.deletedAt)
        .map((course) => ({
          ...course,
          sessions: course.sessions.filter((session) => !session.deletedAt),
          materials: course.materials.filter((material) => !material.deletedAt),
          guide: course.guide?.deletedAt ? undefined : course.guide,
          chapters: [
            ...new Set([
              ...(course.chapters ?? []),
              ...(!course.guide?.deletedAt
                ? (course.guide?.chapters.map((chapter) => chapter.title) ?? [])
                : []),
            ]),
          ],
        })),
    [allCourses],
  );
  const deletedCourses = useMemo(
    () => allCourses.filter((course) => !!course.deletedAt),
    [allCourses],
  );
  const [reviewPlans, setReviewPlans] = useState<ReviewPlan[]>([]);
  const visibleReviewPlans = reviewPlans.filter((plan) =>
    courses.some((course) => course.id === plan.courseId),
  );
  const notes = useMemo(
    () =>
      allNotes.filter(
        (note) => !note.deletedAt && !isInDeletedCourse(note, allCourses),
      ),
    [allNotes, allCourses],
  );
  const deletedNotes = useMemo(
    () =>
      allNotes.filter(
        (note) => !!note.deletedAt && !isInDeletedCourse(note, allCourses),
      ),
    [allNotes, allCourses],
  );
  const [noteCollection, setNoteCollection] = useState<
    'all' | 'starred' | 'trash'
  >('all');
  const [showSearch, setShowSearch] = useState(false);
  const [pendingDeleteNote, setPendingDeleteNote] = useState<Note | null>(null);
  const [pendingDeleteCourse, setPendingDeleteCourse] = useState<Course | null>(
    null,
  );
  const [activeCourseId, setActiveCourseId] = useState('demo-linear'),
    [activeSessionId, setActiveSessionId] = useState('');
  const [activeView, setActiveView] = useState<ViewId>('home');
  const [labTool, setLabTool] = useState<'calibration' | 'benchmark' | null>(
    null,
  );
  const [practiceQuestion, setPracticeQuestion] = useState('');
  const [readingChat, setReadingChat] = useState(false);
  const [readingTab, setReadingTab] = useState<'read' | 'chat'>('read');
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    try {
      const show = localStorage.getItem('course-kb-welcome-04') !== 'dismissed';
      queueMicrotask(() => setWelcome(show));
    } catch {
      /* optional preference */
    }
  }, []);

  const [guideChapterId, setGuideChapterId] = useState('');
  const [preferences, setPreferences] = useState(DEMO_WORKSPACE.preferences),
    [model, setModel] = useState('deepseek-v4-flash');
  const [aiSettings, setAiSettings] = useState<ReturnType<
    typeof publicAiSettings
  > | null>(null);
  const [questionImages, setQuestionImages] = useState<ChatImage[]>([]);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{
    kind: 'session' | 'message' | 'chapter' | 'guide';
    title: string;
    courseId: string;
    sessionId?: string;
    index?: number;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false),
    [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'offline'>(
      'saved',
    );
  const [syncError, setSyncError] = useState(''),
    [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false),
    [showSettings, setShowSettings] = useState(false);
  const [newCourseOpen, setNewCourseOpen] = useState(false),
    [guideEditorId, setGuideEditorId] = useState(''),
    [newChapter, setNewChapter] = useState('');
  const [question, setQuestion] = useState(''),
    [isSending, setIsSending] = useState(false),
    [chatError, setChatError] = useState('');
  const chatController = useRef<AbortController | null>(null);
  const [streamText, setStreamText] = useState('');
  const [streamStatus, setStreamStatus] = useState('');
  const [streamTarget, setStreamTarget] = useState('');
  const [semanticSearch, setSemanticSearch] = useState(false);
  const persistenceEpoch = useRef(0);
  useEffect(() => () => chatController.current?.abort(), []);
  const [scope, setScope] = useState<'course' | 'all' | 'custom'>('course'),
    [selectedFiles, setSelectedFiles] = useState<string[]>([]),
    [scopeOpen, setScopeOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(''),
    [materialQuery, setMaterialQuery] = useState(''),
    [materialChapter, setMaterialChapter] = useState('');
  const [uploadProgress, setUploadProgress] = useState(''),
    [uploadError, setUploadError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Material | null>(null);
  const [noteQuery, setNoteQuery] = useState(''),
    [noteCourse, setNoteCourse] = useState('all'),
    [noteChapter, setNoteChapter] = useState(''),
    [noteTag, setNoteTag] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false),
    [selectedNoteId, setSelectedNoteId] = useState(''),
    [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState<Note | null>(null),
    [draftOrigin, setDraftOrigin] = useState<{
      course: string;
      session: string;
      index: number;
    } | null>(null);
  const [draftOpen, setDraftOpen] = useState(true);
  const [discardDraft, setDiscardDraft] = useState(false);
  const [saveRetry, setSaveRetry] = useState(0);
  const [source, setSource] = useState<Evidence | null>(null);
  const [reviewQueue, setReviewQueue] = useState<string[] | null>(null),
    [reviewIndex, setReviewIndex] = useState(0),
    [reviewAnswer, setReviewAnswer] = useState(''),
    [reviewRevealed, setReviewRevealed] = useState(false),
    [reviewCorrect, setReviewCorrect] = useState(0);
  const revisionRef = useRef(0),
    loadedState = useRef(''),
    syncBlocked = useRef(false),
    saveQueue = useRef(Promise.resolve()),
    chatEndRef = useRef<HTMLDivElement>(null),
    routeApplied = useRef(false);
  const [scanActive, setScanActive] = useState(false);
  const scanAbort = useRef<AbortController | null>(null);
  useEffect(() => () => scanAbort.current?.abort(), []);
  const imageInput = useRef<HTMLInputElement>(null);
  const attachmentBatch = useRef(0);
  const activeCourse =
      courses.find((c) => c.id === activeCourseId) ??
      courses[0] ??
      EMPTY_COURSE,
    materials = activeCourse.materials;
  const activeSession = activeCourse.sessions.find(
    (s) => s.id === activeSessionId,
  );
  const currentMaterial =
    materials.find((m) => materialKey(m) === selectedMaterialId) ??
    materials.find((m) =>
      activeCourse.reading?.fileId
        ? m.fileId === activeCourse.reading.fileId
        : m.name === activeCourse.reading?.name,
    ) ??
    materials[0];
  const allMaterials = courses.flatMap((c) =>
    c.materials.map((m) => ({ ...m, courseName: c.name })),
  );
  const readable = allMaterials.filter((m) => m.content || m.passages?.length);
  const contextMaterials =
    scope === 'all'
      ? readable
      : scope === 'custom'
        ? readable.filter((m) => selectedFiles.includes(materialKey(m)))
        : materials.filter((m) => m.content || m.passages?.length);
  const courseNotes = notes.filter((n) =>
      n.courseId
        ? n.courseId === activeCourse.id
        : n.course === activeCourse.name,
    ),
    dueNotes = notes.filter((n) => isDue(n));
  const activeChapters = [
    ...new Set(
      [
        ...(activeCourse.chapters ?? []),
        ...courseNotes.map((n) => n.chapter),
        ...materials.map((m) => m.chapter),
      ].filter((name): name is string => !!name),
    ),
  ];
  const filteredNotes = useMemo(
    () =>
      selectNotes(
        noteCollection === 'trash'
          ? deletedNotes
          : noteCollection === 'starred'
            ? notes.filter((n) => n.starred)
            : notes,
        {
          courseId: noteCourse === 'all' ? undefined : noteCourse,
          courseName: courses.find((c) => c.id === noteCourse)?.name,
          chapter: noteChapter,
          tag: noteTag,
          dueOnly: reviewOnly,
          query: noteQuery,
        },
      ),
    [
      notes,
      deletedNotes,
      noteCollection,
      noteCourse,
      noteChapter,
      noteTag,
      reviewOnly,
      noteQuery,
      courses,
    ],
  );
  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const noteCollectionLabel =
    noteCollection === 'trash'
      ? '回收站'
      : noteCollection === 'starred'
        ? '我的收藏'
        : '全部笔记';
  const sourceLocation = source
    ? locateSource(
        source,
        allCourses.flatMap((c) => c.materials),
      )
    : null;
  const reviewNote = reviewQueue
    ? notes.find((n) => n.id === reviewQueue[reviewIndex])
    : undefined;
  const workspaceState: Workspace = {
    courses: allCourses,
    notes: allNotes,
    reviewPlans,
    courseId: activeCourseId,
    sessionId: activeSessionId,
    activeView,
    preferences,
    model,
    noteDraft: { note: draftNote, origin: draftOrigin },
  };
  function applyState(state: Workspace) {
    const draft = readNoteDraft(state.noteDraft);
    setDraftNote(draft.note);
    setDraftOrigin(draft.origin);
    setDraftOpen(!!draft.note);
    setCourses(state.courses);
    setReviewPlans(state.reviewPlans ?? []);
    const restoredCourseId =
      state.courses.find(
        (course) => course.id === state.courseId && !course.deletedAt,
      )?.id ??
      state.courses.find((course) => !course.deletedAt)?.id ??
      '';
    const restoredNotes = (state.notes ?? []).map((n) => ({
      ...n,
      courseId:
        n.courseId ?? state.courses.find((c) => c.name === n.course)?.id,
    }));
    setNotes(restoredNotes);
    // Merely opening a second tab must not write the same state back and
    // invalidate the first tab's revision before the user has edited anything.
    loadedState.current = JSON.stringify({
      courses: state.courses,
      notes: restoredNotes,
      reviewPlans: state.reviewPlans ?? [],
      courseId: restoredCourseId,
      sessionId: state.sessionId ?? '',
      activeView: state.activeView ?? 'home',
      preferences: state.preferences ?? DEFAULT_PREFERENCES,
      model: state.model ?? 'deepseek-v4-flash',
      noteDraft: readNoteDraft(state.noteDraft),
    });
    setActiveCourseId(restoredCourseId);
    setActiveSessionId(state.sessionId ?? '');
    setActiveView(state.activeView ?? 'home');
    setPreferences(state.preferences ?? DEFAULT_PREFERENCES);
    setModel(state.model ?? 'deepseek-v4-flash');
  }
  useEffect(() => {
    let disposed = false;
    fetch('/api/ai-settings')
      .then((response) => (response.ok ? response.json() : null))
      .then((raw) => {
        const value = raw as ReturnType<typeof publicAiSettings> | null;
        if (!disposed && value?.models?.length) setAiSettings(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (
      hydrated &&
      aiSettings &&
      !aiSettings.models.some((option) => option.id === model)
    )
      queueMicrotask(() => setModel(aiSettings.defaultModel));
  }, [hydrated, aiSettings, model]);
  useEffect(() => {
    attachmentBatch.current++;
  }, [activeCourseId]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/workspace');
        const data = (await response.json()) as ApiData;
        if (!response.ok) throw new Error('load');
        const state =
          data.state ??
          JSON.parse(
            localStorage.getItem('course-companion-v2-state') || 'null',
          );
        if (!cancelled && Array.isArray(state?.courses)) {
          let recoveredDraft = false;
          try {
            const localDraft = localStorage.getItem(
              'course-companion-v2-note-draft',
            );
            if (localDraft) {
              const cached = JSON.parse(localDraft);
              if (cached.revision === (data.revision ?? 0)) {
                const draft = readNoteDraft(cached.draft);
                recoveredDraft =
                  JSON.stringify(draft) !==
                  JSON.stringify(readNoteDraft(state.noteDraft));
                state.noteDraft = draft;
              }
            }
          } catch {
            try {
              localStorage.setItem(
                'course-companion-v2-note-draft-corrupt',
                localStorage.getItem('course-companion-v2-note-draft') ?? '',
              );
            } catch {}
            setToast('本机草稿无法读取，已保留原始副本；继续使用服务端草稿。');
          }
          applyState(state);
          if (!data.state || recoveredDraft) loadedState.current = '';
          revisionRef.current = data.revision ?? 0;
        }
      } catch {
        syncBlocked.current = true;
        try {
          const local = JSON.parse(
            localStorage.getItem('course-companion-v2-state') || 'null',
          );
          if (!cancelled && Array.isArray(local?.courses)) applyState(local);
        } catch {
          /* Preserve defaults */
        }
        setSyncStatus('offline');
        setSyncError(
          '无法连接本地服务，正在使用浏览器副本。请先下载正文备份，再刷新重连。',
        );
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const epoch = persistenceEpoch.current;
    const state = {
      courses: allCourses,
      notes: allNotes,
      reviewPlans,
      courseId: activeCourseId,
      sessionId: activeSessionId,
      activeView,
      preferences,
      model,
      noteDraft: { note: draftNote, origin: draftOrigin },
    };
    try {
      localStorage.setItem('course-companion-v2-state', JSON.stringify(state));
      localStorage.setItem(
        'course-companion-v2-note-draft',
        JSON.stringify({
          draft: state.noteDraft,
          revision: revisionRef.current,
        }),
      );
    } catch {
      queueMicrotask(() =>
        setSyncError('浏览器备份空间不足，请下载正文备份。'),
      );
    }
    if (syncBlocked.current) return;
    if (JSON.stringify(state) === loadedState.current) return;
    loadedState.current = '';
    const timer = setTimeout(() => {
      setSyncStatus('saving');
      saveQueue.current = saveQueue.current.then(async () => {
        if (syncBlocked.current || epoch !== persistenceEpoch.current) return;
        try {
          const response = await fetch('/api/workspace', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, revision: revisionRef.current }),
          });
          const data = (await response.json()) as ApiData;
          if (!response.ok) {
            if (response.status === 409) syncBlocked.current = true;
            throw new Error(
              response.status === 409
                ? '另一窗口已更新工作区。请下载正文备份后刷新核对。'
                : data.error || '保存失败',
            );
          }
          revisionRef.current = data.revision ?? revisionRef.current;
          setSyncStatus('saved');
          setSyncError('');
        } catch (error) {
          setSyncStatus('offline');
          setSyncError(
            error instanceof Error
              ? error.message
              : '保存失败，请下载正文备份。',
          );
        }
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [
    allCourses,
    allNotes,
    reviewPlans,
    activeCourseId,
    activeSessionId,
    activeView,
    preferences,
    model,
    hydrated,
    draftNote,
    draftOrigin,
    saveRetry,
  ]);
  useEffect(() => {
    if (!hydrated) return;
    const readRoute = () => {
      const p = new URLSearchParams(location.hash.slice(1));
      const view = p.get('view') as ViewId;
      if (
        [
          'home',
          'course',
          'lab',
          'materials',
          'study',
          'knowledge',
          'graph',
          'review',
        ].includes(view)
      ) {
        setActiveView(view);
        const c = p.get('course');
        if (c && courses.some((item) => item.id === c)) setActiveCourseId(c);
        setActiveSessionId(p.get('session') ?? '');
        setSelectedMaterialId(p.get('file') ?? '');
        setSelectedNoteId(p.get('note') ?? '');
        setGuideChapterId(p.get('chapter') ?? '');
        setPracticeQuestion(p.get('question') ?? '');
        if (view === 'knowledge') {
          setNoteCollection(
            p.get('collection') === 'trash'
              ? 'trash'
              : p.get('collection') === 'starred'
                ? 'starred'
                : 'all',
          );
          setEditingNote(false);
          setNoteCourse(p.get('filter') ?? 'all');
          setNoteQuery('');
          setNoteChapter('');
          setNoteTag('');
          setReviewOnly(false);
        }
      }
    };
    if (!routeApplied.current) {
      queueMicrotask(readRoute);
      routeApplied.current = true;
    }
    window.addEventListener('popstate', readRoute);
    return () => window.removeEventListener('popstate', readRoute);
  }, [hydrated, courses]);
  useEffect(() => {
    document.title = `${preferences.brandName} · ${activeView === 'home' ? '今日学习' : activeView === 'graph' ? '知识图谱' : activeView === 'review' ? '复习计划' : activeView === 'knowledge' ? noteCollectionLabel : activeCourse.name}`;
  }, [
    preferences.brandName,
    activeView,
    activeCourse.name,
    noteCollectionLabel,
  ]);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeSession?.messages.length, isSending]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (document.querySelector('dialog[open]') && !showSearch) return;
        event.preventDefault();
        setShowSearch((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSearch]);
  function go(
    view: ViewId,
    opts: {
      course?: string;
      session?: string;
      file?: string;
      note?: string;
      filter?: string;
      collection?: 'all' | 'starred' | 'trash';
      chapter?: string;
      question?: string;
    } = {},
  ) {
    setActiveView(view);
    setPracticeQuestion(opts.question ?? '');
    setMobileNavOpen(false);
    setEditingNote(false);
    if (view === 'course') setGuideChapterId(opts.chapter ?? '');
    if (opts.course) {
      if (opts.course !== activeCourseId) {
        setReadingChat(false);
        setQuestionImages([]);
      }
      setActiveCourseId(opts.course);
      setSelectedMaterialId(opts.file ?? '');
      setActiveSessionId(opts.session ?? '');
      setScope('course');
      setSelectedFiles([]);
    }
    if (opts.session !== undefined) setActiveSessionId(opts.session);
    if (opts.file) setSelectedMaterialId(opts.file);
    if (view === 'knowledge') {
      setNoteCollection(opts.collection ?? 'all');
      setNoteCourse(opts.filter ?? 'all');
      setNoteQuery('');
      setNoteChapter('');
      setNoteTag('');
      setReviewOnly(false);
      setSelectedNoteId(opts.note ?? '');
    }
    const params = new URLSearchParams({
      view,
      course: opts.course ?? activeCourseId,
    });
    if (opts.session) params.set('session', opts.session);
    if (opts.file) params.set('file', opts.file);
    if (opts.note) params.set('note', opts.note);
    if (opts.chapter) params.set('chapter', opts.chapter);
    if (opts.question) params.set('question', opts.question);
    if (opts.filter) params.set('filter', opts.filter);
    if (opts.collection && opts.collection !== 'all')
      params.set('collection', opts.collection);
    history.pushState(null, '', `#${params}`);
  }
  function updateCourse(id: string, update: (course: Course) => Course) {
    setCourses((current) => current.map((c) => (c.id === id ? update(c) : c)));
  }
  function updateSession(
    courseId: string,
    sessionId: string,
    update: (session: Session) => Session,
  ) {
    updateCourse(courseId, (c) => ({
      ...c,
      sessions: c.sessions.map((s) => (s.id === sessionId ? update(s) : s)),
    }));
  }
  function editNote(patch: Partial<Note>) {
    if (selectedNote)
      setNotes((current) =>
        current.map((n) =>
          n.id === selectedNote.id
            ? { ...n, ...patch, updatedAt: new Date().toISOString() }
            : n,
        ),
      );
  }
  function newSession() {
    const id = crypto.randomUUID();
    updateCourse(activeCourse.id, (c) => ({
      ...c,
      sessions: [
        {
          id,
          title: '新学习对话',
          messages: [],
          updatedAt: new Date().toISOString(),
        },
        ...c.sessions,
      ],
    }));
    go('study', { session: id });
    setQuestion('');
    setQuestionImages([]);
    setChatError('');
  }
  function addCourse(name: string, guide?: CourseGuide, upload = false) {
    if (!name.trim()) return;
    const course: Course = {
      id: crypto.randomUUID(),
      name: name.trim(),
      code: '',
      materials: [],
      sessions: [],
      graphFocus: '',
      chapters: [],
      ...(guide ? { guide } : {}),
    };
    setCourses((current) => [...current, course]);
    setNewCourseOpen(false);
    go(upload ? 'materials' : 'course', { course: course.id });
    setToast(guide ? '课程与导览已创建' : '课程已创建');
  }
  function noteFromGuide(chapter: GuideChapter) {
    if (draftNote) {
      setDraftOpen(true);
      setToast('请先保存或丢弃当前草稿，再创建另一篇笔记。');
      return;
    }
    setDiscardDraft(false);
    const existing = courseNotes.find(
      (note) => note.guideChapterId === chapter.id,
    );
    if (existing) {
      openNote(existing);
      return;
    }
    const now = new Date().toISOString();
    setDraftOrigin(null);
    setDraftOpen(true);
    setDraftNote({
      id: crypto.randomUUID(),
      title: chapter.title,
      text: chapterToMarkdown(
        activeCourse.name,
        chapter,
        activeCourse.guide?.source ?? 'manual',
      ),
      course: activeCourse.name,
      courseId: activeCourse.id,
      createdAt: now,
      updatedAt: now,
      chapter: chapter.title,
      tags: ['课程导览'],
      sources: chapter.lesson?.evidence ?? [],
      guideChapterId: chapter.id,
    });
  }
  function saveChapterLesson(
    courseId: string,
    chapterId: string,
    lesson: ChapterLesson,
    expectedSourceKey?: string,
  ) {
    updateCourse(courseId, (current) =>
      current.deletedAt
        ? current
        : {
            ...current,
            guide: saveLessonToGuide(
              current.guide,
              current.name,
              chapterId,
              lesson,
              expectedSourceKey,
            ),
          },
    );
  }
  async function syncNewLessons() {
    try {
      const response = await fetch('/api/workspace');
      const latest = (await response.json()) as ApiData;
      if (!response.ok || !latest.state || latest.revision === undefined)
        throw new Error('暂时无法读取最新内容，请稍后重试。');
      let count = 0;
      const merged: Workspace = {
        ...latest.state,
        courses: latest.state.courses.map((current) => {
          if (current.deletedAt || !current.guide || current.guide.deletedAt)
            return current;
          const local = allCourses.find((item) => item.id === current.id);
          let guide = current.guide;
          for (const chapter of local?.guide?.chapters ?? []) {
            if (
              !chapter.lesson ||
              chapter.lesson.deletedAt ||
              guide.chapters.find((item) => item.id === chapter.id)?.lesson
            )
              continue;
            const updated = saveLessonToGuide(
              guide,
              current.name,
              chapter.id,
              chapter.lesson,
              chapter.lesson.sourceKey,
            );
            if (updated && updated !== guide) {
              guide = updated;
              count++;
            }
          }
          return { ...current, guide };
        }),
      };
      if (!count) {
        setToast('没有可安全合并的新讲解；请保留正文备份后刷新核对。');
        return;
      }
      const saved = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: merged, revision: latest.revision }),
      });
      const result = (await saved.json()) as ApiData;
      if (!saved.ok)
        throw new Error(result.error || '同步失败，请保留当前页面后重试。');
      revisionRef.current = result.revision ?? latest.revision;
      syncBlocked.current = false;
      applyState(merged);
      setSyncStatus('saved');
      setSyncError('');
      go('course', { course: activeCourse.id });
      setToast(`已合并 ${count} 章新讲解，其他内容以最新保存版本为准。`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : '同步失败。');
    }
  }
  function askFromGuide(
    chapter: GuideChapter,
    concept?: string,
    suggestedQuestion?: string,
  ) {
    if (!activeCourse.guide) return;
    if (isSending || isImageUploading) {
      setToast('请等待当前问题处理完成后，再打开章节提问。');
      return;
    }
    const context = makeLearningContext(
      activeCourse.id,
      activeCourse.name,
      activeCourse.guide,
      chapter,
      concept,
    );
    const existing = activeCourse.sessions.find((session) => {
      const saved = session.learningContext;
      return (
        saved?.chapterId === chapter.id &&
        saved.concept === concept &&
        saved.text === context.text
      );
    });
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing)
      updateCourse(activeCourse.id, (current) => ({
        ...current,
        sessions: [
          {
            id,
            title: shortTitle(`${concept || chapter.title} · 讲解提问`),
            messages: [],
            updatedAt: new Date().toISOString(),
            learningContext: context,
          },
          ...current.sessions,
        ],
      }));
    go('study', { course: activeCourse.id, session: id });
    setQuestion(
      suggestedQuestion ||
        `请结合这段讲解，帮我理解「${concept || chapter.title}」，再举一个简单的例子。`,
    );
    setQuestionImages([]);
    setChatError('');
  }
  function removeManagedItem() {
    if (!pendingRemoval) return;
    const target = pendingRemoval;
    const course = allCourses.find((item) => item.id === target.courseId);
    if (!course) return;
    const now = new Date().toISOString();
    if (target.kind === 'chapter') {
      const removed = removeChapter(course, allNotes, target.title, now);
      updateCourse(course.id, () => removed.course);
      setNotes(removed.notes);
    } else if (target.kind === 'guide') {
      updateCourse(course.id, (current) => ({
        ...current,
        removedGuides: current.guide
          ? [
              ...(current.removedGuides ?? []),
              {
                id: crypto.randomUUID(),
                guide: { ...current.guide, deletedAt: now },
              },
            ]
          : current.removedGuides,
        guide: undefined,
      }));
    } else if (target.kind === 'session') {
      updateSession(course.id, target.sessionId!, (session) => ({
        ...session,
        deletedAt: now,
      }));
      if (activeSessionId === target.sessionId) go('study', { session: '' });
    } else {
      updateSession(course.id, target.sessionId!, (session) => ({
        ...session,
        messages: session.messages.map((message, index) =>
          index === target.index ? { ...message, deletedAt: now } : message,
        ),
      }));
    }
    setPendingRemoval(null);
    setToast('已移入回收站，可以随时恢复。');
  }
  function courseTrashItems(course: Course): CourseTrashItem[] {
    const items: CourseTrashItem[] = [];
    for (const session of course.sessions) {
      if (session.deletedAt)
        items.push({
          id: `session-${session.id}`,
          kind: '对话',
          title: session.title,
          onRestore: () => {
            updateSession(course.id, session.id, (current) => ({
              ...current,
              deletedAt: undefined,
            }));
            setToast('对话已恢复');
          },
        });
      else
        session.messages.forEach((message, index) => {
          if (message.deletedAt)
            items.push({
              id: `message-${session.id}-${index}`,
              kind: '消息',
              title: `${session.title} · ${message.text.slice(0, 45)}`,
              onRestore: () => {
                updateSession(course.id, session.id, (current) => ({
                  ...current,
                  messages: current.messages.map((entry, position) =>
                    position === index
                      ? { ...entry, deletedAt: undefined }
                      : entry,
                  ),
                }));
                setToast('消息已恢复');
              },
            });
        });
    }
    for (const material of course.materials)
      if (material.deletedAt)
        items.push({
          id: `material-${materialKey(material)}`,
          kind: '资料',
          title: material.name,
          onRestore: () => {
            updateCourse(course.id, (current) => ({
              ...current,
              materials: current.materials.map((entry) =>
                materialKey(entry) === materialKey(material)
                  ? { ...entry, deletedAt: undefined }
                  : entry,
              ),
            }));
            setToast('资料已恢复');
          },
        });
    if (course.guide?.deletedAt)
      items.push({
        id: 'guide',
        kind: '导览',
        title: `${course.name} · 课程导览`,
        onRestore: () => {
          updateCourse(course.id, (current) => ({
            ...current,
            guide: { ...current.guide!, deletedAt: undefined },
          }));
          setToast('课程导览已恢复');
        },
      });
    for (const entry of course.removedGuides ?? [])
      items.push({
        id: `guide-${entry.id}`,
        kind: '导览',
        title: `${entry.guide.generatedFor} · ${timeLabel(entry.guide.deletedAt!)}`,
        onRestore: () => {
          if (course.guide && !course.guide.deletedAt) {
            setToast('已有课程导览，请先将当前导览移入回收站，再恢复这一版。');
            return;
          }
          updateCourse(course.id, (current) => ({
            ...current,
            guide: { ...entry.guide, deletedAt: undefined },
            removedGuides: current.removedGuides?.filter(
              (item) => item.id !== entry.id,
            ),
          }));
          setToast('课程导览已恢复');
        },
      });
    for (const chapter of course.guide?.deletedAt
      ? []
      : (course.guide?.chapters ?? [])) {
      if (chapter.lesson?.deletedAt)
        items.push({
          id: `lesson-${chapter.id}`,
          kind: '讲解',
          title: `${chapter.title} · 章节讲解`,
          onRestore: () => {
            saveChapterLesson(course.id, chapter.id, {
              ...chapter.lesson!,
              deletedAt: undefined,
            });
            setToast('章节讲解已恢复');
          },
        });
    }
    for (const chapter of course.removedChapters ?? [])
      items.push({
        id: `chapter-${chapter.id}`,
        kind: '章节',
        title: chapter.title,
        onRestore: () => {
          try {
            const restored = restoreChapter(course, allNotes, chapter.id);
            updateCourse(course.id, () => restored.course);
            setNotes(restored.notes);
            setToast('章节已恢复');
          } catch (error) {
            setToast(error instanceof Error ? error.message : '恢复失败');
          }
        },
      });
    return items;
  }
  async function addMaterials(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const courseId = activeCourse.id;
    const errors: string[] = [];
    setUploadError('');
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      setUploadProgress(`${index + 1}/${files.length} · ${file.name}`);
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB');
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/files', {
          method: 'POST',
          body: form,
        });
        const data = (await response.json()) as ApiData;
        if (!response.ok || !data.id) throw new Error(data.error || '上传失败');
        let extracted: { passages: Passage[]; coverage: Coverage } | undefined;
        try {
          extracted = await extractText(file);
        } catch {
          errors.push(`${file.name}：原文件已保存，文字提取失败，可重新解析。`);
        }
        const material: Material = {
          name: file.name,
          type: file.name.split('.').pop()?.toUpperCase() ?? 'FILE',
          size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          fileId: data.id,
          status: extracted?.passages.length ? '可检索' : '已保存',
          ...extracted,
        };
        updateCourse(courseId, (c) => ({
          ...c,
          materials: [material, ...c.materials],
        }));
        setSelectedMaterialId(data.id);
      } catch (error) {
        errors.push(
          `${file.name}：${error instanceof Error ? error.message : '上传失败'}`,
        );
      }
    }
    setUploadProgress('');
    if (errors.length) setUploadError(errors.join('\n'));
    else setToast(`${files.length} 份资料已加入课程`);
  }
  async function addQuestionImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    if (files.length + questionImages.length > 3) {
      setChatError('每条消息最多添加 3 张图片。');
      return;
    }
    if (
      files.some(
        (file) =>
          !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
            file.type,
          ) || file.size > 5 * 1024 * 1024,
      )
    ) {
      setChatError('请选择 5 MB 以内的 PNG、JPEG、WebP 或 GIF 图片。');
      return;
    }
    const batch = attachmentBatch.current;
    setIsImageUploading(true);
    setChatError('');
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/files', {
          method: 'POST',
          body: form,
        });
        const data = (await response.json()) as ApiData;
        if (!response.ok || !data.id)
          throw new Error(data.error || '图片保存失败。');
        if (attachmentBatch.current === batch)
          setQuestionImages((current) => [
            ...current,
            { fileId: data.id!, name: file.name.slice(0, 200) },
          ]);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : '添加图片失败。');
    } finally {
      setIsImageUploading(false);
    }
  }
  async function recognizeMaterial(material: Material) {
    if (!material.fileId || scanAbort.current) return;
    const courseId = activeCourse.id,
      controller = new AbortController();
    scanAbort.current = controller;
    setScanActive(true);
    setUploadError('');
    setUploadProgress('读取扫描件…');
    try {
      const response = await fetch(
        `/api/files?id=${encodeURIComponent(material.fileId)}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error('原始附件不可用。');
      const { readScan } = await import('@/lib/scan-reader');
      const data = await readScan(
        new File([await response.blob()], material.name),
        setUploadProgress,
        controller.signal,
      );
      if (!data.passages.length)
        throw new Error(
          '未识别出文字，原资料保留。请使用更清晰的扫描件或人工补充。',
        );
      updateCourse(courseId, (c) => ({
        ...c,
        materials: c.materials.map((m) =>
          m.fileId === material.fileId && !m.deletedAt
            ? { ...m, ...data, content: undefined, status: 'OCR 待核对' }
            : m,
        ),
      }));
      setToast('文字识别完成，请在“校正提取文字”核对公式和识别结果。');
    } catch (e) {
      setUploadError(
        controller.signal.aborted
          ? '已停止识别，原资料保留。'
          : e instanceof Error
            ? e.message
            : '识别失败。',
      );
    } finally {
      scanAbort.current = null;
      setScanActive(false);
      setUploadProgress('');
    }
  }
  async function reparse(material: Material) {
    if (!material.fileId) return;
    const courseId = activeCourse.id;
    setUploadProgress(`重新读取 · ${material.name}`);
    setUploadError('');
    try {
      const response = await fetch(
        `/api/files?id=${encodeURIComponent(material.fileId)}`,
      );
      if (!response.ok) throw new Error('无法读取原文件');
      const data = await extractText(
        new File([await response.blob()], material.name),
      );
      updateCourse(courseId, (c) => ({
        ...c,
        materials: c.materials.map((m) =>
          m.fileId === material.fileId
            ? {
                ...m,
                ...data,
                content: undefined,
                status: data.passages.length ? '可检索' : '已保存',
              }
            : m,
        ),
      }));
      setToast('正文已重新解析');
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : '重新解析失败，原有资料已保留',
      );
    } finally {
      setUploadProgress('');
    }
  }
  function removeMaterial() {
    if (!pendingDelete) return;
    const removed = pendingDelete;
    updateCourse(activeCourse.id, (c) => ({
      ...c,
      materials: c.materials.map((m) =>
        materialKey(m) === materialKey(removed)
          ? { ...m, deletedAt: new Date().toISOString() }
          : m,
      ),
    }));
    setPendingDelete(null);
    setToast('资料已移入课程回收站，可恢复。原文引用仍可使用。');
  }
  async function submitQuestion(event?: { preventDefault(): void }) {
    event?.preventDefault();
    const trimmed =
      question.trim() ||
      (questionImages.length ? '请解释图片中的课程知识或题目。' : '');
    if (!trimmed || isSending || isImageUploading) return;
    const sentImages = questionImages;
    const courseId = activeCourse.id,
      sessionId = activeSession?.id ?? crypto.randomUUID(),
      historyMessages = (activeSession?.messages ?? []).filter(
        (message) => !message.deletedAt,
      );
    if (!activeSession)
      updateCourse(courseId, (c) => ({
        ...c,
        sessions: [
          {
            id: sessionId,
            title: shortTitle(trimmed),
            messages: [{ role: 'user', text: trimmed, images: sentImages }],
            updatedAt: new Date().toISOString(),
          },
          ...c.sessions,
        ],
      }));
    else
      updateSession(courseId, sessionId, (s) => ({
        ...s,
        title: s.title === '新学习对话' ? shortTitle(trimmed) : s.title,
        messages: [
          ...s.messages,
          { role: 'user', text: trimmed, images: sentImages },
        ],
        updatedAt: new Date().toISOString(),
      }));
    setActiveSessionId(sessionId);
    setQuestion('');
    setQuestionImages([]);
    setIsSending(true);
    setChatError('');
    const abort = new AbortController();
    chatController.current = abort;
    setStreamText('');
    setStreamTarget(`${courseId}/${sessionId}`);
    setStreamStatus('正在连接…');
    let partial = '';
    let liveEvidence: Evidence[] = [];
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        signal: abort.signal,
        body: JSON.stringify({
          semantic: semanticSearch,
          question: trimmed,
          history: historyMessages.map(({ role, text, images }) => ({
            role,
            content: text,
            images,
          })),
          course: activeCourse.name,
          model,
          contexts: contextMaterials,
          images: sentImages,
          learningContext: activeSession?.learningContext,
        }),
      });
      if (!response.ok || !response.body) throw new Error('连接失败，请重试。');
      let data: ApiData | undefined;
      for await (const raw of readEventStream(response.body)) {
        const event = JSON.parse(raw);
        if (event.type === 'status') {
          setStreamStatus(
            `${event.text}${event.retrieval ? ` · ${event.retrieval}` : ''}`,
          );
          if (Array.isArray(event.evidence)) liveEvidence = event.evidence;
        }
        if (event.type === 'delta') {
          partial += event.text;
          setStreamText(partial);
        }
        if (event.type === 'error')
          throw new Error(event.error || '生成失败。');
        if (event.type === 'done') data = event;
      }
      if (!data?.answer) throw new Error('回答未完成，连接已中断。');
      const completed = data;
      updateSession(courseId, sessionId, (s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            role: 'assistant',
            text: completed.answer!,
            evidence: completed.evidence,
            retrieved: completed.retrieved,
            scope: completed.scope,
          },
        ],
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      const reason = abort.signal.aborted
        ? '生成已停止'
        : error instanceof Error
          ? error.message
          : '连接失败';
      setChatError(
        reason +
          (partial ? '，已保留未完成的回答。' : '，可以修改问题后再次发送。'),
      );
      if (partial)
        updateSession(courseId, sessionId, (s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              role: 'assistant',
              text:
                cleanCitations(partial, liveEvidence) +
                '\n\n> 回答未完成，请勿当作完整结论。',
              retrieved: liveEvidence,
              evidence: liveEvidence.filter((e) =>
                partial.includes(`[${e.id}]`),
              ),
            },
          ],
          updatedAt: new Date().toISOString(),
        }));
    } finally {
      chatController.current = null;
      setStreamText('');
      setIsSending(false);
    }
  }
  function startNote(message?: Message, index?: number) {
    if (draftNote) {
      setDraftOpen(true);
      setToast('请先保存或丢弃当前草稿，再创建另一篇笔记。');
      return;
    }
    setDiscardDraft(false);
    if (!courses.length) {
      setNewCourseOpen(true);
      setToast('先添加一门课程，就可以开始记笔记。');
      return;
    }
    const now = new Date().toISOString(),
      selection = window.getSelection()?.toString().trim(),
      selectedText =
        selection && message?.text.includes(selection) ? selection : undefined;
    setDraftOpen(true);
    setDraftNote({
      id: crypto.randomUUID(),
      title: message
        ? shortTitle(
            [...(activeSession?.messages ?? [])]
              .slice(0, index)
              .reverse()
              .find((m) => m.role === 'user')?.text ?? '',
          )
        : '',
      text: selectedText ?? message?.text ?? '',
      course: activeCourse.name,
      courseId: activeCourse.id,
      createdAt: now,
      updatedAt: now,
      sessionId: message ? activeSession?.id : undefined,
      sources: message?.evidence ?? [],
      chapter: '',
      tags: [],
      reviewAt: localDate(),
      reviewQuestion: '',
    });
    setDraftOrigin(
      message && activeSession && index !== undefined
        ? { course: activeCourse.id, session: activeSession.id, index }
        : null,
    );
  }
  function saveDraft(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!draftNote?.title.trim() || !draftNote.text.trim()) return;
    if (!allCourses.some((c) => !c.deletedAt && c.id === draftNote.courseId)) {
      setToast('请先选择有效课程或恢复草稿所属课程。');
      return;
    }
    setNotes((current) => [
      {
        ...draftNote,
        title: draftNote.title.trim(),
        tags: draftNote.tags?.map((t) => t.trim()).filter(Boolean),
      },
      ...current,
    ]);
    if (draftOrigin)
      updateSession(draftOrigin.course, draftOrigin.session, (s) => ({
        ...s,
        messages: s.messages.map((m, i) =>
          i === draftOrigin.index ? { ...m, saved: true } : m,
        ),
      }));
    setDraftNote(null);
    setToast(draftNote.reviewAt ? '笔记已保存，并加入今日复习' : '笔记已保存');
    go('knowledge', { note: draftNote.id });
  }
  function addDemoCourse() {
    if (allCourses.some((c) => c.id === 'demo-linear')) {
      setToast('示例课程已存在，可在课程列表或回收站打开。');
      return;
    }
    const demo = demoWorkspace();
    setCourses((current) => [...current, ...demo.courses]);
    setNotes((current) => [...current, ...demo.notes]);
    setToast('已添加示例课程，阅读、自测和检索验证无需 AI。');
  }
  async function exportMigration() {
    if (syncBlocked.current || isSending)
      throw new Error('请先完成生成并处理保存提示，再导出。');
    syncBlocked.current = true;
    persistenceEpoch.current++;
    try {
      await saveQueue.current;
      const saved = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: workspaceState,
          revision: revisionRef.current,
        }),
      });
      const info = (await saved.json()) as { error?: string; revision: number };
      if (!saved.ok) throw new Error(info.error || '保存失败，未导出。');
      revisionRef.current = info.revision;
      loadedState.current = JSON.stringify(workspaceState);
      const response = await fetch('/api/backup');
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '迁移包导出失败。');
      setSyncStatus('saved');
      return data;
    } finally {
      syncBlocked.current = false;
    }
  }
  async function restoreMigration(backup: unknown, allowMissing: boolean) {
    if (syncBlocked.current || isSending)
      throw new Error('请先处理保存冲突或停止生成，再恢复。');
    syncBlocked.current = true;
    persistenceEpoch.current++;
    try {
      await saveQueue.current;
      const saved = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: workspaceState,
          revision: revisionRef.current,
        }),
      });
      const savedInfo = (await saved.json()) as {
        error?: string;
        revision: number;
      };
      if (!saved.ok)
        throw new Error(savedInfo.error || '当前数据尚未保存，已取消恢复。');
      revisionRef.current = savedInfo.revision;
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup,
          allowMissing,
          revision: revisionRef.current,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        revision: number;
        state: Workspace;
      };
      if (!response.ok) throw new Error(data.error || '恢复失败。');
      revisionRef.current = data.revision;
      const state = {
        ...data.state,
        activeView: 'home',
        sessionId: '',
      } as Workspace;
      applyState(state);
      localStorage.setItem('course-companion-v2-state', JSON.stringify(state));
      localStorage.setItem(
        'course-companion-v2-note-draft',
        JSON.stringify({
          draft: readNoteDraft(state.noteDraft),
          revision: revisionRef.current,
        }),
      );
      setSelectedNoteId('');
      setQuestion('');
      setQuestionImages([]);
      history.replaceState(null, '', '#view=home');
      setSyncStatus('saved');
      setSyncError('');
      setToast('已恢复到增强版，原版保持原样。');
    } finally {
      syncBlocked.current = false;
    }
  }
  function exportNotes() {
    download(
      filteredNotes
        .map(
          (n) =>
            `# ${n.title}\n\n课程：${n.course} · 章节：${n.chapter || '未分类'}\n标签：${(n.tags ?? []).join('、')}\n下次复习：${n.reviewAt || '未安排'}\n\n${n.text}\n\n${(n.sources ?? []).map((s) => `> ${s.name} · ${s.section}\n> ${s.quote}\n`).join('\n')}\n---`,
        )
        .join('\n\n'),
      `知识笔记-${localDate()}.md`,
    );
  }
  function startReview(ids = dueNotes.map((n) => n.id)) {
    setReviewQueue(ids);
    setReviewIndex(0);
    setReviewCorrect(0);
    setReviewAnswer('');
    setReviewRevealed(false);
    go('review');
  }
  function gradeReview(correct: boolean) {
    if (!reviewNote) return;
    const patch = scheduleReview(reviewNote, correct);
    setNotes((current) =>
      current.map((n) => (n.id === reviewNote.id ? { ...n, ...patch } : n)),
    );
    setReviewIndex((i) => i + 1);
    setReviewCorrect((c) => c + (correct ? 1 : 0));
    setReviewAnswer('');
    setReviewRevealed(false);
  }
  function openNote(note: Note, preserveCollection = false) {
    if (note.deletedAt) return;
    setNotes((current) =>
      current.map((n) =>
        n.id === note.id ? { ...n, lastOpenedAt: new Date().toISOString() } : n,
      ),
    );
    go('knowledge', {
      note: note.id,
      ...(preserveCollection
        ? { filter: noteCourse, collection: noteCollection }
        : {}),
    });
  }
  function toggleStar(note: Note) {
    setNotes((current) =>
      current.map((n) =>
        n.id === note.id ? { ...n, starred: !n.starred } : n,
      ),
    );
  }
  function moveNoteToTrash() {
    if (!pendingDeleteNote) return;
    const id = pendingDeleteNote.id;
    setNotes((current) =>
      current.map((n) =>
        n.id === id ? { ...n, deletedAt: new Date().toISOString() } : n,
      ),
    );
    setPendingDeleteNote(null);
    if (selectedNoteId === id) go('knowledge');
    setToast('笔记已移入回收站，可以从左侧回收站恢复。');
  }
  function restoreNote(note: Note) {
    setNotes((current) =>
      current.map((n) =>
        n.id === note.id ? { ...n, deletedAt: undefined } : n,
      ),
    );
    setToast(`已恢复「${note.title}」及其关联。`);
  }
  function moveCourseToTrash() {
    if (!pendingDeleteCourse) return;
    const id = pendingDeleteCourse.id;
    setCourses((current) => trashCourse(current, id));
    if (activeCourse.id === id) {
      setActiveCourseId(courses.find((course) => course.id !== id)?.id ?? '');
      setActiveSessionId('');
    }
    setPendingDeleteCourse(null);
    setReviewQueue(null);
    setSelectedNoteId('');
    setDraftOpen(false);
    go('home');
    setToast('课程已移入回收站，资料、笔记和复习计划均已保留。');
  }
  const noteOwner = (note: Note) =>
    allCourses.find(
      (c) =>
        c.id === note.courseId || (!note.courseId && c.name === note.course),
    );
  const noteRows = (items: Note[]) =>
    items.map((note) => (
      <button className="list-row" key={note.id} onClick={() => openNote(note)}>
        <BookOpen size={18} />
        <span>
          <strong>{note.title}</strong>
          <small>
            {noteOwner(note)?.name ?? note.course} · {note.chapter || '未分类'}
          </small>
        </span>
        <ChevronRight size={17} />
      </button>
    ));
  function evidenceList(items: Evidence[], label = '引用原文') {
    return items.length > 0 ? (
      <div className="evidence-list">
        <small>{label} · 点击核对，引用关联不等于结论已验证</small>
        {items.map((item) => (
          <button
            key={`${item.id}-${item.fileId ?? item.name}`}
            onClick={() => setSource(item)}
          >
            <FileText size={15} />
            <span>
              [{item.id}] {item.name} · {item.section}
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    ) : null;
  }
  function materialPicker() {
    return (
      <details
        open={scopeOpen}
        onToggle={(e) => setScopeOpen(e.currentTarget.open)}
        className="scope-picker"
      >
        <summary>
          <FileText size={16} />
          回答范围：
          {scope === 'all'
            ? '全部课程'
            : scope === 'custom'
              ? '自选资料'
              : activeCourse.name}{' '}
          · {contextMaterials.length} 份可读取资料
        </summary>
        <div className="scope-content">
          <label>
            资料范围
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="course">当前课程可读取资料</option>
              <option value="all">全部课程可读取资料</option>
              <option value="custom">勾选具体资料</option>
            </select>
          </label>
          {scope === 'custom' && (
            <div className="file-checks">
              {readable.map((m) => (
                <label key={materialKey(m)}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(materialKey(m))}
                    onChange={(e) =>
                      setSelectedFiles((current) =>
                        e.target.checked
                          ? [...current, materialKey(m)]
                          : current.filter((id) => id !== materialKey(m)),
                      )
                    }
                  />
                  <span>
                    {m.name}
                    <small>
                      {m.courseName} · {coverageLabel(m)}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="muted">
            按关键词匹配正文；概览问题会选取代表片段，不代表逐页阅读全文。扫描版
            PDF 尚未自动识别，可截取需要的一页添加到提问中。
          </p>
          {contextMaterials.some(
            (m) => !m.coverage || m.coverage.truncated,
          ) && (
            <p className="notice">
              包含覆盖范围未知或仅部分提取的资料，请在资料页检查。
            </p>
          )}
        </div>
      </details>
    );
  }
  function homeView() {
    const recent = courses
      .flatMap((c) => c.sessions.map((session) => ({ ...session, course: c })))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const latest = recent[0];
    const todayTasks = visibleReviewPlans
      .filter((plan) => !plan.deletedAt)
      .flatMap((plan) => plan.tasks.map((task) => ({ task, plan })))
      .filter(({ task }) => task.date <= localDate() && !task.done)
      .sort((a, b) => a.task.date.localeCompare(b.task.date));
    const resumeTitle =
      latest && /^(你好[！!。]?|介绍|新对话|未命名)$/.test(latest.title.trim())
        ? `${latest.course.name} · 最近对话`
        : latest?.title;
    return (
      <div className="home-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {localDate()} · {preferences.semester}
            </p>
            <h1>
              今天，先学一点点<span className="heading-dot">。</span>
            </h1>
            <p className="muted">把零散的理解，慢慢变成自己的知识。</p>
          </div>
          <button
            className="home-plan-entry"
            onClick={() => {
              setReviewQueue(null);
              go('review');
            }}
          >
            <CalendarDays size={17} />
            制定复习计划
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="home-overview">
          <span>
            <strong>{courses.length}</strong> 门正在学习的课
          </span>
          <span>
            <strong>{notes.length}</strong> 篇积累的笔记
          </span>
          <span>
            <strong>
              {visibleReviewPlans.filter((plan) => !plan.deletedAt).length}
            </strong>{' '}
            份复习计划
          </span>
          <span className="home-overview-tip">按自己的节奏，一步一步来</span>
        </div>
        <LearningNext
          courses={courses}
          onRead={(c) =>
            go('materials', {
              course: c.id,
              file: c.reading?.fileId ?? c.reading?.name,
            })
          }
          onPractice={(c, question) => go('lab', { course: c.id, question })}
        />
        <section className="study-focus">
          <div className="resume">
            <span className="eyebrow">
              <span className="course-dot" />
              {latest?.course.name ?? '开始学习'}
            </span>
            <h2>{resumeTitle ? `继续：${resumeTitle}` : '带着一个问题开始'}</h2>
            <p>
              {latest
                ? `最近学习于 ${timeLabel(latest.updatedAt)}`
                : '选一门课程，上传资料，记下你的第一个问题。'}
            </p>
            <button
              className="primary"
              onClick={() =>
                latest
                  ? go('study', {
                      course: latest.course.id,
                      session: latest.id,
                    })
                  : courses.length
                    ? go('materials', { course: activeCourse.id })
                    : setNewCourseOpen(true)
              }
            >
              {latest
                ? '继续学习'
                : courses.length
                  ? '上传第一份资料'
                  : '添加第一门课程'}
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="review-callout">
            <h2>
              <CalendarDays size={21} />
              {dueNotes.length
                ? `${dueNotes.length} 条待复习`
                : '今天没有到期笔记'}
            </h2>
            <p>
              {dueNotes.length
                ? '先回忆，再看解析。'
                : '也可以选择笔记，自由练习。'}
            </p>
            <button
              className="text-button"
              onClick={() => (dueNotes.length ? startReview() : go('review'))}
            >
              {dueNotes.length ? '开始回忆' : '查看复习'}
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
        <div className="section-heading">
          <h2 id="my-courses">我的课程</h2>
          <button
            className="text-button"
            onClick={() => setNewCourseOpen(true)}
          >
            <Plus size={16} />
            添加课程
          </button>
        </div>
        <div className="course-grid">
          {courses.map((course, index) => (
            <article
              className={`course-card course-theme-${index % 4}`}
              key={course.id}
            >
              <div className="course-card-top">
                <span className="course-emblem">
                  <BookOpen size={21} />
                </span>
                <span className="course-card-code">
                  {course.code ||
                    `COURSE ${String(index + 1).padStart(2, '0')}`}
                </span>
                <button
                  className="icon-button delete-note-button"
                  aria-label={`删除课程：${course.name}`}
                  onClick={() => setPendingDeleteCourse(course)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <h3>{course.name}</h3>
              <p>
                {course.materials.filter((m) => m.fileId).length} 份资料 ·{' '}
                {
                  notes.filter(
                    (n) =>
                      n.courseId === course.id ||
                      (!n.courseId && n.course === course.name),
                  ).length
                }{' '}
                条笔记
              </p>
              <div className="course-mastery">
                <div>
                  <span>知识积累</span>
                  <span>
                    {
                      notes.filter(
                        (note) =>
                          belongsToCourse(note, course) &&
                          note.mastery === '已掌握',
                      ).length
                    }{' '}
                    篇已掌握
                  </span>
                </div>
                <progress
                  aria-label={`${course.name}笔记掌握进度`}
                  max={Math.max(
                    1,
                    notes.filter((note) => belongsToCourse(note, course))
                      .length,
                  )}
                  value={
                    notes.filter(
                      (note) =>
                        belongsToCourse(note, course) &&
                        note.mastery === '已掌握',
                    ).length
                  }
                />
              </div>
              <div className="actions">
                <button
                  className="text-button"
                  onClick={() =>
                    go('course', {
                      course: course.id,
                      session: course.sessions[0]?.id,
                    })
                  }
                >
                  进入学习
                  <ChevronRight size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`管理${course.name}资料`}
                  onClick={() => go('materials', { course: course.id })}
                >
                  <FileText size={17} />
                </button>
              </div>
            </article>
          ))}
          {!courses.length && (
            <div className="empty no-courses">
              <BookOpen size={26} />
              <h3>新的学习，从这里开始</h3>
              <p>课程删除后可以在回收站恢复。</p>
              <button onClick={() => setNewCourseOpen(true)}>
                <Plus size={16} />
                添加课程
              </button>
            </div>
          )}
        </div>
        <div className="home-bottom-grid">
          <section className="recent-notes">
            <div className="section-heading">
              <h2>最近笔记</h2>
              <button className="text-button" onClick={() => go('knowledge')}>
                全部笔记
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="list-panel">
              {notes.length ? (
                noteRows(
                  [...notes]
                    .sort((a, b) =>
                      (b.updatedAt ?? b.createdAt).localeCompare(
                        a.updatedAt ?? a.createdAt,
                      ),
                    )
                    .slice(0, 4),
                )
              ) : (
                <p className="empty">
                  还没有笔记。在问答中保存解释，或直接新建。
                </p>
              )}
            </div>
          </section>
          <section className="home-agenda">
            <div className="section-heading">
              <h2>今日安排</h2>
              <span className="agenda-count">{todayTasks.length}</span>
            </div>
            {todayTasks.slice(0, 3).map(({ task, plan }) => (
              <button
                className="agenda-task"
                key={task.id}
                onClick={() => {
                  setReviewQueue(null);
                  go('review');
                }}
              >
                <span className="agenda-dot" />
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {
                      courses.find((course) => course.id === plan.courseId)
                        ?.name
                    }{' '}
                    · {task.date < localDate() ? '待补安排' : '今天'} ·{' '}
                    {task.minutes} 分钟
                  </small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {!todayTasks.length && (
              <div className="agenda-empty">
                <Clock3 size={25} />
                <p>给重要的知识留一点时间</p>
                <small>安排一次复习，让学过的内容更牢靠。</small>
              </div>
            )}
            <button
              className="text-button"
              onClick={() => {
                setReviewQueue(null);
                go('review');
              }}
            >
              {todayTasks.length ? '查看完整计划' : '制定第一份计划'}
              <ArrowUpRight size={15} />
            </button>
          </section>
        </div>
      </div>
    );
  }
  function courseView() {
    return (
      <div className="course-overview-page">
        <LearningNext
          courses={[activeCourse]}
          onRead={(c) =>
            go('materials', {
              course: c.id,
              file: c.reading?.fileId ?? c.reading?.name,
            })
          }
          onPractice={(c, question) => go('lab', { course: c.id, question })}
        />
        <CourseGuidePanel
          key={activeCourse.id}
          courseName={activeCourse.name}
          guide={activeCourse.guide}
          model={model}
          initialChapterId={guideChapterId}
          canGenerate={!syncError && syncStatus !== 'offline'}
          materials={
            activeCourse.studyLab?.calibration
              ? materials.filter((m) =>
                  activeCourse.studyLab!.calibration!.materialKeys.includes(
                    materialKey(m),
                  ),
                )
              : materials
          }
          onSource={setSource}
          onSaveLesson={(id, lesson, expectedSourceKey) =>
            saveChapterLesson(activeCourse.id, id, lesson, expectedSourceKey)
          }
          onAsk={askFromGuide}
          onEdit={() => setGuideEditorId(activeCourse.id)}
          onUpload={() => go('materials')}
          onCreateNote={noteFromGuide}
          onDelete={() =>
            setPendingRemoval({
              kind: 'guide',
              title: `${activeCourse.name} · 课程导览`,
              courseId: activeCourse.id,
            })
          }
        />
        <details className="course-settings-details">
          <summary>
            <Settings2 size={17} />
            章节组织与课程设置<span>资料归类、教师、学期与考试日期</span>
          </summary>
          <div className="two-columns course-settings">
            <section className="panel">
              <h2>章节组织</h2>
              <p className="muted">按课程章节归类资料和笔记。</p>
              {activeChapters.map((chapter) => (
                <div className="chapter-row" key={chapter}>
                  <strong>{chapter}</strong>
                  <div className="actions">
                    <button
                      onClick={() => {
                        go('materials');
                        setMaterialChapter(chapter);
                      }}
                    >
                      资料{' '}
                      {materials.filter((m) => m.chapter === chapter).length}
                    </button>
                    <button
                      onClick={() => {
                        go('knowledge', { filter: activeCourse.id });
                        setNoteChapter(chapter);
                      }}
                    >
                      笔记{' '}
                      {courseNotes.filter((n) => n.chapter === chapter).length}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`删除章节：${chapter}`}
                      onClick={() =>
                        setPendingRemoval({
                          kind: 'chapter',
                          title: chapter,
                          courseId: activeCourse.id,
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {!activeChapters.length && (
                <p className="empty">还没有章节，例如“第一章 · 线性空间”。</p>
              )}
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    newChapter.trim() &&
                    !activeChapters.includes(newChapter.trim())
                  ) {
                    updateCourse(activeCourse.id, (c) => ({
                      ...c,
                      chapters: [...(c.chapters ?? []), newChapter.trim()],
                    }));
                    setNewChapter('');
                  }
                }}
              >
                <input
                  aria-label="新章节名称"
                  placeholder="添加章节"
                  value={newChapter}
                  onChange={(e) => setNewChapter(e.target.value)}
                  required
                />
                <button type="submit">
                  <Plus size={17} />
                  添加
                </button>
              </form>
            </section>
            <section className="panel form-stack">
              <h2>课程信息</h2>
              <label>
                课程名称
                <input
                  value={activeCourse.name}
                  onChange={(e) =>
                    updateCourse(activeCourse.id, (c) => ({
                      ...c,
                      name: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                课程编号
                <input
                  value={activeCourse.code}
                  placeholder="例如 MA201"
                  onChange={(e) =>
                    updateCourse(activeCourse.id, (c) => ({
                      ...c,
                      code: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                授课教师
                <input
                  value={activeCourse.teacher ?? ''}
                  onChange={(e) =>
                    updateCourse(activeCourse.id, (c) => ({
                      ...c,
                      teacher: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                开课学期
                <input
                  value={activeCourse.semester ?? preferences.semester}
                  onChange={(e) =>
                    updateCourse(activeCourse.id, (c) => ({
                      ...c,
                      semester: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                考试日期
                <input
                  type="date"
                  value={activeCourse.examDate ?? ''}
                  onChange={(e) =>
                    updateCourse(activeCourse.id, (c) => ({
                      ...c,
                      examDate: e.target.value,
                    }))
                  }
                />
              </label>
              <small className="muted">修改后自动保存</small>
            </section>
          </div>
        </details>
        <CourseRecycleBin
          name={activeCourse.name}
          items={courseTrashItems(
            allCourses.find((course) => course.id === activeCourse.id)!,
          )}
        />
      </div>
    );
  }
  function labTools(mode: 'calibration' | 'benchmark') {
    return (
      <StudyLab
        key={`${activeCourse.id}-${mode}`}
        mode={mode}
        course={activeCourse}
        model={model}
        disabled={!!syncError || syncStatus === 'offline'}
        onChange={(studyLab) =>
          updateCourse(activeCourse.id, (c) => ({ ...c, studyLab }))
        }
        onSource={setSource}
        onChapter={(chapter) =>
          go('course', { course: activeCourse.id, chapter })
        }
        onAsk={askFromGuide}
        onAddChapter={(chapter) =>
          updateCourse(activeCourse.id, (c) =>
            c.guide &&
            c.guide.chapters.length < 16 &&
            !c.guide.chapters.some((ch) => ch.title === chapter.title)
              ? {
                  ...c,
                  guide: {
                    ...c.guide,
                    updatedAt: new Date().toISOString(),
                    chapters: [...c.guide.chapters, chapter],
                  },
                }
              : c,
          )
        }
        onPracticePlan={(plan, studyLab) => {
          setReviewPlans((current) =>
            current.some((p) => p.id === plan.id)
              ? current
              : [...current, plan],
          );
          setCourses((current) =>
            current.map((c) =>
              c.id === activeCourse.id ? { ...c, studyLab } : c,
            ),
          );
          setToast('已加入复习计划，可修改日期与任务。');
        }}
        onPlan={(plan, check) => {
          setReviewPlans((current) =>
            current.some((p) => p.id === plan.id)
              ? current
              : [...current, plan],
          );
          updateCourse(activeCourse.id, (c) => ({
            ...c,
            studyLab: {
              ...c.studyLab,
              checks: c.studyLab?.checks?.map((item) =>
                item.id === check.id ? { ...item, planId: plan.id } : item,
              ),
            },
          }));
          setToast('自测后的复习安排已保存。');
        }}
      />
    );
  }
  function materialsView() {
    const visible = materials.filter(
      (m) =>
        (!materialChapter || m.chapter === materialChapter) &&
        m.name.toLowerCase().includes(materialQuery.toLowerCase()),
    );
    return (
      <>
        <details className="material-library panel" open={!currentMaterial}>
          <summary>选择或上传教材 · {materials.length} 份</summary>
          <div className="toolbar">
            <div className="search">
              <Search size={17} />
              <input
                aria-label="搜索资料"
                placeholder="搜索资料名称"
                value={materialQuery}
                onChange={(e) => setMaterialQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="资料章节"
              value={materialChapter}
              onChange={(e) => setMaterialChapter(e.target.value)}
            >
              <option value="">全部章节</option>
              {[
                ...new Set([
                  ...activeChapters,
                  ...materials.map((m) => m.chapter).filter(Boolean),
                ]),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label
              className={`button primary upload ${uploadProgress ? 'disabled' : ''}`}
            >
              <Upload size={17} />
              上传资料
              <input
                disabled={!!uploadProgress}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp"
                onChange={addMaterials}
              />
            </label>
          </div>
          <p className="muted small">
            支持 PDF、DOCX、TXT、Markdown，每份不超过 20 MB。最多提取 40
            万字符或 500 页，超出部分会明确标注。
          </p>
          {uploadProgress && (
            <output className="notice">
              <LoaderCircle size={16} className="spin" />
              {uploadProgress}
            </output>
          )}
          {uploadError && (
            <p className="error" role="alert">
              {uploadError}
            </p>
          )}

          <section className="panel list-panel">
            <div className="panel-heading">
              <h2>资料</h2>
              <span>{visible.length} 份</span>
            </div>
            {visible.map((m) => (
              <div
                className={`material-row ${materialKey(m) === materialKey(currentMaterial ?? m) ? 'selected' : ''}`}
                key={materialKey(m)}
              >
                <button
                  onClick={() => {
                    setSelectedMaterialId(materialKey(m));
                    setReadingTab('read');
                    updateCourse(activeCourse.id, (c) => ({
                      ...c,
                      reading: {
                        fileId: m.fileId,
                        name: m.name,
                        passage:
                          c.reading &&
                          (c.reading.fileId
                            ? c.reading.fileId === m.fileId
                            : c.reading.name === m.name)
                            ? c.reading.passage
                            : 0,
                        updatedAt: new Date().toISOString(),
                      },
                    }));
                    history.replaceState(
                      null,
                      '',
                      `#${new URLSearchParams({ view: 'materials', course: activeCourse.id, file: materialKey(m) })}`,
                    );
                  }}
                >
                  <FileText size={20} />
                  <span>
                    <strong>{m.name}</strong>
                    <small>
                      {m.chapter || '未分类'} · {m.size}
                    </small>
                    <small
                      className={
                        m.coverage?.truncated || !m.coverage
                          ? 'warning-text'
                          : ''
                      }
                    >
                      {coverageLabel(m)}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`移除 ${m.name}`}
                  onClick={() => setPendingDelete(m)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!visible.length && (
              <div className="empty">
                <FileText size={28} />
                <h3>
                  {materials.length ? '没有匹配的资料' : '先添加一份课堂资料'}
                </h3>
                <p>
                  {materials.length
                    ? '试试其他名称或章节。'
                    : '上传后可在这里阅读，并带着原文向 AI 提问。'}
                </p>
              </div>
            )}
          </section>
        </details>
        {currentMaterial ? (
          <MaterialReader
            key={materialKey(currentMaterial)}
            material={currentMaterial}
            position={activeCourse.reading}
            chapters={activeChapters}
            disabled={!!syncError || syncStatus === 'offline'}
            uploading={!!uploadProgress}
            scanning={scanActive}
            onPosition={(reading) =>
              updateCourse(activeCourse.id, (c) => ({ ...c, reading }))
            }
            onAsk={(prompt) => {
              if (isSending) {
                setToast('请等待当前回答完成，或先停止生成。');
                return;
              }
              setReadingChat(true);
              setReadingTab('chat');
              setActiveSessionId('');
              setScope('custom');
              setSelectedFiles([materialKey(currentMaterial)]);
              setQuestion(prompt);
            }}
            onNote={(text, evidence) => {
              if (draftNote) {
                setDraftOpen(true);
                setToast('请先保存或处理已有草稿，再添加选段笔记。');
                return;
              }
              setDiscardDraft(false);
              setDraftOrigin(null);
              setDraftOpen(true);
              setDraftNote({
                id: crypto.randomUUID(),
                title: `${currentMaterial.name} · ${evidence.section}`.slice(
                  0,
                  100,
                ),
                text,
                course: activeCourse.name,
                courseId: activeCourse.id,
                createdAt: localDate(),
                chapter: currentMaterial.chapter ?? '',
                tags: [],
                sources: [evidence],
              });
            }}
            onReparse={() => void reparse(currentMaterial)}
            onScan={() => void recognizeMaterial(currentMaterial)}
            onStopScan={() => scanAbort.current?.abort()}
            onChapter={(chapter) =>
              updateCourse(activeCourse.id, (c) => ({
                ...c,
                materials: c.materials.map((m) =>
                  materialKey(m) === materialKey(currentMaterial)
                    ? { ...m, chapter }
                    : m,
                ),
              }))
            }
            onCorrect={(passages) =>
              updateCourse(activeCourse.id, (c) => ({
                ...c,
                materials: c.materials.map((m) =>
                  materialKey(m) === materialKey(currentMaterial)
                    ? {
                        ...m,
                        passages,
                        content: undefined,
                        status: '已人工校正',
                        coverage: {
                          ...m.coverage,
                          characters: passages.reduce(
                            (n, p) => n + p.text.length,
                            0,
                          ),
                          truncated: m.coverage?.truncated ?? false,
                        },
                      }
                    : m,
                ),
              }))
            }
          />
        ) : (
          <section className="panel empty">
            上传资料后，在这里阅读原文。
          </section>
        )}
      </>
    );
  }
  function studyView() {
    const messages = activeSession?.messages ?? [];
    const learningContext = activeSession?.learningContext;
    const sourceChapterExists = activeCourse.guide?.chapters.some(
      (chapter) => chapter.id === learningContext?.chapterId,
    );
    return (
      <div className="study-layout">
        <aside className="panel sessions">
          <div className="panel-heading">
            <h2>对话</h2>
            <button
              className="icon-button"
              aria-label="新建对话"
              onClick={newSession}
              disabled={isSending || isImageUploading}
            >
              <Plus size={18} />
            </button>
          </div>
          {[...activeCourse.sessions]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((session) => (
              <div
                className={`session-item ${session.id === activeSessionId ? 'selected' : ''}`}
                key={session.id}
              >
                <button
                  className="session-row"
                  disabled={isSending || isImageUploading}
                  onClick={() => go('study', { session: session.id })}
                >
                  <span>{session.title}</span>
                  <small>{timeLabel(session.updatedAt)}</small>
                </button>
                <button
                  className="icon-button session-delete"
                  disabled={isSending}
                  aria-label={`删除对话：${session.title}`}
                  onClick={() =>
                    setPendingRemoval({
                      kind: 'session',
                      title: session.title,
                      courseId: activeCourse.id,
                      sessionId: session.id,
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          {!activeCourse.sessions.length && (
            <p className="empty">你的学习对话会保存在这里。</p>
          )}
          <small className="session-trash-hint">
            删除的对话可从左侧回收站恢复。
          </small>
        </aside>
        <section className="panel conversation">
          <div className="conversation-heading">
            <h2>{activeSession?.title ?? '问一个你想弄懂的问题'}</h2>
            <button onClick={() => go('materials')}>查看资料</button>
          </div>
          {learningContext && (
            <aside className="lesson-chat-context">
              <div>
                <BookOpen size={17} />
                <span>
                  <small>围绕课程讲解提问</small>
                  <strong>
                    {learningContext.chapterTitle}
                    {learningContext.concept
                      ? ` · ${learningContext.concept}`
                      : ''}
                  </strong>
                </span>
                {sourceChapterExists && (
                  <button
                    onClick={() =>
                      go('course', {
                        course: activeCourse.id,
                        chapter: learningContext.chapterId,
                      })
                    }
                  >
                    回到本章
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
              <details>
                <summary>查看本次对话引用的讲解</summary>
                <Markdown text={learningContext.text} />
                <small>
                  保留的是开始提问时的内容，后续修改或删除章节不影响这段对话。
                </small>
              </details>
            </aside>
          )}
          {materialPicker()}
          <div className="messages">
            {!messages.some((message) => !message.deletedAt) && (
              <div className="chat-empty">
                <Bot size={32} />
                <h2>
                  {learningContext
                    ? '带着这段讲解继续问'
                    : contextMaterials.length
                      ? '从资料里的一个问题开始'
                      : '先添加资料，或直接提问'}
                </h2>
                <p>
                  {learningContext
                    ? '相关讲解已带入。可以修改下方的问题，点击发送后开始对话；对话只保存在问答中。'
                    : contextMaterials.length
                      ? '解释会附上可核对的原文片段。你可以选中回答中的关键内容，保存成笔记。'
                      : '没有原文依据时，回答会按通用知识说明。'}
                </p>
                <div className="prompt-list">
                  {[
                    '这个概念的直观含义是什么？',
                    '帮我比较两个容易混淆的概念',
                    '根据资料生成 3 道练习题，答案放在最后',
                  ].map((t) => (
                    <button key={t} onClick={() => setQuestion(t)}>
                      {t}
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(
              (message, index) =>
                !message.deletedAt && (
                  <article className={`message ${message.role}`} key={index}>
                    <div className="message-label">
                      {message.role === 'assistant'
                        ? '课伴'
                        : preferences.userName}
                      <button
                        className="icon-button message-delete"
                        disabled={isSending}
                        aria-label={`删除第${index + 1}条消息`}
                        onClick={() =>
                          setPendingRemoval({
                            kind: 'message',
                            title: message.text.slice(0, 60),
                            courseId: activeCourse.id,
                            sessionId: activeSession!.id,
                            index,
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {!!message.images?.length && (
                      <div className="chat-image-gallery">
                        {message.images.map((image) => (
                          <a
                            key={image.fileId}
                            href={`/api/files?id=${encodeURIComponent(image.fileId)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Image
                              unoptimized
                              width={240}
                              height={180}
                              src={`/api/files?id=${encodeURIComponent(image.fileId)}`}
                              alt={image.name}
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <Markdown text={message.text} />
                    {message.role === 'assistant' && (
                      <>
                        {message.scope && (
                          <small className="scope-result">
                            {message.scope.lessonTitle &&
                              `围绕「${message.scope.lessonTitle}」讲解回答。`}
                            {!!message.scope.imageCount &&
                              `已读取 ${message.scope.imageCount} 张图片。`}
                            从 {message.scope.selected} 份资料中选取：
                            {message.scope.matchedFiles} 份文件、
                            {message.scope.passages} 段原文。
                          </small>
                        )}
                        {evidenceList(message.evidence ?? [])}
                        {!message.evidence?.length && message.scope && (
                          <p className="muted small">
                            {message.scope.imageCount
                              ? '图片可能有识别误差，请对照原图核对。'
                              : message.scope.lessonTitle
                                ? '章节讲解是学习草稿，关键结论请结合授课教材核对。'
                                : '本次回答没有可定位的引用，请结合原文核对。'}
                          </p>
                        )}
                        {!!message.sources?.length && (
                          <p className="notice">
                            旧会话引用未经核验：{message.sources.join('；')}
                          </p>
                        )}
                        {!!message.retrieved?.length && (
                          <details className="retrieved">
                            <summary>查看本次提供给 AI 的片段</summary>
                            {evidenceList(message.retrieved, '检索片段')}
                          </details>
                        )}
                        <div className="message-actions">
                          {message.scope?.retrieval && (
                            <small>{message.scope.retrieval}</small>
                          )}
                          {message.scope?.truncated && (
                            <small>
                              达到长度限制，回答可能未完成，可继续追问。
                            </small>
                          )}
                          <button onClick={() => startNote(message, index)}>
                            <Save size={16} />
                            {message.saved ? '再次摘录' : '摘录为笔记'}
                          </button>
                          <button
                            onClick={() =>
                              setQuestion('请给出一个直观例子，逐步解释。')
                            }
                          >
                            举个例子
                          </button>
                          <button
                            onClick={() =>
                              setQuestion(
                                '请根据刚才的内容出一道题，先不要给答案。',
                              )
                            }
                          >
                            考考我
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ),
            )}
            {isSending &&
              streamTarget === `${activeCourse.id}/${activeSessionId}` && (
                <article
                  className="message assistant stream-preview"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <div className="stream-state">
                    <LoaderCircle className="spin" size={16} />
                    <span>{streamStatus}</span>
                    <button onClick={() => chatController.current?.abort()}>
                      停止生成
                    </button>
                  </div>
                  {streamText && <Markdown text={streamText} />}
                </article>
              )}
            {isSending &&
              streamTarget !== `${activeCourse.id}/${activeSessionId}` && (
                <output className="notice">
                  <LoaderCircle className="spin" size={16} />
                  另一段对话仍在生成。
                  <button onClick={() => chatController.current?.abort()}>
                    停止生成
                  </button>
                </output>
              )}
            <div ref={chatEndRef} />
          </div>
          {chatError && (
            <p className="error" role="alert">
              {chatError} 提问已保留在当前对话中。
            </p>
          )}
          <form className="composer" onSubmit={submitQuestion}>
            <input
              ref={imageInput}
              type="file"
              hidden
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={addQuestionImages}
            />
            {!!questionImages.length && (
              <div className="chat-image-attachments">
                {questionImages.map((image) => (
                  <div key={image.fileId}>
                    <Image
                      unoptimized
                      width={90}
                      height={64}
                      src={`/api/files?id=${encodeURIComponent(image.fileId)}`}
                      alt={image.name}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`移除图片：${image.name}`}
                      onClick={() =>
                        setQuestionImages((current) =>
                          current.filter(
                            (item) => item.fileId !== image.fileId,
                          ),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="semantic-toggle">
              <input
                type="checkbox"
                checked={semanticSearch}
                disabled={isSending}
                onChange={(e) => setSemanticSearch(e.target.checked)}
              />
              AI 语义改写检索 · 有资料时增加一次短请求，可关闭
            </label>
            <textarea
              aria-label="学习问题"
              placeholder="输入问题，Ctrl + Enter 发送"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void submitQuestion();
                }
              }}
              rows={3}
            />
            <div>
              <small>
                {isImageUploading
                  ? '正在保存图片…'
                  : questionImages.length
                    ? `${questionImages.length} 张图片 · 发送后由视觉模型读取`
                    : learningContext
                      ? '已带上相关讲解 · 对话保存在问答中'
                      : contextMaterials.length
                        ? '带原文片段回答'
                        : '当前无可读取资料 · 通用知识问答'}
              </small>
              <button
                type="button"
                className="icon-button"
                aria-label="添加图片提问"
                title={
                  aiSettings?.models.find((option) => option.id === model)
                    ?.vision
                    ? '添加图片（最多 3 张，每张 5 MB）'
                    : '当前模型不支持图片'
                }
                disabled={
                  isSending ||
                  isImageUploading ||
                  !aiSettings?.models.find((option) => option.id === model)
                    ?.vision
                }
                onClick={() => imageInput.current?.click()}
              >
                <ImagePlus size={19} />
              </button>
              <button
                className="primary"
                disabled={
                  (!question.trim() && !questionImages.length) ||
                  isSending ||
                  isImageUploading
                }
              >
                <Send size={17} />
                {isSending ? '回答中' : '发送'}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }
  function knowledgeView() {
    const collectionNotes = noteCollection === 'trash' ? deletedNotes : notes;
    const chapterOptions = [
        ...new Set(
          collectionNotes
            .filter((n) => noteCourse === 'all' || n.courseId === noteCourse)
            .map((n) => n.chapter)
            .filter(Boolean),
        ),
      ],
      tagOptions = [
        ...new Set(
          collectionNotes.flatMap((n) => n.tags ?? []).filter(Boolean),
        ),
      ];
    return (
      <>
        {!selectedNote && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">你的课程，慢慢连成体系</p>
                <h1>{noteCollection === 'trash' ? '回收站' : '我的知识库'}</h1>
                <p className="muted">
                  {noteCollection === 'trash'
                    ? `${deletedCourses.length} 门课程 · ${deletedNotes.length} 篇笔记 · ${managedTrashCount} 项课程内容 · 随时可以恢复`
                    : `${notes.length} 篇笔记 · ${courses.length} 门课程 · ${dueNotes.length} 篇待复习`}
                </p>
              </div>
              <div className="actions">
                <button onClick={exportNotes} disabled={!filteredNotes.length}>
                  <Download size={17} />
                  导出当前结果
                </button>
                <button className="primary" onClick={() => startNote()}>
                  <Plus size={17} />
                  新建笔记
                </button>
              </div>
            </div>
            <div className="library-collections" aria-label="笔记分类">
              <button
                aria-pressed={noteCollection === 'all'}
                onClick={() => go('knowledge')}
              >
                <FileText size={16} />
                全部笔记<span>{notes.length}</span>
              </button>
              <button
                aria-pressed={noteCollection === 'starred'}
                onClick={() => go('knowledge', { collection: 'starred' })}
              >
                <Star size={16} />
                已收藏<span>{notes.filter((n) => n.starred).length}</span>
              </button>
              {noteCollection === 'trash' && (
                <button aria-pressed="true">
                  <Trash2 size={16} />
                  回收站
                  <span>
                    {deletedNotes.length +
                      deletedCourses.length +
                      managedTrashCount}
                  </span>
                </button>
              )}
              <small>按最近更新排序</small>
            </div>
            <div className="toolbar">
              <div className="search">
                <Search size={17} />
                <input
                  aria-label={
                    noteCollection === 'trash'
                      ? '搜索已删除笔记'
                      : '搜索全部笔记'
                  }
                  placeholder={
                    noteCollection === 'trash'
                      ? '搜索已删除笔记的标题、正文或标签'
                      : '搜索标题、正文、章节或标签'
                  }
                  value={noteQuery}
                  onChange={(e) => setNoteQuery(e.target.value)}
                />
              </div>
              <select
                aria-label="笔记课程范围"
                value={noteCourse}
                onChange={(e) => {
                  setNoteCourse(e.target.value);
                  setNoteChapter('');
                }}
              >
                <option value="all">全部课程</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="笔记章节"
                value={noteChapter}
                onChange={(e) => setNoteChapter(e.target.value)}
              >
                <option value="">全部章节</option>
                {chapterOptions.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                aria-label="笔记标签"
                value={noteTag}
                onChange={(e) => setNoteTag(e.target.value)}
              >
                <option value="">全部标签</option>
                {tagOptions.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={reviewOnly}
                  onChange={(e) => setReviewOnly(e.target.checked)}
                />
                只看到期
              </label>
            </div>
          </>
        )}
        <div
          className={`knowledge-layout ${selectedNote ? 'reading-mode' : 'library-mode'}`}
        >
          {noteCollection === 'trash' && !selectedNote && (
            <section className="panel course-trash">
              <div className="panel-heading">
                <h2>
                  已删除课程{' '}
                  <span className="result-count">{deletedCourses.length}</span>
                </h2>
                <span className="muted">
                  整门恢复，包括资料、对话和复习计划
                </span>
              </div>
              {deletedCourses.map((course) => (
                <div className="course-trash-row" key={course.id}>
                  <span className="course-emblem">
                    <BookOpen size={20} />
                  </span>
                  <div>
                    <strong>{course.name}</strong>
                    <small>
                      {course.materials.length} 份资料 ·{' '}
                      {
                        allNotes.filter((note) => belongsToCourse(note, course))
                          .length
                      }{' '}
                      篇笔记 · {timeLabel(course.deletedAt!)} 删除
                    </small>
                  </div>
                  <button
                    onClick={() => {
                      setCourses((current) =>
                        restoreCourse(current, course.id),
                      );
                      if (!courses.length) setActiveCourseId(course.id);
                      setToast(`已恢复「${course.name}」及其资料和计划。`);
                    }}
                    aria-label={`恢复课程：${course.name}`}
                  >
                    <RotateCcw size={16} />
                    恢复课程
                  </button>
                </div>
              ))}
              {!deletedCourses.length && (
                <p className="muted">没有已删除的课程。</p>
              )}
            </section>
          )}
          {!selectedNote && noteCollection === 'trash' && (
            <div className="managed-trash-list">
              {allCourses
                .filter((course) => !course.deletedAt)
                .map((course) => (
                  <CourseRecycleBin
                    key={course.id}
                    name={course.name}
                    items={courseTrashItems(course)}
                  />
                ))}
            </div>
          )}
          {!selectedNote && (
            <section className="panel note-list">
              <div className="panel-heading">
                <h2>
                  {noteCollection === 'trash'
                    ? '单独删除的笔记'
                    : noteCollection === 'starred'
                      ? '我的收藏'
                      : '笔记'}
                  <span className="result-count">{filteredNotes.length}</span>
                </h2>
              </div>
              {filteredNotes.map((note) => (
                <div className="note-row" key={note.id}>
                  <button
                    className="note-row-open"
                    disabled={!!note.deletedAt}
                    onClick={() => openNote(note, true)}
                  >
                    <span className="note-file-icon">
                      <FileText size={21} />
                    </span>
                    <span className="note-row-content">
                      <small>
                        {noteOwner(note)?.name ?? note.course} /{' '}
                        {note.chapter || '未分类'}
                      </small>
                      <strong>{note.title}</strong>
                      <p>{note.text.replace(/[#*`]/g, '').slice(0, 90)}</p>
                      <div className="tags">
                        {note.tags?.filter(Boolean).map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                      <small>
                        {note.deletedAt
                          ? `${timeLabel(note.deletedAt)} 删除`
                          : `${timeLabel(note.updatedAt ?? note.createdAt)} 更新`}
                        {!note.deletedAt && isDue(note) ? ' · 待复习' : ''}
                      </small>
                    </span>
                  </button>
                  <div className="note-row-actions">
                    {note.deletedAt ? (
                      <button
                        onClick={() => restoreNote(note)}
                        aria-label={`恢复笔记：${note.title}`}
                      >
                        <RotateCcw size={16} />
                        恢复
                      </button>
                    ) : (
                      <>
                        <button
                          className={`icon-button star-button ${note.starred ? 'is-starred' : ''}`}
                          aria-label={`${note.starred ? '取消收藏' : '收藏笔记'}：${note.title}`}
                          aria-pressed={!!note.starred}
                          onClick={() => toggleStar(note)}
                        >
                          <Star size={17} />
                        </button>
                        <button
                          className="icon-button delete-note-button"
                          aria-label={`删除笔记：${note.title}`}
                          onClick={() => setPendingDeleteNote(note)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!filteredNotes.length && (
                <div className="empty">
                  <Search size={26} />
                  <h3>
                    {noteCollection === 'trash' && !deletedNotes.length
                      ? '没有单独删除的笔记'
                      : noteCollection === 'trash'
                        ? '没有匹配的已删除笔记'
                        : noteCollection === 'starred' && !noteQuery
                          ? '把常用笔记留在手边'
                          : notes.length
                            ? '没有匹配的笔记'
                            : '保存第一条知识笔记'}
                  </h3>
                  <p>
                    {noteCollection === 'trash' && !deletedNotes.length
                      ? '删除的笔记会保留在这里，随时可以恢复。'
                      : noteCollection === 'trash'
                        ? '调整课程、章节或搜索条件。'
                        : noteCollection === 'starred'
                          ? '点击笔记旁的星标，就可以从侧边栏快速打开。'
                          : notes.length
                            ? '调整课程、章节或搜索条件。'
                            : '从 AI 回答摘录，或自己写下理解。'}
                  </p>
                  <button
                    onClick={() =>
                      notes.length
                        ? (setNoteQuery(''),
                          setNoteCourse('all'),
                          setNoteChapter(''),
                          setNoteTag(''),
                          setReviewOnly(false),
                          setNoteCollection('all'))
                        : startNote()
                    }
                  >
                    {notes.length ? '查看全部笔记' : '新建笔记'}
                  </button>
                </div>
              )}
            </section>
          )}
          {selectedNote && (
            <section className="panel note-detail">
              {selectedNote ? (
                <>
                  <div className="panel-heading">
                    <div className="note-breadcrumb">
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelectedNoteId('');
                          setEditingNote(false);
                          history.pushState(
                            null,
                            '',
                            `#${new URLSearchParams({ view: 'knowledge', filter: noteCourse, collection: noteCollection })}`,
                          );
                        }}
                      >
                        ← 返回笔记列表
                      </button>
                      <span>
                        {noteOwner(selectedNote)?.name ?? selectedNote.course} /{' '}
                        {selectedNote.chapter || '未分类'}
                      </span>
                    </div>
                    <div className="actions">
                      <button
                        className={`icon-button star-button ${selectedNote.starred ? 'is-starred' : ''}`}
                        aria-label={
                          selectedNote.starred
                            ? '取消收藏当前笔记'
                            : '收藏当前笔记'
                        }
                        aria-pressed={!!selectedNote.starred}
                        onClick={() => toggleStar(selectedNote)}
                      >
                        <Star size={17} />
                      </button>
                      <button onClick={() => setEditingNote(!editingNote)}>
                        {editingNote ? '完成编辑' : '编辑笔记'}
                      </button>
                      <button
                        className="icon-button delete-note-button"
                        aria-label="删除当前笔记"
                        onClick={() => setPendingDeleteNote(selectedNote)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                  {editingNote ? (
                    <div className="form-stack">
                      <label>
                        概念标题
                        <input
                          value={selectedNote.title}
                          onChange={(e) => editNote({ title: e.target.value })}
                        />
                      </label>
                      <label>
                        章节
                        <input
                          list="note-chapters"
                          value={selectedNote.chapter ?? ''}
                          onChange={(e) =>
                            editNote({ chapter: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        标签（用逗号分隔）
                        <input
                          value={(selectedNote.tags ?? []).join(',')}
                          onChange={(e) =>
                            editNote({ tags: e.target.value.split(/[,，]/) })
                          }
                        />
                      </label>
                      <label>
                        复习问题
                        <input
                          placeholder="例如：为什么特征值的代数重数不等于几何重数？"
                          value={selectedNote.reviewQuestion ?? ''}
                          onChange={(e) =>
                            editNote({ reviewQuestion: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        笔记正文
                        <small className="editor-link-hint">
                          用 ## 分节，用 [[笔记名]] 连接已有笔记。
                        </small>
                        <textarea
                          rows={14}
                          value={selectedNote.text}
                          onChange={(e) => editNote({ text: e.target.value })}
                        />
                      </label>
                      <label>
                        关联笔记
                        <select
                          aria-label="添加关联笔记"
                          value=""
                          onChange={(e) => {
                            if (e.target.value)
                              editNote({
                                relatedIds: [
                                  ...new Set([
                                    ...(selectedNote.relatedIds ?? []),
                                    e.target.value,
                                  ]),
                                ],
                              });
                          }}
                        >
                          <option value="">选择相关概念</option>
                          {notes
                            .filter((n) => n.id !== selectedNote.id)
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <>
                      <h2 className="note-title">{selectedNote.title}</h2>
                      <div className="tags">
                        <span>{selectedNote.chapter || '未分类'}</span>
                        {selectedNote.tags?.filter(Boolean).map((t) => (
                          <button
                            key={t}
                            onClick={() => {
                              setSelectedNoteId('');
                              setNoteTag(t);
                            }}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                      <NoteVisuals
                        key={selectedNote.id}
                        note={selectedNote}
                        notes={notes}
                        model={model}
                        onChange={(id, patch) =>
                          setNotes((current) =>
                            current.map((n) =>
                              n.id === id ? { ...n, ...patch } : n,
                            ),
                          )
                        }
                        onOpen={openNote}
                        renderText={(text) => <Markdown text={text} />}
                      />
                    </>
                  )}
                  <details className="note-review-settings">
                    <summary>复习与掌握情况</summary>
                    <button
                      className="text-button"
                      onClick={() => startReview([selectedNote.id])}
                    >
                      复习这条
                      <ChevronRight size={15} />
                    </button>
                    <div className="note-meta">
                      <label>
                        掌握情况
                        <select
                          value={selectedNote.mastery ?? '未掌握'}
                          onChange={(e) =>
                            editNote({ mastery: e.target.value })
                          }
                        >
                          <option>未掌握</option>
                          <option>复习中</option>
                          <option>已掌握</option>
                        </select>
                      </label>
                      <label>
                        下次复习
                        <input
                          type="date"
                          value={selectedNote.reviewAt ?? ''}
                          onChange={(e) =>
                            editNote({ reviewAt: e.target.value })
                          }
                        />
                      </label>
                      <small>
                        自评记录 · 已完成 {selectedNote.reviewCount ?? 0}{' '}
                        次连续正确回忆
                      </small>
                    </div>
                  </details>
                  {evidenceList(selectedNote.sources ?? [])}
                  {selectedNote.sessionId && (
                    <button
                      className="text-button"
                      onClick={() => {
                        const owner = courses.find((c) =>
                          c.sessions.some(
                            (s) => s.id === selectedNote.sessionId,
                          ),
                        );
                        if (owner)
                          go('study', {
                            course: owner.id,
                            session: selectedNote.sessionId,
                          });
                        else setToast('来源会话已不存在，笔记内容仍保留。');
                      }}
                    >
                      回到来源会话
                      <ChevronRight size={16} />
                    </button>
                  )}
                  {editingNote && (
                    <div className="related">
                      <h3>关联概念</h3>
                      {notes
                        .filter(
                          (n) =>
                            selectedNote.relatedIds?.includes(n.id) ||
                            n.relatedIds?.includes(selectedNote.id),
                        )
                        .map((n) => (
                          <div className="actions" key={n.id}>
                            <button
                              className="text-button"
                              onClick={() => openNote(n)}
                            >
                              {n.title}
                              <ChevronRight size={15} />
                            </button>
                            {editingNote &&
                              selectedNote.relatedIds?.includes(n.id) && (
                                <button
                                  className="icon-button"
                                  aria-label={`取消关联 ${n.title}`}
                                  onClick={() =>
                                    editNote({
                                      relatedIds:
                                        selectedNote.relatedIds?.filter(
                                          (id) => id !== n.id,
                                        ),
                                    })
                                  }
                                >
                                  <X size={15} />
                                </button>
                              )}
                          </div>
                        ))}
                      {!selectedNote.relatedIds?.length &&
                        !notes.some((n) =>
                          n.relatedIds?.includes(selectedNote.id),
                        ) && (
                          <p className="muted">编辑笔记时可以关联其他概念。</p>
                        )}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty">选择一条笔记查看内容。</div>
              )}
            </section>
          )}
        </div>
        <datalist id="note-chapters">
          {[...new Set(courses.flatMap((c) => c.chapters ?? []))].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </datalist>
      </>
    );
  }
  function reviewView() {
    if (reviewQueue === null)
      return (
        <ReviewPlanner
          courses={courses}
          notes={notes}
          plans={visibleReviewPlans}
          model={model}
          dueCount={dueNotes.length}
          onChange={(next) =>
            setReviewPlans((current) => [
              ...current.filter(
                (plan) =>
                  !courses.some((course) => course.id === plan.courseId),
              ),
              ...next,
            ])
          }
          onPractice={() =>
            startReview(
              (dueNotes.length ? dueNotes : notes).map((note) => note.id),
            )
          }
          onOpenNote={openNote}
          onOpenQuestion={(course, question) => go('lab', { course, question })}
          onAddCourse={() => setNewCourseOpen(true)}
        />
      );
    return (
      <div className="review-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">先回忆，再核对</p>
            <h1>复习</h1>
          </div>
          <button onClick={() => setReviewQueue(null)}>返回复习计划</button>
        </div>
        {reviewNote ? (
          <section className="panel review-card">
            <div className="review-progress">
              <span>
                第 {reviewIndex + 1} / {reviewQueue.length} 条
              </span>
              <progress max={reviewQueue.length} value={reviewIndex} />
            </div>
            <small className="muted">
              {noteOwner(reviewNote)?.name ?? reviewNote.course} ·{' '}
              {reviewNote.chapter || '未分类'}
            </small>
            <h2>
              {reviewNote.reviewQuestion ||
                `请用自己的话解释「${reviewNote.title}」，并举一个例子。`}
            </h2>
            <label className="answer-label">
              你的回答
              <textarea
                placeholder="先不看笔记，试着回忆…"
                rows={6}
                value={reviewAnswer}
                onChange={(e) => setReviewAnswer(e.target.value)}
                disabled={reviewRevealed}
              />
            </label>
            {!reviewRevealed ? (
              <div className="actions">
                <button
                  className="primary"
                  disabled={!reviewAnswer.trim()}
                  onClick={() => setReviewRevealed(true)}
                >
                  查看笔记解析
                </button>
                <button
                  onClick={() => {
                    setReviewAnswer('暂时想不起来');
                    setReviewRevealed(true);
                  }}
                >
                  想不起来
                </button>
              </div>
            ) : (
              <>
                <div className="review-solution">
                  <h3>笔记解析</h3>
                  <Markdown text={reviewNote.text} />
                  {evidenceList(reviewNote.sources ?? [])}
                </div>
                <p className="muted">对照笔记自行判断；这不是 AI 自动评分。</p>
                <div className="actions">
                  <button onClick={() => gradeReview(false)}>
                    没答对 · 明天再练
                  </button>
                  <button className="primary" onClick={() => gradeReview(true)}>
                    答对了 · 下一条
                    <Check size={17} />
                  </button>
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="panel review-card finished">
            <Check size={36} />
            <h2>本轮复习完成</h2>
            <p>
              完成 {reviewQueue.length} 条，自评答对 {reviewCorrect}{' '}
              条。下次复习日期已自动更新。
            </p>
            <button className="primary" onClick={() => setReviewQueue(null)}>
              回到复习计划
            </button>
          </section>
        )}
      </div>
    );
  }
  const inCourse = ['course', 'lab', 'materials', 'study'].includes(activeView);
  const managedTrashCount = allCourses
    .filter((course) => !course.deletedAt)
    .reduce((sum, course) => sum + courseTrashItems(course).length, 0);
  if (!hydrated)
    return (
      <main className="loading">
        <LoaderCircle className="spin" />
        <p>正在读取你的学习空间…</p>
      </main>
    );
  return (
    <main className="app-shell">
      {mobileNavOpen && (
        <button
          className="mobile-scrim"
          aria-label="关闭导航"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => go('home')}>
          <GraduationCap size={27} />
          <strong>{preferences.brandName}</strong>
        </button>
        <button
          className="sidebar-search"
          onClick={() => {
            setMobileNavOpen(false);
            setShowSearch(true);
          }}
        >
          <Search size={17} />
          <span>快速查找</span>
          <kbd>Ctrl K</kbd>
        </button>
        <nav aria-label="主导航">
          <button
            className={activeView === 'home' ? 'active' : ''}
            onClick={() => go('home')}
          >
            <HomeIcon size={19} />
            今日学习
          </button>
          <button
            onClick={() => {
              go('home');
              requestAnimationFrame(() =>
                document
                  .getElementById('my-courses')
                  ?.scrollIntoView({ block: 'start' }),
              );
            }}
          >
            <BookOpen size={19} />
            我的课程
          </button>
          <button
            className={
              activeView === 'knowledge' && noteCollection !== 'trash'
                ? 'active'
                : ''
            }
            onClick={() => go('knowledge')}
          >
            <Database size={19} />
            全部笔记
          </button>
          <button
            className={activeView === 'review' ? 'active' : ''}
            onClick={() => {
              setReviewQueue(null);
              go('review');
            }}
          >
            <CalendarDays size={19} />
            复习计划
            {dueNotes.length > 0 && (
              <span className="count">{dueNotes.length}</span>
            )}
          </button>
        </nav>
        <details className="sidebar-tools">
          <summary>学习工具</summary>{' '}
          <button
            className={activeView === 'graph' ? 'active' : ''}
            onClick={() => go('graph')}
          >
            <Network size={19} />
            知识图谱
          </button>
        </details>
        <div className="sidebar-heading favorites-heading">
          <span>收藏</span>
          <Star size={14} />
        </div>
        <nav className="favorite-nav" aria-label="收藏笔记">
          {notes
            .filter((n) => n.starred)
            .slice(0, 5)
            .map((note) => (
              <button
                key={note.id}
                className={
                  selectedNoteId === note.id && activeView === 'knowledge'
                    ? 'active'
                    : ''
                }
                onClick={() => openNote(note)}
                title={note.title}
              >
                <FileText size={15} />
                <span>{note.title}</span>
              </button>
            ))}
          {notes.some((n) => n.starred) ? (
            <button
              className="sidebar-more"
              onClick={() => go('knowledge', { collection: 'starred' })}
            >
              查看全部收藏
              <ChevronRight size={14} />
            </button>
          ) : (
            <p className="sidebar-empty">给常用笔记点个星标，下次一眼找到。</p>
          )}
        </nav>
        <div className="sidebar-heading">
          <span>课程</span>
          <button
            className="icon-button"
            aria-label="添加课程"
            onClick={() => setNewCourseOpen(true)}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav className="course-nav" aria-label="课程列表">
          {courses.map((c, index) => (
            <button
              className={inCourse && c.id === activeCourse.id ? 'active' : ''}
              key={c.id}
              onClick={() => {
                setMaterialChapter('');
                setMaterialQuery('');
                go('course', { course: c.id, session: c.sessions[0]?.id });
              }}
            >
              <span className={`course-dot tone-${index % 4}`} />
              <span>{c.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className={
              noteCollection === 'trash' && activeView === 'knowledge'
                ? 'active'
                : ''
            }
            onClick={() => go('knowledge', { collection: 'trash' })}
          >
            <Trash2 size={17} />
            回收站
            {deletedNotes.length + deletedCourses.length + managedTrashCount >
              0 && (
              <span className="trash-count">
                {deletedNotes.length +
                  deletedCourses.length +
                  managedTrashCount}
              </span>
            )}
          </button>
          <button onClick={() => setShowSettings(true)}>
            <Settings2 size={18} />
            设置与备份
          </button>
          {draftNote && (
            <button onClick={() => setDraftOpen(true)}>继续编辑笔记草稿</button>
          )}
          <small>
            {syncStatus === 'saving'
              ? '正在保存…'
              : syncStatus === 'offline'
                ? '有更改尚未保存'
                : '所有更改已保存'}
          </small>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="打开导航"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={21} />
          </button>
          <span>
            {inCourse
              ? activeCourse.name
              : activeView === 'home'
                ? '今日学习'
                : activeView === 'graph'
                  ? '知识图谱'
                  : activeView === 'review'
                    ? '复习计划'
                    : noteCollectionLabel}
          </span>
          <div className="topbar-end">
            <button
              className="topbar-search"
              onClick={() => setShowSearch(true)}
              aria-label="全局搜索（Ctrl K）"
            >
              <Search size={16} />
              <span>搜索笔记与课程</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span>{preferences.userName}</span>
            <button
              className="avatar"
              aria-label="个人设置"
              onClick={() => setShowSettings(true)}
            >
              {preferences.userName.slice(0, 1) || '同'}
            </button>
          </div>
        </header>
        {syncError && (
          <div className="sync-error" role="alert">
            <span>{syncError}</span>
            <button
              onClick={() => {
                if (syncBlocked.current) {
                  setToast('请先下载正文备份，再刷新核对另一窗口的数据。');
                  return;
                }
                setSaveRetry((n) => n + 1);
              }}
            >
              重试保存
            </button>
            {allCourses.some((course) =>
              course.guide?.chapters.some(
                (chapter) => chapter.lesson && !chapter.lesson.deletedAt,
              ),
            ) && (
              <button onClick={() => void syncNewLessons()}>
                同步新生成的讲解
              </button>
            )}
            <button
              onClick={() =>
                download(
                  JSON.stringify(workspaceState, null, 2),
                  `课伴正文备份-${localDate()}.json`,
                  'application/json',
                )
              }
            >
              下载正文备份（不含附件）
            </button>
          </div>
        )}
        <div className="page-stage">
          {welcome && activeView === 'home' && (
            <aside className="version-strip">
              <span>
                <strong>研学增强版</strong> · 从教材出发，练习后安排下一步
              </span>
              <button
                aria-label="关闭介绍"
                onClick={() => {
                  setWelcome(false);
                  try {
                    localStorage.setItem('course-kb-welcome-04', 'dismissed');
                  } catch {
                    /* optional preference */
                  }
                }}
              >
                知道了
              </button>
            </aside>
          )}
          {inCourse && courses.length > 0 && (
            <>
              <div className="course-heading">
                <div>
                  <p className="eyebrow">
                    {activeCourse.semester ?? preferences.semester}
                    {activeCourse.code ? ` / ${activeCourse.code}` : ''}
                  </p>
                  <h1>{activeCourse.name}</h1>
                </div>
                <div className="actions">
                  <button
                    onClick={() => go('knowledge', { filter: activeCourse.id })}
                  >
                    <BookOpen size={17} />
                    课程笔记 {courseNotes.length}
                  </button>
                  <details className="course-more">
                    <summary>更多</summary>
                    <button
                      className="course-delete-action"
                      onClick={() => setPendingDeleteCourse(activeCourse)}
                    >
                      <Trash2 size={16} />
                      删除课程
                    </button>
                  </details>
                </div>
              </div>
              <nav className="course-tabs" aria-label="课程功能">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={activeView === tab.id ? 'active' : ''}
                    onClick={() => go(tab.id, { session: activeSessionId })}
                  >
                    {tab.name}
                  </button>
                ))}
              </nav>
            </>
          )}
          {inCourse && !courses.length ? (
            <section className="empty panel">
              <BookOpen size={30} />
              <h2>从一门课程开始</h2>
              <p>添加新课程，或到回收站恢复之前的课程。</p>
              <button
                className="primary"
                onClick={() => setNewCourseOpen(true)}
              >
                添加课程
              </button>
              <button onClick={() => go('knowledge', { collection: 'trash' })}>
                打开回收站
              </button>
            </section>
          ) : activeView === 'home' ? (
            homeView()
          ) : activeView === 'course' ? (
            courseView()
          ) : activeView === 'lab' ? (
            <LearningFlow
              key={activeCourse.id}
              course={activeCourse}
              model={model}
              questionId={practiceQuestion}
              disabled={!!syncError || syncStatus === 'offline'}
              onChange={(studyLab) =>
                updateCourse(activeCourse.id, (c) => ({ ...c, studyLab }))
              }
              onSource={setSource}
              onRead={() => go('materials')}
              onExplain={(_term, prompt) => {
                go('study');
                setActiveSessionId('');
                setScope('course');
                setQuestion(prompt);
              }}
              onPlan={(plan, studyLab) => {
                setReviewPlans((current) =>
                  current.some((p) => p.id === plan.id)
                    ? current
                    : [...current, plan],
                );
                updateCourse(activeCourse.id, (c) => ({ ...c, studyLab }));
                setToast('已加入复习计划，可调整日期并直接打开关联题目。');
              }}
            />
          ) : activeView === 'materials' ? (
            <div
              className={`reading-workspace ${readingChat ? 'with-chat' : ''}`}
              data-mobile-pane={readingTab}
            >
              <div className="reading-switch actions">
                <button onClick={() => setReadingTab('read')}>教材</button>
                <button
                  disabled={!readingChat}
                  onClick={() => setReadingTab('chat')}
                >
                  问答
                </button>
                <button onClick={() => setLabTool('calibration')}>
                  教材校准
                </button>
              </div>
              <div className="reading-main">{materialsView()}</div>
              {readingChat && (
                <aside className="reading-chat">
                  <div className="actions">
                    <button
                      onClick={() => {
                        setReadingChat(false);
                        setReadingTab('read');
                      }}
                    >
                      收起问答
                    </button>
                    <button
                      onClick={() => go('study', { session: activeSessionId })}
                    >
                      完整问答页
                    </button>
                  </div>
                  {studyView()}
                </aside>
              )}
            </div>
          ) : activeView === 'study' ? (
            studyView()
          ) : activeView === 'knowledge' ? (
            knowledgeView()
          ) : activeView === 'graph' ? (
            <KnowledgeNetwork
              notes={notes}
              courses={courses}
              onOpen={openNote}
              onNew={() => startNote()}
              onChange={(id, patch) =>
                setNotes((current) =>
                  current.map((n) => (n.id === id ? { ...n, ...patch } : n)),
                )
              }
            />
          ) : (
            reviewView()
          )}
        </div>
      </section>
      {showSearch && (
        <Modal
          labelId="quick-search-title"
          wide
          onClose={() => setShowSearch(false)}
        >
          <QuickSearch
            notes={notes}
            courses={courses}
            onClose={() => setShowSearch(false)}
            onNote={(note) => {
              setShowSearch(false);
              openNote(note);
            }}
            onCourse={(id) => {
              setShowSearch(false);
              go('course', { course: id });
            }}
            onNew={() => {
              setShowSearch(false);
              startNote();
            }}
            onGraph={() => {
              setShowSearch(false);
              go('graph');
            }}
          />
        </Modal>
      )}
      {pendingRemoval && (
        <Modal
          labelId="managed-delete-title"
          onClose={() => setPendingRemoval(null)}
        >
          <div className="modal-heading">
            <h2 id="managed-delete-title">移入回收站？</h2>
            <button
              className="icon-button"
              aria-label="取消删除"
              onClick={() => setPendingRemoval(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="delete-note-name">{pendingRemoval.title}</p>
          <p className="muted">
            {pendingRemoval.kind === 'chapter'
              ? '该章节的资料和笔记会保留并移到未分类，导览中的同名章节一起移入回收站。恢复时可还原未重新分类的内容。'
              : pendingRemoval.kind === 'session'
                ? '对话及消息会隐藏，已摘录的笔记保留。可以从回收站恢复。'
                : pendingRemoval.kind === 'message'
                  ? '这条消息会隐藏，后续问答不再发送它。已摘录的笔记保留。'
                  : '移除这份导览，课程、资料和已有笔记保留。可以从回收站恢复。'}
          </p>
          <div className="actions modal-footer">
            <button onClick={() => setPendingRemoval(null)}>取消</button>
            <button className="danger" onClick={removeManagedItem}>
              <Trash2 size={16} />
              确认移入回收站
            </button>
          </div>
        </Modal>
      )}
      {pendingDeleteCourse && (
        <Modal
          labelId="delete-course-title"
          onClose={() => setPendingDeleteCourse(null)}
        >
          <div className="modal-heading">
            <h2 id="delete-course-title">将课程移入回收站？</h2>
            <button
              className="icon-button"
              aria-label="取消删除课程"
              onClick={() => setPendingDeleteCourse(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="delete-note-name">{pendingDeleteCourse.name}</p>
          <div className="course-delete-summary">
            <span>{pendingDeleteCourse.materials.length} 份资料</span>
            <span>
              {
                allNotes.filter((note) =>
                  belongsToCourse(note, pendingDeleteCourse),
                ).length
              }{' '}
              篇笔记
            </span>
            <span>
              {
                reviewPlans.filter(
                  (plan) =>
                    plan.courseId === pendingDeleteCourse.id && !plan.deletedAt,
                ).length
              }{' '}
              份计划
            </span>
          </div>
          <p className="muted">
            课程及其资料、对话、笔记和复习计划会一起隐藏，图谱和搜索也会同步。可以从回收站整门恢复；原本单独删除的笔记仍留在回收站。
          </p>
          <div className="actions modal-footer">
            <button onClick={() => setPendingDeleteCourse(null)}>取消</button>
            <button className="danger" onClick={moveCourseToTrash}>
              <Trash2 size={16} />
              删除课程并保留恢复
            </button>
          </div>
        </Modal>
      )}
      {pendingDeleteNote && (
        <Modal
          labelId="delete-note-title"
          onClose={() => setPendingDeleteNote(null)}
        >
          <div className="modal-heading">
            <h2 id="delete-note-title">将笔记移入回收站？</h2>
            <button
              className="icon-button"
              aria-label="取消删除"
              onClick={() => setPendingDeleteNote(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="delete-note-name">{pendingDeleteNote.title}</p>
          <p className="muted">
            笔记将从列表、搜索和图谱中隐藏。正文、收藏和关联都会保留，可以在回收站恢复。
          </p>
          <div className="actions modal-footer">
            <button onClick={() => setPendingDeleteNote(null)}>取消</button>
            <button className="danger" onClick={moveNoteToTrash}>
              <Trash2 size={17} />
              移入回收站
            </button>
          </div>
        </Modal>
      )}
      {newCourseOpen && (
        <CourseGuideEditor
          courseName=""
          model={model}
          isNew
          onClose={() => setNewCourseOpen(false)}
          onSave={(name, guide) => addCourse(name, guide)}
          onCreateEmpty={(name, upload) => addCourse(name, undefined, upload)}
        />
      )}
      {guideEditorId &&
        courses.some((course) => course.id === guideEditorId) &&
        (() => {
          const course = courses.find((item) => item.id === guideEditorId)!;
          return (
            <CourseGuideEditor
              key={course.id}
              courseName={course.name}
              guide={course.guide}
              model={model}
              onClose={() => setGuideEditorId('')}
              onSave={(_name, guide) => {
                updateCourse(course.id, (current) => ({ ...current, guide }));
                setGuideEditorId('');
                setToast('课程导览已保存');
              }}
            />
          );
        })()}
      {draftNote && draftOpen && (
        <Modal labelId="draft-title" wide onClose={() => setDraftOpen(false)}>
          <div className="modal-heading">
            <h2 id="draft-title">整理成一条知识笔记</h2>
            <button
              className="icon-button"
              aria-label="关闭草稿"
              onClick={() => setDraftOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <form className="form-stack" onSubmit={saveDraft}>
            <label>
              概念标题
              <input
                required
                placeholder="用概念命名，例如：矩阵可对角化的条件"
                value={draftNote.title}
                onChange={(e) =>
                  setDraftNote({ ...draftNote, title: e.target.value })
                }
              />
            </label>
            <div className="two-columns">
              <label>
                课程
                <select
                  value={draftNote.courseId}
                  onChange={(e) => {
                    const c = courses.find((c) => c.id === e.target.value)!;
                    setDraftNote({
                      ...draftNote,
                      courseId: c.id,
                      course: c.name,
                      chapter: '',
                    });
                  }}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                章节
                <input
                  list="draft-chapters"
                  value={draftNote.chapter ?? ''}
                  onChange={(e) =>
                    setDraftNote({ ...draftNote, chapter: e.target.value })
                  }
                />
              </label>
            </div>
            <datalist id="draft-chapters">
              {courses
                .find((c) => c.id === draftNote.courseId)
                ?.chapters?.map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </datalist>
            <label>
              标签（用逗号分隔）
              <input
                value={(draftNote.tags ?? []).join(',')}
                onChange={(e) =>
                  setDraftNote({
                    ...draftNote,
                    tags: e.target.value.split(/[,，]/),
                  })
                }
              />
            </label>
            <label>
              笔记正文
              <textarea
                required
                rows={9}
                value={draftNote.text}
                onChange={(e) =>
                  setDraftNote({ ...draftNote, text: e.target.value })
                }
              />
            </label>
            <label>
              下次考自己的问题（可选）
              <input
                value={draftNote.reviewQuestion ?? ''}
                onChange={(e) =>
                  setDraftNote({ ...draftNote, reviewQuestion: e.target.value })
                }
              />
            </label>
            {draftNote.guideChapterId ? (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={!!draftNote.reviewAt}
                  onChange={(event) =>
                    setDraftNote({
                      ...draftNote,
                      reviewAt: event.target.checked ? localDate() : undefined,
                    })
                  }
                />
                保存后加入今日复习
              </label>
            ) : (
              <small className="muted">
                保留引用来源，保存后加入今日复习。
              </small>
            )}
            <div className="actions">
              <button type="button" onClick={() => setDraftOpen(false)}>
                稍后继续（保留草稿）
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!discardDraft) {
                    setDiscardDraft(true);
                    return;
                  }
                  setDraftNote(null);
                  setDraftOrigin(null);
                  setDiscardDraft(false);
                }}
              >
                {discardDraft ? '确认丢弃草稿' : '丢弃草稿'}
              </button>
              <button className="primary" type="submit">
                <Save size={17} />
                保存笔记
              </button>
            </div>
            {discardDraft && (
              <p className="notice">
                再次点击将清除此篇未保存草稿；已保存的笔记不受影响。
              </p>
            )}
          </form>
        </Modal>
      )}
      {source && (
        <Modal labelId="source-title" wide onClose={() => setSource(null)}>
          <div className="modal-heading">
            <h2 id="source-title">
              [{source.id}] {source.name}
            </h2>
            <button
              className="icon-button"
              aria-label="关闭原文"
              onClick={() => setSource(null)}
            >
              <X size={20} />
            </button>
          </div>
          <p className="muted">{source.section} · 提取原文，供人工核对</p>
          {sourceLocation?.status === 'missing' && (
            <p className="notice">
              当前资料中未找到唯一对应来源，以下保留历史引用，不能视为已核实的当前原文。
            </p>
          )}
          {sourceLocation?.status === 'changed' && (
            <p className="notice">
              资料文字已变化，历史引文无法精确定位，请重新核对。
            </p>
          )}
          {sourceLocation?.status === 'updated' && (
            <p className="notice">
              教材已更新；此段原文仍可定位，其他内容需复核。
            </p>
          )}
          {sourceLocation?.status === 'deleted' && (
            <p className="notice">来源资料已移入回收站，历史引用仍保留。</p>
          )}
          {sourceLocation?.material &&
            !sourceLocation.material.deletedAt &&
            sourceLocation.passage && (
              <button
                onClick={() => {
                  const material = sourceLocation.material!;
                  const owner = courses.find((c) =>
                    c.materials.some(
                      (m) => materialKey(m) === materialKey(material),
                    ),
                  );
                  if (!owner) return;
                  const passage = Math.max(
                    0,
                    material.passages?.indexOf(sourceLocation.passage!) ?? 0,
                  );
                  updateCourse(owner.id, (c) => ({
                    ...c,
                    reading: {
                      fileId: material.fileId,
                      name: material.name,
                      passage,
                      updatedAt: new Date().toISOString(),
                    },
                  }));
                  go('materials', {
                    course: owner.id,
                    file: materialKey(material),
                  });
                  setReadingTab('read');
                  setSource(null);
                }}
              >
                在教材中阅读这一段
              </button>
            )}
          <blockquote className="source-quote">
            <mark>{source.quote}</mark>
          </blockquote>
          {sourceLocation?.passage && (
            <details>
              <summary>查看所在原文段落</summary>
              <p className="source-quote">{sourceLocation.passage.text}</p>
            </details>
          )}
          {source.fileId && (
            <a
              className="button primary"
              target="_blank"
              rel="noreferrer"
              href={`/api/files?id=${encodeURIComponent(source.fileId)}${source.page ? `#page=${source.page}` : ''}`}
            >
              打开原文件{source.page ? `第 ${source.page} 页` : ''}
            </a>
          )}
        </Modal>
      )}
      {pendingDelete && (
        <Modal labelId="remove-title" onClose={() => setPendingDelete(null)}>
          <h2 id="remove-title">将资料移入回收站？</h2>
          <p>{pendingDelete.name}</p>
          <p className="muted">
            可在回收站恢复，已保存笔记中的原文链接仍可使用。
          </p>
          <div className="actions">
            <button onClick={() => setPendingDelete(null)}>取消</button>
            <button className="danger" onClick={removeMaterial}>
              移除资料
            </button>
          </div>
        </Modal>
      )}
      {labTool && (
        <Modal wide labelId="lab-tool-title" onClose={() => setLabTool(null)}>
          <div className="modal-heading">
            <h2 id="lab-tool-title">
              {labTool === 'calibration' ? '教材校准' : '检索评测工具'}
            </h2>
            <button onClick={() => setLabTool(null)}>关闭</button>
          </div>
          {labTools(labTool)}
        </Modal>
      )}
      {showSettings && (
        <Modal labelId="settings-title" onClose={() => setShowSettings(false)}>
          <div className="modal-heading">
            <h2 id="settings-title">设置与备份</h2>
            <button
              className="icon-button"
              aria-label="关闭设置"
              onClick={() => setShowSettings(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="form-stack">
            <label>
              空间名称
              <input
                value={preferences.brandName}
                maxLength={12}
                onChange={(e) =>
                  setPreferences({ ...preferences, brandName: e.target.value })
                }
              />
            </label>
            <label>
              你的称呼
              <input
                value={preferences.userName}
                maxLength={16}
                onChange={(e) =>
                  setPreferences({ ...preferences, userName: e.target.value })
                }
              />
            </label>
            <label>
              当前学期
              <input
                value={preferences.semester}
                onChange={(e) =>
                  setPreferences({ ...preferences, semester: e.target.value })
                }
              />
            </label>
            <label>
              默认模型
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {(aiSettings?.models ?? [{ id: model, name: model }]).map(
                  ({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ),
                )}
              </select>
            </label>
            <small className="ai-service-status">
              {aiSettings
                ? `${aiSettings.provider} · ${aiSettings.configured ? '已配置密钥' : '尚未配置密钥'}`
                : '正在读取 AI 服务配置…'}
              <br />
              密钥保存在本机服务端，不会写入课程备份。
            </small>
            <button
              onClick={() =>
                download(
                  JSON.stringify(workspaceState, null, 2),
                  `课伴正文备份-${localDate()}.json`,
                  'application/json',
                )
              }
            >
              <Download size={17} />
              导出正文 JSON
            </button>
            <small className="muted">
              正文 JSON 不含附件字节。跨电脑迁移请使用下方“含附件迁移包”。
            </small>
            <button
              disabled={!activeCourse.id}
              onClick={() => {
                setShowSettings(false);
                setLabTool('benchmark');
              }}
            >
              检索评测工具
            </button>
            <BackupPanel
              onExport={exportMigration}
              onRestore={restoreMigration}
              onDemo={addDemoCourse}
              disabled={
                !hydrated ||
                !!syncError ||
                syncStatus === 'offline' ||
                isSending
              }
            />
            <button className="primary" onClick={() => setShowSettings(false)}>
              完成
            </button>
          </div>
        </Modal>
      )}
      {toast && <output className="toast">{toast}</output>}
    </main>
  );
}
