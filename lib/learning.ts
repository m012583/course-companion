import type { Note } from './knowledge';
export function suggestedLinks(note: Note, notes: Note[]) {
  return notes
    .filter(
      (other) =>
        other.id !== note.id &&
        !note.relatedIds?.includes(other.id) &&
        !other.relatedIds?.includes(note.id),
    )
    .map((other) => {
      const tags = (note.tags ?? []).filter((tag) => other.tags?.includes(tag));
      const sameCourse = note.courseId
        ? note.courseId === other.courseId
        : note.course === other.course;
      const sameChapter =
        sameCourse && !!note.chapter && note.chapter === other.chapter;
      return {
        note: other,
        score: tags.length * 2 + (sameChapter ? 1 : 0),
        reason: tags.length
          ? `共同标签：${tags.join('、')}`
          : `同一章节：${note.chapter}`,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
