import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
const load = async (p) => import(await moduleUrl(p));
const { attachCheck, practiceAdvice } = await load('../lib/learning-flow.ts');
const { demoWorkspace, demoCheck, demoMaterial } = await load(
  '../lib/demo-course.ts',
);
const { answerQuestion, planFromAttempt } = await load('../lib/practice.ts');
const { parseBackup, remapFileIds } = await load('../lib/backup.ts');
const { validatePlan, addDays } = await load('../lib/review-plans.ts');
const { parseCheck } = await load('../lib/learning-check.ts');
const { readEventStream } = await load('../lib/event-stream.ts');
const { POST } = await load('../app/api/learning-check/route.ts');

test('flow import is atomic and idempotent, and never revives removed drafts or overwrites history', () => {
  const workspace = demoWorkspace(),
    course = workspace.courses[0],
    check = demoCheck();
  const state = attachCheck(
    undefined,
    check,
    course.guide.chapters,
    course.guide.chapters[0].id,
  );
  assert.equal(state.practice.questions.length, 2);
  assert.ok(state.practice.questions.every((q) => q.status === 'draft'));
  const q = state.practice.questions[0];
  q.status = 'ready';
  state.practice.attempts.push(answerQuestion(q, (q.correct + 1) % 4));
  q.deletedAt = new Date().toISOString();
  const again = attachCheck(
    state,
    check,
    course.guide.chapters,
    course.guide.chapters[0].id,
  );
  assert.equal(again.practice.questions.length, 2);
  assert.equal(again.practice.attempts.length, 1);
  assert.equal(again.practice.questions[0].deletedAt, q.deletedAt);
  assert.equal(again.checks.length, 1);
  course.studyLab = again;
  const restored = parseBackup(JSON.parse(JSON.stringify(workspace))).state
    .courses[0].studyLab;
  assert.deepEqual(
    restored.practice.attempts,
    JSON.parse(JSON.stringify(again.practice.attempts)),
  );
  assert.deepEqual(restored.flow, again.flow);
});

test('reading location and practice links survive backup migration; corrupt positions are rejected', () => {
  const workspace = demoWorkspace(),
    course = workspace.courses[0];
  course.materials[0].fileId = 'old-file';
  course.reading = {
    fileId: 'old-file',
    name: course.materials[0].name,
    passage: 2,
    updatedAt: new Date().toISOString(),
  };
  course.studyLab = attachCheck(
    undefined,
    demoCheck(),
    course.guide.chapters,
    course.guide.chapters[0].id,
  );
  const q = { ...course.studyLab.practice.questions[0], status: 'ready' };
  const wrong = answerQuestion(q, (q.correct + 1) % 4);
  workspace.reviewPlans = [planFromAttempt(wrong, course)];
  const restored = parseBackup(
    remapFileIds(workspace, new Map([['old-file', 'new-file']])),
  ).state;
  assert.equal(restored.courses[0].reading.fileId, 'new-file');
  assert.equal(restored.courses[0].reading.passage, 2);
  assert.equal(restored.reviewPlans[0].tasks[0].questionId, q.id);
  course.reading.passage = -1;
  assert.throws(() => parseBackup(workspace), /阅读位置/);
  delete course.reading;
  course.studyLab.flow.checkId = null;
  assert.throws(() => parseBackup(workspace), /学习流程/);
});

test('review advice follows recorded errors, and repeat requests keep the same plan id', () => {
  const c = demoWorkspace().courses[0];
  const q = {
    ...attachCheck(undefined, demoCheck(), c.guide.chapters, '').practice
      .questions[0],
    status: 'ready',
    prompt: '题干'.repeat(400),
  };
  const wrong = answerQuestion(q, (q.correct + 1) % 4);
  wrong.reason = '计算错误';
  assert.match(practiceAdvice(wrong), /计算步骤/);
  const plan = planFromAttempt(wrong, c);
  assert.equal(validatePlan(plan), '');
  assert.equal(plan.endDate, addDays(plan.startDate, 1));
  assert.equal(plan.id, planFromAttempt(wrong, c).id);
  const right = planFromAttempt(answerQuestion(q, q.correct), c);
  assert.equal(right.endDate, addDays(right.startDate, 1));
});

test('targeted generation accepts one term but still requires two complete evidence-linked questions', () => {
  const check = demoCheck(),
    term = check.questions[0].term;
  const raw = { questions: check.questions.map((q) => ({ ...q, term })) };
  assert.equal(
    parseCheck(JSON.stringify(raw), [term], check.evidence).length,
    2,
  );
  assert.throws(
    () => parseCheck(JSON.stringify(raw), [term, '其他术语'], check.evidence),
    /不同知识点/,
  );
  raw.questions[0].sourceIds = ['FAKE'];
  assert.throws(
    () => parseCheck(JSON.stringify(raw), [term], check.evidence),
    /引用/,
  );
});

test('workflow emits real processing stages and a validated result; malformed output never completes', async () => {
  const previousKey = process.env.OPENAI_API_KEY,
    previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'local-test-placeholder';
  let broken = false,
    calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const request = JSON.parse(init.body),
      input = JSON.parse(request.messages[1].content);
    assert.ok(input.evidence.length);
    assert.equal(input.terms.length, 1);
    const questions = [0, 1].map((i) => ({
      term: input.terms[0],
      prompt: `核对题${i}`,
      options: ['甲', '乙', '丙', '丁'],
      correct: 1,
      explanation: '对照原文核对。',
      sourceIds: [broken ? 'FAKE' : input.evidence[0].id],
    }));
    return Response.json({
      choices: [
        {
          message: { content: JSON.stringify({ questions }) },
          finish_reason: 'stop',
        },
      ],
    });
  };
  const request = () =>
    new Request('http://localhost/api/learning-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        terms: ['矩阵乘法'],
        materials: [demoMaterial()],
      }),
    });
  const events = async (response) => {
    const result = [];
    for await (const raw of readEventStream(response.body))
      result.push(JSON.parse(raw));
    return result;
  };
  try {
    const result = await events(await POST(request()));
    assert.deepEqual(
      result.map((e) => e.type),
      ['status', 'status', 'status', 'done'],
    );
    assert.equal(result.at(-1).check.questions.length, 2);
    broken = true;
    const failure = await events(await POST(request()));
    assert.equal(failure.at(-1).type, 'error');
    assert.ok(!failure.some((e) => e.type === 'done'));
    delete process.env.OPENAI_API_KEY;
    const missing = await events(await POST(request()));
    assert.equal(missing.at(-1).type, 'error');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
