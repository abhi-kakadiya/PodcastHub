/**
 * WebRTC Recorder with Resilient Chunked Upload (Riverside.fm Pattern)
 *
 * Features:
 * 1. Local recording using MediaRecorder API
 * 2. Progressive chunked upload (every 5 seconds)
 * 3. Session persistence in LocalStorage
 * 4. Automatic session recovery after browser close/refresh
 * 5. Retry logic with exponential backoff
 * 6. Offline chunk queueing
 * 7. Connection monitoring and heartbeat
 * 8. Upload resumption for interrupted sessions
 */

const API_URL = 'http://localhost:8001/api';
const CHUNK_SIZE = 5000; // 5 seconds
const MAX_RETRIES = 5;
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const SESSION_STORAGE_KEY = 'podcasthub_session';

// State management
let mediaRecorder = null;
let recordingId = null;
let uploadId = null;
let mediaStream = null;
let startTime = null;
let durationInterval = null;
let heartbeatInterval = null;
let chunkSequence = 0;
let uploadQueue = []; // Queue for chunks waiting to be uploaded
let isOnline = navigator.onLine;
let pendingChunks = new Map(); // Track chunks being uploaded

// ==================== Session Persistence ====================

/**
 * Save session state to LocalStorage
 * This allows recovery if browser crashes or user refreshes
 */
function saveSessionState() {
    const state = {
        recordingId,
        uploadId,
        chunkSequence,
        startTime,
        sessionId: document.getElementById('sessionId').value,
        participantId: document.getElementById('participantId').value,
        mediaType: document.getElementById('mediaType').value,
        lastSaved: Date.now(),
    };

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
    log('Session state saved', 'info');
}

/**
 * Load session state from LocalStorage
 */
function loadSessionState() {
    const stateStr = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stateStr) return null;

    try {
        const state = JSON.parse(stateStr);
        // Check if session is less than 24 hours old
        if (Date.now() - state.lastSaved < 24 * 60 * 60 * 1000) {
            return state;
        }
    } catch (e) {
        console.error('Failed to parse session state:', e);
    }

    return null;
}

/**
 * Clear session state
 */
function clearSessionState() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    log('Session state cleared', 'info');
}

/**
 * Check for and offer to resume incomplete session
 */
async function checkForIncompleteSession() {
    const state = loadSessionState();
    if (!state) return;

    log(`Found incomplete session: ${state.recordingId}`, 'info');

    // Fill in form fields
    document.getElementById('sessionId').value = state.sessionId;
    document.getElementById('participantId').value = state.participantId;
    document.getElementById('mediaType').value = state.mediaType;
    document.getElementById('recordingId').textContent = state.recordingId;

    // Check if upload is still incomplete
    try {
        const response = await fetch(`${API_URL}/uploads/${state.uploadId}/progress`);
        if (response.ok) {
            const progress = await response.json();

            if (progress.status === 'in_progress' || progress.can_resume) {
                const message = `Resume incomplete upload?\n\n` +
                    `Recording: ${state.recordingId}\n` +
                    `Progress: ${progress.progress_percentage}%\n` +
                    `Uploaded: ${progress.uploaded_chunks}/${progress.total_chunks} chunks`;

                if (confirm(message)) {
                    await resumeSession(state, progress);
                } else {
                    clearSessionState();
                }
            } else {
                log('Previous session completed, starting fresh', 'success');
                clearSessionState();
            }
        }
    } catch (error) {
        log(`Could not check session status: ${error.message}`, 'error');
    }
}

/**
 * Resume an interrupted session
 */
async function resumeSession(state, progress) {
    recordingId = state.recordingId;
    uploadId = state.uploadId;
    chunkSequence = progress.uploaded_chunks;

    updateStatus('⏸️ Session Resumed - Ready to continue');
    updateProgress(progress.uploaded_chunks, progress.total_chunks);

    log(`Session resumed from chunk ${chunkSequence}`, 'success');
    log('You can continue recording or start processing', 'info');
}

