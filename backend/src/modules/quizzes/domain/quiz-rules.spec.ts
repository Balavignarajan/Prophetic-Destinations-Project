import {
  type QuizInput,
  type QuizWithQuestions,
  QUIZ_LIMITS,
  checkAnswers,
  checkQuizContent,
  normalizeQuiz,
  publishProblems,
  scoreSubmission,
  toPublicQuiz,
} from './quiz-rules.js';

const question = (overrides: Partial<QuizInput['questions'][number]> = {}) => ({
  prompt: 'Who built the ark?',
  explanation: 'Genesis tells the story.',
  options: [
    { text: 'Noah', correct: true },
    { text: 'Moses', correct: false },
    { text: 'David', correct: false },
  ],
  ...overrides,
});
const quiz = (overrides: Partial<QuizInput> = {}): QuizInput => ({
  title: 'Basics',
  description: 'A short demo quiz',
  questions: [question()],
  ...overrides,
});
const problems = (input: QuizInput) => checkQuizContent(normalizeQuiz(input));

describe('normalizeQuiz', () => {
  it('trims text, collapses option whitespace and turns blanks into null', () => {
    const normalized = normalizeQuiz(
      quiz({
        title: '  Basics  ',
        description: '   ',
        questions: [
          question({
            prompt: '  Who?  ',
            explanation: '',
            options: [
              { text: '  Noah   the   builder ', correct: true },
              { text: 'Moses', correct: false },
            ],
          }),
        ],
      }),
    );
    expect(normalized.title).toBe('Basics');
    expect(normalized.description).toBeNull();
    expect(normalized.questions[0]).toMatchObject({
      prompt: 'Who?',
      explanation: null,
    });
    expect(normalized.questions[0].options[0].text).toBe('Noah the builder');
  });
});

describe('checkQuizContent', () => {
  it('accepts a well-formed quiz, and a quiz with no questions yet (a draft)', () => {
    expect(problems(quiz())).toEqual([]);
    expect(problems(quiz({ questions: [] }))).toEqual([]);
  });

  it('requires exactly one correct option per question', () => {
    const none = quiz({
      questions: [
        question({
          options: [
            { text: 'A', correct: false },
            { text: 'B', correct: false },
          ],
        }),
      ],
    });
    const two = quiz({
      questions: [
        question({
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: true },
          ],
        }),
      ],
    });
    expect(problems(none)).toEqual([
      expect.stringContaining('exactly one option'),
    ]);
    expect(problems(two)).toEqual([expect.stringContaining('found 2')]);
  });

  it('limits the number of options and rejects duplicates and empty texts', () => {
    const one = question({ options: [{ text: 'Only', correct: true }] });
    const seven = question({
      options: Array.from({ length: 7 }, (_, i) => ({
        text: `O${i}`,
        correct: i === 0,
      })),
    });
    const same = question({
      options: [
        { text: 'Noah', correct: true },
        { text: ' noah ', correct: false },
      ],
    });
    const blank = question({
      options: [
        { text: 'Noah', correct: true },
        { text: '   ', correct: false },
      ],
    });
    expect(problems(quiz({ questions: [one] }))).toEqual([
      expect.stringContaining('between 2 and 6'),
    ]);
    expect(problems(quiz({ questions: [seven] }))).toEqual([
      expect.stringContaining('between 2 and 6'),
    ]);
    expect(problems(quiz({ questions: [same] }))).toEqual([
      expect.stringContaining('same text'),
    ]);
    expect(problems(quiz({ questions: [blank] }))).toEqual([
      expect.stringContaining('must not be empty'),
    ]);
  });

  it('applies the length limits and reports every problem at once, naming the question', () => {
    const bad = quiz({
      title: '   ',
      questions: [
        question({ prompt: ' ' }),
        question({ prompt: 'x'.repeat(QUIZ_LIMITS.promptMax + 1) }),
        question({ explanation: 'x'.repeat(QUIZ_LIMITS.explanationMax + 1) }),
      ],
    });
    const found = problems(bad);
    expect(found).toHaveLength(4);
    expect(found.join('|')).toContain('Question 1');
    expect(found.join('|')).toContain('Question 3');
    expect(
      problems(
        quiz({ questions: Array.from({ length: 51 }, () => question()) }),
      ),
    ).toEqual([expect.stringContaining('at most 50 questions')]);
  });
});

