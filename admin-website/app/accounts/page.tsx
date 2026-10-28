'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { type AccountActionKey, type AccountFilters, type ActionContext, DEFAULT_FILTERS, accountError, accountsApi, countAccounts, filterAccounts, hasActiveFilters } from '../../lib/accounts';
import type { AccountItem } from '../../lib/types';
import AccountDrawer from '../../components/accounts/AccountDrawer';
import { ChangeRoleDialog, CreateAccountDialog, DeleteAccountDialog, ResetCredentialsDialog, StatusChangeDialog } from '../../components/accounts/AccountDialogs';
import AccountList, { type DrawerSection } from '../../components/accounts/AccountList';
import { SummaryCards } from '../../components/accounts/AccountParts';
import AccountToolbar from '../../components/accounts/AccountToolbar';
import { EmptyState, LoadingSpinner } from '../../components/ui';
import Icon from '../../components/quizzes/icons';

type Notice = { kind: 'success' | 'error'; text: string };

/**
 * Admin Accounts: the staff accounts, who may do what, and the security actions on them. ADMIN only; the page asks the server for every account (page by page) before it shows the summary
 * cards or lets anyone search, so the counts and the search always cover the complete list. Every action is a dialog that explains what will happen and is applied by the server, which checks
 * the rules again (not your own account, never the last active administrator) and records the action in the account's audit trail. Nothing is reported as done until the server has confirmed it.
 */
