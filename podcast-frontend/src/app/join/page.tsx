'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Loader2, ArrowLeft } from 'lucide-react';

export default function JoinMeeting() {
  const router = useRouter();
  const [guestName, setGuestName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    const name = guestName.trim();
    const code = roomCode.trim().toUpperCase();

    if (!name || !code) {
      alert('Enter your name and the room code.');
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
        }),
      );

      router.push(`/room/${sessionId}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080910] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-12 pt-8 sm:px-6">
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

        <main className="flex flex-1 flex-col items-center justify-center">
          <div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/15 text-purple-100">
              <Users className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold text-white">Join a room</h1>
            <p className="mt-2 text-sm text-slate-400">Enter your name and the code your host shared.</p>

            <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Your name
            </label>
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Displayed to the host"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            />

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Room code
            </label>
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder="LDJG5Y"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none uppercase transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            />

            <button
              onClick={handleJoin}
              disabled={isLoading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-purple-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:bg-purple-500/50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              {isLoading ? 'Joining…' : 'Join room'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

