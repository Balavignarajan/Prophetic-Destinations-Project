'use client';

import React, { useId, useRef, useState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN, ROLE_LABEL, ROLE_SUMMARY, accountError, accountsApi, isEmailShape } from '../../lib/accounts';
import type { AccountItem, Role } from '../../lib/types';
import { Modal } from '../ui';
import { ErrorBanner, FIELD, FIELD_ERROR, FieldMessage, LABEL, PRIMARY_BUTTON, PasswordField, RoleChoice, SECONDARY_BUTTON, Spinner } from './AccountFields';
import { RoleBadge } from './AccountParts';

/**
 * The dialogs of the Admin Accounts screen. Each one is mounted only while it is open (so it always starts empty), keeps the dialog open and everything typed when the server refuses,
 * ignores a second press while its request is running, and never closes or says "done" until the server has answered. The server applies every rule again: these dialogs only explain.
 */

const PASSWORD_PROBLEM = (password: string): string | null =>
  password.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters (${password.length} so far).` : password.length > PASSWORD_MAX ? `Use at most ${PASSWORD_MAX} characters.` : null;

// ============================================================================================================================ add

export function CreateAccountDialog({ existingEmails, onClose, onCreated }: { existingEmails: ReadonlySet<string>; onClose: () => void; onCreated: (account: AccountItem) => void }) {
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EDITOR');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const trimmed = email.trim();
  const emailProblem = trimmed === '' ? 'Enter the staff member’s email address.' : !isEmailShape(trimmed) ? 'Enter a valid email address, like name@example.org.' : existingEmails.has(trimmed.toLowerCase()) ? 'A staff account with this email address already exists.' : null;
  const passwordProblem = PASSWORD_PROBLEM(password);
  const showEmailProblem = (submitted || touched) && emailProblem;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (sending.current || emailProblem || passwordProblem) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const created = await accountsApi.create({ email: trimmed, role, temporaryPassword: password });
      onCreated(created);
    } catch (err: unknown) {
      setError(accountError(err, 'The account could not be created.').message + ' Nothing was created.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title="Add Staff Account" description="Create a staff account with a temporary password. The person must replace it at their first sign-in." maxWidth="lg">
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <div className="space-y-1.5">
          <label htmlFor={emailId} className={LABEL}>
            Email address <span className="text-rose-700">*</span>
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="off"
            data-autofocus=""
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showEmailProblem ? true : undefined}
            aria-describedby={showEmailProblem ? `${emailId}-msg` : undefined}
            placeholder="editor@propheticdestinations.org"
            className={`${FIELD} ${showEmailProblem ? FIELD_ERROR : ''}`}
          />
          {showEmailProblem && <FieldMessage id={`${emailId}-msg`}>{emailProblem}</FieldMessage>}
        </div>

        <RoleChoice legend="Role" name="new-account-role" value={role} onChange={setRole} disabled={busy} />

        <PasswordField label="Temporary password" value={password} onChange={setPassword} disabled={busy} error={submitted ? passwordProblem : null} />

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY_BUTTON}>
            {busy && <Spinner />}
            {busy ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================================================================ role

export function ChangeRoleDialog({ account, onClose, onChanged }: { account: AccountItem; onClose: () => void; onChanged: (account: AccountItem) => void }) {
  const [role, setRole] = useState<Role>(account.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const same = role === account.role;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending.current || same) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      onChanged(await accountsApi.changeRole(account.id, role));
    } catch (err: unknown) {
      setError(accountError(err, 'The role could not be changed.').message + ' The role was not changed.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title="Change Role" description="Choose what this staff member is allowed to do." maxWidth="lg">
      <form onSubmit={submit} className="space-y-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <dt className="font-semibold text-slate-800">Staff member</dt>
          <dd className="min-w-0 break-all font-medium text-slate-900">{account.email}</dd>
          <dt className="font-semibold text-slate-800">Current role</dt>
          <dd>
            <RoleBadge role={account.role} />
          </dd>
        </dl>

        <RoleChoice legend="New role" name="change-role" value={role} onChange={setRole} disabled={busy} />

        <div className="space-y-1.5" aria-live="polite">
          {!same && (
            <p className="text-sm text-slate-900">
              <span className="font-semibold">{ROLE_LABEL[role]}: </span>
              {ROLE_SUMMARY[role]}
            </p>
          )}
          {account.role === 'ADMIN' && role !== 'ADMIN' && (
            <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-950">
              This account will lose administrator access: it will no longer publish content or manage staff accounts.
            </p>
          )}
          {account.role !== 'ADMIN' && role === 'ADMIN' && (
            <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-950">
              This account will gain full administrator access, including publishing content and managing staff accounts.
            </p>
          )}
          {same && <p className="text-sm text-slate-700">Choose a different role to continue.</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={busy || same} aria-busy={busy} className={PRIMARY_BUTTON}>
            {busy && <Spinner />}
            {busy ? 'Changing…' : `Change to ${ROLE_LABEL[role]}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================================================================ disable / enable

/**
 * Disable or enable one account, with what each really does. Disabling blocks sign-in and ends every session at once (the account, its role and everything it authored are kept); enabling
 * restores sign-in with the password the account already has. Cancel has the first focus when disabling.
 */
