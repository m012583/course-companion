export type ReviewTask = {
  id: string;
  title: string;
  date: string;
  minutes: number;
  noteIds: string[];
  questionId?: string;
  done: boolean;
};
export type ReviewPlan = {
  id: string;
  courseId: string;
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  dailyMinutes: number;
  source: 'manual' | 'ai';
  tasks: ReviewTask[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
export type PlanCourse = {
  id: string;
  name: string;
  chapters?: string[];
  examDate?: string;
};
export type PlanNote = {
  id: string;
  title: string;
  chapter?: string;
  excerpt: string;
  mastery?: string;
};
export type PlanRequest = {
  course: PlanCourse;
  notes: PlanNote[];
  goal: string;
  startDate: string;
  endDate: string;
  dailyMinutes: number;
  model?: string;
};
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekStart(value: string) {
  return addDays(value, -(new Date(`${value}T12:00:00Z`).getUTCDay() + 6) % 7);
}
export function validateSchedule(settings: {
  startDate: string;
  endDate: string;
  dailyMinutes: number;
}) {
  if (!validDate(settings.startDate) || !validDate(settings.endDate))
    return '请选择有效的开始与结束日期。';
  if (settings.endDate < settings.startDate)
    return '结束日期不能早于开始日期。';
  if (settings.endDate > addDays(settings.startDate, 30))
    return '每份计划最多安排 31 天，建议按阶段制定。';
  if (
    !Number.isInteger(settings.dailyMinutes) ||
    settings.dailyMinutes < 5 ||
    settings.dailyMinutes > 480
  )
    return '每天可用时间需要是 5–480 分钟的整数。';
  return '';
}
export function validatePlan(
  plan: Pick<
    ReviewPlan,
    'title' | 'startDate' | 'endDate' | 'dailyMinutes' | 'tasks'
  >,
) {
  const issue = validateSchedule(plan);
  if (issue) return issue;
  if (!plan.title.trim() || plan.title.length > 100)
    return '请填写 100 字以内的计划名称。';
  if (!plan.tasks.length || plan.tasks.length > 90)
    return '请添加 1–90 项复习安排。';
  const minutes = new Map<string, number>();
  for (const task of plan.tasks) {
    if (!task.title.trim() || task.title.length > 160)
      return '每项安排都需要填写 160 字以内的内容。';
    if (
      !validDate(task.date) ||
      task.date < plan.startDate ||
      task.date > plan.endDate
    )
      return '安排日期需要在计划起止日期之间。';
    if (
      !Number.isInteger(task.minutes) ||
      task.minutes < 5 ||
      task.minutes > 480
    )
      return '每项安排需要 5–480 分钟的整数。';
    minutes.set(task.date, (minutes.get(task.date) ?? 0) + task.minutes);
    if (minutes.get(task.date)! > plan.dailyMinutes)
      return `${task.date} 的安排超过每天 ${plan.dailyMinutes} 分钟，请调整时长或每日预算。`;
  }
  return '';
}
export function readPlanRequest(value: unknown): PlanRequest {
  if (!value || typeof value !== 'object') throw new Error('计划参数无效。');
  const body = value as Partial<PlanRequest>;
  if (
    !body.course ||
    typeof body.course.id !== 'string' ||
    !body.course.id ||
    typeof body.course.name !== 'string' ||
    !body.course.name.trim()
  )
    throw new Error('请先选择课程。');
  if (
    typeof body.startDate !== 'string' ||
    typeof body.endDate !== 'string' ||
    typeof body.dailyMinutes !== 'number'
  )
    throw new Error('请填写计划日期和每日时间。');
  const issue = validateSchedule(body as PlanRequest);
  if (issue) throw new Error(issue);
  if (!Array.isArray(body.notes) || body.notes.length > 30)
    throw new Error('每次最多使用 30 篇笔记摘要。');
  if (typeof body.goal !== 'string' || body.goal.length > 1000)
    throw new Error('复习目标请控制在 1000 字以内。');
  const notes = body.notes.map((note) => {
    if (
      !note ||
      typeof note.id !== 'string' ||
      !note.id ||
      typeof note.title !== 'string' ||
      typeof note.excerpt !== 'string'
    )
      throw new Error('笔记摘要格式无效。');
    return {
      id: note.id.slice(0, 100),
      title: note.title.slice(0, 160),
      excerpt: note.excerpt.slice(0, 400),
      chapter:
        typeof note.chapter === 'string' ? note.chapter.slice(0, 100) : '',
      mastery:
        typeof note.mastery === 'string' ? note.mastery.slice(0, 30) : '',
    };
  });
  return {
    course: {
      id: body.course.id.slice(0, 100),
      name: body.course.name.slice(0, 100),
      chapters: Array.isArray(body.course.chapters)
        ? body.course.chapters
            .filter((c): c is string => typeof c === 'string')
            .slice(0, 30)
            .map((c) => c.slice(0, 100))
        : [],
    },
    notes,
    goal: body.goal.trim(),
    startDate: body.startDate,
    endDate: body.endDate,
    dailyMinutes: body.dailyMinutes,
    model:
      typeof body.model === 'string' ? body.model.slice(0, 120) : undefined,
  };
}
export function parsePlanDraft(raw: string, request: PlanRequest) {
  const data = JSON.parse(
    raw.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''),
  ) as { title?: unknown; tasks?: unknown };
  if (!data || typeof data.title !== 'string' || !Array.isArray(data.tasks))
    throw new Error('AI 返回的计划格式不正确，请重试或手动创建。');
  const allowedNotes = new Set(request.notes.map((note) => note.id));
  const tasks: ReviewTask[] = data.tasks.map((value: unknown) => {
    if (!value || typeof value !== 'object')
      throw new Error('AI 返回的安排格式不正确。');
    const task = value as Partial<ReviewTask>;
    if (
      typeof task.title !== 'string' ||
      typeof task.date !== 'string' ||
      typeof task.minutes !== 'number' ||
      !Array.isArray(task.noteIds) ||
      task.noteIds.some((id) => typeof id !== 'string' || !allowedNotes.has(id))
    )
      throw new Error('AI 返回了无效安排或不存在的笔记引用，请重试。');
    return {
      id: crypto.randomUUID(),
      title: task.title.trim(),
      date: task.date,
      minutes: task.minutes,
      noteIds: [...new Set(task.noteIds)],
      done: false,
    };
  });
  const draft = { ...request, title: data.title.trim(), tasks };
  const issue = validatePlan(draft);
  if (issue) throw new Error(`AI 草稿需要调整：${issue}`);
  return { title: draft.title, tasks };
}
