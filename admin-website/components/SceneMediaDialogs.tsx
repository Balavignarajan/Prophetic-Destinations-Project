'use client';

import React, { useState } from 'react';
import { fillIfEmpty } from '../lib/media-api';
import {
  ANIMATION_LIMITS,
  EMPTY_ANIMATION,
  EMPTY_SCENE,
  SCENE_LIMITS,
  type AnimationContent,
  type SceneContent,
  animationReadiness,
  buildAnimation,
  buildScene,
  sceneReadiness,
} from '../lib/scene-media';
import type { LearningLevel } from '../lib/types';
import CoverImageField from './CoverImageField';
import ScriptureRefList from './ScriptureRefList';
import { Actions, LevelChoice, useGuardedClose } from './SectionCalloutDialogs';
import { Modal } from './ui';

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const HELP = 'text-xs text-slate-700 mt-1';

interface CommonProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
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

// -------------------------------------------------------------------------------------------------------------------- narrative scene

function SceneBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps & { initial: SceneContent | null }) {
  const start = initial ?? EMPTY_SCENE;
  const [draft, setDraft] = useState<SceneContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const patch = (changes: Partial<SceneContent>) => setDraft((d) => ({ ...d, ...changes }));
  dirtyRef.current = JSON.stringify(buildScene(draft)) !== JSON.stringify(buildScene(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildScene(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
        A scene is shown as a still picture with your text. Transition effects are not available yet: the list of allowed effects has not been decided.
      </p>
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Narrative scene</legend>
        <div>
          <label htmlFor="ns-title" className={LABEL}>Title (optional)</label>
          <input id="ns-title" type="text" maxLength={SCENE_LIMITS.title} value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={FIELD} />
        </div>
        <CoverImageField subject="scene" value={draft.mediaId || null} onChange={(mediaId, asset) => patch(mediaId ? { mediaId, altText: fillIfEmpty(draft.altText, asset?.altText) } : { mediaId: '', altText: '' })} disabled={saving} />
        {draft.mediaId && (
          <div>
            <label htmlFor="ns-alt" className={LABEL}>Visual description <span className="text-rose-700">(required before publishing)</span></label>
            <textarea id="ns-alt" rows={2} maxLength={SCENE_LIMITS.altText} value={draft.altText} onChange={(e) => patch({ altText: e.target.value })} className={FIELD} />
            <p className={HELP}>Describe the picture for people who cannot see it.</p>
          </div>
        )}
        <div>
          <label htmlFor="ns-narrative" className={LABEL}>Narrative</label>
          <textarea id="ns-narrative" rows={4} maxLength={SCENE_LIMITS.narrative} value={draft.narrative} onChange={(e) => patch({ narrative: e.target.value })} className={FIELD} />
          <p className={HELP}>Concise text in your own words ({draft.narrative.length} of {SCENE_LIMITS.narrative}). Required before publishing.</p>
        </div>
        <ScriptureRefList
          itemLabel="this scene"
          idPrefix="ns-sc"
          title="Scripture (optional)"
          emptyMessage="No Scripture. The scene is published as it is without it."
          entries={draft.scripture}
          onChange={(scripture) => patch({ scripture })}
          disabled={saving}
        />
      </fieldset>
      <Missing items={sceneReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this scene at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add scene to lesson" editLabel="Save scene" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function SceneDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: SceneContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add a narrative scene' : 'Edit narrative scene'} description="A short story moment with a picture and your own words." maxWidth="xl">
      <SceneBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------------------------ animated image

function AnimationBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps & { initial: AnimationContent | null }) {
  const start = initial ?? EMPTY_ANIMATION;
  const [draft, setDraft] = useState<AnimationContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const patch = (changes: Partial<AnimationContent>) => setDraft((d) => ({ ...d, ...changes }));
  dirtyRef.current = JSON.stringify(buildAnimation(draft)) !== JSON.stringify(buildAnimation(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildAnimation(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
        Only <strong>animated WebP</strong> files can be used. Video and Lottie files are not supported in this version of the app, and a still image is refused when you save. The
        animation never starts by itself: learners press Play.
      </p>
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Animated image</legend>
        <CoverImageField subject="animation" contentType="image/webp" value={draft.mediaId || null} onChange={(mediaId, asset) => patch(mediaId ? { mediaId, altText: fillIfEmpty(draft.altText, asset?.altText), caption: fillIfEmpty(draft.caption, asset?.caption) } : { mediaId: '' })} disabled={saving} />
        <CoverImageField subject="poster" value={draft.posterMediaId || null} onChange={(mediaId) => patch({ posterMediaId: mediaId ?? '' })} disabled={saving} />
        <p className={HELP}>The poster is the still picture learners see before they press Play. Without one, the first frame of the animation is shown.</p>
        <div>
          <label htmlFor="ma-alt" className={LABEL}>Accessibility text</label>
          <textarea id="ma-alt" rows={2} maxLength={ANIMATION_LIMITS.altText} value={draft.altText} onChange={(e) => patch({ altText: e.target.value })} className={FIELD} />
          <p className={HELP}>Describe what the animation shows, for people who cannot see it. Required before publishing.</p>
        </div>
        <div>
          <label htmlFor="ma-caption" className={LABEL}>Caption (optional)</label>
          <textarea id="ma-caption" rows={2} maxLength={ANIMATION_LIMITS.caption} value={draft.caption} onChange={(e) => patch({ caption: e.target.value })} className={FIELD} />
        </div>
      </fieldset>
      <Missing items={animationReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this animation at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add animation to lesson" editLabel="Save animation" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function AnimationDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: AnimationContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add an animated image' : 'Edit animated image'} description="An animated WebP from your Media Library that learners start themselves." maxWidth="xl">
      <AnimationBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
