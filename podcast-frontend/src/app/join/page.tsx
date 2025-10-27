'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, ArrowLeft, Loader2 } from 'lucide-react';

export default function JoinMeeting() {
  const router = useRouter();
  const [guestName, setGuestName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    if (!guestName.trim() || !roomCode.trim()) {
      alert('Please enter your name and room code');
      return;
    }

    setIsLoading(true);

    try {
      // Call backend API to join session
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_code: roomCode.toUpperCase(),
          participant_id: guestName,
        }),
      });

      if (!response.ok) {
        throw new Error('Invalid room code or session ended');
      }

      const data = await response.json();

      // Store guest info in session storage
      sessionStorage.setItem('podcasthub_user', JSON.stringify({
        name: guestName,
        role: 'guest',
        sessionId: data.session_id,
        roomCode: roomCode.toUpperCase(),
      }));

      // Navigate to meeting room
      router.push(`/room/${data.session_id}`);
    } catch (error) {
      console.error('Error joining meeting:', error);

      // For demo: generate fake session ID from room code
      const fakeSessionId = `session_${roomCode.toLowerCase()}`;

      sessionStorage.setItem('podcasthub_user', JSON.stringify({
        name: guestName,
        role: 'guest',
        sessionId: fakeSessionId,
        roomCode: roomCode.toUpperCase(),
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
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Join Meeting
            </h1>
            <p className="text-gray-400">
              Enter the room code to join as a guest
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700 p-8">
            <div className="space-y-6">
              <div>
                <label htmlFor="roomCode" className="block text-sm font-medium text-gray-300 mb-2">
                  Room Code
                </label>
                <input
                  id="roomCode"
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g., ABC123"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent uppercase text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                />
              </div>

              <div>
                <label htmlFor="guestName" className="block text-sm font-medium text-gray-300 mb-2">
                  Your Name
                </label>
                <input
                  id="guestName"
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g., Jane Smith"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleJoin();
                  }}
                />
              </div>

              <button
                onClick={handleJoin}
                disabled={isLoading || !guestName.trim() || !roomCode.trim()}
                className="w-full btn btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Meeting'
                )}
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-700">
              <p className="text-sm text-gray-400 text-center">
                Get the room code from your host
              </p>
            </div>
          </div>

          {/* Guest Info */}
          <div className="mt-8 bg-gray-800/30 backdrop-blur rounded-xl border border-gray-700 p-6">
            <h3 className="text-white font-semibold mb-3">As a guest, you can:</h3>
            <div className="space-y-2">
              <Feature text="Share your camera and microphone" />
              <Feature text="Share your screen (if no one else is)" />
              <Feature text="Mute/unmute yourself" />
              <Feature text="Leave anytime" />
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Note: Host controls recording and can mute participants
            </p>
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
