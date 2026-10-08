import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
let encryptedRow;
globalThis.__testStorage = {
  DB: {
    prepare(sql) {
      let args;
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async run() {
          if (sql.startsWith('INSERT')) encryptedRow = args[1];
          if (sql.startsWith('DELETE')) encryptedRow = undefined;
          return { meta: { changes: 1 } };
        },
        async first() {
          return encryptedRow ? { payload: encryptedRow } : null;
        },
      };
    },
  },
};
const { searchWorkspace } = await import(
  await moduleUrl('../lib/workspace-search.ts')
);
const { demoWorkspace, demoCheck } = await import(
  await moduleUrl('../lib/demo-course.ts')
);
const { checkpointNote, restoreNoteVersion } = await import(
  await moduleUrl('../lib/note-history.ts')
);
const { attachCheck } = await import(
  await moduleUrl('../lib/learning-flow.ts')
);
const { answerQuestion, planFromAttempt } = await import(
  await moduleUrl('../lib/practice.ts')
);
const { learningQueue, budgetQueue, finishDueTasks } = await import(
  await moduleUrl('../lib/review-queue.ts')
);
const { addDays } = await import(await moduleUrl('../lib/review-plans.ts'));
const { validateWorkspace, remapFileIds } = await import(
  await moduleUrl('../lib/backup.ts')
);
const { readAiConfig, sealAiConfig, openAiConfig } = await import(
  await moduleUrl('../lib/ai-config.ts')
);
const settings = await import(
  await moduleUrl('../app/api/ai-settings/route.ts')
);
const retelling = await import(
  await moduleUrl('../app/api/retelling/route.ts')
);
const { parseRetellingFeedback } = await import(
  await moduleUrl('../lib/learning-feedback.ts')
);
function restoreEnv(values) {
  for (const [k, v] of Object.entries(values))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
}

test('search covers passages, questions and answers, scopes same-name sources and excludes deleted content', () => {
  const w = demoWorkspace(),
    c = w.courses[0];
  c.studyLab = attachCheck(undefined, demoCheck(), c.guide.chapters, '');
  c.sessions = [
    {
      id: 'session',
      title: '讨论',
      updatedAt: '2026-10-08',
      messages: [
        { role: 'assistant', text: '前文'.repeat(100) + '特征向量定位结论' },
        { role: 'assistant', text: '不能找到的删除回答', deletedAt: 'today' },
      ],
    },
  ];
  const other = structuredClone(c);
  other.id = 'second';
  other.name = '另一门课程';
  const hits = searchWorkspace([c, other], w.notes, '特征向量', '全部', c.id);
  assert.ok(hits.some((h) => h.kind === '教材' && Number.isInteger(h.passage)));
  const answer = hits.find((h) => h.kind === '回答');
  assert.equal(answer.sessionId, 'session');
  assert.equal(answer.message, 0);
  assert.match(answer.excerpt, /特征向量/);
  assert.ok(hits.every((h) => h.courseId === c.id));
  assert.equal(searchWorkspace([c], w.notes, '删除回答').length, 0);
  assert.ok(
    searchWorkspace([c], w.notes, c.studyLab.practice.questions[0].term, '练习')
      .length,
  );
  c.deletedAt = 'today';
  assert.equal(searchWorkspace([c], w.notes, '特征向量').length, 0);
});

test('note history keeps the pre-edit version, deduplicates and preserves current content before restore', () => {
  let note = demoWorkspace().notes[0];
  const original = note.text;
  note = checkpointNote(note);
  assert.equal(checkpointNote(note).versions.length, 1);
  const id = note.versions[0].id;
  note = { ...note, text: '修改后的内容' };
  const restored = restoreNoteVersion(note, id);
  assert.equal(restored.text, original);
  assert.equal(restored.versions[0].text, '修改后的内容');
  assert.equal(note.text, '修改后的内容');
  for (let i = 0; i < 25; i++)
    note = checkpointNote({ ...note, text: `版本 ${i}` });
  assert.equal(note.versions.length, 20);
  assert.throws(() => restoreNoteVersion(note, 'missing'), /不存在/);
});

