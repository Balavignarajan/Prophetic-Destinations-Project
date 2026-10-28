'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { type AccountActionKey, type ActionContext, ROLE_LABEL, ROLE_SUMMARY, accountActions, formatDateTime } from '../../lib/accounts';
import type { AccountItem } from '../../lib/types';
import Icon from '../quizzes/icons';
import AccountAuditTrail from './AccountAuditTrail';
import type { DrawerSection } from './AccountList';
import { AccountStatusBadge, Avatar, RoleBadge, YouBadge } from './AccountParts';

/**
 * The details panel of one staff account, sliding in from the right: Account Information (address, role, status, when it was created and last changed, whether a password change is
 * pending), Security & Access (what the role allows, what the status means, and the same actions as the menu, with the same rules) and the Audit Trail. It shows only what the account
 * API and the audit trail actually hold; no sign-in times, addresses or devices are recorded, so none are shown.
 *
 * It is a modal dialog: focus moves in when it opens and returns to what opened it, Tab stays inside, Escape and the backdrop close it. A dialog opened FROM it (change role, delete...)
 * sits above it and owns Escape and Tab while it is open: `dialogOpen` tells the panel to leave those keys alone. Motion respects reduced-motion.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-slate-800">{label}</dt>
      <dd className="min-w-0 break-words text-slate-900">{children}</dd>
    </>
  );
}

export default function AccountDrawer({
  account,
  accounts,
  currentUserId,
  context,
  section,
  eventsVersion,
  dialogOpen,
  onClose,
  onAction,
}: {
  account: AccountItem;
  accounts: readonly AccountItem[];
  currentUserId: string;
  context: ActionContext;
  /** Bring this part forward when the panel opens. */
  section?: DrawerSection;
  /** Bumped by the page after something was done to the account, so the trail is read again. */
  eventsVersion: number;
  /** A dialog is open above the panel. */
  dialogOpen: boolean;
  onClose: () => void;
  onAction: (key: AccountActionKey, account: AccountItem) => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const auditHeading = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dialogOpenRef = useRef(dialogOpen);
  dialogOpenRef.current = dialogOpen;
  const [entered, setEntered] = useState(false);
  const isSelf = account.id === currentUserId;
  const actions = accountActions(account, context);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
      if (section === 'audit' && auditHeading.current) {
        auditHeading.current.scrollIntoView({ block: 'start' });
        auditHeading.current.focus({ preventScroll: true });
      } else {
        closeButton.current?.focus();
      }
    });
    const onKey = (event: KeyboardEvent) => {
      if (dialogOpenRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected) opener.focus();
    };
    // Once per opening: the panel is keyed by the account, so a different account is a new opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 motion-reduce:transition-none ${entered ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar email={account.email} role={account.role} size="lg" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">Staff account</p>
              <h2 id={titleId} className="flex flex-wrap items-center gap-x-2 text-lg font-semibold text-slate-900">
                <span className="break-all">{account.email}</span>
                {isSelf && <YouBadge />}
              </h2>
            </div>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close account details" title="Close (Escape)" className="shrink-0 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <section aria-labelledby={`${titleId}-info`} className="space-y-3">
            <h3 id={`${titleId}-info`} className="text-base font-semibold text-slate-900">
              Account Information
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <Row label="Email">{account.email}</Row>
              <Row label="Role">
                <RoleBadge role={account.role} />
              </Row>
              <Row label="Status">
                <AccountStatusBadge status={account.status} />
              </Row>
              <Row label="Created">{formatDateTime(account.createdAt)}</Row>
              <Row label="Last changed">{formatDateTime(account.updatedAt)}</Row>
              <Row label="Password">{account.mustChangePassword ? 'A new password must be chosen at the next sign-in' : 'No change pending'}</Row>
              <Row label="Account ID">
                <span className="font-mono text-xs">{account.id}</span>
              </Row>
            </dl>
          </section>

          <section aria-labelledby={`${titleId}-security`} className="space-y-3">
            <h3 id={`${titleId}-security`} className="text-base font-semibold text-slate-900">
              Security &amp; Access
            </h3>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
              <p>
                <span className="font-semibold text-slate-900">{ROLE_LABEL[account.role]}.</span> {ROLE_SUMMARY[account.role]}
              </p>
              <p>{account.status === 'ACTIVE' ? 'The account is active and can sign in.' : 'The account is disabled: it cannot sign in, and its records are kept.'}</p>
            </div>
            <ul aria-label="Account actions" className="grid gap-2 sm:grid-cols-2">
              {actions.map((action) => (
                <li key={action.key}>
                  <button
                    type="button"
                    disabled={action.disabled}
                    onClick={() => onAction(action.key, account)}
                    className={`flex h-full w-full flex-col rounded-xl border px-3.5 py-2.5 text-left text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60 ${
                      action.danger ? 'border-rose-200 bg-white text-rose-800 enabled:hover:bg-rose-50' : 'border-slate-200 bg-white text-slate-900 enabled:hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-semibold">{action.label}</span>
                    <span className="text-xs font-normal text-slate-700">{action.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <AccountAuditTrail accountId={account.id} accounts={accounts} currentUserId={currentUserId} refreshKey={eventsVersion} headingRef={auditHeading} />
        </div>
      </aside>
    </div>
  );
}
