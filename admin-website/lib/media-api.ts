import { api } from './api';
import type { MediaAsset } from './types';

export interface MediaPage {
  items: MediaAsset[];
  total: number;
  limit: number;
  offset: number;
}

/** One page of the media library, optionally filtered by part of the file name. */
export function listMedia(offset: number, limit: number, search: string, contentType?: string): Promise<MediaPage> {
  const q = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';
  const type = contentType ? `&contentType=${encodeURIComponent(contentType)}` : '';
  return api.request<MediaPage>(`/admin/media?limit=${limit}&offset=${offset}${q}${type}`);
}

/**
 * The ONE upload path: the Media Library page and the lesson editor both call this, so every image becomes the same kind of
 * media asset record in the same storage, whichever screen it was added from.
 */
export function uploadMedia(file: File): Promise<MediaAsset> {
  const body = new FormData();
  body.append('file', file);
  return api.request<MediaAsset>('/admin/media', { method: 'POST', body });
}

export interface MediaDetailsInput {
  title: string;
  altText: string;
  caption: string;
  source: string;
  rightsNotes: string;
  tags: string[];
}

/** Saves the image's details (never the file). `version` is the one the editor last saw; a stale one is refused (409). */
export function updateMediaDetails(id: string, version: number, details: MediaDetailsInput): Promise<MediaAsset> {
  return api.request<MediaAsset>(`/admin/media/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, ...details }),
  });
}

export interface UsedByLesson {
  lessonId: string;
  title: string;
  courseId: string | null;
  courseTitle: string | null;
  moduleId: string | null;
  moduleTitle: string | null;
  uses: string[];
  levels?: string[];
}
export interface MediaUsage {
  working: { lessons: UsedByLesson[]; courses: { courseId: string; title: string }[] };
  published: { lessons: UsedByLesson[]; courses: { courseId: string; title: string }[] };
  truncated: { workingLessons: boolean; publishedLessons: boolean; workingCourses: boolean; publishedCourses: boolean };
  limit: number;
  totals: { draftLessons: number; publishedLessons: number; draftCourses: number; publishedCourses: number };
}

/** Where the image is used (working and published), cut at `limit` per group; the totals are always exact. */
export function getMediaUsage(id: string, limit: number): Promise<MediaUsage> {
  return api.request<MediaUsage>(`/admin/media/${id}/usage?limit=${limit}`);
}

/**
 * A library default for a content field: used ONLY when the field is empty, so text an author already wrote is never replaced. The author can
 * still edit the copied text; it is a copy, not a link to the library entry.
 */
export function fillIfEmpty(current: string, libraryDefault: string | null | undefined): string {
  return current.trim() ? current : (libraryDefault ?? current);
}

export function deleteMedia(id: string): Promise<unknown> {
  return api.request(`/admin/media/${id}`, { method: 'DELETE' });
}
