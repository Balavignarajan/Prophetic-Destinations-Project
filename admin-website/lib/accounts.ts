import { api } from './api';
import type { AccountEvent, AccountItem, ApiErrorPayload, Role } from './types';

/**
 * Typed access to the staff-account API (`/admin/accounts`, ADMIN only; backend/src/modules/identity is the source of truth) and the pure helpers of the Admin Accounts screen:
 * filtering, sorting, which actions an account allows, the words for audit events and for API failures. Nothing here decides anything the server does not decide again: every
 * rule below (not your own account, never the last active ADMIN) is also enforced by the backend inside its transaction, and these helpers only keep the screen from offering what would be refused.
 */
export const ROLES: readonly Role[] = ['ADMIN', 'EDITOR', 'REVIEWER'];
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', EDITOR: 'Editor', REVIEWER: 'Reviewer' };

/** One line per role. Copied from what the roles do in the backend (assessment-workflow.ts: the editor submits, the reviewer approves or asks for changes, the admin does everything and alone publishes). */
export const ROLE_SUMMARY: Record<Role, string> = {
  ADMIN: 'Full system governance and publishing. Manages staff accounts and alone publishes and unpublishes content.',
  EDITOR: 'Authors and edits curriculum and submits it for review.',
  REVIEWER: 'Reviews submitted work, requests changes and approves.',
};

/** Passwords the backend accepts (password-policy.ts): 12 to 128 characters. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const EMAIL_MAX = 320;

export type StatusFilter = 'ALL' | 'ACTIVE' | 'DISABLED';
export type RoleFilter = 'ALL' | Role;
export type SortKey = 'NEWEST' | 'OLDEST' | 'EMAIL_ASC' | 'EMAIL_DESC';

export const SORT_LABEL: Record<SortKey, string> = { NEWEST: 'Newest first', OLDEST: 'Oldest first', EMAIL_ASC: 'Email A–Z', EMAIL_DESC: 'Email Z–A' };

export interface AccountFilters {
  search: string;
  role: RoleFilter;
  status: StatusFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: AccountFilters = { search: '', role: 'ALL', status: 'ALL', sort: 'NEWEST' };

export const hasActiveFilters = (f: AccountFilters): boolean => f.search.trim() !== '' || f.role !== 'ALL' || f.status !== 'ALL';

// ------------------------------------------------------------------------------------------------------------------------------------ requests

interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const PAGE = 100;
/** A safety stop: 50 pages of 100 is far more staff than this system will ever have. */
const MAX_PAGES = 50;

export const accountsApi = {
  /**
   * EVERY staff account, fetched page by page (the list route takes at most 200 at a time). Search, filters, sorting and the summary counts then work over the complete
   * list, so nothing silently covers only a first page. `complete` is false only if the safety stop was reached.
   */
  async listAll(): Promise<{ items: AccountItem[]; total: number; complete: boolean }> {
    const items: AccountItem[] = [];
    const seen = new Set<string>();
    let total = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = await api.request<Page<AccountItem>>(`/admin/accounts?limit=${PAGE}&offset=${items.length}`);
      total = res.total;
      for (const item of res.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
      if (res.items.length === 0 || items.length >= total) return { items, total, complete: true };
    }
    return { items, total, complete: items.length >= total };
  },
  events: (id: string, offset: number, limit = 25) => api.request<Page<AccountEvent>>(`/admin/accounts/${id}/events?limit=${limit}&offset=${offset}`),
  create: (body: { email: string; role: Role; temporaryPassword: string }) => api.request<AccountItem>('/admin/accounts', { method: 'POST', ...json(body) }),
  changeRole: (id: string, role: Role) => api.request<AccountItem>(`/admin/accounts/${id}/role`, { method: 'PUT', ...json({ role }) }),
  resetPassword: (id: string, temporaryPassword: string) => api.request<AccountItem>(`/admin/accounts/${id}/password-reset`, { method: 'POST', ...json({ temporaryPassword }) }),
  disable: (id: string) => api.request<AccountItem>(`/admin/accounts/${id}/disable`, { method: 'POST' }),
  enable: (id: string) => api.request<AccountItem>(`/admin/accounts/${id}/enable`, { method: 'POST' }),
  /** Permanently deletes (erases) the account. Never retried automatically. */
  remove: (id: string) => api.request<{ id: string; deleted: true; deletedAt: string }>(`/admin/accounts/${id}`, { method: 'DELETE' }),
};

