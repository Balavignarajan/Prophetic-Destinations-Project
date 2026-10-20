'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  type AssessmentDetail,
  type EditorOption,
  type EditorQuestion,
  type EditorState,
  LEVELS,
  LEVEL_LABEL,
  LIMITS,
  type Problem,
  assessmentsApi,
  blankOption,
  blankQuestion,
  checkEditor,
  describeError,
  editorSignature,
  emptyEditor,
  fieldIdForPath,
  isConflict,
  problemsFromError,
  toEditor,
  toPayload,
} from '../../lib/assessments';
import { ConfirmDialog } from '../ui';

const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5';
const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60 disabled:bg-slate-50';
const SMALL_BTN = 'px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

interface Props {
  /** null = a new assessment; otherwise the saved one (the editor saves with its `version`). */
  detail: AssessmentDetail | null;
  /** Only ADMIN and EDITOR may save (the backend enforces it); others see everything but cannot change it. */
  readOnly: boolean;
  /** Called only after the API confirmed the save. */
  onSaved: (detail: AssessmentDetail) => void;
  /** Reloads the saved assessment from the server (the editor then replaces its content with it). */
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Shows a problem list from outside (validation panel) by focusing the field a path points at: handled by the page via `fieldIdForPath`. */
  onCancelNew?: () => void;
}

/**
 * Create and edit the WORKING copy of an assessment. A save REPLACES the whole content (`POST` / `PUT /admin/assessments`), sends the `version` it was
 * loaded with, always sends `scoringConfig` explicitly (an object, or null only when the editor switched scoring off on purpose) and keeps the ids of existing
 * questions and answers. Question and answer order is the order of the lists here, saved by the same call. Nothing is reported as saved until the API says so,
 * and everything typed stays in place when a save fails.
 */
