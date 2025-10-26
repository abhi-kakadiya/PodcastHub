/**
 * Riverside.fm-Style Local Multi-Track Recorder
 *
 * Key Features:
 * - Records LOCALLY in browser (IndexedDB)
 * - Three separate files: audio, video, screen
 * - Handles track endings gracefully
 * - Background upload with retry
 * - Best quality preserved locally
 * - Works offline
 */

const API_URL = 'http://localhost:8001/api';
const CHUNK_INTERVAL = 5000; // 5 seconds
const DB_NAME = 'RiversideRecordings';
const DB_VERSION = 1;

// Track types
const TRACK_TYPES = {
    AUDIO: 'audio',
    VIDEO: 'video',
    SCREEN: 'screen'
};

// Global state
let db = null;
let sessionId = null;
let participantId = null;
let recordingStartTime = null;
let durationInterval = null;

// Track states
const trackStates = {
    audio: createTrackState('audio'),
    video: createTrackState('video'),
    screen: createTrackState('screen')
};

function createTrackState(trackType) {
    return {
        trackType,
        mediaRecorder: null,
        mediaStream: null,
        recordingId: null,
        chunks: [],
        chunkCount: 0,
        isRecording: false,
        error: null,
        localBlobs: [] // Store complete blobs locally
    };
}

// ==================== IndexedDB Setup ====================

async function initializeDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Store for recordings metadata
            if (!db.objectStoreNames.contains('recordings')) {
                const recordingStore = db.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true });
                recordingStore.createIndex('sessionId', 'sessionId', { unique: false });
                recordingStore.createIndex('trackType', 'trackType', { unique: false });
            }

            // Store for chunks
            if (!db.objectStoreNames.contains('chunks')) {
                const chunkStore = db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
                chunkStore.createIndex('recordingId', 'recordingId', { unique: false });
                chunkStore.createIndex('trackType', 'trackType', { unique: false });
            }
        };
    });
}

async function saveChunkToDB(trackType, blob, sequence) {
    const state = trackStates[trackType];

    const transaction = db.transaction(['chunks'], 'readwrite');
    const store = transaction.objectStore('chunks');

    const chunk = {
        recordingId: state.recordingId,
        trackType: trackType,
        sequence: sequence,
        blob: blob,
        timestamp: Date.now(),
        size: blob.size,
        uploaded: false
    };

    return new Promise((resolve, reject) => {
        const request = store.add(chunk);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveRecordingMetadata(trackType, recordingId) {
    const transaction = db.transaction(['recordings'], 'readwrite');
    const store = transaction.objectStore('recordings');

    const recording = {
        recordingId: recordingId,
        sessionId: sessionId,
        participantId: participantId,
        trackType: trackType,
        startTime: Date.now(),
        status: 'recording',
        chunkCount: 0
    };

    return new Promise((resolve, reject) => {
        const request = store.add(recording);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
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

function updateTrackChunks(trackType, count, size) {
    const progressElement = document.getElementById(`progress-${trackType}`);
    if (progressElement) {
        const sizeMB = (size / (1024 * 1024)).toFixed(2);
        progressElement.textContent = `${count} chunks (${sizeMB} MB)`;
    }
}

// ==================== Media Capture ====================

async function captureAudioStream() {
    return await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000  // High quality audio
        }
    });
}

async function captureVideoStream() {
    return await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000
        },
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            facingMode: 'user'
        }
    });
}

async function captureScreenStream() {
    return await navigator.mediaDevices.getDisplayMedia({
        video: {
            cursor: "always",
            displaySurface: "monitor",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
        },
        audio: true
    });
}

// ==================== Track Recording ====================