export function StatusChangeDialog({ account, onClose, onDone }: { account: AccountItem; onClose: () => void; onDone: (account: AccountItem) => void }) {
  const disabling = account.status === 'ACTIVE';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const confirm = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      onDone(disabling ? await accountsApi.disable(account.id) : await accountsApi.enable(account.id));
    } catch (err: unknown) {
      setError(`${accountError(err, `The account could not be ${disabling ? 'disabled' : 'enabled'}.`).message} The account was not changed.`);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title={disabling ? 'Disable this account?' : 'Enable this account?'} maxWidth="lg">
      <div className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p className="break-all rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm font-semibold text-slate-900">{account.email}</p>
        {disabling ? (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-900">
            <li>
              <strong>The account is blocked from signing in</strong>, and every session it has ends immediately.
            </li>
            <li>Nothing is deleted: the account, its role and everything it created or published are kept.</li>
            <li>You can enable it again at any time. The only active administrator cannot be disabled.</li>
          </ul>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-900">
            <li>
              <strong>The account can sign in again</strong> straight away, with the password it already has.
            </li>
            <li>It keeps its current role ({ROLE_LABEL[account.role]}). A pending password change still has to be done at the next sign-in.</li>
          </ul>
        )}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={busy} data-autofocus={disabling ? '' : undefined} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            aria-busy={busy}
            className={disabling ? 'inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400' : PRIMARY_BUTTON}
          >
            {busy && <Spinner />}
            {busy ? (disabling ? 'Disabling…' : 'Enabling…') : disabling ? 'Disable Account' : 'Enable Account'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================================================================ credentials

export function ResetCredentialsDialog({ account, onClose, onDone }: { account: AccountItem; onClose: () => void; onDone: (account: AccountItem) => void }) {
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const problem = PASSWORD_PROBLEM(password);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (sending.current || problem) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      onDone(await accountsApi.resetPassword(account.id, password));
    } catch (err: unknown) {
      setError(accountError(err, 'The credentials could not be reset.').message + ' The password was not changed.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title="Reset Credentials" description={`Set a temporary password for ${account.email}.`} maxWidth="lg">
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <ul className="list-disc space-y-1 rounded-xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-4 text-sm text-slate-900">
          <li>The current password stops working at once.</li>
          <li>Every session this account has ends: it is signed out everywhere.</li>
          <li>At the next sign-in the person must choose a new password before doing anything else.</li>
        </ul>
        <PasswordField label="Temporary password" value={password} onChange={setPassword} disabled={busy} error={submitted ? problem : null} autoFocus hint="Share it with the person directly. It is not shown again after you set it." />
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY_BUTTON}>
            {busy && <Spinner />}
            {busy ? 'Setting…' : 'Set Temporary Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================================================================ delete

/**
 * "Permanently delete this staff account?" The Admin has to type the account's exact email address before the final button works, Cancel has the first focus, nothing is sent on the first
 * click, and a failure keeps the dialog open with the reason. The request is never repeated automatically; if the connection fails before the server answers, the dialog says it is not
 * known whether the account was deleted and offers to check the list.
 */
export function DeleteAccountDialog({ account, onClose, onDeleted, onCheckList }: { account: AccountItem; onClose: () => void; onDeleted: (account: AccountItem) => void; onCheckList: () => void }) {
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [gone, setGone] = useState(false);
  const sending = useRef(false);
  const matches = typed.trim() === account.email;

  const confirm = async () => {
    if (sending.current || !matches || gone) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setUncertain(false);
    try {
      await accountsApi.remove(account.id);
      onDeleted(account);
    } catch (err: unknown) {
      const friendly = accountError(err, 'The account could not be deleted.');
      if (friendly.status === undefined) {
        setUncertain(true);
        setError('The connection failed before the server answered, so it is not known whether the account was deleted. Check the list before trying again.');
      } else if (friendly.status === 404) {
        // Already gone (deleted by someone else a moment ago): the list is refreshed behind this dialog, which stays to say so.
        setGone(true);
        setError(friendly.message);
        onCheckList();
      } else {
        setError(`${friendly.message} The account was not deleted.`);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title="Permanently delete this staff account?" maxWidth="lg">
      <div className="space-y-5">
        {error && (
          <ErrorBanner>
            <p>{error}</p>
            {uncertain && (
              <button type="button" onClick={onCheckList} className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Refresh the list
              </button>
            )}
          </ErrorBanner>
        )}

        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-900">Account to delete</p>
          <p className="mt-0.5 break-all font-mono text-sm font-semibold text-slate-900">{account.email}</p>
          <p className="mt-1 text-xs text-slate-800">
            {ROLE_LABEL[account.role]} · {account.status === 'ACTIVE' ? 'Active' : 'Disabled'}
          </p>
        </div>

        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-900">
          <li>
            <strong>The account loses all access at once</strong> and every session it has ends.
          </li>
          <li>
            <strong>This cannot be undone.</strong> The email address and the sign-in credentials are erased and cannot be recovered.
          </li>
          <li>Lessons, courses, quizzes, assessments and media this person created or published are not deleted or changed.</li>
          <li>A record without the email address is kept so that published content and the audit history stay consistent. The address can be used for a new account later.</li>
        </ul>

        <div className="space-y-1.5">
          <label htmlFor={inputId} className={LABEL}>
            Type <span className="break-all font-mono">{account.email}</span> to confirm
          </label>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            disabled={busy || gone}
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby={`${inputId}-state`}
            className={FIELD}
          />
          <p id={`${inputId}-state`} className={`text-xs ${typed === '' || matches ? 'text-slate-700' : 'font-medium text-rose-800'}`} aria-live="polite">
            {typed === '' ? 'The Delete Permanently button stays off until the address matches exactly.' : matches ? 'The address matches.' : 'This does not match the address above.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {busy && (
            <p role="status" className="mr-auto text-sm text-slate-800">
              Deleting the account…
            </p>
          )}
          <button type="button" onClick={onClose} disabled={busy} data-autofocus="" className={SECONDARY_BUTTON}>
            {gone ? 'Close' : 'Cancel'}
          </button>
          {!gone && (
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy || !matches}
              aria-busy={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              {busy && <Spinner />}
              {busy ? 'Deleting…' : 'Delete Permanently'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
