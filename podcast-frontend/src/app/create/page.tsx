'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Mic, MicOff, Loader2, ArrowLeft, Video, VideoOff } from 'lucide-react';
import { PreJoinMediaSetup, type MediaDeviceSelection } from '@/components/prejoin-media-setup';
import { AppPopup } from '@/components/app-popup';

export default function CreateMeeting() {
  const router = useRouter();
  const [hostName, setHostName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showValidationPopup, setShowValidationPopup] = useState(false);
  const [mediaSelection, setMediaSelection] = useState<MediaDeviceSelection>({
    audioDeviceId: null,
    videoDeviceId: null,
    micEnabled: true,
    cameraEnabled: true,
  });

  const handleCreate = async () => {
    const trimmed = hostName.trim();
    if (!trimmed) {
      setShowValidationPopup(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: trimmed }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();

      sessionStorage.setItem(
        'podcasthub_user',
        JSON.stringify({
          name: trimmed,
          role: 'host',
          sessionId: data.session_id,
          roomCode: data.room_code,
          peerName: null,
          audioDeviceId: mediaSelection.audioDeviceId,
          videoDeviceId: mediaSelection.videoDeviceId,
          micEnabled: mediaSelection.micEnabled,
          cameraEnabled: mediaSelection.cameraEnabled,
        }),
      );

      router.push(`/room/${data.session_id}`);
    } catch (error) {
      console.error('Error creating meeting:', error);
      const sessionId = `session_${Date.now()}`;
      const roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();

      sessionStorage.setItem(
        'podcasthub_user',
        JSON.stringify({
          name: trimmed,
          role: 'host',
          sessionId,
          roomCode,
          peerName: null,
          audioDeviceId: mediaSelection.audioDeviceId,
          videoDeviceId: mediaSelection.videoDeviceId,
          micEnabled: mediaSelection.micEnabled,
          cameraEnabled: mediaSelection.cameraEnabled,
        }),
      );

      router.push(`/room/${sessionId}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#080910] text-slate-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-4 sm:px-6 sm:py-5">
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </button>
          <span className="text-xs text-slate-500">Host view</span>
        </header>

        <main className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-start pb-6 md:mt-2 md:justify-center">
          <div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6 md:-translate-y-8 lg:p-7">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/15 text-purple-100">
                <Crown className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-white md:text-2xl">Create a room</h1>
                <p className="text-sm text-slate-400">Name the host to generate a room code and start recording.</p>
              </div>
            </div>

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Host name
            </label>
            <input
              value={hostName}
              onChange={(event) => setHostName(event.target.value)}
              placeholder="Name shown to your guest"
              className="mt-2 w-full rounded-2xl border border-white/20 bg-black/45 px-4 py-3 text-sm text-white placeholder:text-slate-300/55 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/45"
            />

            <PreJoinMediaSetup
              micEnabled={mediaSelection.micEnabled}
              cameraEnabled={mediaSelection.cameraEnabled}
              onSelectionChange={setMediaSelection}
            />
          </div>

          <div className="mt-3 flex w-full flex-wrap items-center justify-center gap-2 md:mt-4 md:-translate-y-8 md:gap-3">
            <button
              type="button"
              onClick={() => setMediaSelection((prev) => ({ ...prev, cameraEnabled: !prev.cameraEnabled }))}
              className={`inline-flex w-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition sm:w-auto ${
                mediaSelection.cameraEnabled
                  ? 'border-white/20 bg-white/10 text-slate-200 hover:border-white/30'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:border-rose-400/60'
              }`}
            >
              {mediaSelection.cameraEnabled ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
              {mediaSelection.cameraEnabled ? 'Camera on' : 'Camera off'}
            </button>
            <button
              type="button"
              onClick={() => setMediaSelection((prev) => ({ ...prev, micEnabled: !prev.micEnabled }))}
              className={`inline-flex w-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition sm:w-auto ${
                mediaSelection.micEnabled
                  ? 'border-white/20 bg-white/10 text-slate-200 hover:border-white/30'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:border-rose-400/60'
              }`}
            >
              {mediaSelection.micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
              {mediaSelection.micEnabled ? 'Mic on' : 'Mic off'}
            </button>
            <button
              onClick={handleCreate}
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-purple-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400 sm:w-auto sm:min-w-[180px] disabled:cursor-not-allowed disabled:bg-purple-500/50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              {isLoading ? 'Creating room...' : 'Create room'}
            </button>
          </div>
        </main>
      </div>

      <AppPopup
        open={showValidationPopup}
        tone="warning"
        title="Missing host name"
        message="Enter your name to start a room."
        onClose={() => setShowValidationPopup(false)}
      />
    </div>
  );
}


