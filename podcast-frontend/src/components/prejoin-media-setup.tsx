'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Camera, Mic, RefreshCw, VideoOff } from 'lucide-react';

export interface MediaDeviceSelection {
  audioDeviceId: string | null;
  videoDeviceId: string | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
}

interface PreJoinMediaSetupProps {
  onSelectionChange?: (selection: MediaDeviceSelection) => void;
  micEnabled: boolean;
  cameraEnabled: boolean;
  className?: string;
}

const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
};

const DEFAULT_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
};

export function PreJoinMediaSetup({
  onSelectionChange,
  micEnabled,
  cameraEnabled,
  className = '',
}: PreJoinMediaSetupProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicTestActive, setIsMicTestActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const stopPreviewStream = useCallback(() => {
    if (!previewStreamRef.current) return;
    previewStreamRef.current.getTracks().forEach((track) => track.stop());
    previewStreamRef.current = null;
    setPreviewStream(null);
  }, []);

  const replacePreviewStream = useCallback(
    (stream: MediaStream) => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      previewStreamRef.current = stream;
      setPreviewStream(stream);
    },
    [],
  );

  const refreshDeviceLists = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setAudioDevices(devices.filter((device) => device.kind === 'audioinput'));
    setVideoDevices(devices.filter((device) => device.kind === 'videoinput'));
  }, []);

  const applySelection = useCallback(
    async (audioDeviceId: string | null, videoDeviceId: string | null) => {
      setIsLoadingPreview(true);
      setError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioDeviceId
            ? {
                ...DEFAULT_AUDIO_CONSTRAINTS,
                deviceId: { exact: audioDeviceId },
              }
            : DEFAULT_AUDIO_CONSTRAINTS,
          video: videoDeviceId
            ? {
                ...DEFAULT_VIDEO_CONSTRAINTS,
                deviceId: { exact: videoDeviceId },
              }
            : DEFAULT_VIDEO_CONSTRAINTS,
        });

        replacePreviewStream(stream);
        await refreshDeviceLists();

        const activeAudioDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? null;
        const activeVideoDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;

        if (!audioDeviceId && activeAudioDeviceId) {
          setSelectedAudioDeviceId(activeAudioDeviceId);
        }
        if (!videoDeviceId && activeVideoDeviceId) {
          setSelectedVideoDeviceId(activeVideoDeviceId);
        }
      } catch (err) {
        console.error('Failed to initialize preview stream:', err);
        setError('Cannot access camera or microphone. Check browser permissions and device settings.');
        stopPreviewStream();
        await refreshDeviceLists();
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [refreshDeviceLists, replacePreviewStream, stopPreviewStream],
  );

  const stopMicMeter = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    meterDataRef.current = null;
    setMicLevel(0);
  }, []);

  const startMicMeter = useCallback(
    (stream: MediaStream) => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        setError('Selected microphone has no active audio track.');
        setIsMicTestActive(false);
        return;
      }

      stopMicMeter();

      try {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;

        const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
        source.connect(analyser);

        audioContextRef.current = context;
        analyserRef.current = analyser;
        meterDataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

        const animate = () => {
          const activeAnalyser = analyserRef.current;
          const data = meterDataRef.current;

          if (!activeAnalyser || !data) {
            return;
          }

          activeAnalyser.getByteTimeDomainData(data);

          let sumSquares = 0;
          for (let i = 0; i < data.length; i += 1) {
            const normalized = (data[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }

          const rms = Math.sqrt(sumSquares / data.length);
          const normalizedLevel = Math.min(1, rms * 4.2);
          setMicLevel((prev) => prev * 0.45 + normalizedLevel * 0.55);
          animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);
      } catch (err) {
        console.error('Failed to start mic meter:', err);
        setError('Unable to start mic test for this device.');
        setIsMicTestActive(false);
      }
    },
    [stopMicMeter],
  );

  useEffect(() => {
    void applySelection(null, null);
  }, [applySelection]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    const onDeviceChange = () => {
      void refreshDeviceLists();
    };

    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    };
  }, [refreshDeviceLists]);

  useEffect(() => {
    if (!videoRef.current) return;

    if (!previewStream) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      return;
    }

    if (videoRef.current.srcObject !== previewStream) {
      videoRef.current.srcObject = previewStream;
    }

    void videoRef.current.play().catch((err) => {
      console.error('Unable to autoplay preview:', err);
    });
  }, [previewStream]);

  useEffect(() => {
    if (!onSelectionChange) return;
    onSelectionChange({
      audioDeviceId: selectedAudioDeviceId,
      videoDeviceId: selectedVideoDeviceId,
      micEnabled,
      cameraEnabled,
    });
  }, [cameraEnabled, micEnabled, onSelectionChange, selectedAudioDeviceId, selectedVideoDeviceId]);

  useEffect(() => {
    if (!previewStream) {
      return;
    }

    const audioTrack = previewStream.getAudioTracks()[0];
    const videoTrack = previewStream.getVideoTracks()[0];

    if (audioTrack) {
      audioTrack.enabled = micEnabled;
    }
    if (videoTrack) {
      videoTrack.enabled = cameraEnabled;
    }

    if (!micEnabled && isMicTestActive) {
      setIsMicTestActive(false);
      setMicLevel(0);
    }
  }, [cameraEnabled, micEnabled, isMicTestActive, previewStream]);

  useEffect(() => {
    if (!isMicTestActive) {
      stopMicMeter();
      return;
    }

    if (!previewStream) {
      setError('Preview stream is not ready. Grant access and try again.');
      setIsMicTestActive(false);
      return;
    }

    startMicMeter(previewStream);
    return () => {
      stopMicMeter();
    };
  }, [isMicTestActive, previewStream, startMicMeter, stopMicMeter]);

  useEffect(
    () => () => {
      stopMicMeter();
      stopPreviewStream();
    },
    [stopMicMeter, stopPreviewStream],
  );

  const meterBars = useMemo(() => {
    const count = 20;
    const activeBars = Math.round(micLevel * count);
    return Array.from({ length: count }, (_, index) => {
      const intensity = (index + 1) / count;
      const active = index < activeBars;
      return {
        active,
        intensity,
      };
    });
  }, [micLevel]);

  return (
    <section className={`mt-4 rounded-3xl border border-white/10 bg-black/20 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Device setup</h2>
          <p className="mt-1 text-xs text-slate-400">Preview camera and validate mic input before entering.</p>
        </div>
        <button
          type="button"
          onClick={() => void applySelection(selectedAudioDeviceId, selectedVideoDeviceId)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoadingPreview ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
          <div className="relative aspect-video h-full min-h-[220px]">
            <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
            {!previewStream && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/80 px-4">
                <div className="flex flex-col items-center gap-2 text-center text-xs text-slate-400">
                  <Camera className="h-5 w-5 text-slate-500" />
                  <span>{isLoadingPreview ? 'Preparing preview...' : 'Camera preview unavailable'}</span>
                </div>
              </div>
            )}
            {previewStream && !cameraEnabled && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/92 px-4">
                <div className="-translate-y-1 flex flex-col items-center gap-2.5 text-center">
                  <VideoOff className="h-6 w-6 text-slate-500" />
                  <span className="text-sm font-medium text-slate-300">Camera is turned off for this session.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <label className="block">
            <span className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              <Camera className="h-3.5 w-3.5" />
              Camera device
            </span>
            <select
              value={selectedVideoDeviceId ?? ''}
              onChange={(event) => {
                const nextVideoId = event.target.value || null;
                setSelectedVideoDeviceId(nextVideoId);
                void applySelection(selectedAudioDeviceId, nextVideoId);
              }}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            >
              {videoDevices.length === 0 && <option value="">No camera found</option>}
              {videoDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              <Mic className="h-3.5 w-3.5" />
              Microphone device
            </span>
            <select
              value={selectedAudioDeviceId ?? ''}
              onChange={(event) => {
                const nextAudioId = event.target.value || null;
                setSelectedAudioDeviceId(nextAudioId);
                void applySelection(nextAudioId, selectedVideoDeviceId);
              }}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            >
              {audioDevices.length === 0 && <option value="">No microphone found</option>}
              {audioDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                <AudioLines className="h-4 w-4 text-emerald-300" />
                Mic level
              </div>
              <button
                type="button"
                onClick={() => setIsMicTestActive((prev) => !prev)}
                disabled={!micEnabled}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isMicTestActive
                    ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isMicTestActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                {!micEnabled ? 'Enable mic' : isMicTestActive ? 'Testing' : 'Test'}
              </button>
            </div>

            <div className="mt-3 flex items-end gap-1 rounded-xl border border-white/10 bg-black/25 px-2 py-2">
              {meterBars.map((bar, index) => {
                let activeColor = 'bg-emerald-400';
                if (bar.intensity > 0.85) {
                  activeColor = 'bg-rose-400';
                } else if (bar.intensity > 0.65) {
                  activeColor = 'bg-amber-400';
                }

                return (
                  <div
                    key={`meter-${index}`}
                    className={`h-6 w-full rounded-sm transition-colors duration-100 ${
                      bar.active ? `${activeColor} shadow-[0_0_10px_rgba(52,211,153,0.4)]` : 'bg-white/10'
                    }`}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {isMicTestActive ? 'Speak and confirm bars light up with your voice.' : 'Start mic test to verify input.'}
            </p>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
    </section>
  );
}
