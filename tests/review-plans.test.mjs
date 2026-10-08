import test from 'node:test';
import assert from 'node:assert/strict';

import { moduleUrl } from './load-ts.mjs';

const plansUrl = await moduleUrl('../lib/review-plans.ts');
const {
  addDays,
  weekStart,
  validDate,
  validatePlan,
  readPlanRequest,
  parsePlanDraft,
} = await import(plansUrl);
const { belongsToCourse, isInDeletedCourse, trashCourse, restoreCourse } =
  await import(await moduleUrl('../lib/course-lifecycle.ts'));
const { POST } = await import(
  await moduleUrl('../app/api/review-plan/route.ts', [
    ['@/lib/review-plans', plansUrl],
  ])
);
const context = {
  course: { id: 'math', name: '线性代数', chapters: ['矩阵'] },
  notes: [
    { id: 'n1', title: '特征值', excerpt: '理解方向与缩放', mastery: '未掌握' },
  ],
  goal: '期中复习',
  startDate: '2026-09-28',
  endDate: '2026-10-04',
  dailyMinutes: 45,
};
const modelDraft = {
  title: '一周复习',
  tasks: [
    {
      title: '闭卷回忆特征值定义',
      date: '2026-09-28',
      minutes: 25,
      noteIds: ['n1'],
    },
    { title: '做一道基础习题', date: '2026-09-28', minutes: 20, noteIds: [] },
  ],
};
const makeRequest = (body, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/review-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });

test('course deletion is reversible including the last course and does not restore individually trashed notes', () => {
  const courses = [
    {
      id: 'math',
      name: '线性代数',
      materials: [{ fileId: 'file' }],
      sessions: [{ id: 'session' }],
    },
  ];
  const notes = [
    { id: 'active', courseId: 'math', course: '旧课程名' },
    { id: 'own-trash', courseId: 'math', deletedAt: 'earlier' },
  ];
  const deleted = trashCourse(courses, 'math', 'now');
  assert.equal(deleted.filter((course) => !course.deletedAt).length, 0);
  assert.deepEqual(
    notes.filter(
      (note) => !note.deletedAt && !isInDeletedCourse(note, deleted),
    ),
    [],
  );
  assert.deepEqual(deleted[0].materials, courses[0].materials);
  assert.deepEqual(deleted[0].sessions, courses[0].sessions);
  const restored = restoreCourse(deleted, 'math');
  assert.deepEqual(
    notes
      .filter((note) => !note.deletedAt && !isInDeletedCourse(note, restored))
      .map((note) => note.id),
    ['active'],
  );
  assert.equal(notes[1].deletedAt, 'earlier');
  assert.equal(courses[0].deletedAt, undefined);
  assert.equal(
    belongsToCourse({ courseId: 'other', course: '线性代数' }, courses[0]),
    false,
  );
  assert.equal(belongsToCourse({ course: '线性代数' }, courses[0]), true);
});

test('calendar calculations handle week, month, year and leap-day boundaries without timezone drift', () => {
  assert.equal(weekStart('2026-09-27'), '2026-09-21');
  assert.equal(weekStart('2026-09-28'), '2026-09-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2026-13-01'), false);
});

test('manual and AI schedules enforce real dates, nonempty tasks and total daily time', () => {
  const plan = { ...context, ...modelDraft };
  assert.equal(validatePlan(plan), '');
  assert.match(validatePlan({ ...plan, tasks: [] }), /添加/);
  assert.match(validatePlan({ ...plan, endDate: '2026-09-01' }), /早于/);
  assert.match(validatePlan({ ...plan, endDate: '2026-11-01' }), /31 天/);
  assert.match(validatePlan({ ...plan, dailyMinutes: 40 }), /超过/);
  assert.match(
    validatePlan({
      ...plan,
      tasks: [{ ...modelDraft.tasks[0], date: '2026-10-05' }],
    }),
    /日期/,
  );
  assert.match(
    validatePlan({
      ...plan,
      tasks: [{ ...modelDraft.tasks[0], minutes: 12.5 }],
    }),
    /整数/,
  );
});

test('AI output validates note ownership, strips completion flags and keeps drafts editable', () => {
  const draft = parsePlanDraft(JSON.stringify(modelDraft), context);
  assert.equal(draft.tasks.length, 2);
  assert.equal(new Set(draft.tasks.map((task) => task.id)).size, 2);
  assert.equal(draft.tasks[0].done, false);
  assert.throws(
    () =>
      parsePlanDraft(
        JSON.stringify({
          ...modelDraft,
          tasks: [{ ...modelDraft.tasks[0], noteIds: ['made-up-note'] }],
        }),
        context,
      ),
    /不存在/,
  );
  assert.throws(
    () =>
      parsePlanDraft(
        JSON.stringify({
          ...modelDraft,
          tasks: [{ ...modelDraft.tasks[0], minutes: 50 }],
        }),
        context,
      ),
    /超过/,
  );
  assert.throws(() => parsePlanDraft('not JSON', context));
  assert.throws(
    () =>
      readPlanRequest({ ...context, notes: Array(31).fill(context.notes[0]) }),
    /30/,
  );
  assert.equal(
    readPlanRequest({
      ...context,
      notes: [{ ...context.notes[0], excerpt: 'a'.repeat(20000) }],
    }).notes[0].excerpt.length,
    400,
  );
});

test('plan API rejects invalid requests and missing configuration without calling a model', async () => {
  const key = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('unexpected request');
  };
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal(
      (await POST(makeRequest(context, 'https://foreign.example'))).status,
      403,
    );
    assert.equal((await POST(makeRequest({}))).status, 400);
    assert.equal(
      (await POST(makeRequest({ ...context, endDate: '2026-02-31' }))).status,
      400,
    );
    assert.equal((await POST(makeRequest(context))).status, 503);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});

test('plan API returns only a validated draft and makes one bounded request; provider failure never fakes a plan', async () => {
  const key = process.env.OPENAI_API_KEY;
  const base = process.env.OPENAI_BASE_URL;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-only-key';
  process.env.OPENAI_BASE_URL = 'https://provider.example/v1';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://provider.example/v1/chat/completions');
    const payload = JSON.parse(options.body);
    assert.equal(payload.max_tokens, 4000);
    const input = JSON.parse(payload.messages[1].content);
    assert.equal(input.notes[0].excerpt.length, 400);
    assert.equal(input.goal, context.goal);
    return Response.json({
      choices: [{ message: { content: JSON.stringify(modelDraft) } }],
    });
  };
  try {
    const response = await POST(
      makeRequest({
        ...context,
        notes: [{ ...context.notes[0], excerpt: 'x'.repeat(2000) }],
      }),
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.draft.tasks.length, 2);
    assert.deepEqual(Object.keys(data), ['draft']);
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      new Response('provider error', { status: 500 });
    const failure = await POST(makeRequest(context));
    assert.equal(failure.status, 502);
    assert.equal((await failure.json()).draft, undefined);
    globalThis.fetch = async () =>
      Response.json({
        choices: [{ message: { content: '{"title":"bad","tasks":[]}' } }],
      });
    assert.equal((await POST(makeRequest(context))).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
    if (base === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = base;
  }
});