// ------------------------------------------------------------------------------------------------------------------------------------ errors

type ApiLikeError = { message?: string; status?: number; payload?: ApiErrorPayload };

export interface FriendlyError {
  message: string;
  status?: number;
  /** The server's machine reason, e.g. LAST_ACTIVE_ADMIN. */
  reason?: string;
}

/**
 * The words for a failed request. The server's own message is kept whenever it says what is wrong (it never contains a password, a hash or a token); only the cases where
 * the screen can say something more useful are rewritten: your role, an account that is already gone, and a server that cannot be reached.
 */
export function accountError(err: unknown, fallback: string): FriendlyError {
  const e = err as ApiLikeError;
  const status = e?.status;
  const reason = typeof e?.payload?.details?.reason === 'string' ? e.payload.details.reason : undefined;
  if (status === undefined && e?.message) return { message: 'The server could not be reached. Check your connection and try again. Nothing was changed.', reason };
  if (status === 403) return { message: 'Your account is not allowed to do this.', status, reason };
  if (status === 404) return { message: 'This account no longer exists. It may already have been deleted. The list has been refreshed.', status, reason };
  const base = e?.payload?.message ?? e?.message ?? fallback;
  const details = e?.payload?.details as unknown;
  const extra = Array.isArray(details) ? details.filter((d): d is string => typeof d === 'string') : [];
  return { message: extra.length > 0 ? `${base}: ${extra.join('; ')}.` : base, status, reason };
}

// ------------------------------------------------------------------------------------------------------------------------------------ the account itself

const isLetterOrDigit = (ch: string): boolean => ch.toLowerCase() !== ch.toUpperCase() || (ch >= '0' && ch <= '9');

/** Up to two letters from the part of the address before the "@": the first letters of its first two words (split at ".", "_", "-", "+"), or its first two characters. */
export function initialsOf(email: string): string {
  const local = email.split('@')[0] ?? '';
  const words: string[] = [];
  let current = '';
  for (const ch of local) {
    if (isLetterOrDigit(ch)) current += ch;
    else {
      if (current) words.push(current);
      current = '';
    }
  }
  if (current) words.push(current);
  const letters = words.length >= 2 ? `${Array.from(words[0])[0]}${Array.from(words[1])[0]}` : Array.from(words[0] ?? '').slice(0, 2).join('');
  return (letters || '?').toUpperCase();
}

const hasWhitespace = (value: string): boolean => Array.from(value).some((ch) => ch.trim() === '');

