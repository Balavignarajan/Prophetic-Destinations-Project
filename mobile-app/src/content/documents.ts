/**
 * About, Privacy Policy and Terms. NONE of this text has been approved yet (FINAL_FEATURE_COMPLIANCE_AUDIT.md, decision C-17), and
 * it must not be invented: privacy and legal wording makes claims about the real service. So the app ships the screens and a
 * place for the approved text, and until it arrives each screen says plainly that the text is not available yet.
 *
 * To supply approved text, either
 *  - fill in the `DOCUMENTS` entry below (bundled, works offline), or
 *  - set EXPO_PUBLIC_ABOUT_URL / EXPO_PUBLIC_PRIVACY_URL / EXPO_PUBLIC_TERMS_URL at build time: the screen then offers
 *    "Read online" (the specification allows a web fallback). Values must be http(s) URLs; nothing is hard-coded here.
 * Pure data and functions, no React: unit-tested with plain Node.
 */
export type DocumentKind = 'about' | 'privacy' | 'terms';

export type DocumentSection = { heading?: string; paragraphs: string[] };
export type AppDocument = { title: string; sections: DocumentSection[] };

export const DOCUMENT_TITLES: Record<DocumentKind, string> = {
  about: 'About Prophetic Destinations',
  privacy: 'Privacy Policy',
  terms: 'Terms',
};

/** Approved, bundled text. `null` = not provided yet. Do not put unapproved wording here. */
export const DOCUMENTS: Record<DocumentKind, AppDocument | null> = {
  about: null,
  privacy: null,
  terms: null,
};

/** An http(s) URL, trimmed, or null. */
export function parseHttpUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export type ResolvedDocument = {
  kind: DocumentKind;
  title: string;
  /** The approved bundled text, or null. */
  content: AppDocument | null;
  /** A configured online copy, or null. */
  onlineUrl: string | null;
  /** True when there is neither bundled text nor an online copy: the screen must say the text is not available yet. */
  missing: boolean;
};

/** Combines the bundled text and the configured URL for one document. `urls` are the raw configured values. */
export function resolveDocument(
  kind: DocumentKind,
  urls: Partial<Record<DocumentKind, string | undefined>>,
  documents: Record<DocumentKind, AppDocument | null> = DOCUMENTS,
): ResolvedDocument {
  const content = documents[kind];
  const onlineUrl = parseHttpUrl(urls[kind]);
  return { kind, title: DOCUMENT_TITLES[kind], content, onlineUrl, missing: content === null && onlineUrl === null };
}
