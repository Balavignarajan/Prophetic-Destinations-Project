import { useState } from 'react';
import { Image, View } from 'react-native';

import { API_BASE_URL } from '@/config/api';
import { reportBrokenAsset, useAssetUri } from '@/features/offline/offline-media';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/**
 * Published cover images, from the learner routes (no credentials, no admin route):
 *   course: GET /courses/:courseId/media/:mediaId?level=
 *   lesson: GET /lessons/:lessonId/media/:mediaId?level=
 * The backend serves a cover only while the active published version names it. Covers are saved on the device with the content that
 * lists them (see features/offline/offline-media.ts) and shown from there; without a saved copy and a connection the quiet placeholder is shown.
 */
export function courseCoverUrl(courseId: string, mediaId: string, level: LearningLevel): string | null {
  return API_BASE_URL ? `${API_BASE_URL}/courses/${encodeURIComponent(courseId)}/media/${encodeURIComponent(mediaId)}?level=${level}` : null;
}

export function lessonCoverUrl(lessonId: string, mediaId: string, level: LearningLevel): string | null {
  return API_BASE_URL ? `${API_BASE_URL}/lessons/${encodeURIComponent(lessonId)}/media/${encodeURIComponent(mediaId)}?level=${level}` : null;
}

/** A decorative cover. Renders nothing when there is no cover (older cached lists have none); a failed image shows a quiet placeholder. */
export function CoverImage({ mediaId, uri: remoteUri, width, height }: { mediaId: string; uri: string | null; width: number | '100%'; height: number }) {
  const { colors, radius } = useTheme();
  const [failed, setFailed] = useState(false);
  // The saved copy (offline-media) when there is one, otherwise the learner URL.
  const uri = useAssetUri(mediaId, remoteUri);
  if (!uri) return null;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
      {failed ? null : <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => {
            // a saved file that cannot be shown is forgotten (and downloaded again later); the placeholder stays quiet
            if (uri !== remoteUri) reportBrokenAsset(mediaId);
            else setFailed(true);
          }} />}
    </View>
  );
}