export default function AccountsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [complete, setComplete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AccountFilters>(DEFAULT_FILTERS);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerSection, setDrawerSection] = useState<DrawerSection | undefined>(undefined);
  const [eventsVersion, setEventsVersion] = useState(0);

  const [creating, setCreating] = useState(false);
  const [roleFor, setRoleFor] = useState<AccountItem | null>(null);
  const [resetFor, setResetFor] = useState<AccountItem | null>(null);
  const [statusFor, setStatusFor] = useState<AccountItem | null>(null);
  const [deleteFor, setDeleteFor] = useState<AccountItem | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const run = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++run.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await accountsApi.listAll();
      if (mine !== run.current) return;
      setAccounts(res.items);
      setComplete(res.complete);
      setError(null);
    } catch (err: unknown) {
      // A quiet refresh that fails leaves what is on screen; only a load the person asked for reports.
      if (mine === run.current && !silent) setError(accountError(err, 'The staff accounts could not be loaded.').message);
    } finally {
      if (mine === run.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const counts = useMemo(() => countAccounts(accounts), [accounts]);
  const visible = useMemo(() => filterAccounts(accounts, filters), [accounts, filters]);
  const emails = useMemo(() => new Set(accounts.map((a) => a.email.toLowerCase())), [accounts]);
  const selected = selectedId ? (accounts.find((a) => a.id === selectedId) ?? null) : null;
  const dialogOpen = creating || roleFor !== null || resetFor !== null || statusFor !== null || deleteFor !== null;

  // An account that is no longer in the list (deleted here or elsewhere) cannot stay selected.
  useEffect(() => {
    if (selectedId && !loading && !accounts.some((a) => a.id === selectedId)) setSelectedId(null);
  }, [accounts, selectedId, loading]);

  if (!user || !isAdmin) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-base font-semibold text-slate-900">Access Restricted</h1>
        <p className="mt-1 text-sm text-slate-700">Staff account management is restricted to administrators.</p>
      </div>
    );
  }

  const context: ActionContext = { currentUserId: user.id, activeAdmins: counts.activeAdmins, complete };
  const say = (kind: Notice['kind'], text: string) => setNotice({ kind, text });
  const replace = (updated: AccountItem) => setAccounts((list) => list.map((a) => (a.id === updated.id ? updated : a)));
  // After the server confirmed a change: show it at once from the server's answer, then quietly read the whole list again so it agrees with the server.
  const changed = (updated: AccountItem, text: string) => {
    replace(updated);
    setEventsVersion((v) => v + 1);
    say('success', text);
    void load(true);
  };

  const openDetails = (account: AccountItem, section?: DrawerSection) => {
    setSelectedId(account.id);
    setDrawerSection(section);
  };
  const onAction = (key: AccountActionKey, account: AccountItem) => {
    if (key === 'role') setRoleFor(account);
    else if (key === 'reset') setResetFor(account);
    else if (key === 'toggle') setStatusFor(account);
    else setDeleteFor(account);
  };

  const clearFilters = () => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Admin Accounts</h1>
          <p className="mt-0.5 text-sm text-slate-700">Manage staff access, roles and account security.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-2 self-start rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 sm:self-auto"
        >
          <Icon name="plus" />
          Add Staff Account
        </button>
      </div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${notice.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
        >
          <span className="min-w-0 wrap-break-word">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="shrink-0 rounded p-1 hover:bg-white/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" />
          </button>
        </div>
      )}

      {loading && accounts.length === 0 ? (
        <LoadingSpinner text="Loading staff accounts..." />
      ) : error && accounts.length === 0 ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Try again
          </button>
        </div>
      ) : (
        <>
          <SummaryCards counts={counts} complete={complete} />

          {!complete && (
            <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              Only {accounts.length} staff accounts could be loaded, so the counts, search and filters below cover those, not every account.{' '}
              <button type="button" onClick={() => void load()} className="font-medium underline">
                Try again
              </button>
            </p>
          )}

          <section aria-labelledby="accounts-results-h" className="space-y-4">
            <h2 id="accounts-results-h" ref={resultsRef} tabIndex={-1} className="sr-only focus:outline-hidden">
              Staff accounts
            </h2>
            <AccountToolbar filters={filters} onChange={(change) => setFilters((f) => ({ ...f, ...change }))} onClear={clearFilters} shown={visible.length} total={accounts.length} searchRef={searchRef} />

            {accounts.length === 0 ? (
              <EmptyState
                title="No staff accounts yet"
                description="Add the first staff account to give someone access to the Admin."
                action={
                  <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                    Add Staff Account
                  </button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title="No accounts match"
                description={hasActiveFilters(filters) ? 'No staff account matches this search and these filters.' : 'There is nothing to show.'}
                action={
                  <button type="button" onClick={clearFilters} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                    Clear filters
                  </button>
                }
              />
            ) : (
              <AccountList accounts={visible} currentUserId={user.id} selectedId={selectedId} context={context} onOpen={openDetails} onAction={onAction} />
            )}
          </section>
        </>
      )}

      {selected && (
        <AccountDrawer
          key={selected.id}
          account={selected}
          accounts={accounts}
          currentUserId={user.id}
          context={context}
          section={drawerSection}
          eventsVersion={eventsVersion}
          dialogOpen={dialogOpen}
          onClose={() => setSelectedId(null)}
          onAction={onAction}
        />
      )}

      {creating && (
        <CreateAccountDialog
          existingEmails={emails}
          onClose={() => setCreating(false)}
          onCreated={(account) => {
            setCreating(false);
            setAccounts((list) => (list.some((a) => a.id === account.id) ? list : [...list, account]));
            say('success', `Account created for ${account.email} as ${account.role.toLowerCase()}. Share the temporary password with them directly; they must choose a new one at first sign-in.`);
            void load(true);
          }}
        />
      )}

      {roleFor && (
        <ChangeRoleDialog
          account={roleFor}
          onClose={() => setRoleFor(null)}
          onChanged={(updated) => {
            setRoleFor(null);
            changed(updated, `${updated.email} is now ${updated.role.toLowerCase()}.`);
          }}
        />
      )}

      {resetFor && (
        <ResetCredentialsDialog
          account={resetFor}
          onClose={() => setResetFor(null)}
          onDone={(updated) => {
            setResetFor(null);
            changed(updated, `A temporary password was set for ${updated.email} and all of its sessions ended. They must choose a new password at the next sign-in.`);
          }}
        />
      )}

      {statusFor && (
        <StatusChangeDialog
          account={statusFor}
          onClose={() => setStatusFor(null)}
          onDone={(updated) => {
            setStatusFor(null);
            changed(updated, updated.status === 'DISABLED' ? `${updated.email} is disabled. It can no longer sign in.` : `${updated.email} is enabled. It can sign in again.`);
          }}
        />
      )}

      {deleteFor && (
        <DeleteAccountDialog
          account={deleteFor}
          onClose={() => setDeleteFor(null)}
          onCheckList={() => void load(true)}
          onDeleted={(deleted) => {
            setDeleteFor(null);
            setAccounts((list) => list.filter((a) => a.id !== deleted.id));
            if (selectedId === deleted.id) setSelectedId(null);
            say('success', `${deleted.email} was permanently deleted. The account can no longer sign in; the content it created is unchanged.`);
            void load(true);
            // The row that opened the dialog is gone: keyboard focus goes to the list instead of nowhere.
            window.requestAnimationFrame(() => resultsRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}
