'use client';

import React, { useId, useState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN, ROLES, ROLE_LABEL, ROLE_SUMMARY, generatePassword } from '../../lib/accounts';
import type { Role } from '../../lib/types';
import Icon from '../quizzes/icons';

/** The form controls the account dialogs share: the role choice, the password field and the message line under a field. */
export const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 disabled:bg-slate-50 disabled:opacity-60';
export const FIELD_ERROR = 'border-rose-400 focus:border-rose-500 focus:ring-rose-300';
export const LABEL = 'block text-sm font-semibold text-slate-900';
export const SECONDARY_BUTTON = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
export const PRIMARY_BUTTON = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

export const Spinner = () => <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />;

export const FieldMessage = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <p id={id} className="flex items-start gap-1 text-xs font-medium text-rose-800">
    <Icon name="alert" className="mt-px h-3.5 w-3.5" />
    <span>{children}</span>
  </p>
);

/** A failure at the top of a dialog. The dialog stays open and nothing typed is lost. */
export const ErrorBanner = ({ children }: { children: React.ReactNode }) => (
  <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
    {children}
  </div>
);

/**
 * The three roles as three cards (a real radio group, so the arrow keys work). The chosen one is shown by a gold border, a filled dot and bold text, never by colour alone, and each says in a
 * line what the role can do.
 */
export function RoleChoice({ value, onChange, disabled, name, legend }: { value: Role; onChange: (role: Role) => void; disabled?: boolean; name: string; legend: string }) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className={LABEL}>{legend}</legend>
      <div className="grid gap-2">
        {ROLES.map((role) => {
          const selected = value === role;
          return (
            <label
              key={role}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-focus-visible:ring-2 has-focus-visible:ring-amber-500 ${selected ? 'border-amber-500 bg-amber-50/60' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
            >
              <input type="radio" name={name} value={role} checked={selected} onChange={() => onChange(role)} className="sr-only" />
              <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-amber-600' : 'border-slate-400'}`}>
                {selected && <span className="h-2 w-2 rounded-full bg-amber-600" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${selected ? 'font-bold' : 'font-semibold'} text-slate-900`}>{ROLE_LABEL[role]}</span>
                <span className="block text-xs text-slate-700">{ROLE_SUMMARY[role]}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * A temporary-password field. It is hidden by default, with a Show / Hide button, and "Generate" fills in a random password that satisfies the server's rule (12 to 128 characters) and shows it, so
 * the person creating the account can read it out. The password is never written anywhere by this screen: it lives in this field until the form is sent.
 */
export function PasswordField({
  label,
  value,
  onChange,
  disabled,
  error,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error: string | null;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {label} <span className="text-rose-700">*</span>
        </label>
        <span className={`text-xs tabular-nums ${value.length > PASSWORD_MAX ? 'font-semibold text-rose-800' : 'text-slate-600'}`} aria-hidden="true">
          {value.length} / {PASSWORD_MAX}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          spellCheck={false}
          data-autofocus={autoFocus ? '' : undefined}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help${error ? ` ${id}-msg` : ''}`}
          placeholder={`${PASSWORD_MIN} to ${PASSWORD_MAX} characters`}
          className={`${FIELD} font-mono ${error ? FIELD_ERROR : ''}`}
        />
        <button type="button" onClick={() => setShown((v) => !v)} disabled={disabled} aria-pressed={shown} className={`${SECONDARY_BUTTON} shrink-0 px-3`}>
          {shown ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(generatePassword());
            setShown(true);
          }}
          className={`${SECONDARY_BUTTON} shrink-0 px-3`}
        >
          Generate
        </button>
      </div>
      {error && <FieldMessage id={`${id}-msg`}>{error}</FieldMessage>}
      <p id={`${id}-help`} className="text-xs text-slate-700">
        {hint ?? 'The person must choose a new password the first time they sign in.'}
      </p>
    </div>
  );
}
