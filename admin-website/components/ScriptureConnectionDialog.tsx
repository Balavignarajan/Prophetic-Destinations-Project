'use client';

import React, { useRef, useState } from 'react';
import { CONNECTION_LIMITS, EMPTY_CONNECTION_BLOCK, type ScriptureConnectionContent, buildConnectionContent, connectionReadiness, newConnectionId } from '../lib/scripture-connection';
import type { LearningLevel } from '../lib/types';
import ScriptureRefList from './ScriptureRefList';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  initial: ScriptureConnectionContent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1.5';
const SMALL = 'block text-xs font-semibold text-slate-800';
const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

interface BodyProps extends Omit<Props, 'isOpen' | 'onClose'> {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
}

function Body({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps) {
  const start: ScriptureConnectionContent = initial ?? EMPTY_CONNECTION_BLOCK;
  const [title, setTitle] = useState(start.title);
  const [connections, setConnections] = useState(start.connections);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);

  const draft = { title, connections };
  dirtyRef.current = JSON.stringify(buildConnectionContent(draft)) !== JSON.stringify(buildConnectionContent(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);
  const missing = connectionReadiness(draft);

  const patch = (id: string, changes: Partial<ScriptureConnectionContent['connections'][number]>) => setConnections((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  const move = (index: number, delta: -1 | 1) =>
    setConnections((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(buildConnectionContent(draft), levels);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you typed here is unchanged.
        </p>
      )}

      <div>
        <label htmlFor="conn-title" className={LABEL}>Title (optional)</label>
        <input id="conn-title" type="text" maxLength={CONNECTION_LIMITS.title} value={title} disabled={saving} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
      </div>

      <fieldset className="space-y-3" disabled={saving}>
        <legend className={LABEL}>Connections, in the order learners read them</legend>
        <p className="text-xs text-slate-700">
          Each connection groups the passages you choose with your own explanation of how they relate. Nothing is suggested for you, and the
          explanation is shown as your words, apart from the Scripture.
        </p>
        {connections.length === 0 ? (
          <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">No connections yet. Add the first one.</p>
        ) : (
          <ol className="space-y-3">
            {connections.map((connection, index) => (
              <li key={connection.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">{index + 1}</span>
                    Connection {index + 1}
                  </span>
                  <div className="flex gap-2">
                    <button type="button" className={BTN} aria-label={`Move connection ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>Up</button>
                    <button type="button" className={BTN} aria-label={`Move connection ${index + 1} down`} disabled={index === connections.length - 1} onClick={() => move(index, 1)}>Down</button>
                    <button type="button" className={BTN} aria-label={`Remove connection ${index + 1}`} onClick={() => setConnections((list) => list.filter((c) => c.id !== connection.id))}>Remove</button>
                  </div>
                </div>
                <div>
                  <label htmlFor={`conn-label-${connection.id}`} className={SMALL}>Label {index + 1} (optional)</label>
                  <input id={`conn-label-${connection.id}`} type="text" maxLength={CONNECTION_LIMITS.label} value={connection.label} onChange={(e) => patch(connection.id, { label: e.target.value })} className={FIELD} />
                </div>
                <ScriptureRefList
                  itemLabel={`Connection ${index + 1}`}
                  idPrefix={`conn-sc-${connection.id}`}
                  title={`Scripture passages for connection ${index + 1} (at least one before publishing)`}
                  emptyMessage="No passages yet. You can save a draft without them, but the lesson cannot be published until this connection has one."
                  entries={connection.scripture}
                  onChange={(scripture) => patch(connection.id, { scripture })}
                  disabled={saving}
                />
                <div>
                  <label htmlFor={`conn-expl-${connection.id}`} className={SMALL}>Your explanation {index + 1} (required before publishing)</label>
                  <textarea id={`conn-expl-${connection.id}`} rows={3} maxLength={CONNECTION_LIMITS.explanation} value={connection.explanation} onChange={(e) => patch(connection.id, { explanation: e.target.value })} className={FIELD} />
                </div>
              </li>
            ))}
          </ol>
        )}
        <button type="button" className={BTN} disabled={connections.length >= CONNECTION_LIMITS.maxConnections} onClick={() => setConnections((list) => [...list, { id: newConnectionId(list), label: '', explanation: '', scripture: [] }])}>
          Add connection
        </button>
        {connections.length >= CONNECTION_LIMITS.maxConnections && <p className="text-xs text-slate-700">At most {CONNECTION_LIMITS.maxConnections} connections.</p>}
        {missing.length > 0 && (
          <div role="status" className="text-xs text-slate-700">
            <p className="font-semibold">A draft can be saved incomplete. Before publishing:</p>
            <ul className="list-disc pl-5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      {mode === 'create' && (
        <fieldset disabled={saving}>
          <legend className={LABEL}>Show this at</legend>
          <div className="flex flex-wrap gap-4">
            {lessonLevels.map((level) => (
              <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={levels.includes(level)} onChange={() => setLevels((c) => (c.includes(level) ? c.filter((l) => l !== level) : [...c, level]))} />
                {LEVEL_NAMES[level] ?? level}
              </label>
            ))}
          </div>
          {levels.length === 0 && <p className="text-sm font-medium text-rose-700 mt-1">Choose at least one level.</p>}
        </fieldset>
      )}

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={requestClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={!canSave} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {mode === 'create' ? 'Add connection to lesson' : 'Save connection'}
        </button>
      </div>
    </form>
  );
}

/** Adds or edits a Scripture connection block without leaving the lesson. The form starts fresh each time it opens. */
export default function ScriptureConnectionDialog({ isOpen, onClose, ...rest }: Props) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (rest.saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={rest.mode === 'create' ? 'Add a Scripture connection' : 'Edit Scripture connection'}
      description="Related passages in the order learners should read them, each with your own explanation."
      maxWidth="2xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
