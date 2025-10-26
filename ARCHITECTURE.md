# PodcastHub - Production Architecture

**Real-Time Podcast Recording Platform with Microservices**

---

## 🎯 Executive Summary

PodcastHub is a production-ready, Zoom-like podcast recording platform built with microservices architecture. It enables real-time recording with WebRTC, stores chunks in MinIO during the meeting, and processes recordings with FFmpeg after the session ends.

### Key Features
✅ WebRTC video/audio meetings (like Zoom)
✅ Host/guest roles with permissions
✅ Real-time chunk upload during recording
✅ MinIO S3-compatible storage
✅ FFmpeg-based processing service
✅ Event-driven architecture (RabbitMQ)
✅ PostgreSQL for metadata
✅ Next.js frontend

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js + WebRTC)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Host Panel   │  │ Guest View   │  │  Meeting Room          │ │
│  │ - Controls   │  │ - Join       │  │  - Video Grid          │ │
│  │ - Mute All   │  │ - Self Mute  │  │  - Screen Share        │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
└──────────────┬──────────────┬─────────────────┬─────────────────┘
               │              │                  │
         WebSocket       REST API           WebRTC P2P
               │              │                  │
┌──────────────▼──────────────▼──────────────────▼─────────────────┐
│                     Backend Services Layer                        │
│  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Recording Service  │  │ Processing       │  │ Session      │ │
│  │ (Port 8001)        │  │ Service          │  │ Service      │ │
│  │                    │  │ (Port 8002)      │  │ (Port 8003)  │ │
│  │ - Chunk Upload     │  │ - FFmpeg Stitch  │  │ - Rooms      │ │
│  │ - MinIO Storage    │  │ - Transcode      │  │ - Roles      │ │
│  │ - Progress Track   │  │ - Export         │  │ - Perms      │ │
│  └────────┬───────────┘  └─────────┬────────┘  └──────┬────────┘ │
│           │                        │                   │          │
└───────────┼────────────────────────┼───────────────────┼──────────┘
            │                        │                   │
       ┌────▼────────┬───────────────▼──────┬───────────▼──────┐
       │             │                       │                   │
  ┌────▼─────┐  ┌───▼──────┐  ┌─────────────▼────┐  ┌──────────▼───┐
  │ RabbitMQ │  │  MinIO   │  │   PostgreSQL     │  │    Redis     │
  │          │  │          │  │                  │  │              │
  │ Events   │  │ Chunks   │  │ Metadata/State   │  │ Sessions     │
  └──────────┘  └──────────┘  └──────────────────┘  └──────────────┘
```

---

## 📊 Data Flow

### 1. Meeting Creation & Joining

```
Host                          Backend                         Guest
  │                              │                              │
  │ 1. Create Meeting            │                              │
  ├─────────────────────────────>│                              │
  │    POST /api/sessions/create │                              │
  │    { host_id }               │                              │
  │                              │                              │
  │<─────────────────────────────┤                              │
  │    { room_code: "ABC123",    │                              │
  │      session_id }            │                              │
  │                              │                              │
  │ 2. Share room_code           │                              │
  │ ═══════════════════════════════════════════════════════════>│
  │                              │                              │
  │                              │  3. Join Meeting             │
  │                              │<─────────────────────────────┤
  │                              │    POST /api/sessions/join   │
  │                              │    { room_code, guest_id }   │
  │                              │                              │
  │                              │  4. WebRTC Signaling         │
  │<══════════════════════════════════════════════════════════>│
  │            WebSocket: offer, answer, ICE candidates          │
  │                              │                              │
  │ 5. P2P Connection Established│                              │
  │<════════════════════════════════════════════════════════════>│
  │            Direct Audio/Video Stream (SRTP)                  │
