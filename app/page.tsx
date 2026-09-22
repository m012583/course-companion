'use client';
import ReactMarkdown from 'react-markdown';
import NoteVisuals from '@/components/note-visuals';
import KnowledgeNetwork from '@/components/knowledge-network';
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
  RefreshCw,
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
  Sparkles,
  Lightbulb,
  ArrowLeft,
  ChevronDown,
} from 'lucide-react';
import {
  coverageLabel,
  normalizeMath,
  selectNotes,
  isDue,
  localDate,
  scheduleReview,
  splitPassages,
  passageText,
  planSuggestions,
  type Coverage,
  type Evidence,
  type Material,
  type Note,
  type Passage,
} from '@/lib/knowledge';
type Message = {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  evidence?: Evidence[];
  retrieved?: Evidence[];
  saved?: boolean;
  scope?: { selected: number; matchedFiles: number; passages: number };
};
type Session = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
};
type Course = {
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
type ViewId =
  | 'home'
  | 'course'
  | 'materials'
  | 'study'
  | 'knowledge'
  | 'graph'
  | 'review';
type Preferences = { brandName: string; userName: string; semester: string };
type ApiData = {
  state?: Workspace;
  revision?: number;
  error?: string;
  id?: string;
  answer?: string;
  evidence?: Evidence[];
  retrieved?: Evidence[];
  scope?: Message['scope'];
};
type Workspace = {
  courses: Course[];
  notes: Note[];
  courseId?: string;
  sessionId?: string;
  activeView?: ViewId;
  preferences?: Preferences;
  model?: string;
  tasks?: StudyTask[];
};
type StudyTask = {
  id: string;
  title: string;
  kind: 'learn' | 'review';
  courseId?: string;
  date?: string;
  status: 'todo' | 'done';
  content?: string;
  createdAt: string;
};
type RecordEdit = {
  kind: 'chapter' | 'session' | 'material' | 'task' | 'message';
  id: string;
  courseId: string;
  title: string;
  content?: string;
  taskKind?: 'learn' | 'review';
  date?: string;
  index?: number;
};
type RecordDelete = {
  kind: 'chapter' | 'session' | 'task' | 'message';
  id: string;
  courseId: string;
  title: string;
  index?: number;
};
const matchesQuery = (query: string, ...values: Array<string | undefined>) =>
  values
    .join(' ')
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
const MODELS = [
  ['deepseek-v4-flash', 'DeepSeek V4 Flash'],
  ['deepseek-v4-pro', 'DeepSeek V4 Pro'],
  ['glm-5.2', 'GLM 5.2'],
  ['kimi-k2.7-code', 'Kimi K2.7 Code'],
  ['kimi-k2.6', 'Kimi K2.6'],
];
const DEFAULT_PREFERENCES: Preferences = {
  brandName: '课伴',
  userName: '同学',
  semester: '2026 秋季学期',
};
const initialCourses: Course[] = [
  {
    id: 'linear-algebra',
    name: '线性代数',
    code: 'MA201',
    materials: [],
    graphFocus: '',
    sessions: [],
  },
];
const emptyCourse: Course = {
  id: '',
  name: '',
  code: '',
  materials: [],
  sessions: [],
  graphFocus: '',
};
const tabs: Array<{ id: ViewId; name: string }> = [
  { id: 'study', name: '问答' },
  { id: 'materials', name: '资料' },
  { id: 'course', name: '章节与课程设置' },
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
  const [courses, setCourses] = useState<Course[]>(initialCourses),
    [notes, setNotes] = useState<Note[]>([]);
  const [activeCourseId, setActiveCourseId] = useState('linear-algebra'),
    [activeSessionId, setActiveSessionId] = useState('');
  const [activeView, setActiveView] = useState<ViewId>('home');
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES),
    [model, setModel] = useState('deepseek-v4-flash');
  const [hydrated, setHydrated] = useState(false),
    [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'offline'>(
      'saved',
    );
  const [syncError, setSyncError] = useState(''),
    [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false),
    [showSettings, setShowSettings] = useState(false);
  const [newCourseOpen, setNewCourseOpen] = useState(false),
    [courseName, setCourseName] = useState(''),
    [newChapter, setNewChapter] = useState('');
  const [tasks, setTasks] = useState<StudyTask[]>([]),
    [taskTitle, setTaskTitle] = useState(''),
    [taskKind, setTaskKind] = useState<'learn' | 'review'>('learn'),
    [taskCourseId, setTaskCourseId] = useState(''),
    [taskDate, setTaskDate] = useState(''),
    [taskContent, setTaskContent] = useState('');
  const [expandedTask, setExpandedTask] = useState<string | null>(null),
    [editingTaskId, setEditingTaskId] = useState<string | null>(null),
    [editContent, setEditContent] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]),
    [aiLoading, setAiLoading] = useState(false);
  const [viewStack, setViewStack] = useState<
    Array<{
      view: ViewId;
      course: string;
      session: string;
      file: string;
      note: string;
      filter: string;
    }>
  >([]);
  const [question, setQuestion] = useState(''),
    [isSending, setIsSending] = useState(false),
    [chatError, setChatError] = useState('');
  const [scope, setScope] = useState<'course' | 'all' | 'custom'>('course'),
    [selectedFiles, setSelectedFiles] = useState<string[]>([]),
    [scopeOpen, setScopeOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(''),
    [materialQuery, setMaterialQuery] = useState(''),
    [materialChapter, setMaterialChapter] = useState('');
  const [uploadProgress, setUploadProgress] = useState(''),
    [uploadError, setUploadError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Material | null>(null);
  const [pendingCourseDelete, setPendingCourseDelete] = useState<Course | null>(
    null,
  );
  const [pendingNoteDelete, setPendingNoteDelete] = useState<Note | null>(null);
  const [recordEdit, setRecordEdit] = useState<RecordEdit | null>(null);
  const [recordDelete, setRecordDelete] = useState<RecordDelete | null>(null);
  const [recordError, setRecordError] = useState('');
  const [courseQuery, setCourseQuery] = useState('');
  const [chapterQuery, setChapterQuery] = useState('');
  const [sessionQuery, setSessionQuery] = useState('');
  const [taskQuery, setTaskQuery] = useState('');
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
  const [source, setSource] = useState<Evidence | null>(null);
  const [reviewQueue, setReviewQueue] = useState<string[] | null>(null),
    [reviewIndex, setReviewIndex] = useState(0),
    [reviewAnswer, setReviewAnswer] = useState(''),
    [reviewRevealed, setReviewRevealed] = useState(false),
    [reviewCorrect, setReviewCorrect] = useState(0);
  const revisionRef = useRef(0),
    syncBlocked = useRef(false),
    saveQueue = useRef(Promise.resolve()),
    chatEndRef = useRef<HTMLDivElement>(null),
    routeApplied = useRef(false);
  const activeCourse =
      courses.find((c) => c.id === activeCourseId) ?? courses[0] ?? emptyCourse,
    materials = activeCourse.materials;
  const activeSession = activeCourse.sessions.find(
    (s) => s.id === activeSessionId,
  );
  const currentMaterial =
    materials.find((m) => materialKey(m) === selectedMaterialId) ??
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
      selectNotes(notes, {
        courseId: noteCourse === 'all' ? undefined : noteCourse,
        courseName: courses.find((c) => c.id === noteCourse)?.name,
        chapter: noteChapter,
        tag: noteTag,
        dueOnly: reviewOnly,
        query: noteQuery,
      }),
    [notes, noteCourse, noteChapter, noteTag, reviewOnly, noteQuery, courses],
  );
  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const reviewNote = reviewQueue
    ? notes.find((n) => n.id === reviewQueue[reviewIndex])
    : undefined;
  const workspaceState: Workspace = {
    courses,
    notes,
    courseId: activeCourseId,
    sessionId: activeSessionId,
    activeView,
    preferences,
    model,
    tasks,
  };
  function applyState(state: Workspace) {
    setCourses(state.courses);
    setNotes(
      (state.notes ?? []).map((n) => ({
        ...n,
        courseId:
          n.courseId ?? state.courses.find((c) => c.name === n.course)?.id,
      })),
    );
    setActiveCourseId(state.courseId ?? state.courses[0]?.id ?? '');
    setActiveSessionId(state.sessionId ?? '');
    setActiveView(state.activeView ?? 'home');
    setPreferences(state.preferences ?? DEFAULT_PREFERENCES);
    setModel(state.model ?? 'deepseek-v4-flash');
    setTasks(state.tasks ?? []);
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/workspace');
        const data = (await response.json()) as ApiData;
        if (!response.ok) throw new Error('load');
        const state =
          data.state ??
          JSON.parse(localStorage.getItem('course-companion-state') || 'null');
        if (!cancelled && Array.isArray(state?.courses)) {
          applyState(state);
          revisionRef.current = data.revision ?? 0;
        }
      } catch {
        syncBlocked.current = true;
        try {
          const local = JSON.parse(
            localStorage.getItem('course-companion-state') || 'null',
          );
          if (!cancelled && Array.isArray(local?.courses)) applyState(local);
        } catch {
          /* Preserve defaults */
        }
        setSyncStatus('offline');
        setSyncError(
          '无法连接云端，正在使用本机副本。请先下载完整备份，再刷新重连。',
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
    const state = {
      courses,
      notes,
      courseId: activeCourseId,
      sessionId: activeSessionId,
      activeView,
      preferences,
      model,
      tasks,
    };
    try {
      localStorage.setItem('course-companion-state', JSON.stringify(state));
    } catch {
      queueMicrotask(() => setSyncError('本机备份空间不足，请下载完整备份。'));
    }
    if (syncBlocked.current) return;
    const timer = setTimeout(() => {
      setSyncStatus('saving');
      saveQueue.current = saveQueue.current.then(async () => {
        if (syncBlocked.current) return;
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
                ? '另一窗口已更新工作区。请下载完整备份后刷新核对。'
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
              : '保存失败，请下载完整备份。',
          );
        }
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [
    courses,
    notes,
    activeCourseId,
    activeSessionId,
    activeView,
    preferences,
    model,
    tasks,
    hydrated,
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
        if (view === 'knowledge') {
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
    document.title = `${preferences.brandName} · ${activeView === 'home' ? '今日学习' : activeView === 'graph' ? '知识图谱' : activeView === 'knowledge' ? '全部笔记' : activeCourse.name}`;
  }, [preferences.brandName, activeView, activeCourse.name]);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeSession?.messages.length, isSending]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function go(
    view: ViewId,
    opts: {
      course?: string;
      session?: string;
      file?: string;
      note?: string;
      filter?: string;
    } = {},
  ) {
    setViewStack((stack) => {
      if (stack.length && stack[stack.length - 1].view === view) return stack;
      return [
        ...stack,
        {
          view: activeView,
          course: activeCourseId,
          session: activeSessionId,
          file: selectedMaterialId,
          note: selectedNoteId,
          filter: noteCourse,
        },
      ].slice(-50);
    });
    setActiveView(view);
    setMobileNavOpen(false);
    setEditingNote(false);
    if (opts.course) {
      setActiveCourseId(opts.course);
      setSelectedMaterialId(opts.file ?? '');
      setActiveSessionId(opts.session ?? '');
      setScope('course');
      setSelectedFiles([]);
    }
    if (opts.session !== undefined) setActiveSessionId(opts.session);
    if (opts.file) setSelectedMaterialId(opts.file);
    if (view === 'knowledge') {
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
    if (opts.filter) params.set('filter', opts.filter);
    history.pushState(null, '', `#${params}`);
  }
  function goBack() {
    if (!viewStack.length) return;
    const prev = viewStack[viewStack.length - 1];
    setViewStack(viewStack.slice(0, -1));
    setActiveView(prev.view);
    if (prev.course) setActiveCourseId(prev.course);
    setActiveSessionId(prev.session);
    setSelectedMaterialId(prev.file);
    setSelectedNoteId(prev.note);
    setNoteCourse(prev.filter || 'all');
    if (prev.view === 'knowledge') {
      setNoteQuery('');
      setNoteChapter('');
      setNoteTag('');
      setReviewOnly(false);
    }
    const params = new URLSearchParams({
      view: prev.view,
      course: prev.course || activeCourseId,
    });
    if (prev.session) params.set('session', prev.session);
    if (prev.file) params.set('file', prev.file);
    if (prev.note) params.set('note', prev.note);
    if (prev.filter) params.set('filter', prev.filter);
    history.pushState(null, '', `#${params}`);
  }
  function updateCourse(id: string, update: (course: Course) => Course) {
    setCourses((current) => current.map((c) => (c.id === id ? update(c) : c)));
  }
  function changeChapter(courseId: string, oldName: string, newName: string) {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    updateCourse(courseId, (c) => ({
      ...c,
      chapters: [
        ...new Set([
          ...(c.chapters ?? []).filter((name) => name !== oldName),
          ...(newName ? [newName] : []),
        ]),
      ],
      materials: c.materials.map((m) =>
        m.chapter === oldName ? { ...m, chapter: newName } : m,
      ),
    }));
    setNotes((current) =>
      current.map((n) =>
        (n.courseId ? n.courseId === courseId : n.course === course.name) &&
        n.chapter === oldName
          ? { ...n, chapter: newName, updatedAt: new Date().toISOString() }
          : n,
      ),
    );
    if (materialChapter === oldName) setMaterialChapter(newName);
    if (noteChapter === oldName) setNoteChapter(newName);
  }
  function saveRecord(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!recordEdit) return;
    const entry = recordEdit;
    const title = entry.title.trim();
    if (!title) {
      setRecordError('名称或内容不能为空');
      return;
    }
    if (entry.kind === 'chapter') {
      if (title !== entry.id && activeChapters.includes(title)) {
        setRecordError('该章节名称已存在');
        return;
      }
      changeChapter(entry.courseId, entry.id, title);
    } else if (entry.kind === 'session') {
      updateSession(entry.courseId, entry.id, (s) => ({
        ...s,
        title,
        updatedAt: new Date().toISOString(),
      }));
    } else if (entry.kind === 'message') {
      updateSession(entry.courseId, entry.id, (s) => ({
        ...s,
        messages: s.messages.map((m, i) =>
          i === entry.index ? { ...m, text: title } : m,
        ),
        updatedAt: new Date().toISOString(),
      }));
    } else if (entry.kind === 'material') {
      const course = courses.find((c) => c.id === entry.courseId);
      const material = course?.materials.find(
        (m) => materialKey(m) === entry.id,
      );
      if (
        !material?.fileId &&
        course?.materials.some(
          (m) => materialKey(m) !== entry.id && m.name === title,
        )
      ) {
        setRecordError('该资料名称已存在');
        return;
      }
      updateCourse(entry.courseId, (c) => ({
        ...c,
        materials: c.materials.map((m) =>
          materialKey(m) === entry.id ? { ...m, name: title } : m,
        ),
      }));
      if (material && !material.fileId) {
        setSelectedMaterialId(title);
        setSelectedFiles((current) =>
          current.map((id) => (id === entry.id ? title : id)),
        );
      }
    } else {
      setTasks((current) =>
        current.map((task) =>
          task.id === entry.id
            ? {
                ...task,
                title,
                content: entry.content?.trim(),
                kind: entry.taskKind ?? 'learn',
                courseId: entry.courseId || undefined,
                date: entry.date || undefined,
              }
            : task,
        ),
      );
    }
    setRecordEdit(null);
    setRecordError('');
    setToast('修改已保存');
  }
  function deleteRecord() {
    if (!recordDelete) return;
    const entry = recordDelete;
    if (entry.kind === 'chapter') changeChapter(entry.courseId, entry.id, '');
    else if (entry.kind === 'task') {
      removeTask(entry.id);
      if (editingTaskId === entry.id) setEditingTaskId(null);
      if (expandedTask === entry.id) setExpandedTask(null);
    } else if (entry.kind === 'message') {
      updateSession(entry.courseId, entry.id, (s) => ({
        ...s,
        messages: s.messages.filter((_, i) => i !== entry.index),
        updatedAt: new Date().toISOString(),
      }));
    } else {
      updateCourse(entry.courseId, (c) => ({
        ...c,
        sessions: c.sessions.filter((s) => s.id !== entry.id),
      }));
      setNotes((current) =>
        current.map((n) =>
          n.sessionId === entry.id ? { ...n, sessionId: undefined } : n,
        ),
      );
      setViewStack((stack) => stack.filter((v) => v.session !== entry.id));
      if (activeSessionId === entry.id) {
        setActiveSessionId('');
        history.replaceState(
          null,
          '',
          `#${new URLSearchParams({ view: 'study', course: entry.courseId })}`,
        );
      }
    }
    setRecordDelete(null);
    setToast(
      entry.kind === 'chapter'
        ? '章节已删除，原资料和笔记已归入未分类'
        : '已删除',
    );
  }
  function removeNotes(ids: Set<string>) {
    setNotes((current) =>
      current
        .filter((note) => !ids.has(note.id))
        .map((note) => ({
          ...note,
          relatedIds: note.relatedIds?.filter((id) => !ids.has(id)),
          relatedLabels:
            note.relatedLabels &&
            Object.fromEntries(
              Object.entries(note.relatedLabels).filter(([id]) => !ids.has(id)),
            ),
        })),
    );
    setReviewQueue(null);
    setReviewIndex(0);
    if (ids.has(selectedNoteId)) {
      setSelectedNoteId('');
      setEditingNote(false);
    }
    setViewStack((stack) => stack.filter((entry) => !ids.has(entry.note)));
  }
  function removeNote() {
    if (!pendingNoteDelete) return;
    removeNotes(new Set([pendingNoteDelete.id]));
    setPendingNoteDelete(null);
    history.replaceState(
      null,
      '',
      `#${new URLSearchParams({ view: 'knowledge', filter: noteCourse })}`,
    );
    setToast('笔记已删除');
  }
  function removeCourse() {
    if (!pendingCourseDelete) return;
    const removed = pendingCourseDelete;
    const remaining = courses.filter((course) => course.id !== removed.id);
    const ids = new Set(
      notes
        .filter((note) =>
          note.courseId
            ? note.courseId === removed.id
            : note.course === removed.name,
        )
        .map((note) => note.id),
    );
    removeNotes(ids);
    setCourses(remaining);
    setTasks((current) =>
      current.filter((task) => task.courseId !== removed.id),
    );
    setActiveCourseId(remaining[0]?.id ?? '');
    setActiveSessionId('');
    setSelectedMaterialId('');
    setSelectedFiles([]);
    setMaterialChapter('');
    setMaterialQuery('');
    setNoteCourse('all');
    setNoteChapter('');
    setTaskCourseId('');
    setQuestion('');
    setChatError('');
    setSource(null);
    setActiveView('home');
    setViewStack([]);
    setPendingCourseDelete(null);
    history.replaceState(null, '', '#view=home');
    setToast('课程及其笔记、对话和学习任务已删除');
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
    setChatError('');
  }
  function addCourse(event: { preventDefault(): void }) {
    event.preventDefault();
    const name = courseName.trim();
    if (!name) {
      setToast('请输入课程名称');
      return;
    }
    const course: Course = {
      id: crypto.randomUUID(),
      name: name.slice(0, 60),
      code: '',
      materials: [],
      sessions: [],
      graphFocus: '',
      chapters: [],
    };
    setCourses((current) => [...current, course]);
    setNewCourseOpen(false);
    setCourseName('');
    go('materials', { course: course.id });
  }
  function addTask(event: { preventDefault(): void }) {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title) {
      setToast('请输入任务名称');
      return;
    }
    const content = taskContent.trim();
    setTasks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: title.slice(0, 100),
        kind: taskKind,
        courseId: taskCourseId || undefined,
        date: taskDate || undefined,
        status: 'todo',
        content: content || undefined,
        createdAt: new Date().toISOString(),
      },
    ]);
    setTaskTitle('');
    setTaskDate('');
    setTaskContent('');
    setToast('任务已添加');
  }
  function startEditTask(task: StudyTask) {
    setEditingTaskId(task.id);
    setEditContent(task.content ?? '');
  }
  function saveEditTask(id: string) {
    const content = editContent.trim();
    setTasks((current) =>
      current.map((x) =>
        x.id === id ? { ...x, content: content || undefined } : x,
      ),
    );
    setEditingTaskId(null);
    setToast('任务内容已更新');
  }
  function toggleTask(id: string) {
    setTasks((current) =>
      current.map((t) =>
        t.id === id
          ? { ...t, status: t.status === 'todo' ? 'done' : 'todo' }
          : t,
      ),
    );
  }
  function removeTask(id: string) {
    setTasks((current) => current.filter((t) => t.id !== id));
  }
  async function generatePlans() {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const today = localDate();
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 3);
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          dueCount: dueNotes.length,
          upcomingCount: notes.filter(
            (n) =>
              n.reviewAt &&
              n.reviewAt > today &&
              n.reviewAt <= localDate(horizon),
          ).length,
          courses: courses.map((c) => ({
            name: c.name,
            materialCount: c.materials.filter((m) => m.fileId).length,
            noteCount: notes.filter((n) => n.courseId === c.id).length,
          })),
          tasks: tasks
            .filter((t) => t.status === 'todo')
            .map((t) => ({
              title: t.title,
              kind: t.kind,
              date: t.date ?? null,
            })),
        }),
      });
      const data = (await response.json()) as {
        suggestions?: Array<{ title: string; reason: string }>;
        error?: string;
      };
      if (!response.ok) {
        setToast(
          response.status === 503
            ? '未配置 AI 服务，已使用数据建议'
            : data.error || '建议生成失败，已使用数据建议',
        );
        return;
      }
      setAiSuggestions(
        (data.suggestions ?? []).map((s) => `${s.title}：${s.reason}`),
      );
      setToast('AI 建议已生成');
    } catch {
      setToast('建议生成失败，已使用数据建议');
    } finally {
      setAiLoading(false);
    }
  }
  const sortedTasks = tasks
    .filter((task) =>
      matchesQuery(
        taskQuery,
        task.title,
        task.content,
        task.date,
        courses.find((c) => c.id === task.courseId)?.name,
        task.kind === 'learn' ? '学习' : '复习',
        task.status === 'done' ? '已完成' : '待完成',
      ),
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
      const da = a.date ?? '9999-12-31',
        db = b.date ?? '9999-12-31';
      return da.localeCompare(db) || a.createdAt.localeCompare(b.createdAt);
    });
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
      materials: c.materials.filter(
        (m) => materialKey(m) !== materialKey(removed),
      ),
    }));
    setSelectedFiles((current) =>
      current.filter((id) => id !== materialKey(removed)),
    );
    if (selectedMaterialId === materialKey(removed)) setSelectedMaterialId('');
    setPendingDelete(null);
    setToast('已从课程移除，已保存笔记中的原文链接仍可使用。');
  }
  async function submitQuestion(event?: { preventDefault(): void }) {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isSending) return;
    const courseId = activeCourse.id,
      sessionId = activeSession?.id ?? crypto.randomUUID(),
      historyMessages = activeSession?.messages ?? [];
    if (!activeSession)
      updateCourse(courseId, (c) => ({
        ...c,
        sessions: [
          {
            id: sessionId,
            title: shortTitle(trimmed),
            messages: [{ role: 'user', text: trimmed }],
            updatedAt: new Date().toISOString(),
          },
          ...c.sessions,
        ],
      }));
    else
      updateSession(courseId, sessionId, (s) => ({
        ...s,
        title: s.title === '新学习对话' ? shortTitle(trimmed) : s.title,
        messages: [...s.messages, { role: 'user', text: trimmed }],
        updatedAt: new Date().toISOString(),
      }));
    setActiveSessionId(sessionId);
    setQuestion('');
    setIsSending(true);
    setChatError('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          history: historyMessages.map(({ role, text }) => ({
            role,
            content: text,
          })),
          course: activeCourse.name,
          model,
          contexts: contextMaterials,
        }),
      });
      const data = (await response.json()) as ApiData;
      if (!response.ok || !data.answer)
        throw new Error(data.error || '回答失败');
      updateSession(courseId, sessionId, (s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            role: 'assistant',
            text: data.answer!,
            evidence: data.evidence,
            retrieved: data.retrieved,
            scope: data.scope,
          },
        ],
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      setChatError(error instanceof Error ? error.message : '连接失败');
      setQuestion(trimmed);
      updateSession(courseId, sessionId, (s) => ({
        ...s,
        messages: s.messages.slice(0, -1),
      }));
    } finally {
      setIsSending(false);
    }
  }
  function startNote(message?: Message, index?: number) {
    if (!courses.length) {
      setNewCourseOpen(true);
      setToast('请先添加一门课程，再创建笔记');
      return;
    }
    const now = new Date().toISOString(),
      selection = window.getSelection()?.toString().trim(),
      selectedText =
        selection && message?.text.includes(selection) ? selection : undefined;
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
    setToast('笔记已保存，并加入今日复习');
    go('knowledge', { note: draftNote.id });
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
  function openNote(note: Note) {
    go('knowledge', { note: note.id });
  }
  const noteOwner = (note: Note) =>
    courses.find(
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
            按关键词匹配正文；概览问题会选取代表片段，不代表逐页阅读全文。扫描图片尚不支持文字识别。
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
            <h1>今天，先学一点点</h1>
            <p className="muted">
              {notes.length} 条笔记 · {dueNotes.length} 条到期复习
              {tasks.filter((t) => t.status === 'todo').length > 0
                ? ` · 学习任务 ${tasks.filter((t) => t.status === 'todo').length} 项`
                : ''}
            </p>
          </div>
        </div>
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
        <div className="section-heading course-list-heading">
          <h2>我的课程</h2>
          <input
            aria-label="搜索课程"
            placeholder="搜索课程、编号或教师"
            value={courseQuery}
            onChange={(e) => setCourseQuery(e.target.value)}
          />
          <button
            className="text-button"
            onClick={() => setNewCourseOpen(true)}
          >
            <Plus size={16} />
            添加课程
          </button>
        </div>
        <div className="course-grid">
          {courses
            .filter((course) =>
              matchesQuery(
                courseQuery,
                course.name,
                course.code,
                course.teacher,
                course.semester,
              ),
            )
            .map((course, index) => (
              <article className="course-card" key={course.id}>
                <h3 title={course.name}>
                  <span className={`course-dot tone-${index % 4}`} />
                  {course.name}
                </h3>
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
                <div className="actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      go('study', {
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
                  <button
                    className="danger"
                    aria-label={`删除课程 ${course.name}`}
                    title="删除课程"
                    disabled={isSending || !!uploadProgress}
                    onClick={() => setPendingCourseDelete(course)}
                  >
                    <Trash2 size={17} />
                    删除课程
                  </button>
                </div>
              </article>
            ))}
        </div>
        <section className="recent-notes">
          {!courses.some((course) =>
            matchesQuery(
              courseQuery,
              course.name,
              course.code,
              course.teacher,
              course.semester,
            ),
          ) && (
            <p className="empty">
              {courses.length
                ? '没有匹配的课程，请调整搜索条件。'
                : '还没有课程，点击“添加课程”开始。'}
            </p>
          )}
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
      </div>
    );
  }
  function courseView() {
    return (
      <div className="two-columns course-settings">
        <section className="panel">
          <h2>章节组织</h2>
          <p className="muted">按课程章节归类资料和笔记。</p>
          <input
            aria-label="搜索章节"
            placeholder="搜索章节名称"
            value={chapterQuery}
            onChange={(e) => setChapterQuery(e.target.value)}
          />
          {activeChapters
            .filter((chapter) => matchesQuery(chapterQuery, chapter))
            .map((chapter) => (
              <div className="chapter-row" key={chapter}>
                <strong>{chapter}</strong>
                <div className="actions">
                  <button
                    onClick={() => {
                      setRecordError('');
                      setRecordEdit({
                        kind: 'chapter',
                        id: chapter,
                        courseId: activeCourse.id,
                        title: chapter,
                      });
                    }}
                  >
                    改名
                  </button>
                  <button
                    className="danger"
                    onClick={() =>
                      setRecordDelete({
                        kind: 'chapter',
                        id: chapter,
                        courseId: activeCourse.id,
                        title: chapter,
                      })
                    }
                  >
                    删除章节
                  </button>
                  <button
                    onClick={() => {
                      go('materials');
                      setMaterialChapter(chapter);
                    }}
                  >
                    资料 {materials.filter((m) => m.chapter === chapter).length}
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
                </div>
              </div>
            ))}
          {!activeChapters.length && (
            <p className="empty">还没有章节，例如“第一章 · 线性空间”。</p>
          )}
          {!!activeChapters.length &&
            !activeChapters.some((chapter) =>
              matchesQuery(chapterQuery, chapter),
            ) && <p className="empty">没有匹配的章节。</p>}
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
              maxLength={60}
              onChange={(e) =>
                e.target.value.trim() &&
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
          <button
            className="danger"
            disabled={isSending || !!uploadProgress}
            onClick={() => setPendingCourseDelete(activeCourse)}
          >
            <Trash2 size={17} />
            删除课程
          </button>
        </section>
      </div>
    );
  }
  function materialsView() {
    const visible = materials.filter(
      (m) =>
        (!materialChapter || m.chapter === materialChapter) &&
        matchesQuery(
          materialQuery,
          m.name,
          m.content,
          m.chapter,
          m.passages?.map((p) => p.text).join(' '),
        ),
    );
    const text = currentMaterial?.passages?.length
      ? passageText(currentMaterial.passages)
      : (currentMaterial?.content ?? '');
    return (
      <>
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="搜索资料"
              placeholder="搜索资料名称或正文"
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
              accept=".pdf,.docx,.txt,.md,.markdown"
              onChange={addMaterials}
            />
          </label>
        </div>
        <p className="muted small">
          支持 PDF、DOCX、TXT、Markdown，每份不超过 20 MB。最多提取 40 万字符或
          500 页，超出部分会明确标注。
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
        <div className="materials-layout">
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
          <section className="panel material-reader">
            {currentMaterial ? (
              <>
                <div className="panel-heading">
                  <h2>{currentMaterial.name}</h2>
                  <div className="actions">
                    <button
                      onClick={() => {
                        setRecordError('');
                        setRecordEdit({
                          kind: 'material',
                          id: materialKey(currentMaterial),
                          courseId: activeCourse.id,
                          title: currentMaterial.name,
                        });
                      }}
                    >
                      重命名
                    </button>
                    {currentMaterial.fileId && (
                      <a
                        className="button"
                        href={`/api/files?id=${encodeURIComponent(currentMaterial.fileId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        打开原文件
                      </a>
                    )}
                    <button
                      disabled={!currentMaterial.fileId || !!uploadProgress}
                      onClick={() => void reparse(currentMaterial)}
                    >
                      <RefreshCw size={16} />
                      重新解析
                    </button>
                  </div>
                </div>
                <div className="reading-meta">
                  <p className="notice">{coverageLabel(currentMaterial)}</p>
                  <label>
                    所属章节
                    <select
                      value={currentMaterial.chapter ?? ''}
                      onChange={(e) =>
                        updateCourse(activeCourse.id, (c) => ({
                          ...c,
                          materials: c.materials.map((m) =>
                            m === currentMaterial
                              ? { ...m, chapter: e.target.value }
                              : m,
                          ),
                        }))
                      }
                    >
                      <option value="">未分类</option>
                      {activeChapters.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={!text}
                    onClick={() => {
                      go('study');
                      setScope('custom');
                      setSelectedFiles([materialKey(currentMaterial)]);
                      setScopeOpen(true);
                      setQuestion(
                        `请解释《${currentMaterial.name}》中的核心概念。`,
                      );
                    }}
                  >
                    用这份资料提问
                    <ChevronRight size={16} />
                  </button>
                </div>
                {currentMaterial.type === 'PDF' && currentMaterial.fileId ? (
                  <iframe
                    title={`${currentMaterial.name}原文`}
                    className="document-frame"
                    src={`/api/files?id=${encodeURIComponent(currentMaterial.fileId)}`}
                  />
                ) : text ? (
                  <div className="document-text">
                    <Markdown text={text} />
                  </div>
                ) : (
                  <div className="empty">
                    <p>没有可读取正文。扫描件需要先转为含文字的 PDF。</p>
                  </div>
                )}
                <details className="extraction">
                  <summary>查看提取的文字与定位</summary>
                  {currentMaterial.passages?.map((p, i) => (
                    <div key={i}>
                      <small>{p.section}</small>
                      <p>{p.text}</p>
                    </div>
                  )) ?? <p>{currentMaterial.content ?? '暂无正文'}</p>}
                </details>
              </>
            ) : (
              <div className="empty">上传资料后，在这里阅读原文。</div>
            )}
          </section>
        </div>
      </>
    );
  }
  function studyView() {
    const messages = activeSession?.messages ?? [];
    return (
      <div className="study-layout">
        <aside className="panel sessions">
          <div className="panel-heading">
            <h2>对话</h2>
            <button
              className="icon-button"
              aria-label="新建对话"
              onClick={newSession}
            >
              <Plus size={18} />
            </button>
          </div>
          <input
            aria-label="搜索对话"
            placeholder="搜索标题或消息内容"
            value={sessionQuery}
            onChange={(e) => setSessionQuery(e.target.value)}
          />
          {activeCourse.sessions
            .filter((session) =>
              matchesQuery(
                sessionQuery,
                session.title,
                ...session.messages.map((m) => m.text),
              ),
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((session) => (
              <button
                className={`session-row ${session.id === activeSessionId ? 'selected' : ''}`}
                key={session.id}
                onClick={() => go('study', { session: session.id })}
              >
                <span>{session.title}</span>
                <small>{timeLabel(session.updatedAt)}</small>
              </button>
            ))}
          {!activeCourse.sessions.length && (
            <p className="empty">你的学习对话会保存在这里。</p>
          )}
          {!!activeCourse.sessions.length &&
            !activeCourse.sessions.some((session) =>
              matchesQuery(
                sessionQuery,
                session.title,
                ...session.messages.map((m) => m.text),
              ),
            ) && <p className="empty">没有匹配的对话。</p>}
        </aside>
        <section className="panel conversation">
          <div className="conversation-heading">
            <h2>{activeSession?.title ?? '问一个你想弄懂的问题'}</h2>
            {activeSession && (
              <div className="actions">
                <button
                  disabled={isSending}
                  onClick={() => {
                    setRecordError('');
                    setRecordEdit({
                      kind: 'session',
                      id: activeSession.id,
                      courseId: activeCourse.id,
                      title: activeSession.title,
                    });
                  }}
                >
                  改名
                </button>
                <button
                  className="danger"
                  disabled={isSending}
                  onClick={() =>
                    setRecordDelete({
                      kind: 'session',
                      id: activeSession.id,
                      courseId: activeCourse.id,
                      title: activeSession.title,
                    })
                  }
                >
                  删除对话
                </button>
              </div>
            )}
            <button onClick={() => go('materials')}>查看资料</button>
          </div>
          {materialPicker()}
          <div className="messages">
            {!messages.length && (
              <div className="chat-empty">
                <Bot size={32} />
                <h2>
                  {contextMaterials.length
                    ? '从资料里的一个问题开始'
                    : '先添加资料，或直接提问'}
                </h2>
                <p>
                  {contextMaterials.length
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
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={index}>
                <div className="message-label">
                  {message.role === 'assistant' ? '课伴' : preferences.userName}
                </div>
                <Markdown text={message.text} />
                <div className="actions">
                  <button
                    disabled={isSending}
                    onClick={() => {
                      setRecordError('');
                      setRecordEdit({
                        kind: 'message',
                        id: activeSessionId,
                        courseId: activeCourse.id,
                        title: message.text,
                        index,
                      });
                    }}
                  >
                    编辑消息
                  </button>
                  <button
                    className="danger"
                    disabled={isSending}
                    onClick={() =>
                      setRecordDelete({
                        kind: 'message',
                        id: activeSessionId,
                        courseId: activeCourse.id,
                        title: shortTitle(message.text),
                        index,
                      })
                    }
                  >
                    删除消息
                  </button>
                </div>
                {message.role === 'assistant' && (
                  <>
                    {message.scope && (
                      <small className="scope-result">
                        从 {message.scope.selected} 份资料中选取：
                        {message.scope.matchedFiles} 份文件、
                        {message.scope.passages} 段原文。
                      </small>
                    )}
                    {evidenceList(message.evidence ?? [])}
                    {!message.evidence?.length && message.scope && (
                      <p className="muted small">
                        本次回答没有可定位的引用，请结合原文核对。
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
            ))}
            {isSending && (
              <output className="notice">
                <LoaderCircle className="spin" size={16} />
                正在匹配原文并组织回答…
              </output>
            )}
            <div ref={chatEndRef} />
          </div>
          {chatError && (
            <p className="error" role="alert">
              {chatError} 问题已保留在输入框。
            </p>
          )}
          <form className="composer" onSubmit={submitQuestion}>
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
                {contextMaterials.length
                  ? '带原文片段回答'
                  : '当前无可读取资料 · 通用知识问答'}
              </small>
              <button
                className="primary"
                disabled={!question.trim() || isSending}
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
    const chapterOptions = [
        ...new Set(
          notes
            .filter((n) => noteCourse === 'all' || n.courseId === noteCourse)
            .map((n) => n.chapter)
            .filter(Boolean),
        ),
      ],
      tagOptions = [
        ...new Set(notes.flatMap((n) => n.tags ?? []).filter(Boolean)),
      ];
    return (
      <>
        {!selectedNote && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">跨课程整理与检索</p>
                <h1>我的知识库</h1>
                <p className="muted">
                  全库 {notes.length} 条笔记 · {dueNotes.length} 条到期 ·
                  按最近更新排序
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
            <div className="toolbar">
              <div className="search">
                <Search size={17} />
                <input
                  aria-label="搜索全部笔记"
                  placeholder="搜索标题、正文、章节或标签"
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
          {!selectedNote && (
            <section className="panel note-list">
              <div className="panel-heading">
                <h2>找到 {filteredNotes.length} 条</h2>
              </div>
              {filteredNotes.map((note) => (
                <button
                  className="note-row"
                  key={note.id}
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    setEditingNote(false);
                    history.pushState(
                      null,
                      '',
                      `#${new URLSearchParams({ view: 'knowledge', note: note.id, filter: noteCourse })}`,
                    );
                  }}
                >
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
                    {timeLabel(note.updatedAt ?? note.createdAt)} 更新
                    {isDue(note) ? ' · 待复习' : ''}
                  </small>
                </button>
              ))}
              {!filteredNotes.length && (
                <div className="empty">
                  <Search size={26} />
                  <h3>
                    {notes.length ? '没有匹配的笔记' : '保存第一条知识笔记'}
                  </h3>
                  <p>
                    {notes.length
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
                          setReviewOnly(false))
                        : startNote()
                    }
                  >
                    {notes.length ? '清除筛选' : '新建笔记'}
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
                            `#${new URLSearchParams({ view: 'knowledge', filter: noteCourse })}`,
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
                      <button onClick={() => setEditingNote(!editingNote)}>
                        {editingNote ? '完成编辑' : '编辑笔记'}
                      </button>
                      <button
                        className="danger"
                        onClick={() => setPendingNoteDelete(selectedNote)}
                      >
                        <Trash2 size={16} />
                        删除笔记
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
    const today = localDate();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 3);
    const suggestions = planSuggestions({
      dueCount: dueNotes.length,
      upcomingCount: notes.filter(
        (n) =>
          n.reviewAt && n.reviewAt > today && n.reviewAt <= localDate(horizon),
      ).length,
      courses: courses.map((c) => ({
        name: c.name,
        materialCount: c.materials.filter((m) => m.fileId).length,
        noteCount: notes.filter((n) => n.courseId === c.id).length,
      })),
      todayTasks: tasks.filter((t) => t.status === 'todo' && t.date === today)
        .length,
      doneToday: tasks.filter((t) => t.status === 'done' && t.date === today)
        .length,
    });
    const todoTaskCount = tasks.filter((t) => t.status === 'todo').length;
    return (
      <div className="review-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">先回忆，再核对</p>
            <h1>复习</h1>
            <p className="muted">
              到期复习 {dueNotes.length} 条 · 学习任务 {todoTaskCount} 项
            </p>
          </div>
        </div>
        <section className="panel plan-panel">
          <div className="plan-head">
            <div>
              <p className="eyebrow">自主学习</p>
              <h2>学习规划</h2>
            </div>
            <button
              className="secondary"
              disabled={aiLoading}
              onClick={generatePlans}
            >
              {aiLoading ? '生成中…' : 'AI 生成建议'}
              <Sparkles size={15} />
            </button>
          </div>
          <div className="plan-suggestions">
            {suggestions.map((s, i) => (
              <div key={i} className={`suggestion ${s.kind}`}>
                <span className="suggestion-icon">
                  {s.kind === 'review' ? (
                    <CalendarDays size={15} />
                  ) : s.kind === 'learn' ? (
                    <GraduationCap size={15} />
                  ) : (
                    <Lightbulb size={15} />
                  )}
                </span>
                <span>{s.text}</span>
              </div>
            ))}
            {aiSuggestions.map((s, i) => (
              <div key={`ai-${i}`} className="suggestion ai">
                <span className="suggestion-icon">
                  <Sparkles size={15} />
                </span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div className="plan-tasks">
            <div className="plan-tasks-head">
              <h3>
                我的学习任务
                {todoTaskCount > 0 && (
                  <span className="count">{todoTaskCount}</span>
                )}
              </h3>
              <details className="add-task">
                <summary>添加任务</summary>
                <form className="task-form form-stack" onSubmit={addTask}>
                  <label>
                    任务名称
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="例如：整理第二章笔记"
                      maxLength={100}
                    />
                  </label>
                  <label>
                    学习内容
                    <textarea
                      rows={3}
                      value={taskContent}
                      onChange={(e) => setTaskContent(e.target.value)}
                      placeholder="记录这节课的重点、疑问、对应笔记标题…（可留空，添加后随时补充）"
                    />
                  </label>
                  <div className="task-form-row">
                    <label>
                      类型
                      <select
                        value={taskKind}
                        onChange={(e) =>
                          setTaskKind(e.target.value as 'learn' | 'review')
                        }
                      >
                        <option value="learn">学习</option>
                        <option value="review">复习</option>
                      </select>
                    </label>
                    <label>
                      关联课程
                      <select
                        value={taskCourseId}
                        onChange={(e) => setTaskCourseId(e.target.value)}
                      >
                        <option value="">不关联</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      计划日期
                      <input
                        type="date"
                        value={taskDate}
                        onChange={(e) => setTaskDate(e.target.value)}
                      />
                    </label>
                  </div>
                  <button className="primary" type="submit">
                    添加到计划
                  </button>
                </form>
              </details>
            </div>
            <input
              aria-label="搜索任务"
              placeholder="搜索任务、内容、课程或日期"
              value={taskQuery}
              onChange={(e) => setTaskQuery(e.target.value)}
            />
            {sortedTasks.length ? (
              <div className="task-list">
                {sortedTasks.map((t) => (
                  <div key={t.id} className="task-item">
                    <div className={`task-row ${t.status}`}>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={t.status === 'done'}
                          onChange={() => toggleTask(t.id)}
                          aria-label={`标记完成 ${t.title}`}
                        />
                        <span className="task-title">{t.title}</span>
                      </label>
                      <span className={`task-kind ${t.kind}`}>
                        {t.kind === 'learn' ? '学习' : '复习'}
                      </span>
                      {t.courseId && (
                        <span className="task-course">
                          {courses.find((c) => c.id === t.courseId)?.name ?? ''}
                        </span>
                      )}
                      {t.date && <span className="task-date">{t.date}</span>}
                      <button
                        className="icon-button task-expand"
                        aria-label={`查看任务详情 ${t.title}`}
                        aria-expanded={expandedTask === t.id}
                        onClick={() =>
                          setExpandedTask(expandedTask === t.id ? null : t.id)
                        }
                      >
                        <ChevronDown
                          size={14}
                          className={
                            expandedTask === t.id ? 'task-expand-open' : ''
                          }
                        />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`删除任务 ${t.title}`}
                        onClick={() =>
                          setRecordDelete({
                            kind: 'task',
                            id: t.id,
                            courseId: t.courseId ?? '',
                            title: t.title,
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {expandedTask === t.id && (
                      <div className="task-detail">
                        <button
                          onClick={() => {
                            setRecordError('');
                            setRecordEdit({
                              kind: 'task',
                              id: t.id,
                              courseId: t.courseId ?? '',
                              title: t.title,
                              content: t.content ?? '',
                              taskKind: t.kind,
                              date: t.date ?? '',
                            });
                          }}
                        >
                          编辑任务信息
                        </button>
                        {editingTaskId === t.id ? (
                          <>
                            <textarea
                              rows={4}
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              placeholder="补充学习内容…"
                            />
                            <div className="actions">
                              <button
                                className="text-button"
                                onClick={() => setEditingTaskId(null)}
                              >
                                取消
                              </button>
                              <button
                                className="primary"
                                onClick={() => saveEditTask(t.id)}
                              >
                                保存内容
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <h4>学习内容</h4>
                            {t.content ? (
                              <Markdown text={t.content} />
                            ) : (
                              <p className="muted">
                                还没有学习内容，点「编辑内容」补充。
                              </p>
                            )}
                            <div className="actions">
                              <button
                                className="text-button"
                                onClick={() => startEditTask(t)}
                              >
                                编辑内容
                              </button>
                            </div>
                          </>
                        )}
                        <p className="muted task-meta">
                          创建于 {t.createdAt.slice(0, 10)}
                          {t.status === 'done' ? ' · 已完成' : ''}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                {tasks.length
                  ? '没有匹配的任务，请调整搜索条件。'
                  : '还没有任务。点「添加任务」为自己安排一项学习或复习。'}
              </p>
            )}
          </div>
        </section>
        {reviewQueue === null ? (
          <section className="panel review-card">
            <h2>{dueNotes.length} 条笔记已到复习日期</h2>
            <p>
              写下你的回答，查看笔记解析，再自行判断是否答对。系统按
              1、3、7、14、30 天安排后续复习。
            </p>
            <button
              className="primary"
              disabled={!dueNotes.length}
              onClick={() => startReview()}
            >
              开始复习
            </button>
          </section>
        ) : reviewNote ? (
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
            <button className="primary" onClick={() => go('knowledge')}>
              回到笔记
            </button>
          </section>
        )}
      </div>
    );
  }
  const courseViewRequested = ['course', 'materials', 'study'].includes(
    activeView,
  );
  const inCourse = courses.length > 0 && courseViewRequested;
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
        <nav aria-label="主导航">
          <button
            className={activeView === 'home' ? 'active' : ''}
            onClick={() => go('home')}
          >
            <HomeIcon size={19} />
            今日学习
          </button>
          <button
            className={activeView === 'knowledge' ? 'active' : ''}
            onClick={() => go('knowledge')}
          >
            <Database size={19} />
            全部笔记
          </button>
          <button
            className={activeView === 'graph' ? 'active' : ''}
            onClick={() => go('graph')}
          >
            <Network size={19} />
            知识图谱
          </button>
          <button
            className={activeView === 'review' ? 'active' : ''}
            onClick={() => {
              setReviewQueue(null);
              go('review');
            }}
          >
            <CalendarDays size={19} />
            复习
            {dueNotes.length > 0 && (
              <span className="count">{dueNotes.length}</span>
            )}
          </button>
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
              title={c.name}
              onClick={() => {
                setMaterialChapter('');
                setMaterialQuery('');
                go('study', { course: c.id, session: c.sessions[0]?.id });
              }}
            >
              <span className={`course-dot tone-${index % 4}`} />
              <span>{c.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button onClick={() => setShowSettings(true)}>
            <Settings2 size={18} />
            设置与备份
          </button>
          <small>
            {syncStatus === 'saving'
              ? '正在保存…'
              : syncStatus === 'offline'
                ? '云端未同步'
                : '已同步'}
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
                    ? '复习'
                    : '全部笔记'}
          </span>
          <div className="topbar-end">
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
              onClick={() =>
                download(
                  JSON.stringify(workspaceState, null, 2),
                  `课伴完整备份-${localDate()}.json`,
                  'application/json',
                )
              }
            >
              下载完整备份
            </button>
          </div>
        )}
        <div className="page-stage">
          {viewStack.length > 0 && (
            <div className="back-bar">
              <button onClick={goBack}>
                <ArrowLeft size={15} />
                返回上一界面
              </button>
            </div>
          )}
          {inCourse && (
            <>
              <div className="course-heading">
                <div>
                  <p className="eyebrow">
                    {activeCourse.semester ?? preferences.semester}
                    {activeCourse.code ? ` / ${activeCourse.code}` : ''}
                  </p>
                  <h1>{activeCourse.name}</h1>
                  <button
                    className="danger course-delete-button"
                    disabled={isSending || !!uploadProgress}
                    onClick={() => setPendingCourseDelete(activeCourse)}
                  >
                    <Trash2 size={17} />
                    删除课程
                  </button>
                </div>
                <button
                  onClick={() => go('knowledge', { filter: activeCourse.id })}
                >
                  <BookOpen size={17} />
                  课程笔记 {courseNotes.length}
                </button>
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
          {activeView === 'home' || (courseViewRequested && !courses.length) ? (
            homeView()
          ) : activeView === 'course' ? (
            courseView()
          ) : activeView === 'materials' ? (
            materialsView()
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
      {newCourseOpen && (
        <Modal
          labelId="new-course-title"
          onClose={() => setNewCourseOpen(false)}
        >
          <div className="modal-heading">
            <h2 id="new-course-title">添加课程</h2>
            <button
              className="icon-button"
              aria-label="关闭"
              onClick={() => setNewCourseOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <form className="form-stack" onSubmit={addCourse}>
            <label>
              课程名称
              <input
                maxLength={60}
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="例如：概率论与数理统计"
              />
            </label>
            <button className="primary" type="submit">
              创建并上传资料
              <ChevronRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {draftNote && (
        <Modal labelId="draft-title" wide onClose={() => setDraftNote(null)}>
          <div className="modal-heading">
            <h2 id="draft-title">整理成一条知识笔记</h2>
            <button
              className="icon-button"
              aria-label="关闭草稿"
              onClick={() => setDraftNote(null)}
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
            <small className="muted">保留引用来源，保存后加入今日复习。</small>
            <button className="primary" type="submit">
              <Save size={17} />
              保存笔记
            </button>
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
          <blockquote className="source-quote">{source.quote}</blockquote>
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
      {recordEdit && (
        <Modal labelId="record-edit-title" onClose={() => setRecordEdit(null)}>
          <h2 id="record-edit-title">
            {
              {
                chapter: '修改章节',
                session: '修改对话标题',
                material: '资料重命名',
                task: '编辑任务',
                message: '编辑消息',
              }[recordEdit.kind]
            }
          </h2>
          <form className="form-stack" onSubmit={saveRecord}>
            <label>
              {recordEdit.kind === 'message' ? '消息内容' : '名称'}
              {recordEdit.kind === 'message' ? (
                <textarea
                  aria-label="消息内容"
                  required
                  rows={8}
                  value={recordEdit.title}
                  onChange={(e) =>
                    setRecordEdit({ ...recordEdit, title: e.target.value })
                  }
                />
              ) : (
                <input
                  required
                  maxLength={recordEdit.kind === 'material' ? 255 : 100}
                  value={recordEdit.title}
                  onChange={(e) =>
                    setRecordEdit({ ...recordEdit, title: e.target.value })
                  }
                />
              )}
            </label>
            {recordEdit.kind === 'task' && (
              <>
                <label>
                  学习内容
                  <textarea
                    rows={4}
                    aria-label="学习内容"
                    value={recordEdit.content ?? ''}
                    onChange={(e) =>
                      setRecordEdit({ ...recordEdit, content: e.target.value })
                    }
                  />
                </label>
                <label>
                  类型
                  <select
                    aria-label="类型"
                    value={recordEdit.taskKind}
                    onChange={(e) =>
                      setRecordEdit({
                        ...recordEdit,
                        taskKind: e.target.value as 'learn' | 'review',
                      })
                    }
                  >
                    <option value="learn">学习</option>
                    <option value="review">复习</option>
                  </select>
                </label>
                <label>
                  关联课程
                  <select
                    aria-label="关联课程"
                    value={recordEdit.courseId}
                    onChange={(e) =>
                      setRecordEdit({ ...recordEdit, courseId: e.target.value })
                    }
                  >
                    <option value="">不关联</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  计划日期
                  <input
                    type="date"
                    value={recordEdit.date ?? ''}
                    onChange={(e) =>
                      setRecordEdit({ ...recordEdit, date: e.target.value })
                    }
                  />
                </label>
              </>
            )}
            {recordEdit.kind === 'message' && (
              <p className="muted">
                修改会用于后续对话；已有回答和已保存笔记不会自动重写。
              </p>
            )}
            {recordError && (
              <p className="error" role="alert">
                {recordError}
              </p>
            )}
            <div className="actions">
              <button type="button" onClick={() => setRecordEdit(null)}>
                取消
              </button>
              <button
                className="primary"
                type="submit"
                disabled={
                  (recordEdit.kind === 'session' ||
                    recordEdit.kind === 'message') &&
                  isSending
                }
              >
                保存修改
              </button>
            </div>
          </form>
        </Modal>
      )}
      {recordDelete && (
        <Modal
          labelId="record-delete-title"
          onClose={() => setRecordDelete(null)}
        >
          <h2 id="record-delete-title">删除“{recordDelete.title}”？</h2>
          <p>
            {recordDelete.kind === 'chapter'
              ? '仅删除章节分类，原资料和笔记保留并归入“未分类”。'
              : recordDelete.kind === 'session'
                ? '将删除整段对话，已保存的笔记和原文引用保留。'
                : recordDelete.kind === 'message'
                  ? '仅删除这条消息，其他消息和已保存笔记保留。'
                  : '将删除这项学习任务及其内容。'}
            此操作无法撤销。
          </p>
          <div className="actions">
            <button onClick={() => setRecordDelete(null)}>取消</button>
            <button
              className="danger"
              disabled={
                (recordDelete.kind === 'session' ||
                  recordDelete.kind === 'message') &&
                isSending
              }
              onClick={deleteRecord}
            >
              确认删除
            </button>
          </div>
        </Modal>
      )}
      {pendingCourseDelete && (
        <Modal
          labelId="remove-course-title"
          onClose={() => setPendingCourseDelete(null)}
        >
          <h2 id="remove-course-title">
            删除课程“{pendingCourseDelete.name}”？
          </h2>
          <p>
            将删除本课程的资料列表、全部笔记、学习对话和学习任务，笔记的关联与复习记录也会一起移除。此操作无法撤销。
          </p>
          <p className="muted">
            已上传的原文件保留，以便其他笔记中的引用链接继续使用。
          </p>
          <div className="actions">
            <button onClick={() => setPendingCourseDelete(null)}>取消</button>
            <button
              className="danger"
              disabled={isSending || !!uploadProgress}
              onClick={removeCourse}
            >
              确认删除课程
            </button>
          </div>
        </Modal>
      )}
      {pendingNoteDelete && (
        <Modal
          labelId="remove-note-title"
          onClose={() => setPendingNoteDelete(null)}
        >
          <h2 id="remove-note-title">删除笔记“{pendingNoteDelete.title}”？</h2>
          <p>
            将删除这条笔记及其复习记录，并从知识图谱和其他笔记的关联中移除。此操作无法撤销。
          </p>
          <div className="actions">
            <button onClick={() => setPendingNoteDelete(null)}>取消</button>
            <button className="danger" onClick={removeNote}>
              确认删除笔记
            </button>
          </div>
        </Modal>
      )}
      {pendingDelete && (
        <Modal labelId="remove-title" onClose={() => setPendingDelete(null)}>
          <h2 id="remove-title">从课程移除资料？</h2>
          <p>{pendingDelete.name}</p>
          <p className="muted">已保存笔记中的原文链接仍可使用。</p>
          <div className="actions">
            <button onClick={() => setPendingDelete(null)}>取消</button>
            <button className="danger" onClick={removeMaterial}>
              移除资料
            </button>
          </div>
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
                {MODELS.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                download(
                  JSON.stringify(workspaceState, null, 2),
                  `课伴完整备份-${localDate()}.json`,
                  'application/json',
                )
              }
            >
              <Download size={17} />
              下载完整备份
            </button>
            <small className="muted">
              包含全部课程、对话、笔记、复习记录、已提取正文和原文件链接。原文件请在资料页单独下载。
            </small>
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
