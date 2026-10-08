import type { Note } from './knowledge';
export type NoteVersion = {
  id: string;
  createdAt: string;
  title: string;
  text: string;
  chapter: string;
  tags: string[];
  reviewQuestion: string;
};
export function checkpointNote(note: Note): Note {
  const snapshot = {
    title: note.title,
    text: note.text,
    chapter: note.chapter ?? '',
    tags: [...(note.tags ?? [])],
    reviewQuestion: note.reviewQuestion ?? '',
  };
  const last = note.versions?.[0];
  if (
    last &&
    Object.entries(snapshot).every(
      ([key, value]) =>
        JSON.stringify(last[key as keyof NoteVersion]) ===
        JSON.stringify(value),
    )
  )
    return note;
  return {
    ...note,
    versions: [
      {
        ...snapshot,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      },
      ...(note.versions ?? []),
    ].slice(0, 20),
  };
}
export function restoreNoteVersion(note: Note, versionId: string): Note {
  const version = note.versions?.find((v) => v.id === versionId);
  if (!version) throw new Error('历史版本不存在。');
  const saved = checkpointNote(note);
  return {
    ...saved,
    title: version.title,
    text: version.text,
    chapter: version.chapter,
    tags: [...version.tags],
    reviewQuestion: version.reviewQuestion,
    updatedAt: new Date().toISOString(),
  };
}