```

### 2. Real-Time Recording & Upload

```
Browser (MediaRecorder)        Recording Service              MinIO
  │                                  │                           │
  │ 1. MediaRecorder starts          │                           │
  │    (5-second chunks)             │                           │
  │                                  │                           │
  │ 2. Chunk available (Blob)        │                           │
  ├──────────────────────┐           │                           │
  │                      │           │                           │
  │ 3. Calculate SHA-256 │           │                           │
  │    checksum          │           │                           │
  │<─────────────────────┘           │                           │
  │                                  │                           │
  │ 4. Upload chunk                  │                           │
  ├─────────────────────────────────>│                           │
  │    POST /api/uploads/chunk       │                           │
  │    FormData:                     │                           │
  │      - recording_id              │                           │
  │      - sequence: 0               │                           │
  │      - checksum                  │                           │
  │      - chunk_file (Blob)         │                           │
  │                                  │                           │
  │                                  │ 5. Validate checksum      │
  │                                  │    If mismatch: 400 error │
  │                                  │                           │
  │                                  │ 6. Store in MinIO         │
  │                                  ├──────────────────────────>│
  │                                  │    PUT /recordings/       │
  │                                  │      session_123/         │
  │                                  │        user456/           │
  │                                  │          audio/           │
  │                                  │            chunk_0000.webm│
  │                                  │                           │
  │                                  │<──────────────────────────┤
  │                                  │    200 OK                 │
  │                                  │                           │
  │                                  │ 7. Save metadata (DB)     │
  │                                  │    - chunk info           │
  │                                  │    - update progress      │
  │                                  │                           │
  │<─────────────────────────────────┤                           │
  │    200 OK                        │                           │
  │    { chunk_id, progress: "1/N" } │                           │
  │                                  │                           │
  │ 8. Continue every 5 seconds...   │                           │
  │                                  │                           │
```

### 3. Processing After Meeting

```
Recording Service        RabbitMQ        Processing Service      MinIO
  │                        │                    │                  │
  │ 1. Stop recording      │                    │                  │
  │    (meeting ends)      │                    │                  │
  │                        │                    │                  │
  │ 2. Publish event       │                    │                  │
  ├───────────────────────>│                    │                  │
  │ recording.stopped {    │                    │                  │
  │   session_id,          │                    │                  │
  │   participant_id,      │                    │                  │
  │   track_type,          │                    │                  │
  │   total_chunks: 120    │                    │                  │
  │ }                      │                    │                  │
  │                        │                    │                  │
  │                        │ 3. Consume event   │                  │
  │                        ├───────────────────>│                  │
  │                        │                    │                  │
  │                        │                    │ 4. Fetch chunks  │
  │                        │                    ├─────────────────>│
  │                        │                    │   List objects   │
  │                        │                    │   in prefix      │
  │                        │                    │                  │
  │                        │                    │<─────────────────┤
  │                        │                    │ chunk_0000.webm  │
  │                        │                    │ chunk_0001.webm  │
  │                        │                    │ ... (120 files)  │
  │                        │                    │                  │
  │                        │                    │ 5. Create concat │
  │                        │                    │    list file     │
  │                        │                    │    concat.txt:   │
  │                        │                    │    file chunk_0  │
  │                        │                    │    file chunk_1  │
  │                        │                    │    ...           │
  │                        │                    │                  │
  │                        │                    │ 6. Run FFmpeg    │
  │                        │                    │    ffmpeg -f     │
  │                        │                    │    concat -safe  │
  │                        │                    │    0 -i concat.  │
  │                        │                    │    txt -c copy   │
  │                        │                    │    output.webm   │
  │                        │                    │                  │
  │                        │                    │ 7. Store final   │
  │                        │                    ├─────────────────>│
  │                        │                    │ PUT processed/   │
  │                        │                    │   session/user/  │
  │                        │                    │   audio_final.   │
  │                        │                    │   webm           │
  │                        │                    │                  │
  │                        │ 8. Publish event   │                  │
  │                        │<───────────────────┤                  │
  │                        │ recording.          │                  │
  │                        │ processed          │                  │
  │                        │                    │                  │
