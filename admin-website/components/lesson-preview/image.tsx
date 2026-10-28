'use client';

import React, { useState } from 'react';
import { CloseButton, Notice, Picture, PhoneOverlay, Txt, asText, cx, type PicStatus } from './ui';

/**
 * An IMAGE block as the learner app draws it (mobile-app/src/learning/lesson-image.tsx): whole, at the full width of the column, in a box of the picture's own shape, with its caption and source
 * under it; pressing the picture enlarges it. If it cannot be loaded the app's quiet fallback is shown with the picture's description and a Try again button. The picture is fetched through the
 * Media Library with the administrator's credentials (the learner route is not used and nothing is written).
 */
export function LessonImage({ content }: { content: Record<string, unknown> }) {
  const mediaId = asText(content.mediaId);
  const alt = asText(content.altText);
  const caption = asText(content.caption);
  const source = asText(content.source);
  const [status, setStatus] = useState<PicStatus>('loading');
  const [ratio, setRatio] = useState(16 / 9);
  const [attempt, setAttempt] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const failed = !mediaId || status === 'failed';
  const name = alt || caption || 'Lesson image';

  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <div className="flex flex-col gap-2">
          <Notice
            variant="offline"
            title={alt ? `Image: ${alt}` : 'An image belongs here, but it could not be shown.'}
            message={mediaId ? 'This image could not be loaded. It may have been deleted from the Media Library.' : 'No image has been chosen for this block yet.'}
          />
          {mediaId && (
            <button
              type="button"
              className="lp-label lp-c-highlight self-start px-1"
              style={{ minHeight: 44 }}
              onClick={() => {
                setStatus('loading');
                setAttempt((count) => count + 1);
              }}
            >
              Try again
            </button>
          )}
        </div>
      ) : (
        <button type="button" className={cx('lp-box block', status === 'ready' && 'lp-box-ready')} style={{ aspectRatio: ratio }} aria-label={`Enlarge image: ${name}`} disabled={status !== 'ready'} onClick={() => setZoomed(true)}>
          <Picture
            key={attempt}
            mediaId={mediaId}
            alt={alt}
            fit="contain"
            onStatus={setStatus}
            onNaturalSize={(size) => {
              if (size.width > 0 && size.height > 0) setRatio(size.width / size.height);
            }}
          />
        </button>
      )}
      {caption && (
        <Txt v="body-small" tone="secondary">
          {caption}
        </Txt>
      )}
      {source && (
        <Txt v="body-small" tone="muted">
          Source: {source}
        </Txt>
      )}
      {zoomed && mediaId && (
        <PhoneOverlay kind="full" label="Enlarged image" onClose={() => setZoomed(false)}>
          <div className="flex shrink-0 justify-end px-4 pt-3">
            <CloseButton label="Close enlarged image" onClick={() => setZoomed(false)} />
          </div>
          <div className="relative min-h-0 flex-1 m-4">
            <Picture mediaId={mediaId} alt={name} fit="contain" />
          </div>
        </PhoneOverlay>
      )}
    </div>
  );
}
