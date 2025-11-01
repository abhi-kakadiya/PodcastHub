'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Download,
  Film,
  Headphones,
  Loader2,
  Mic,
  Monitor,
  Users,
} from 'lucide-react';

type TrackType = 'audio' | 'video' | 'screen' | string;

interface TrackFile {
  recording_id: string;
  participant_id?: string;
  track_type: TrackType;
  status: string;
  processing_status: string;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  uploaded_chunks: number;
  total_chunks: number;
  processed_asset_path?: string | null;
  processed_asset_url?: string | null;
  download_filename?: string | null;
}

interface TrackSummaryItem {
  track_type: TrackType;
  total: number;
  processed: number;
  tracks: TrackFile[];
}

interface ParticipantTracks {
  participant_id: string;
  tracks: TrackFile[];
}

interface HostSession {
  session_id: string;
  room_code?: string | null;
  host_id?: string | null;
  status?: string | null;
  derived_status?: string | null;
  created_at?: string | null;
  first_recorded_at?: string | null;
  last_updated_at?: string | null;
  participants: ParticipantTracks[];
  total_tracks: number;
  processed_tracks?: number;
  track_summary?: TrackSummaryItem[];
}

interface HostSessionsResponse {
  host_id: string;
  total_sessions: number;
  sessions: HostSession[];
}

type GroupedSessions = Record<string, HostSession[]>;

const trackIcon = (type: TrackType) => {
  switch (type) {
    case 'audio':
      return <Headphones className="h-4 w-4 text-emerald-300" />;
    case 'video':
      return <Film className="h-4 w-4 text-purple-300" />;
    case 'screen':
      return <Monitor className="h-4 w-4 text-sky-300" />;
    default:
      return <Users className="h-4 w-4 text-slate-300" />;
  }
};

const statusStyles: Record<string, string> = {
  complete: 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
  processing: 'border border-amber-400/30 bg-amber-400/15 text-amber-200',
  needs_attention: 'border border-rose-400/30 bg-rose-500/15 text-rose-200',
  pending: 'border border-slate-500/20 bg-slate-500/10 text-slate-300',
};

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return null;
  }
  const key = status.toLowerCase();
  const style = statusStyles[key] ?? statusStyles.pending;
  const label =
    key === 'complete'
      ? 'Ready'
      : key === 'processing'
      ? 'Processing'
      : key === 'needs_attention'
      ? 'Needs attention'
      : 'Pending';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

