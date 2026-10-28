'use client';

import React from 'react';
import { type AssessmentDetail, type EditorState, LEVELS, LEVEL_LABEL, LIMITS } from '../../lib/assessments';
import Icon from '../quizzes/icons';
import type { AssessmentEditor } from './useAssessmentEditor';

/**
 * The "Scoring" tab: the scoring settings the assessment already has, laid out in plain language. It changes NO rule and NO stored value: the same four settings (is scoring configured, the tie-break,
 * whether every question must be answered, and the optional result message for each level) are edited and saved exactly as before, and the model is still provisional. Its wording only explains what the
 * backend already does: each answer gives points to each level, the level with the highest total is recommended, ties are resolved by the chosen tie-break, and there are no thresholds, percentages or
 * pass marks. Nothing here calculates or simulates a result (that belongs to a later batch).
 */
const CARD = 'rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3';
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-amber-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 disabled:bg-slate-50 disabled:opacity-60';
const FIELD_ERROR = 'border-rose-400 focus:border-rose-500 focus:ring-rose-300';
const LABEL = 'block text-sm font-semibold text-slate-900';

const Heading = ({ number, title, id }: { number: number; title: string; id: string }) => (
  <h3 id={id} className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
    <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
      {number}
    </span>
    {title}
  </h3>
);

const Message = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <p id={id} className="flex items-start gap-1 text-xs font-medium text-rose-800">
    <Icon name="alert" className="mt-px h-3.5 w-3.5" />
    <span>{children}</span>
  </p>
);