```

---

## 🎮 Meeting Features Implementation

### Host Controls

**Mute Participant**:
```
Host clicks "Mute User X"
  ↓
Frontend sends:
  POST /api/sessions/{id}/mute
  { participant_id: "user_x" }
  ↓
Backend updates DB:
  UPDATE participants
  SET is_muted = true
  WHERE id = 'user_x'
  ↓
WebSocket broadcast:
  { type: "participant_muted",
    participant_id: "user_x" }
  ↓
User X's browser receives message:
  - Disables microphone
  - Shows "Muted by host" indicator
  - Prevents unmute (button disabled)
```

**Screen Share Control**:
```
Only ONE person can share screen at a time.

When User A starts screen sharing:
  1. Check if anyone else is sharing
  2. If yes: Reject with "X is already sharing"
  3. If no: Allow and broadcast to all
  4. Mark in DB: is_screen_sharing = true

When User B tries:
  1. Server checks DB
  2. Sees User A is sharing
  3. Returns 409 Conflict
  4. Frontend shows message
```

### Leave Meeting Alert

```javascript
async function leaveMeeting() {
  // Check if uploads are pending
  const pendingUploads = trackStates.audio.uploadQueue.length +
                        trackStates.video.uploadQueue.length +
                        trackStates.screen.uploadQueue.length;

  if (pendingUploads > 0) {
    const confirmed = await showModal({
      title: "⚠️ Uploads in Progress",
      message: `${pendingUploads} chunks are still uploading.
                If you leave now, only partial recording will be saved.

                Uploaded: ${uploadedCount} chunks
                Pending: ${pendingUploads} chunks`,
      buttons: [
        { label: "Wait for Uploads", value: "wait" },
        { label: "Leave Anyway", value: "force", danger: true }
      ]
    });

    if (confirmed === "wait") {
      // Show upload progress modal
      showUploadProgressModal();
      // Wait for completion
      await waitForAllUploads();
    } else {
      // Force leave - partial data saved
      forceLeave();
    }
  } else {
    // All uploaded, safe to leave
    leave();
  }
}
```

---

## 🗄️ Database Schema

```sql
-- sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id VARCHAR(255) NOT NULL,
    room_code VARCHAR(10) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('waiting', 'active', 'ended')),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- participants table
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id VARCHAR(255) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('host', 'guest')),
    is_muted BOOLEAN DEFAULT FALSE,
    video_enabled BOOLEAN DEFAULT TRUE,
    is_screen_sharing BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    left_at TIMESTAMP,
    CONSTRAINT one_screen_share_per_session
      EXCLUDE (session_id WITH =) WHERE (is_screen_sharing = true)
);

-- recordings table
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    participant_id VARCHAR(255) NOT NULL,
    track_type VARCHAR(10) NOT NULL CHECK (track_type IN ('audio', 'video', 'screen')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('recording', 'stopped', 'processing', 'completed', 'failed')),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    total_chunks INTEGER DEFAULT 0,
    uploaded_chunks INTEGER DEFAULT 0,
    duration_seconds FLOAT,
    file_size_bytes BIGINT,
    minio_bucket VARCHAR(255),
    minio_prefix VARCHAR(512),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- chunks table
CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    size_bytes INTEGER NOT NULL,
    minio_key VARCHAR(512) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(recording_id, sequence)
);

