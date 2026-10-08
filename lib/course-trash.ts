import type { CourseGuide, GuideChapter } from './course-guide';
import type { Material, Note } from './knowledge';
export type ChapterTrash = {
  id: string;
  title: string;
  deletedAt: string;
  wasManual: boolean;
  guideChapter?: GuideChapter;
  guideIndex: number;
  noteIds: string[];
  materialKeys: string[];
};
export type TrashCourse = {
  id: string;
  name: string;
  chapters?: string[];
  guide?: CourseGuide;
  materials: Material[];
  removedChapters?: ChapterTrash[];
};
const materialKey = (material: Material) => material.fileId || material.name;
const belongs = (note: Note, course: TrashCourse) =>
  note.courseId ? note.courseId === course.id : note.course === course.name;

export function removeChapter<T extends TrashCourse>(
  course: T,
  notes: Note[],
  title: string,
  now = new Date().toISOString(),
) {
  const guideIndex =
    course.guide && !course.guide.deletedAt
      ? course.guide.chapters.findIndex((chapter) => chapter.title === title)
      : -1;
  const entry: ChapterTrash = {
    id: crypto.randomUUID(),
    title,
    deletedAt: now,
    wasManual: course.chapters?.includes(title) ?? false,
    guideIndex,
    guideChapter:
      guideIndex >= 0 ? course.guide!.chapters[guideIndex] : undefined,
    noteIds: notes
      .filter((note) => belongs(note, course) && note.chapter === title)
      .map((note) => note.id),
    materialKeys: course.materials
      .filter((material) => material.chapter === title)
      .map(materialKey),
  };
  return {
    course: {
      ...course,
      chapters: (course.chapters ?? []).filter((chapter) => chapter !== title),
      ...(guideIndex >= 0
        ? {
            guide: {
              ...course.guide!,
              chapters: course.guide!.chapters.filter(
                (chapter) => chapter.title !== title,
              ),
              updatedAt: now,
            },
          }
        : {}),
      materials: course.materials.map((material) =>
        material.chapter === title ? { ...material, chapter: '' } : material,
      ),
      removedChapters: [...(course.removedChapters ?? []), entry],
    },
    notes: notes.map((note) =>
      entry.noteIds.includes(note.id) ? { ...note, chapter: '' } : note,
    ),
  };
}
export function restoreChapter<T extends TrashCourse>(
  course: T,
  notes: Note[],
  id: string,
) {
  const entry = course.removedChapters?.find((item) => item.id === id);
  if (!entry) throw new Error('待恢复章节不存在。');
  if (
    course.chapters?.includes(entry.title) ||
    (course.guide &&
      !course.guide.deletedAt &&
      course.guide.chapters.some((chapter) => chapter.title === entry.title))
  )
    throw new Error('已有同名章节，请先改名后恢复，避免覆盖新内容。');
  if (entry.guideChapter && (!course.guide || course.guide.deletedAt))
    throw new Error('请先恢复课程导览，再恢复这个章节。');
  const guideChapters = [...(course.guide?.chapters ?? [])];
  if (entry.guideChapter)
    guideChapters.splice(
      Math.min(entry.guideIndex, guideChapters.length),
      0,
      entry.guideChapter,
    );
  return {
    course: {
      ...course,
      chapters:
        entry.wasManual || !entry.guideChapter
          ? [...(course.chapters ?? []), entry.title]
          : course.chapters,
      ...(entry.guideChapter
        ? {
            guide: {
              ...course.guide!,
              chapters: guideChapters,
              updatedAt: new Date().toISOString(),
            },
          }
        : {}),
      materials: course.materials.map((material) =>
        entry.materialKeys.includes(materialKey(material)) && !material.chapter
          ? { ...material, chapter: entry.title }
          : material,
      ),
      removedChapters: course.removedChapters!.filter((item) => item.id !== id),
    },
    notes: notes.map((note) =>
      belongs(note, course) && entry.noteIds.includes(note.id) && !note.chapter
        ? { ...note, chapter: entry.title }
        : note,
    ),
  };
}