export default function AssessmentEditor({ detail, readOnly, onSaved, onReload, onDirtyChange, onCancelNew }: Props) {
  const initial = useMemo(() => (detail ? toEditor(detail) : emptyEditor()), [detail]);
  const [state, setState] = useState<EditorState>(initial);
  const [baseline, setBaseline] = useState(() => editorSignature(initial));
  const loadedVersion = useRef<number | null>(detail?.version ?? null);
  const [serverMoved, setServerMoved] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [confirm, setConfirm] = useState<null | { kind: 'question' | 'option' | 'clear-scoring'; qi?: number; oi?: number }>(null);

  const dirty = editorSignature(state) !== baseline;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // The saved assessment changed (after a reload, or someone else saved): replace the editor, unless there are unsaved edits to protect.
  useEffect(() => {
    const incomingVersion = detail?.version ?? null;
    if (incomingVersion === loadedVersion.current) return;
    if (!dirty) {
      setState(initial);
      setBaseline(editorSignature(initial));
      loadedVersion.current = incomingVersion;
      setServerMoved(false);
    } else {
      setServerMoved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.version]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Leaving through an in-app link (sidebar, breadcrumb) would silently drop the edits: ask first. (The browser's own reload/close is covered above.)
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.origin !== window.location.origin) return;
      if (link.pathname === window.location.pathname) return;
      if (!window.confirm('You have unsaved changes to this assessment. Leave this page and lose them?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  const disabled = readOnly || saving;
  const touched = () => {
    setSaved(null);
    setSaveError(null);
    setSaveConflict(false);
  };
  const patch = (change: Partial<EditorState>) => {
    touched();
    setState((s) => ({ ...s, ...change }));
  };
  const patchScoring = (change: Partial<EditorState['scoring']>) => patch({ scoring: { ...state.scoring, ...change } });
  const setQuestion = (qi: number, change: (q: EditorQuestion) => EditorQuestion) => patch({ questions: state.questions.map((q, i) => (i === qi ? change(q) : q)) });
  const setOption = (qi: number, oi: number, change: (o: EditorOption) => EditorOption) => setQuestion(qi, (q) => ({ ...q, options: q.options.map((o, i) => (i === oi ? change(o) : o)) }));

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= state.questions.length) return;
    const next = [...state.questions];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch({ questions: next });
    setAnnounce(`Question moved to position ${to + 1} of ${next.length}. Not saved yet.`);
  };
  const moveOption = (qi: number, from: number, to: number) => {
    const q = state.questions[qi];
    if (to < 0 || to >= q.options.length) return;
    setQuestion(qi, (x) => {
      const options = [...x.options];
      const [item] = options.splice(from, 1);
      options.splice(to, 0, item);
      return { ...x, options };
    });
    setAnnounce(`Answer moved to position ${to + 1} of ${q.options.length} in question ${qi + 1}. Not saved yet.`);
  };

  const fillZeros = () => {
    patch({ questions: state.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o, scores: { BEGINNER: o.scores.BEGINNER.trim() || '0', INTERMEDIATE: o.scores.INTERMEDIATE.trim() || '0', ADVANCED: o.scores.ADVANCED.trim() || '0' } })) })) });
    setAnnounce('Empty points were set to 0. Not saved yet.');
  };

  const focusField = (path?: string) => {
    const id = fieldIdForPath(path);
    const el = id ? document.getElementById(id) : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).focus({ preventScroll: true });
    }
  };

  const save = async (clearingConfirmed = false) => {
    if (saving || readOnly) return;
    setSaved(null);
    setSaveError(null);
    setSaveConflict(false);
    const clientProblems = checkEditor(state);
    setProblems(clientProblems);
    if (clientProblems.length > 0) {
      setSaveError('Fix the problems listed below before saving. Nothing was saved.');
      return;
    }
    // Switching scoring off removes the saved configuration: say so before it happens.
    if (detail?.scoringConfig && !state.scoring.enabled && !clearingConfirmed) {
      setConfirm({ kind: 'clear-scoring' });
      return;
    }
    setSaving(true);
    try {
      // The version this editor's CONTENT was loaded from, not the newest one the page knows: if someone else saved since, the server must refuse (409) rather
      // than accept these edits on top of changes they never saw.
      const payload = toPayload(state, detail ? (loadedVersion.current ?? detail.version) : undefined);
      const result = detail ? await assessmentsApi.update(detail.id, payload) : await assessmentsApi.create(payload);
      // The API confirmed: only now is the editor "clean".
      const fresh = toEditor(result);
      setState(fresh);
      setBaseline(editorSignature(fresh));
      loadedVersion.current = result.version;
      setProblems([]);
      setServerMoved(false);
      setSaved(`Saved. Working-copy version ${result.version}; status ${result.status.replace(/_/g, ' ').toLowerCase()}.`);
      onSaved(result);
    } catch (err: unknown) {
      if (isConflict(err)) {
        setSaveConflict(true);
        setSaveError(describeError(err, 'This assessment was changed by someone else.') + ' Nothing was saved and your edits are still here.');
      } else {
        setProblems(problemsFromError(err));
        setSaveError(describeError(err, 'The assessment could not be saved.') + ' Your edits are still here.');
      }
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    setState(initial);
    setBaseline(editorSignature(initial));
    setProblems([]);
    setSaveError(null);
    setSaved(null);
    if (!detail) onCancelNew?.();
  };

  const explainTie =
    state.scoring.tieBreak === 'LOWER_LEVEL'
      ? 'If two or more levels have the same highest total, the LOWEST of them is recommended (for example Beginner over Intermediate).'
      : state.scoring.tieBreak === 'HIGHER_LEVEL'
        ? 'If two or more levels have the same highest total, the HIGHEST of them is recommended (for example Advanced over Intermediate).'
        : 'Choose which level is recommended when levels tie for the highest total (all zeros count as a tie).';

  return (
    <div className="space-y-6">
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      {serverMoved && (
        <div role="alert" className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>A newer version of this assessment was saved elsewhere. Your unsaved edits are still here; saving them will be refused until you reload.</span>
          <button type="button" onClick={onReload} className={SMALL_BTN}>Reload latest (discards my edits)</button>
        </div>
      )}

      {/* ----------------------------------------------------------------------------------------------- basics */}
      <section aria-labelledby="as-basics" className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
        <h2 id="as-basics" className="font-serif text-lg font-bold text-slate-900">Details</h2>
        <div>
          <label htmlFor="as-title" className={LABEL}>Title *</label>
          <input id="as-title" value={state.title} disabled={disabled} maxLength={LIMITS.titleMax * 2} onChange={(e) => patch({ title: e.target.value })} className={FIELD} />
        </div>
        <div>
          <label htmlFor="as-description" className={LABEL}>Instructions (optional)</label>
          <textarea id="as-description" rows={3} value={state.description} disabled={disabled} onChange={(e) => patch({ description: e.target.value })} placeholder="Shown to learners before the first question." className={FIELD} />
          <p className="text-xs text-slate-600 mt-1">{state.description.trim().length}/{LIMITS.descriptionMax}</p>
        </div>
      </section>

      {/* ----------------------------------------------------------------------------------------------- scoring */}
      <section id="as-scoring" tabIndex={-1} aria-labelledby="as-scoring-h" className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs focus:outline-hidden">
        <h2 id="as-scoring-h" className="font-serif text-lg font-bold text-slate-900">Scoring</h2>
        <p className="text-sm text-slate-700">
          Each answer gives points to each of the three levels. The level with the <strong>highest total</strong> over the learner&rsquo;s answers is the one recommended; the
          learner can always choose a different level. There are no thresholds, percentages or pass marks.
        </p>
        <p className="text-xs rounded-lg border border-sky-200 bg-sky-50 text-sky-900 p-2.5">
          This scoring model is <strong>provisional</strong>: it can be replaced later without changing the app&rsquo;s contract. The points and the settings below are yours to decide; nothing is pre-filled.
        </p>

        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 accent-amber-600"
            disabled={disabled}
            checked={state.scoring.enabled}
            onChange={(e) => patchScoring({ enabled: e.target.checked })}
          />
          Scoring is configured
        </label>
        {!state.scoring.enabled && (
          <p role="note" className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3">
            Without a scoring configuration this assessment <strong>cannot be published</strong>. {detail?.scoringConfig ? 'Saving will remove the configuration that is saved now; you will be asked to confirm.' : 'You can save it as a draft and configure scoring later.'}
          </p>
        )}

        {state.scoring.enabled && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="as-tiebreak" className={LABEL}>Tie-break *</label>
                <select id="as-tiebreak" value={state.scoring.tieBreak} disabled={disabled} onChange={(e) => patchScoring({ tieBreak: e.target.value as EditorState['scoring']['tieBreak'] })} aria-describedby="as-tie-help" className={FIELD}>
                  <option value="">Choose…</option>
                  <option value="LOWER_LEVEL">LOWER_LEVEL: recommend the lower level</option>
                  <option value="HIGHER_LEVEL">HIGHER_LEVEL: recommend the higher level</option>
                </select>
                <p id="as-tie-help" className="text-xs text-slate-700 mt-1">{explainTie}</p>
              </div>
              <fieldset disabled={disabled}>
                <legend className={LABEL}>Required questions *</legend>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <input type="radio" name="as-requireall" className="h-4 w-4 accent-amber-600" checked={state.scoring.requireAll === 'yes'} onChange={() => patchScoring({ requireAll: 'yes' })} />
                    Every question must be answered
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <input type="radio" name="as-requireall" className="h-4 w-4 accent-amber-600" checked={state.scoring.requireAll === 'no'} onChange={() => patchScoring({ requireAll: 'no' })} />
                    Learners may skip questions (at least one must be answered)
                  </label>
                </div>
              </fieldset>
            </div>

            <div>
              <h3 className={LABEL}>Result messages (optional)</h3>
              <p className="text-xs text-slate-700 mb-2">Plain text shown with the result for that level. Nothing is generated; leave empty for none.</p>
              <div className="grid md:grid-cols-3 gap-3">
                {LEVELS.map((level) => (
                  <div key={level}>
                    <label htmlFor={`as-msg-${level}`} className="block text-xs font-semibold text-slate-700 mb-1">{LEVEL_LABEL[level]}</label>
                    <textarea id={`as-msg-${level}`} rows={3} maxLength={LIMITS.resultMessageMax * 2} value={state.scoring.messages[level]} disabled={disabled} onChange={(e) => patchScoring({ messages: { ...state.scoring.messages, [level]: e.target.value } })} className={FIELD} />
                    <p className="text-xs text-slate-600">{state.scoring.messages[level].trim().length}/{LIMITS.resultMessageMax}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ----------------------------------------------------------------------------------------------- questions */}
      <section id="as-questions" tabIndex={-1} aria-labelledby="as-questions-h" className="space-y-4 focus:outline-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="as-questions-h" className="font-serif text-lg font-bold text-slate-900">Questions ({state.questions.length})</h2>
            <p className="text-xs text-slate-700">Single choice. Each question needs {LIMITS.optionsMin} to {LIMITS.optionsMax} answers; at most {LIMITS.questionsMax} questions. The order here is the order learners see.</p>
          </div>
          {!readOnly && state.questions.some((q) => q.options.length > 0) && (
            <button type="button" onClick={fillZeros} disabled={disabled} className={SMALL_BTN}>Set all empty points to 0</button>
          )}
        </div>

        {state.questions.length === 0 && (
          <p className="p-4 rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-700">This assessment has no questions yet.</p>
        )}

        {state.questions.map((q, qi) => (
          <div key={q.key} id={`as-q${qi}`} tabIndex={-1} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs focus:outline-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 font-mono">Question {qi + 1}</span>
              {!readOnly && (
                <div className="flex gap-1.5">
                  <button type="button" className={SMALL_BTN} disabled={disabled || qi === 0} onClick={() => moveQuestion(qi, qi - 1)} aria-label={`Move question ${qi + 1} up`}>↑ Up</button>
                  <button type="button" className={SMALL_BTN} disabled={disabled || qi === state.questions.length - 1} onClick={() => moveQuestion(qi, qi + 1)} aria-label={`Move question ${qi + 1} down`}>↓ Down</button>
                  <button type="button" className={`${SMALL_BTN} text-rose-700`} disabled={disabled} onClick={() => setConfirm({ kind: 'question', qi })} aria-label={`Delete question ${qi + 1}`}>Delete</button>
                </div>
              )}
            </div>
            <div>
              <label htmlFor={`as-q${qi}-prompt`} className={LABEL}>Question text *</label>
              <textarea id={`as-q${qi}-prompt`} rows={2} value={q.prompt} disabled={disabled} onChange={(e) => setQuestion(qi, (x) => ({ ...x, prompt: e.target.value }))} className={FIELD} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <caption className="sr-only">Answers of question {qi + 1} and the points each gives to each level</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-600">
                    <th scope="col" className="pb-1 pr-2 font-semibold">Answer *</th>
                    {LEVELS.map((level) => <th key={level} scope="col" className="pb-1 px-1 font-semibold w-24">{LEVEL_LABEL[level]} points</th>)}
                    {!readOnly && <th scope="col" className="pb-1 pl-2 font-semibold"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {q.options.map((o, oi) => (
                    <tr key={o.key} className="align-top">
                      <td className="py-1 pr-2">
                        <label htmlFor={`as-q${qi}-o${oi}-text`} className="sr-only">Answer {oi + 1} of question {qi + 1}</label>
                        <input id={`as-q${qi}-o${oi}-text`} value={o.text} disabled={disabled} onChange={(e) => setOption(qi, oi, (x) => ({ ...x, text: e.target.value }))} placeholder={`Answer ${oi + 1}`} className={FIELD} />
                      </td>
                      {LEVELS.map((level, li) => (
                        <td key={level} className="py-1 px-1">
                          <label htmlFor={li === 0 ? `as-q${qi}-o${oi}-points` : `as-q${qi}-o${oi}-points-${level}`} className="sr-only">{LEVEL_LABEL[level]} points for answer {oi + 1} of question {qi + 1}</label>
                          <input
                            id={li === 0 ? `as-q${qi}-o${oi}-points` : `as-q${qi}-o${oi}-points-${level}`}
                            inputMode="numeric"
                            value={o.scores[level]}
                            disabled={disabled}
                            placeholder={`0–${LIMITS.pointsMax}`}
                            onChange={(e) => setOption(qi, oi, (x) => ({ ...x, scores: { ...x.scores, [level]: e.target.value } }))}
                            className={`${FIELD} text-right`}
                          />
                        </td>
                      ))}
                      {!readOnly && (
                        <td className="py-1 pl-2 whitespace-nowrap">
                          <button type="button" className={SMALL_BTN} disabled={disabled || oi === 0} onClick={() => moveOption(qi, oi, oi - 1)} aria-label={`Move answer ${oi + 1} of question ${qi + 1} up`}>↑</button>{' '}
                          <button type="button" className={SMALL_BTN} disabled={disabled || oi === q.options.length - 1} onClick={() => moveOption(qi, oi, oi + 1)} aria-label={`Move answer ${oi + 1} of question ${qi + 1} down`}>↓</button>{' '}
                          <button type="button" className={`${SMALL_BTN} text-rose-700`} disabled={disabled} onClick={() => setConfirm({ kind: 'option', qi, oi })} aria-label={`Delete answer ${oi + 1} of question ${qi + 1}`}>✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!readOnly && (
              <button type="button" className={SMALL_BTN} disabled={disabled || q.options.length >= LIMITS.optionsMax} onClick={() => setQuestion(qi, (x) => ({ ...x, options: [...x.options, blankOption()] }))}>
                + Add answer {q.options.length >= LIMITS.optionsMax ? `(maximum ${LIMITS.optionsMax})` : ''}
              </button>
            )}
          </div>
        ))}

        {!readOnly && (
          <button type="button" disabled={disabled || state.questions.length >= LIMITS.questionsMax} onClick={() => patch({ questions: [...state.questions, blankQuestion()] })} className="px-3.5 py-2 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg disabled:opacity-50">
            + Add question
          </button>
        )}
      </section>

      {/* ----------------------------------------------------------------------------------------------- save bar */}
      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-slate-50/95 backdrop-blur border-t border-slate-200 space-y-2">
          {saveError && (
            <div role="alert" className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-sm text-rose-900 space-y-1.5">
              <p>{saveError}</p>
              {problems.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5">
                  {problems.map((p, i) => (
                    <li key={`${p.code}-${p.path ?? i}-${i}`}>
                      {fieldIdForPath(p.path) ? (
                        <button type="button" onClick={() => focusField(p.path)} className="underline text-left">{p.message}</button>
                      ) : (
                        p.message
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {saveConflict && <button type="button" onClick={onReload} className={SMALL_BTN}>Reload latest (discards my edits)</button>}
            </div>
          )}
          {saved && <p role="status" className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-900">{saved}</p>}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {dirty && <span className="text-xs text-amber-800">Unsaved changes</span>}
            {detail && detail.status !== 'DRAFT' && (
              <span className="text-xs text-slate-700">Saving returns this assessment to Draft. Learners keep the published version until a new one is approved and published.</span>
            )}
            <button type="button" onClick={discard} disabled={saving || (!dirty && !!detail)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
              {detail ? 'Discard changes' : 'Cancel'}
            </button>
            <button type="button" onClick={() => void save()} disabled={saving || (!!detail && !dirty)} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
              {saving ? 'Saving…' : detail ? 'Save changes' : 'Create draft'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirm?.kind === 'question'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.qi !== undefined) patch({ questions: state.questions.filter((_, i) => i !== confirm.qi) });
          setConfirm(null);
        }}
        title="Delete this question?"
        message="The question and its answers are removed from the editor. Nothing changes on the server until you save."
        confirmLabel="Delete question"
        isDestructive
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'option'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.qi !== undefined && confirm.oi !== undefined) setQuestion(confirm.qi, (x) => ({ ...x, options: x.options.filter((_, i) => i !== confirm.oi) }));
          setConfirm(null);
        }}
        title="Delete this answer?"
        message="The answer and its points are removed from the editor. Nothing changes on the server until you save."
        confirmLabel="Delete answer"
        isDestructive
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'clear-scoring'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void save(true);
        }}
        title="Remove the scoring configuration?"
        message="You switched scoring off. Saving removes the saved scoring configuration (tie-break, required-questions setting and result messages), and the assessment cannot be published until a valid configuration is set again. The points on the answers are kept."
        confirmLabel="Save without scoring"
        isDestructive
      />
    </div>
  );
}
