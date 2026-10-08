import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { moduleUrl } from './load-ts.mjs';
const load = async (p) => import(await moduleUrl(p));
const {
  answerQuestion,
  checkToDrafts,
  validatePractice,
  latestAttempt,
  weakTerms,
  planFromAttempt,
} = await load('../lib/practice.ts');
const { demoCheck, demoWorkspace } = await load('../lib/demo-course.ts');
const { validatePlan } = await load('../lib/review-plans.ts');
const { parseBackup, remapFileIds, collectFileIds } =
  await load('../lib/backup.ts');
const { commitWorkspace, ensureSnapshots } = await load('../lib/snapshots.ts');
const { readNoteDraft } = await load('../lib/note-draft.ts');
const { sourceAnchor, locateSource } = await load('../lib/source-anchor.ts');

test('practice snapshots survive edits, repeat attempts, deletion and full backup', () => {
  const check = demoCheck(),
    drafts = checkToDrafts(check, [], []);
  assert.equal(drafts.length, 2);
  assert.equal(checkToDrafts(check, drafts, []).length, 0);
  assert.throws(() => answerQuestion(drafts[0], 0));
  const q = { ...drafts[0], status: 'ready' };
  const wrong = answerQuestion(q, (q.correct + 1) % 4);
  q.correct = (q.correct + 1) % 4;
  q.version++;
  const right = answerQuestion(q, q.correct);
  const state = { questions: [q], attempts: [wrong, right] };
  assert.equal(wrong.correct, false);
  assert.notEqual(wrong.question.correct, q.correct);
  assert.equal(wrong.questionVersion, 1);
  assert.equal(right.questionVersion, 2);
  assert.equal(latestAttempt(state, q.id), right);
  assert.equal(weakTerms(state)[0].pending, 0);
  validatePractice(state);
  const workspace = demoWorkspace();
  workspace.courses[0].studyLab = { practice: state };
  const restored = parseBackup(JSON.parse(JSON.stringify(workspace))).state;
  assert.deepEqual(
    restored.courses[0].studyLab.practice,
    JSON.parse(JSON.stringify(state)),
  );
  assert.equal(
    planFromAttempt(wrong, workspace.courses[0]).id,
    planFromAttempt(wrong, workspace.courses[0]).id,
  );
  validatePlan(planFromAttempt(wrong, workspace.courses[0]));
  q.deletedAt = new Date().toISOString();
  assert.throws(() => answerQuestion(q, 0));
  assert.deepEqual(weakTerms(state), []);
});
test('boolean questions, historical provenance and corrupt imports are validated', () => {
  const q = {
    ...checkToDrafts(demoCheck(), [], [])[0],
    kind: 'boolean',
    options: ['正确', '错误'],
    correct: 0,
    status: 'ready',
  };
  q.evidence[0].fileId = 'source-file';
  const attempt = answerQuestion(q, 1),
    state = demoWorkspace();
  state.courses[0].studyLab = {
    practice: { questions: [q], attempts: [attempt] },
  };
  assert.ok(collectFileIds(state).includes('source-file'));
  const remapped = remapFileIds(
    state,
    new Map([['source-file', 'restored-file']]),
  );
  assert.equal(
    remapped.courses[0].studyLab.practice.attempts[0].question.evidence[0]
      .fileId,
    'restored-file',
  );
  for (const edit of [
    (p) => (p.attempts[0].answer = 9),
    (p) => (p.attempts[0].correct = true),
    (p) => p.questions.push(p.questions[0]),
    (p) => (p.questions[0].options = ['同一', '同一']),
  ]) {
    const copy = structuredClone(state.courses[0].studyLab.practice);
    edit(copy);
    assert.throws(() => validatePractice(copy));
  }
});
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    'CREATE TABLE workspace (id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL);',
  );
  const wrap = (query, args = []) => ({
    bind(...values) {
      return wrap(query, values);
    },
    async run() {
      return {
        meta: { changes: Number(sql.prepare(query).run(...args).changes) },
      };
    },
  });
  return {
    sql,
    prepare: wrap,
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
test('real SQLite transaction snapshots prior state; stale revisions cannot overwrite; retention is bounded', async () => {
  const db = database();
  db.sql
    .prepare('INSERT INTO workspace VALUES (?,?,?)')
    .run('local', '{"courses":[],"notes":[],"marker":"original"}', 0);
  await commitWorkspace(db, '{"marker":"first"}', 0, 'automatic');
  assert.ok(
    db.sql
      .prepare('SELECT payload FROM workspace_snapshots')
      .get()
      .payload.includes('original'),
  );
  assert.equal(
    (await commitWorkspace(db, '{"marker":"stale"}', 0, 'before-restore')).meta
      .changes,
    0,
  );
  assert.equal(
    db.sql.prepare('SELECT count(*) n FROM workspace_snapshots').get().n,
    1,
  );
  await commitWorkspace(db, '{"marker":"second"}', 1, 'automatic');
  assert.equal(
    db.sql.prepare('SELECT count(*) n FROM workspace_snapshots').get().n,
    1,
  );
  await commitWorkspace(db, '{"marker":"restored"}', 2, 'before-restore');
  assert.equal(
    db.sql
      .prepare(
        "SELECT payload FROM workspace_snapshots WHERE reason='before-restore'",
      )
      .get().payload,
    '{"marker":"second"}',
  );
  for (let i = 0; i < 25; i++)
    db.sql
      .prepare('INSERT INTO workspace_snapshots VALUES (?,?,?,?,?)')
      .run(
        `seed-${i}`,
        '{}',
        0,
        `2000-01-${String(i + 1).padStart(2, '0')}`,
        'automatic',
      );
  for (let i = 0; i < 12; i++)
    await commitWorkspace(db, `{"step":${i}}`, i + 3, 'before-restore');
  assert.equal(
    db.sql
      .prepare(
        "SELECT count(*) n FROM workspace_snapshots WHERE reason='automatic'",
      )
      .get().n,
    20,
  );
  assert.equal(
    db.sql
      .prepare(
        "SELECT count(*) n FROM workspace_snapshots WHERE reason='before-restore'",
      )
      .get().n,
    10,
  );
  db.sql.close();
});
test('snapshot and workspace update roll back together on failure', async () => {
  const db = database();
  await ensureSnapshots(db);
  db.sql.prepare('INSERT INTO workspace VALUES (?,?,?)').run('local', '{}', 0);
  db.sql.exec(
    "CREATE TRIGGER reject_write BEFORE UPDATE ON workspace BEGIN SELECT RAISE(ABORT, 'disk write failed'); END;",
  );
  await assert.rejects(
    commitWorkspace(db, '{"new":true}', 0, 'before-restore'),
  );
  assert.equal(
    db.sql.prepare('SELECT count(*) n FROM workspace_snapshots').get().n,
    0,
  );
  assert.equal(
    db.sql.prepare('SELECT revision FROM workspace').get().revision,
    0,
  );
  db.sql.close();
});
test('draft parser supports empty legacy workspaces without accepting corrupt notes', () => {
  assert.deepEqual(readNoteDraft(undefined), { note: null, origin: null });
  assert.throws(() => readNoteDraft({ note: { id: 'bad' } }));
  const note = demoWorkspace().notes[0];
  assert.equal(readNoteDraft({ note, origin: null }).note.id, note.id);
});

test('citations remain anchored across backup remapping and detect changed or removed text', () => {
  const m={name:'讲义',fileId:'original',passages:[{section:'定义',text:'导数描述瞬时变化率。',page:2}]};
  const e={id:'S1',name:m.name,fileId:m.fileId,section:'定义',page:2,quote:m.passages[0].text,...sourceAnchor(m,m.passages[0])};
  assert.equal(locateSource(e,[m]).status,'found');
  const mapping=new Map([['original','restored']]);
  assert.equal(locateSource(remapFileIds(e,mapping),[remapFileIds(m,mapping)]).status,'found');
  assert.equal(locateSource(e,[{...m,passages:[...m.passages,{section:'补充',text:'另一段'}]}]).status,'updated');
  assert.equal(locateSource(e,[{...m,passages:[{section:'定义',text:'完全不同的内容',page:2}]}]).status,'changed');
  assert.equal(locateSource(e,[{...m,deletedAt:'today'}]).status,'deleted');
  assert.equal(locateSource(e,[]).status,'missing');
});

test('note drafts and their source attachments survive the full backup validator', () => {
  const state=demoWorkspace();
  state.noteDraft={note:{...state.notes[0],sources:[{id:'S1',name:'讲义',section:'章节',quote:'原文',fileId:'draft-source'}]},origin:null};
  const parsed=parseBackup(state);
  assert.equal(parsed.state.noteDraft.note.id,state.notes[0].id);
  assert.ok(parsed.missing.includes('draft-source'));
  assert.equal(remapFileIds(parsed.state,new Map([['draft-source','new-source']])).noteDraft.note.sources[0].fileId,'new-source');
  assert.throws(()=>parseBackup({...state,noteDraft:{note:{id:'broken'}}}));
});
