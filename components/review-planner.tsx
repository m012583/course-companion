'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  LoaderCircle,
} from 'lucide-react';
import { localDate, type Note } from '@/lib/knowledge';
import {
  addDays,
  weekStart,
  validatePlan,
  validateSchedule,
  type PlanCourse,
  type ReviewPlan,
  type ReviewTask,
} from '@/lib/review-plans';

type Props = {
  courses: PlanCourse[];
  notes: Note[];
  plans: ReviewPlan[];
  model: string;
  dueCount: number;
  onChange: (plans: ReviewPlan[]) => void;
  onPractice: () => void;
  onOpenNote: (note: Note) => void;
  onAddCourse: () => void;
  onOpenQuestion?: (courseId: string, questionId: string) => void;
};
const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' },
) => new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', options);

function PlanEditor({
  plan,
  courses,
  notes,
  model,
  aiInitially,
  onSave,
  onClose,
}: {
  plan: ReviewPlan;
  courses: PlanCourse[];
  notes: Note[];
  model: string;
  aiInitially: boolean;
  onSave: (plan: ReviewPlan) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(plan);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const course = courses.find((item) => item.id === draft.courseId);
  const courseNotes = notes.filter((note) =>
    note.courseId
      ? note.courseId === draft.courseId
      : note.course === course?.name,
  );
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      controller.current?.abort();
    };
  }, []);
  function updateTask(id: string, patch: Partial<ReviewTask>) {
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id ? { ...task, ...patch } : task,
      ),
    }));
  }
  async function generate() {
    const issue = validateSchedule(draft);
    if (issue || !course) {
      setError(issue || '请先选择课程。');
      return;
    }
    setError('');
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch('/api/review-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          course,
          goal: draft.goal,
          startDate: draft.startDate,
          endDate: draft.endDate,
          dailyMinutes: draft.dailyMinutes,
          model,
          notes: courseNotes.slice(0, 30).map((note) => ({
            id: note.id,
            title: note.title,
            chapter: note.chapter,
            excerpt: note.text.slice(0, 400),
            mastery: note.mastery,
          })),
        }),
      });
      const data = (await response.json()) as {
        draft?: { title: string; tasks: ReviewTask[] };
        error?: string;
      };
      if (!response.ok || !data.draft)
        throw new Error(data.error || '暂时没有生成成功，请重试。');
      setDraft((current) => ({
        ...current,
        title: data.draft!.title,
        tasks: data.draft!.tasks,
        source: 'ai',
      }));
      setGenerated(true);
    } catch (issue) {
      if (!abort.signal.aborted)
        setError(issue instanceof Error ? issue.message : '生成失败，请重试。');
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal wide plan-editor"
      aria-labelledby="plan-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">留一点时间，让知识慢慢扎根</p>
          <h2 id="plan-editor-title">
            {aiInitially
              ? 'AI 复习计划草稿'
              : plan.createdAt
                ? '编辑复习计划'
                : '制定复习计划'}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="关闭计划编辑"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const issue = validatePlan(draft);
          if (issue || !course) {
            setError(issue || '请选择有效课程。');
            return;
          }
          onSave({
            ...draft,
            title: draft.title.trim(),
            tasks: draft.tasks.map((task) => ({
              ...task,
              title: task.title.trim(),
            })),
            createdAt: draft.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }}
      >
        <fieldset disabled={busy} className="plan-fields">
          <div className="plan-form-grid">
            <label>
              计划名称
              <input
                required
                maxLength={100}
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                placeholder="例如：线性代数期中复习"
              />
            </label>
            <label>
              所属课程
              <select
                value={draft.courseId}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    courseId: event.target.value,
                    tasks: draft.tasks.map((task) => ({
                      ...task,
                      noteIds: [],
                    })),
                  })
                }
              >
                {courses.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              开始日期
              <input
                required
                type="date"
                value={draft.startDate}
                onInput={(event) =>
                  setDraft({ ...draft, startDate: event.currentTarget.value })
                }
                onChange={(event) =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
              />
            </label>
            <label>
              结束日期
              <input
                required
                type="date"
                value={draft.endDate}
                onInput={(event) =>
                  setDraft({ ...draft, endDate: event.currentTarget.value })
                }
                min={draft.startDate}
                onChange={(event) =>
                  setDraft({ ...draft, endDate: event.target.value })
                }
              />
            </label>
            <label>
              本计划每天用时（分钟）
              <input
                required
                type="number"
                min={5}
                max={480}
                step={1}
                value={draft.dailyMinutes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    dailyMinutes: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              复习目标
              <input
                maxLength={1000}
                placeholder="例如：理解特征值，完成课后习题"
                value={draft.goal}
                onChange={(event) =>
                  setDraft({ ...draft, goal: event.target.value })
                }
              />
            </label>
          </div>
          {(!draft.tasks.length || aiInitially) && (
            <div className="plan-ai-box">
              <div>
                <Sparkles size={20} />
                <span>
                  <strong>先让 AI 帮你起草</strong>
                  <small>
                    使用本课程最多 30 篇笔记摘要与章节，生成后可修改；点击才调用
                    API。
                  </small>
                </span>
              </div>
              {!draft.tasks.length && (
                <button
                  type="button"
                  className="ai-button"
                  onClick={() => void generate()}
                >
                  <Sparkles size={15} />
                  生成一版草稿
                </button>
              )}
              {!!draft.tasks.length && (
                <small>
                  {generated
                    ? '草稿已生成，检查下面的安排后再保存。'
                    : '已有安排会保留；需要重新生成时，请新建一份草稿。'}
                </small>
              )}
            </div>
          )}
          <div className="section-heading">
            <h3>
              每日安排 <span className="muted">{draft.tasks.length}</span>
            </h3>
            <span className="muted">勾选完成不会改变笔记的掌握状态</span>
          </div>
          {!draft.tasks.length && (
            <p className="plan-editor-empty">
              从一项小任务开始，或让 AI 生成第一版。
            </p>
          )}
          <div className="plan-task-editor-list">
            {draft.tasks.map((task, index) => (
              <div className="plan-task-editor" key={task.id}>
                <span className="task-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="task-editor-fields">
                  <label className="task-title-field">
                    复习内容 {index + 1}
                    <input
                      required
                      maxLength={160}
                      value={task.title}
                      placeholder="例如：闭卷写出特征值定义，再核对笔记"
                      onChange={(event) =>
                        updateTask(task.id, { title: event.target.value })
                      }
                    />
                  </label>
                  <div className="task-editor-details">
                    <label>
                      日期 {index + 1}
                      <input
                        required
                        type="date"
                        min={draft.startDate}
                        max={draft.endDate}
                        value={task.date}
                        onInput={(event) =>
                          updateTask(task.id, {
                            date: event.currentTarget.value,
                          })
                        }
                        onChange={(event) =>
                          updateTask(task.id, { date: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      分钟 {index + 1}
                      <input
                        required
                        type="number"
                        min={5}
                        max={480}
                        value={task.minutes}
                        onChange={(event) =>
                          updateTask(task.id, {
                            minutes: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      关联笔记 {index + 1}
                      <select
                        value={task.noteIds[0] ?? ''}
                        onChange={(event) =>
                          updateTask(task.id, {
                            noteIds: event.target.value
                              ? [event.target.value]
                              : [],
                          })
                        }
                      >
                        <option value="">不关联笔记</option>
                        {courseNotes.map((note) => (
                          <option key={note.id} value={note.id}>
                            {note.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {task.noteIds.length > 1 && (
                    <small className="muted">
                      AI 关联了 {task.noteIds.length}{' '}
                      篇笔记；重新选择会改为单篇。
                    </small>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`移除安排 ${index + 1}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      tasks: draft.tasks.filter((item) => item.id !== task.id),
                    })
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="add-plan-task"
            disabled={draft.tasks.length >= 90}
            onClick={() =>
              setDraft({
                ...draft,
                tasks: [
                  ...draft.tasks,
                  {
                    id: crypto.randomUUID(),
                    title: '',
                    date: draft.startDate,
                    minutes: Math.min(25, draft.dailyMinutes),
                    noteIds: [],
                    done: false,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            添加一项安排
          </button>
        </fieldset>
        {busy && (
          <output className="plan-generating">
            <LoaderCircle size={17} className="spin" />
            正在生成草稿，通常需要几十秒…
          </output>
        )}
        {error && (
          <p className="notice plan-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions modal-footer">
          <span className="muted">
            {draft.tasks.length} 项安排 · 保存后进入周计划
          </span>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            type="submit"
            disabled={busy || !draft.tasks.length}
          >
            <Check size={16} />
            保存计划
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function ReviewPlanner({
  courses,
  notes,
  plans,
  model,
  dueCount,
  onChange,
  onPractice,
  onOpenNote,
  onAddCourse,
  onOpenQuestion,
}: Props) {
  const today = localDate();
  const [week, setWeek] = useState(() => weekStart(today));
  const [selectedId, setSelectedId] = useState('all');
  const [editing, setEditing] = useState<{
    plan: ReviewPlan;
    ai: boolean;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const activePlans = plans.filter((plan) => !plan.deletedAt);
  const selectedPlan = activePlans.find((plan) => plan.id === selectedId);
  const shown = selectedPlan ? [selectedPlan] : activePlans;
  const tasks = shown.flatMap((plan) =>
    plan.tasks.map((task) => ({ task, plan })),
  );
  const weekTasks = tasks.filter(
    ({ task }) => task.date >= week && task.date <= addDays(week, 6),
  );
  const overdue = tasks.filter(({ task }) => !task.done && task.date < today);
  const minutes = weekTasks.reduce((sum, { task }) => sum + task.minutes, 0);
  const completed = weekTasks.filter(({ task }) => task.done).length;
  function create(ai: boolean) {
    if (!courses.length) {
      onAddCourse();
      return;
    }
    setEditing({
      ai,
      plan: {
        id: crypto.randomUUID(),
        courseId: courses[0].id,
        title: `${courses[0].name}复习计划`,
        goal: '',
        startDate: today,
        endDate: addDays(today, 6),
        dailyMinutes: 45,
        source: 'manual',
        tasks: [],
        createdAt: '',
        updatedAt: '',
      },
    });
  }
  function changePlan(next: ReviewPlan) {
    onChange(plans.map((plan) => (plan.id === next.id ? next : plan)));
  }
  return (
    <div className="planner-page">
      <div className="page-heading planner-heading">
        <div>
          <p className="eyebrow">循序渐进，也给自己留一点余地</p>
          <h1>把复习，放进日常</h1>
          <p className="muted">自己安排节奏，或从一份 AI 草稿开始。</p>
        </div>
        <div className="actions">
          <button className="ai-button" onClick={() => create(true)}>
            <Sparkles size={17} />
            AI 生成草稿
          </button>
          <button className="primary" onClick={() => create(false)}>
            <Plus size={17} />
            新建计划
          </button>
        </div>
      </div>
      <section className="planner-summary" aria-label="本周计划概况">
        <div>
          <span className="summary-icon">
            <CalendarDays size={21} />
          </span>
          <span>
            <strong>{weekTasks.length}</strong>
            <small>本周安排</small>
          </span>
        </div>
        <div>
          <span className="summary-icon">
            <Check size={21} />
          </span>
          <span>
            <strong>
              {completed}
              <em> / {weekTasks.length}</em>
            </strong>
            <small>已经完成</small>
          </span>
        </div>
        <div>
          <span className="summary-icon">
            <Clock3 size={21} />
          </span>
          <span>
            <strong>
              {minutes}
              <em> 分钟</em>
            </strong>
            <small>本周预计投入</small>
          </span>
        </div>
        <div className="planner-progress">
          <span>
            {weekTasks.length
              ? Math.round((completed / weekTasks.length) * 100)
              : 0}
            %
          </span>
          <div>
            <i
              style={{
                width: `${weekTasks.length ? (completed / weekTasks.length) * 100 : 0}%`,
              }}
            />
          </div>
          <small>每完成一点，都算进步</small>
        </div>
      </section>
      <div className="planner-controls">
        <div className="week-controls">
          <button
            className="icon-button"
            aria-label="上一周"
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ArrowLeft size={16} />
          </button>
          <h2>
            {dateLabel(week)} — {dateLabel(addDays(week, 6))}
          </h2>
          <button
            className="icon-button"
            aria-label="下一周"
            onClick={() => setWeek(addDays(week, 7))}
          >
            <ArrowRight size={16} />
          </button>
          <button onClick={() => setWeek(weekStart(today))}>本周</button>
        </div>
        <label className="plan-selector">
          <span>查看计划</span>
          <select
            aria-label="查看计划"
            value={selectedPlan?.id ?? 'all'}
            onChange={(event) => {
              setSelectedId(event.target.value);
              const plan = activePlans.find(
                (item) => item.id === event.target.value,
              );
              if (plan) setWeek(weekStart(plan.startDate));
            }}
          >
            <option value="all">全部计划 · {activePlans.length}</option>
            {activePlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!!overdue.length && (
        <div className="overdue-strip">
          <Clock3 size={16} />
          <span>{overdue.length} 项安排尚未完成，可以重新调整日期。</span>
          <button
            className="text-button"
            onClick={() =>
              setWeek(
                weekStart(
                  [...overdue].sort((a, b) =>
                    a.task.date.localeCompare(b.task.date),
                  )[0].task.date,
                ),
              )
            }
          >
            查看待补安排
            <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="week-board" aria-label="每周复习安排">
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(week, index);
          const daily = weekTasks.filter(({ task }) => task.date === date);
          return (
            <section
              className={`day-column ${date === today ? 'is-today' : ''}`}
              key={date}
              aria-label={date}
            >
              <header>
                <span>
                  {
                    ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][
                      index
                    ]
                  }
                </span>
                <strong>{Number(date.slice(8))}</strong>
                <small>
                  {date === today
                    ? '今天'
                    : daily.length
                      ? `${daily.reduce((sum, { task }) => sum + task.minutes, 0)} 分钟`
                      : '留白'}
                </small>
              </header>
              <div className="day-tasks">
                {daily.map(({ task, plan }) => (
                  <article
                    className={`plan-task ${task.done ? 'is-done' : ''}`}
                    key={`${plan.id}:${task.id}`}
                  >
                    <div className="plan-task-top">
                      <span className="task-course">
                        {
                          courses.find((course) => course.id === plan.courseId)
                            ?.name
                        }
                      </span>
                      <button
                        className="task-check"
                        aria-label={`${task.done ? '取消完成' : '完成安排'}：${task.title}`}
                        aria-pressed={task.done}
                        onClick={() =>
                          changePlan({
                            ...plan,
                            updatedAt: new Date().toISOString(),
                            tasks: plan.tasks.map((item) =>
                              item.id === task.id
                                ? { ...item, done: !item.done }
                                : item,
                            ),
                          })
                        }
                      >
                        {task.done && <Check size={13} />}
                      </button>
                    </div>
                    <button
                      className="task-content"
                      aria-label={`编辑安排：${task.title}`}
                      onClick={() => setEditing({ plan, ai: false })}
                    >
                      {task.title}
                    </button>
                    <footer>
                      <span>
                        <Clock3 size={12} />
                        {task.minutes} 分钟
                      </span>
                      {plan.source === 'ai' && (
                        <span title="由 AI 起草，可手动修改">
                          <Sparkles size={12} />
                        </span>
                      )}
                    </footer>
                    {task.questionId && onOpenQuestion && (
                      <button
                        onClick={() =>
                          onOpenQuestion(plan.courseId, task.questionId!)
                        }
                      >
                        打开关联练习
                      </button>
                    )}
                    {!!task.noteIds.length && (
                      <div className="task-note-links">
                        {task.noteIds.map((id) => {
                          const note = notes.find((item) => item.id === id);
                          return note ? (
                            <button
                              key={id}
                              onClick={() => onOpenNote(note)}
                              title={note.title}
                            >
                              <BookOpen size={12} />
                              <span>{note.title}</span>
                            </button>
                          ) : (
                            <small key={id}>关联笔记暂不可用</small>
                          );
                        })}
                      </div>
                    )}
                  </article>
                ))}
                {!daily.length && (
                  <div className="day-empty">
                    <span>·</span>
                    <small>给这一天留些空间</small>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {!activePlans.length && (
        <section className="planner-welcome">
          <span className="welcome-icon">
            <CalendarDays size={25} />
          </span>
          <div>
            <h3>第一份计划，从小一点开始</h3>
            <p>选一门课，定好日期和每天的时间，再把复习拆成能完成的小任务。</p>
          </div>
          <button onClick={() => create(false)}>
            <Plus size={16} />
            {courses.length ? '手动制定' : '添加第一门课程'}
          </button>
        </section>
      )}
      <div className="planner-bottom">
        <section className="plan-library">
          <div className="section-heading">
            <h2>
              我的计划 <span className="muted">{activePlans.length}</span>
            </h2>
            <small className="muted">随时调整，按自己的节奏来</small>
          </div>
          {activePlans.map((plan) => (
            <article className="saved-plan" key={plan.id}>
              <span className="saved-plan-icon">
                <BookOpen size={19} />
              </span>
              <div>
                <button
                  className="saved-plan-title"
                  onClick={() => {
                    setSelectedId(plan.id);
                    setWeek(weekStart(plan.startDate));
                  }}
                >
                  {plan.title}
                </button>
                <p>
                  {dateLabel(plan.startDate)} — {dateLabel(plan.endDate)} ·{' '}
                  {plan.tasks.filter((task) => task.done).length}/
                  {plan.tasks.length} 已完成
                  {plan.source === 'ai' ? ' · AI 起草' : ' · 手动制定'}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label={`编辑计划：${plan.title}`}
                onClick={() => setEditing({ plan, ai: false })}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button delete-note-button"
                aria-label={`删除计划：${plan.title}`}
                onClick={() => setPendingDelete(plan.id)}
              >
                <Trash2 size={16} />
              </button>
              {pendingDelete === plan.id && (
                <div className="plan-inline-confirm">
                  <span>删除后可以在下方恢复。</span>
                  <button onClick={() => setPendingDelete(null)}>取消</button>
                  <button
                    className="danger"
                    onClick={() => {
                      changePlan({
                        ...plan,
                        deletedAt: new Date().toISOString(),
                      });
                      setPendingDelete(null);
                      setNotice('计划已删除，可在下方恢复。');
                    }}
                  >
                    确认删除计划
                  </button>
                </div>
              )}
            </article>
          ))}
          {!!plans.filter((plan) => plan.deletedAt).length && (
            <details className="archived-plans">
              <summary>
                已删除的计划 · {plans.filter((plan) => plan.deletedAt).length}
              </summary>
              {plans
                .filter((plan) => plan.deletedAt)
                .map((plan) => (
                  <div key={plan.id}>
                    <span>{plan.title}</span>
                    <button
                      onClick={() => {
                        changePlan({ ...plan, deletedAt: undefined });
                        setNotice('计划已恢复。');
                      }}
                    >
                      <RotateCcw size={14} />
                      恢复计划
                    </button>
                  </div>
                ))}
            </details>
          )}
        </section>
        <section className="practice-card">
          <span className="eyebrow">记住，也要会用</span>
          <h2>做一次主动回忆</h2>
          <p>
            {dueCount
              ? `${dueCount} 篇笔记已到复习时间，先回忆，再核对答案。`
              : '今天没有到期笔记。也可以从已有笔记开始练习。'}
          </p>
          <button onClick={onPractice} disabled={!notes.length}>
            <RotateCcw size={16} />
            {dueCount ? '开始到期复习' : '自由练习'}
          </button>
          <small>沿用笔记的间隔复习，不会改动你的周计划。</small>
        </section>
      </div>
      {notice && <output className="plan-notice">{notice}</output>}
      {editing && (
        <PlanEditor
          key={editing.plan.id}
          plan={editing.plan}
          aiInitially={editing.ai}
          courses={courses}
          notes={notes}
          model={model}
          onClose={() => setEditing(null)}
          onSave={(plan) => {
            onChange(
              plans.some((item) => item.id === plan.id)
                ? plans.map((item) => (item.id === plan.id ? plan : item))
                : [...plans, plan],
            );
            setSelectedId(plan.id);
            setWeek(weekStart(plan.startDate));
            setEditing(null);
            setNotice('计划已保存，可以在周视图中勾选完成或继续编辑。');
          }}
        />
      )}
    </div>
  );
}
