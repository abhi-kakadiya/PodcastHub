import { useState, useRef, useCallback } from 'react';

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
}

interface UploadProgress {
  audio: { uploaded: number; total: number };
  video: { uploaded: number; total: number };
  screen: { uploaded: number; total: number };
}

const CHUNK_INTERVAL = 5000; // 5 seconds
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
    audio: { recorder: null, recordingId: null, sequence: 0, uploadedChunks: 0, totalChunks: 0 },
    video: { recorder: null, recordingId: null, sequence: 0, uploadedChunks: 0, totalChunks: 0 },
    screen: { recorder: null, recordingId: null, sequence: 0, uploadedChunks: 0, totalChunks: 0 },
  });

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

  // Start recording
  const startRecording = useCallback(async () => {
    try {
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
          track_types: [
            audioStream ? 'audio' : null,
            videoStream ? 'video' : null,
            screenStream ? 'screen' : null,
          ].filter(Boolean),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start recording');
      }

      const data = await response.json();
      const recordingIds = data.recording_ids;

      // Create and start recorders for each active stream
      if (audioStream && recordingIds.audio) {
        const recorder = createRecorder('audio', audioStream, recordingIds.audio);
        if (recorder) {
          recorders.current.audio.recorder = recorder;
          recorders.current.audio.recordingId = recordingIds.audio;
          recorders.current.audio.sequence = 0;
          recorders.current.audio.uploadedChunks = 0;
          recorders.current.audio.totalChunks = 0;
          recorder.start(CHUNK_INTERVAL);
          console.log('OK Audio recorder started');
        }
      }

      if (videoStream && recordingIds.video) {
        const recorder = createRecorder('video', videoStream, recordingIds.video);
        if (recorder) {
          recorders.current.video.recorder = recorder;
          recorders.current.video.recordingId = recordingIds.video;
          recorders.current.video.sequence = 0;
          recorders.current.video.uploadedChunks = 0;
          recorders.current.video.totalChunks = 0;
          recorder.start(CHUNK_INTERVAL);
          console.log('OK Video recorder started');
        }
      }

      if (screenStream && recordingIds.screen) {
        const recorder = createRecorder('screen', screenStream, recordingIds.screen);
        if (recorder) {
          recorders.current.screen.recorder = recorder;
          recorders.current.screen.recordingId = recordingIds.screen;
          recorders.current.screen.sequence = 0;
          recorders.current.screen.uploadedChunks = 0;
          recorders.current.screen.totalChunks = 0;
          recorder.start(CHUNK_INTERVAL);
          console.log('Screen recorder started');
        }
      }

      setIsRecording(true);
      console.log('Recording started with real-time upload');
    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }, [sessionId, participantId, apiUrl, audioStream, videoStream, screenStream, createRecorder]);

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
      Object.values(recorders.current).forEach(({ recorder }) => {
        if (recorder && recorder.state === 'recording') {
          recorder.pause();
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
      Object.values(recorders.current).forEach(({ recorder }) => {
        if (recorder && recorder.state === 'paused') {
          recorder.resume();
        }
      });

      setIsPaused(false);
      console.log('Recording resumed');
    } catch (error) {
      console.error('Error resuming recording:', error);
      throw error;
    }
  }, [sessionId, participantId, apiUrl]);

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
        audio: { recorder: null, recordingId: null, sequence: 0, uploadedChunks: 0, totalChunks: 0 },
        video: { recorder: null, recordingId: null, sequence: 0, uploadedChunks: 0, totalChunks: 0 },
        screen: { recorder: null, recordingId: null, sequence: 0, uploadedChunks: 0, totalChunks: 0 },
      };

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
