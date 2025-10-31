"use client";

import Image from "next/image";

type LogoProps = {
  className?: string;
  title?: string;
  subtitle?: string;
  showWordmark?: boolean;
};

export function Logo({
  className = "",
  title = "PodcastHub",
  subtitle,
  showWordmark = true,
}: LogoProps) {
  const wrapperClasses = ["inline-flex items-center gap-3", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClasses}>
      <div className="relative flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/15 bg-gradient-to-br from-[#1b1f3a] via-[#0d1122] to-[#05060d] shadow-[0_18px_40px_-28px_rgba(88,118,255,0.6)] ring-1 ring-purple-500/20">
        <Image src="/logo-mark.svg" alt="PodcastHub logo" width={30} height={30} priority />
      </div>

      {showWordmark && (
        <div className="space-y-0.5">
          <p className="bg-gradient-to-r from-purple-100 via-slate-100 to-cyan-100 bg-clip-text text-sm font-semibold tracking-wide text-transparent">
            {title}
          </p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