export default function HostDashboard() {
  const router = useRouter();
  const [hostId, setHostId] = useState<string | null>(null);
  const [data, setData] = useState<HostSessionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }),
    [],
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
    [],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.sessionStorage.getItem('podcasthub_user');
    if (!stored) {
      router.push('/');
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (parsed.role !== 'host') {
        router.push('/');
        return;
      }
      setHostId(parsed.name);
      fetchSessions(parsed.name);
    } catch (err) {
      console.error('Unable to parse session storage', err);
      router.push('/');
    }
  }, [router]);

  const fetchSessions = async (hostName: string) => {
    try {
      setLoading(true);
      setError(null);
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
      const response = await fetch(`${base}/hosts/${encodeURIComponent(hostName)}/sessions`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload: HostSessionsResponse = await response.json();
      setData(payload);
    } catch (err) {
      console.error('Failed to load host sessions', err);
      setError('Unable to load your recordings right now. Please try again in a minute.');
    } finally {
      setLoading(false);
    }
  };

  const sortedSessions = useMemo(() => {
    if (!data) return [];
    return [...data.sessions].sort((a, b) => {
      const left = b.last_updated_at || b.first_recorded_at || b.created_at || '';
      const right = a.last_updated_at || a.first_recorded_at || a.created_at || '';
      return left.localeCompare(right);
    });
  }, [data]);

  const groupedSessions: GroupedSessions = useMemo(() => {
    if (!sortedSessions.length) return {};

    return sortedSessions.reduce<GroupedSessions>((acc, session) => {
      const candidate =
        session.first_recorded_at || session.created_at || session.last_updated_at;
      const key = candidate ? dateFormatter.format(new Date(candidate)) : 'Unknown date';
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(session);
      return acc;
    }, {});
  }, [sortedSessions, dateFormatter]);

  const formatTime = (value?: string | null) => {
    if (!value) return '';
    return timeFormatter.format(new Date(value));
  };

  const handleDownload = (url?: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080910] text-slate-200">
        <div className="glass-panel inline-flex items-center gap-2 rounded-3xl px-5 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-purple-200" />
          Fetching your library...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080910] text-slate-200">
        <div className="glass-panel max-w-md rounded-3xl px-6 py-5 text-center text-sm text-rose-200">
          <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-rose-300" />
          {error}
        </div>
      </div>
    );
  }

  if (!data || !hostId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#080910] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-white">Recording Library</h1>
            <p className="text-xs text-slate-400">
              Sessions hosted by <span className="font-medium text-slate-200">{hostId}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white"
            >
              <Users className="h-4 w-4" />
              Dashboard
            </button>
            <button
              onClick={() => router.push('/create')}
              className="inline-flex items-center gap-2 rounded-full bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-400"
            >
              <Mic className="h-4 w-4" />
              Start new session
            </button>
          </div>
        </header>

        {data.sessions.length === 0 ? (
          <div className="mt-16 flex flex-1 items-center justify-center">
            <div className="glass-panel max-w-md rounded-3xl px-6 py-8 text-center text-sm text-slate-300">
              <Users className="mx-auto mb-4 h-10 w-10 text-slate-500" />
              <p className="font-medium text-white">No recordings yet</p>
              <p className="mt-2 text-xs text-slate-400">
                Create a session, invite your guests, and your recordings will appear here
                once processing finishes.
              </p>
            </div>
          </div>
        ) : (
          <main className="mt-10 space-y-10">
            {Object.entries(groupedSessions).map(([dateLabel, sessions]) => (
              <section key={dateLabel} className="space-y-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  {dateLabel}
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {sessions.map((session) => (
                    <article
                      key={session.session_id}
                      className="glass-panel flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
                    >
                      <header className="space-y-2">
                        <div className="flex items-center justify-between text-sm text-slate-300">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-white">
                              Room {session.room_code ?? session.session_id}
                            </span>
                            <span className="text-xs text-slate-500">
                              Session ID: <span className="font-mono text-slate-400">{session.session_id}</span>
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {session.last_updated_at && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                <Clock className="h-4 w-4" />
                                {formatTime(session.last_updated_at)}
                              </span>
                            )}
                            <StatusBadge status={session.derived_status || session.status} />
                          </div>
                        </div>
                      </header>

                      {session.track_summary && session.track_summary.length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-3">
                          {session.track_summary.map((summary) => (
                            <div
                              key={`${session.session_id}-${summary.track_type}`}
                              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300"
                            >
                              <div className="flex items-center gap-2 text-sm font-medium text-white">
                                {trackIcon(summary.track_type)}
                                {summary.track_type.toUpperCase()}
                              </div>
                              <p className="mt-2 text-xs text-slate-400">
                                {summary.processed}/{summary.total} ready
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-5">
                        {session.participants.map((participant) => (
                          <div key={participant.participant_id} className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                              {participant.participant_id === hostId ? 'Host' : 'Guest'} -{' '}
                              <span className="text-slate-200">{participant.participant_id}</span>
                            </p>
                            <div className="space-y-3">
                              {participant.tracks.map((track) => (
                                <div
                                  key={track.recording_id}
                                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="inline-flex items-center gap-2 font-medium text-white">
                                      {trackIcon(track.track_type)}
                                      {track.track_type.toUpperCase()}
                                    </div>
                                    <span className="text-xs text-slate-500">
                                      {track.status} / {track.processing_status}
                                    </span>
                                  </div>
                                  <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                                    <span>
                                      Uploaded {track.uploaded_chunks}/{track.total_chunks} chunks
                                    </span>
                                    {track.started_at && (
                                      <span>Started {formatTime(track.started_at)}</span>
                                    )}
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <button
                                      onClick={() => handleDownload(track.processed_asset_url)}
                                      disabled={!track.processed_asset_url}
                                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      {track.processed_asset_url ? 'Download' : 'Processing'}
                                    </button>
                                    <span className="text-[10px] text-slate-500">
                                      {track.download_filename ?? track.recording_id.slice(0, 8)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </main>
        )}
      </div>
    </div>
  );
}

