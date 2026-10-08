import type { Note } from './knowledge';
export type NoteDraft = {
  note: Note | null;
  origin: { course: string; session: string; index: number } | null;
};
export const EMPTY_DRAFT: NoteDraft = { note: null, origin: null };
export function readNoteDraft(raw: unknown): NoteDraft {
  if (!raw || typeof raw !== 'object') return EMPTY_DRAFT;
  const draft = raw as NoteDraft;
  if (draft.note === null) return EMPTY_DRAFT;
  if (
    !draft.note ||
    typeof draft.note.id !== 'string' ||
    typeof draft.note.title !== 'string' ||
    typeof draft.note.text !== 'string'
  )
    throw new Error('笔记草稿损坏，已保留原始副本。');
  return {
    note: draft.note,
    origin:
      draft.origin &&
      typeof draft.origin.course === 'string' &&
      typeof draft.origin.session === 'string' &&
      Number.isInteger(draft.origin.index)
        ? draft.origin
        : null,
  };
}
