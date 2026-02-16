'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, CloudLightning, Timer } from 'lucide-react';

interface ServiceWakeupOverlayProps {
  open: boolean;
  attempt: number;
  maxAttempts: number;
  phase: 'starting' | 'retrying';
  title: string;
  subtitle: string;
  lastError?: string | null;
}

export function ServiceWakeupOverlay({
  open,
  attempt,
  maxAttempts,
  phase,
  title,
  subtitle,
  lastError,
}: ServiceWakeupOverlayProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [open]);

  const progressPercent = useMemo(() => {
    if (maxAttempts <= 0) return 0;
    return Math.min(100, Math.round((attempt / maxAttempts) * 100));
  }, [attempt, maxAttempts]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#05070fcc] px-4 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-slate-950 via-[#0c1224] to-slate-950 p-6 shadow-[0_30px_80px_-35px_rgba(34,211,238,0.45)]">
        <div className="flex items-start gap-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/35 bg-cyan-500/15 text-cyan-100">
            <CloudLightning className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {phase === 'starting' ? 'Connecting to service' : 'Waking Render free-tier service'}
            </span>
            <span>
              Attempt {attempt}/{maxAttempts}
            </span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              {elapsedSeconds}s elapsed
            </span>
            <span>This can take ~20-90s on free tier</span>
          </div>
        </div>

        {lastError && (
          <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Last response: {lastError}
          </p>
        )}

        <p className="mt-4 text-xs text-slate-400">
          Please keep this tab open. You will be redirected automatically when the backend is ready.
        </p>
      </div>
    </div>
  );
}

