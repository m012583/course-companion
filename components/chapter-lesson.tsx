'use client';
import { useState } from 'react';
import {
  BookOpen,
  MessageCircle,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { GuideChapter } from '@/lib/course-guide';
import {
  readLessonContent,
  type ChapterLesson,
  type LessonContent,
} from '@/lib/chapter-lesson';
import LearningMarkdown from './learning-markdown';

export type LessonActions = {
  onSource?: (evidence: import('@/lib/knowledge').Evidence) => void;
  busy: boolean;
  busyId?: string;
  isStale: (chapter: GuideChapter) => boolean;
  onGenerate: (chapter: GuideChapter) => void;
  onSave: (chapterId: string, lesson: ChapterLesson) => void;
  onAsk: (chapter: GuideChapter, concept?: string, question?: string) => void;
};
export default function ChapterLessonPanel({
  chapter,
  actions,
}: {
  chapter: GuideChapter;
  actions: LessonActions;
}) {
  const lesson =
    chapter.lesson && !chapter.lesson.deletedAt ? chapter.lesson : undefined;
  const [draft, setDraft] = useState<LessonContent | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'regenerate' | 'delete' | null>(null);
  const busy = actions.busy;
  const currentBusy = actions.busyId === chapter.id;
  const ask = (concept?: string, question?: string) =>
    actions.onAsk(chapter, concept, question);
  function save() {
    if (!draft || !lesson) return;
    try {
      const content = readLessonContent(draft);
      actions.onSave(chapter.id, {
        ...lesson,
        ...content,
        source: 'manual',
        updatedAt: new Date().toISOString(),
      });
      setDraft(null);
      setError('');
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '请检查内容。');
    }
  }
  if (!lesson)
    return (
      <section className="chapter-lesson lesson-empty" aria-label="章节讲解">
        <BookOpen size={22} />
        <div>
          <h4>把知识点讲明白</h4>
          <p>
            {chapter.lesson?.deletedAt
              ? '这章的讲解已删除，可以恢复原内容。'
              : '逐个解释这些知识点，配上一个例子和容易混淆的地方。'}
          </p>
        </div>
        <div className="actions">
          {chapter.lesson?.deletedAt ? (
            <button
              disabled={busy}
              onClick={() =>
                actions.onSave(chapter.id, {
                  ...chapter.lesson!,
                  deletedAt: undefined,
                })
              }
            >
              恢复讲解
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy}
              onClick={() => actions.onGenerate(chapter)}
            >
              <Sparkles size={15} />
              {currentBusy ? '正在生成本章…' : '生成本章讲解'}
            </button>
          )}
        </div>
        <small>
          每章一次 AI 调用 · 生成后自动保存，阅读和点击提问入口不调用 AI
        </small>
      </section>
    );
  return (
    <section className="chapter-lesson" aria-label="章节讲解">
      <header className="lesson-heading">
        <div>
          <span className="eyebrow">读懂每个知识点</span>
          <h4>本章讲解</h4>
          <small>
            {lesson.source === 'ai'
              ? 'AI 生成 · 请结合课堂资料核对'
              : '已手动修改'}{' '}
            · 已保存
          </small>
        </div>
        <div className="actions">
          <button disabled={busy || !!draft} onClick={() => ask()}>
            <MessageCircle size={15} />
            就本章提问
          </button>
          <button
            disabled={busy || !!draft}
            aria-label="编辑本章讲解"
            onClick={() => {
              setDraft(structuredClone(lesson));
              setError('');
            }}
          >
            <Pencil size={15} />
          </button>
          <button
            disabled={busy || !!draft}
            aria-label="重新生成本章讲解"
            onClick={() => setConfirm('regenerate')}
          >
            <RefreshCw size={15} />
          </button>
          <button
            disabled={busy || !!draft}
            aria-label="删除本章讲解"
            onClick={() => setConfirm('delete')}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      {!!lesson.evidence?.length && (
        <details className="lesson-evidence">
          <summary>
            教材依据 · {lesson.evidence.length} 个片段（生成时快照）
          </summary>
          <p className="muted">
            编号可定位原文，不代表已验证每个推理。教材更新后请重新生成讲解。
          </p>
          <div className="source-chips">
            {lesson.evidence.map((e) => (
              <button key={e.id} onClick={() => actions.onSource?.(e)}>
                [{e.id}] {e.name} · {e.page ? `第 ${e.page} 页` : e.section}
              </button>
            ))}
          </div>
        </details>
      )}
      {actions.isStale(chapter) && (
        <p className="notice">
          目录或教材选择已经变化，这份讲解仍对应之前的内容。确认后可重新生成。
        </p>
      )}
      {confirm && (
        <div className="lesson-confirm" role="alert">
          <p>
            {confirm === 'delete'
              ? '删除本章讲解？目录、笔记和问答会保留，讲解可恢复。'
              : '重新生成会替换这份讲解，包括手动修改。原有问答保留。'}
          </p>
          <div className="actions">
            <button onClick={() => setConfirm(null)}>取消</button>
            <button
              disabled={busy}
              className={confirm === 'delete' ? 'danger' : 'primary'}
              onClick={() => {
                if (confirm === 'delete')
                  actions.onSave(chapter.id, {
                    ...lesson,
                    deletedAt: new Date().toISOString(),
                  });
                else actions.onGenerate(chapter);
                setConfirm(null);
              }}
            >
              {confirm === 'delete' ? '确认删除讲解' : '确认重新生成'}
            </button>
          </div>
        </div>
      )}
      {draft ? (
        <div className="lesson-editor">
          <label>
            本章导读
            <textarea
              rows={4}
              maxLength={600}
              value={draft.overview}
              onChange={(e) => setDraft({ ...draft, overview: e.target.value })}
            />
          </label>
          {draft.concepts.map((concept, index) => (
            <fieldset key={index}>
              <legend>{concept.term}</legend>
              {(['explanation', 'example', 'pitfall'] as const).map((field) => (
                <label key={field}>
                  {
                    {
                      explanation: '知识点解释',
                      example: '一个例子',
                      pitfall: '容易混淆',
                    }[field]
                  }
                  <textarea
                    rows={field === 'explanation' ? 5 : 3}
                    maxLength={
                      { explanation: 700, example: 500, pitfall: 240 }[field]
                    }
                    value={concept[field]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        concepts: draft.concepts.map((item, i) =>
                          i === index
                            ? { ...item, [field]: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <label>
            本章小结（每行一项）
            <textarea
              rows={4}
              value={draft.recap.join('\n')}
              onChange={(e) =>
                setDraft({ ...draft, recap: e.target.value.split('\n') })
              }
            />
          </label>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              onClick={() => {
                setDraft(null);
                setError('');
              }}
            >
              <X size={15} />
              取消修改
            </button>
            <button className="primary" onClick={save}>
              <Save size={15} />
              保存讲解
            </button>
          </div>
        </div>
      ) : (
        <>
          <LearningMarkdown text={lesson.overview} />
          {lesson.concepts.map((concept, index) => (
            <article className="lesson-concept" key={concept.term}>
              <div className="lesson-concept-title">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h5>{concept.term}</h5>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => ask(concept.term)}
                  aria-label={`提问：${concept.term}`}
                >
                  <MessageCircle size={14} />
                  提问
                </button>
              </div>
              <LearningMarkdown text={concept.explanation} />
              <div className="lesson-example">
                <span>一个例子</span>
                <LearningMarkdown text={concept.example} />
              </div>
              <div className="lesson-pitfall">
                <span>容易混淆</span>
                <LearningMarkdown text={concept.pitfall} />
              </div>
              <div
                className="lesson-question-links"
                aria-label={`${concept.term}的延伸提问`}
              >
                {concept.questions.map((question) => (
                  <button
                    key={question}
                    disabled={busy}
                    onClick={() => ask(concept.term, question)}
                  >
                    <LearningMarkdown text={question} inline />
                    <MessageCircle size={13} />
                  </button>
                ))}
              </div>
            </article>
          ))}
          <div className="lesson-recap">
            <h5>这一章，记住这些</h5>
            <LearningMarkdown
              text={lesson.recap.map((item) => `- ${item}`).join('\n')}
            />
          </div>
          <p className="lesson-ask-hint">
            点击“提问”或上方问题，会带着这段讲解进入独立问答，你可以修改问题后再发送。
          </p>
        </>
      )}
    </section>
  );
}
