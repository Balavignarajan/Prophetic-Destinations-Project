/** A stored media asset as the rest of the system sees it. It never carries the storage key or any path. */
export interface MediaAsset {
  id: string;
  /** The name the uploader's file had, cleaned for display. Never used as a path. */
  originalFilename: string;
  /** Decided from the file's own bytes, not from what the client claimed. */
  contentType: string;
  sizeBytes: number;
  /** SHA-256 of the stored bytes (hex). */
  sha256: string;
  createdBy: string;
  createdAt: Date;
  /** Optional descriptive metadata (domain/metadata.ts). `rightsNotes` is internal and only ever returned by the admin API. */
  title: string | null;
  altText: string | null;
  caption: string | null;
  source: string | null;
  rightsNotes: string | null;
  tags: string[];
  /** Concurrency counter of the descriptive metadata; rises only when it really changes. */
  metadataVersion: number;
}

/** The asset plus where its bytes are kept. Internal to the media module. */
export interface StoredMediaAsset extends MediaAsset {
  storageKey: string;
}