export default function AssessmentScoringTab({ editor, detail, readOnly }: { editor: AssessmentEditor; detail: AssessmentDetail | null; readOnly: boolean }) {
  const { state, attempted, patchScoring } = editor;
  const s = state.scoring;
  const disabled = readOnly || editor.saving;

  const explainTie =
    s.tieBreak === 'LOWER_LEVEL'
      ? 'If two or more levels have the same highest total, the LOWEST of them is recommended (for example Beginner over Intermediate).'
      : s.tieBreak === 'HIGHER_LEVEL'
        ? 'If two or more levels have the same highest total, the HIGHEST of them is recommended (for example Advanced over Intermediate).'
        : 'Choose which level is recommended when levels tie for the highest total (all zeros count as a tie).';

  return (
    <div id="as-scoring" tabIndex={-1} className="space-y-5 focus:outline-hidden">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Scoring</h2>
        <p className="text-sm text-slate-700">
          Each answer gives points to each of the three levels. The level with the <strong>highest total</strong> over the learner&rsquo;s answers is the one recommended; the learner can always choose a different level.
          There are no thresholds, percentages or pass marks.
        </p>
      </div>

      <p role="note" className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
        <Icon name="info" className="mt-0.5 h-4 w-4" />
        <span>
          This scoring model is <strong>provisional</strong>: it can be replaced later without changing the app&rsquo;s contract. The points and the settings below are yours to decide; nothing is pre-filled. The final scoring rules
          still need to be approved.
        </span>
      </p>

      {/* 1 */}
      <section className={CARD} aria-labelledby="as-sc-1">
        <Heading number={1} id="as-sc-1" title="Scoring configuration" />
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
          <input id="as-scoring-enabled" type="checkbox" className="h-4 w-4 accent-amber-600" disabled={disabled} checked={s.enabled} onChange={(event) => patchScoring({ enabled: event.target.checked })} />
          Scoring is configured
        </label>
        {!s.enabled ? (
          <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Without a scoring configuration this assessment <strong>cannot be published</strong>.{' '}
            {detail?.scoringConfig ? 'Saving will remove the configuration that is saved now; you will be asked to confirm.' : 'You can save it as a draft and configure scoring later.'}
          </p>
        ) : (
          <p className="text-xs text-slate-700">Scoring is configured. The tie-break, the required-questions setting and the optional result messages below are saved with the assessment.</p>
        )}
      </section>

      {s.enabled && (
        <>
          {/* 2 */}
          <section className={CARD} aria-labelledby="as-sc-2">
            <Heading number={2} id="as-sc-2" title="Tie-break rule" />
            <div className="space-y-1.5">
              <label htmlFor="as-tiebreak" className={LABEL}>
                When levels tie <span className="text-rose-700">*</span>
              </label>
              <select
                id="as-tiebreak"
                value={s.tieBreak}
                disabled={disabled}
                aria-invalid={(attempted && !s.tieBreak) || undefined}
                aria-describedby="as-tie-help"
                onChange={(event) => patchScoring({ tieBreak: event.target.value as EditorState['scoring']['tieBreak'] })}
                className={`${FIELD} sm:max-w-md ${attempted && !s.tieBreak ? FIELD_ERROR : ''}`}
              >
                <option value="">Choose…</option>
                <option value="LOWER_LEVEL">Recommend the lower level</option>
                <option value="HIGHER_LEVEL">Recommend the higher level</option>
              </select>
              <p id="as-tie-help" className="text-xs text-slate-700">
                {explainTie}
              </p>
              {attempted && !s.tieBreak && <Message id="as-tie-msg">Choose how ties are resolved.</Message>}
            </div>
          </section>

          {/* 3 */}
          <section className={CARD} aria-labelledby="as-sc-3">
            <Heading number={3} id="as-sc-3" title="Required-question behaviour" />
            <fieldset disabled={disabled} className="space-y-2">
              <legend className={LABEL}>
                Must learners answer every question? <span className="text-rose-700">*</span>
              </legend>
              <label className="flex items-start gap-2 text-sm text-slate-900">
                <input id="as-requireall-yes" type="radio" name="as-requireall" className="mt-0.5 h-4 w-4 accent-amber-600" checked={s.requireAll === 'yes'} onChange={() => patchScoring({ requireAll: 'yes' })} />
                <span>Every question must be answered</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-900">
                <input id="as-requireall-no" type="radio" name="as-requireall" className="mt-0.5 h-4 w-4 accent-amber-600" checked={s.requireAll === 'no'} onChange={() => patchScoring({ requireAll: 'no' })} />
                <span>Learners may skip questions (at least one must be answered)</span>
              </label>
              {attempted && !s.requireAll && <Message id="as-req-msg">Choose whether every question must be answered.</Message>}
            </fieldset>
          </section>

          {/* 4 */}
          <section className={CARD} aria-labelledby="as-sc-4">
            <Heading number={4} id="as-sc-4" title="Learning-level result messages" />
            <p className="text-xs text-slate-700">Optional plain text shown with the result for that level. Nothing is generated; leave a message empty for none.</p>
            <div className="grid gap-4 md:grid-cols-3">
              {LEVELS.map((level) => {
                const text = s.messages[level];
                const long = text.trim().length > LIMITS.resultMessageMax;
                return (
                  <div key={level} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor={`as-msg-${level}`} className="text-sm font-semibold text-slate-900">
                        {LEVEL_LABEL[level]}
                      </label>
                      <span className={`text-xs tabular-nums ${long ? 'font-semibold text-rose-800' : 'text-slate-600'}`} aria-hidden="true">
                        {text.trim().length} / {LIMITS.resultMessageMax}
                      </span>
                    </div>
                    <textarea
                      id={`as-msg-${level}`}
                      rows={4}
                      maxLength={LIMITS.resultMessageMax * 2}
                      value={text}
                      disabled={disabled}
                      aria-invalid={long || undefined}
                      aria-describedby={long ? `as-msg-${level}-msg` : undefined}
                      onChange={(event) => patchScoring({ messages: { ...s.messages, [level]: event.target.value } })}
                      className={`${FIELD} ${long ? FIELD_ERROR : ''}`}
                    />
                    {long && <Message id={`as-msg-${level}-msg`}>At most {LIMITS.resultMessageMax} characters.</Message>}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
