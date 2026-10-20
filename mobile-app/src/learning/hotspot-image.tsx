import { useState } from 'react';
import { Image, type ImageLoadEventData, type NativeSyntheticEvent, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { reportBrokenAsset, useAssetUri } from '@/features/offline/offline-media';
import { lessonImageUrl } from '@/learning/lesson-image';
import { ScriptureLinks } from '@/learning/scripture-links';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/**
 * Renders a published INTERACTIVE_IMAGE block (backend/src/modules/lessons/domain/blocks/interactive-image.ts; PROPOSED schema):
 *   { mediaId, altText, caption?, source?, hotspots: [{ id, x, y, label, explanation }] }
 * `x`/`y` are fractions of the WHOLE image. The image is shown uncropped in a box that has exactly the picture's own aspect ratio
 * (taken from the loaded image), so the box IS the displayed image and percentage positions land on the right spot on any phone,
 * with no empty bars around it. Markers are only drawn once the image has loaded. The numbered list below is the accessible
 * equivalent of the markers: choosing a marker or a row opens that hotspot's explanation. If the image cannot be shown (not saved,
 * offline, failed) the list stays and every explanation is shown, so nothing is lost. The image comes from the saved offline copy
 * when there is one, otherwise from the learner media route.
 * With `variant="map"` the same renderer shows a published MAP block (backend map-explore.ts): the same content plus an optional `title`, the
 * markers are optional (a map may be just the image, with its description and caption as the text equivalent), and the wording says "marker".
 */
type Hotspot = { id: string; x: number | null; y: number | null; label: string; explanation: string; scripture: unknown };

const asText = (value: unknown) => (typeof value === 'string' ? value : '');
const fraction = (value: unknown) => (typeof value === 'number' && value >= 0 && value <= 1 ? value : null);

function readHotspots(content: Record<string, unknown>): Hotspot[] {
  if (!Array.isArray(content.hotspots)) return [];
  const seen = new Set<string>();
  const out: Hotspot[] = [];
  content.hotspots.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null) return;
    const h = raw as Record<string, unknown>;
    const id = asText(h.id) || `h-${index}`;
    if (seen.has(id)) return;
    seen.add(id);
    const x = fraction(h.x);
    const y = fraction(h.y);
    out.push({ id, x: x !== null && y !== null ? x : null, y: x !== null && y !== null ? y : null, label: asText(h.label), explanation: asText(h.explanation), scripture: h.scripture });
  });
  return out;
}

const HIT = 44;
const DOT = 30;

export function HotspotImage({ lessonId, level, content, variant = 'interactive' }: { lessonId: string; level: LearningLevel; content: Record<string, unknown>; variant?: 'interactive' | 'map' }) {
  const { spacing, colors, radius } = useTheme();
  const isMap = variant === 'map';
  const noun = isMap ? 'Marker' : 'Hotspot';
  const title = isMap ? asText(content.title).trim() : '';
  const mediaId = asText(content.mediaId);
  const alt = asText(content.altText);
  const caption = asText(content.caption);
  const source = asText(content.source);
  const hotspots = readHotspots(content);

  const remoteUri = mediaId ? lessonImageUrl(lessonId, mediaId, level) : null;
  const uri = useAssetUri(mediaId, remoteUri);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [ratio, setRatio] = useState(16 / 9);
  const [selected, setSelected] = useState<string | null>(null);

  const onLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = event.nativeEvent.source;
    if (width > 0 && height > 0) setRatio(width / height);
    setStatus('ready');
  };

  const imageFailed = !uri || status === 'failed';
  const toggle = (id: string) => setSelected((current) => (current === id ? null : id));

  return (
    <View style={{ gap: spacing.md }} accessible={false}>
      {title ? (
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {imageFailed ? (
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.xs }}>
          <AppText variant="bodySmall" color="textSecondary">
            {alt ? `${isMap ? 'Map or diagram' : 'Image'}: ${alt}` : `${isMap ? 'A map or diagram' : 'An image'} belongs here, but it could not be shown.`}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {hotspots.length > 0 ? `The ${noun.toLowerCase()}s are listed below. ` : ''}The image is shown when it is saved on this device or you are online.
          </AppText>
        </View>
      ) : (
        <View style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
          <Image
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={alt || caption || (isMap ? 'Map or diagram' : 'Interactive image')}
            onLoad={onLoad}
            onError={() => {
              if (uri !== remoteUri) reportBrokenAsset(mediaId);
              else setStatus('failed');
            }}
          />
          {status === 'ready'
            ? hotspots.map((h, index) =>
                h.x === null || h.y === null ? null : (
                  <Pressable
                    key={h.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${noun} ${index + 1}: ${h.label || 'no label'}`}
                    accessibilityState={{ selected: selected === h.id }}
                    onPress={() => toggle(h.id)}
                    style={{
                      position: 'absolute',
                      left: `${h.x * 100}%`,
                      top: `${h.y * 100}%`,
                      width: HIT,
                      height: HIT,
                      marginLeft: -HIT / 2,
                      marginTop: -HIT / 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <View
                      style={{
                        width: DOT,
                        height: DOT,
                        borderRadius: DOT / 2,
                        borderWidth: 2,
                        borderColor: colors.textPrimary,
                        backgroundColor: selected === h.id ? colors.primaryHighlight : colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
                        {index + 1}
                      </AppText>
                    </View>
                  </Pressable>
                ),
              )
            : null}
          {status === 'loading' ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AppText variant="caption" color="textMuted">
                Loading image…
              </AppText>
            </View>
          ) : null}
        </View>
      )}

      {hotspots.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {hotspots.map((h, index) => {
            const open = imageFailed || selected === h.id;
            return (
              <View
                key={h.id}
                style={{ borderRadius: radius.md, borderWidth: 1, borderColor: open ? colors.borderGold : colors.borderSubtle, backgroundColor: colors.surface }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${noun} ${index + 1}: ${h.label || 'no label'}`}
                  accessibilityState={{ expanded: open }}
                  onPress={() => toggle(h.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 48 }}>
                  <AppText variant="label" color="primaryHighlight" style={{ minWidth: 24 }}>
                    {index + 1}.
                  </AppText>
                  <View style={{ flex: 1 }}>
                    <AppText variant="body">{h.label || noun}</AppText>
                  </View>
                </Pressable>
                {open && (h.explanation || h.scripture) ? (
                  <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm }} accessibilityLiveRegion="polite">
                    <AppText variant="bodySmall" color="textSecondary">
                      {h.explanation}
                    </AppText>
                    <ScriptureLinks entries={h.scripture} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {caption ? (
        <AppText variant="bodySmall" color="textSecondary">
          {caption}
        </AppText>
      ) : null}
      {source ? (
        <AppText variant="caption" color="textMuted">
          Source: {source}
        </AppText>
      ) : null}
    </View>
  );
}