test('shared review spacing advances with successful attempts and resets after an error', () => {
  const c = demoWorkspace().courses[0],
    q = {
      ...attachCheck(undefined, demoCheck(), c.guide.chapters, '').practice
        .questions[0],
      status: 'ready',
    };
  const attempts = [];
  for (const days of [1, 3, 7]) {
    const a = answerQuestion(q, q.correct);
    attempts.push(a);
    const plan = planFromAttempt(a, c, attempts);
    assert.equal(plan.endDate, addDays(plan.startDate, days));
  }
  const wrong = answerQuestion(q, (q.correct + 1) % 4);
  attempts.push(wrong);
  const plan = planFromAttempt(wrong, c, attempts);
  assert.equal(plan.endDate, addDays(plan.startDate, 1));
});

test('queue merges only due tasks for the same question, respects budget and snooze without deleting history', () => {
  const w = demoWorkspace(),
    c = w.courses[0];
  c.studyLab = attachCheck(undefined, demoCheck(), c.guide.chapters, '');
  const q = c.studyLab.practice.questions[0];
  q.status = 'ready';
  const plan = planFromAttempt(answerQuestion(q, q.correct), c);
  const today = plan.startDate;
  const plans = [plan, { ...structuredClone(plan), id: 'second' }];
  w.notes[0].reviewAt = today;
  const queue = learningQueue([c], w.notes, plans, today);
  assert.equal(queue.filter((i) => i.kind === 'question').length, 1);
  const item = queue.find((i) => i.kind === 'question');
  assert.equal(item.tasks.length, 2);
  assert.ok(budgetQueue(queue, 10).reduce((n, i) => n + i.minutes, 0) <= 10);
  assert.equal(
    learningQueue([c], w.notes, plans, today, {
      [item.key]: addDays(today, 1),
    }).some((i) => i.key === item.key),
    false,
  );
  const done = finishDueTasks(plans, 'question', q.id, c.id, today);
  assert.ok(done.every((p) => p.tasks[0].done && !p.tasks[1].done));
  assert.ok(plans.every((p) => !p.tasks[0].done));
  c.deletedAt = 'today';
  assert.equal(learningQueue([c], w.notes, plans, today).length, 0);
});

test('new histories, retellings and citation feedback survive backup remapping; malformed values fail', () => {
  const w = demoWorkspace(),
    c = w.courses[0],
    e = {
      id: 'R1',
      fileId: 'old',
      name: '教材',
      section: '段落',
      quote: '原文',
    };
  w.notes[0] = checkpointNote(w.notes[0]);
  c.citationReviews = [
    {
      id: 'r',
      evidence: e,
      claim: '原回答',
      verdict: 'partial',
      comment: '条件不全',
      correction: '补充条件',
      updatedAt: '2026-10-08',
    },
  ];
  c.studyLab = {
    retellings: [
      {
        id: 't',
        prompt: '解释',
        answer: '我的解释',
        evidence: [e],
        createdAt: '2026-10-08',
        feedback: {
          covered: ['定义'],
          missing: [],
          issues: [],
          sourceIds: ['R1'],
        },
      },
    ],
    retellingDraft: { file: 'old', passage: 0, answer: '草稿' },
  };
  const restored = validateWorkspace(
    remapFileIds(w, new Map([['old', 'new']])),
  );
  assert.equal(restored.courses[0].citationReviews[0].evidence.fileId, 'new');
  assert.equal(
    restored.courses[0].studyLab.retellings[0].evidence[0].fileId,
    'new',
  );
  assert.equal(restored.courses[0].studyLab.retellingDraft.file, 'new');
  assert.ok(restored.notes[0].versions.length);
  c.studyLab.retellings[0].feedback.sourceIds = ['FAKE'];
  assert.throws(() => validateWorkspace(w), /复述/);
  delete c.studyLab;
  w.notes[0].versions = [{ title: 'bad' }];
  assert.throws(() => validateWorkspace(w), /历史/);
});

