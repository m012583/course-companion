import type { ConceptGraph, NodePosition } from './note-graph';
export type Passage = {
  text: string;
  page?: number;
  section: string;
  start?: number;
};
export type Coverage = {
  totalPages?: number;
  readPages?: number;
  emptyPages?: number;
  characters: number;
  truncated: boolean;
  legacy?: boolean;
};
export type Evidence = {
  id: string;
  name: string;
  fileId?: string;
  page?: number;
  section: string;
  quote: string;
};
export type Material = {
  name: string;
  type: string;
  size: string;
  status: string;
  content?: string;
  fileId?: string;
  passages?: Passage[];
  coverage?: Coverage;
  chapter?: string;
};
export type Note = {
  reviewHistory?: {
    at: string;
    answer: string;
    rating: 'again' | 'hard' | 'good';
  }[];
  id: string;
  title: string;
  text: string;
  course: string;
  courseId?: string;
  createdAt: string;
  updatedAt?: string;
  mastery?: string;
  reviewAt?: string;
  sessionId?: string;
  tags?: string[];
  chapter?: string;
  sources?: Evidence[];
  reviewCount?: number;
  reviewQuestion?: string;
  relatedIds?: string[];
  relatedLabels?: Record<string, string>;
  conceptGraph?: ConceptGraph;
  graphPositions?: Record<string, NodePosition>;
};
export function normalizeMath(text: string) {
  // Providers often emit LaTeX delimiters even when Markdown was requested.
  // Leave literal examples inside code untouched.
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part) =>
      part.startsWith('`')
        ? part
        : part
            .replace(
              /\\\[([\s\S]*?)\\\]/g,
              (_, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`,
            )
            .replace(
              /\\\(([\s\S]*?)\\\)/g,
              (_, math: string) => `$${math.trim()}$`,
            ),
    )
    .join('');
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function isDue(note: Note, today = localDate()) {
  return !!note.reviewAt && note.reviewAt <= today;
}
export function selectNotes(
  notes: Note[],
  filters: {
    courseId?: string;
    courseName?: string;
    chapter?: string;
    tag?: string;
    dueOnly?: boolean;
    query?: string;
  },
) {
  const query = (filters.query ?? '').trim().toLowerCase();
  return notes
    .filter(
      (note) =>
        (!filters.courseId ||
          (note.courseId
            ? note.courseId === filters.courseId
            : note.course === filters.courseName)) &&
        (!filters.chapter || note.chapter === filters.chapter) &&
        (!filters.tag || note.tags?.includes(filters.tag)) &&
        (!filters.dueOnly || isDue(note)) &&
        `${note.title} ${note.text} ${(note.tags ?? []).join(' ')} ${note.chapter ?? ''}`
          .toLowerCase()
          .includes(query),
    )
    .sort((a, b) =>
      (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
    );
}
export function scheduleReview(note: Note, correct: boolean, now = new Date()) {
  const count = correct ? (note.reviewCount ?? 0) + 1 : 0;
  const days = correct ? [1, 3, 7, 14, 30][Math.min(count - 1, 4)] : 1;
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  return {
    reviewCount: count,
    reviewAt: localDate(next),
    mastery: correct && count >= 3 ? '已掌握' : '复习中',
    updatedAt: now.toISOString(),
  };
}
export function splitPassages(text: string, page?: number): Passage[] {
  const parts: Passage[] = [];
  for (let start = 0; start < text.length; start += 1050) {
    const piece = text.slice(start, start + 1200);
    if (piece.trim())
      parts.push({
        text: piece,
        page,
        start,
        section: page ? `第 ${page} 页` : `段落 ${parts.length + 1}`,
      });
  }
  return parts;
}
export function passageText(passages: Passage[]) {
  let end = 0;
  let previousPage: number | undefined;
  let result = '';
  for (const p of passages) {
    if (p.page !== previousPage) {
      end = 0;
      if (result) result += '\n\n';
    }
    if (p.start === undefined) result += `${result ? '\n\n' : ''}${p.text}`;
    else {
      result += p.text.slice(Math.max(0, end - p.start));
      end = p.start + p.text.length;
    }
    previousPage = p.page;
  }
  return result;
}
export function coverageLabel(material: Material) {
  if (!material.content && !material.passages?.length)
    return material.status === '示例'
      ? '示例 · 不参与问答'
      : '未提取到文字 · 请检查是否为扫描件';
  const c = material.coverage;
  if (!c || c.legacy) return '旧版正文 · 覆盖范围未知，请重新解析';
  return `${c.readPages !== undefined ? `读取 ${c.readPages}/${c.totalPages} 页 · ` : ''}${c.characters.toLocaleString()} 字符${c.truncated ? ' · 仅提取部分内容' : ' · 文字提取完成'}${c.emptyPages ? ` · ${c.emptyPages} 页无可读取文字` : ''}`;
}
function terms(text: string) {
  const normalized = text.toLowerCase();
  return [
    ...new Set([
      ...(normalized.match(/[a-z0-9_]{2,}/g) ?? []),
      ...[...normalized.matchAll(/[\u3400-\u9fff]{2,}/g)].flatMap((match) =>
        Array.from({ length: match[0].length - 1 }, (_, i) =>
          match[0].slice(i, i + 2),
        ),
      ),
    ]),
  ];
}
export function retrieve(
  question: string,
  materials: Material[],
  maxCharacters = 18000,
): Evidence[] {
  const tokens = terms(question);
  const ranked = materials
    .flatMap((material) =>
      (material.passages?.length
        ? material.passages
        : splitPassages(material.content ?? '')
      ).map((passage) => {
        const text = passage.text.toLowerCase();
        const hits = tokens.filter((term) => text.includes(term));
        const titleHit = tokens.some((term) =>
          material.name.toLowerCase().includes(term),
        );
        // A single Chinese bigram in unrelated prose is weak evidence. Keep
        // explicit title matches and English technical terms, otherwise require two hits.
        const relevant =
          hits.length >= 2 ||
          titleHit ||
          hits.some((term) => /^[a-z0-9_]+$/.test(term));
        const score = tokens.reduce(
          (sum, term) =>
            sum +
            (text.includes(term) ? 1 : 0) +
            (material.name.toLowerCase().includes(term) ? 0.25 : 0),
          0,
        );
        return { material, passage, score: relevant ? score : 0 };
      }),
    )
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  // Broad overview requests have no concept to search for. Sample each file
  // across its beginning, middle and end, while retaining real provenance.
  if (!ranked.length && /总结|概览|核心概念|复习|练习题|整理/.test(question)) {
    const groups = materials.map((material) => ({
      material,
      passages: material.passages?.length
        ? material.passages
        : splitPassages(material.content ?? ''),
    }));
    for (const position of [0, 0.5, 1]) {
      for (const { material, passages } of groups) {
        if (!passages.length) continue;
        const passage = passages[Math.floor((passages.length - 1) * position)];
        if (
          !ranked.some(
            (item) => item.material === material && item.passage === passage,
          )
        )
          ranked.push({ material, passage, score: 0 });
      }
    }
  }
  const evidence: Evidence[] = [];
  let used = 0;
  for (const { material, passage } of ranked) {
    if (evidence.length >= 16) break;
    if (used + passage.text.length > maxCharacters) continue;
    evidence.push({
      id: `S${evidence.length + 1}`,
      name: material.name,
      fileId: material.fileId,
      page: passage.page,
      section: passage.section,
      quote: passage.text,
    });
    used += passage.text.length;
  }
  return evidence;
}

export type PlanSuggestion = { kind: 'review' | 'learn' | 'tip'; text: string };

export function planSuggestions(input: {
  dueCount: number;
  upcomingCount: number;
  courses: Array<{ name: string; materialCount: number; noteCount: number }>;
  todayTasks: number;
  doneToday: number;
}): PlanSuggestion[] {
  const out: PlanSuggestion[] = [];
  if (input.dueCount > 0)
    out.push({
      kind: 'review',
      text: `有 ${input.dueCount} 条笔记已到复习日，建议先完成今日复习，再安排新的学习任务。`,
    });
  if (input.upcomingCount > 0)
    out.push({
      kind: 'review',
      text: `未来 3 天有 ${input.upcomingCount} 条笔记将进入复习期，可以提前预留时间或提早复习。`,
    });
  let limited = 0;
  for (const c of input.courses) {
    if (limited >= 2) break;
    if (c.materialCount > 0 && c.noteCount === 0) {
      out.push({
        kind: 'learn',
        text: `课程「${c.name}」已上传 ${c.materialCount} 份资料但还没有笔记，建议安排一次学习整理。`,
      });
      limited++;
    }
  }
  if (input.todayTasks > 4)
    out.push({
      kind: 'tip',
      text: '今天安排的任务偏多，建议按 25 分钟番茄钟拆解，先完成最重要的一项。',
    });
  else if (input.doneToday > 0 && input.todayTasks === 0)
    out.push({
      kind: 'tip',
      text: '今日任务已清空。可以安排一项小学习任务保持节奏，例如把一章资料整理成笔记。',
    });
  if (out.length < 3)
    out.push({
      kind: 'tip',
      text: '先复习再学新内容效果更好：学习新知识后隔 10 分钟回顾要点，睡前再快速过一遍。',
    });
  if (!out.length)
    out.push({
      kind: 'tip',
      text: '从一门课的已有资料中挑一节开始吧——阅读、提问、整理成笔记，完成第一个小任务。',
    });
  return out.slice(0, 4);
}