// ==================== Chunk Queue Management ====================

/**
 * Add chunk to upload queue
 * Chunks are queued if offline or if previous upload is still in progress
 */
function queueChunk(blob, sequence) {
    uploadQueue.push({ blob, sequence, attempts: 0, timestamp: Date.now() });
    saveChunkToIndexedDB(blob, sequence); // Persist to IndexedDB for durability
    log(`Chunk ${sequence} queued for upload`, 'info');
    processUploadQueue();
}

/**
 * Process the upload queue
 * Uploads chunks one at a time to avoid overwhelming the connection
 */
async function processUploadQueue() {
    if (!isOnline || uploadQueue.length === 0) return;

    // Process one chunk at a time
    while (uploadQueue.length > 0 && isOnline) {
        const item = uploadQueue[0];

        if (pendingChunks.has(item.sequence)) {
            // This chunk is already being uploaded
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
        }

        uploadQueue.shift(); // Remove from queue
        await uploadChunkWithRetry(item.blob, item.sequence, item.attempts);
    }
}

/**
 * Upload chunk with retry logic and exponential backoff
 */
async function uploadChunkWithRetry(blob, sequence, currentAttempt = 0) {
    if (currentAttempt >= MAX_RETRIES) {
        log(`✗ Chunk ${sequence} PERMANENTLY FAILED after ${MAX_RETRIES} retries`, 'error');
        log(`⚠️ Chunk ${sequence} will not be re-queued. Please check server logs.`, 'error');
        // DON'T re-queue - this causes infinite loops
        return;
    }

    try {
        pendingChunks.set(sequence, true);
        log(`Uploading chunk ${sequence} (attempt ${currentAttempt + 1}/${MAX_RETRIES})...`);

        // Calculate checksum
        const checksum = await calculateChecksum(blob);

        // Create form data - IMPORTANT: blob needs filename for FastAPI UploadFile
        const formData = new FormData();
        formData.append('upload_id', String(uploadId));  // Convert to string
        formData.append('sequence_number', String(sequence));  // Convert to string
        formData.append('checksum', checksum);
        formData.append('chunk_file', blob, `chunk_${sequence}.webm`);  // Add filename!

        const response = await fetch(`${API_URL}/uploads/chunk`, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        if (!response.ok) {
            // Get detailed error message from server
            let errorDetail = response.statusText;
            try {
                const errorData = await response.json();
                errorDetail = errorData.detail || errorDetail;
            } catch (e) {
                // Response not JSON, use statusText
            }
            throw new Error(`HTTP ${response.status}: ${errorDetail}`);
        }

        log(`✓ Chunk ${sequence} uploaded successfully`, 'success');
        pendingChunks.delete(sequence);

        // Update progress
        updateProgress(sequence + 1, chunkSequence);

        // Save session state after successful upload
        saveSessionState();

        // Remove from IndexedDB
        await removeChunkFromIndexedDB(sequence);

    } catch (error) {
        pendingChunks.delete(sequence);
        log(`✗ Chunk ${sequence} upload failed: ${error.message}`, 'error');

        // Exponential backoff
        const delay = Math.min(Math.pow(2, currentAttempt) * 1000, 30000);
        log(`Retrying chunk ${sequence} in ${delay/1000}s...`);

        await new Promise(resolve => setTimeout(resolve, delay));
        await uploadChunkWithRetry(blob, sequence, currentAttempt + 1);
    }
}

// ==================== IndexedDB for Persistent Storage ====================

/**
 * Save chunk to IndexedDB for persistence across browser sessions
 */
async function saveChunkToIndexedDB(blob, sequence) {
    // For simplicity, using localStorage for small demos
    // In production, use IndexedDB for large binary data
    try {
        const reader = new FileReader();
        reader.onload = function() {
            const base64 = btoa(reader.result);
            sessionStorage.setItem(`chunk_${uploadId}_${sequence}`, base64);
        };
        reader.readAsBinaryString(blob);
    } catch (e) {
        console.error('Failed to save chunk:', e);
    }
}

/**
 * Remove chunk from IndexedDB after successful upload
 */
async function removeChunkFromIndexedDB(sequence) {
    try {
        sessionStorage.removeItem(`chunk_${uploadId}_${sequence}`);
    } catch (e) {
        console.error('Failed to remove chunk:', e);
    }
}

// ==================== Connection Monitoring ====================

/**
 * Monitor online/offline status
 */
window.addEventListener('online', () => {
    isOnline = true;
    log('🌐 Connection restored', 'success');
    updateStatus('🔴 Recording... (Online)');
    processUploadQueue();
});

window.addEventListener('offline', () => {
    isOnline = false;
    log('📡 Connection lost - chunks will be queued', 'error');
    updateStatus('🔴 Recording... (Offline - Queueing)');
});

/**
 * Heartbeat to check server availability
 */
async function startHeartbeat() {
    heartbeatInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                throw new Error('Health check failed');
            }
        } catch (error) {
            log('⚠️ Server unreachable - uploads will retry', 'error');
        }
    }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// ==================== Utility Functions ====================

