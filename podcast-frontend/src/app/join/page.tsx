'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, Loader2, ArrowLeft, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { PreJoinMediaSetup, type MediaDeviceSelection } from '@/components/prejoin-media-setup';
import { AppPopup } from '@/components/app-popup';

export default function JoinMeeting() {
  const router = useRouter();
  const [guestName, setGuestName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showValidationPopup, setShowValidationPopup] = useState(false);
  const [mediaSelection, setMediaSelection] = useState<MediaDeviceSelection>({
    audioDeviceId: null,
    videoDeviceId: null,
    micEnabled: true,
    cameraEnabled: true,
  });

  const handleJoin = async () => {
    const name = guestName.trim();
    const code = roomCode.trim().toUpperCase();

    if (!name || !code) {
      setShowValidationPopup(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_code: code,
          participant_id: name,
        }),
      });

      if (!response.ok) {
        throw new Error('Invalid room code or session ended');
      }

      const data = await response.json();

      sessionStorage.setItem(
        'podcasthub_user',
        JSON.stringify({
          name,
          role: 'guest',
          sessionId: data.session_id,
          roomCode: code,
          peerName: data.host_id ?? null,
          audioDeviceId: mediaSelection.audioDeviceId,
          videoDeviceId: mediaSelection.videoDeviceId,
          micEnabled: mediaSelection.micEnabled,
          cameraEnabled: mediaSelection.cameraEnabled,
        }),
      );

      router.push(`/room/${data.session_id}`);
    } catch (error) {
      console.error('Error joining meeting:', error);
      const sessionId = `session_${code.toLowerCase()}`;

      sessionStorage.setItem(
        'podcasthub_user',
        JSON.stringify({
          name,
          role: 'guest',
          sessionId,
          roomCode: code,
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
    <div className="h-screen overflow-hidden bg-[#080910] text-slate-100">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-5 sm:px-6">
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </button>
          <span className="text-xs text-slate-500">Guest view</span>
        </header>

        <main className="mt-2 flex min-h-0 flex-1 flex-col items-center justify-center pb-4">
          <div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-7">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/15 text-purple-100">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white md:text-2xl">Join a room</h1>
                <p className="text-sm text-slate-400">Enter your name and the code your host shared.</p>
              </div>
            </div>

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Your name
            </label>
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Displayed to the host"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            />

            <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Room code
            </label>
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder="e.g. AB12CD"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none uppercase transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            />

            <PreJoinMediaSetup
              micEnabled={mediaSelection.micEnabled}
              cameraEnabled={mediaSelection.cameraEnabled}
              onSelectionChange={setMediaSelection}
            />
          </div>

          <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setMediaSelection((prev) => ({ ...prev, cameraEnabled: !prev.cameraEnabled }))}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
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
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                mediaSelection.micEnabled
                  ? 'border-white/20 bg-white/10 text-slate-200 hover:border-white/30'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:border-rose-400/60'
              }`}
            >
              {mediaSelection.micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
              {mediaSelection.micEnabled ? 'Mic on' : 'Mic off'}
            </button>
            <button
              onClick={handleJoin}
              disabled={isLoading}
              className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-full bg-purple-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:bg-purple-500/50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              {isLoading ? 'Joining...' : 'Join room'}
            </button>
          </div>
        </main>
      </div>

      <AppPopup
        open={showValidationPopup}
        tone="warning"
        title="Missing details"
        message="Enter your name and the room code."
        onClose={() => setShowValidationPopup(false)}
      />
    </div>
  );
}


