/**
 * Reordering in the quiz editors (QUIZ-002). Pure: no React, no requests. The quiz API takes the questions, and each question's options, as ORDERED lists and
 * stores their positions from that order (backend quizzes/persistence/quiz.repository.ts `replaceQuestions`: position = place in the list), and which option is
 * correct is a flag on the option itself (`correct`), not a place. So moving an item is just moving it in the list: its text, explanation, Scripture, levels,
 * feedback and correct-answer flag travel with it, and positions stay 1..n with no gaps or repeats.
 */

/** A copy of `list` with the item at `from` moved to `to`. An impossible move (out of range, or the same place) returns an unchanged copy. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

let counter = 0;

/**
 * An id for a question or option that exists only in the form (it is never sent: the server gives every saved question and option its own id). Unique for the life
 * of the page, so a moved item keeps its identity (its React key, and whatever its fields are holding) even after other items were removed and added.
 */
export const newLocalId = (prefix: string): string => `${prefix}-new-${(counter += 1)}`;
