import type { Note } from './knowledge';

export type CourseIdentity = { id: string; name: string; deletedAt?: string };

export function belongsToCourse(note: Note, course: CourseIdentity) {
  return note.courseId
    ? note.courseId === course.id
    : note.course === course.name;
}

// Deleting a course hides its contents without overwriting their own trash state.
export function isInDeletedCourse(note: Note, courses: CourseIdentity[]) {
  return courses.some(
    (course) => !!course.deletedAt && belongsToCourse(note, course),
  );
}

export function trashCourse<T extends CourseIdentity>(
  courses: T[],
  id: string,
  now = new Date().toISOString(),
): T[] {
  return courses.map((course) =>
    course.id === id ? { ...course, deletedAt: now } : course,
  );
}

export function restoreCourse<T extends CourseIdentity>(
  courses: T[],
  id: string,
): T[] {
  return courses.map((course) =>
    course.id === id ? { ...course, deletedAt: undefined } : course,
  );
}
