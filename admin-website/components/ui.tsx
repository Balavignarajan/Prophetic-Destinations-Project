import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl';
  /**
   * `workspace` is a large editor window (almost the whole screen, up to 100rem wide) that draws NOTHING of its own inside: no header, no padding, no scrolling. The caller lays out its own
   * header (which must contain the element with id `modal-title`, the dialog's name), body and footer, and decides what scrolls. Focus handling, the Tab trap, Escape and the backdrop behave
   * exactly as in every other dialog. `title`, `description` and `maxWidth` are not drawn in this variant.
   */
  variant?: 'default' | 'workspace';
}

/**
 * The open dialogs, oldest first. Escape and the Tab trap belong to the NEWEST one only, so a dialog opened over another (a confirmation over an editor window, for instance) closes alone
 * instead of taking the dialog beneath it with it.
 */
const openDialogs: symbol[] = [];

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
  variant = 'default',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Callers often pass a NEW onClose function on every render (an inline arrow). The latest one is kept in a ref so the effect below depends only on
  // isOpen: otherwise every keystroke in a form inside the dialog re-ran it, which moved focus back to the first button (the close icon) and to the trigger.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const me = Symbol('dialog');
    openDialogs.push(me);
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirst = () => {
      // An element marked data-autofocus (a confirmation's safe button) gets focus first; otherwise the first control.
      const focusable =
        dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
        dialogRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
      focusable?.focus();
    };
    const timer = window.setTimeout(focusFirst, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== me) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      const at = openDialogs.indexOf(me);
      if (at >= 0) openDialogs.splice(at, 1);
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  if (variant === 'workspace') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-xs sm:p-4" role="presentation">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="flex h-[calc(100dvh-1rem)] max-h-[70rem] w-full max-w-[100rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 sm:h-[calc(100dvh-2rem)]"
        >
          {children}
        </div>
      </div>
    );
  }

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`w-full ${maxWidthClass} bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 id="modal-title" className="text-lg font-semibold text-slate-900">{title}</h3>
            {description && (
              <p className="text-sm text-slate-600 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  /** Focus starts on the cancel button instead of the first control, so Enter or Space cannot confirm by accident (for destructive or hard-to-undo actions). */
  safeFocus?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  isLoading = false,
  safeFocus = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            data-autofocus={safeFocus ? '' : undefined}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-300 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-hidden focus:ring-2 disabled:opacity-50 flex items-center gap-2 ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-400'
                : 'bg-slate-900 hover:bg-slate-800 focus:ring-slate-400'
            }`}
          >
            {isLoading && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const getBadgeStyle = () => {
    switch (status) {
      case 'PUBLISHED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'APPROVED':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'READY_FOR_REVIEW':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DRAFT':
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'READY_FOR_REVIEW':
        return 'Ready for Review';
      default:
        return status.charAt(0) + status.slice(1).toLowerCase();
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getBadgeStyle()}`}
    >
      {getLabel()}
    </span>
  );
}

export function LoadingSpinner({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 gap-3">
      <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-600 rounded-full animate-spin" />
      {text && <p className="text-sm font-medium text-slate-500">{text}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-dashed border-slate-300 rounded-xl">
      <div className="w-12 h-12 mb-3 text-slate-400 bg-slate-50 rounded-full flex items-center justify-center border border-slate-200">
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <h4 className="text-base font-semibold text-slate-900">{title}</h4>
      <p className="text-sm text-slate-500 max-w-sm mt-1 mb-4 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
