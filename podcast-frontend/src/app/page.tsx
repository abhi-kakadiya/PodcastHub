"use client";

import { useRouter } from "next/navigation";
import {
  Mic,
  Users,
  Share2,
  MonitorPlay,
  ShieldCheck,
  Waves,
  RadioReceiver,
  Headphones,
} from "lucide-react";
import { Logo } from "@/components/logo";

const features = [
  {
    icon: <MonitorPlay className="h-6 w-6" />,
    title: "Screen + camera capture",
    copy: "Share slides or demos while both host and guest stay visible in synced HD tiles.",
  },
  {
    icon: <ShieldCheck className="h-6 w-6" />,
    title: "Locally recorded failsafes",
    copy: "Each participant uploads 1080p/48kHz takes from their machine, so dropouts never ruin the edit.",
  },
  {
    icon: <Waves className="h-6 w-6" />,
    title: "One-click handoff",
    copy: "Session metadata, transcodes, and assets auto-sync to the processing service as soon as you stop.",
  },
];

const workflow = [
  {
    title: "Pick a host + guest",
    detail: "Create a room with your name, copy the code, and invite your collaborator.",
  },
  {
    title: "Check gear & record",
    detail: "Both feeds stay visible, recording locally with resumable uploads in the background.",
  },
  {
    title: "Deliver instantly",
    detail: "When you wrap, PodcastHub hands the tracks to the processing pipeline for mastering.",
  },
];

const previewHighlights = [
  {
    icon: <Mic className="h-5 w-5" />,
    title: "Record in sync",
    detail: "Both voices are captured locally with matching 1080p/48kHz takes that stay perfectly aligned.",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Guest friendly",
    detail: "Join from a single link, check levels, and start the session without navigating dense dashboards.",
  },
  {
    icon: <MonitorPlay className="h-5 w-5" />,
    title: "Stay focused",
    detail: "Minimal controls keep the host locked on the conversation - no extra panels or screen-share clutter.",
  },
];

const HeroPreview = () => (
  <div className="rounded-[26px] border border-white/12 bg-gradient-to-br from-[#0b1020] via-[#0f172a] to-[#05060d] p-6 shadow-[0_35px_55px_-52px_rgba(12,17,30,0.85)] transition duration-500 ease-out hover:-translate-y-[2px] hover:shadow-[0_28px_55px_-38px_rgba(120,131,255,0.45)]">
    <div className="flex flex-col gap-5 text-slate-300">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/15 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.35em] text-purple-100">
        Studio preview
      </span>
      <div>
        <h3 className="text-lg font-semibold text-white">What guests see</h3>
        <p className="mt-1 text-sm">
          A clean stage with the essentials: local capture, clear prompts, and zero distractions.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {previewHighlights.map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/20 text-purple-100">
              {item.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-xs">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-xs text-emerald-100">
        <p className="text-sm font-semibold text-white">Automatic backups</p>
        <p className="mt-1 text-emerald-100/80">
          Each take uploads in the background while you record. If the connection hiccups, the full-res files are already safe.
        </p>
      </div>
    </div>
  </div>
);

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#080910] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-20 pt-8 sm:px-6 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Logo subtitle="Remote-first podcast recording" />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/join")}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white"
            >
              <Users className="h-4 w-4" />
              Join Session
            </button>
            <button
              onClick={() => router.push("/create")}
              className="inline-flex items-center gap-2 rounded-full bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400"
            >
              <Mic className="h-4 w-4" />
              Create Room
            </button>
          </div>
        </header>

        <main className="mt-14 flex flex-1 flex-col gap-16">
          <section className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
            <div className="space-y-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
                Podcast-ready in minutes
              </span>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                A focused studio for two-voice conversations.
              </h1>
              <p className="max-w-xl text-base text-slate-400">
                PodcastHub keeps your host and guest visible during screen shares, backs up every track locally, and hands the files to your processing service automatically. Ideal for founder interviews, weekly product chats, and course recordings.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => router.push("/create")}
                  className="inline-flex items-center gap-2 rounded-full bg-purple-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400"
                >
                  <RadioReceiver className="h-4 w-4" />
                  Start a studio
                </button>
                <button
                  onClick={() => router.push("/join")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white"
                >
                  <Share2 className="h-4 w-4" />
                  Enter invite code
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  Encrypted WebRTC + resumable uploads
                </span>
                <span className="flex items-center gap-2">
                  <Headphones className="h-4 w-4 text-sky-300" />
                  48 kHz WAV + isolated video tracks
                </span>
              </div>
            </div>
            <HeroPreview />
          </section>

          <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition hover:border-white/20"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-purple-200">
                  {item.icon}
                </div>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{item.copy}</p>
              </div>
            ))}
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
            <h2 className="text-xl font-semibold text-white">How recording works</h2>
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              {workflow.map((step, index) => (
                <div key={step.title} className="rounded-3xl border border-white/10 bg-black/30 p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-slate-200">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{step.detail}</p>
                </div>
              ))}
            </div>
          </section>

        </main>

        <footer className="mt-14 border-t border-white/10 pt-6 text-center text-xs text-slate-500">
          Built for the CAS-735 project stack: Next.js · FastAPI · MinIO · RabbitMQ · FFmpeg.
        </footer>
      </div>
    </div>
  );
}
