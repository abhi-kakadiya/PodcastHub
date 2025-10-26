/**
 * Multi-Track WebRTC Recorder (Riverside.fm Pattern)
 *
 * Records three separate tracks simultaneously:
 * 1. Audio-only (microphone)
 * 2. Video (camera + microphone)
 * 3. Screen share (screen + audio)
 *
 * Each track:
 * - Has its own MediaRecorder and MediaStream
 * - Gets a separate recording ID from backend
 * - Uploads chunks independently
 * - Can be monitored separately in the UI
 *
 * Features:
 * - Progressive chunked upload (every 5 seconds)
 * - Retry logic with exponential backoff
 * - Pause/Resume all tracks together
 * - Synchronized start/stop across all tracks
 */

const API_URL = 'http://localhost:8001/api';
const CHUNK_SIZE = 5000; // 5 seconds
const MAX_RETRIES = 5;

// Track types
const TRACK_TYPES = {
    AUDIO: 'audio',
    VIDEO: 'video',
    SCREEN: 'screen'
};

// Track state - one entry per track type
const trackStates = {
    audio: createTrackState('audio'),
    video: createTrackState('video'),
    screen: createTrackState('screen')
};

// Global state
let isRecording = false;
let isPaused = false;
let startTime = null;
let durationInterval = null;

/**
 * Create initial state for a track
 */
function createTrackState(trackType) {
    return {
        trackType: trackType,
        mediaRecorder: null,
        mediaStream: null,
        recordingId: null,
        uploadId: null,
        chunkSequence: 0,
        uploadQueue: [],
        pendingChunks: new Map(),
        isActive: false,
        error: null
    };
}

// ==================== Logging ====================

