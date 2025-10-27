'use client';

import { useRouter } from 'next/navigation';
import { Mic, Video, Users, Zap, Shield, Cloud } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Mic className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">PodcastHub</span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/join')}
              className="btn btn-secondary"
            >
              Join Meeting
            </button>
            <button
              onClick={() => router.push('/create')}
              className="btn btn-primary"
            >
              Create Meeting
            </button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-6xl font-bold text-white mb-6">
            Record Your Best
            <span className="block mt-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Podcast Yet
            </span>
          </h1>
          <p className="text-xl text-gray-300 mb-12">
            Professional podcast recording with real-time collaboration,
            multi-track recording, and cloud storage. Just like Riverside.fm.
          </p>

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push('/create')}
              className="btn btn-primary text-lg px-8 py-4"
            >
              Start Recording
            </button>
            <button
              onClick={() => router.push('/join')}
              className="btn btn-secondary text-lg px-8 py-4"
            >
              Join as Guest
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <FeatureCard
            icon={<Video className="w-8 h-8" />}
            title="Multi-Track Recording"
            description="Record audio, video, and screen share separately for maximum flexibility in post-production"
          />
          <FeatureCard
            icon={<Cloud className="w-8 h-8" />}
            title="Real-Time Upload"
            description="Chunks upload to cloud storage during recording. Never lose your content."
          />
          <FeatureCard
            icon={<Users className="w-8 h-8" />}
            title="Host & Guest Roles"
            description="Full control for hosts with mute/unmute, video toggle, and screen share management"
          />
          <FeatureCard
            icon={<Zap className="w-8 h-8" />}
            title="WebRTC Technology"
            description="Peer-to-peer connections for low latency and high-quality audio/video streaming"
          />
          <FeatureCard
            icon={<Shield className="w-8 h-8" />}
            title="Data Integrity"
            description="SHA-256 checksums ensure every chunk is validated and no data is corrupted"
          />
          <FeatureCard
            icon={<Mic className="w-8 h-8" />}
            title="Professional Quality"
            description="1080p video at 30fps, 48kHz audio. Studio-quality recordings every time"
          />
        </div>

        {/* How It Works */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            How It Works
          </h2>
          <div className="space-y-6">
            <Step
              number="1"
              title="Host Creates Meeting"
              description="Start a new session and get a unique room code to share"
            />
            <Step
              number="2"
              title="Guests Join"
              description="Enter the room code and connect via WebRTC for real-time video/audio"
            />
            <Step
              number="3"
              title="Record & Upload"
              description="Recording happens locally, chunks upload to MinIO every 5 seconds"
            />
            <Step
              number="4"
              title="Automatic Processing"
              description="After meeting ends, FFmpeg stitches chunks into final high-quality files"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 mt-20 border-t border-gray-800">
        <div className="text-center text-gray-400">
          <p>Built with Next.js, FastAPI, MinIO, RabbitMQ, and FFmpeg</p>
          <p className="mt-2">Microservices Architecture Project - CAS 735</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl bg-gray-800/50 backdrop-blur border border-gray-700 hover:border-purple-500 transition-all duration-300">
      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 items-start">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white font-bold">{number}</span>
      </div>
      <div>
        <h3 className="text-xl font-semibold text-white mb-1">{title}</h3>
        <p className="text-gray-400">{description}</p>
      </div>
    </div>
  );
}
