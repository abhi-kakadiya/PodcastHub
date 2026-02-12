'use client';

import { useState, useEffect, useRef, useCallback, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Users,
  Radio,
  Share2,
  Copy,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { useWebRTC, type SignalMessage } from '@/hooks/use-webrtc';
import { useRecording } from '@/hooks/use-recording';
import { Logo } from '@/components/logo';
import { AppPopup } from '@/components/app-popup';

interface UserData {
  name: string;
  role: 'host' | 'guest';
  sessionId: string;
  roomCode: string;
  audioDeviceId?: string | null;
  videoDeviceId?: string | null;
  micEnabled?: boolean;
  cameraEnabled?: boolean;
}

interface RecordingStatusState {
  status?: string;
  processingStatus?: string;
  recordingId?: string;
  startedAt?: string;
  endedAt?: string;
  progress?: number;
  uploadedChunks?: number;
  totalChunks?: number;
  processedAssetPath?: string;
  processedAt?: string;
}

const SCREEN_ZOOM_MIN = 1;
const SCREEN_ZOOM_MAX = 4;
const SCREEN_ZOOM_STEP = 0.25;

export default function MeetingRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [userData, setUserData] = useState<UserData | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [recordingStatuses, setRecordingStatuses] = useState<Record<string, RecordingStatusState>>({});
  const [expandedView, setExpandedView] = useState<'local' | 'remote' | 'screen' | null>(null);
  const [screenZoom, setScreenZoom] = useState(SCREEN_ZOOM_MIN);
  const [screenPan, setScreenPan] = useState({ x: 0, y: 0 });
  const [isPanningScreen, setIsPanningScreen] = useState(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [manualInviteLink, setManualInviteLink] = useState<string | null>(null);
  const signalHandlerRef = useRef<((message: SignalMessage) => void) | null>(null);

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const expandedVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenViewportRef = useRef<HTMLDivElement | null>(null);
  const inviteFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenPanDragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  useEffect(() => {
    const storedUser = sessionStorage.getItem('podcasthub_user');
    if (!storedUser) {
      router.push('/');
      return;
    }
    setUserData(JSON.parse(storedUser));
  }, [router]);

  useEffect(
    () => () => {
      if (inviteFeedbackTimeout.current) {
        clearTimeout(inviteFeedbackTimeout.current);
      }
    },
    [],
  );

  const showInviteFeedback = useCallback((message: string) => {
    setInviteFeedback(message);
    if (inviteFeedbackTimeout.current) {
      clearTimeout(inviteFeedbackTimeout.current);
    }
    inviteFeedbackTimeout.current = setTimeout(() => {
      setInviteFeedback(null);
    }, 2400);
  }, []);

  const relaySignalToHandler = useCallback((message: SignalMessage) => {
    signalHandlerRef.current?.(message);
  }, []);

  const { streams, controls, isConnected, sendSignal } = useWebRTC({
    sessionId: userData?.sessionId || '',
    participantId: userData?.name || '',
    isHost: userData?.role === 'host',
    mediaPreferences: {
      audioDeviceId: userData?.audioDeviceId ?? null,
      videoDeviceId: userData?.videoDeviceId ?? null,
      initialMicOn: userData?.micEnabled ?? true,
      initialCameraOn: userData?.cameraEnabled ?? true,
    },
    onSignalMessage: relaySignalToHandler,
  });

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
    streams.localStream,
    streams.localStream,
    streams.screenStream,
  );

  const currentRoomCode = userData?.roomCode ?? roomId;

  const broadcastRecordingCommand = useCallback(
    (action: 'start' | 'pause' | 'resume' | 'stop') => {
      if (!userData?.name) {
        return;
      }

      const sent = sendSignal({
        type: 'recording-control',
        action,
        initiatedBy: userData?.name ?? '',
      });

      if (!sent) {
        console.warn('Failed to broadcast recording command:', action);
      }
    },
    [sendSignal, userData?.name],
  );

  const handleStartRecordingClick = useCallback(async () => {
    try {
      await startRecording();
      broadcastRecordingCommand('start');
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, [startRecording, broadcastRecordingCommand]);

  const handlePauseRecordingClick = useCallback(async () => {
    try {
      await pauseRecording();
      broadcastRecordingCommand('pause');
    } catch (error) {
      console.error('Failed to pause recording:', error);
    }
  }, [pauseRecording, broadcastRecordingCommand]);

  const handleResumeRecordingClick = useCallback(async () => {
    try {
      await resumeRecording();
      broadcastRecordingCommand('resume');
    } catch (error) {
      console.error('Failed to resume recording:', error);
    }
  }, [resumeRecording, broadcastRecordingCommand]);

  const handleStopRecordingClick = useCallback(async () => {
    try {
      await stopRecording();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    } finally {
      broadcastRecordingCommand('stop');
    }
  }, [stopRecording, broadcastRecordingCommand]);

  const isHost = userData?.role === 'host';
  const remoteRoleLabel = isHost ? 'Guest' : 'Host';
  const isScreenShareActive = Boolean(streams.screenStream);
  const participants: Array<{
    name: string;
    role: string;
    status: string;
    isActive: boolean;
    isLocal: boolean;
  }> = [
    {
      name: userData?.name ?? 'You',
      role: isHost ? 'Host' : 'Guest',
      status: streams.localStream ? 'Connected' : 'Connecting',
      isActive: true,
      isLocal: true,
    },
    {
      name: streams.remoteStream ? remoteRoleLabel : `${remoteRoleLabel} (waiting)`,
      role: remoteRoleLabel,
      status: streams.remoteStream ? 'Connected' : 'Connecting',
      isActive: !!streams.remoteStream,
      isLocal: false,
    },
  ];

  const recordingStatusEntries = Object.entries(recordingStatuses);
  const uploadTrackEntries = (['audio', 'video', 'screen'] as const).map((track) => ({
    track,
    progress: uploadProgress[track],
  }));

  const processSignalMessage = useCallback(
    (message: SignalMessage) => {
      if (!message || !message.type) return;

      if (message.type === 'recording-control') {
        const initiator = message.initiatedBy || message.initiated_by;
        const action = message.action;

        if (!action || initiator === userData?.name) {
          return;
        }

        const runSafely = async (label: string, op: () => Promise<void>) => {
          try {
            await op();
          } catch (error) {
            console.error(`Failed to ${label} in response to host command:`, error);
          }
        };

        switch (action) {
          case 'start':
            void runSafely('start recording', startRecording);
            break;
          case 'pause':
            void runSafely('pause recording', pauseRecording);
            break;
          case 'resume':
            void runSafely('resume recording', resumeRecording);
            break;
          case 'stop':
            void runSafely('stop recording', stopRecording);
            break;
          default:
            console.warn('Unknown recording-control action received:', action);
        }

        return;
      }

      if (message.type === 'recording-status') {
        const trackKey = message.trackType || message.track_type;
        if (!trackKey) return;

        setRecordingStatuses((prev) => {
          const previous = prev[trackKey];

          const next: RecordingStatusState = {
            ...previous,
            status: message.status ?? previous?.status,
            recordingId: message.recordingId ?? previous?.recordingId,
            startedAt: message.startedAt ?? previous?.startedAt,
            endedAt: message.endedAt ?? previous?.endedAt,
            processingStatus: message.processingStatus ?? previous?.processingStatus,
          };

          return {
            ...prev,
            [trackKey]: next,
          };
        });
      } else if (message.type === 'recording-progress') {
        const trackKey = message.track_type || message.trackType;
        if (!trackKey) return;

        setRecordingStatuses((prev) => {
          const previous = prev[trackKey];

          const next: RecordingStatusState = {
            ...previous,
            status: message.status ?? previous?.status,
            processingStatus: message.processing_status ?? previous?.processingStatus,
            progress: message.progress_percentage ?? previous?.progress,
            uploadedChunks: message.uploaded_chunks ?? previous?.uploadedChunks,
            totalChunks: message.total_chunks ?? previous?.totalChunks,
            processedAssetPath: message.processed_asset_path ?? previous?.processedAssetPath,
            processedAt: message.processed_at ?? previous?.processedAt,
          };

          return {
            ...prev,
            [trackKey]: next,
          };
        });
      }
    },
    [pauseRecording, resumeRecording, startRecording, stopRecording, userData?.name],
  );

  useEffect(() => {
    signalHandlerRef.current = processSignalMessage;
    return () => {
      signalHandlerRef.current = null;
    };
  }, [processSignalMessage]);

  useEffect(() => {
    if (!isRecording || isPaused) return;

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  useEffect(() => {
    const videoEl = screenVideoRef.current;
    const stream = streams.screenStream;

    if (!videoEl) return;

    if (!stream) {
      videoEl.pause();
      videoEl.srcObject = null;
      return;
    }

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    videoEl.play().catch((err) => {
      console.error('Error playing screen video:', err);
    });
  }, [streams.screenStream]);

  useEffect(() => {
    const videoEl = expandedVideoRef.current;
    if (!videoEl || !expandedView) return;

    let stream: MediaStream | null = null;
    if (expandedView === 'local') {
      stream = streams.localStream;
    } else if (expandedView === 'remote') {
      stream = streams.remoteStream;
    } else if (expandedView === 'screen') {
      stream = streams.screenStream;
    }

    if (!stream) {
      setExpandedView(null);
      return;
    }

    videoEl.srcObject = stream;
    const playPromise = videoEl.play();
    if (playPromise) {
      playPromise.catch((err) => {
        console.error('Error playing expanded video:', err);
      });
    }

    return () => {
      videoEl.pause();
      videoEl.srcObject = null;
    };
  }, [expandedView, streams.localStream, streams.remoteStream, streams.screenStream]);

  useEffect(() => {
    if (!expandedView) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expandedView]);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyInviteLink = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const inviteUrl = `${window.location.origin}/room/${roomId}`;
    const shareData = {
      title: 'Join my PodcastHub room',
      text: `Use room code ${currentRoomCode} to join the recording.`,
      url: inviteUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        showInviteFeedback('Invite shared');
        return;
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') {
          return;
        }
        console.warn('Share failed, falling back to copy:', error);
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        showInviteFeedback('Invite link copied');
        return;
      } catch (error) {
        console.error('Failed to copy invite link:', error);
      }
    }

    setManualInviteLink(inviteUrl);
    showInviteFeedback('Invite link ready');
  }, [roomId, currentRoomCode, showInviteFeedback]);

  const handleCopyRoomCode = useCallback(async () => {
    if (!currentRoomCode) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(currentRoomCode);
        showInviteFeedback('Room code copied');
        return;
      } catch (error) {
        console.error('Failed to copy room code:', error);
      }
    }

    showInviteFeedback('Unable to copy room code');
  }, [currentRoomCode, showInviteFeedback]);

  const closeManualInvitePopup = useCallback(() => {
    setManualInviteLink(null);
  }, []);

  const copyInviteFromPopup = useCallback(async () => {
    if (!manualInviteLink) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(manualInviteLink);
        showInviteFeedback('Invite link copied');
        setManualInviteLink(null);
        return;
      } catch (error) {
        console.error('Failed to copy invite link from popup:', error);
      }
    }

    showInviteFeedback('Select and copy the link manually');
  }, [manualInviteLink, showInviteFeedback]);

  const getScreenShareErrorMessage = useCallback(
    (error: unknown) => {
      if (controls.screenShareSupportMessage) {
        return controls.screenShareSupportMessage;
      }

      const errorName = (error as { name?: string })?.name;

      if (errorName === 'NotAllowedError' || errorName === 'AbortError') {
        return 'Screen share was canceled or blocked. Allow permission and try again.';
      }

      if (errorName === 'NotSupportedError' || errorName === 'TypeError') {
        return 'Screen sharing is not available on this device/browser.';
      }

      if (errorName === 'SecurityError') {
        return 'Screen sharing requires a secure HTTPS connection.';
      }

      return 'Unable to start screen share on this device right now.';
    },
    [controls.screenShareSupportMessage],
  );

  const handleScreenShareClick = useCallback(async () => {
    if (controls.isScreenSharing) {
      controls.stopScreenShare();
      return;
    }

    try {
      await controls.startScreenShare();
    } catch (error) {
      console.error('Screen share start failed:', error);
      setScreenShareError(getScreenShareErrorMessage(error));
    }
  }, [controls, getScreenShareErrorMessage]);

  const clampScreenPan = useCallback((pan: { x: number; y: number }, zoomLevel: number) => {
    const viewport = screenViewportRef.current;
    if (!viewport || zoomLevel <= SCREEN_ZOOM_MIN) {
      return { x: 0, y: 0 };
    }

    const { width, height } = viewport.getBoundingClientRect();
    const maxX = Math.max(0, ((zoomLevel - 1) * width) / 2);
    const maxY = Math.max(0, ((zoomLevel - 1) * height) / 2);

    return {
      x: Math.max(-maxX, Math.min(maxX, pan.x)),
      y: Math.max(-maxY, Math.min(maxY, pan.y)),
    };
  }, []);

  const applyScreenZoom = useCallback(
    (delta: number) => {
      setScreenZoom((prevZoom) => {
        const nextZoom = Math.max(SCREEN_ZOOM_MIN, Math.min(SCREEN_ZOOM_MAX, prevZoom + delta));
        setScreenPan((prevPan) => clampScreenPan(prevPan, nextZoom));
        return nextZoom;
      });
    },
    [clampScreenPan],
  );

  const resetScreenViewport = useCallback(() => {
    setScreenZoom(SCREEN_ZOOM_MIN);
    setScreenPan({ x: 0, y: 0 });
    setIsPanningScreen(false);
    screenPanDragRef.current.active = false;
    screenPanDragRef.current.pointerId = null;
  }, []);

  useEffect(() => {
    if (expandedView !== 'screen') {
      resetScreenViewport();
    }
  }, [expandedView, resetScreenViewport]);

  const handleExpandedScreenWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (expandedView !== 'screen') {
        return;
      }

      event.preventDefault();
      const step = event.deltaY < 0 ? SCREEN_ZOOM_STEP : -SCREEN_ZOOM_STEP;
      applyScreenZoom(step);
    },
    [applyScreenZoom, expandedView],
  );

  const handleScreenPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (expandedView !== 'screen' || screenZoom <= SCREEN_ZOOM_MIN) {
        return;
      }

      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      screenPanDragRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: screenPan.x,
        originY: screenPan.y,
      };
      setIsPanningScreen(true);
    },
    [expandedView, screenPan.x, screenPan.y, screenZoom],
  );

  const handleScreenPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = screenPanDragRef.current;
      if (!dragState.active || dragState.pointerId !== event.pointerId) {
        return;
      }

      const nextPan = {
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      };
      setScreenPan(clampScreenPan(nextPan, screenZoom));
    },
    [clampScreenPan, screenZoom],
  );

  const endScreenPanning = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = screenPanDragRef.current;
    if (!dragState.active || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    screenPanDragRef.current.active = false;
    screenPanDragRef.current.pointerId = null;
    setIsPanningScreen(false);
  }, []);

  const closeExpandedView = useCallback(() => setExpandedView(null), []);

  const handleExpand = useCallback(
    (view: 'local' | 'remote' | 'screen') => {
      if (view === 'remote' && !streams.remoteStream) return;
      if (view === 'screen' && !streams.screenStream) return;
      if (view === 'local' && !streams.localStream) return;
      setExpandedView(view);
    },
    [streams.localStream, streams.remoteStream, streams.screenStream],
  );

  const renderLocalTile = () => {
    const baseBorder = isHost ? 'border-purple-500/50' : 'border-white/10';

    return (
      <div
        onClick={() => handleExpand('local')}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleExpand('local');
          }
        }}
        className={`group relative flex aspect-video min-h-[220px] w-full flex-col items-center justify-center overflow-hidden rounded-3xl border ${baseBorder} bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_35px_80px_-40px_rgba(0,0,0,0.85)] ${
          streams.localStream ? 'cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-purple-400/60' : ''
        }`}
      >
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
          <video
            ref={(node) => {
              if (node && streams.localStream && node.srcObject !== streams.localStream) {
                node.srcObject = streams.localStream;
                node.play().catch(console.error);
              }
            }}
            autoPlay
            muted
            playsInline
            className={`max-h-full max-w-full object-cover ${streams.localStream ? 'opacity-100' : 'opacity-0'}`}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent" />
          {!streams.localStream && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 text-center text-xs text-slate-300">
              <Mic className="h-5 w-5 opacity-60" />
              <span>Camera preview will appear once ready.</span>
            </div>
          )}
          {!controls.isCameraOn && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur">
              <VideoOff className="h-10 w-10 text-slate-500" />
              <p className="mt-2 text-xs text-slate-400">Camera disabled</p>
            </div>
          )}
        </div>
        <div className="absolute left-4 bottom-4 flex items-center gap-2 font-medium text-xs">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              isHost ? 'border-purple-400/50 bg-purple-500/30 text-purple-100' : 'border-cyan-400/40 bg-cyan-500/30 text-cyan-100'
            }`}
          >
            {isHost ? 'Host' : 'You'}
          </span>
          <span className="text-sm">{userData?.name ?? 'You'}</span>
        </div>
        <div className="absolute right-4 top-4 flex items-center gap-2 text-xs text-slate-300">
          <span className={`h-2 w-2 rounded-full ${controls.isMicOn ? 'bg-emerald-400' : 'bg-rose-500'}`} />
          {controls.isMicOn ? 'Mic on' : 'Muted'}
        </div>
      </div>
    );
  };

  const renderRemoteTile = () => {
    return (
      <div
        onClick={() => handleExpand('remote')}
        role={streams.remoteStream ? 'button' : undefined}
        tabIndex={streams.remoteStream ? 0 : -1}
        onKeyDown={(event) => {
          if (!streams.remoteStream) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleExpand('remote');
          }
        }}
        className={`relative flex aspect-video min-h-[220px] w-full flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_35px_80px_-40px_rgba(0,0,0,0.85)] ${
          streams.remoteStream ? 'cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-white/40' : ''
        }`}
      >
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
          <video
            ref={(node) => {
              if (node && streams.remoteStream && node.srcObject !== streams.remoteStream) {
                node.srcObject = streams.remoteStream;
                node.play().catch(console.error);
              }
            }}
            autoPlay
            playsInline
            className={`max-h-full max-w-full object-cover ${streams.remoteStream ? 'opacity-100' : 'opacity-0'}`}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent" />
          {!streams.remoteStream && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 text-center text-xs text-slate-400">
              <Users className="h-7 w-7 text-slate-500" />
              <div>
                <p className="text-sm font-medium text-white/80">Waiting for {remoteRoleLabel}</p>
                <p className="text-xs text-slate-400">Ask them to join with the invite link.</p>
              </div>
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute left-4 bottom-4 text-xs">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
            {remoteRoleLabel}
          </span>
        </div>
        {streams.remoteStream && (
          <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Connected
          </div>
        )}
      </div>
    );
  };

  const screenShareTile = streams.screenStream ? (
    <div
      onClick={() => handleExpand('screen')}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleExpand('screen');
        }
      }}
      className="relative flex w-full overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_45px_90px_-50px_rgba(0,0,0,0.85)] cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-sky-400/60 transition-all duration-300"
    >
      <video ref={screenVideoRef} autoPlay playsInline className="h-full w-full bg-black object-contain" />
      <div className="absolute left-5 bottom-5 flex items-center gap-2 text-sm font-medium">
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-100">
          Screen share
        </span>
        <span>{isHost ? 'You' : remoteRoleLabel}</span>
      </div>
    </div>
  ) : null;

  const renderScreenShareLayout = () => (
    <div className="grid min-h-[360px] gap-4 lg:grid-cols-[2fr_minmax(280px,1fr)]">
      <div className="flex h-full rounded-3xl border border-white/10 bg-white/[0.02] p-3 lg:p-4">
        {screenShareTile}
      </div>
      <div className="grid h-full grid-rows-2 gap-4">
        {renderLocalTile()}
        {renderRemoteTile()}
      </div>
    </div>
  );

  const renderStandardLayout = () => (
    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2">
      {renderLocalTile()}
      {renderRemoteTile()}
    </div>
  );

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
      <div className="flex min-h-screen items-center justify-center bg-[#080910] text-slate-100">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-slate-300">
          Preparing your studio...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080910] text-slate-100">
      <div className="flex h-screen flex-col">
        <header className="border-b border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-lg md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Logo subtitle="Studio controls" />
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                <span className="text-slate-500">Room code</span>
                <span className="font-semibold text-white">{currentRoomCode}</span>
                <button
                  onClick={() => void handleCopyRoomCode()}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/8 text-slate-300 transition hover:border-white/30 hover:bg-white/15 hover:text-white"
                  title="Copy room code"
                  aria-label="Copy room code"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <span className={`h-2 w-2 rounded-full ${isRecording ? 'animate-pulse bg-emerald-400' : 'bg-slate-400'}`} />
                  {isRecording ? 'Recording in progress' : 'Ready to record'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  <Users className="h-3.5 w-3.5" />
                  {isConnected ? 'All peers connected' : 'Connecting...'}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-start gap-1 md:items-end">
              <button
                onClick={handleCopyInviteLink}
                className="inline-flex items-center gap-2 rounded-full bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400"
              >
                <Share2 className="h-4 w-4" />
                Invite
              </button>
              {inviteFeedback && (
                <span className="text-xs text-slate-400 md:text-slate-300">{inviteFeedback}</span>
              )}
            </div>
          </div>
        </header>

        <main className="flex flex-1 overflow-hidden">
          <section className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
              {isScreenShareActive ? renderScreenShareLayout() : renderStandardLayout()}
            </div>

            <div className="px-4 pb-6 md:px-8">
              <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-5 backdrop-blur md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <span className={`h-2 w-2 rounded-full ${isRecording ? 'animate-pulse bg-emerald-400' : 'bg-slate-400'}`} />
                    {isRecording ? (isPaused ? 'Recording paused' : 'Recording') : 'Standby'}
                  </span>
                  <span>Elapsed: {formatTime(elapsedTime)}</span>
                </div>

                <div className="flex flex-wrap justify-center gap-3 md:order-none">
                  <button
                    onClick={controls.toggleMic}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border transition hover:border-white/30 ${
                      controls.isMicOn
                        ? 'border-white/15 bg-white/5 text-white'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    }`}
                    title={controls.isMicOn ? 'Mute microphone' : 'Unmute microphone'}
                  >
                    {controls.isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={controls.toggleCamera}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border transition hover:border-white/30 ${
                      controls.isCameraOn
                        ? 'border-white/15 bg-white/5 text-white'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    }`}
                    title={controls.isCameraOn ? 'Stop camera' : 'Start camera'}
                  >
                    {controls.isCameraOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => {
                      void handleScreenShareClick();
                    }}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border transition hover:border-white/30 ${
                      controls.isScreenSharing
                        ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                        : controls.canScreenShare
                          ? 'border-white/15 bg-white/5 text-white'
                          : 'border-white/10 bg-white/5 text-slate-500'
                    }`}
                    title={
                      controls.isScreenSharing
                        ? 'Stop sharing'
                        : controls.canScreenShare
                          ? 'Share screen'
                          : controls.screenShareSupportMessage ?? 'Screen share unavailable'
                    }
                  >
                    {controls.isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                  </button>
                  {isHost && !isRecording && (
                    <button
                      onClick={handleStartRecordingClick}
                      disabled={!isConnected}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-red-500/45 disabled:text-white/80"
                      title="Start recording"
                    >
                      <Radio className="h-5 w-5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 md:justify-end">
                  {isHost && isRecording && !isPaused && (
                    <>
                      <button
                        onClick={handlePauseRecordingClick}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-300"
                      >
                        Pause
                      </button>
                      <button
                        onClick={handleStopRecordingClick}
                        className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:border-red-400"
                      >
                        Stop
                      </button>
                    </>
                  )}
                  {isHost && isPaused && (
                    <>
                      <button
                        onClick={handleResumeRecordingClick}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300"
                      >
                        Resume
                      </button>
                      <button
                        onClick={handleStopRecordingClick}
                        className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:border-red-400"
                      >
                        Stop
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleLeaveMeeting}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-400"
                    title="Leave meeting"
                  >
                    <PhoneOff className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="hidden w-full max-w-[17.5rem] flex-col border-l border-white/10 bg-white/[0.03] backdrop-blur lg:flex xl:max-w-[18.75rem]">
            <div className="border-b border-white/10 px-6 py-5">
              <h2 className="text-base font-semibold text-white">Session ID</h2>
              <p className="mt-2 text-xs text-slate-400">{userData?.sessionId ?? roomId}</p>
              <p className="mt-1 text-xs text-slate-500">
                {isConnected ? 'Peer connected' : 'Waiting for peer connection'}
              </p>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Participants</h3>
                <div className="mt-3 space-y-3">
                  {participants.map(({ name, role, status, isActive, isLocal }) => (
                    <div
                      key={`${name}-${role}`}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold ${isLocal ? 'border border-purple-400/40 bg-purple-500/20 text-purple-100' : 'border border-white/10 bg-white/5 text-slate-200'}`}>
                          {name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'P'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white/90">{name}</p>
                          <p className="text-xs text-slate-400">{role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                        {status}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recording status</h3>
                <div className="mt-3 space-y-3">
                  {recordingStatusEntries.length === 0 ? (
                    <p className="text-xs text-slate-500">No tracks have been recorded yet.</p>
                  ) : (
                    recordingStatusEntries.map(([trackKey, status]) => (
                      <div key={trackKey} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold capitalize text-white">{trackKey}</p>
                            <p className="text-xs text-slate-400">{status.status ?? 'idle'}</p>
                          </div>
                          <span className="text-xs text-slate-400">
                            {status.progress !== undefined ? `${Math.round(status.progress)}%` : '--'}
                          </span>
                        </div>
                        {status.uploadedChunks !== undefined && status.totalChunks !== undefined && (
                          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-emerald-400"
                              style={{
                                width: `${status.totalChunks > 0 ? Math.min(100, (status.uploadedChunks / status.totalChunks) * 100) : 0}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Upload progress</h3>
                <div className="mt-3 space-y-3">
                  {uploadTrackEntries.map(({ track, progress }) => (
                    <div key={track} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span className="capitalize">{track}</span>
                        <span>
                          {progress.total > 0 ? `${progress.uploaded}/${progress.total} chunks` : 'Waiting'}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-purple-400"
                          style={{ width: `${progress.total > 0 ? Math.min(100, (progress.uploaded / progress.total) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </main>

        {expandedView && (
          <div
            onClick={closeExpandedView}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-6"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-slate-900/80 shadow-2xl backdrop-blur-xl"
            >
              <div
                ref={screenViewportRef}
                onWheel={handleExpandedScreenWheel}
                onPointerDown={handleScreenPointerDown}
                onPointerMove={handleScreenPointerMove}
                onPointerUp={endScreenPanning}
                onPointerCancel={endScreenPanning}
                className={`relative h-[min(78vh,calc(100vh-7rem))] w-full overflow-hidden bg-black ${
                  expandedView === 'screen'
                    ? `${screenZoom > SCREEN_ZOOM_MIN ? (isPanningScreen ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'} touch-none`
                    : 'cursor-default'
                }`}
              >
                <video
                  ref={expandedVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full bg-black object-contain"
                  style={
                    expandedView === 'screen'
                      ? {
                          transform: `translate(${screenPan.x}px, ${screenPan.y}px) scale(${screenZoom})`,
                          transformOrigin: 'center center',
                          transition: isPanningScreen ? 'none' : 'transform 140ms ease-out',
                        }
                      : undefined
                  }
                />
              </div>
              {expandedView === 'screen' && (
                <div className="absolute top-5 right-5 z-20 flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-2 py-1 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => applyScreenZoom(-SCREEN_ZOOM_STEP)}
                    disabled={screenZoom <= SCREEN_ZOOM_MIN}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:border-white/35 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="min-w-12 text-center text-xs font-semibold text-slate-200">
                    {Math.round(screenZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => applyScreenZoom(SCREEN_ZOOM_STEP)}
                    disabled={screenZoom >= SCREEN_ZOOM_MAX}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:border-white/35 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={resetScreenViewport}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:border-white/35 hover:bg-white/20"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="absolute left-0 right-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/30 to-transparent px-6 py-4 text-sm text-white">
                <div>
                  <p className="font-semibold">
                    {expandedView === 'local'
                      ? isHost
                        ? 'Host (You)'
                        : 'You'
                      : expandedView === 'remote'
                        ? remoteRoleLabel
                        : 'Screen share'}
                  </p>
                  {expandedView === 'screen' && (
                    <p className="mt-1 text-xs text-slate-300">Scroll or use +/- to zoom. Drag to pan.</p>
                  )}
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    closeExpandedView();
                  }}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white transition hover:border-white/40 hover:bg-white/20"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Uploads still in progress</h2>
                <p className="text-xs text-slate-400">
                  Leaving now could stop the current upload. Stay a little longer to finish?
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Stay in studio
              </button>
              <button
                onClick={confirmLeave}
                className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-400"
              >
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <AppPopup
        open={Boolean(screenShareError)}
        tone="warning"
        title="Screen share unavailable"
        message={screenShareError ?? ''}
        onClose={() => setScreenShareError(null)}
        actions={[
          {
            label: 'Close',
            tone: 'secondary',
            onClick: () => setScreenShareError(null),
          },
        ]}
      />

      <AppPopup
        open={Boolean(manualInviteLink)}
        tone="info"
        title="Copy invite link"
        message="Share this link manually if auto-copy is unavailable."
        onClose={closeManualInvitePopup}
        actions={[
          {
            label: 'Close',
            tone: 'secondary',
            onClick: closeManualInvitePopup,
          },
          {
            label: 'Copy link',
            onClick: () => {
              void copyInviteFromPopup();
            },
          },
        ]}
      >
        <input
          value={manualInviteLink ?? ''}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-xs text-slate-200 outline-none"
        />
      </AppPopup>
    </div>
  );
}
