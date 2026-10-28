'use client';

import React, { useState } from 'react';
import { LEVELS, LEVEL_LABEL, type Level } from '../../lib/assessments';
import { type PreviewResult, TIE_BREAK_WORDS, explainResult, joinLevels } from '../../lib/assessment-preview-scoring';
import { Btn, Rule, Txt, cx } from '../lesson-preview/ui';

/**
 * The two ways the Assessment Preview shows a finished attempt.
 *
 * LearnerResult is the app's own result screen (mobile-app/src/features/assessment/result-view.tsx), drawn inside the phone with nothing added: "Your suggested level", the message written for that level
 * (or the app's default sentence when none was written), a note when the answers pointed equally to several levels, "Choose your level" with the suggestion marked, how many questions were answered with
 * the points by level (the app shows the backend's scores to the learner), and "Use ... level" / "Decide later". Choosing here saves nothing: the buttons only say so.
 *
 * ScoringBreakdown is the ADMIN's own addition, drawn outside the phone and collapsed until asked for: the points each chosen answer added to each level, the totals, which level is recommended and why
 * (including the tie-break when levels tied). Every number is the preview attempt's own, from `scorePreview`; the learner's screen is the same with or without it.
 */

/** One row of a radio list in the app's option style: a real radio (so the arrow keys work), the selected state shown by border, filled dot and bold text. */
function ChoiceRow({ group, title, description, selected, onSelect }: { group: string; title: string; description?: string; selected: boolean; onSelect: () => void }) {
  return (
    <label className={cx('lp-option', selected && 'lp-option-selected lp-option-emphasised')} style={{ cursor: 'pointer' }}>
      <input type="radio" name={group} className="sr-only" checked={selected} onChange={onSelect} aria-label={description ? `${title}. ${description}` : title} />
      <span className={cx('lp-radio', selected && 'lp-radio-on')} aria-hidden="true">
        {selected && <span className="lp-radio-dot" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5" aria-hidden="true">
        <Txt v="body" w={selected ? 7 : 5} as="span">
          {title}
        </Txt>
        {description && (
          <Txt v="body-small" tone="secondary" as="span">
            {description}
          </Txt>
        )}
      </span>
    </label>
  );
}

export function LearnerResult({ result }: { result: PreviewResult }) {
  const [chosen, setChosen] = useState<Level>(result.recommendedLevel);
  const [note, setNote] = useState<string | null>(null);
  const tied = result.tiedLevels.length > 1;
  const differs = chosen !== result.recommendedLevel;
  const scoreText = LEVELS.map((level) => `${LEVEL_LABEL[level]} ${result.scores[level]}`).join('  ·  ');

  return (
    <div className="flex flex-col gap-6">
      <div className="lp-card flex flex-col gap-4" style={{ background: 'var(--lp-elevated)', borderColor: 'var(--lp-gold)', boxShadow: 'var(--lp-shadow-card)' }}>
        <div className="flex flex-col items-center gap-2 text-center" role="group" aria-label={`Your suggested level is ${LEVEL_LABEL[result.recommendedLevel]}`}>
          <Txt v="body-small" tone="secondary" w={6}>
            Your suggested level
          </Txt>
          <Txt v="title" tone="highlight" as="h3" className="text-center">
            {LEVEL_LABEL[result.recommendedLevel]}
          </Txt>
          <Rule title className="mx-auto" />
        </div>
        {result.message ? (
          <Txt v="body" className="text-center" pre>
            {result.message}
          </Txt>
        ) : (
          <Txt v="body" tone="secondary" className="text-center">
            Based on your answers, this is a good place to start. You can change your level at any time.
          </Txt>
        )}
      </div>

      {tied && (
        <Txt v="body-small" tone="secondary">
          Your answers pointed equally to {joinLevels(result.tiedLevels)}. We suggest {LEVEL_LABEL[result.recommendedLevel]}, but any of them could suit you.
        </Txt>
      )}

      <div className="flex flex-col gap-3">
        <Txt v="heading" as="h3">
          Choose your level
        </Txt>
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="Learning level">
          {LEVELS.map((level) => (
            <ChoiceRow
              key={level}
              group="as-preview-level"
              title={LEVEL_LABEL[level]}
              description={level === result.recommendedLevel ? 'Suggested by your answers' : undefined}
              selected={chosen === level}
              onSelect={() => {
                setChosen(level);
                setNote(null);
              }}
            />
          ))}
        </div>
        {differs && (
          <Txt v="body-small" tone="muted">
            You chose a different level from the suggestion. That is completely fine.
          </Txt>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Txt v="body-small" tone="muted">
          You answered {result.answered} of {result.total} questions. Points by level:
        </Txt>
        <Txt v="body-small" tone="secondary" aria-label={LEVELS.map((level) => `${LEVEL_LABEL[level]}, ${result.scores[level]} points`).join('. ')}>
          {scoreText}
        </Txt>
      </div>

      <div className="flex flex-col gap-3">
        <Btn kind="primary" size="lg" onClick={() => setNote(`Preview only. In the app this saves ${LEVEL_LABEL[chosen]} as the learner's level and leaves the assessment. Nothing was saved here.`)}>
          Use {LEVEL_LABEL[chosen]} level
        </Btn>
        <Btn kind="secondary" size="lg" onClick={() => setNote('Preview only. In the app this leaves the assessment and keeps the learner level as it is. Nothing was saved here.')}>
          Decide later
        </Btn>
        {note && (
          <Txt v="body-small" tone="muted" role="status">
            {note}
          </Txt>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------------------------ the Admin's breakdown

const TH = 'px-2 py-1.5 text-left text-xs font-semibold text-slate-700';
const TD = 'px-2 py-1.5 align-top text-xs text-slate-900';

export function ScoringBreakdown({ result }: { result: PreviewResult }) {
  const [open, setOpen] = useState(false);
  const tied = result.tiedLevels.length > 1;
  const message = result.message;

  return (
    <section aria-labelledby="as-pv-bd-h" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="as-pv-bd-h" className="text-sm font-semibold text-slate-900">
          Scoring breakdown
        </h3>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">Admin simulation</span>
      </div>
      <p className="text-xs text-slate-700">For the author only: learners never see this. It shows how the points you entered turn this preview attempt into the suggestion, with the same rule the server uses. Nothing was sent.</p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="as-pv-bd-body"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        {open ? 'Hide scoring breakdown' : 'View scoring breakdown'}
      </button>

      <div id="as-pv-bd-body" hidden={!open} className="space-y-4">
        <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900">{explainResult(result)}</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[18rem] text-left">
            <caption className="pb-1 text-left text-xs font-semibold text-slate-700">Total points by level</caption>
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" className={TH}>
                  Level
                </th>
                <th scope="col" className={TH}>
                  Points
                </th>
                <th scope="col" className={TH}>
                  Outcome
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {LEVELS.map((level) => {
                const recommended = level === result.recommendedLevel;
                const isTied = result.tiedLevels.includes(level);
                return (
                  <tr key={level} className={recommended ? 'bg-amber-50' : undefined}>
                    <th scope="row" className={`${TD} ${recommended ? 'font-bold' : 'font-medium'}`}>
                      {LEVEL_LABEL[level]}
                    </th>
                    <td className={`${TD} tabular-nums ${recommended ? 'font-bold' : ''}`}>{result.scores[level]}</td>
                    <td className={TD}>
                      {recommended ? <span className="font-semibold text-amber-950">Recommended{tied ? ' by the tie-break' : ''}</span> : isTied ? <span className="text-slate-800">Tied, not chosen</span> : <span className="text-slate-700">&mdash;</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left">
            <caption className="pb-1 text-left text-xs font-semibold text-slate-700">Points added by each answer</caption>
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" className={TH}>
                  Question and chosen answer
                </th>
                {LEVELS.map((level) => (
                  <th key={level} scope="col" className={`${TH} text-right`}>
                    {LEVEL_LABEL[level]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((row) => (
                <tr key={row.questionNumber}>
                  <th scope="row" className={`${TD} font-normal`}>
                    <span className="block font-semibold wrap-break-word">
                      {row.questionNumber}. {row.prompt}
                    </span>
                    {row.answered ? <span className="block text-slate-700 wrap-break-word">{row.answerText}</span> : <span className="block italic text-slate-700">Skipped: adds no points</span>}
                  </th>
                  {LEVELS.map((level) => (
                    <td key={level} className={`${TD} text-right tabular-nums`}>
                      {row.points[level]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-300">
                <th scope="row" className={`${TD} font-bold`}>
                  Total ({result.answered} of {result.total} answered)
                </th>
                {LEVELS.map((level) => (
                  <td key={level} className={`${TD} text-right font-bold tabular-nums`}>
                    {result.scores[level]}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        <dl className="space-y-1 text-xs text-slate-800">
          <div>
            <dt className="inline font-semibold">Tie-break: </dt>
            <dd className="inline">{TIE_BREAK_WORDS[result.tieBreak]}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Message for {LEVEL_LABEL[result.recommendedLevel]}: </dt>
            <dd className="inline">{message ? <span className="whitespace-pre-wrap">&ldquo;{message}&rdquo;</span> : 'none written, so the app shows its own default sentence'}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
