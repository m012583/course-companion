import assert from 'node:assert/strict';
import { recycleEntry, restoreEntry } from '../lib/recycle';
import { parseWorkspace } from '../lib/workspace-schema';
import {
  validateBackup,
  encodeBytes,
  checksum,
  fileIds,
  remapFiles,
} from '../lib/backup';
import type { Workspace } from '../lib/workspace';
import { retrieve } from '../lib/knowledge';
import { suggestedLinks } from '../lib/learning';
const state: Workspace = {
  courses: [
    {
      id: 'c1',
      name: '测试课程',
      code: '',
      materials: [
        {
          name: '教材.txt',
          fileId: 'f1',
          type: 'TXT',
          size: '6 B',
          status: '已解析',
        },
      ],
      sessions: [],
      graphFocus: '',
    },
  ],
  notes: [
    {
      id: 'n1',
      title: '概念',
      text: '内容',
      course: '测试课程',
      courseId: 'c1',
      createdAt: '2026-09-23',
      relatedIds: ['n2'],
    },
    {
      id: 'n2',
      title: '关联',
      text: '内容',
      course: '测试课程',
      courseId: 'c1',
      createdAt: '2026-09-23',
      relatedIds: ['n1'],
      relatedLabels: { n1: '先修' },
    },
  ],
  tasks: [
    {
      id: 't1',
      title: '学习',
      kind: 'learn',
      status: 'todo',
      courseId: 'c1',
      createdAt: '2026-09-23',
    },
  ],
};
const entry = recycleEntry(state, 'note', 'n1');
const deleted: Workspace = {
  ...state,
  notes: [{ ...state.notes[1], relatedIds: [], relatedLabels: {} }],
  trash: [entry],
};
const restored = restoreEntry(deleted, entry.id);
assert.deepEqual(restored.notes.find((n) => n.id === 'n2')?.relatedLabels, {
  n1: '先修',
});
assert.equal(restored.trash?.length, 0);
assert.throws(
  () => restoreEntry({ ...deleted, courses: [] }, entry.id),
  /先恢复/,
);
assert.throws(
  () => restoreEntry({ ...state, trash: [entry] }, entry.id),
  /冲突/,
);
const courseEntry = recycleEntry(state, 'course', 'c1');
assert.equal(courseEntry.notes.length, 2);
assert.equal(courseEntry.tasks.length, 1);
assert.equal(
  restoreEntry({ courses: [], notes: [], trash: [courseEntry] }, courseEntry.id)
    .courses.length,
  1,
);
assert.throws(
  () => parseWorkspace({ ...state, notes: [...state.notes, state.notes[0]] }),
  /重复/,
);
assert.throws(
  () => parseWorkspace({ ...state, courses: [{ id: 'c1', name: '错误' }] }),
  /格式/,
);
const bytes = new TextEncoder().encode('教材原文');
const backup = {
  format: 'course-companion',
  version: 1,
  createdAt: '2026-09-23',
  state,
  files: [
    {
      id: 'f1',
      name: '教材.txt',
      type: 'text/plain',
      size: bytes.length,
      sha256: await checksum(bytes),
      data: encodeBytes(bytes),
    },
  ],
};
assert.equal((await validateBackup(backup)).files.length, 1);
await assert.rejects(() => validateBackup({ ...backup, files: [] }), /附件/);
await assert.rejects(
  () =>
    validateBackup({
      ...backup,
      files: [
        { ...backup.files[0], data: encodeBytes(new Uint8Array(bytes.length)) },
      ],
    }),
  /校验/,
);
assert.deepEqual(fileIds({ courses: [], trash: [courseEntry] }), ['f1']);
assert.deepEqual(fileIds(remapFiles(state, new Map([['f1', 'new-file']]))), [
  'new-file',
]);
console.log(
  'PASS domain: recycle links, course bundle, owner/collision guard, schema, attachment completeness/hash/remap',
);
const longMaterial = {
  name: 'matrix.txt',
  type: 'TXT',
  size: '1 KB',
  status: '已解析',
  passages: [
    { text: 'matrix '.repeat(1000), section: 'long' },
    { text: 'matrix rank', section: 'short' },
  ],
};
assert.equal(retrieve('matrix', [longMaterial], 100)[0]?.section, 'short');
assert.deepEqual(
  retrieve('未知问题', [
    {
      ...longMaterial,
      name: '普通',
      passages: [{ text: '其他文字', section: 'none' }],
    },
  ]),
  [],
);
assert.deepEqual(
  fileIds({
    ...state,
    reading: {
      courseId: 'c1',
      materialKey: 'legacy-name',
      passage: 0,
      updatedAt: '',
    },
  }),
  ['f1'],
);
assert.equal(
  suggestedLinks({ ...state.notes[0], relatedIds: [], tags: ['矩阵'] }, [
    { ...state.notes[1], relatedIds: [], tags: ['矩阵'] },
  ]).length,
  1,
);
console.log(
  'PASS retrieval budget, absent evidence, reading metadata and explicit note suggestions',
);
