'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

type PopupTone = 'warning' | 'info';

interface PopupAction {
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'secondary';
}

interface AppPopupProps {
  open: boolean;
  title: string;
  message?: string;
  tone?: PopupTone;
  onClose: () => void;
  actions?: PopupAction[];
  children?: ReactNode;
}

export function AppPopup({
  open,
  title,
  message,
  tone = 'warning',
  onClose,
  actions,
  children,
}: AppPopupProps) {
  if (!open) {
    return null;
  }

  const icon =
    tone === 'warning' ? (
      <AlertTriangle className="h-5 w-5 text-amber-200" />
    ) : (
      <Info className="h-5 w-5 text-sky-200" />
    );

  const iconWrapClasses =
    tone === 'warning'
      ? 'border border-amber-400/40 bg-amber-500/15'
      : 'border border-sky-400/40 bg-sky-500/15';

  const resolvedActions =
    actions && actions.length > 0
      ? actions
      : [
          {
            label: 'Close',
            onClick: onClose,
            tone: 'primary' as const,
          },
        ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${iconWrapClasses}`}>
              {icon}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              {message && <p className="mt-1 text-sm text-slate-300">{message}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:border-white/20 hover:text-white"
            aria-label="Close popup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {resolvedActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={
                action.tone === 'secondary'
                  ? 'rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white'
                  : 'rounded-full bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