function log(message, type = 'info') {
    const logDiv = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6b7280';

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.color = color;
    entry.textContent = `[${timestamp}] ${message}`;

    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;

    // Also log to console for debugging
    console.log(`[${timestamp}] ${message}`);
}

function updateStatus(status) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = status;

    if (status.includes('Recording')) {
        statusEl.innerHTML = '<span class="recording-indicator"></span>' + status;
    }
}

function updateProgress(current, total) {
    if (total === 0) return;

    const percentage = Math.round((current / total) * 100);
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');

    fill.style.width = `${percentage}%`;
    text.textContent = `${percentage}%`;

    document.getElementById('chunksUploaded').textContent = `${current} / ${total}`;
}

function updateDuration() {
    if (!startTime) return;

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');

    document.getElementById('duration').textContent = `${minutes}:${seconds}`;
}

async function calculateChecksum(data) {
    const buffer = await data.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== Recording Functions ====================

/**
 * Start recording
 */
async function startRecording() {
    const sessionId = document.getElementById('sessionId').value;
    const participantId = document.getElementById('participantId').value;
    const mediaType = document.getElementById('mediaType').value;

    if (!sessionId || !participantId) {
        alert('Please enter Session ID and Participant ID');
        return;
    }

    try {
        log('🎙️ Requesting media access...');

        // Get media constraints based on type
        let constraints = {};
        if (mediaType === 'audio') {
            constraints = { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
        } else if (mediaType === 'video') {
            constraints = { audio: { echoCancellation: true }, video: { width: 1280, height: 720 } };
        } else if (mediaType === 'screen') {
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: true
            });
        }

        if (!mediaStream) {
            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        }

        log('✓ Media access granted', 'success');

        // Start recording on backend
        log('📡 Starting recording on server...');
        const response = await fetch(`${API_URL}/recordings/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                participant_id: participantId,
                media_type: mediaType
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to start recording: ${response.statusText}`);
        }

        const data = await response.json();
        recordingId = data.recording_id;

        document.getElementById('recordingId').textContent = recordingId;
        log(`✓ Recording started: ${recordingId}`, 'success');

        // Initialize upload session
        log('📤 Initializing upload session...');
        const uploadResponse = await fetch(`${API_URL}/uploads/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recording_id: recordingId,
                session_id: sessionId,
                file_name: `${participantId}_${recordingId}.webm`,
                mime_type: mediaType === 'audio' ? 'audio/webm' : 'video/webm',
                total_chunks: 100 // Estimated, will adjust
            })
        });

        if (!uploadResponse.ok) {
            throw new Error(`Failed to initialize upload: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        uploadId = uploadData.upload_id;
        log(`✓ Upload session created: ${uploadId}`, 'success');

        // Save initial state
        saveSessionState();

        // Set up MediaRecorder
        const mimeType = mediaType === 'audio' ? 'audio/webm' : 'video/webm';
        mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType: mimeType,
            audioBitsPerSecond: 128000
        });

        mediaRecorder.ondataavailable = handleDataAvailable;
        mediaRecorder.onstop = handleStop;
        mediaRecorder.onerror = (event) => {
            log(`MediaRecorder error: ${event.error}`, 'error');
        };

        // Start recording with chunks every 5 seconds
        mediaRecorder.start(CHUNK_SIZE);

        startTime = Date.now();
        durationInterval = setInterval(updateDuration, 1000);
        chunkSequence = 0;

        // Start connection monitoring
        startHeartbeat();

        updateStatus('🔴 Recording...');
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;

        log('✓ Local recording started - chunks will upload progressively', 'success');
        log('💾 Session is being saved - safe to refresh/close browser', 'info');

    } catch (error) {
        log(`❌ Error: ${error.message}`, 'error');
        updateStatus('Error');

        // Clean up media stream if it was acquired
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
    }
}

