'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AssessmentDetail,
  type EditorOption,
  type EditorQuestion,
  type EditorState,
  LIMITS,
  type Problem,
  assessmentsApi,
  blankOption,
  blankQuestion,
  checkEditor,
  describeError,
  editorSignature,
  emptyEditor,
  isConflict,
  problemsFromError,
  toEditor,
  toPayload,
} from '../../lib/assessments';
import { copyQuestion } from '../../lib/assessment-builder';
import { useUnsavedWork } from '../../lib/unsaved-guard';

/**
 * The working copy of an assessment while it is being edited, and everything that happens to it: editing, ordering, saving, discarding. The workspace and its tabs only show it and call these.
 *
 * LOCAL UNTIL SAVE. Details, scoring, questions, answers, points and the order of questions and answers all change this copy only. One save (`POST` / `PUT /admin/assessments`, exactly as before)
 * REPLACES the whole assessment: it sends the title, the instructions, `scoringConfig` (always, explicitly), every question and answer in their order, the ids of those that already existed (the
 * server keeps them), and the `version` the editor's content was LOADED from, so a save on top of someone else's change is refused (409) instead of overwriting it. A failed save keeps everything
 * typed. There is no separate order call: the order is part of what the save sends. Saving only returns the working copy to Draft as the server decides; it never approves or publishes.
 *
 * LEAVING. The editor tells the Admin's single guard (lib/unsaved-guard.ts) when it holds unsaved changes, so refresh, closing the tab, the Back button and links are asked about once, by it. It
 * has no guard of its own.
 */
export interface AssessmentEditor {
  state: EditorState;
  dirty: boolean;
  saving: boolean;
  /** A save was tried and refused (checks or server): field-level messages are shown from then on. */
  attempted: boolean;
  saveError: string | null;
  problems: Problem[];
  saveConflict: boolean;
  saved: string | null;
  serverMoved: boolean;
  announce: string;
  confirmClearScoring: boolean;
  say: (message: string) => void;
  patch: (change: Partial<EditorState>) => void;
  patchScoring: (change: Partial<EditorState['scoring']>) => void;
  setQuestion: (qi: number, change: (q: EditorQuestion) => EditorQuestion) => void;
  setOption: (qi: number, oi: number, change: (o: EditorOption) => EditorOption) => void;
  addQuestion: () => string | null;
  duplicateQuestion: (qi: number) => string | null;
  removeQuestion: (qi: number) => void;
  moveQuestion: (from: number, to: number) => void;
  addOption: (qi: number) => void;
  removeOption: (qi: number, oi: number) => void;
  moveOption: (qi: number, from: number, to: number) => void;
  fillZeros: () => void;
  save: (clearingConfirmed?: boolean) => Promise<boolean>;
  cancelClearScoring: () => void;
  discard: () => void;
}

/** Leaving the form clean first lets the Admin's guard take its extra history entry away before the page navigates; otherwise the two race. */
const settle = () => new Promise<void>((resolve) => window.setTimeout(resolve, 250));