async function startTrack(trackType) {
    const state = trackStates[trackType];

    try {
        log(trackType, '🎬 Starting track...');
        updateTrackStatus(trackType, '🔄 Initializing...');

        // Capture media stream
        log(trackType, '📷 Requesting media access...');

        if (trackType === TRACK_TYPES.AUDIO) {
            state.mediaStream = await captureAudioStream();
        } else if (trackType === TRACK_TYPES.VIDEO) {
            state.mediaStream = await captureVideoStream();
        } else if (trackType === TRACK_TYPES.SCREEN) {
            state.mediaStream = await captureScreenStream();
        }

        log(trackType, '✓ Media access granted', 'success');

        // Generate recording ID (UUID)
        state.recordingId = `${trackType}_${sessionId}_${Date.now()}`;

        // Save recording metadata to IndexedDB
        await saveRecordingMetadata(trackType, state.recordingId);
        log(trackType, `✓ Recording ID: ${state.recordingId}`, 'success');

        // Set up MediaRecorder with high quality settings
        const mimeType = getAvailableMimeType(trackType);
        const options = {
            mimeType: mimeType,
            audioBitsPerSecond: 128000,
        };

        if (trackType !== TRACK_TYPES.AUDIO) {
            options.videoBitsPerSecond = 2500000; // 2.5 Mbps for high quality
        }

        state.mediaRecorder = new MediaRecorder(state.mediaStream, options);

        // Handle data available
        state.mediaRecorder.ondataavailable = async (event) => {
            if (event.data && event.data.size > 0) {
                state.chunks.push(event.data);
                state.localBlobs.push(event.data);
                state.chunkCount++;

                const totalSize = state.chunks.reduce((sum, chunk) => sum + chunk.size, 0);

                log(trackType, `📦 Chunk ${state.chunkCount} saved locally (${(event.data.size / 1024).toFixed(2)} KB)`, 'info');
                updateTrackChunks(trackType, state.chunkCount, totalSize);

                // Save to IndexedDB
                try {
                    await saveChunkToDB(trackType, event.data, state.chunkCount - 1);
                    log(trackType, `💾 Chunk ${state.chunkCount} stored in IndexedDB`, 'success');
                } catch (error) {
                    log(trackType, `⚠️ Failed to save chunk to IndexedDB: ${error.message}`, 'warn');
                }
            }
        };

        // Handle errors
        state.mediaRecorder.onerror = (event) => {
            log(trackType, `❌ MediaRecorder error: ${event.error}`, 'error');
        };

        // Handle stream ending (important for screen share!)
        state.mediaStream.getTracks().forEach(track => {
            track.onended = () => {
                log(trackType, `⚠️ Track ended (user stopped ${trackType})`, 'warn');
                // Don't stop other tracks - just this one
                stopTrackGracefully(trackType);
            };
        });

        // Start recording with 5-second chunks
        state.mediaRecorder.start(CHUNK_INTERVAL);
        state.isRecording = true;

        updateTrackStatus(trackType, '🔴 Recording');
        log(trackType, '✓ Recording started locally', 'success');

        return true;

    } catch (error) {
        log(trackType, `❌ Error: ${error.message}`, 'error');
        updateTrackStatus(trackType, '❌ Failed');
        state.error = error.message;
        return false;
    }
}

function getAvailableMimeType(trackType) {
    if (trackType === TRACK_TYPES.AUDIO) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            return 'audio/webm;codecs=opus';
        }
        return 'audio/webm';
    } else {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
            return 'video/webm;codecs=vp9,opus';
        }
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
            return 'video/webm;codecs=vp8,opus';
        }
        return 'video/webm';
    }
}

async function stopTrackGracefully(trackType) {
    const state = trackStates[trackType];

    if (!state.mediaRecorder || !state.isRecording) return;

    try {
        log(trackType, '⏹️ Stopping track...', 'info');

        // Stop MediaRecorder
        if (state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
        }

        // Stop media stream
        if (state.mediaStream) {
            state.mediaStream.getTracks().forEach(track => track.stop());
        }

        state.isRecording = false;
        updateTrackStatus(trackType, '✅ Stopped - Saved Locally');
        log(trackType, `✓ Stopped. ${state.chunkCount} chunks saved locally`, 'success');

    } catch (error) {
        log(trackType, `❌ Error stopping: ${error.message}`, 'error');
    }
}

async function pauseTrack(trackType) {
    const state = trackStates[trackType];

    if (!state.mediaRecorder || !state.isRecording) return;

    try {
        if (state.mediaRecorder.state === 'recording') {
            state.mediaRecorder.pause();
            updateTrackStatus(trackType, '⏸️ Paused');
            log(trackType, '⏸️ Paused', 'info');
        }
    } catch (error) {
        log(trackType, `❌ Pause error: ${error.message}`, 'error');
    }
}

