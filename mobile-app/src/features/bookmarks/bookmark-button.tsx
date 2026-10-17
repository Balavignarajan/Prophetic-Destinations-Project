import { AppText, IconButton } from '@/components/ui';

/** The star that saves or unsaves the current item. Names its state for screen readers; the glyph also differs (filled/outline). */
export function BookmarkButton({ saved, noun, onToggle }: { saved: boolean; noun: string; onToggle: () => void }) {
  return (
    <IconButton accessibilityLabel={saved ? `Remove saved ${noun}` : `Save this ${noun}`} tone="ghost" onPress={onToggle}>
      <AppText variant="heading" color={saved ? 'primaryHighlight' : 'textMuted'}>
        {saved ? '★' : '☆'}
      </AppText>
    </IconButton>
  );
}