/** The same shape test the server applies (something@something.something, no spaces); the server decides. */
export function isEmailShape(value: string): boolean {
  const v = value.trim();
  if (v === '' || v.length > EMAIL_MAX || hasWhitespace(v)) return false;
  const at = v.indexOf('@');
  if (at < 1 || v.indexOf('@', at + 1) >= 0) return false;
  const domain = v.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

export const formatDate = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
export const formatDateTime = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** A random password that satisfies the policy (24 characters, letters and digits, from the browser's secure random source). */
export function generatePassword(length = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}

// ------------------------------------------------------------------------------------------------------------------------------------ list: counts, filters, sorting

export interface AccountCounts {
  total: number;
  active: number;
  disabled: number;
  admins: number;
  activeAdmins: number;
}

export function countAccounts(accounts: readonly AccountItem[]): AccountCounts {
  return {
    total: accounts.length,
    active: accounts.filter((a) => a.status === 'ACTIVE').length,
    disabled: accounts.filter((a) => a.status === 'DISABLED').length,
    admins: accounts.filter((a) => a.role === 'ADMIN').length,
    activeAdmins: accounts.filter((a) => a.role === 'ADMIN' && a.status === 'ACTIVE').length,
  };
}

const byEmail = (a: AccountItem, b: AccountItem): number => a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
const byCreated = (a: AccountItem, b: AccountItem): number => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

/** Search (case-insensitive, over the e-mail address), the two filters and the sort order, together. */
export function filterAccounts(accounts: readonly AccountItem[], f: AccountFilters): AccountItem[] {
  const term = f.search.trim().toLowerCase();
  const matches = accounts.filter((a) => (term === '' || a.email.toLowerCase().includes(term)) && (f.role === 'ALL' || a.role === f.role) && (f.status === 'ALL' || a.status === f.status));
  const sorted = [...matches];
  if (f.sort === 'NEWEST') sorted.sort((a, b) => byCreated(b, a) || byEmail(a, b));
  else if (f.sort === 'OLDEST') sorted.sort((a, b) => byCreated(a, b) || byEmail(a, b));
  else if (f.sort === 'EMAIL_ASC') sorted.sort(byEmail);
  else sorted.sort((a, b) => byEmail(b, a));
  return sorted;
}

// ------------------------------------------------------------------------------------------------------------------------------------ actions

export type AccountActionKey = 'role' | 'reset' | 'toggle' | 'delete';

export interface AccountAction {
  key: AccountActionKey;
  label: string;
  /** The short second line: what it does, or why it is not available. */
  hint: string;
  disabled: boolean;
  danger?: boolean;
}

export interface ActionContext {
  currentUserId: string;
  activeAdmins: number;
  /** Every account is loaded, so "the only active admin" can be stated as a fact. */
  complete: boolean;
}

export const isLastActiveAdmin = (account: AccountItem, ctx: Pick<ActionContext, 'activeAdmins' | 'complete'>): boolean =>
  ctx.complete && account.role === 'ADMIN' && account.status === 'ACTIVE' && ctx.activeAdmins === 1;

/**
 * What can be done to one account from the menu and the details panel (viewing is always possible and not listed). An action that the rules forbid is returned DISABLED, with
 * the reason as its hint, instead of vanishing: not your own account (change your own password from your profile), never the last active admin. The server refuses these too.
 */
export function accountActions(account: AccountItem, ctx: ActionContext): AccountAction[] {
  const self = account.id === ctx.currentUserId;
  const last = isLastActiveAdmin(account, ctx);
  const SELF = 'Not available for your own account';
  const LAST = 'This is the only active administrator';
  const disabled = account.status === 'DISABLED';
  return [
    { key: 'role', label: 'Change Role', hint: self ? SELF : last ? LAST : 'Admin, Editor or Reviewer', disabled: self || last },
    { key: 'reset', label: 'Reset Credentials', hint: self ? SELF : 'Set a temporary password and end all sessions', disabled: self },
    {
      key: 'toggle',
      label: disabled ? 'Enable Account' : 'Disable Account',
      hint: self ? SELF : disabled ? 'Restore sign-in' : last ? LAST : 'Block sign-in, keep all records',
      disabled: self || (!disabled && last),
    },
    { key: 'delete', label: 'Delete Permanently', hint: self ? 'You cannot delete your own account' : last ? LAST : 'Erase the account; this cannot be undone', disabled: self || last, danger: true },
  ];
}

// ------------------------------------------------------------------------------------------------------------------------------------ audit trail

export interface EventWords {
  title: string;
  detail?: string;
}

const roleName = (value: string | null): string => (value && value in ROLE_LABEL ? ROLE_LABEL[value as Role] : (value ?? '—'));

/** The stored event names turned into sentences. The stored data is not changed. */
export function describeEvent(event: AccountEvent): EventWords {
  switch (event.action) {
    case 'ACCOUNT_CREATED':
      return { title: 'Account created', detail: event.toValue ? `Role: ${roleName(event.toValue)}` : undefined };
    case 'ROLE_CHANGED':
      return { title: 'Role changed', detail: `${roleName(event.fromValue)} → ${roleName(event.toValue)}` };
    case 'ACCOUNT_DISABLED':
      return { title: 'Account disabled', detail: 'Sign-in blocked and all sessions ended.' };
    case 'ACCOUNT_ENABLED':
      return { title: 'Account enabled', detail: 'Sign-in restored.' };
    case 'PASSWORD_RESET_REQUIRED':
      return { title: 'Credentials reset by an administrator', detail: 'A temporary password was set and all sessions ended. A new password is required at the next sign-in.' };
    case 'PASSWORD_CHANGED':
      return { title: 'Password changed', detail: 'All other sessions ended.' };
    case 'ACCOUNT_DELETED':
      return { title: 'Account deleted permanently', detail: event.fromValue ? `Former role: ${roleName(event.fromValue)}` : undefined };
    default:
      return { title: event.action.split('_').join(' ').toLowerCase() };
  }
}

/** Who did it, in words: you, the account itself, another staff member by e-mail, or an account that is no longer listed. */
export function actorLabel(event: AccountEvent, accounts: readonly AccountItem[], currentUserId: string): string {
  if (event.actorAdminId === currentUserId) return 'You';
  if (event.actorAdminId === event.subjectAdminId) return 'The account itself';
  return accounts.find((a) => a.id === event.actorAdminId)?.email ?? 'A staff account that is no longer listed';
}
