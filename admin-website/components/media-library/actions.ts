import { api } from '../../lib/api';
import type { MediaAsset } from '../../lib/types';

/** Copies text to the clipboard. Resolves to whether it worked (a browser may refuse, for example on an insecure page); nothing is thrown. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the older way
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Saves the original file to the computer. The media route needs the administrator's credentials, so the bytes are fetched with them and handed to the browser as a temporary local file
 * (no address of the file is ever shown, copied or stored). Throws when the file cannot be fetched.
 */
export async function downloadOriginal(asset: MediaAsset): Promise<void> {
  const res = await api.fetchRaw(`/admin/media/${asset.id}/content`);
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = asset.originalFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
