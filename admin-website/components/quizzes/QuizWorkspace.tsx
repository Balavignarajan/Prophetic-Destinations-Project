'use client';

import React, { useId, useRef, useState } from 'react';
import { LEVELS, LEVEL_NAMES, questionIssues, visibleAt } from '../../lib/quiz-draft';
import { describeReference, useScriptureInfo } from '../../lib/scripture-info';
import type { AdminQuiz, QuizQuestion } from '../../lib/types';
import { levelsText } from '../QuestionLevelsField';
import { StatusBadge } from '../ui';
import Icon from './icons';

/**
 * The selected quiz in Quiz Management (right column): its header, then three sections as tabs.
 *   Overview    what the quiz is: questions, version, status, last update, and how many questions each learning level is given.
 *   Questions   every question with its levels, answers and completeness; each can be opened to read it in full, and edited in the Quiz Builder.
 *   Publishing  the existing publish / unpublish / delete controls and their rules, unchanged.
 * Everything shown is the quiz as the server holds it. Nothing here edits: Edit opens the Quiz Builder, and the publishing buttons ask the page, which uses the existing confirmations and API.
 */
type Tab = 'overview' | 'questions' | 'publishing';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'questions', label: 'Questions' },
  { id: 'publishing', label: 'Publishing' },
];

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
const dateTimeOf = (iso: string) => new Date(iso).toLocaleString();
const BUTTON = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50';
const SECONDARY = `${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-slate-900">{value}</dd>
      {note && <p className="mt-0.5 text-xs text-slate-600">{note}</p>}
    </div>
  );
}

function Overview({ quiz }: { quiz: AdminQuiz }) {
  const total = quiz.questions.length;
  const published = quiz.status === 'PUBLISHED';
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Questions" value={total} />
        <Tile label="Status" value={published ? 'Published' : 'Draft'} />
        <Tile label="Version" value={<span className="font-mono">v{quiz.version}</span>} />
        <Tile label="Updated" value={<span className="text-base">{dateOf(quiz.updatedAt)}</span>} />
      </dl>

      <section aria-labelledby="quiz-levels" className="space-y-3">
        <div>
          <h3 id="quiz-levels" className="text-base font-semibold text-slate-900">
            Questions by learning level
          </h3>
          <p className="text-xs text-slate-700">How many questions learners are given at each level. A question without a setting is given at every level. This is separate from the quiz block&rsquo;s level setting in each lesson.</p>
        </div>
        <ul className="space-y-2.5">
          {LEVELS.map((level) => {
            const count = quiz.questions.filter((q) => visibleAt(q.levels, level)).length;
            return (
              <li key={level} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-900">{LEVEL_NAMES[level]}</span>
                  <span className={count === 0 ? 'font-semibold text-amber-900' : 'text-slate-700'}>
                    {count} of {total} {total === 1 ? 'question' : 'questions'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: total === 0 ? '0%' : `${(count / total) * 100}%` }} />
                </div>
                {count === 0 && total > 0 && <p className="text-xs text-amber-900">No question is given at this level. A level with none cannot be published while this quiz block is shown there.</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="quiz-version" className="space-y-1.5">
        <h3 id="quiz-version" className="text-base font-semibold text-slate-900">
          Version and publication
        </h3>
        <ul className="space-y-1 text-sm text-slate-800">
          <li>
            {published ? 'Published' : 'Draft'} version <span className="font-mono">{quiz.version}</span>, last saved {dateTimeOf(quiz.updatedAt)}.
          </li>
          {published && quiz.publishedAt && <li>Published on {dateTimeOf(quiz.publishedAt)}.</li>}
          <li>Created {dateTimeOf(quiz.createdAt)}.</li>
        </ul>
        <p className="text-xs text-slate-600">
          {published ? 'A published quiz is read-only. Unpublish it to edit it again, or duplicate it as a new draft.' : 'A draft can be edited. Saving changes never publishes it; publishing is in the Publishing tab.'}
        </p>
      </section>
    </div>
  );
}

function QuestionRow({ question, index, canEdit, bookNames, onEdit }: { question: QuizQuestion; index: number; canEdit: boolean; bookNames: Record<string, string>; onEdit: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const issues = questionIssues(question);
  const first = issues[0];
  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((value) => !value)} className="flex w-full items-start gap-3 rounded-xl p-3.5 text-left hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-xs font-bold text-slate-700">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-sm font-medium text-slate-900 wrap-break-word">{question.prompt}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
            <span>Shown at: {levelsText(question.levels)}</span>
            <span>
              {question.options.length} {question.options.length === 1 ? 'answer' : 'answers'}
            </span>
            <span className={`inline-flex items-center gap-1 font-medium ${first ? 'text-rose-800' : 'text-emerald-800'}`}>
              <Icon name={first ? 'alert' : 'check'} className="h-3 w-3" />
              {first ? first.short : 'Complete'}
            </span>
          </span>
        </span>
        <Icon name={open ? 'up' : 'down'} className="mt-1 text-slate-500" />
      </button>
      {open && (
        <div id={panel} className="space-y-3 border-t border-slate-100 px-3.5 pb-3.5 pt-3">
          <ul className="space-y-1.5">
            {question.options.map((option) => (
              <li key={option.id} className={`flex items-start justify-between gap-3 rounded-lg border p-2.5 text-sm ${option.correct ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-slate-200 bg-white text-slate-800'}`}>
                <span className="min-w-0">
                  {option.text}
                  {option.feedback && <span className="mt-0.5 block text-xs font-normal italic text-slate-600">Feedback: {option.feedback}</span>}
                </span>
                {option.correct && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">Correct answer</span>}
              </li>
            ))}
          </ul>
          {question.explanation && (
            <p className="text-sm text-slate-700">
              <strong className="font-semibold text-slate-900">Explanation:</strong> {question.explanation}
            </p>
          )}
          {question.scripture && question.scripture.length > 0 && (
            <p className="text-sm text-slate-700">
              <strong className="font-semibold text-slate-900">Scripture:</strong> {question.scripture.map((s) => describeReference(s.reference, bookNames)).join('; ')}
            </p>
          )}
          {canEdit && (
            <button type="button" className={SECONDARY} onClick={() => onEdit(question.id)}>
              <Icon name="edit" />
              Edit this question
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Questions({ quiz, canEdit, onEdit }: { quiz: AdminQuiz; canEdit: boolean; onEdit: (id: string) => void }) {
  const scripture = useScriptureInfo();
  if (quiz.questions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <p className="text-sm font-medium text-slate-900">No questions yet</p>
        <p className="mt-1 text-xs text-slate-700">{canEdit ? 'Open the Quiz Builder to add the first question.' : 'This quiz has no questions.'}</p>
        {canEdit && (
          <button type="button" className={`${SECONDARY} mt-3`} onClick={() => onEdit('')}>
            <Icon name="edit" />
            Open Quiz Builder
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-700">
        {quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'}, in the order learners get them. Open a question to read its answers, explanation and Scripture.
      </p>
      <ol className="space-y-2">
        {quiz.questions.map((question, index) => (
          <QuestionRow key={question.id} question={question} index={index} canEdit={canEdit} bookNames={scripture.bookNames} onEdit={onEdit} />
        ))}
      </ol>
    </div>
  );
}

function Publishing({
  quiz,
  canWrite,
  canPublish,
  error,
  busy,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  quiz: AdminQuiz;
  canWrite: boolean;
  canPublish: boolean;
  error: string | null;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}) {
  const published = quiz.status === 'PUBLISHED';
  const empty = quiz.questions.length === 0;
  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-4 ${published ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={quiz.status} />
          <span className="font-mono text-sm text-slate-700">v{quiz.version}</span>
          {published && quiz.publishedAt && <span className="text-sm text-slate-700">Published {dateTimeOf(quiz.publishedAt)}</span>}
        </div>
        <p className="mt-2 text-sm text-slate-800">
          {published
            ? 'This quiz is published. It is available to learners, and it cannot be edited or deleted while it is published.'
            : 'This quiz is a draft. Learners do not get it until it is published. Publishing needs at least one valid question.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      )}
      {!published && empty && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
          <Icon name="alert" />A quiz needs at least one question to be published.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canPublish ? (
          published ? (
            <button type="button" onClick={onUnpublish} disabled={busy} className={`${BUTTON} bg-rose-600 text-white hover:bg-rose-700`}>
              Unpublish
            </button>
          ) : (
            <button type="button" onClick={onPublish} disabled={busy} className={`${BUTTON} bg-emerald-600 text-white hover:bg-emerald-700`}>
              Publish Quiz
            </button>
          )
        ) : (
          <p className="text-sm text-slate-700">Only an Administrator can publish or unpublish a quiz.</p>
        )}
      </div>

      {canWrite && !published && (
        <section aria-labelledby="quiz-delete" className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <h3 id="quiz-delete" className="text-sm font-semibold text-slate-900">
            Delete draft
          </h3>
          <p className="text-xs text-slate-700">A draft can be deleted. This cannot be undone. A quiz that a lesson uses cannot be deleted: remove the quiz block from that lesson first.</p>
          <button type="button" onClick={onDelete} disabled={busy} className={`${BUTTON} border border-rose-300 bg-white text-rose-800 hover:bg-rose-50`}>
            <Icon name="trash" />
            Delete draft quiz
          </button>
        </section>
      )}
    </div>
  );
}

export default function QuizWorkspace({
  quiz,
  canWrite,
  canPublish,
  publishError,
  busy,
  onEdit,
  onDuplicate,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  quiz: AdminQuiz;
  canWrite: boolean;
  canPublish: boolean;
  publishError: string | null;
  busy: boolean;
  /** Open the Quiz Builder (a draft only); `questionId` opens that question first ('' = none in particular). */
  onEdit: (questionId?: string) => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const published = quiz.status === 'PUBLISHED';
  const canEdit = canWrite && !published;
  const onKeys = (event: React.KeyboardEvent, index: number) => {
    const count = TABS.length;
    const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(TABS[next].id);
    refs.current[next]?.focus();
  };
  const total = quiz.questions.length;

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-serif text-xl font-bold text-slate-900 wrap-break-word">{quiz.title}</h2>
            <StatusBadge status={quiz.status} />
            <span className="font-mono text-xs text-slate-600">v{quiz.version}</span>
          </div>
          {quiz.description && <p className="mt-1 text-sm text-slate-700 wrap-break-word">{quiz.description}</p>}
          <p className="mt-1.5 text-xs text-slate-600">
            {total} {total === 1 ? 'question' : 'questions'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canEdit && (
            <button type="button" onClick={() => onEdit()} className={`${BUTTON} bg-slate-900 text-white hover:bg-slate-800`}>
              <Icon name="edit" />
              Edit Draft
            </button>
          )}
          {canWrite && (
            <button type="button" onClick={onDuplicate} disabled={busy} title="Duplicate this quiz as a new draft" className={SECONDARY}>
              <Icon name="copy" />
              Duplicate
            </button>
          )}
        </div>
      </header>

      <div role="tablist" aria-label="Quiz sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4">
        {TABS.map((t, index) => (
          <button
            key={t.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`quiz-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="quiz-tabpanel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(event) => onKeys(event, index)}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium focus:outline-hidden focus-visible:rounded-t-lg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${tab === t.id ? 'border-amber-600 text-slate-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
          >
            {t.label}
            {t.id === 'questions' && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{total}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="quiz-tabpanel" aria-labelledby={`quiz-tab-${tab}`} tabIndex={0} className="p-5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500">
        {tab === 'overview' && <Overview quiz={quiz} />}
        {tab === 'questions' && <Questions quiz={quiz} canEdit={canEdit} onEdit={(id) => onEdit(id || undefined)} />}
        {tab === 'publishing' && <Publishing quiz={quiz} canWrite={canWrite} canPublish={canPublish} error={publishError} busy={busy} onPublish={onPublish} onUnpublish={onUnpublish} onDelete={onDelete} />}
      </div>
    </article>
  );
}