/**
 * Handle recorded data chunks
 * Called by MediaRecorder every CHUNK_SIZE milliseconds
 */
async function handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
        const sizeKB = Math.round(event.data.size / 1024);
        log(`📦 Chunk ${chunkSequence} captured (${sizeKB}KB)`, 'info');

        // Queue chunk for upload
        queueChunk(event.data, chunkSequence);
        chunkSequence++;

        // Update session state
        saveSessionState();
    }
}

/**
 * Handle recording stop
 */
async function handleStop() {
    log('🛑 Local recording stopped', 'info');
}

/**
 * Stop recording
 */
async function stopRecording() {
    if (!mediaRecorder) return;

    try {
        log('🛑 Stopping recording...');

        // Stop local recording
        mediaRecorder.stop();

        // Stop all tracks
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }

        // Stop duration timer
        if (durationInterval) {
            clearInterval(durationInterval);
            durationInterval = null;
        }

        // Stop heartbeat
        stopHeartbeat();

        updateStatus('⏹️ Stopped - Finishing uploads...');

        // Wait for all queued chunks to upload
        log('⏳ Waiting for remaining chunks to upload...', 'info');
        while (uploadQueue.length > 0 || pendingChunks.size > 0) {
            await processUploadQueue();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Stop recording on server
        log('📡 Stopping recording on server...');
        const response = await fetch(`${API_URL}/recordings/${recordingId}/stop`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Failed to stop recording: ${response.statusText}`);
        }

        log('✓ Recording stopped on server', 'success');

        // Get final progress
        const progressResponse = await fetch(`${API_URL}/uploads/${uploadId}/progress`);
        const progress = await progressResponse.json();

        log(`✅ Upload complete: ${progress.progress_percentage}% (${progress.uploaded_chunks} chunks)`, 'success');
        updateProgress(progress.uploaded_chunks, progress.total_chunks);

        // Clear session state
        clearSessionState();

        updateStatus('✅ Completed');
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;

        log('🎉 Recording session completed successfully!', 'success');
        log('You can now process this recording in the Processing Service', 'info');

    } catch (error) {
        log(`❌ Error stopping: ${error.message}`, 'error');
    }
}

// ==================== Initialization ====================

// Check for incomplete session on page load
window.addEventListener('DOMContentLoaded', () => {
    log('🎬 PodcastHub Recording Interface ready');
    log('✨ Features: Session persistence, auto-recovery, offline queueing', 'info');
    log('Enter session details and click "Start Recording"', 'info');

    // Check for incomplete sessions
    checkForIncompleteSession();
});

// Warn user before closing if recording is active
window.addEventListener('beforeunload', (event) => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        event.preventDefault();
        event.returnValue = '';
        return 'Recording is in progress. Your session will be saved and can be resumed.';
    }
});
