'use client';

import React, { useState } from 'react';
import {
  ACTIVITY_TYPES,
  DISCOVERY_LIMITS,
  EMPTY_DISCOVERY,
  EMPTY_REFLECTION,
  REFLECTION_LIMITS,
  type DiscoveryContent,
  type ReflectionContent,
  buildDiscovery,
  buildReflection,
  discoveryReadiness,
  reflectionReadiness,
} from '../lib/reflection-discovery';
import type { LearningLevel } from '../lib/types';
import ScriptureRefList from './ScriptureRefList';
import { Actions, LevelChoice, useGuardedClose } from './SectionCalloutDialogs';
import { Modal } from './ui';

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const HELP = 'text-xs text-slate-700 mt-1';

interface CommonProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}
type BodyProps = Omit<CommonProps, 'isOpen' | 'onClose'> & { requestClose: () => void; dirtyRef: React.MutableRefObject<boolean> };

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
      {error} What you typed here is unchanged.
    </p>
  );
}

function Missing({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div role="status" className="text-xs text-slate-700">
      <p className="font-semibold">A draft can be saved incomplete. Before publishing:</p>
      <ul className="list-disc pl-5">
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------------- study activity

function ReflectionBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps & { initial: ReflectionContent | null }) {
  const start = initial ?? EMPTY_REFLECTION;
  const [draft, setDraft] = useState<ReflectionContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const patch = (changes: Partial<ReflectionContent>) => setDraft((d) => ({ ...d, ...changes }));
  dirtyRef.current = JSON.stringify(buildReflection(draft)) !== JSON.stringify(buildReflection(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildReflection(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
        Learners only <strong>read</strong> this instruction. They cannot type an answer here, and nothing they do is saved or scored.
      </p>
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Study activity</legend>
        <div>
          <label htmlFor="ra-type" className={LABEL}>Activity type</label>
          <select id="ra-type" value={draft.activityType} onChange={(e) => patch({ activityType: e.target.value })} className={FIELD}>
            <option value="">Choose a type…</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className={HELP}>Learners see this as a label above your instruction. Required before publishing.</p>
        </div>
        <div>
          <label htmlFor="ra-instruction" className={LABEL}>Instruction</label>
          <textarea id="ra-instruction" rows={5} maxLength={REFLECTION_LIMITS.instruction} value={draft.instruction} onChange={(e) => patch({ instruction: e.target.value })} className={FIELD} />
          <p className={HELP}>What you ask the learner to do, in your own words. Required before publishing.</p>
        </div>
        <ScriptureRefList
          itemLabel="this activity"
          idPrefix="ra-sc"
          title="Bible references (optional)"
          emptyMessage="No references. The activity is published as it is without them."
          entries={draft.scripture}
          onChange={(scripture) => patch({ scripture })}
          disabled={saving}
        />
      </fieldset>
      <Missing items={reflectionReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this activity at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add activity to lesson" editLabel="Save activity" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function ReflectionDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: ReflectionContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add a study activity' : 'Edit study activity'} description="An instruction for the learner to read and act on outside the app." maxWidth="xl">
      <ReflectionBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------------------------------ guided question

function DiscoveryBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps & { initial: DiscoveryContent | null }) {
  const start = initial ?? EMPTY_DISCOVERY;
  const [draft, setDraft] = useState<DiscoveryContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const patch = (changes: Partial<DiscoveryContent>) => setDraft((d) => ({ ...d, ...changes }));
  dirtyRef.current = JSON.stringify(buildDiscovery(draft)) !== JSON.stringify(buildDiscovery(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildDiscovery(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
        The question, the passage and your explanation are all shown directly in the lesson; nothing is hidden behind a tap. Learners cannot type an answer, and nothing is
        saved, checked or scored.
      </p>
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Guided question</legend>
        <div>
          <label htmlFor="gd-question" className={LABEL}>Question</label>
          <textarea id="gd-question" rows={3} maxLength={DISCOVERY_LIMITS.question} value={draft.question} onChange={(e) => patch({ question: e.target.value })} className={FIELD} />
          <p className={HELP}>Required before publishing.</p>
        </div>
        <ScriptureRefList
          itemLabel="this question"
          idPrefix="gd-sc"
          title="Passage the question points to (at least one before publishing)"
          emptyMessage="No passage yet. You can save a draft without one, but the lesson cannot be published until one is chosen."
          entries={draft.scripture}
          onChange={(scripture) => patch({ scripture })}
          disabled={saving}
        />
        <div>
          <label htmlFor="gd-explanation" className={LABEL}>Explanation</label>
          <textarea id="gd-explanation" rows={5} maxLength={DISCOVERY_LIMITS.explanation} value={draft.explanation} onChange={(e) => patch({ explanation: e.target.value })} className={FIELD} />
          <p className={HELP}>Your own explanation. Learners see it as your words, apart from the Scripture. Required before publishing.</p>
        </div>
      </fieldset>
      <Missing items={discoveryReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this question at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add question to lesson" editLabel="Save question" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function DiscoveryDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: DiscoveryContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add a guided question' : 'Edit guided question'} description="A study question that points learners to a passage and your explanation." maxWidth="xl">
      <DiscoveryBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
