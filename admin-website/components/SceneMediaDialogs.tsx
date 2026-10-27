'use client';

import React, { useState } from 'react';
import { fillIfEmpty } from '../lib/media-api';
import { ANIMATION_KINDS, type AnimationKind } from '../lib/media-kinds';
import { youtubeThumbnailUrl, youtubeVideoId } from '../lib/youtube';
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
          <textarea id="ns-narrative" rows={6} maxLength={SCENE_LIMITS.narrative} value={draft.narrative} onChange={(e) => patch({ narrative: e.target.value })} aria-describedby="ns-narrative-help" className={FIELD} />
          <p id="ns-narrative-help" className={HELP}>
            Concise text in your own words ({draft.narrative.length} of {SCENE_LIMITS.narrative}). Leave a blank line between paragraphs: learners see each paragraph on its own. Required before publishing.
          </p>
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
  const [youtubeUrl, setYoutubeUrl] = useState(start.youtubeVideoId ? `https://www.youtube.com/watch?v=${start.youtubeVideoId}` : '');
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const patch = (changes: Partial<AnimationContent>) => setDraft((d) => ({ ...d, ...changes }));
  const switchType = (mediaType: AnimationKind) => {
    setYoutubeUrl('');
    setDraft((d) => ({ ...d, mediaType, mediaId: '', youtubeVideoId: '', autoplayWhenVisible: mediaType === 'VIDEO' || mediaType === 'YOUTUBE' ? false : true, loop: mediaType === 'VIDEO' || mediaType === 'YOUTUBE' ? false : true, showControls: true }));
  };
  const setYoutubeLink = (value: string) => {
    setYoutubeUrl(value);
    patch({ youtubeVideoId: youtubeVideoId(value) ?? '' });
  };
  const isYoutube = draft.mediaType === 'YOUTUBE';
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
        {draft.mediaType === 'VIDEO' ? (
          <>
            An <strong>MP4 video</strong> from the Media Library. It never starts by itself: learners press Play. Videos are played over the internet and are <strong>not saved
            for offline reading</strong>, so a learner without a connection sees a message instead of the video. The poster is saved with the lesson.
          </>
        ) : draft.mediaType === 'LOTTIE' ? (
          <>
            A <strong>Lottie animation</strong> (plain .json, without expressions or links to other files). It can start when learners reach it, if you enable that setting. It is loaded over the
            internet when played and is <strong>not saved for offline reading</strong>. The poster is saved with the lesson.
          </>
        ) : isYoutube ? (
          <>
            A <strong>YouTube video</strong>. Learners need an internet connection and choose when to open it through YouTube. The link is stored only as a validated video reference, not as arbitrary embedded content.
          </>
        ) : (
          <>
            An <strong>animated WebP</strong> file; a still image is refused when you save. It can start when learners reach it, if you enable that setting. It is saved for offline
            reading with the lesson.
          </>
        )}
      </p>
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Media or animation</legend>
        <div>
          <label htmlFor="ma-type" className={LABEL}>Kind of media</label>
          <select
            id="ma-type"
            value={draft.mediaType}
            onChange={(e) => switchType(e.target.value as AnimationKind)}
            aria-describedby="ma-type-help"
            className={FIELD}
          >
            {ANIMATION_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>{kind.label}</option>
            ))}
          </select>
          <p id="ma-type-help" className={HELP}>Changing the kind clears its incompatible media reference. Caption, description and poster remain available.</p>
        </div>
        {isYoutube ? (
          <div>
            <label htmlFor="ma-youtube" className={LABEL}>YouTube video link <span className="text-rose-700">(required before publishing)</span></label>
            <input id="ma-youtube" type="url" placeholder="Paste a YouTube video URL" value={youtubeUrl} onChange={(e) => setYoutubeLink(e.target.value)} className={FIELD} aria-describedby="ma-youtube-help" />
            <p id="ma-youtube-help" className={HELP}>{draft.youtubeVideoId ? 'Valid YouTube link. Its canonical video reference will be saved.' : 'Enter a valid YouTube video link.'}</p>
            {draft.youtubeVideoId ? <img src={youtubeThumbnailUrl(draft.youtubeVideoId)} alt="YouTube video thumbnail preview" className="mt-3 max-h-48 rounded-lg border border-slate-200 object-contain" /> : null}
          </div>
        ) : (
          <CoverImageField
            key={draft.mediaType}
            subject={draft.mediaType === 'VIDEO' ? 'video' : draft.mediaType === 'LOTTIE' ? 'lottie' : 'animation'}
            contentType={ANIMATION_KINDS.find((kind) => kind.value === draft.mediaType)?.contentType}
            value={draft.mediaId || null}
            onChange={(mediaId, asset) => patch(mediaId ? { mediaId, altText: fillIfEmpty(draft.altText, asset?.altText), caption: fillIfEmpty(draft.caption, asset?.caption) } : { mediaId: '' })}
            disabled={saving}
          />
        )}
        <CoverImageField subject="poster" value={draft.posterMediaId || null} onChange={(mediaId) => patch({ posterMediaId: mediaId ?? '' })} disabled={saving} />
        <p className={HELP}>
          The poster is the still picture learners see before they press Play.{' '}
          {draft.mediaType === 'ANIMATED_IMAGE' ? 'Without one, the first frame of the animation is shown.' : draft.mediaType === 'YOUTUBE' ? 'Without one, the YouTube thumbnail is shown.' : 'Without one, learners see a plain play button.'}
        </p>
        {draft.mediaType !== 'YOUTUBE' ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">Playback settings</p>
            {(draft.mediaType === 'ANIMATED_IMAGE' || draft.mediaType === 'LOTTIE') ? <label className="flex gap-2 text-sm text-slate-800"><input type="checkbox" checked={draft.autoplayWhenVisible} onChange={(e) => patch({ autoplayWhenVisible: e.target.checked })} />Start this animation automatically when learners reach it.</label> : <p className={HELP}>Learners tap Play to watch this video.</p>}
            {draft.mediaType === 'LOTTIE' ? <label className="flex gap-2 text-sm text-slate-800"><input type="checkbox" checked={draft.loop} onChange={(e) => patch({ loop: e.target.checked })} />Repeat the animation while it is playing.</label> : null}
          </div>
        ) : <p className="p-3 rounded-lg bg-slate-50 text-sm text-slate-800">Learners need an internet connection. The video plays through YouTube.</p>}
        <div>
          <label htmlFor="ma-alt" className={LABEL}>Accessibility text</label>
          <textarea id="ma-alt" rows={2} maxLength={ANIMATION_LIMITS.altText} value={draft.altText} onChange={(e) => patch({ altText: e.target.value })} className={FIELD} />
          <p className={HELP}>Describe what the {draft.mediaType === 'VIDEO' || draft.mediaType === 'YOUTUBE' ? 'video' : 'animation'} shows, for people who cannot see it. Required before publishing.</p>
        </div>
        <div>
          <label htmlFor="ma-caption" className={LABEL}>Caption (optional)</label>
          <textarea id="ma-caption" rows={2} maxLength={ANIMATION_LIMITS.caption} value={draft.caption} onChange={(e) => patch({ caption: e.target.value })} className={FIELD} />
        </div>
        <div>
          <label htmlFor="ma-description" className={LABEL}>Description (optional)</label>
          <textarea id="ma-description" rows={3} maxLength={2000} value={draft.description} onChange={(e) => patch({ description: e.target.value })} className={FIELD} />
        </div>
      </fieldset>
      <Missing items={animationReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add to lesson" editLabel="Save" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function AnimationDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: AnimationContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add a video or animation' : 'Edit video or animation'} description="An animated WebP, MP4 video, Lottie animation, or a safe YouTube video reference." maxWidth="xl">
      <AnimationBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
