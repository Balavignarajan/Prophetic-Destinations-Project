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
}

/** The asset plus where its bytes are kept. Internal to the media module. */
export interface StoredMediaAsset extends MediaAsset {
  storageKey: string;
}