function log(trackType, message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] [${trackType.toUpperCase()}] ${message}`;

    const logElement = document.getElementById(`log-${trackType}`);
    if (logElement) {
        const entry = document.createElement('div');
        entry.className = `log-${level}`;
        entry.textContent = logEntry;
        logElement.appendChild(entry);
        logElement.scrollTop = logElement.scrollHeight;
    }

    console.log(logEntry);
}

function updateTrackStatus(trackType, status) {
    const statusElement = document.getElementById(`status-${trackType}`);
    if (statusElement) {
        statusElement.textContent = status;
    }
}

function updateTrackProgress(trackType, uploaded, total) {
    const progressElement = document.getElementById(`progress-${trackType}`);
    if (progressElement && total > 0) {
        const percentage = Math.round((uploaded / total) * 100);
        progressElement.textContent = `${uploaded}/${total} chunks (${percentage}%)`;
    }
}

// ==================== Checksum Calculation ====================

async function calculateChecksum(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== Chunk Upload ====================

async function uploadChunkWithRetry(trackType, blob, sequence, currentAttempt = 0) {
    const state = trackStates[trackType];

    if (currentAttempt >= MAX_RETRIES) {
        log(trackType, `✗ Chunk ${sequence} PERMANENTLY FAILED after ${MAX_RETRIES} retries`, 'error');
        return;
    }

    try {
        state.pendingChunks.set(sequence, true);
        log(trackType, `Uploading chunk ${sequence} (attempt ${currentAttempt + 1}/${MAX_RETRIES})...`);

        // Calculate checksum
        const checksum = await calculateChecksum(blob);

        // Create form data
        const formData = new FormData();
        formData.append('upload_id', String(state.uploadId));
        formData.append('sequence_number', String(sequence));
        formData.append('checksum', checksum);
        formData.append('chunk_file', blob, `chunk_${sequence}.webm`);

        const response = await fetch(`${API_URL}/uploads/chunk`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let errorDetail = response.statusText;
            try {
                const errorData = await response.json();
                errorDetail = errorData.detail || errorDetail;
            } catch (e) {
                // Response not JSON
            }
            throw new Error(`HTTP ${response.status}: ${errorDetail}`);
        }

        state.pendingChunks.delete(sequence);
        log(trackType, `✓ Chunk ${sequence} uploaded successfully`, 'success');

        // Update progress
        const uploadedCount = sequence + 1;
        updateTrackProgress(trackType, uploadedCount, state.chunkSequence);

    } catch (error) {
        state.pendingChunks.delete(sequence);
        log(trackType, `✗ Chunk ${sequence} upload failed: ${error.message}`, 'error');

        // Retry with exponential backoff
        const retryDelay = Math.min(1000 * Math.pow(2, currentAttempt), 10000);
        log(trackType, `Retrying chunk ${sequence} in ${retryDelay / 1000}s...`);

        await new Promise(resolve => setTimeout(resolve, retryDelay));
        await uploadChunkWithRetry(trackType, blob, sequence, currentAttempt + 1);
    }
}

function queueChunk(trackType, blob, sequence) {
    const state = trackStates[trackType];
    state.uploadQueue.push({ blob, sequence });
    log(trackType, `Chunk ${sequence} queued (${Math.round(blob.size / 1024)}KB)`, 'info');
    processUploadQueue(trackType);
}

async function processUploadQueue(trackType) {
    const state = trackStates[trackType];

    while (state.uploadQueue.length > 0) {
        const item = state.uploadQueue[0];

        if (state.pendingChunks.has(item.sequence)) {
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
        }

        state.uploadQueue.shift();
        await uploadChunkWithRetry(trackType, item.blob, item.sequence);
    }
}

// ==================== Media Stream Capture ====================

async function captureAudioStream() {
    return await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    });
}

async function captureVideoStream() {
    return await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        },
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
        }
    });
}

async function captureScreenStream() {
    return await navigator.mediaDevices.getDisplayMedia({
        video: {
            cursor: "always",
            displaySurface: "monitor"
        },
        audio: true
    });
}

// ==================== Track Recording Lifecycle ====================

async function startTrack(trackType) {
    const state = trackStates[trackType];

    try {
        log(trackType, 'Starting track...');
        updateTrackStatus(trackType, '🔄 Initializing...');

        // Capture media stream based on track type
        log(trackType, 'Requesting media access...');

        if (trackType === TRACK_TYPES.AUDIO) {
            state.mediaStream = await captureAudioStream();
        } else if (trackType === TRACK_TYPES.VIDEO) {
            state.mediaStream = await captureVideoStream();
        } else if (trackType === TRACK_TYPES.SCREEN) {
            state.mediaStream = await captureScreenStream();
        }

        log(trackType, '✓ Media access granted', 'success');

        // Get session/participant IDs from form
        const sessionId = document.getElementById('sessionId').value;
        const participantId = document.getElementById('participantId').value;

        // Start recording on backend
        log(trackType, 'Starting recording on server...');
        const response = await fetch(`${API_URL}/recordings/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                participant_id: participantId,
                track_type: trackType
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to start recording: ${response.statusText}`);
        }

        const data = await response.json();
        state.recordingId = data.recording_id;

        log(trackType, `✓ Recording started: ${state.recordingId}`, 'success');

        // Initialize upload session
        log(trackType, 'Initializing upload session...');
        const uploadResponse = await fetch(`${API_URL}/uploads/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recording_id: state.recordingId,
                session_id: sessionId,
                file_name: `${participantId}_${trackType}_${state.recordingId}.webm`,
                mime_type: trackType === TRACK_TYPES.AUDIO ? 'audio/webm' : 'video/webm',
                total_chunks: 100
            })
        });

        if (!uploadResponse.ok) {
            throw new Error(`Failed to initialize upload: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        state.uploadId = uploadData.upload_id;
        log(trackType, `✓ Upload session created: ${state.uploadId}`, 'success');

        // Set up MediaRecorder
        const mimeType = trackType === TRACK_TYPES.AUDIO ? 'audio/webm' : 'video/webm';
        state.mediaRecorder = new MediaRecorder(state.mediaStream, {
            mimeType: mimeType,
            audioBitsPerSecond: 128000
        });

        state.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                queueChunk(trackType, event.data, state.chunkSequence);
                state.chunkSequence++;
            }
        };

        state.mediaRecorder.onerror = (event) => {
            log(trackType, `MediaRecorder error: ${event.error}`, 'error');
        };

        // Start recording with chunks every 5 seconds
        state.mediaRecorder.start(CHUNK_SIZE);
        state.isActive = true;

        updateTrackStatus(trackType, '🔴 Recording');
        log(trackType, '✓ Local recording started', 'success');

        return true;

    } catch (error) {
        log(trackType, `❌ Error: ${error.message}`, 'error');
        updateTrackStatus(trackType, '❌ Failed');
        state.error = error.message;

        // Clean up on error
        if (state.mediaStream) {
            state.mediaStream.getTracks().forEach(track => track.stop());
            state.mediaStream = null;
        }

        return false;
    }
}

async function pauseTrack(trackType) {
    const state = trackStates[trackType];

    if (!state.mediaRecorder || !state.recordingId) return;

    try {
        log(trackType, 'Pausing...');

        // Pause local MediaRecorder
        if (state.mediaRecorder.state === 'recording') {
            state.mediaRecorder.pause();
        }

        // Pause on server
        const response = await fetch(`${API_URL}/recordings/${state.recordingId}/pause`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Failed to pause: ${response.statusText}`);
        }

        updateTrackStatus(trackType, '⏸️ Paused');
        log(trackType, '✓ Paused', 'success');

    } catch (error) {
        log(trackType, `❌ Pause error: ${error.message}`, 'error');
    }
}