-- processing_jobs table
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID REFERENCES recordings(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    output_minio_key VARCHAR(512),
    ffmpeg_command TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_sessions_room_code ON sessions(room_code);
CREATE INDEX idx_participants_session ON participants(session_id);
CREATE INDEX idx_recordings_session ON recordings(session_id);
CREATE INDEX idx_chunks_recording ON chunks(recording_id);
CREATE INDEX idx_processing_status ON processing_jobs(status);
```

---

## 🔧 Service Implementation Details

### Recording Service - Real-Time Upload

**Key Changes from Local-Only**:

❌ **OLD** (Local Download):
```javascript
// Stored chunks in browser memory
state.chunks.push(blob);

// Downloaded at the end
function downloadRecordings() {
  const finalBlob = new Blob(state.chunks);
  downloadFile(finalBlob);
}
```

✅ **NEW** (Real-Time Upload):
```javascript
// Upload IMMEDIATELY when chunk available
mediaRecorder.ondataavailable = async (event) => {
  if (event.data && event.data.size > 0) {
    const checksum = await calculateSHA256(event.data);

    // Upload RIGHT NOW (during meeting)
    await uploadChunk({
      recording_id: state.recordingId,
      sequence: state.chunkSequence++,
      checksum: checksum,
      chunk_file: event.data
    });
  }
};

async function uploadChunk(data) {
  const formData = new FormData();
  formData.append('recording_id', data.recording_id);
  formData.append('sequence', data.sequence);
  formData.append('checksum', data.checksum);
  formData.append('chunk_file', data.chunk_file, `chunk_${data.sequence}.webm`);

  const response = await fetch(`${API_URL}/api/uploads/chunk`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    // Retry with exponential backoff
    await retryUpload(data, attempt + 1);
  }
}
```

**Backend Handler** (`recording_service/src/adapters/inbound/rest/upload_api.py`):

```python
from fastapi import APIRouter, UploadFile, Form
from minio import Minio
import hashlib

@router.post("/uploads/chunk")
async def upload_chunk(
    recording_id: str = Form(...),
    sequence: int = Form(...),
    checksum: str = Form(...),
    chunk_file: UploadFile = Form(...)
):
    # Read chunk data
    chunk_data = await chunk_file.read()

    # Verify checksum
    calculated = hashlib.sha256(chunk_data).hexdigest()
    if calculated != checksum:
        raise HTTPException(400, "Checksum mismatch")

    # Upload to MinIO
    minio_client = get_minio_client()
    key = f"recordings/{recording.session_id}/{recording.participant_id}/{recording.track_type}/chunk_{sequence:04d}.webm"

    minio_client.put_object(
        bucket_name="recordings",
        object_name=key,
        data=BytesIO(chunk_data),
        length=len(chunk_data),
        content_type="video/webm"
    )

    # Save metadata to database
    await save_chunk_metadata(recording_id, sequence, len(chunk_data), key)

    # Update progress
    progress = await get_upload_progress(recording_id)

    return {
        "chunk_id": str(chunk_id),
        "sequence": sequence,
        "progress": f"{progress.uploaded}/{progress.total}"
    }
```

### Processing Service - FFmpeg Stitching

**Event Consumer** (`processing_service/src/consumers/recording_consumer.py`):

```python
import asyncio
from aio_pika import connect_robust, IncomingMessage
import subprocess
import tempfile
import os

async def consume_recording_events():
    connection = await connect_robust("amqp://guest:guest@localhost/")
    channel = await connection.channel()

    queue = await channel.declare_queue("recording_events")
    await queue.bind("podcast_events", routing_key="recording.stopped")

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            async with message.process():
                await process_recording(message.body)

async def process_recording(event_data):
    recording = parse_event(event_data)

    # 1. Fetch all chunks from MinIO
    chunks = await fetch_chunks_from_minio(
        session_id=recording.session_id,
        participant_id=recording.participant_id,
        track_type=recording.track_type
    )

    # 2. Create concat file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        for chunk in sorted(chunks, key=lambda x: x.sequence):
            # Download chunk temporarily
            chunk_path = await download_chunk(chunk.minio_key)
            f.write(f"file '{chunk_path}'\n")
        concat_file = f.name

    # 3. Run FFmpeg
    output_file = f"/tmp/output_{recording.id}.webm"
    cmd = [
        'ffmpeg',
        '-f', 'concat',
        '-safe', '0',
        '-i', concat_file,
        '-c', 'copy',  # No re-encoding (fast!)
        output_file
    ]

    result = subprocess.run(cmd, capture_output=True)

    if result.returncode == 0:
        # 4. Upload to MinIO processed bucket
        await upload_to_minio(
            bucket="processed",
            key=f"{recording.session_id}/{recording.participant_id}/{recording.track_type}_final.webm",
            file_path=output_file
        )

        # 5. Update database
        await mark_processing_complete(recording.id, output_key)

        # 6. Publish completed event
        await publish_event("recording.processed", recording.id)

    # Cleanup
    os.unlink(concat_file)
    os.unlink(output_file)
```

---

## 🎨 Frontend Implementation

### Meeting Room Component

```typescript
// app/room/[roomId]/page.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { VideoGrid } from '@/components/meeting/video-grid';
import { Controls } from '@/components/meeting/controls';
import { HostPanel } from '@/components/meeting/host-panel';
import { useWebRTC } from '@/hooks/use-webrtc';
import { useRecording } from '@/hooks/use-recording';
import { UploadProgressModal } from '@/components/recording/upload-progress-modal';

export default function MeetingRoom() {
  const { roomId } = useParams();
  const [role, setRole] = useState<'host' | 'guest'>('guest');
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // WebRTC for peer-to-peer video/audio
  const {
    localStream,
    remoteStreams,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    toggleAudio,
    toggleVideo,
    leaveRoom
  } = useWebRTC(roomId);

  // Recording with real-time upload
  const {
    isRecording,
    uploadProgress,
    startRecording,
    stopRecording,
    pendingUploads
  } = useRecording(roomId, localStream);

  const handleLeave = async () => {
    if (pendingUploads > 0) {
      setShowLeaveModal(true);
    } else {
      await leaveRoom();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Video Grid */}
      <VideoGrid
        localStream={localStream}
        remoteStreams={remoteStreams}
        isScreenSharing={isScreenSharing}
      />

      {/* Controls */}
      <Controls
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onScreenShare={isScreenSharing ? stopScreenShare : startScreenShare}
        onLeave={handleLeave}
        isRecording={isRecording}
        uploadProgress={uploadProgress}
      />

      {/* Host Panel (if host) */}
      {role === 'host' && (
        <HostPanel
          participants={remoteStreams}
          onMute={(participantId) => muteParticipant(participantId)}
          onKick={(participantId) => kickParticipant(participantId)}
        />
      )}

      {/* Leave Warning Modal */}
      {showLeaveModal && (
        <UploadProgressModal
          pendingUploads={pendingUploads}
          uploadProgress={uploadProgress}
          onWait={() => setShowLeaveModal(false)}
          onForceLeave={leaveRoom}
        />
      )}
    </div>
  );
}
```

---

## 🚀 Complete Setup Instructions

### 1. Start Infrastructure (5 min)

```bash
# Start all services
docker-compose up -d

# Wait for health checks
docker-compose ps

# Create MinIO buckets
docker exec podcasthub_minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec podcasthub_minio mc mb local/recordings
docker exec podcasthub_minio mc mb local/processed

# Initialize PostgreSQL schema
psql -h localhost -U podcasthub -d podcasthub -f schema.sql
```

### 2. Update Recording Service (30 min)

See `media-recording-service/IMPLEMENTATION.md`

Key changes:
- Add MinIO client
- Update chunk upload to use MinIO
- Remove local storage logic

### 3. Create Processing Service (1 hour)

See `media-processing-service/` directory with complete implementation

### 4. Build Next.js Frontend (2 hours)

See `podcast-frontend/` with complete structure

### 5. Test End-to-End (30 min)

```bash
# Terminal 1: Recording Service
cd media-recording-service
python -m uvicorn main:app --reload --port 8001

# Terminal 2: Processing Service
cd media-processing-service
python -m uvicorn main:app --reload --port 8002

# Terminal 3: Frontend
cd podcast-frontend
npm install
npm run dev

# Open: http://localhost:3000
```

---

## 📊 For Your Presentation

### Demonstration Flow

1. **Show Architecture Diagram** (2 min)
   - Explain microservices
   - Point out WebRTC, MinIO, FFmpeg

2. **Create Meeting** (2 min)
   - Host creates room
   - Gets room code
   - Shows waiting room

3. **Guest Joins** (1 min)
   - Enter room code
   - WebRTC connection established
   - Both see each other

4. **Start Recording** (3 min)
   - Host clicks record
   - Show real-time chunk upload
   - Open MinIO console - chunks appearing!
   - Show database - metadata updating

5. **Meeting Features** (3 min)
   - Host mutes guest
   - Guest shares screen
   - Host stops screen share
   - Pause/resume recording

6. **Leave Meeting** (2 min)
   - Guest tries to leave
   - Show "Uploads pending" modal
   - Wait or force leave
   - Meeting ends

7. **Processing** (2 min)
   - Open RabbitMQ - show event
   - Processing service picks it up
   - FFmpeg stitches chunks
   - Final file in MinIO "processed" bucket

8. **Architecture Benefits** (2 min)
   - Scalable (each service independent)
   - Resilient (retry logic, queue)
   - Real-time (WebRTC + chunk upload)
   - Production-ready (MinIO, PostgreSQL)

### Key Points to Emphasize

✅ **Microservices**: Each service has single responsibility
✅ **Event-Driven**: Loose coupling via RabbitMQ
✅ **Real-Time**: WebRTC for video, real-time chunk upload
✅ **Scalable Storage**: MinIO (S3-compatible)
✅ **Professional Processing**: FFmpeg for production quality
✅ **Clean Architecture**: Hexagonal pattern, DDD
✅ **Production-Ready**: Checksums, retries, monitoring

---

## 📁 Repository Structure

```
CAS-735-Project/
├── docker-compose.yml                 # All infrastructure
├── schema.sql                         # PostgreSQL schema
├── ARCHITECTURE.md                    # This file
├── IMPLEMENTATION_REPORT.md           # Detailed docs
│
├── media-recording-service/           # Recording + Upload
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── inbound/rest/
│   │   │   │   └── upload_api.py      # Chunk upload endpoint
│   │   │   └── outbound/storage/
│   │   │       └── minio_client.py    # MinIO integration
│   │   ├── application/services/
│   │   │   └── recording_service.py   # Business logic
│   │   └── domain/models/
│   │       └── recording.py           # Domain model
│   └── main.py
│
├── media-processing-service/          # FFmpeg Processing
│   ├── src/
│   │   ├── consumers/
│   │   │   └── recording_consumer.py  # RabbitMQ consumer
│   │   ├── processors/
│   │   │   └── ffmpeg_processor.py    # FFmpeg logic
│   │   └── storage/
│   │       └── minio_client.py
│   └── main.py
│
└── podcast-frontend/                  # Next.js + WebRTC
    ├── src/
    │   ├── app/
    │   │   ├── room/[roomId]/page.tsx # Meeting room
    │   │   ├── create/page.tsx        # Create meeting
    │   │   └── join/page.tsx          # Join meeting
    │   ├── components/
    │   │   ├── meeting/
    │   │   │   ├── video-grid.tsx
    │   │   │   ├── controls.tsx
    │   │   │   └── host-panel.tsx
    │   │   └── recording/
    │   │       └── upload-progress-modal.tsx
    │   └── hooks/
    │       ├── use-webrtc.ts          # WebRTC logic
    │       └── use-recording.ts       # Recording logic
    └── package.json
```

---

**Status**: ✅ **Architecture Complete - Ready for Implementation**

**Next**: Follow `IMPLEMENTATION_GUIDE.md` for step-by-step build instructions.
