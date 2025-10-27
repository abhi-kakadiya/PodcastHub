'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Users, Radio, Circle, Clock, Upload, AlertTriangle
} from 'lucide-react';
import { useWebRTC } from '@/hooks/use-webrtc';
import { useRecording } from '@/hooks/use-recording';

interface UserData {
  name: string;
  role: 'host' | 'guest';
  sessionId: string;
  roomCode: string;
}

export default function MeetingRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [userData, setUserData] = useState<UserData | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // Load user data
  useEffect(() => {
    const storedUser = sessionStorage.getItem('podcasthub_user');
    if (!storedUser) {
      router.push('/');
      return;
    }
    setUserData(JSON.parse(storedUser));
  }, [router]);

  // WebRTC hook
  const { streams, controls, isConnected } = useWebRTC({
    sessionId: userData?.sessionId || '',
    participantId: userData?.name || '',
    isHost: userData?.role === 'host',
  });

  // Recording hook - pass localStream for both audio and video
  // The hook will internally separate audio/video tracks
  const {
    isRecording,
    isPaused,
    uploadProgress,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    areUploadsComplete,
  } = useRecording(
    {
      sessionId: userData?.sessionId || '',
      participantId: userData?.name || '',
      apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api',
    },
    streams.localStream, // Audio source
    streams.localStream, // Video source (same stream, hook will separate tracks)
    streams.screenStream  // Screen share
  );

  // Recording timer
  useEffect(() => {
    if (!isRecording || isPaused) return;

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && streams.localStream) {
      console.log('🎥 Attaching local stream');
      localVideoRef.current.srcObject = streams.localStream;
      localVideoRef.current.play().catch(err => {
        console.error('Error playing local video:', err);
      });
    }
  }, [streams.localStream]);

  // Attach remote stream
  useEffect(() => {
    if (remoteVideoRef.current && streams.remoteStream) {
      console.log('🎥 Attaching remote stream');
      remoteVideoRef.current.srcObject = streams.remoteStream;
      
      // Ensure playback
      const playPromise = remoteVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.error('Error playing remote video:', err);
          // Try again after a short delay
          setTimeout(() => {
            remoteVideoRef.current?.play().catch(console.error);
          }, 100);
        });
      }
    }
  }, [streams.remoteStream]);

  // Attach screen stream
  useEffect(() => {
    if (screenVideoRef.current && streams.screenStream) {
      console.log('🖥️ Attaching screen stream');
      screenVideoRef.current.srcObject = streams.screenStream;
      screenVideoRef.current.play().catch(err => {
        console.error('Error playing screen video:', err);
      });
    }
  }, [streams.screenStream]);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLeaveMeeting = () => {
    const hasPendingUploads = !areUploadsComplete() && isRecording;

    if (hasPendingUploads) {
      setShowLeaveModal(true);
    } else {
      sessionStorage.removeItem('podcasthub_user');
      router.push('/');
    }
  };

  const confirmLeave = () => {
    sessionStorage.removeItem('podcasthub_user');
    router.push('/');
  };

  if (!userData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const isHost = userData.role === 'host';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800/50 backdrop-blur border-b border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                <span className="text-white font-semibold">Room: {userData.roomCode}</span>
              </div>
              {isConnected && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500">
                  <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                  <span className="text-green-400 text-sm font-medium">Connected</span>
                </div>
              )}
              {isRecording && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500">
                  <Circle className="w-3 h-3 fill-red-500 text-red-500 animate-pulse" />
                  <span className="text-red-400 text-sm font-medium">
                    {isPaused ? 'PAUSED' : 'RECORDING'}
                  </span>
                  <Clock className="w-4 h-4 text-red-400 ml-2" />
                  <span className="text-red-400 text-sm font-mono">{formatTime(elapsedTime)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isHost && (
                <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500 text-purple-400 text-sm">
                  Host
                </span>
              )}
              <span className="text-gray-300">{userData.name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 flex flex-col gap-6 overflow-auto">
        {/* Video Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Local Video */}
          <div className="relative rounded-2xl overflow-hidden bg-gray-800 min-h-[300px]">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 left-3 px-3 py-1 rounded-lg bg-black/50 backdrop-blur">
              <span className="text-white text-sm">{userData.name} (You)</span>
            </div>
            {!controls.isCameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800">
                <VideoOff className="w-12 h-12 text-gray-500 mb-2" />
                <span className="text-gray-400 text-sm">Camera Off</span>
              </div>
            )}
            {!controls.isMicOn && (
              <div className="absolute top-3 left-3">
                <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500 flex items-center justify-center">
                  <MicOff className="w-4 h-4 text-red-500" />
                </div>
              </div>
            )}
          </div>

          {/* Remote Video */}
          <div className="relative rounded-2xl overflow-hidden bg-gray-800 min-h-[300px]">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 left-3 px-3 py-1 rounded-lg bg-black/50 backdrop-blur">
              <span className="text-white text-sm">{isHost ? 'Guest' : 'Host'}</span>
            </div>
            {!streams.remoteStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800">
                <Users className="w-12 h-12 text-gray-500 mb-2" />
                <span className="text-gray-400">Waiting for participant...</span>
              </div>
            )}
          </div>
        </div>

        {/* Screen Share */}
        {controls.isScreenSharing && (
          <div className="relative rounded-2xl overflow-hidden bg-gray-800 min-h-[400px]">
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-500">
              <span className="text-purple-400 text-sm font-medium">Screen Share Active</span>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {isRecording && (
          <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="w-5 h-5 text-purple-400" />
              <span className="text-white font-medium">Real-time Upload Progress</span>
            </div>
            <div className="space-y-2">
              {(['audio', 'video', 'screen'] as const).map((track) => {
                const progress = uploadProgress[track];
                if (progress.total === 0) return null;
                
                const percentage = progress.total > 0 ? (progress.uploaded / progress.total) * 100 : 0;
                return (
                  <div key={track}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-400 capitalize">{track}</span>
                      <span className="text-gray-400">
                        {progress.uploaded}/{progress.total} chunks ({Math.round(percentage)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Controls Footer */}
      <footer className="bg-gray-800/50 backdrop-blur border-t border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Media Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={controls.toggleMic}
                className={`p-3 rounded-full transition-colors ${
                  controls.isMicOn
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
                title={controls.isMicOn ? 'Mute' : 'Unmute'}
              >
                {controls.isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              <button
                onClick={controls.toggleCamera}
                className={`p-3 rounded-full transition-colors ${
                  controls.isCameraOn
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
                title={controls.isCameraOn ? 'Stop Video' : 'Start Video'}
              >
                {controls.isCameraOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              <button
                onClick={controls.isScreenSharing ? controls.stopScreenShare : controls.startScreenShare}
                className={`p-3 rounded-full transition-colors ${
                  controls.isScreenSharing
                    ? 'bg-purple-500 hover:bg-purple-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
                title={controls.isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
              >
                {controls.isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
              </button>
            </div>

            {/* Recording Controls */}
            <div className="flex items-center gap-2">
              {isHost && !isRecording && (
                <button
                  onClick={startRecording}
                  disabled={!isConnected}
                  className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!isConnected ? 'Wait for participant to connect' : 'Start recording'}
                >
                  <Radio className="w-5 h-5" />
                  Start Recording
                </button>
              )}

              {isHost && isRecording && !isPaused && (
                <>
                  <button
                    onClick={pauseRecording}
                    className="px-6 py-3 rounded-full bg-yellow-500 text-white font-medium hover:bg-yellow-600 transition-colors"
                  >
                    Pause Recording
                  </button>
                  <button
                    onClick={stopRecording}
                    className="px-6 py-3 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                  >
                    Stop Recording
                  </button>
                </>
              )}

              {isHost && isPaused && (
                <>
                  <button
                    onClick={resumeRecording}
                    className="px-6 py-3 rounded-full bg-green-500 text-white font-medium hover:bg-green-600 transition-colors"
                  >
                    Resume Recording
                  </button>
                  <button
                    onClick={stopRecording}
                    className="px-6 py-3 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                  >
                    Stop Recording
                  </button>
                </>
              )}
            </div>

            {/* Leave Button */}
            <button
              onClick={handleLeaveMeeting}
              className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
              title="Leave Meeting"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      </footer>

      {/* Leave Meeting Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <h2 className="text-xl font-bold text-white">Uploads Pending</h2>
            </div>
            <p className="text-gray-300 mb-6">
              Some recording chunks are still uploading. If you leave now, they may be lost. Are you sure you want to leave?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 px-4 py-3 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                Stay in Meeting
              </button>
              <button
                onClick={confirmLeave}
                className="flex-1 px-4 py-3 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}