async function resumeTrack(trackType) {
    const state = trackStates[trackType];

    if (!state.mediaRecorder || !state.recordingId) return;

    try {
        log(trackType, 'Resuming...');

        // Resume local MediaRecorder
        if (state.mediaRecorder.state === 'paused') {
            state.mediaRecorder.resume();
        }

        // Resume on server
        const response = await fetch(`${API_URL}/recordings/${state.recordingId}/resume`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Failed to resume: ${response.statusText}`);
        }

        updateTrackStatus(trackType, '🔴 Recording');
        log(trackType, '✓ Resumed', 'success');

    } catch (error) {
        log(trackType, `❌ Resume error: ${error.message}`, 'error');
    }
}

async function stopTrack(trackType) {
    const state = trackStates[trackType];

    if (!state.mediaRecorder) return;

    try {
        log(trackType, 'Stopping...');

        // Stop local recording
        state.mediaRecorder.stop();

        // Stop media stream
        if (state.mediaStream) {
            state.mediaStream.getTracks().forEach(track => track.stop());
            state.mediaStream = null;
        }

        updateTrackStatus(trackType, '⏹️ Stopped - Uploading...');

        // Wait for pending uploads
        log(trackType, 'Waiting for uploads to complete...');
        while (state.uploadQueue.length > 0 || state.pendingChunks.size > 0) {
            await processUploadQueue(trackType);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Stop on server
        const response = await fetch(`${API_URL}/recordings/${state.recordingId}/stop`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Failed to stop: ${response.statusText}`);
        }

        log(trackType, '✓ Recording stopped', 'success');

        // Get final progress
        const progressResponse = await fetch(`${API_URL}/uploads/${state.uploadId}/progress`);
        const progress = await progressResponse.json();

        updateTrackProgress(trackType, progress.uploaded_chunks, progress.total_chunks);
        updateTrackStatus(trackType, '✅ Completed');

        log(trackType, `✅ Upload complete: ${progress.progress_percentage}%`, 'success');

        state.isActive = false;

    } catch (error) {
        log(trackType, `❌ Stop error: ${error.message}`, 'error');
        updateTrackStatus(trackType, '❌ Error');
    }
}

// ==================== Global Controls ====================

async function startRecording() {
    if (isRecording) return;

    const sessionId = document.getElementById('sessionId').value.trim();
    const participantId = document.getElementById('participantId').value.trim();

    if (!sessionId || !participantId) {
        alert('Please enter Session ID and Participant ID');
        return;
    }

    console.log('Starting all tracks...');

    // Start all three tracks
    const results = await Promise.all([
        startTrack(TRACK_TYPES.AUDIO),
        startTrack(TRACK_TYPES.VIDEO),
        startTrack(TRACK_TYPES.SCREEN)
    ]);

    // Check if at least one track started successfully
    const anySuccess = results.some(r => r === true);

    if (anySuccess) {
        isRecording = true;
        startTime = Date.now();
        durationInterval = setInterval(updateDuration, 1000);

        // Update UI
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;

        console.log('✅ Multi-track recording started');
    } else {
        console.error('❌ Failed to start any tracks');
        alert('Failed to start recording. Check console for details.');
    }
}

async function pauseRecording() {
    if (!isRecording || isPaused) return;

    console.log('Pausing all tracks...');

    await Promise.all([
        pauseTrack(TRACK_TYPES.AUDIO),
        pauseTrack(TRACK_TYPES.VIDEO),
        pauseTrack(TRACK_TYPES.SCREEN)
    ]);

    isPaused = true;

    // Stop duration timer
    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }

    // Update UI
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('resumeBtn').style.display = 'inline-block';
    document.getElementById('resumeBtn').disabled = false;

    console.log('✅ All tracks paused');
}

async function resumeRecording() {
    if (!isRecording || !isPaused) return;

    console.log('Resuming all tracks...');

    await Promise.all([
        resumeTrack(TRACK_TYPES.AUDIO),
        resumeTrack(TRACK_TYPES.VIDEO),
        resumeTrack(TRACK_TYPES.SCREEN)
    ]);

    isPaused = false;

    // Resume duration timer
    durationInterval = setInterval(updateDuration, 1000);

    // Update UI
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('resumeBtn').style.display = 'none';

    console.log('✅ All tracks resumed');
}

async function stopRecording() {
    if (!isRecording) return;

    console.log('Stopping all tracks...');

    // Stop all tracks
    await Promise.all([
        stopTrack(TRACK_TYPES.AUDIO),
        stopTrack(TRACK_TYPES.VIDEO),
        stopTrack(TRACK_TYPES.SCREEN)
    ]);

    isRecording = false;
    isPaused = false;

    // Stop duration timer
    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }

    // Update UI
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('resumeBtn').style.display = 'none';
    document.getElementById('stopBtn').disabled = true;

    console.log('✅ All tracks stopped');
}

// ==================== UI Updates ====================

function updateDuration() {
    if (!startTime) return;

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    const durationStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('duration').textContent = durationStr;
}

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Multi-track recorder initialized');

    // Set default values
    document.getElementById('sessionId').value = `session_${Date.now()}`;
    document.getElementById('participantId').value = `participant_${Math.random().toString(36).substring(7)}`;
});
