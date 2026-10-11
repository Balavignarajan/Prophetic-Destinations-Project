'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AccountItem, AccountEvent, Role } from '../../lib/types';
import { LoadingSpinner, EmptyState, Modal, ConfirmDialog } from '../../components/ui';

export default function AccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected account events audit
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null);
  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Create account modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('EDITOR');
  const [newTemporaryPassword, setNewTemporaryPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Change Role modal
  const [roleModalAccount, setRoleModalAccount] = useState<AccountItem | null>(null);
  const [targetRole, setTargetRole] = useState<Role>('EDITOR');
  const [changingRole, setChangingRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  // Force Password Reset modal
  const [resetModalAccount, setResetModalAccount] = useState<AccountItem | null>(null);
  const [temporaryResetPassword, setTemporaryResetPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Toggle Enable / Disable state
  const [toggleDisableAccount, setToggleDisableAccount] = useState<AccountItem | null>(null);
  const [togglingDisable, setTogglingDisable] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.request<{ items: AccountItem[]; total: number }>(
        '/admin/accounts?limit=100'
      );
      setAccounts(res.items);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load staff accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchAccounts();
    }
  }, [user?.role, fetchAccounts]);

  const fetchAccountEvents = async (account: AccountItem) => {
    setSelectedAccount(account);
    setLoadingEvents(true);

    try {
      const res = await api.request<{ items: AccountEvent[] }>(
        `/admin/accounts/${account.id}/events?limit=25`
      );
      setEvents(res.items);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load account audit events.');
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    try {
      await api.request('/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          role: newRole,
          temporaryPassword: newTemporaryPassword,
        }),
      });

      setCreateModalOpen(false);
      setNewEmail('');
      setNewTemporaryPassword('');
      fetchAccounts();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setCreateError(e.payload?.message || e.message || 'Failed to create account.');
    } finally {
      setCreating(false);
    }
  };

  const handleChangeRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleModalAccount) return;
    setRoleError(null);
    setChangingRole(true);

    try {
      await api.request(`/admin/accounts/${roleModalAccount.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole }),
      });

      setRoleModalAccount(null);
      fetchAccounts();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setRoleError(e.payload?.message || e.message || 'Failed to change role.');
    } finally {
      setChangingRole(false);
    }
  };

  const handleForcePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalAccount) return;
    setResetError(null);
    setResettingPassword(true);

    try {
      await api.request(
        `/admin/accounts/${resetModalAccount.id}/password-reset`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            temporaryPassword: temporaryResetPassword,
          }),
        }
      );

      setResetModalAccount(null);
      setTemporaryResetPassword('');
      fetchAccounts();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setResetError(e.payload?.message || e.message || 'Failed to force reset password.');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleToggleDisable = async () => {
    if (!toggleDisableAccount) return;
    setTogglingDisable(true);
    setToggleError(null);

    const endpoint = toggleDisableAccount.disabled ? 'enable' : 'disable';

    try {
      await api.request(
        `/admin/accounts/${toggleDisableAccount.id}/${endpoint}`,
        {
          method: 'POST',
        }
      );

      setToggleDisableAccount(null);
      fetchAccounts();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setToggleError(
        e.payload?.message ||
          e.message ||
          `Failed to ${endpoint} account. Note: The last active ADMIN cannot be disabled.`
      );
    } finally {
      setTogglingDisable(false);
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-xl">
        <h3 className="text-base font-semibold text-slate-800">
          Access Restricted
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Staff Account Management is restricted to administrators only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">
            Admin Account Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Administer staff accounts, roles, audit trails, and security settings.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-4 py-2.5 text-sm font-medium bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-xs transition-colors flex items-center gap-2 self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Staff Account
        </button>
      </div>

      {toggleError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between">
          <span>{toggleError}</span>
          <button onClick={() => setToggleError(null)} className="text-rose-500 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Accounts List (Left 8 Cols) */}
        <div className="lg:col-span-8">
          {loading ? (
            <LoadingSpinner text="Retrieving accounts..." />
          ) : accounts.length === 0 ? (
            <EmptyState
              title="No Accounts"
              description="No staff accounts are registered."
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Staff Member</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accounts.map((acc) => {
                      const isSelf = acc.id === user.id;
                      return (
                        <tr
                          key={acc.id}
                          className={`hover:bg-slate-50/60 transition-colors ${
                            selectedAccount?.id === acc.id ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          <td className="px-5 py-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900">
                                  {acc.email}
                                </span>
                                {isSelf && (
                                  <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-sm font-semibold">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                Created: {new Date(acc.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              {acc.role}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              {acc.disabled ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                  Disabled
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Active
                                </span>
                              )}
                              {acc.passwordChangeRequired && (
                                <div className="text-[10px] text-amber-700 font-medium">
                                  Password change pending
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => fetchAccountEvents(acc)}
                                className="text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md"
                              >
                                Audit
                              </button>

                              {!isSelf && (
                                <>
                                  <button
                                    onClick={() => {
                                      setRoleModalAccount(acc);
                                      setTargetRole(acc.role);
                                    }}
                                    className="text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md"
                                  >
                                    Role
                                  </button>
                                  <button
                                    onClick={() => setResetModalAccount(acc)}
                                    className="text-xs font-medium text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-md border border-amber-200"
                                  >
                                    Reset
                                  </button>
                                  <button
                                    onClick={() => setToggleDisableAccount(acc)}
                                    className={`text-xs font-medium px-2 py-1 rounded-md ${
                                      acc.disabled
                                        ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                        : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
                                    }`}
                                  >
                                    {acc.disabled ? 'Enable' : 'Disable'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Audit Events Inspector (Right 4 Cols) */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="font-serif text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Account Audit Trail
            </h3>

            {loadingEvents ? (
              <LoadingSpinner text="Fetching audit log..." />
            ) : !selectedAccount ? (
              <p className="text-xs text-slate-400 italic">
                Select an account from the list to view its audit log events.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-700 truncate">
                  Log for: {selectedAccount.email}
                </p>

                {events.length === 0 ? (
                  <p className="text-xs text-slate-400">No events recorded.</p>
                ) : (
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {events.map((evt) => (
                      <div
                        key={evt.id}
                        className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-800">
                          <span>{evt.type}</span>
                          <span className="text-[10px] font-normal text-slate-400">
                            {new Date(evt.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          Actor: {evt.actorId.slice(0, 8)}...
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Account Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Add Staff Account"
        description="Issue a staff account with a required temporary password."
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {createError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="editor@propheticdestinations.org"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Staff Role *
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            >
              <option value="EDITOR">EDITOR — Author and edit curriculum</option>
              <option value="REVIEWER">REVIEWER — Review, request changes, and approve</option>
              <option value="ADMIN">ADMIN — Full system governance & publishing</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Temporary Password *
            </label>
            <input
              type="text"
              required
              minLength={8}
              value={newTemporaryPassword}
              onChange={(e) => setNewTemporaryPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              The user will be strictly forced to update this temporary password upon first login.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {creating && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        isOpen={Boolean(roleModalAccount)}
        onClose={() => setRoleModalAccount(null)}
        title="Change Staff Role"
        description={`Updating authorization privileges for ${roleModalAccount?.email}.`}
      >
        <form onSubmit={handleChangeRole} className="space-y-4">
          {roleError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {roleError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Select Role
            </label>
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as Role)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            >
              <option value="EDITOR">EDITOR</option>
              <option value="REVIEWER">REVIEWER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setRoleModalAccount(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={changingRole}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {changingRole && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Update Role
            </button>
          </div>
        </form>
      </Modal>

      {/* Force Password Reset Modal */}
      <Modal
        isOpen={Boolean(resetModalAccount)}
        onClose={() => setResetModalAccount(null)}
        title="Force Password Reset"
        description={`Issues a mandatory temporary password for ${resetModalAccount?.email}. Ends all existing sessions.`}
      >
        <form onSubmit={handleForcePasswordReset} className="space-y-4">
          {resetError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {resetError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Temporary Password *
            </label>
            <input
              type="text"
              required
              minLength={8}
              value={temporaryResetPassword}
              onChange={(e) => setTemporaryResetPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 font-mono"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setResetModalAccount(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={resettingPassword || !temporaryResetPassword.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {resettingPassword && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Set Temporary Password
            </button>
          </div>
        </form>
      </Modal>

      {/* Enable / Disable Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(toggleDisableAccount)}
        onClose={() => setToggleDisableAccount(null)}
        onConfirm={handleToggleDisable}
        title={`${toggleDisableAccount?.disabled ? 'Enable' : 'Disable'} Account`}
        message={`Are you sure you want to ${
          toggleDisableAccount?.disabled ? 'enable' : 'disable'
        } the account for ${toggleDisableAccount?.email}? ${
          toggleDisableAccount?.disabled
            ? 'The account will regain access immediately.'
            : 'All active sessions will be terminated immediately. Note: The last active ADMIN cannot be disabled.'
        }`}
        confirmLabel={toggleDisableAccount?.disabled ? 'Enable' : 'Disable'}
        isDestructive={!toggleDisableAccount?.disabled}
        isLoading={togglingDisable}
      />
    </div>
  );
}
