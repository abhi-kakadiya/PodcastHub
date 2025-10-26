/**
 * WebRTC Recorder with Chunked Upload
 *
 * This demonstrates the resilient chunked upload pattern:
 * 1. Capture media locally using MediaRecorder API
 * 2. Split into chunks (5 second intervals)
 * 3. Upload chunks asynchronously with retry logic
 * 4. Continue recording even if network fails
 */

const API_URL = 'http://localhost:8001/api';
const CHUNK_SIZE = 5000; // 5 seconds

let mediaRecorder = null;
let recordedChunks = [];
let recordingId = null;
let uploadId = null;
let mediaStream = null;
let startTime = null;
let durationInterval = null;
let chunkSequence = 0;

// Logging utility
function log(message, type = 'info') {
    const logDiv = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#10b981';

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.color = color;
    entry.textContent = `[${timestamp}] ${message}`;

    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// Update status display
function updateStatus(status) {
    document.getElementById('status').textContent = status;

    if (status.includes('Recording')) {
        document.getElementById('status').innerHTML =
            '<span class="recording-indicator"></span>' + status;
    }
}

// Update progress bar
function updateProgress(current, total) {
    if (total === 0) return;

    const percentage = Math.round((current / total) * 100);
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');

    fill.style.width = `${percentage}%`;
    text.textContent = `${percentage}%`;

    document.getElementById('chunksUploaded').textContent = `${current} / ${total}`;
}

// Update duration
function updateDuration() {
    if (!startTime) return;

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');

    document.getElementById('duration').textContent = `${minutes}:${seconds}`;
}

// Calculate MD5 checksum (simple implementation)
async function calculateChecksum(data) {
    const buffer = await data.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Start recording
async function startRecording() {
    const sessionId = document.getElementById('sessionId').value;
    const participantId = document.getElementById('participantId').value;
    const mediaType = document.getElementById('mediaType').value;

    if (!sessionId || !participantId) {
        alert('Please enter Session ID and Participant ID');
        return;
    }

    try {
        log('Requesting media access...');

        // Get media constraints based on type
        let constraints = {};
        if (mediaType === 'audio') {
            constraints = { audio: true, video: false };
        } else if (mediaType === 'video') {
            constraints = { audio: true, video: true };
        } else if (mediaType === 'screen') {
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
        }

        if (!mediaStream) {
            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        }

        log('Media access granted', 'success');

        // Start recording on backend
        log('Starting recording on server...');
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
        log(`Recording started: ${recordingId}`, 'success');

        // Initialize upload session
        log('Initializing upload session...');
        const uploadResponse = await fetch(`${API_URL}/uploads/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recording_id: recordingId,
                session_id: sessionId,
                file_name: `recording_${recordingId}.webm`,
                mime_type: mediaType === 'audio' ? 'audio/webm' : 'video/webm',
                total_chunks: 100 // Estimated, will be updated
            })
        });

        const uploadData = await uploadResponse.json();
        uploadId = uploadData.upload_id;
        log(`Upload session created: ${uploadId}`, 'success');

        // Set up MediaRecorder
        mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType: mediaType === 'audio' ? 'audio/webm' : 'video/webm'
        });

        mediaRecorder.ondataavailable = handleDataAvailable;
        mediaRecorder.onstop = handleStop;

        // Start recording with chunks every 5 seconds
        mediaRecorder.start(CHUNK_SIZE);

        startTime = Date.now();
        durationInterval = setInterval(updateDuration, 1000);
        chunkSequence = 0;

        updateStatus('🔴 Recording...');
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;

        log('Local recording started', 'success');

    } catch (error) {
        log(`Error: ${error.message}`, 'error');
        updateStatus('Error');
    }
}

// Handle recorded data chunks
async function handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
        log(`Chunk ${chunkSequence} captured (${Math.round(event.data.size / 1024)}KB)`);

        // Upload chunk immediately
        await uploadChunk(event.data, chunkSequence);
        chunkSequence++;
    }
}

// Upload a chunk
async function uploadChunk(blob, sequence, retryCount = 0) {
    const maxRetries = 3;

    try {
        log(`Uploading chunk ${sequence}...`);

        // Calculate checksum
        const checksum = await calculateChecksum(blob);

        // Create form data
        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('sequence_number', sequence);
        formData.append('checksum', checksum);
        formData.append('chunk_file', blob);

        const response = await fetch(`${API_URL}/uploads/chunk`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        log(`✓ Chunk ${sequence} uploaded successfully`, 'success');

        // Update progress
        updateProgress(sequence + 1, chunkSequence + 1);

    } catch (error) {
        log(`✗ Chunk ${sequence} upload failed: ${error.message}`, 'error');

        // Retry logic
        if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            log(`Retrying chunk ${sequence} in ${delay/1000}s...`);

            await new Promise(resolve => setTimeout(resolve, delay));
            await uploadChunk(blob, sequence, retryCount + 1);
        } else {
            log(`✗ Chunk ${sequence} failed after ${maxRetries} retries`, 'error');
        }
    }
}

// Handle recording stop
async function handleStop() {
    log('Recording stopped locally', 'success');
}

// Stop recording
async function stopRecording() {
    if (!mediaRecorder) return;

    try {
        log('Stopping recording...');

        // Stop local recording
        mediaRecorder.stop();

        // Stop all tracks
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }

        // Stop duration timer
        clearInterval(durationInterval);

        // Stop recording on server
        const response = await fetch(`${API_URL}/recordings/${recordingId}/stop`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Failed to stop recording: ${response.statusText}`);
        }

        log('Recording stopped on server', 'success');
        updateStatus('Stopped - Processing uploads');

        // Wait a bit for remaining chunks
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check upload completion
        const progressResponse = await fetch(`${API_URL}/uploads/${uploadId}/progress`);
        const progress = await progressResponse.json();

        log(`Upload complete: ${progress.progress_percentage}%`, 'success');

        updateStatus('✓ Completed');
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;

    } catch (error) {
        log(`Error stopping: ${error.message}`, 'error');
    }
}

// Initialize
log('PodcastHub Recording Interface ready');
log('Enter session details and click "Start Recording"');
