'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { readFrozenQuiz, readQuizRef } from '../lib/quiz-block';
import type { AdminQuiz } from '../lib/types';

/**
 * A quiz block as the author or previewer sees it. In the lesson editor it shows the chosen quiz (title, status, questions) and
 * warns when the quiz was edited after it was added. In the learner preview (content carries the quiz itself) it lists the
 * questions with their answer choices, marking the correct one and showing the explanation, exactly what a published lesson freezes.
 */
export default function QuizBlockView({ content, level }: { content: unknown; /** The level the learner preview is for (only given in the preview). */ level?: string }) {
  const ref = readQuizRef(content);
  const frozen = readFrozenQuiz(content);
  const [quiz, setQuiz] = useState<AdminQuiz | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref || frozen) return;
    let cancelled = false;
    setFailed(false);
    api
      .request<AdminQuiz>(`/admin/quizzes/${ref.quizId}`)
      .then((q) => !cancelled && setQuiz(q))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ref?.quizId, Boolean(frozen)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ref) return <span className="text-slate-600 italic font-sans text-xs">(No quiz chosen yet)</span>;

  if (frozen) {
    return (
      <section className="font-sans space-y-3">
        <p className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-900">
          Author preview{level ? ` for the ${level.charAt(0)}${level.slice(1).toLowerCase()} level (${frozen.questions.length} ${frozen.questions.length === 1 ? 'question' : 'questions'}: only the questions enabled for this level)` : ''}: correct answers and explanations are author-only and are shown here. Learners choose answers first and see them only after checking. This is the quiz
          as it would be published with the lesson now.
        </p>
        <h4 className="text-base font-semibold text-slate-900 break-words">{frozen.title}</h4>
        {frozen.description && <p className="text-sm text-slate-700 break-words">{frozen.description}</p>}
        <ol className="space-y-3">
          {frozen.questions.map((q, index) => (
            <li key={q.id || index} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-900 break-words">
                {index + 1}. {q.prompt}
              </p>
              <ul className="mt-2 space-y-1">
                {q.options.map((o) => (
                  <li key={o.id} className="text-sm text-slate-800 break-words">
                    <span aria-hidden="true">{o.id === q.correctOptionId ? '● ' : '○ '}</span>
                    {o.text}
                    {o.id === q.correctOptionId && <span className="ml-2 text-xs font-semibold text-emerald-800">(correct answer)</span>}
                  </li>
                ))}
              </ul>
              {q.explanation && <p className="mt-2 text-xs text-slate-700 break-words">Explanation: {q.explanation}</p>}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (failed) return <span className="text-slate-600 italic font-sans text-xs">(This quiz could not be loaded. It may have been deleted: choose another quiz.)</span>;
  if (!quiz) return <span className="text-slate-600 italic font-sans text-xs">Loading quiz…</span>;
  const edited = ref.quizVersion !== null && ref.quizVersion !== quiz.version;
  const perLevel = (['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const).map((lv) => ({ lv, n: quiz.questions.filter((q) => !q.levels || q.levels.includes(lv)).length }));
  return (
    <section className="font-sans">
      <h4 className="text-base font-semibold text-slate-900 break-words">{quiz.title}</h4>
      <p className="text-xs text-slate-700 mt-0.5">
        {quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'} · quiz is {quiz.status === 'PUBLISHED' ? 'published' : 'a draft'}
      </p>
      <p className="text-xs text-slate-700 mt-0.5">
        Questions given at each level: {perLevel.map(({ lv, n }) => `${lv.charAt(0)}${lv.slice(1).toLowerCase()} ${n}`).join(', ')}. A level with none cannot be published while this block is shown there.
      </p>
      {quiz.questions.length === 0 && <p className="mt-1 text-xs font-medium text-amber-800">This quiz has no questions yet. Add some before the lesson can be published.</p>}
      {edited && (
        <p className="mt-1 text-xs font-medium text-amber-800">
          This quiz was edited after it was added. Choose &ldquo;Change quiz&rdquo; and save to use its latest version; the lesson will then need approval again.
        </p>
      )}
    </section>
  );
}
