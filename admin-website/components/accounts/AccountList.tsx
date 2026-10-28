'use client';

import React from 'react';
import { type AccountActionKey, type ActionContext, accountActions, formatDate } from '../../lib/accounts';
import type { AccountItem } from '../../lib/types';
import { type MenuItem, RowMenu } from '../RowMenu';
import { AccountStatusBadge, Avatar, RoleBadge, YouBadge } from './AccountParts';

/** Which part of the details panel to bring forward when it opens. */
export type DrawerSection = 'audit';

/**
 * The staff list: one row per account with its avatar, address, role and status, the date it was created, a View Details button and the three-dot menu of every other action. The row
 * opens the details panel; the menu holds View Details, View Audit Trail, Change Role, Reset Credentials, Disable / Enable and Delete Permanently. An action the rules forbid for an
 * account (your own, the only active administrator) is dimmed in the menu with the reason under it. Nothing here changes anything: choosing an action hands it to the page.
 */
export default function AccountList({
  accounts,
  currentUserId,
  selectedId,
  context,
  onOpen,
  onAction,
}: {
  accounts: AccountItem[];
  currentUserId: string;
  selectedId: string | null;
  context: ActionContext;
  onOpen: (account: AccountItem, section?: DrawerSection) => void;
  onAction: (key: AccountActionKey, account: AccountItem) => void;
}) {
  const menuFor = (account: AccountItem): MenuItem[] => [
    { key: 'details', label: 'View Details', hint: 'Account information and security', onSelect: () => onOpen(account) },
    { key: 'audit', label: 'View Audit Trail', hint: 'Everything recorded for this account', onSelect: () => onOpen(account, 'audit') },
    ...accountActions(account, context).map((action) => ({
      key: action.key,
      label: action.label,
      hint: action.hint,
      disabled: action.disabled,
      danger: action.danger,
      dividerBefore: action.key === 'role' || action.key === 'delete',
      onSelect: () => onAction(action.key, account),
    })),
  ];

  return (
    <ul aria-label="Staff accounts" className="divide-y divide-slate-100 overflow-visible rounded-xl border border-slate-200 bg-white shadow-xs">
      {accounts.map((account) => {
        const isSelf = account.id === currentUserId;
        const selected = account.id === selectedId;
        return (
          <li key={account.id} className={`relative flex items-center gap-2 px-3 py-3 first:rounded-t-xl last:rounded-b-xl sm:gap-3 sm:px-4 ${selected ? 'bg-amber-50/70' : 'hover:bg-slate-50/70'}`}>
            {selected && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-amber-500" />}
            <button
              type="button"
              onClick={() => onOpen(account)}
              aria-label={`View details for ${account.email}${isSelf ? ' (you)' : ''}`}
              aria-current={selected ? 'true' : undefined}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <Avatar email={account.email} role={account.role} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-semibold text-slate-900">{account.email}</span>
                  {isSelf && <YouBadge />}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RoleBadge role={account.role} />
                  <AccountStatusBadge status={account.status} />
                  {account.mustChangePassword && <span className="text-xs font-medium text-amber-900">Password change pending</span>}
                </span>
              </span>
              <span className="hidden shrink-0 text-right text-xs text-slate-700 lg:block">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">Created</span>
                {formatDate(account.createdAt)}
              </span>
              <span aria-hidden="true" className="hidden shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 md:inline-flex">
                View Details
              </span>
            </button>
            <RowMenu label={`More actions for ${account.email}`} items={menuFor(account)} ownerId={account.id} />
          </li>
        );
      })}
    </ul>
  );
}