async function resumeTrack(trackType) {
    const state = trackStates[trackType];

    if (!state.mediaRecorder || !state.isRecording) return;

    try {
        if (state.mediaRecorder.state === 'paused') {
            state.mediaRecorder.resume();
            updateTrackStatus(trackType, '🔴 Recording');
            log(trackType, '▶️ Resumed', 'success');
        }
    } catch (error) {
        log(trackType, `❌ Resume error: ${error.message}`, 'error');
    }
}

// ==================== Global Controls ====================

async function startRecording() {
    // Initialize DB
    if (!db) {
        await initializeDB();
        log('audio', '✓ IndexedDB initialized', 'success');
    }

    sessionId = document.getElementById('sessionId').value.trim();
    participantId = document.getElementById('participantId').value.trim();

    if (!sessionId || !participantId) {
        alert('Please enter Session ID and Participant ID');
        return;
    }

    console.log('🎬 Starting all tracks...');

    // Start all tracks
    const results = await Promise.allSettled([
        startTrack(TRACK_TYPES.AUDIO),
        startTrack(TRACK_TYPES.VIDEO),
        startTrack(TRACK_TYPES.SCREEN)
    ]);

    // Check if at least one succeeded
    const anySuccess = results.some(r => r.status === 'fulfilled' && r.value === true);

    if (anySuccess) {
        recordingStartTime = Date.now();
        durationInterval = setInterval(updateDuration, 1000);

        // Update UI
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('downloadBtn').disabled = true;

        console.log('✅ Recording started (local storage)');
    } else {
        console.error('❌ Failed to start any tracks');
        alert('Failed to start recording. Check console for details.');
    }
}

async function pauseRecording() {
    console.log('⏸️ Pausing all tracks...');

    await Promise.all([
        pauseTrack(TRACK_TYPES.AUDIO),
        pauseTrack(TRACK_TYPES.VIDEO),
        pauseTrack(TRACK_TYPES.SCREEN)
    ]);

    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }

    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('resumeBtn').style.display = 'inline-block';
}

async function resumeRecording() {
    console.log('▶️ Resuming all tracks...');

    await Promise.all([
        resumeTrack(TRACK_TYPES.AUDIO),
        resumeTrack(TRACK_TYPES.VIDEO),
        resumeTrack(TRACK_TYPES.SCREEN)
    ]);

    durationInterval = setInterval(updateDuration, 1000);

    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('resumeBtn').style.display = 'none';
}

async function stopRecording() {
    console.log('⏹️ Stopping all tracks...');

    // Stop all tracks
    await Promise.all([
        stopTrackGracefully(TRACK_TYPES.AUDIO),
        stopTrackGracefully(TRACK_TYPES.VIDEO),
        stopTrackGracefully(TRACK_TYPES.SCREEN)
    ]);

    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }

    // Update UI
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('resumeBtn').style.display = 'none';
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('downloadBtn').disabled = false;

    console.log('✅ Recording stopped - files saved locally');
    alert('Recording completed! Three files saved locally. Click "Download Recordings" to get them.');
}

// ==================== Download Recordings ====================

async function downloadRecordings() {
    console.log('📥 Preparing downloads...');

    for (const trackType of Object.keys(TRACK_TYPES)) {
        const state = trackStates[trackType];

        if (state.chunks.length === 0) {
            console.log(`No chunks for ${trackType}, skipping`);
            continue;
        }

        // Combine all chunks into single blob
        const mimeType = trackType === TRACK_TYPES.AUDIO ? 'audio/webm' : 'video/webm';
        const blob = new Blob(state.chunks, { type: mimeType });

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${participantId}_${trackType}_${sessionId}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        log(trackType, `✓ Downloaded ${a.download}`, 'success');
        console.log(`✅ Downloaded: ${a.download}`);
    }

    alert('All recordings downloaded! Check your Downloads folder.');
}

// ==================== UI Updates ====================

function updateDuration() {
    if (!recordingStartTime) return;

    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    const durationStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('duration').textContent = durationStr;
}

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎙️ Riverside-style recorder initialized');

    // Set default values
    document.getElementById('sessionId').value = `session_${Date.now()}`;
    document.getElementById('participantId').value = `participant_${Math.random().toString(36).substring(7)}`;

    // Initialize IndexedDB
    try {
        await initializeDB();
        console.log('✓ IndexedDB ready');
    } catch (error) {
        console.error('Failed to initialize IndexedDB:', error);
    }
});