export function useAssessmentEditor({
  detail,
  readOnly,
  onSaved,
  onDirtyChange,
  onCancelNew,
}: {
  detail: AssessmentDetail | null;
  readOnly: boolean;
  /** Called only after the API confirmed the save. */
  onSaved: (detail: AssessmentDetail) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onCancelNew?: () => void;
}): AssessmentEditor {
  const initial = useMemo(() => (detail ? toEditor(detail) : emptyEditor()), [detail]);
  const [state, setState] = useState<EditorState>(initial);
  const [baseline, setBaseline] = useState(() => editorSignature(initial));
  const loadedVersion = useRef<number | null>(detail?.version ?? null);
  const [serverMoved, setServerMoved] = useState(false);

  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [confirmClearScoring, setConfirmClearScoring] = useState(false);
  const savingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onCancelNewRef = useRef(onCancelNew);
  onCancelNewRef.current = onCancelNew;

  const dirty = editorSignature(state) !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // The saved assessment changed (after a reload, or someone else saved): replace the editor, unless there are unsaved edits to protect.
  useEffect(() => {
    const incomingVersion = detail?.version ?? null;
    if (incomingVersion === loadedVersion.current) return;
    if (!dirtyRef.current) {
      setState(initial);
      setBaseline(editorSignature(initial));
      loadedVersion.current = incomingVersion;
      setServerMoved(false);
    } else {
      setServerMoved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.version]);

  const say = useCallback((message: string) => setAnnounce(message), []);
  const touched = useCallback(() => {
    setSaved(null);
    setSaveError(null);
    setSaveConflict(false);
  }, []);
  const patch = useCallback(
    (change: Partial<EditorState>) => {
      touched();
      setState((s) => ({ ...s, ...change }));
    },
    [touched],
  );
  const patchScoring = useCallback(
    (change: Partial<EditorState['scoring']>) => {
      touched();
      setState((s) => ({ ...s, scoring: { ...s.scoring, ...change } }));
    },
    [touched],
  );
  const setQuestion = useCallback(
    (qi: number, change: (q: EditorQuestion) => EditorQuestion) => {
      touched();
      setState((s) => ({ ...s, questions: s.questions.map((q, i) => (i === qi ? change(q) : q)) }));
    },
    [touched],
  );
  const setOption = useCallback(
    (qi: number, oi: number, change: (o: EditorOption) => EditorOption) => setQuestion(qi, (q) => ({ ...q, options: q.options.map((o, i) => (i === oi ? change(o) : o)) })),
    [setQuestion],
  );

  const addQuestion = useCallback((): string | null => {
    if (stateRef.current.questions.length >= LIMITS.questionsMax) return null;
    const added = blankQuestion();
    touched();
    setState((s) => (s.questions.length >= LIMITS.questionsMax ? s : { ...s, questions: [...s.questions, added] }));
    say(`Question ${stateRef.current.questions.length + 1} added. Not saved yet.`);
    return added.key;
  }, [say, touched]);

  const duplicateQuestion = useCallback(
    (qi: number): string | null => {
      const source = stateRef.current.questions[qi];
      if (!source || stateRef.current.questions.length >= LIMITS.questionsMax) return null;
      const copy = copyQuestion(source);
      touched();
      setState((s) => {
        const at = s.questions.findIndex((q) => q.key === source.key);
        if (at < 0) return s;
        const next = [...s.questions];
        next.splice(at + 1, 0, copy);
        return { ...s, questions: next };
      });
      say(`Question ${qi + 1} duplicated as question ${qi + 2}. Not saved yet.`);
      return copy.key;
    },
    [say, touched],
  );

  const removeQuestion = useCallback(
    (qi: number) => {
      touched();
      setState((s) => ({ ...s, questions: s.questions.filter((_, i) => i !== qi) }));
      say(`Question ${qi + 1} deleted. Nothing changes on the server until you save.`);
    },
    [say, touched],
  );

  const moveQuestion = useCallback(
    (from: number, to: number) => {
      const count = stateRef.current.questions.length;
      if (from === to || from < 0 || to < 0 || from >= count || to >= count) return;
      touched();
      setState((s) => {
        const next = [...s.questions];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return { ...s, questions: next };
      });
      say(`Question ${from + 1} moved to position ${to + 1} of ${count}. Not saved yet.`);
    },
    [say, touched],
  );

  const addOption = useCallback((qi: number) => setQuestion(qi, (q) => (q.options.length >= LIMITS.optionsMax ? q : { ...q, options: [...q.options, blankOption()] })), [setQuestion]);
  const removeOption = useCallback(
    (qi: number, oi: number) => {
      setQuestion(qi, (q) => ({ ...q, options: q.options.filter((_, i) => i !== oi) }));
      say(`Answer ${oi + 1} of question ${qi + 1} deleted. Nothing changes on the server until you save.`);
    },
    [say, setQuestion],
  );
  const moveOption = useCallback(
    (qi: number, from: number, to: number) => {
      const count = stateRef.current.questions[qi]?.options.length ?? 0;
      if (from === to || from < 0 || to < 0 || from >= count || to >= count) return;
      setQuestion(qi, (q) => {
        const options = [...q.options];
        const [item] = options.splice(from, 1);
        options.splice(to, 0, item);
        return { ...q, options };
      });
      say(`Answer ${from + 1} of question ${qi + 1} moved to position ${to + 1} of ${count}. Not saved yet.`);
    },
    [say, setQuestion],
  );

  const fillZeros = useCallback(() => {
    touched();
    setState((s) => ({
      ...s,
      questions: s.questions.map((q) => ({
        ...q,
        options: q.options.map((o) => ({ ...o, scores: { BEGINNER: o.scores.BEGINNER.trim() || '0', INTERMEDIATE: o.scores.INTERMEDIATE.trim() || '0', ADVANCED: o.scores.ADVANCED.trim() || '0' } })),
      })),
    }));
    say('Empty points were set to 0. Not saved yet.');
  }, [say, touched]);

  const save = useCallback(
    async (clearingConfirmed = false): Promise<boolean> => {
      if (savingRef.current || readOnly) return false;
      touched();
      const current = stateRef.current;
      const clientProblems = checkEditor(current);
      setProblems(clientProblems);
      setAttempted(true);
      if (clientProblems.length > 0) {
        setSaveError('Fix the problems listed below before saving. Nothing was saved.');
        return false;
      }
      // Switching scoring off removes the saved configuration: say so before it happens.
      if (detail?.scoringConfig && !current.scoring.enabled && !clearingConfirmed) {
        setConfirmClearScoring(true);
        return false;
      }
      savingRef.current = true;
      setSaving(true);
      try {
        // The version this editor's CONTENT was loaded from, not the newest one the page knows: if someone else saved since, the server must refuse (409) rather
        // than accept these edits on top of changes they never saw.
        const payload = toPayload(current, detail ? (loadedVersion.current ?? detail.version) : undefined);
        const result = detail ? await assessmentsApi.update(detail.id, payload) : await assessmentsApi.create(payload);
        // The API confirmed: only now is the editor "clean".
        const fresh = toEditor(result);
        setState(fresh);
        setBaseline(editorSignature(fresh));
        loadedVersion.current = result.version;
        setProblems([]);
        setAttempted(false);
        setServerMoved(false);
        setSaved(`Saved. Working-copy version ${result.version}; status ${result.status.replace(/_/g, ' ').toLowerCase()}.`);
        // A new assessment is followed by a move to its page: let the guard settle first.
        if (!detail) await settle();
        onSavedRef.current(result);
        return true;
      } catch (err: unknown) {
        if (isConflict(err)) {
          setSaveConflict(true);
          setSaveError(describeError(err, 'This assessment was changed by someone else.') + ' Nothing was saved and your edits are still here.');
        } else {
          setProblems(problemsFromError(err));
          setSaveError(describeError(err, 'The assessment could not be saved.') + ' Your edits are still here.');
        }
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [detail, readOnly, touched],
  );

  const discard = useCallback(() => {
    setState(initial);
    setBaseline(editorSignature(initial));
    setProblems([]);
    setAttempted(false);
    setSaveError(null);
    setSaved(null);
    setSaveConflict(false);
    if (!detail) void settle().then(() => onCancelNewRef.current?.());
  }, [detail, initial]);

  // Tell the Admin's single guard there is unsaved work (refresh, closing the tab, Back and links are then asked about by it).
  useUnsavedWork('assessment-editor', dirty && !readOnly, {
    label: 'Assessment',
    kind: 'changes',
    canSave: !serverMoved,
    save: () => save(),
    reset: discard,
  });

  return {
    state,
    dirty,
    saving,
    attempted,
    saveError,
    problems,
    saveConflict,
    saved,
    serverMoved,
    announce,
    confirmClearScoring,
    say,
    patch,
    patchScoring,
    setQuestion,
    setOption,
    addQuestion,
    duplicateQuestion,
    removeQuestion,
    moveQuestion,
    addOption,
    removeOption,
    moveOption,
    fillZeros,
    save,
    cancelClearScoring: () => setConfirmClearScoring(false),
    discard,
  };
}
