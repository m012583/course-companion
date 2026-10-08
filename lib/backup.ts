import { readNoteDraft } from './note-draft';
import { validatePractice } from './practice';
import { readGuideContent } from './course-guide';
import { validatePlan, type ReviewPlan } from './review-plans';
export type BackupState = {
  courses: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  reviewPlans?: Record<string, unknown>[];
  [key: string]: unknown;
};
export type BackupFile = {
  id: string;
  name: string;
  type: string;
  data: string;
  sha256: string;
};
export type BackupBundle = {
  format: 'course-kb-bundle';
  version: 2;
  exportedAt: string;
  state: BackupState;
  files: BackupFile[];
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const validEvidence = (value: unknown): value is Record<string, unknown> =>
  record(value) &&
  ['id', 'name', 'section', 'quote'].every(
    (key) => typeof value[key] === 'string',
  ) &&
  (value.fileId === undefined || typeof value.fileId === 'string') &&
  (value.page === undefined ||
    (Number.isInteger(value.page) && Number(value.page) > 0));
export function validateWorkspace(value: unknown): BackupState {
  if (
    !record(value) ||
    !Array.isArray(value.courses) ||
    value.courses.length > 300 ||
    !Array.isArray(value.notes) ||
    value.notes.length > 10000
  )
    throw new Error('备份缺少有效的课程或笔记数组。');
  if (JSON.stringify(value).length > 8_000_000)
    throw new Error('课程正文超过 8 MB，请先拆分。');
  const ids = new Set();
  for (const c of value.courses) {
    if (
      !record(c) ||
      typeof c.id !== 'string' ||
      !c.id ||
      ids.has(c.id) ||
      typeof c.name !== 'string' ||
      !Array.isArray(c.materials) ||
      !Array.isArray(c.sessions)
    )
      throw new Error('课程标识重复或内容格式无效。');
    ids.add(c.id);
    if (
      c.citationReviews !== undefined &&
      (!Array.isArray(c.citationReviews) ||
        c.citationReviews.length > 1000 ||
        c.citationReviews.some(
          (r) =>
            !record(r) ||
            !validEvidence(r.evidence) ||
            !['supports', 'partial', 'mismatch'].includes(String(r.verdict)) ||
            ['id', 'claim', 'comment', 'correction', 'updatedAt'].some(
              (k) => typeof r[k] !== 'string' || String(r[k]).length > 4000,
            ),
        ))
    )
      throw new Error('引用核对记录格式无效。');
    if (
      c.materials.some(
        (m) =>
          !record(m) ||
          typeof m.name !== 'string' ||
          (m.content !== undefined && typeof m.content !== 'string') ||
          (m.passages !== undefined &&
            (!Array.isArray(m.passages) ||
              m.passages.some(
                (p) =>
                  !record(p) ||
                  typeof p.text !== 'string' ||
                  typeof p.section !== 'string',
              ))),
      )
    )
      throw new Error('资料格式无效。');
    if (
      c.sessions.some(
        (s) =>
          !record(s) ||
          typeof s.id !== 'string' ||
          typeof s.title !== 'string' ||
          !Array.isArray(s.messages) ||
          s.messages.some(
            (m) =>
              !record(m) ||
              !['user', 'assistant'].includes(String(m.role)) ||
              typeof m.text !== 'string',
          ),
      )
    )
      throw new Error('对话格式无效。');
    if (
      c.chapters !== undefined &&
      (!Array.isArray(c.chapters) ||
        c.chapters.some((x) => typeof x !== 'string'))
    )
      throw new Error('章节格式无效。');
    if (c.guide !== undefined) {
      if (
        !record(c.guide) ||
        !record(c.guide.settings) ||
        typeof c.guide.settings.level !== 'string' ||
        typeof c.guide.generatedFor !== 'string' ||
        !['ai', 'manual'].includes(String(c.guide.source))
      )
        throw new Error('导览信息无效。');
      readGuideContent(c.guide, true);
    }
    if (
      c.reading !== undefined &&
      (!record(c.reading) ||
        typeof c.reading.name !== 'string' ||
        !Number.isInteger(c.reading.passage) ||
        Number(c.reading.passage) < 0 ||
        Number(c.reading.passage) > 100000 ||
        typeof c.reading.updatedAt !== 'string' ||
        (c.reading.fileId !== undefined &&
          typeof c.reading.fileId !== 'string'))
    )
      throw new Error('阅读位置格式无效。');
    if (c.studyLab !== undefined) {
      if (!record(c.studyLab)) throw new Error('研学记录格式无效。');
      const lab = c.studyLab;
      if (
        lab.retellingDraft !== undefined &&
        (!record(lab.retellingDraft) ||
          typeof lab.retellingDraft.file !== 'string' ||
          !Number.isInteger(lab.retellingDraft.passage) ||
          Number(lab.retellingDraft.passage) < 0 ||
          typeof lab.retellingDraft.answer !== 'string' ||
          lab.retellingDraft.answer.length > 8000)
      )
        throw new Error('复述草稿格式无效。');
      if (
        lab.retellings !== undefined &&
        (!Array.isArray(lab.retellings) ||
          lab.retellings.length > 200 ||
          lab.retellings.some(
            (r) =>
              !record(r) ||
              ['id', 'prompt', 'answer', 'createdAt'].some(
                (k) => typeof r[k] !== 'string' || String(r[k]).length > 8000,
              ) ||
              !Array.isArray(r.evidence) ||
              !r.evidence.length ||
              r.evidence.length > 8 ||
              r.evidence.some((e) => !validEvidence(e)) ||
              (r.assessment !== undefined &&
                (typeof r.assessment !== 'string' ||
                  !['understood', 'needs-work'].includes(r.assessment))) ||
              (r.correction !== undefined &&
                (typeof r.correction !== 'string' ||
                  r.correction.length > 2000)) ||
              (r.feedback !== undefined &&
                (!record(r.feedback) ||
                  ['covered', 'missing', 'issues', 'sourceIds'].some(
                    (k) =>
                      !Array.isArray(
                        (r.feedback as Record<string, unknown>)[k],
                      ) ||
                      (r.feedback as Record<string, string[]>)[k].some(
                        (x) => typeof x !== 'string',
                      ),
                  ) ||
                  !(r.feedback.sourceIds as string[]).length ||
                  (r.feedback.sourceIds as string[]).some(
                    (id) =>
                      !(r.evidence as Record<string, unknown>[]).some(
                        (e) => e.id === id,
                      ),
                  ))),
          ))
      )
        throw new Error('复述记录格式无效。');
      if (
        c.studyLab.flow !== undefined &&
        (!record(c.studyLab.flow) ||
          ['chapterId', 'checkId', 'updatedAt'].some(
            (k) =>
              typeof (c.studyLab as Record<string, Record<string, unknown>>)
                .flow[k] !== 'string',
          ))
      )
        throw new Error('学习流程记录格式无效。');
      if (c.studyLab.practice !== undefined)
        validatePractice(c.studyLab.practice);
      if (
        c.studyLab.checks !== undefined &&
        (!Array.isArray(c.studyLab.checks) ||
          c.studyLab.checks.some(
            (check) =>
              !record(check) ||
              typeof check.id !== 'string' ||
              typeof check.createdAt !== 'string' ||
              !['ai', 'demo'].includes(String(check.source)) ||
              !Array.isArray(check.evidence) ||
              check.evidence.some((e) => !validEvidence(e)) ||
              (check.answers !== undefined &&
                (!Array.isArray(check.answers) ||
                  check.answers.length !== 2 ||
                  check.answers.some(
                    (a) =>
                      !Number.isInteger(a) || Number(a) < 0 || Number(a) > 3,
                  ))) ||
              !Array.isArray(check.questions) ||
              check.questions.length !== 2 ||
              check.questions.some(
                (q) =>
                  !record(q) ||
                  typeof q.id !== 'string' ||
                  typeof q.prompt !== 'string' ||
                  typeof q.term !== 'string' ||
                  !Array.isArray(q.options) ||
                  q.options.length !== 4 ||
                  q.options.some((o) => typeof o !== 'string') ||
                  !Number.isInteger(q.correct) ||
                  Number(q.correct) < 0 ||
                  Number(q.correct) > 3 ||
                  typeof q.explanation !== 'string' ||
                  !Array.isArray(q.sourceIds) ||
                  !q.sourceIds.length ||
                  q.sourceIds.some(
                    (id) =>
                      typeof id !== 'string' ||
                      !(check.evidence as Record<string, unknown>[]).some(
                        (e) => e.id === id,
                      ),
                  ),
              ),
          ))
      )
        throw new Error('自测记录格式无效。');
      if (
        c.studyLab.calibration !== undefined &&
        (!record(c.studyLab.calibration) ||
          !Array.isArray(c.studyLab.calibration.materialKeys) ||
          c.studyLab.calibration.materialKeys.some(
            (k) => typeof k !== 'string',
          ) ||
          typeof c.studyLab.calibration.toc !== 'string')
      )
        throw new Error('校准记录格式无效。');
    }
  }
  if (
    value.notes.some(
      (n) =>
        !record(n) ||
        typeof n.id !== 'string' ||
        typeof n.title !== 'string' ||
        typeof n.text !== 'string' ||
        typeof n.course !== 'string',
    )
  )
    throw new Error('笔记格式无效。');
  for (const n of value.notes as Record<string, unknown>[])
    if (
      n.versions !== undefined &&
      (!Array.isArray(n.versions) ||
        n.versions.length > 20 ||
        n.versions.some(
          (v) =>
            !record(v) ||
            [
              'id',
              'createdAt',
              'title',
              'text',
              'chapter',
              'reviewQuestion',
            ].some((k) => typeof v[k] !== 'string') ||
            !Array.isArray(v.tags) ||
            v.tags.some((t) => typeof t !== 'string'),
        ))
    )
      throw new Error('笔记历史格式无效。');
  if (
    value.reviewPlans !== undefined &&
    (!Array.isArray(value.reviewPlans) ||
      value.reviewPlans.some(
        (p) =>
          !record(p) ||
          typeof p.id !== 'string' ||
          typeof p.courseId !== 'string' ||
          !Array.isArray(p.tasks),
      ))
  )
    throw new Error('复习计划格式无效。');
  for (const plan of (value.reviewPlans ?? []) as ReviewPlan[])
    if (validatePlan(plan)) throw new Error('复习计划内容无效。');
  if (
    value.preferences !== undefined &&
    (!record(value.preferences) ||
      ['brandName', 'userName', 'semester'].some(
        (key) =>
          typeof (value.preferences as Record<string, unknown>)[key] !==
          'string',
      ))
  )
    throw new Error('空间设置格式无效。');
  if (value.model !== undefined && typeof value.model !== 'string')
    throw new Error('模型设置格式无效。');
  if (record(value.preferences)) {
    const p = value.preferences;
    if (
      p.reviewMinutes !== undefined &&
      ![10, 20, 30, 60, 90].includes(Number(p.reviewMinutes))
    )
      throw new Error('复习时间预算无效。');
    if (
      p.reviewSnoozes !== undefined &&
      (!record(p.reviewSnoozes) ||
        Object.keys(p.reviewSnoozes).length > 20000 ||
        Object.values(p.reviewSnoozes).some(
          (v) => typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v),
        ))
    )
      throw new Error('暂缓提醒记录无效。');
  }
  if (value.noteDraft !== undefined) readNoteDraft(value.noteDraft);
  const safeKeys = [
    'noteDraft',
    'courses',
    'notes',
    'reviewPlans',
    'courseId',
    'sessionId',
    'activeView',
    'preferences',
    'model',
  ];
  return Object.fromEntries(
    safeKeys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  ) as BackupState;
}
export function collectFileIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (item: unknown, depth: number) => {
    if (depth > 30) throw new Error('备份嵌套过深。');
    if (Array.isArray(item)) item.forEach((v) => visit(v, depth + 1));
    else if (record(item))
      for (const [key, v] of Object.entries(item)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype')
          throw new Error('备份包含无效字段。');
        if (key === 'fileId' && typeof v === 'string' && v) ids.add(v);
        else visit(v, depth + 1);
      }
  };
  visit(value, 0);
  return [...ids];
}
export function remapFileIds<T>(value: T, mapping: Map<string, string>): T {
  if (Array.isArray(value))
    return value.map((v) => remapFileIds(v, mapping)) as T;
  if (record(value))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === 'fileId' && typeof v === 'string'
          ? (mapping.get(v) ?? v)
          : k === 'retellingDraft' && record(v) && typeof v.file === 'string'
            ? { ...v, file: mapping.get(v.file) ?? v.file }
            : k === 'materialKeys' && Array.isArray(v)
              ? v.map((id) =>
                  typeof id === 'string' ? (mapping.get(id) ?? id) : id,
                )
              : remapFileIds(v, mapping),
      ]),
    ) as T;
  return value;
}
export function bytesToBase64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export async function digest(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export function parseBackup(value: unknown) {
  if (!record(value)) throw new Error('备份文件格式无效。');
  const bundled = value.format === 'course-kb-bundle';
  if (value.format && (!bundled || value.version !== 2))
    throw new Error('不支持该备份版本。');
  const state = validateWorkspace(bundled ? value.state : value);
  const ids = collectFileIds(state);
  const files = bundled ? value.files : [];
  if (!Array.isArray(files) || files.length > 300)
    throw new Error('附件数量无效，最多 300 个。');
  let size = 0;
  const seen = new Set<string>();
  for (const f of files) {
    if (
      !record(f) ||
      typeof f.id !== 'string' ||
      !ids.includes(f.id) ||
      seen.has(f.id) ||
      typeof f.name !== 'string' ||
      f.name.length > 300 ||
      typeof f.type !== 'string' ||
      typeof f.data !== 'string' ||
      f.data.length > 28_000_000 ||
      f.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data) ||
      typeof f.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(f.sha256)
    )
      throw new Error('附件清单格式无效。');
    size += f.data.length;
    seen.add(f.id);
  }
  if (size > 70_000_000) throw new Error('附件总量超过 50 MB。');
  const missing = ids.filter((id) => !seen.has(id));
  if (bundled && missing.length)
    throw new Error(`完整备份缺少 ${missing.length} 个附件，未恢复。`);
  return { state, files: files as BackupFile[], missing, bundled };
}
