/**
 * The QUIZ lesson block (backend/src/modules/lessons/domain/blocks/quiz.ts): a reference { quizId, quizVersion } to a quiz of the
 * quiz library. In the learner preview the backend adds the quiz itself under `quiz` (the same shape a published lesson freezes).
 * No imports: usable anywhere.
 */
export interface QuizRef {
  quizId: string;
  quizVersion: number | null;
}

export interface FrozenQuiz {
  title: string;
  description: string | null;
  questions: {
    id: string;
    prompt: string;
    explanation: string | null;
    correctOptionId: string;
    options: { id: string; text: string }[];
  }[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function readQuizRef(content: unknown): QuizRef | null {
  if (!isObject(content) || typeof content.quizId !== 'string') return null;
  return { quizId: content.quizId, quizVersion: typeof content.quizVersion === 'number' ? content.quizVersion : null };
}

/** The quiz embedded in preview content, or null when the block only holds a reference. */
export function readFrozenQuiz(content: unknown): FrozenQuiz | null {
  if (!isObject(content) || !isObject(content.quiz) || !Array.isArray(content.quiz.questions)) return null;
  const quiz = content.quiz;
  return {
    title: typeof quiz.title === 'string' ? quiz.title : 'Quiz',
    description: typeof quiz.description === 'string' ? quiz.description : null,
    questions: (quiz.questions as unknown[]).filter(isObject).map((q) => ({
      id: String(q.id ?? ''),
      prompt: String(q.prompt ?? ''),
      explanation: typeof q.explanation === 'string' ? q.explanation : null,
      correctOptionId: String(q.correctOptionId ?? ''),
      options: Array.isArray(q.options) ? (q.options as unknown[]).filter(isObject).map((o) => ({ id: String(o.id ?? ''), text: String(o.text ?? '') })) : [],
    })),
  };
}
