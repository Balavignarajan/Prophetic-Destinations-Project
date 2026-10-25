'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyBlockName } from '../lib/block-catalog';
import { fileKindLabel, formatBytes, friendlyMediaError } from '../lib/image-block';
import { type MediaUsage, type UsedByLesson, getMediaUsage, updateMediaDetails } from '../lib/media-api';
import type { MediaAsset } from '../lib/types';
import MediaFileTile from './MediaFileTile';
import MediaImage from './MediaImage';

/**
 * Image details limits. PROPOSED (the workbook lists title, alt text, source, rights notes and tags for MediaAsset but gives no limits); they match the
 * backend (backend/src/modules/media/domain/metadata.ts).
 */
const LIMITS = { title: 200, altText: 500, caption: 500, source: 300, rightsNotes: 1000, maxTags: 20, tag: 40 } as const;
const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const HELP = 'text-xs text-slate-700 mt-1';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

const parseTags = (text: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.replace(/\s+/g, ' ').trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
};

const useLabel = (use: string) => (use === 'COVER' ? 'Lesson cover' : use === 'LEVEL_VARIANT' ? 'Level variant of a block' : friendlyBlockName(use));

function LessonRows({ lessons, truncated }: { lessons: UsedByLesson[]; truncated: boolean }) {
  return (
    <>
      <ul className="space-y-1.5">
        {lessons.map((l) => (
          <li key={l.lessonId} className="text-sm text-slate-900 break-words">
            <Link href={`/lessons/${l.lessonId}`} className="font-medium text-amber-900 underline">
              {l.title}
            </Link>
            <span className="block text-xs text-slate-700">
              {[l.courseTitle, l.moduleTitle].filter(Boolean).join(' › ') || 'Course not shown'} · used as: {l.uses.map(useLabel).join(', ')}
              {l.levels && l.levels.length > 0 ? ` · published at ${l.levels.map((x) => LEVEL_NAMES[x] ?? x).join(', ')}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {truncated && <p className="text-xs font-medium text-amber-900">This list is cut short and is not complete.</p>}
    </>
  );
}

/** "Where this image is used": working and published usage kept apart, loaded from the server on demand. A cut-short list always says so. */
function UsageSection({ asset }: { asset: MediaAsset }) {
  const [limit, setLimit] = useState(50);
  const [usage, setUsage] = useState<MediaUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getMediaUsage(asset.id, limit)
      .then((u) => !cancelled && setUsage(u))
      .catch((e) => !cancelled && setError(friendlyMediaError(e, 'Could not load where this image is used.')));
    return () => {
      cancelled = true;
    };
  }, [asset.id, limit, retry]);

  if (error) {
    return (
      <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900 flex items-center justify-between gap-3">
        <span>{error}</span>
        <button type="button" onClick={() => setRetry((n) => n + 1)} className="shrink-0 px-3 py-1 text-sm font-medium bg-white border border-rose-300 rounded-lg hover:bg-rose-100">
          Try again
        </button>
      </div>
    );
  }
  if (!usage) return <p role="status" className="text-sm text-slate-700">Loading where this image is used…</p>;

  const t = usage.totals;
  const reusable = t.reusableBlocks ?? 0;
  const homeCards = t.homeEntries ?? 0;
  const homeEntries = usage.working.homeEntries ?? [];
  const anyUse = t.draftLessons + t.publishedLessons + t.draftCourses + t.publishedCourses + reusable + homeCards > 0;
  const anyCut = Object.values(usage.truncated).some(Boolean);
  const Group = ({ title, note, lessons, courses, cutLessons, cutCourses }: { title: string; note: string; lessons: UsedByLesson[]; courses: { courseId: string; title: string }[]; cutLessons: boolean; cutCourses: boolean }) => (
    <section aria-label={title} className="rounded-lg border border-slate-200 p-3 space-y-2">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <p className="text-xs text-slate-700">{note}</p>
      {lessons.length === 0 && courses.length === 0 ? (
        <p className="text-sm text-slate-700">None.</p>
      ) : (
        <>
          {courses.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-800">Course covers</p>
              <ul className="space-y-1">
                {courses.map((c) => (
                  <li key={c.courseId} className="text-sm break-words">
                    <Link href={`/courses/${c.courseId}`} className="font-medium text-amber-900 underline">
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
              {cutCourses && <p className="text-xs font-medium text-amber-900">This list is cut short and is not complete.</p>}
            </div>
          )}
          {lessons.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-800">Lessons</p>
              <LessonRows lessons={lessons} truncated={cutLessons} />
            </div>
          )}
        </>
      )}
    </section>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-800" aria-live="polite">
        Working copy: {t.draftLessons} {t.draftLessons === 1 ? 'lesson' : 'lessons'}, {t.draftCourses} {t.draftCourses === 1 ? 'course cover' : 'course covers'}. Published:{' '}
        {t.publishedLessons} {t.publishedLessons === 1 ? 'lesson' : 'lessons'}, {t.publishedCourses} {t.publishedCourses === 1 ? 'course cover' : 'course covers'}.
      </p>
      {reusable > 0 && (
        <p className="text-sm text-slate-800">
          Also kept in {reusable} reusable {reusable === 1 ? 'block' : 'blocks'} in the library (not published anywhere). Delete {reusable === 1 ? 'it' : 'them'} in Reusable Blocks to free this image.
        </p>
      )}
      {homeCards > 0 && (
        <p className="text-sm text-slate-800">
          Also the picture of {homeCards} Home {homeCards === 1 ? 'Entry' : 'Entries'} (see below).
        </p>
      )}
      {homeCards > 0 && (
        <section aria-label="Home Entries" className="rounded-lg border border-slate-200 p-3 space-y-2">
          <h4 className="text-sm font-semibold text-slate-900">Home Entries</h4>
          <p className="text-xs text-slate-700">
            Cards on the learner Home screen that use this image as their picture. Unlike lessons and courses, a Home Entry is not published separately: learners see its picture
            as soon as the card is shown to them. Change or remove the picture in <Link href="/home-entries" className="font-medium text-amber-900 underline">Home Entries</Link> to free this image.
          </p>
          <ul className="space-y-1">
            {homeEntries.map((entry) => (
              <li key={entry.entryId} className="text-sm break-words">
                <span className="font-medium text-slate-900">{entry.title}</span>
              </li>
            ))}
          </ul>
          {usage.truncated.workingHomeEntries && <p className="text-xs font-medium text-amber-900">This list is cut short and is not complete.</p>}
        </section>
      )}
      <Group title="In the working copy" note="Draft content and working covers. Changing these does not change what learners see until the lesson or course is published again." lessons={usage.working.lessons} courses={usage.working.courses} cutLessons={usage.truncated.workingLessons} cutCourses={usage.truncated.workingCourses} />
      <Group title="Published right now" note="Active published lessons and course catalogs. A published lesson keeps showing this image until it is republished or unpublished." lessons={usage.published.lessons} courses={usage.published.courses} cutLessons={usage.truncated.publishedLessons} cutCourses={usage.truncated.publishedCourses} />
      {anyCut && limit < 200 && (
        <button type="button" onClick={() => setLimit(200)} className="px-3 py-1.5 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
          Show more (up to 200 per group)
        </button>
      )}
      {anyCut && limit >= 200 && <p className="text-xs font-medium text-amber-900">Some groups are longer than this view can list. The counts above are exact.</p>}
      {anyUse ? (
        <p className="text-sm text-slate-800">
          <strong>This image cannot be deleted while it is used.</strong> To free it, open each place above and choose another image (or remove this one); for published use,
          then republish or unpublish that lesson or course. Nothing is removed or unpublished for you, and the server checks again at the moment you delete.
        </p>
      ) : (
        <p className="text-sm text-slate-800">Not used anywhere right now. The server checks again at the moment you delete it.</p>
      )}
    </div>
  );
}

interface Props {
  asset: MediaAsset;
  canWrite: boolean;
  /** Called with the saved asset so the list shows the new details. */
  onSaved: (asset: MediaAsset) => void;
  /** Lets the dialog around this panel ask before closing with unsaved changes or while saving. */
  dirtyRef: React.MutableRefObject<boolean>;
  busyRef: React.MutableRefObject<boolean>;
}

/** One accessible place for an image's file facts, its details (title, default alt text, source/credit, rights notes, tags) and where it is used. */
export default function MediaDetailsPanel({ asset, canWrite, onSaved, dirtyRef, busyRef }: Props) {
  const [current, setCurrent] = useState(asset);
  const [title, setTitle] = useState(asset.title ?? '');
  const [altText, setAltText] = useState(asset.altText ?? '');
  const [caption, setCaption] = useState(asset.caption ?? '');
  const [source, setSource] = useState(asset.source ?? '');
  const [rightsNotes, setRightsNotes] = useState(asset.rightsNotes ?? '');
  const [tagText, setTagText] = useState((asset.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);

  const tags = parseTags(tagText);
  const dirty =
    title.trim() !== (current.title ?? '') ||
    altText.trim() !== (current.altText ?? '') ||
    caption.trim() !== (current.caption ?? '') ||
    source.trim() !== (current.source ?? '') ||
    rightsNotes.trim() !== (current.rightsNotes ?? '') ||
    JSON.stringify(tags) !== JSON.stringify(current.tags ?? []);
  dirtyRef.current = dirty;
  busyRef.current = saving;
  const tooManyTags = tags.length > LIMITS.maxTags;
  const tagTooLong = tags.some((t) => t.length > LIMITS.tag);

  const save = useCallback(async () => {
    if (savingRef.current || !dirty || tooManyTags || tagTooLong) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await updateMediaDetails(current.id, current.version ?? 1, { title, altText, caption, source, rightsNotes, tags });
      setCurrent(next);
      setSaved(true);
      onSaved(next);
    } catch (e) {
      // The values typed here are kept as they are.
      const status = (e as { status?: number }).status;
      setError(status === 409 ? 'Someone else changed these details. Close this window, reopen the image to see the latest details, and make your change again.' : friendlyMediaError(e, 'Could not save the details.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [current, dirty, tooManyTags, tagTooLong, title, altText, caption, source, rightsNotes, tags, onSaved]);

  return (
    <div className="space-y-6">
      <div className="flex max-h-72 items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-slate-100 p-2">
        {current.contentType.startsWith('image/') ? (
          <MediaImage mediaId={current.id} alt={current.altText?.trim() || current.title?.trim() || current.originalFilename} className="max-h-64 max-w-full" fit="contain" />
        ) : (
          <MediaFileTile contentType={current.contentType} className="h-40 w-full" />
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm bg-slate-50 border border-slate-200 rounded-xl p-4">
        <dt className="font-semibold text-slate-800">File</dt>
        <dd className="break-all">{current.originalFilename}</dd>
        <dt className="font-semibold text-slate-800">Format</dt>
        <dd>{fileKindLabel(current.contentType)}</dd>
        <dt className="font-semibold text-slate-800">Size</dt>
        <dd>{formatBytes(current.sizeBytes)}</dd>
        <dt className="font-semibold text-slate-800">Uploaded</dt>
        <dd>{new Date(current.createdAt).toLocaleString()}</dd>
      </dl>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
        aria-labelledby="media-details-heading"
      >
        <h3 id="media-details-heading" className="text-base font-semibold text-slate-900">Image details</h3>
        <p className="text-xs text-slate-700">
          All optional. They describe the image in the library; the file itself cannot be changed here. Alternative text, caption and source are offered as starting text when someone chooses
          this image for a lesson, only where that lesson field is empty, and they can edit it there. Changing them here never changes lessons or anything already published.
        </p>
        {error && (
          <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
            {error} What you typed here is unchanged.
          </p>
        )}
        {saved && !dirty && <p role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-sm text-emerald-950">Details saved.</p>}
        <fieldset className="space-y-4" disabled={!canWrite || saving}>
          <legend className="sr-only">Image details</legend>
          <div>
            <label htmlFor="media-title" className={LABEL}>Title</label>
            <input id="media-title" type="text" maxLength={LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="media-alt" className={LABEL}>Default alternative text</label>
            <textarea id="media-alt" rows={2} maxLength={LIMITS.altText} value={altText} onChange={(e) => setAltText(e.target.value)} className={FIELD} />
            <p className={HELP}>Describes the image for people who cannot see it. Course and lesson covers stay decorative and do not use it.</p>
          </div>
          <div>
            <label htmlFor="media-caption" className={LABEL}>Default caption</label>
            <textarea id="media-caption" rows={2} maxLength={LIMITS.caption} value={caption} onChange={(e) => setCaption(e.target.value)} className={FIELD} />
            <p className={HELP}>Offered as the caption only where a lesson block has a caption field and it is empty. Blocks without a caption field do not use it.</p>
          </div>
          <div>
            <label htmlFor="media-source" className={LABEL}>Source or credit</label>
            <input id="media-source" type="text" maxLength={LIMITS.source} value={source} onChange={(e) => setSource(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="media-rights" className={LABEL}>Rights information (internal)</label>
            <textarea id="media-rights" rows={3} maxLength={LIMITS.rightsNotes} value={rightsNotes} onChange={(e) => setRightsNotes(e.target.value)} className={FIELD} />
            <p className={HELP}>A note for your team only. It is never shown to learners and is not proof that you have permission to use the image.</p>
          </div>
          <div>
            <label htmlFor="media-tags" className={LABEL}>Tags</label>
            <input id="media-tags" type="text" value={tagText} onChange={(e) => setTagText(e.target.value)} className={FIELD} aria-describedby="media-tags-help" />
            <p id="media-tags-help" className={HELP}>Separate tags with commas. Up to {LIMITS.maxTags} tags of at most {LIMITS.tag} characters.</p>
            {tooManyTags && <p className="text-xs font-medium text-rose-700 mt-1">Too many tags: use at most {LIMITS.maxTags}.</p>}
            {tagTooLong && <p className="text-xs font-medium text-rose-700 mt-1">A tag is longer than {LIMITS.tag} characters.</p>}
          </div>
        </fieldset>
        {canWrite ? (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!dirty || saving || tooManyTags || tagTooLong}
              aria-busy={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
              Save details
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-700">Your role can view these details but not change them.</p>
        )}
      </form>

      <section aria-labelledby="media-usage-heading" className="space-y-3">
        <h3 id="media-usage-heading" className="text-base font-semibold text-slate-900">Where this image is used</h3>
        <UsageSection asset={current} />
      </section>
    </div>
  );
}
