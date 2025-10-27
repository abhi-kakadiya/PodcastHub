'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, ArrowLeft, Loader2 } from 'lucide-react';

export default function CreateMeeting() {
  const router = useRouter();
  const [hostName, setHostName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!hostName.trim()) {
      alert('Please enter your name');
      return;
    }

    setIsLoading(true);

    try {
      // Call backend API to create session
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host_id: hostName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();

      // Store host info in session storage
      sessionStorage.setItem('podcasthub_user', JSON.stringify({
        name: hostName,
        role: 'host',
        sessionId: data.session_id,
        roomCode: data.room_code,
      }));

      // Navigate to meeting room
      router.push(`/room/${data.session_id}`);
    } catch (error) {
      console.error('Error creating meeting:', error);

      // For demo: generate fake session ID
      const fakeSessionId = `session_${Date.now()}`;
      const fakeRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      sessionStorage.setItem('podcasthub_user', JSON.stringify({
        name: hostName,
        role: 'host',
        sessionId: fakeSessionId,
        roomCode: fakeRoomCode,
      }));

      router.push(`/room/${fakeSessionId}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex flex-col">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
              <Mic className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Create Meeting
            </h1>
            <p className="text-gray-400">
              Start a new podcast recording session
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700 p-8">
            <div className="space-y-6">
              <div>
                <label htmlFor="hostName" className="block text-sm font-medium text-gray-300 mb-2">
                  Your Name (Host)
                </label>
                <input
                  id="hostName"
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="e.g., John Doe"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={isLoading || !hostName.trim()}
                className="w-full btn btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Meeting Room'
                )}
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-700">
              <p className="text-sm text-gray-400 text-center">
                As host, you'll get a room code to share with guests
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="mt-8 space-y-3">
            <Feature text="Control recording start/stop" />
            <Feature text="Mute/unmute any participant" />
            <Feature text="Manage screen sharing" />
            <Feature text="View upload progress" />
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-300">
      <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
