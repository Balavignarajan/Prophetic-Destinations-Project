'use client';

import React from 'react';
import { type AccountCounts, ROLE_LABEL, initialsOf } from '../../lib/accounts';
import type { Role } from '../../lib/types';

/**
 * The small pieces the Admin Accounts screen is built from: the avatar, the role and status badges and the four summary cards. They only draw what they are given. Every badge says its
 * meaning in words (never colour alone).
 */
const ROLE_STYLE: Record<Role, string> = {
  ADMIN: 'border-slate-900 bg-slate-900 text-white',
  EDITOR: 'border-amber-200 bg-amber-50 text-amber-900',
  REVIEWER: 'border-sky-200 bg-sky-50 text-sky-900',
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${ROLE_STYLE[role]}`}>{ROLE_LABEL[role]}</span>;
}

export function AccountStatusBadge({ status }: { status: 'ACTIVE' | 'DISABLED' }) {
  return status === 'ACTIVE' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-rose-600" />
      Disabled
    </span>
  );
}

export function YouBadge() {
  return <span className="rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-800">You</span>;
}

/** A round avatar with the initials of the address. Decorative: the address itself is always written next to it. */
export function Avatar({ email, role, size = 'md' }: { email: string; role: Role; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border font-semibold ${size === 'lg' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm'} ${
        role === 'ADMIN' ? 'border-slate-900 bg-slate-900 text-amber-200' : 'border-slate-200 bg-slate-100 text-slate-700'
      }`}
    >
      {initialsOf(email)}
    </span>
  );
}

function Stat({ label, value, note, tone = 'plain' }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'plain' | 'good' | 'warn' | 'gold' }) {
  const border = tone === 'good' ? 'border-emerald-200' : tone === 'warn' ? 'border-rose-200' : tone === 'gold' ? 'border-amber-200' : 'border-slate-200';
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-xs ${border}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-600">{note}</p>}
    </div>
  );
}

/** Total staff, active, disabled and administrators, counted over every account the screen has loaded. `complete` is false only if the list could not be loaded in full. */
export function SummaryCards({ counts, complete }: { counts: AccountCounts; complete: boolean }) {
  const approx = (n: number) => (complete ? String(n) : `${n}+`);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Staff account summary">
      <Stat label="Total Staff" value={approx(counts.total)} note={complete ? 'All staff accounts' : 'Among the accounts loaded'} />
      <Stat label="Active Accounts" value={approx(counts.active)} note="Can sign in" tone="good" />
      <Stat label="Disabled Accounts" value={approx(counts.disabled)} note="Sign-in blocked" tone={counts.disabled > 0 ? 'warn' : 'plain'} />
      <Stat label="Administrators" value={approx(counts.admins)} note={`${approx(counts.activeAdmins)} active`} tone="gold" />
    </div>
  );
}
