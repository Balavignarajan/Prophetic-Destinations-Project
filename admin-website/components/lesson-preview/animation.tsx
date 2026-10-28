'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { youtubeThumbnailUrl, youtubeWatchUrl } from '../../lib/youtube';
import { Btn, Notice, Picture, Spinner, Txt, asText, isText, useReducedMotion, type PicStatus } from './ui';

/**
 * A MEDIA_ANIMATION block as the learner app draws it (mobile-app/src/learning/scene-media-blocks.tsx, played-media-blocks.tsx): an animated image, an MP4 video, a YouTube video or a Lottie
 * animation, by its media type. NOTHING PLAYS BY ITSELF in the preview (not even where the app would start an animation when it scrolls into view): the poster is shown until Play is pressed, and
 * Stop returns to it. The files come through the Media Library with the administrator's credentials. A YouTube video is shown by its thumbnail with a link to watch it on YouTube (the preview does
 * not embed other sites). A Lottie animation cannot be played in the Admin, and says so instead of pretending.
 */
const YOUTUBE_ID = new RegExp('^[A-Za-z0-9_-]{11}$');

/** The 16:9 stage of the block: the poster when there is one, otherwise a quiet placeholder that says what is here. */
function Poster({ posterId, alt, placeholder }: { posterId: string; alt: string; placeholder: string }) {
  const [status, setStatus] = useState<PicStatus>('loading');
  const showPicture = posterId !== '' && status !== 'failed';
  return (
    <div className="lp-box lp-box-ready" style={{ aspectRatio: 16 / 9 }}>
      {showPicture ? (
        <Picture mediaId={posterId} alt={alt} fit="contain" onStatus={setStatus} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
          <Txt v="body-small" tone="muted">
            {posterId ? 'The poster could not be loaded.' : placeholder}
          </Txt>
        </div>
      )}
    </div>
  );
}

/** The video, fetched on Play through the Media Library (it is a private file) and played by the browser's own player; it stops and is released on Stop, when the block goes and when the preview closes. */
function VideoPlayer({ mediaId, label }: { mediaId: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await api.fetchRaw(`/admin/media/${mediaId}/content`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  if (failed) return <Notice variant="offline" title={`Video: ${label}`} message="This video could not be loaded. It may have been deleted from the Media Library." />;
  if (!src) {
    return (
      <div className="lp-box lp-box-ready flex items-center justify-center" style={{ aspectRatio: 16 / 9 }}>
        <Spinner />
      </div>
    );
  }
  return <video src={src} controls autoPlay playsInline aria-label={label} className="block w-full rounded-2xl" style={{ background: 'var(--lp-background)', aspectRatio: 16 / 9 }} />;
}

function Captions({ caption, description }: { caption: string; description: string }) {
  return (
    <>
      {caption && (
        <Txt v="body-small" tone="secondary">
          {caption}
        </Txt>
      )}
      {description && (
        <Txt v="body-small" tone="secondary" pre>
          {description}
        </Txt>
      )}
    </>
  );
}

export function MediaAnimationBlock({ content }: { content: Record<string, unknown> }) {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const type = content.mediaType;
  const alt = asText(content.altText);
  const caption = typeof content.caption === 'string' ? content.caption.trim() : '';
  const description = typeof content.description === 'string' ? content.description.trim() : '';
  const mediaId = asText(content.mediaId);
  const posterId = asText(content.posterMediaId);
  const incomplete = (what: string) => <Notice title={`${what} is incomplete`} message="Part of this block could not be read, so it is not shown. The rest of the lesson is not affected." />;

  if (type === 'YOUTUBE') {
    const id = typeof content.youtubeVideoId === 'string' ? content.youtubeVideoId : '';
    if (!YOUTUBE_ID.test(id) || !isText(content.altText)) return incomplete('YouTube video');
    return (
      <div className="lp-rise flex flex-col gap-2">
        <a href={youtubeWatchUrl(id)} target="_blank" rel="noopener noreferrer" className="lp-box lp-box-ready block no-underline" style={{ aspectRatio: 16 / 9 }} aria-label={`Watch on YouTube (opens a new tab): ${alt}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youtubeThumbnailUrl(id)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--lp-scrim)' }}>
            <span className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--lp-primary)', color: 'var(--lp-on-primary)', fontSize: 22, paddingLeft: 4 }}>
              ▶
            </span>
          </span>
        </a>
        <Txt v="body-small" tone="muted">
          Opens on YouTube in a new tab. The preview does not play it.
        </Txt>
        <Captions caption={caption} description={description} />
      </div>
    );
  }

  if (type === 'VIDEO' || type === 'LOTTIE') {
    if (!mediaId || !isText(content.altText) || (content.caption !== undefined && typeof content.caption !== 'string') || (content.description !== undefined && typeof content.description !== 'string') || (content.posterMediaId !== undefined && typeof content.posterMediaId !== 'string')) {
      return incomplete('Media');
    }
    if (type === 'LOTTIE') {
      return (
        <div className="lp-rise flex flex-col gap-2">
          <Poster posterId={posterId} alt={alt} placeholder="Lottie animation" />
          <Notice variant="unsupported" title="Lottie animation" message="Lottie animations play in the mobile app. The Admin preview shows the poster only." />
          <Captions caption={caption} description={description} />
        </div>
      );
    }
    return (
      <div className="lp-rise flex flex-col gap-2">
        {playing ? <VideoPlayer mediaId={mediaId} label={alt} /> : <Poster posterId={posterId} alt={alt} placeholder="Video: press Play to watch it here." />}
        <Btn kind="secondary" size="sm" className="self-start" onClick={() => setPlaying((value) => !value)}>
          {playing ? 'Stop video' : 'Play video'}
        </Btn>
        <Captions caption={caption} description={description} />
      </div>
    );
  }

  if (type !== undefined && type !== 'ANIMATED_IMAGE') return <Notice variant="unsupported" title="Media not supported" message="This kind of media cannot be played in this version of the app yet. The rest of the lesson is not affected." />;
  if (!mediaId || !isText(content.altText) || (content.caption !== undefined && typeof content.caption !== 'string') || (content.description !== undefined && typeof content.description !== 'string')) return incomplete('Animation');

  return (
    <div className="lp-rise flex flex-col gap-2">
      {playing ? (
        <div className="lp-box lp-box-ready" style={{ aspectRatio: 16 / 9 }}>
          <Picture key={mediaId} mediaId={mediaId} alt={alt} fit="contain" />
        </div>
      ) : (
        <Poster posterId={posterId} alt={alt} placeholder="Animated image: press Play to see it move." />
      )}
      <Btn kind="secondary" size="sm" className="self-start" aria-label={playing ? 'Pause the animation' : 'Play the animation'} onClick={() => setPlaying((value) => !value)}>
        {playing ? 'Pause animation' : 'Play animation'}
      </Btn>
      {reduced && (
        <Txt v="body-small" tone="muted">
          Your device is set to reduce motion. This animation plays only when you press Play.
        </Txt>
      )}
      <Captions caption={caption} description={description} />
    </div>
  );
}