test('AI config validates endpoints and encrypts credentials with independent authenticated ciphertext', async () => {
  const prior = { COURSE_KB_AI_SECRET: process.env.COURSE_KB_AI_SECRET };
  process.env.COURSE_KB_AI_SECRET = 'a'.repeat(64);
  const config = {
    apiKey: 'fixture-secret-only',
    baseUrl: 'https://provider.test/v1',
    model: 'fixture',
    vision: false,
  };
  try {
    const sealed = await sealAiConfig(config);
    assert.ok(!sealed.includes(config.apiKey));
    assert.deepEqual(await openAiConfig(sealed), config);
    assert.notEqual(await sealAiConfig(config), sealed);
    process.env.COURSE_KB_AI_SECRET = 'b'.repeat(64);
    await assert.rejects(() => openAiConfig(sealed), /解密/);
    for (const baseUrl of [
      'http://remote.test/v1',
      'https://name:password@provider.test',
      'https://provider.test?key=secret',
    ])
      assert.throws(() => readAiConfig({ ...config, baseUrl }));
  } finally {
    restoreEnv(prior);
  }
});

test('settings save requires same-origin loopback and never returns credentials; connection check sends no course data', async () => {
  const prior = {
    COURSE_KB_AI_SECRET: process.env.COURSE_KB_AI_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  process.env.COURSE_KB_AI_SECRET = 'c'.repeat(64);
  delete process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const request = (body, origin = 'http://localhost:3024') =>
    new Request('http://localhost:3024/api/ai-settings', {
      method: 'POST',
      headers: { Origin: origin },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await settings.POST(request({ action: 'save' }, 'https://foreign.test')))
        .status,
      403,
    );
    const config = {
      apiKey: 'fixture-private',
      baseUrl: 'https://provider.test/v1',
      model: 'fixture',
      vision: false,
    };
    assert.equal(
      (await settings.POST(request({ action: 'save', config }))).status,
      200,
    );
    const visible = await (await settings.GET()).json();
    assert.equal(visible.configured, true);
    assert.ok(!JSON.stringify(visible).includes(config.apiKey));
    assert.ok(!encryptedRow.includes(config.apiKey));
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, 'https://provider.test/v1/chat/completions');
      assert.equal(init.headers.Authorization, `Bearer ${config.apiKey}`);
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'fixture');
      assert.equal(body.messages.length, 1);
      assert.equal(body.messages[0].content, '请只回复：连接成功');
      return Response.json({ choices: [{ message: { content: '连接成功' } }] });
    };
    assert.equal(
      (await settings.POST(request({ action: 'test' }))).status,
      200,
    );
    assert.equal(calls, 1);
    await settings.POST(request({ action: 'clear' }));
    assert.equal((await (await settings.GET()).json()).configured, false);
  } finally {
    encryptedRow = undefined;
    globalThis.fetch = originalFetch;
    restoreEnv(prior);
  }
});

test('retelling validates grounded feedback, fails on invented references and makes no request without a key', async () => {
  const evidence = [
      {
        id: 'R1',
        name: '教材',
        section: '定义',
        quote: '特征向量必须是非零向量',
      },
    ],
    feedback = {
      covered: ['方向'],
      missing: ['非零条件'],
      issues: [],
      sourceIds: ['R1'],
    };
  assert.deepEqual(
    parseRetellingFeedback(JSON.stringify(feedback), evidence),
    feedback,
  );
  assert.throws(
    () =>
      parseRetellingFeedback(
        JSON.stringify({ ...feedback, sourceIds: ['fake'] }),
        evidence,
      ),
    /编号/,
  );
  const prior = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    COURSE_KB_AI_SECRET: process.env.COURSE_KB_AI_SECRET,
  };
  delete process.env.OPENAI_API_KEY;
  delete process.env.COURSE_KB_AI_SECRET;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const request = () =>
    new Request('http://localhost:3024/api/retelling', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3024' },
      body: JSON.stringify({
        prompt: '解释特征向量',
        answer: '方向不变',
        evidence,
      }),
    });
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({
        choices: [{ message: { content: JSON.stringify(feedback) } }],
      });
    };
    assert.equal((await retelling.POST(request())).status, 503);
    assert.equal(calls, 0);
    process.env.OPENAI_API_KEY = 'fixture';
    const response = await retelling.POST(request());
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).feedback, feedback);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(prior);
  }
});
