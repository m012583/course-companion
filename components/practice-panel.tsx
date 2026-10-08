'use client';
import { practiceAdvice } from '@/lib/learning-flow';
import { useState, useRef, useEffect } from 'react';
import type { Evidence } from '@/lib/knowledge';
import type { GuideChapter } from '@/lib/course-guide';
import type { LearningCheck } from '@/lib/learning-check';
import { validatePlan } from '@/lib/review-plans';
import type { ReviewPlan } from '@/lib/review-plans';
import {
  answerQuestion,
  checkToDrafts,
  emptyPractice,
  latestAttempt,
  planFromAttempt,
  validateQuestion,
  weakTerms,
  type PracticeQuestion,
  type PracticeState,
} from '@/lib/practice';
import LearningMarkdown from './learning-markdown';

export default function PracticePanel({
  course,
  state = emptyPractice(),
  checks,
  disabled,
  onChange,
  onSource,
  onPlan,
  initialFilter = 'all',
  initialQuestionId = '',
  focusCheckId,
  onExplain,
  onTarget,
}: {
  initialFilter?: string;
  initialQuestionId?: string;
  focusCheckId?: string;
  onExplain?: (term: string, prompt: string) => void;
  onTarget?: (question: PracticeQuestion) => void;
  course: { id: string; name: string; guide?: { chapters: GuideChapter[] } };
  state?: PracticeState;
  checks: LearningCheck[];
  disabled: boolean;
  onChange: (p: PracticeState) => void;
  onSource: (e: Evidence) => void;
  onPlan: (p: ReviewPlan, state: PracticeState) => void;
}) {
  const [filter, setFilter] = useState(initialFilter),
    [query, setQuery] = useState(''),
    [chapter, setChapter] = useState('');
  const [editing, setEditing] = useState<PracticeQuestion | null>(() => {
      const q = state.questions.find(
        (q) =>
          q.id === initialQuestionId && !q.deletedAt && q.status === 'draft',
      );
      return q ? structuredClone(q) : null;
    }),
    [error, setError] = useState('');
  const [active, setActive] = useState(
      state.questions.some(
        (q) =>
          q.id === initialQuestionId && !q.deletedAt && q.status === 'ready',
      )
        ? initialQuestionId
        : '',
    ),
    [answer, setAnswer] = useState(-1),
    [submitted, setSubmitted] = useState(false);
  const [preview, setPreview] = useState<{
    plan: ReviewPlan;
    attemptId: string;
  } | null>(null);
  const [removeId, setRemoveId] = useState('');
  const focusRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active) {
      focusRef.current?.scrollIntoView({ block: 'start' });
      focusRef.current?.focus({ preventScroll: true });
    }
  }, [active]);
  const editingId = editing?.id,
    previewId = preview?.attemptId;
  useEffect(() => {
    if (editingId) {
      editorRef.current?.scrollIntoView({ block: 'start' });
      editorRef.current?.focus({ preventScroll: true });
    }
  }, [editingId]);
  useEffect(() => {
    if (previewId) {
      previewRef.current?.scrollIntoView({ block: 'start' });
      previewRef.current?.focus({ preventScroll: true });
    }
  }, [previewId]);
  const chosen = state.questions.find((q) => q.id === active && !q.deletedAt);
  const last = chosen ? latestAttempt(state, chosen.id) : undefined;
  const rows = state.questions.filter(
    (q) =>
      (!focusCheckId || q.originId?.startsWith(`${focusCheckId}:`)) &&
      (filter === 'trash' ? !!q.deletedAt : !q.deletedAt) &&
      (!chapter || q.chapterId === chapter) &&
      `${q.prompt} ${q.term}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (filter !== 'wrong' || latestAttempt(state, q.id)?.correct === false) &&
      (filter !== 'draft' || q.status === 'draft'),
  );
  function save() {
    if (!editing || disabled) return;
    try {
      validateQuestion(editing);
      const old = state.questions.find((q) => q.id === editing.id);
      const q = {
        ...editing,
        version: old ? old.version + 1 : 1,
        updatedAt: new Date().toISOString(),
      };
      onChange({
        ...state,
        questions: old
          ? state.questions.map((p) => (p.id === q.id ? q : p))
          : [...state.questions, q],
      });
      setEditing(null);
      setError('');
      setActive(q.status === 'ready' ? q.id : '');
      setAnswer(-1);
      setSubmitted(false);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法保存题目');
    }
  }
  function create() {
    const now = new Date().toISOString();
    setError('');
    setEditing({
      id: crypto.randomUUID(),
      version: 1,
      kind: 'choice',
      prompt: '',
      options: ['', '', '', ''],
      correct: 0,
      explanation: '',
      term: '',
      chapterId: '',
      evidence: [],
      source: 'manual',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  }
  return (
    <section className="practice-panel">
      {initialQuestionId &&
        !state.questions.some(
          (q) => q.id === initialQuestionId && !q.deletedAt,
        ) && (
          <p className="notice">
            关联题目已删除或暂不可用，可在已删除题目中查找恢复。
          </p>
        )}
      {!editing && error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <section className="panel">
        <div className="lab-section-heading">
          <div>
            <h3>题库与错题</h3>
            <p className="muted">
              先核对草稿中的题目、答案与依据，再开始练习。历史作答会保留。
            </p>
          </div>
          <button className="primary" disabled={disabled} onClick={create}>
            手动建题
          </button>
        </div>
        <details className="practice-filter-details">
          <summary>查找与筛选 · {rows.length} 题</summary>
          <div className="practice-filters">
            <label>
              查找题目
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="题干或知识点"
              />
            </label>
            <label>
              章节
              <select
                aria-label="章节"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
              >
                <option value="">全部章节</option>
                {course.guide?.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              范围
              <select
                aria-label="范围"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">全部题目</option>
                <option value="wrong">待巩固错题</option>
                <option value="draft">待核对草稿</option>
                <option value="trash">已删除题目</option>
              </select>
            </label>
          </div>
        </details>
        {!focusCheckId && (
          <details>
            <summary>从已有自测导入题库草稿</summary>
            {!checks.filter((c) => !c.deletedAt).length && (
              <p>先在“快速自测”生成或体验示例题。</p>
            )}
            {checks
              .filter((c) => !c.deletedAt)
              .map((c) => (
                <div className="lab-heading-row" key={c.id}>
                  <span>
                    {new Date(c.createdAt).toLocaleString('zh-CN')} ·{' '}
                    {c.questions.length} 题
                  </span>
                  <button
                    disabled={
                      disabled ||
                      c.questions.every((q) =>
                        state.questions.some(
                          (p) => p.originId === `${c.id}:${q.id}`,
                        ),
                      )
                    }
                    onClick={() => {
                      onChange({
                        ...state,
                        questions: [
                          ...state.questions,
                          ...checkToDrafts(
                            c,
                            state.questions,
                            course.guide?.chapters ?? [],
                          ),
                        ],
                      });
                      setFilter('draft');
                    }}
                  >
                    导入为草稿
                  </button>
                </div>
              ))}
          </details>
        )}
      </section>
      {editing && (
        <section
          className="panel practice-editor"
          ref={editorRef}
          tabIndex={-1}
          aria-label="核对与编辑题目"
        >
          <h3>
            {state.questions.some((q) => q.id === editing.id)
              ? '编辑题目'
              : '新建题目'}
          </h3>
          <label>
            题型
            <select
              aria-label="题型"
              value={editing.kind}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  kind: e.target.value as PracticeQuestion['kind'],
                  options:
                    e.target.value === 'boolean'
                      ? ['正确', '错误']
                      : ['', '', '', ''],
                  correct: 0,
                })
              }
            >
              <option value="choice">单选题</option>
              <option value="boolean">判断题</option>
            </select>
          </label>
          <label>
            题干
            <textarea
              value={editing.prompt}
              maxLength={2000}
              onChange={(e) =>
                setEditing({ ...editing, prompt: e.target.value })
              }
            />
          </label>
          <label>
            知识点
            <input
              value={editing.term}
              maxLength={100}
              onChange={(e) => setEditing({ ...editing, term: e.target.value })}
            />
          </label>
          <label>
            所属章节
            <select
              aria-label="章节"
              value={editing.chapterId}
              onChange={(e) =>
                setEditing({ ...editing, chapterId: e.target.value })
              }
            >
              <option value="">未分章</option>
              {course.guide?.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {editing.options.map((o, i) => (
            <label key={i}>
              选项 {String.fromCharCode(65 + i)}
              <input
                value={o}
                maxLength={500}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    options: editing.options.map((v, j) =>
                      j === i ? e.target.value : v,
                    ),
                  })
                }
              />
            </label>
          ))}
          <label>
            正确选项
            <select
              aria-label="正确选项"
              value={editing.correct}
              onChange={(e) =>
                setEditing({ ...editing, correct: Number(e.target.value) })
              }
            >
              {editing.options.map((_, i) => (
                <option key={i} value={i}>
                  {String.fromCharCode(65 + i)}
                </option>
              ))}
            </select>
          </label>
          <label>
            解析
            <textarea
              value={editing.explanation}
              maxLength={5000}
              onChange={(e) =>
                setEditing({ ...editing, explanation: e.target.value })
              }
            />
          </label>
          {editing.evidence.map((e) => (
            <button key={e.id} onClick={() => onSource(e)}>
              核对原文：{e.name} · {e.section}
            </button>
          ))}
          <label className="lab-checkline">
            <input
              type="checkbox"
              checked={editing.status === 'ready'}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  status: e.target.checked ? 'ready' : 'draft',
                })
              }
            />
            已核对题目、答案和来源，可用于练习
          </label>
          <div className="actions">
            <button
              onClick={() => {
                setEditing(null);
                setError('');
              }}
            >
              取消
            </button>
            <button className="primary" disabled={disabled} onClick={save}>
              {editing.status === 'ready' ? '保存并开始练习' : '保存题目草稿'}
            </button>
          </div>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </section>
      )}
      {chosen && (
        <section
          className="panel active-practice"
          ref={focusRef}
          tabIndex={-1}
          aria-label="当前练习"
        >
          <div className="lab-section-heading">
            <h3>练习：{chosen.term}</h3>
            <button
              onClick={() => {
                setActive('');
                setPreview(null);
              }}
            >
              返回题目列表
            </button>
          </div>
          <fieldset className="check-question">
            <legend>{chosen.prompt}</legend>
            {chosen.options.map((o, i) => (
              <label className="check-option" key={i}>
                <input
                  type="radio"
                  name="practice-answer"
                  disabled={submitted || disabled}
                  checked={answer === i}
                  onChange={() => setAnswer(i)}
                />
                {o}
              </label>
            ))}
          </fieldset>
          {!submitted ? (
            <button
              className="primary"
              disabled={disabled || answer < 0}
              onClick={() => {
                const a = answerQuestion(chosen, answer);
                onChange({ ...state, attempts: [...state.attempts, a] });
                setSubmitted(true);
              }}
            >
              提交本次作答
            </button>
          ) : (
            last && (
              <div className="check-result">
                <strong>
                  {last.correct ? '本次答对' : '本次需巩固'} · 正确答案：
                  {last.question.options[last.question.correct]}
                </strong>
                <LearningMarkdown text={last.question.explanation} />
                {last.question.evidence.map((e) => (
                  <button key={e.id} onClick={() => onSource(e)}>
                    查看依据：{e.name} · {e.section}
                  </button>
                ))}
                {!last.correct && (
                  <label>
                    记录错因
                    <select
                      aria-label="记录错因"
                      disabled={disabled}
                      value={last.reason ?? ''}
                      onChange={(e) =>
                        onChange({
                          ...state,
                          attempts: state.attempts.map((a) =>
                            a.id === last.id
                              ? { ...a, reason: e.target.value }
                              : a,
                          ),
                        })
                      }
                    >
                      <option value="">请选择</option>
                      {[
                        '概念不清',
                        '计算错误',
                        '审题失误',
                        '记忆不牢',
                        '其他',
                      ].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="notice">{practiceAdvice(last)}</p>
                {rows.some(
                  (q) => q.id !== chosen.id && !latestAttempt(state, q.id),
                ) && (
                  <button
                    className="primary"
                    disabled={disabled}
                    onClick={() => {
                      const next = rows.find(
                        (q) =>
                          q.id !== chosen.id && !latestAttempt(state, q.id),
                      );
                      if (!next) return;
                      if (next.status === 'draft') {
                        setEditing(structuredClone(next));
                        setActive('');
                      } else {
                        setActive(next.id);
                        setAnswer(-1);
                        setSubmitted(false);
                        setPreview(null);
                      }
                    }}
                  >
                    继续下一题
                  </button>
                )}
                <div className="actions">
                  {onExplain && (
                    <button
                      onClick={() =>
                        onExplain(
                          chosen.term,
                          `我在“${chosen.term}”的练习中${last.correct ? '答对了但想理解得更深入' : `答错了（${last.reason || '原因尚未确定'}）`}。题目：${chosen.prompt}。请依据教材，先给一个提示，再分步解释，并指出适用条件。`,
                        )
                      }
                    >
                      重新讲解
                    </button>
                  )}
                  {onTarget && (
                    <button onClick={() => onTarget(chosen)}>
                      生成同类练习
                    </button>
                  )}
                  <button
                    disabled={disabled}
                    onClick={() => {
                      setSubmitted(false);
                      setAnswer(-1);
                      setPreview(null);
                    }}
                  >
                    再练一次
                  </button>
                  <button
                    disabled={disabled || !!last.planId}
                    onClick={() =>
                      setPreview({
                        plan: planFromAttempt(last, course),
                        attemptId: last.id,
                      })
                    }
                  >
                    {last.planId ? '已加入复习' : '预览复习安排'}
                  </button>
                </div>
              </div>
            )
          )}
          <details>
            <summary>查看历史作答（保留当时题目与答案）</summary>
            {state.attempts
              .filter((a) => a.questionId === chosen.id)
              .slice()
              .reverse()
              .map((a) => (
                <article key={a.id}>
                  <p>
                    {new Date(a.createdAt).toLocaleString('zh-CN')} · 第{' '}
                    {a.questionVersion} 版 · {a.correct ? '答对' : '答错'}{' '}
                    {a.reason}
                  </p>
                  <p>
                    {a.question.prompt} · 选择：{a.question.options[a.answer]} ·
                    正确：{a.question.options[a.question.correct]}
                  </p>
                </article>
              ))}
          </details>
        </section>
      )}
      {preview && (
        <section className="panel" ref={previewRef} tabIndex={-1}>
          <h3>确认复习安排</h3>
          <label>
            计划名称
            <input
              value={preview.plan.title}
              maxLength={100}
              onChange={(e) =>
                setPreview({
                  ...preview,
                  plan: { ...preview.plan, title: e.target.value },
                })
              }
            />
          </label>
          <p className="muted">
            答错默认今天回看、两天后重练；答对默认四天后重练。可修改日期，规则不代表长期掌握度。
          </p>
          {preview.plan.tasks.map((t) => (
            <label key={t.id}>
              {t.title}
              <input
                type="date"
                aria-label={`复习日期：${t.title}`}
                value={t.date}
                min={preview.plan.startDate}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const tasks = preview.plan.tasks.map((item) =>
                    item.id === t.id ? { ...item, date: e.target.value } : item,
                  );
                  setPreview({
                    ...preview,
                    plan: {
                      ...preview.plan,
                      tasks,
                      endDate: tasks
                        .map((item) => item.date)
                        .sort()
                        .at(-1)!,
                    },
                  });
                }}
              />
            </label>
          ))}
          <div className="actions">
            <button onClick={() => setPreview(null)}>取消</button>
            <button
              className="primary"
              disabled={disabled || !preview.plan.title.trim()}
              onClick={() => {
                if (
                  state.attempts.find((a) => a.id === preview.attemptId)?.planId
                )
                  return;
                const issue = validatePlan(preview.plan);
                if (issue) {
                  setError(issue);
                  return;
                }
                setError('');
                onPlan(preview.plan, {
                  ...state,
                  attempts: state.attempts.map((a) =>
                    a.id === preview.attemptId
                      ? { ...a, planId: preview.plan.id }
                      : a,
                  ),
                });
                setPreview(null);
              }}
            >
              确认加入复习
            </button>
          </div>
        </section>
      )}
      {!chosen && !editing && (
        <>
          <section className="panel">
            <h3>题目列表 · {rows.length}</h3>
            {!rows.length && (
              <p className="muted">
                暂无符合条件的题目，可手动建题或导入自测。
              </p>
            )}
            {rows.map((q) => (
              <article className="practice-row" key={q.id}>
                <div>
                  <strong>{q.prompt}</strong>
                  <p className="muted">
                    {q.term} · {q.status === 'draft' ? '待核对' : '可练习'} ·{' '}
                    {state.attempts.filter((a) => a.questionId === q.id).length}{' '}
                    次作答
                  </p>
                </div>
                <div className="actions">
                  {q.deletedAt ? (
                    <button
                      disabled={disabled}
                      onClick={() =>
                        onChange({
                          ...state,
                          questions: state.questions.map((p) =>
                            p.id === q.id ? { ...p, deletedAt: undefined } : p,
                          ),
                        })
                      }
                    >
                      恢复题目
                    </button>
                  ) : (
                    <>
                      <button
                        disabled={disabled || q.status !== 'ready'}
                        onClick={() => {
                          setActive(q.id);
                          setAnswer(-1);
                          setSubmitted(false);
                          setPreview(null);
                        }}
                      >
                        开始练习
                      </button>
                      <button
                        disabled={disabled}
                        onClick={() => {
                          setEditing(structuredClone(q));
                          setError('');
                        }}
                      >
                        {q.status === 'draft' ? '核对题目' : '编辑'}
                      </button>
                      <button
                        disabled={disabled}
                        onClick={() => setRemoveId(q.id)}
                      >
                        删除
                      </button>
                    </>
                  )}
                </div>
                {removeId === q.id && (
                  <div className="notice">
                    <p>移入已删除题目？作答历史保留，可随时恢复。</p>
                    <button onClick={() => setRemoveId('')}>取消</button>
                    <button
                      disabled={disabled}
                      onClick={() => {
                        onChange({
                          ...state,
                          questions: state.questions.map((p) =>
                            p.id === q.id
                              ? { ...p, deletedAt: new Date().toISOString() }
                              : p,
                          ),
                        });
                        setRemoveId('');
                        setActive('');
                      }}
                    >
                      确认删除
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      <section className="panel">
        <h3>近期练习反馈</h3>
        <p className="muted">
          统计本题库的实际作答，不代表整门课掌握程度。点击知识点查看相关题目，再选择重练或安排复习。
        </p>
        {!weakTerms(state).length && <p>暂无错题记录。</p>}
        {weakTerms(state).map((r) => (
          <div className="lab-heading-row" key={r.term}>
            <button
              onClick={() => {
                setQuery(r.term);
                setFilter('wrong');
              }}
            >
              {r.term}
            </button>
            <span>
              {r.total} 次作答 / {r.wrong} 次答错 / {r.pending} 题待巩固
            </span>
          </div>
        ))}
      </section>
    </section>
  );
}
