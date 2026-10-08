'use client';
import { useEffect, useRef, useState } from 'react';
import ChapterLessonPanel, { type LessonActions } from './chapter-lesson';
import { contentFingerprint } from '@/lib/textbook-calibration';
import {
  lessonRequest,
  lessonSourceKey,
  readSavedLesson,
  type ChapterLesson,
} from '@/lib/chapter-lesson';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  List,
  LoaderCircle,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_GUIDE_SETTINGS,
  readGuideContent,
  readGuideRequest,
  type CourseGuide,
  type GuideChapter,
  type GuideContent,
} from '@/lib/course-guide';

function GuideContentView({
  content,
  courseName,
  onCreateNote,
  initialChapterId,
  lessonActions,
}: {
  content: GuideContent;
  courseName: string;
  onCreateNote?: (chapter: GuideChapter) => void;
  initialChapterId?: string;
  lessonActions?: LessonActions;
}) {
  const [selectedId, setSelectedId] = useState(
    initialChapterId || content.chapters[0]?.id,
  );
  const [view, setView] = useState<'cards' | 'map'>('cards');
  const chapter =
    content.chapters.find((item) => item.id === selectedId) ??
    content.chapters[0];
  const index = content.chapters.findIndex((item) => item.id === chapter?.id);
  if (!chapter) return null;
  return (
    <div className="guide-content-view">
      <div className="guide-view-toolbar">
        <span>
          {content.chapters.length} 个章节 ·{' '}
          {content.chapters.reduce(
            (sum, item) => sum + item.keyConcepts.length,
            0,
          )}{' '}
          个知识点
        </span>
        <fieldset className="guide-view-switch" aria-label="导览显示方式">
          <button
            type="button"
            aria-pressed={view === 'cards'}
            onClick={() => setView('cards')}
          >
            <List size={15} />
            章节卡片
          </button>
          <button
            type="button"
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
          >
            <Network size={15} />
            结构图
          </button>
        </fieldset>
      </div>
      {view === 'map' ? (
        <div className="guide-map">
          <div className="guide-map-root">
            <BookOpen size={20} />
            <strong>{courseName}</strong>
            <small>课程 → 章节 → 知识点</small>
          </div>
          <ol className="guide-map-branches">
            {content.chapters.map((item, position) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="guide-map-chapter"
                  onClick={() => {
                    setSelectedId(item.id);
                    setView('cards');
                  }}
                >
                  <span>{String(position + 1).padStart(2, '0')}</span>
                  <strong>{item.title}</strong>
                  <ArrowRight size={15} />
                </button>
                <ul>
                  {item.keyConcepts.filter(Boolean).map((point, pointIndex) => (
                    <li key={pointIndex}>{point}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="guide-map-hint">点击章节查看概览。连线表示内容归属。</p>
        </div>
      ) : (
        <div className="guide-reading-layout">
          <nav className="guide-toc" aria-label="导览章节目录">
            <p>课程目录</p>
            {content.chapters.map((item, position) => (
              <button
                type="button"
                key={item.id}
                aria-current={chapter.id === item.id ? 'true' : undefined}
                onClick={() => setSelectedId(item.id)}
              >
                <span>{String(position + 1).padStart(2, '0')}</span>
                <strong>{item.title}</strong>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
          <article
            className="guide-chapter-card"
            aria-label={`章节概览：${chapter.title}`}
          >
            <div className="guide-chapter-kicker">
              <span>CHAPTER {String(index + 1).padStart(2, '0')}</span>
              <span>快速了解这一章</span>
            </div>
            <h3>{chapter.title}</h3>
            <p className="guide-narrative">{chapter.narrative}</p>
            <h4>主要知识点</h4>
            <ul className="guide-concept-list">
              {chapter.keyConcepts.map((point, position) => (
                <li key={position}>
                  <span>{String(position + 1).padStart(2, '0')}</span>
                  {lessonActions ? (
                    <button
                      className="lesson-concept-link"
                      disabled={lessonActions.busy}
                      onClick={() => lessonActions.onAsk(chapter, point)}
                      title={`就「${point}」提问`}
                    >
                      {point}
                      <ArrowRight size={13} />
                    </button>
                  ) : (
                    point
                  )}
                </li>
              ))}
            </ul>
            {lessonActions && (
              <ChapterLessonPanel
                key={chapter.id}
                chapter={chapter}
                actions={lessonActions}
              />
            )}
            <div className="guide-chapter-context">
              <section>
                <h4>先了解这些</h4>
                <p>
                  {chapter.prerequisites.length
                    ? chapter.prerequisites.join('、')
                    : '从本章开始即可。'}
                </p>
              </section>
              <section>
                <h4>学完能做什么</h4>
                <ul>
                  {chapter.learningGoals.map((goal, position) => (
                    <li key={position}>
                      <Check size={14} />
                      {goal}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <footer>
              <div className="actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="上一章"
                  disabled={index === 0}
                  onClick={() => setSelectedId(content.chapters[index - 1].id)}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  {index + 1} / {content.chapters.length}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="下一章"
                  disabled={index === content.chapters.length - 1}
                  onClick={() => setSelectedId(content.chapters[index + 1].id)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              {onCreateNote && (
                <button type="button" onClick={() => onCreateNote(chapter)}>
                  <FilePlus2 size={16} />
                  整理为笔记
                </button>
              )}
            </footer>
          </article>
        </div>
      )}
    </div>
  );
}

export default function CourseGuidePanel({
  courseName,
  guide,
  onEdit,
  onUpload,
  onCreateNote,
  onDelete,
  model,
  initialChapterId,
  onSaveLesson,
  onAsk,
  canGenerate = true,
  materials = [],
  onSource,
}: {
  courseName: string;
  guide?: CourseGuide;
  onEdit: () => void;
  onUpload: () => void;
  onCreateNote: (chapter: GuideChapter) => void;
  onDelete: () => void;
  model: string;
  initialChapterId?: string;
  onSaveLesson: (
    chapterId: string,
    lesson: ChapterLesson,
    expectedSourceKey?: string,
  ) => void;
  onAsk: (chapter: GuideChapter, concept?: string, question?: string) => void;
  canGenerate?: boolean;
  materials?: import('@/lib/knowledge').Material[];
  onSource?: (evidence: import('@/lib/knowledge').Evidence) => void;
}) {
  const [progress, setProgress] = useState<{
    id: string;
    title: string;
    index: number;
    total: number;
  } | null>(null);
  const [generationError, setGenerationError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!canGenerate) controller.current?.abort();
  }, [canGenerate]);
  const missing = guide?.chapters.filter((chapter) => !chapter.lesson) ?? [];
  const savedCount =
    guide?.chapters.filter(
      (chapter) => chapter.lesson && !chapter.lesson.deletedAt,
    ).length ?? 0;
  async function generateChapters(chapters: GuideChapter[]) {
    if (!guide || !canGenerate || controller.current || !chapters.length)
      return;
    const abort = new AbortController();
    controller.current = abort;
    setGenerationError('');
    try {
      for (let index = 0; index < chapters.length; index++) {
        if (abort.signal.aborted) break;
        const chapter = chapters[index];
        setProgress({
          id: chapter.id,
          title: chapter.title,
          index: index + 1,
          total: chapters.length,
        });
        const input = lessonRequest(courseName, guide, chapter, model);
        const response = await fetch('/api/chapter-lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({ ...input, contexts: materials }),
        });
        const data = (await response.json()) as {
          lesson?: ChapterLesson;
          error?: string;
        };
        if (!response.ok || !data.lesson)
          throw new Error(`「${chapter.title}」：${data.error || '生成失败'}`);
        const lesson = readSavedLesson(data.lesson);
        if (abort.signal.aborted) break;
        onSaveLesson(chapter.id, lesson, lessonSourceKey(input));
      }
    } catch (issue) {
      if (!abort.signal.aborted)
        setGenerationError(
          (issue instanceof Error ? issue.message : '生成失败。') +
            ' 已完成的章节已保留，可继续补全。',
        );
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setProgress(null);
      }
    }
  }
  if (!guide || !guide.chapters.length)
    return (
      <section className="guide-empty">
        <div className="guide-empty-copy">
          <span className="guide-label">
            <Sparkles size={14} />
            课程导览
          </span>
          <h2>先看全貌，再慢慢学懂</h2>
          <p>
            还没有课程资料也没关系。根据「{courseName}
            」生成一份简短目录，看看每一章学什么、需要先了解什么。
          </p>
          <div className="actions">
            <button className="primary" onClick={onEdit}>
              <Sparkles size={16} />
              生成课程导览
            </button>
            <button onClick={onUpload}>上传课程资料</button>
          </div>
          <small>生成后可预览、修改；保存后随时浏览。</small>
        </div>
        <div className="guide-empty-illustration" aria-hidden="true">
          <div className="guide-illustration-root">
            <BookOpen size={22} />
            你的课程
          </div>
          <div className="guide-illustration-branch">
            <span>01</span>建立基础<small>先理解核心概念</small>
          </div>
          <div className="guide-illustration-branch">
            <span>02</span>连接知识<small>看清章节间的关系</small>
          </div>
          <div className="guide-illustration-branch">
            <span>03</span>开始应用<small>知道学完能做什么</small>
          </div>
        </div>
      </section>
    );
  return (
    <section className="course-guide-panel">
      <header className="guide-intro">
        <div>
          <span className="guide-label">
            <BookOpen size={14} />
            课程导览
          </span>
          <h2>这门课，从这里读起</h2>
        </div>
        <div className="actions guide-intro-actions">
          <button onClick={onEdit} disabled={!!progress}>
            <Pencil size={16} />
            编辑导览
          </button>
          <button
            className="icon-button"
            aria-label="删除课程导览"
            onClick={onDelete}
            disabled={!!progress}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <p>{guide.courseOverview}</p>
        <div className="guide-provenance">
          <span>{guide.source === 'ai' ? 'AI 初稿' : '手动整理'}</span>
          <span>{guide.settings.level}</span>
          <small>目录为预习框架 · 可到「教材与自测」对照真实资料</small>
        </div>
        {guide.generatedFor !== courseName && (
          <small className="guide-name-notice">
            这份导览按「{guide.generatedFor}」编写，课程改名后可在编辑中更新。
          </small>
        )}
      </header>
      <div className="lesson-course-toolbar">
        <div>
          <strong>章节讲解</strong>
          <span>
            {savedCount} / {guide.chapters.length} 章已有内容
          </span>
          <small>
            {materials.length
              ? '生成时带入所选教材片段，引用可以核对。'
              : '未选择教材，生成通用学习草稿。'}
            已保存内容不会重复生成。
          </small>
        </div>
        {progress ? (
          <output className="lesson-progress">
            <LoaderCircle size={16} className="spin" />
            <span>
              {progress.index}/{progress.total} · {progress.title}
            </span>
            <button onClick={() => controller.current?.abort()}>
              停止生成
            </button>
          </output>
        ) : (
          <button
            disabled={!missing.length || !canGenerate}
            onClick={() => void generateChapters(missing)}
          >
            <Sparkles size={15} />
            {missing.length
              ? `补全章节讲解（${missing.length} 章）`
              : '章节已全部处理'}
          </button>
        )}
      </div>
      {generationError && (
        <p className="notice" role="alert">
          {generationError}
        </p>
      )}
      {!canGenerate && (
        <p className="notice">
          请先处理页面顶部的保存问题，再生成新讲解。已有内容仍可阅读。
        </p>
      )}
      <GuideContentView
        key={initialChapterId || 'guide-content'}
        content={guide}
        courseName={courseName}
        onCreateNote={onCreateNote}
        initialChapterId={initialChapterId}
        lessonActions={{
          onSource,
          busy: !!progress || !canGenerate,
          busyId: progress?.id,
          onGenerate: (chapter) => void generateChapters([chapter]),
          onSave: onSaveLesson,
          onAsk,
          isStale: (chapter) =>
            !!chapter.lesson &&
            (chapter.lesson.sourceKey !==
              lessonSourceKey(lessonRequest(courseName, guide, chapter)) ||
              (materials.length > 0 &&
                chapter.lesson.materialFingerprint !==
                  contentFingerprint(materials)) ||
              (materials.length === 0 && !!chapter.lesson.materialFingerprint)),
        }}
      />
    </section>
  );
}

const emptyChapter = (): GuideChapter => ({
  id: crypto.randomUUID(),
  title: '',
  narrative: '',
  keyConcepts: [''],
  prerequisites: [],
  learningGoals: [''],
});

export function CourseGuideEditor({
  courseName,
  guide,
  model,
  isNew = false,
  onSave,
  onCreateEmpty,
  onClose,
}: {
  courseName: string;
  guide?: CourseGuide;
  model: string;
  isNew?: boolean;
  onSave: (name: string, guide: CourseGuide) => void;
  onCreateEmpty?: (name: string, upload: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(courseName);
  const [settings, setSettings] = useState(
    guide?.settings ?? DEFAULT_GUIDE_SETTINGS,
  );
  const [draft, setDraft] = useState<GuideContent | null>(guide ?? null);
  const [source, setSource] = useState<CourseGuide['source']>(
    guide?.source ?? 'manual',
  );
  const [generatedFor, setGeneratedFor] = useState(
    guide?.generatedFor ?? courseName,
  );
  const [generatedSettings, setGeneratedSettings] = useState(
    guide?.settings ?? DEFAULT_GUIDE_SETTINGS,
  );
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'close' | 'regenerate' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      element?.close();
      controller.current?.abort();
    };
  }, []);
  function close() {
    if (dirty) setConfirm('close');
    else onClose();
  }
  function updateChapter(id: string, patch: Partial<GuideChapter>) {
    setDirty(true);
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((item) =>
              item.id === id ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  }
  function moveChapter(index: number, direction: number) {
    if (!draft) return;
    const chapters = [...draft.chapters];
    [chapters[index], chapters[index + direction]] = [
      chapters[index + direction],
      chapters[index],
    ];
    setDraft({ ...draft, chapters });
    setDirty(true);
  }
  function validatedName() {
    if (!name.trim() || name.length > 60) {
      setError('请填写 60 字以内的课程名称。');
      return '';
    }
    return name.trim();
  }
  async function generate() {
    if (controller.current) return;
    let request;
    try {
      request = readGuideRequest({ ...settings, courseName: name, model });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '请检查课程信息。');
      return;
    }
    setConfirm(null);
    setError('');
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch('/api/course-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify(request),
      });
      const data = (await response.json()) as {
        draft?: GuideContent;
        error?: string;
      };
      if (!response.ok || !data.draft)
        throw new Error(data.error || '生成失败，请重试。');
      const content = readGuideContent(data.draft, true);
      if (abort.signal.aborted) return;
      setDraft(content);
      setSource('ai');
      setGeneratedFor(request.courseName);
      setGeneratedSettings({
        level: request.level,
        major: request.major,
        textbook: request.textbook,
        chapterCount: request.chapterCount,
      });
      setEditing(false);
      setDirty(true);
    } catch (issue) {
      if (!abort.signal.aborted)
        setError(issue instanceof Error ? issue.message : '生成失败，请重试。');
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  function save() {
    if (!draft || busy) return;
    const courseTitle = validatedName();
    if (!courseTitle) return;
    try {
      const content = readGuideContent(
        {
          ...draft,
          chapters: draft.chapters.map((chapter) => ({
            ...chapter,
            keyConcepts: chapter.keyConcepts.filter((item) => item.trim()),
            prerequisites: chapter.prerequisites.filter((item) => item.trim()),
            learningGoals: chapter.learningGoals.filter((item) => item.trim()),
          })),
        },
        true,
      );
      const now = new Date().toISOString();
      onSave(courseTitle, {
        ...content,
        version: 1,
        source,
        generatedFor: source === 'ai' ? generatedFor : courseTitle,
        settings: source === 'ai' ? generatedSettings : settings,
        createdAt: guide?.createdAt || now,
        updatedAt: now,
      });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '请检查导览内容。');
      setEditing(true);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={`modal guide-editor ${draft ? 'has-draft' : ''}`}
      aria-labelledby="guide-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">先有一张地图，再开始探索</p>
          <h2 id="guide-editor-title">
            {isNew ? '新建课程' : guide ? '编辑课程导览' : '生成课程导览'}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭导览编辑"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {confirm && (
        <div className="guide-confirm" role="alert">
          <p>
            {confirm === 'close'
              ? '本次草稿尚未保存，确定放弃吗？'
              : '重新生成会替换当前编辑草稿，并调用一次 AI。已保存的版本仍保留到你再次保存。'}
          </p>
          <div className="actions">
            <button type="button" onClick={() => setConfirm(null)}>
              {confirm === 'close' ? '继续编辑' : '取消'}
            </button>
            <button
              type="button"
              className={confirm === 'close' ? 'danger' : 'primary'}
              onClick={confirm === 'close' ? onClose : () => void generate()}
            >
              {confirm === 'close' ? '放弃本次修改' : '生成并替换草稿'}
            </button>
          </div>
        </div>
      )}
      <fieldset className="guide-editor-fields" disabled={busy}>
        {isNew ? (
          <label className="guide-name-field">
            课程名称
            <input
              autoFocus
              maxLength={60}
              value={name}
              placeholder="例如：线性代数、数据结构、管理学"
              onChange={(event) => {
                setName(event.target.value);
                setDirty(true);
              }}
            />
          </label>
        ) : (
          <p className="guide-editor-course">
            <BookOpen size={18} />
            {name}
          </p>
        )}
        <details className="guide-settings">
          <summary>
            调整生成范围{' '}
            <span>
              {settings.level} · {settings.chapterCount} 章
            </span>
          </summary>
          <div className="guide-settings-grid">
            <label>
              学习阶段
              <select
                value={settings.level}
                onChange={(event) =>
                  setSettings({ ...settings, level: event.target.value })
                }
              >
                <option>大学本科 · 入门概览</option>
                <option>大学本科 · 进阶学习</option>
                <option>研究生 · 基础概览</option>
                <option>通识学习 · 零基础</option>
              </select>
            </label>
            <label>
              生成章节数
              <select
                value={settings.chapterCount}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    chapterCount: Number(event.target.value),
                  })
                }
              >
                {Array.from({ length: 9 }, (_, index) => index + 4).map(
                  (count) => (
                    <option key={count} value={count}>
                      {count} 章
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              专业方向（选填）
              <input
                maxLength={100}
                value={settings.major}
                placeholder="例如：计算机、经济管理"
                onChange={(event) =>
                  setSettings({ ...settings, major: event.target.value })
                }
              />
            </label>
            <label>
              教材名称（选填）
              <input
                maxLength={180}
                value={settings.textbook}
                placeholder="仅作方向提示，不代表真实教材目录"
                onChange={(event) =>
                  setSettings({ ...settings, textbook: event.target.value })
                }
              />
            </label>
          </div>
        </details>
        <div className="guide-generate-box">
          <div>
            <strong>
              <Sparkles size={16} />
              {draft ? '需要换一个框架？' : '从课程名，生成第一份学习地图'}
            </strong>
            <p>
              目录、每章简介与主要知识点，一次生成。仅主动生成时消耗 AI token。
            </p>
          </div>
          <button
            type="button"
            className={draft ? '' : 'primary'}
            onClick={() => (draft ? setConfirm('regenerate') : void generate())}
          >
            {draft ? <RefreshCw size={16} /> : <Sparkles size={16} />}
            {draft ? '重新生成' : '生成一版导览'}
          </button>
        </div>
      </fieldset>
      {busy && (
        <output className="guide-generating" aria-live="polite">
          <LoaderCircle size={18} className="spin" />
          <span>正在整理目录和知识点，请稍候…</span>
          <button
            type="button"
            onClick={() => {
              controller.current?.abort();
              controller.current = null;
              setBusy(false);
              setError('已停止生成，原有草稿保留。');
            }}
          >
            停止生成
          </button>
        </output>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {draft ? (
        <>
          <div className="guide-draft-heading">
            <div>
              <span className="guide-label">
                {source === 'ai' ? 'AI 初稿' : '手动整理'} ·{' '}
                {dirty ? '尚未保存' : '已保存版本'}
              </span>
              <small>通用预习框架，需结合授课教材核对。</small>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(!editing)}
            >
              {editing ? <BookOpen size={15} /> : <Pencil size={15} />}
              {editing ? '预览导览' : '修改内容'}
            </button>
          </div>
          {editing ? (
            <fieldset
              className="guide-editor-fields guide-content-edit"
              disabled={busy}
            >
              <label>
                课程概览
                <textarea
                  rows={3}
                  maxLength={600}
                  value={draft.courseOverview}
                  onChange={(event) => {
                    setDraft({ ...draft, courseOverview: event.target.value });
                    setDirty(true);
                  }}
                  placeholder="这门课主要学什么，学习路线是什么？"
                />
              </label>
              {draft.chapters.map((chapter, index) => (
                <section className="guide-chapter-editor" key={chapter.id}>
                  <header>
                    <strong>第 {index + 1} 章</strong>
                    <div className="actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`上移第${index + 1}章`}
                        disabled={index === 0}
                        onClick={() => moveChapter(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`下移第${index + 1}章`}
                        disabled={index === draft.chapters.length - 1}
                        onClick={() => moveChapter(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`删除第${index + 1}章`}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            chapters: draft.chapters.filter(
                              (item) => item.id !== chapter.id,
                            ),
                          });
                          setDirty(true);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </header>
                  <label>
                    章节名称
                    <input
                      maxLength={60}
                      value={chapter.title}
                      onChange={(event) =>
                        updateChapter(chapter.id, { title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    本章简介
                    <textarea
                      rows={3}
                      maxLength={360}
                      value={chapter.narrative}
                      onChange={(event) =>
                        updateChapter(chapter.id, {
                          narrative: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    主要知识点（每行一项，最多 6 项）
                    <textarea
                      rows={4}
                      maxLength={606}
                      value={chapter.keyConcepts.join('\n')}
                      onChange={(event) =>
                        updateChapter(chapter.id, {
                          keyConcepts: event.target.value.split('\n'),
                        })
                      }
                    />
                  </label>
                  <div className="guide-settings-grid">
                    <label>
                      前置知识（选填，每行一项，最多 4 项）
                      <textarea
                        rows={2}
                        maxLength={404}
                        value={chapter.prerequisites.join('\n')}
                        onChange={(event) =>
                          updateChapter(chapter.id, {
                            prerequisites: event.target.value.split('\n'),
                          })
                        }
                      />
                    </label>
                    <label>
                      学完能做什么（每行一项，最多 3 项）
                      <textarea
                        rows={2}
                        maxLength={303}
                        value={chapter.learningGoals.join('\n')}
                        onChange={(event) =>
                          updateChapter(chapter.id, {
                            learningGoals: event.target.value.split('\n'),
                          })
                        }
                      />
                    </label>
                  </div>
                </section>
              ))}
              <button
                type="button"
                className="guide-add-chapter"
                disabled={draft.chapters.length >= 16}
                onClick={() => {
                  setDraft({
                    ...draft,
                    chapters: [...draft.chapters, emptyChapter()],
                  });
                  setDirty(true);
                }}
              >
                <Plus size={16} />
                添加章节
              </button>
            </fieldset>
          ) : (
            <>
              <p className="guide-draft-overview">{draft.courseOverview}</p>
              <GuideContentView content={draft} courseName={name || '新课程'} />
            </>
          )}
        </>
      ) : (
        <div className="guide-start-hint">
          <p>只需一个课程名。你也可以自己编写，再逐步补充资料。</p>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setDraft({ courseOverview: '', chapters: [emptyChapter()] });
              setEditing(true);
              setSource('manual');
              setDirty(true);
            }}
          >
            手动编写导览
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      <footer className="guide-editor-footer">
        <small>
          {draft
            ? '保存后可随时修改、查看结构图。'
            : '还没有资料，也能开始学习。'}
        </small>
        <div className="actions">
          {!draft && onCreateEmpty && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const title = validatedName();
                  if (title) onCreateEmpty(title, false);
                }}
              >
                创建空白课程
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const title = validatedName();
                  if (title) onCreateEmpty(title, true);
                }}
              >
                创建并上传资料
              </button>
            </>
          )}
          {draft && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={save}
            >
              <Save size={16} />
              {isNew ? '保存导览并创建课程' : '保存导览'}
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}
