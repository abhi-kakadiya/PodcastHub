"use client";

import { useEffect, useState } from "react";
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

export default function Home() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#080910] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[94vw] flex-col px-4 pb-20 pt-16 sm:max-w-[80vw] sm:px-6 lg:max-w-[70vw] lg:px-12">
        <header
          className={`fixed left-1/2 top-0 z-50 flex w-full max-w-[94vw] -translate-x-1/2 flex-wrap items-center justify-between gap-4 px-4 py-4 transition-colors duration-300 sm:max-w-[80vw] sm:px-6 lg:max-w-[60vw] lg:px-12 ${
            scrolled
              ? "backdrop-blur-md bg-[#0b0f1f]/85 border-b border-white/10 shadow-[0_10px_40px_-24px_rgba(0,0,0,0.65)]"
              : "bg-transparent"
          }`}
        >
          <Logo subtitle="Remote podcast recording" />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/join")}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-slate-200 shadow-sm transition hover:border-white/20 hover:bg-white/10 hover:text-white active:border-white/30 active:bg-white/15"
            >
              <Users className="h-4 w-4" />
              Join Session
            </button>
            <button
              onClick={() => router.push("/create")}
              className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 transition hover:bg-purple-500 active:bg-purple-700"
            >
              <Mic className="h-4 w-4" />
              Create Room
            </button>
          </div>
        </header>

        <main className="mt-14 flex flex-1 flex-col gap-16">
          <section className="relative overflow-hidden rounded-[30px] border border-white/12 bg-[#0a0c18]/70 px-5 py-12 shadow-[0_30px_70px_-55px_rgba(0,0,0,0.9)] sm:px-8 lg:px-12">
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src="/landing-page-background-intro.mp4"
              autoPlay
              muted
              loop
              playsInline
              aria-hidden="true"
            />
            <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div className="space-y-7">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
                  Podcast-ready in minutes
                </span>
                <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  A focused studio<br />
                  for two-voice<br />
                  conversations.
                </h1>
                <p className="max-w-xl text-base text-slate-200">
                  PodcastHub keeps your host and guest visible during screen shares, backs up every track locally, and hands the files to your processing service automatically. Ideal for founder interviews, weekly product chats, and course recordings.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => router.push("/create")}
                    className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 transition hover:bg-purple-500 active:bg-purple-700"
                  >
                    <RadioReceiver className="h-4 w-4" />
                    Start a studio
                  </button>
                  <button
                    onClick={() => router.push("/join")}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 shadow-sm transition hover:border-white/20 hover:bg-white/10 hover:text-white active:border-white/30 active:bg-white/15"
                  >
                    <Share2 className="h-4 w-4" />
                    Enter invite code
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-6 text-xs text-slate-200 drop-shadow">
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
            </div>
          </section>

          <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <div
                key={item.title}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-purple-400/30 hover:shadow-[0_20px_60px_-35px_rgba(124,58,237,0.6)]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/8 via-transparent to-sky-400/8 opacity-0 transition duration-500 group-hover:opacity-100" aria-hidden />
                <div className="relative z-10">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-purple-200 transition duration-300 group-hover:border-purple-300/40 group-hover:bg-purple-500/15 group-hover:text-purple-100">
                    {item.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{item.copy}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
            <h2 className="text-xl font-semibold text-white">How recording works</h2>
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              {workflow.map((step, index) => (
                <div
                  key={step.title}
                  className="group relative overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-5 transition duration-300 hover:-translate-y-1 hover:border-emerald-300/30 hover:shadow-[0_18px_48px_-32px_rgba(16,185,129,0.4)]"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/6 via-transparent to-cyan-400/8 opacity-0 transition duration-500 group-hover:opacity-100" aria-hidden />
                  <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-slate-200 transition duration-300 group-hover:border-emerald-300/50 group-hover:bg-emerald-500/15 group-hover:text-emerald-50">
                    {index + 1}
                  </span>
                  <h3 className="relative z-10 mt-4 text-base font-semibold text-white">{step.title}</h3>
                  <p className="relative z-10 mt-2 text-sm text-slate-300">{step.detail}</p>
                </div>
              ))}
            </div>
          </section>

        </main>

        <footer className="mt-16 rounded-3xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur">
          <div className="flex flex-col items-center gap-3 text-sm text-slate-300 sm:flex-row sm:justify-center sm:gap-6">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="text-slate-400">Abhi Kakadiya · CAS-735</span>
              <a className="transition hover:text-white" href="mailto:kakadia@mcmaster.ca">kakadia@mcmaster.ca</a>
              <a className="transition hover:text-white" href="https://github.com/abhi-kakadiya" target="_blank" rel="noreferrer">GitHub</a>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-slate-400">
              <span>Next.js</span>
              <span>·</span>
              <span>FastAPI</span>
              <span>·</span>
              <span>WebRTC</span>
              <span>·</span>
              <span>MinIO</span>
              <span>·</span>
              <span>RabbitMQ</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
