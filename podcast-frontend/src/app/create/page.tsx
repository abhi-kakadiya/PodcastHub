'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Loader2, ArrowLeft } from 'lucide-react';

export default function CreateMeeting() {
  const router = useRouter();
  const [hostName, setHostName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    const trimmed = hostName.trim();
    if (!trimmed) {
      alert('Enter your name to start a room.');
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
          <span className="text-xs text-slate-500">Host view</span>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center">
          <div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/15 text-purple-100">
              <Mic className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold text-white">Create a room</h1>
            <p className="mt-2 text-sm text-slate-400">Name the host to generate a room code and start recording.</p>

            <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Host name
            </label>
            <input
              value={hostName}
              onChange={(event) => setHostName(event.target.value)}
              placeholder="Name shown to your guest"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            />

            <button
              onClick={handleCreate}
              disabled={isLoading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-purple-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:bg-purple-500/50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {isLoading ? 'Creating room…' : 'Create room'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

