import { useState, useRef, useCallback, useEffect } from 'react';

interface RecordingConfig {
  sessionId: string;
  participantId: string;
  apiUrl: string;
}

interface TrackRecorder {
  recorder: MediaRecorder | null;
  recordingId: string | null;
  sequence: number;
  uploadedChunks: number;
  totalChunks: number;
  needsRestartAfterPause: boolean;
}

interface UploadProgress {
  audio: { uploaded: number; total: number };
  video: { uploaded: number; total: number };
  screen: { uploaded: number; total: number };
}

type TrackType = 'audio' | 'video' | 'screen';

const DEFAULT_CHUNK_INTERVAL_MS = 4000; // 4s chunks keep payloads larger and reduce request overhead
const envChunkInterval = Number(process.env.NEXT_PUBLIC_CHUNK_INTERVAL_MS);
const CHUNK_INTERVAL =
  Number.isFinite(envChunkInterval) && envChunkInterval > 0 ? envChunkInterval : DEFAULT_CHUNK_INTERVAL_MS;
const MAX_UPLOAD_RETRIES = 5;

export function useRecording(
  config: RecordingConfig,
  audioStream: MediaStream | null,
  videoStream: MediaStream | null,
  screenStream: MediaStream | null
) {
  const { sessionId, participantId, apiUrl } = config;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    audio: { uploaded: 0, total: 0 },
    video: { uploaded: 0, total: 0 },
    screen: { uploaded: 0, total: 0 },
  });

  const recorders = useRef<{
    audio: TrackRecorder;
    video: TrackRecorder;
    screen: TrackRecorder;
  }>({
    audio: {
      recorder: null,
      recordingId: null,
      sequence: 0,
      uploadedChunks: 0,
      totalChunks: 0,
      needsRestartAfterPause: false,
    },
    video: {
      recorder: null,
      recordingId: null,
      sequence: 0,
      uploadedChunks: 0,
      totalChunks: 0,
      needsRestartAfterPause: false,
    },
    screen: {
      recorder: null,
      recordingId: null,
      sequence: 0,
      uploadedChunks: 0,
      totalChunks: 0,
      needsRestartAfterPause: false,
    },
  });
  const screenTrackSyncInFlight = useRef(false);

  // Calculate SHA-256 checksum
  const calculateChecksum = async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  // Upload chunk to backend
  const uploadChunk = useCallback(
    async (
      trackType: 'audio' | 'video' | 'screen',
      recordingId: string,
      sequence: number,
      blob: Blob,
      attempt: number = 0
    ): Promise<boolean> => {
    try {
      const checksum = await calculateChecksum(blob);
      const formData = new FormData();

      formData.append('recording_id', recordingId);
      formData.append('sequence', sequence.toString());
      formData.append('checksum', checksum);
      formData.append('chunk_file', blob, `${trackType}_chunk_${sequence}.webm`);

      const response = await fetch(`${apiUrl}/uploads/chunk`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
      }

      // Update progress
      recorders.current[trackType].uploadedChunks++;
      setUploadProgress((prev) => ({
        ...prev,
        [trackType]: {
          uploaded: recorders.current[trackType].uploadedChunks,
          total: recorders.current[trackType].totalChunks,
        },
      }));

      console.log(`${trackType} chunk ${sequence} uploaded successfully`);
      return true;
    } catch (error) {
      console.error(`${trackType} chunk ${sequence} upload failed:`, error);

      // Retry with exponential backoff
      if (attempt < MAX_UPLOAD_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`  Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_UPLOAD_RETRIES})`);

        await new Promise((resolve) => setTimeout(resolve, delay));
        return uploadChunk(trackType, recordingId, sequence, blob, attempt + 1);
      }

      console.error(`${trackType} chunk ${sequence} PERMANENTLY FAILED after ${MAX_UPLOAD_RETRIES} retries`);
      return false;
    }
  },
    [apiUrl]
  );

  // Create audio-only stream from video stream
  const createAudioOnlyStream = (stream: MediaStream): MediaStream => {
    const audioTracks = stream.getAudioTracks();
    return new MediaStream(audioTracks);
  };

  // Create video-only stream from video stream
  const createVideoOnlyStream = (stream: MediaStream): MediaStream => {
    const videoTracks = stream.getVideoTracks();
    return new MediaStream(videoTracks);
  };

  // Create recorder for a track
  const createRecorder = useCallback(
    (
      trackType: 'audio' | 'video' | 'screen',
      stream: MediaStream,
      recordingId: string
    ): MediaRecorder | null => {
      try {
        let recordStream = stream;
        const options: MediaRecorderOptions = {};

        if (trackType === 'audio') {
          // Audio-only recording
          recordStream = createAudioOnlyStream(stream);
          
          if (recordStream.getAudioTracks().length === 0) {
            console.warn('No audio tracks available for audio recording');
            return null;
          }

          // Try different audio codecs
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options.mimeType = 'audio/webm';
          } else {
            console.error('No supported audio format found');
            return null;
          }
          
          options.audioBitsPerSecond = 128000;
        } else if (trackType === 'video') {
          // Video with audio recording
          if (stream.getVideoTracks().length === 0) {
            console.warn('No video tracks available for video recording');
            return null;
          }

          // Try different video codecs
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
            options.mimeType = 'video/webm;codecs=vp9,opus';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
            options.mimeType = 'video/webm;codecs=vp8,opus';
          } else if (MediaRecorder.isTypeSupported('video/webm')) {
            options.mimeType = 'video/webm';
          } else {
            console.error('No supported video format found');
            return null;
          }
          
          options.videoBitsPerSecond = 2500000;
          options.audioBitsPerSecond = 128000;
        } else if (trackType === 'screen') {
          // Screen recording (video only, no audio from screen)
          if (stream.getVideoTracks().length === 0) {
            console.warn('No video tracks available for screen recording');
            return null;
          }

          recordStream = createVideoOnlyStream(stream);

          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            options.mimeType = 'video/webm;codecs=vp9';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
            options.mimeType = 'video/webm;codecs=vp8';
          } else if (MediaRecorder.isTypeSupported('video/webm')) {
            options.mimeType = 'video/webm';
          } else {
            console.error('No supported video format found');
            return null;
          }
          
          options.videoBitsPerSecond = 3000000;
        }

        console.log(`Creating ${trackType} recorder with:`, {
          mimeType: options.mimeType,
          audioTracks: recordStream.getAudioTracks().length,
          videoTracks: recordStream.getVideoTracks().length,
        });

        const recorder = new MediaRecorder(recordStream, options);

        recorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            const sequence = recorders.current[trackType].sequence++;
            recorders.current[trackType].totalChunks++;

            // Update total count
            setUploadProgress((prev) => ({
              ...prev,
              [trackType]: {
                ...prev[trackType],
                total: recorders.current[trackType].totalChunks,
              },
            }));

            // Upload chunk immediately
            console.log(`Uploading ${trackType} chunk ${sequence} (${event.data.size} bytes)...`);
            await uploadChunk(trackType, recordingId, sequence, event.data);
          }
        };

        recorder.onerror = (event: Event) => {
          console.error(`Recorder error for ${trackType}:`, event);
        };

        recorder.onstop = () => {
          console.log(`${trackType} recorder stopped`);
        };

        return recorder;
      } catch (error) {
        console.error(`Error creating ${trackType} recorder:`, error);
        return null;
      }
    },
    [uploadChunk]
  );

  const startScreenTrackWhileRecording = useCallback(
    async (stream: MediaStream) => {
      if (screenTrackSyncInFlight.current) {
        return;
      }

      const existing = recorders.current.screen.recorder;
      if (existing && existing.state !== 'inactive') {
        return;
      }

      if (stream.getVideoTracks().length === 0) {
        return;
      }

      screenTrackSyncInFlight.current = true;
      try {
        const response = await fetch(`${apiUrl}/recordings/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            participant_id: participantId,
            track_types: ['screen'],
          }),
        });

        if (!response.ok) {
          let detail = 'Failed to start screen recording track';
          try {
            const error = await response.json();
            detail = error.detail ?? detail;
          } catch {
            // Ignore JSON parse errors and keep fallback message.
          }
          throw new Error(detail);
        }

        const data = await response.json();
        const screenRecordingId = data.recording_ids?.screen;
        if (!screenRecordingId) {
          throw new Error('Screen recording ID was not returned by the backend.');
        }

        const recorder = createRecorder('screen', stream, screenRecordingId);
        if (!recorder) {
          // Stop orphaned backend track when local recorder cannot be created.
          await fetch(`${apiUrl}/recordings/${screenRecordingId}/stop`, { method: 'POST' });
          throw new Error('Unable to create a local screen recorder for this browser.');
        }

        recorders.current.screen = {
          recorder,
          recordingId: screenRecordingId,
          sequence: 0,
          uploadedChunks: 0,
          totalChunks: 0,
          needsRestartAfterPause: false,
        };
        setUploadProgress((prev) => ({
          ...prev,
          screen: { uploaded: 0, total: 0 },
        }));
        recorder.start(CHUNK_INTERVAL);
        console.log('Screen recorder started dynamically during active recording');
      } catch (error) {
        console.error('Failed to start dynamic screen recording track:', error);
      } finally {
        screenTrackSyncInFlight.current = false;
      }
    },
    [apiUrl, createRecorder, participantId, sessionId]
  );

  const stopScreenTrackWhileRecording = useCallback(async () => {
    if (screenTrackSyncInFlight.current) {
      return;
    }

    const trackState = recorders.current.screen;
    if (!trackState.recorder && !trackState.recordingId) {
      return;
    }

    screenTrackSyncInFlight.current = true;
    try {
      if (trackState.recorder && trackState.recorder.state !== 'inactive') {
        trackState.recorder.stop();
      }

      // Allow final `ondataavailable` flush before stopping server-side track.
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (trackState.recordingId) {
        await fetch(`${apiUrl}/recordings/${trackState.recordingId}/stop`, { method: 'POST' });
      }

      recorders.current.screen.recorder = null;
      recorders.current.screen.recordingId = null;
      recorders.current.screen.needsRestartAfterPause = false;
      console.log('Screen recorder stopped dynamically during active recording');
    } catch (error) {
      console.error('Failed to stop dynamic screen recording track:', error);
    } finally {
      screenTrackSyncInFlight.current = false;
    }
  }, [apiUrl]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const availableTracks: Record<TrackType, boolean> = {
        audio: Boolean(audioStream && audioStream.getAudioTracks().length > 0),
        video: Boolean(videoStream && videoStream.getVideoTracks().length > 0),
        screen: Boolean(screenStream && screenStream.getVideoTracks().length > 0),
      };

      const trackTypes = (Object.entries(availableTracks) as [TrackType, boolean][])
        .filter(([, isAvailable]) => isAvailable)
        .map(([track]) => track);

      if (trackTypes.length === 0) {
        throw new Error('No media track is available to record. Enable microphone, camera, or screen share first.');
      }

      console.log('Starting recording with streams:', {
        audio: !!audioStream,
        video: !!videoStream,
        screen: !!screenStream,
      });

      // Start recording via API to get recording IDs
      const response = await fetch(`${apiUrl}/recordings/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
          track_types: trackTypes,
        }),
      });

      if (!response.ok) {
        let detail = 'Failed to start recording';
        try {
          const error = await response.json();
          detail = error.detail ?? detail;
        } catch {
          // Ignore JSON parse errors and use fallback message.
        }
        throw new Error(detail);
      }

      const data = await response.json();
      const recordingIds = data.recording_ids;
      let startedRecorderCount = 0;

      setUploadProgress({
        audio: { uploaded: 0, total: 0 },
        video: { uploaded: 0, total: 0 },
        screen: { uploaded: 0, total: 0 },
      });

      // Create and start recorders for each active stream
      if (availableTracks.audio && audioStream && recordingIds.audio) {
        const recorder = createRecorder('audio', audioStream, recordingIds.audio);
        if (recorder) {
          recorders.current.audio.recorder = recorder;
          recorders.current.audio.recordingId = recordingIds.audio;
          recorders.current.audio.sequence = 0;
          recorders.current.audio.uploadedChunks = 0;
          recorders.current.audio.totalChunks = 0;
          recorders.current.audio.needsRestartAfterPause = false;
          recorder.start(CHUNK_INTERVAL);
          startedRecorderCount++;
          console.log('OK Audio recorder started');
        }
      }

      if (availableTracks.video && videoStream && recordingIds.video) {
        const recorder = createRecorder('video', videoStream, recordingIds.video);
        if (recorder) {
          recorders.current.video.recorder = recorder;
          recorders.current.video.recordingId = recordingIds.video;
          recorders.current.video.sequence = 0;
          recorders.current.video.uploadedChunks = 0;
          recorders.current.video.totalChunks = 0;
          recorders.current.video.needsRestartAfterPause = false;
          recorder.start(CHUNK_INTERVAL);
          startedRecorderCount++;
          console.log('OK Video recorder started');
        }
      }

      if (availableTracks.screen && screenStream && recordingIds.screen) {
        const recorder = createRecorder('screen', screenStream, recordingIds.screen);
        if (recorder) {
          recorders.current.screen.recorder = recorder;
          recorders.current.screen.recordingId = recordingIds.screen;
          recorders.current.screen.sequence = 0;
          recorders.current.screen.uploadedChunks = 0;
          recorders.current.screen.totalChunks = 0;
          recorders.current.screen.needsRestartAfterPause = false;
          recorder.start(CHUNK_INTERVAL);
          startedRecorderCount++;
          console.log('Screen recorder started');
        }
      }

      if (startedRecorderCount === 0) {
        // If no browser recorder started, ensure backend state is cleaned up.
        try {
          await fetch(`${apiUrl}/recordings/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              participant_id: participantId,
            }),
          });
        } catch (cleanupError) {
          console.warn('Failed to clean up backend recording session after local start failure', cleanupError);
        }

        throw new Error('No compatible recorder could be started for available media tracks on this browser.');
      }

      setIsRecording(true);
      setIsPaused(false);
      console.log('Recording started with real-time upload');
    } catch (error) {
      setIsRecording(false);
      setIsPaused(false);
      console.error('Error starting recording:', error);
      throw error;
    }
  }, [sessionId, participantId, apiUrl, audioStream, videoStream, screenStream, createRecorder]);

  useEffect(() => {
    if (!isRecording || isPaused) {
      return;
    }

    const hasScreenTrack = Boolean(screenStream && screenStream.getVideoTracks().length > 0);
    const screenRecorder = recorders.current.screen.recorder;
    const hasActiveScreenRecorder = Boolean(screenRecorder && screenRecorder.state !== 'inactive');
    const existingRecordingId = recorders.current.screen.recordingId;

    if (hasScreenTrack && screenStream && !hasActiveScreenRecorder && existingRecordingId) {
      const recorder = createRecorder('screen', screenStream, existingRecordingId);
      if (recorder) {
        recorders.current.screen.recorder = recorder;
        recorders.current.screen.needsRestartAfterPause = false;
        recorder.start(CHUNK_INTERVAL);
        console.log('Recovered inactive screen recorder during active recording');
      }
      return;
    }

    if (hasScreenTrack && screenStream && !hasActiveScreenRecorder && !existingRecordingId) {
      void startScreenTrackWhileRecording(screenStream);
      return;
    }

    if (!hasScreenTrack && (hasActiveScreenRecorder || existingRecordingId)) {
      void stopScreenTrackWhileRecording();
    }
  }, [isRecording, isPaused, screenStream, createRecorder, startScreenTrackWhileRecording, stopScreenTrackWhileRecording]);

  // Pause recording
  const pauseRecording = useCallback(async () => {
    try {
      await fetch(`${apiUrl}/recordings/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
        }),
      });

      // Pause all active recorders
      Object.entries(recorders.current).forEach(([trackKey, trackState]) => {
        const recorder = trackState.recorder;
        if (!recorder) {
          return;
        }

        if (recorder.state === 'recording' && typeof recorder.pause === 'function') {
          try {
            recorder.pause();
            trackState.needsRestartAfterPause = false;
            return;
          } catch (error) {
            console.warn(`Pause failed for ${trackKey}; stopping instead`, error);
          }
        }

        if (recorder.state === 'recording') {
          console.warn(`Pausing ${trackKey} by stopping recorder (pause unsupported)`);
          try {
            recorder.stop();
          } catch (stopError) {
            console.error(`Error stopping ${trackKey} recorder while pausing:`, stopError);
          }
          trackState.recorder = null;
          trackState.needsRestartAfterPause = true;
        }
      });

      setIsPaused(true);
      console.log('Recording paused');
    } catch (error) {
      console.error('Error pausing recording:', error);
      throw error;
    }
  }, [sessionId, participantId, apiUrl]);

  // Resume recording
  const resumeRecording = useCallback(async () => {
    try {
      await fetch(`${apiUrl}/recordings/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
        }),
      });

      // Resume all active recorders
      const trackStreams = {
        audio: audioStream,
        video: videoStream,
        screen: screenStream,
      };

      (['audio', 'video', 'screen'] as const).forEach((trackType) => {
        const track = recorders.current[trackType];
        const recorder = track.recorder;

        if (recorder && recorder.state === 'paused') {
          try {
            recorder.resume();
            track.needsRestartAfterPause = false;
            return;
          } catch (error) {
            console.warn(`Resume failed for ${trackType} recorder; recreating`, error);
            track.recorder = null;
            track.needsRestartAfterPause = true;
          }
        }

        const shouldRestart = !recorder || track.needsRestartAfterPause || recorder.state === 'inactive';
        if (!shouldRestart) {
          return;
        }

        const sourceStream = trackStreams[trackType];
        if (!sourceStream || !track.recordingId) {
          console.warn(`Cannot restart ${trackType} recorder: missing stream or recording ID`);
          return;
        }

        const newRecorder = createRecorder(trackType, sourceStream, track.recordingId);
        if (newRecorder) {
          track.recorder = newRecorder;
          track.needsRestartAfterPause = false;
          newRecorder.start(CHUNK_INTERVAL);
          console.log(`Recreated ${trackType} recorder for resume`);
        }
      });

      setIsPaused(false);
      console.log('Recording resumed');
    } catch (error) {
      console.error('Error resuming recording:', error);
      throw error;
    }
  }, [sessionId, participantId, apiUrl, audioStream, videoStream, screenStream, createRecorder]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    try {
      // Stop all active recorders
      Object.values(recorders.current).forEach(({ recorder }) => {
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      });

      // Wait for final chunks to upload
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Notify backend
      await fetch(`${apiUrl}/recordings/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
        }),
      });

      setIsRecording(false);
      setIsPaused(false);

      // Reset recorders
      recorders.current = {
        audio: {
          recorder: null,
          recordingId: null,
          sequence: 0,
          uploadedChunks: 0,
          totalChunks: 0,
          needsRestartAfterPause: false,
        },
        video: {
          recorder: null,
          recordingId: null,
          sequence: 0,
          uploadedChunks: 0,
          totalChunks: 0,
          needsRestartAfterPause: false,
        },
        screen: {
          recorder: null,
          recordingId: null,
          sequence: 0,
          uploadedChunks: 0,
          totalChunks: 0,
          needsRestartAfterPause: false,
        },
      };
      screenTrackSyncInFlight.current = false;

      console.log('Recording stopped');
    } catch (error) {
      console.error('Error stopping recording:', error);
      throw error;
    }
  }, [sessionId, participantId, apiUrl]);

  // Check if uploads are complete
  const areUploadsComplete = useCallback(() => {
    return Object.values(recorders.current).every(
      ({ uploadedChunks, totalChunks, recorder }) => 
        !recorder || uploadedChunks >= totalChunks
    );
  }, []);

  return {
    isRecording,
    isPaused,
    uploadProgress,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    areUploadsComplete,
  };
}