describe('publishProblems', () => {
  it('needs at least one question', () => {
    expect(publishProblems(0)).toHaveLength(1);
    expect(publishProblems(1)).toEqual([]);
  });
});

// ---- learner side -------------------------------------------------------------------------------------------

const stored = (): QuizWithQuestions => ({
  id: 'q1',
  title: 'Basics',
  description: null,
  status: 'PUBLISHED',
  version: 3,
  createdBy: 'admin',
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
  questions: [
    {
      id: 'a',
      position: 1,
      type: 'SINGLE_CHOICE',
      prompt: 'One?',
      explanation: 'Because one.',
      correctOptionId: 'a2',
      options: [
        { id: 'a1', position: 1, text: 'No' },
        { id: 'a2', position: 2, text: 'Yes' },
      ],
    },
    {
      id: 'b',
      position: 2,
      type: 'SINGLE_CHOICE',
      prompt: 'Two?',
      explanation: null,
      correctOptionId: 'b1',
      options: [
        { id: 'b1', position: 1, text: 'Yes' },
        { id: 'b2', position: 2, text: 'No' },
      ],
    },
  ],
});

describe('toPublicQuiz', () => {
  it('has no way to carry the answer, the explanation, or any internal field', () => {
    const view = toPublicQuiz(stored());
    const text = JSON.stringify(view);
    expect(text).not.toMatch(
      /correct|explanation|Because one|status|version|createdBy|position/i,
    );
    expect(view.questions[0].options).toEqual([
      { id: 'a1', text: 'No' },
      { id: 'a2', text: 'Yes' },
    ]);
    expect(
      Object.keys(view.questions[0]).sort((x, y) => x.localeCompare(y)),
    ).toEqual(['id', 'options', 'prompt', 'type']);
  });
});

describe('checkAnswers and scoreSubmission', () => {
  const { questions } = stored();

  it('scores one point per correct answer, in the quiz order, and reveals the answers in the result', () => {
    const result = scoreSubmission('q1', questions, [
      { questionId: 'b', optionId: 'b2' },
      { questionId: 'a', optionId: 'a2' },
    ]);
    expect(result.score).toBe(1);
    expect(result.total).toBe(2);
    expect(result.results.map((r) => r.questionId)).toEqual(['a', 'b']);
    expect(result.results[0]).toEqual({
      questionId: 'a',
      answeredOptionId: 'a2',
      correct: true,
      correctOptionId: 'a2',
      explanation: 'Because one.',
    });
    expect(result.results[1]).toMatchObject({
      correct: false,
      correctOptionId: 'b1',
    });
  });

  it('counts unanswered questions as wrong, and all-right and all-wrong submissions', () => {
    expect(scoreSubmission('q1', questions, []).score).toBe(0);
    expect(
      scoreSubmission('q1', questions, []).results[0].answeredOptionId,
    ).toBeNull();
    expect(
      scoreSubmission('q1', questions, [
        { questionId: 'a', optionId: 'a2' },
        { questionId: 'b', optionId: 'b1' },
      ]).score,
    ).toBe(2);
  });

  it('refuses answers for unknown questions, options of another question, and repeats', () => {
    expect(
      checkAnswers(questions, [{ questionId: 'zzz', optionId: 'a1' }]),
    ).toHaveLength(1);
    expect(
      checkAnswers(questions, [{ questionId: 'a', optionId: 'b1' }]),
    ).toHaveLength(1);
    expect(
      checkAnswers(questions, [
        { questionId: 'a', optionId: 'a1' },
        { questionId: 'a', optionId: 'a2' },
      ]),
    ).toEqual(['A question was answered more than once']);
    expect(
      checkAnswers(questions, [{ questionId: 'a', optionId: 'a1' }]),
    ).toEqual([]);
    expect(checkAnswers(questions, [])).toEqual([]);
  });
});
