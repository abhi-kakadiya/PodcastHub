# SCENARIO.md - Test Scenarios for PodcastHub Services

## Overview

This document describes executable scenarios for testing the Media Recording & Upload Service and Media Processing Service. Each scenario includes step-by-step instructions for testing via REST API, Web Interface, and automated tests.

---

## Scenario 1: Complete Recording and Upload Workflow

**Objective:** Test the full lifecycle of creating a recording, uploading chunks, and verifying completion.

### Prerequisites
- Both services running (ports 8001, 8002)
- RabbitMQ running (docker-compose up -d)
- Postman installed (optional)

### Using REST API (curl/Postman)

#### Step 1: Start a Recording

```bash
curl -X POST "http://localhost:8001/api/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test_session_001",
    "participant_id": "user_alice",
    "media_type": "audio"
  }'
```

**Expected Response (201 Created):**
```json
{
  "recording_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "session_id": "test_session_001",
  "participant_id": "user_alice",
  "status": "recording",
  "media_type": "audio",
  "started_at": "2025-10-26T10:00:00",
  "created_at": "2025-10-26T09:59:00"
}
```

**What happens internally:**
- Recording domain model created with status WAITING
- `start()` method called, status changes to RECORDING
- `RecordingStarted` event published to RabbitMQ
- Repository saves recording in memory

**Save the `recording_id` for next steps**

---

#### Step 2: Initiate Upload Session

```bash
curl -X POST "http://localhost:8001/api/uploads/initiate" \
  -H "Content-Type: application/json" \
  -d '{
    "recording_id": "<recording_id_from_step_1>",
    "session_id": "test_session_001",
    "file_name": "alice_audio.webm",
    "mime_type": "audio/webm",
    "total_chunks": 3
  }'
```

**Expected Response (201 Created):**
```json
{
  "upload_id": "7ba95f64-5717-4562-b3fc-2c963f66afa9",
  "recording_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "session_id": "test_session_001",
  "status": "in_progress",
  "total_chunks": 3,
  "uploaded_chunks": 0,
  "progress_percentage": 0.0,
  "file_name": "alice_audio.webm"
}
```

**What happens internally:**
- Upload aggregate created with status IN_PROGRESS
- Recording existence validated
- `UploadStarted` event published to RabbitMQ

**Save the `upload_id` for next steps**

---

#### Step 3: Upload Chunks

Create a test file for uploading:
```bash
echo "This is test chunk data for testing purposes" > test_chunk.txt
```

Upload chunk 0:
```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<upload_id_from_step_2>" \
  -F "sequence_number=0" \
  -F "checksum=$(md5sum test_chunk.txt | cut -d' ' -f1)" \
  -F "chunk_file=@test_chunk.txt"
```

Upload chunk 1:
```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<upload_id_from_step_2>" \
  -F "sequence_number=1" \
  -F "checksum=$(md5sum test_chunk.txt | cut -d' ' -f1)" \
  -F "chunk_file=@test_chunk.txt"
```

Upload chunk 2:
```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<upload_id_from_step_2>" \
  -F "sequence_number=2" \
  -F "checksum=$(md5sum test_chunk.txt | cut -d' ' -f1)" \
  -F "chunk_file=@test_chunk.txt"
```

**Expected Response for each chunk (201 Created):**
```json
{
  "chunk_id": "8ca95f64-5717-4562-b3fc-2c963f66afb1",
  "recording_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "sequence_number": 0,
  "data_size": 45,
  "status": "uploaded",
  "uploaded_at": "2025-10-26T10:01:00"
}
```

**What happens internally:**
- Checksum validation
- Chunk stored in memory
- Chunk status updated to UPLOADED
- Upload progress updated
- `ChunkUploaded` event published
- After last chunk: `UploadCompleted` event published

---

#### Step 4: Check Upload Progress

```bash
curl "http://localhost:8001/api/uploads/<upload_id>/progress"
```

**Expected Response:**
```json
{
  "upload_id": "7ba95f64-5717-4562-b3fc-2c963f66afa9",
  "recording_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "completed",
  "progress_percentage": 100.0,
  "uploaded_chunks": 3,
  "total_chunks": 3,
  "uploaded_size_bytes": 135,
  "total_size_bytes": 135,
  "failed_chunks_count": 0,
  "can_resume": false,
  "file_name": "alice_audio.webm"
}
```

---

#### Step 5: Stop Recording

```bash
curl -X POST "http://localhost:8001/api/recordings/<recording_id>/stop"
```

**Expected Response (200 OK):**
```json
{
  "recording_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "session_id": "test_session_001",
  "participant_id": "user_alice",
  "status": "stopped",
  "ended_at": "2025-10-26T10:05:00",
  "duration_seconds": 300.0
}
```

**What happens internally:**
- Recording `stop()` method called
- Status changed to STOPPED
- `RecordingEnded` event published to RabbitMQ

---

#### Step 6: Get Recording Status

```bash
curl "http://localhost:8001/api/recordings/<recording_id>/status"
```

**Expected Response:**
```json
{
  "recording_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "session_id": "test_session_001",
  "participant_id": "user_alice",
  "status": "stopped",
  "media_type": "audio",
  "started_at": "2025-10-26T10:00:00",
  "ended_at": "2025-10-26T10:05:00",
  "duration_seconds": 300.0,
  "upload": {
    "upload_id": "7ba95f64-5717-4562-b3fc-2c963f66afa9",
    "status": "completed",
    "progress_percentage": 100.0,
    "uploaded_chunks": 3,
    "total_chunks": 3
  }
}
```

---

### Using Web Interface

1. Open `http://localhost:8001/static/index.html`
2. Enter Session ID: `test_session_001`
3. Enter Participant ID: `user_alice`
4. Select Media Type: `Audio Only`
5. Click "Start Recording"
6. Allow microphone access when prompted
7. Speak for 15-20 seconds (chunks upload automatically every 5 seconds)
8. Click "Stop Recording"
9. Check the log panel for chunk upload status
10. Verify progress bar shows 100%

---

### Using Postman

1. Import `media-recording-service/postman_collection.json`
2. Set environment variable `base_url` = `http://localhost:8001`
3. Run requests in order:
   - Start Recording
   - Initiate Upload
   - Upload Chunk (repeat 3 times with different sequence numbers)
   - Get Upload Progress
   - Stop Recording
   - Get Recording Status

---

## Scenario 2: Processing Job Workflow

**Objective:** Create and execute a media processing job

### Step 1: Create Processing Job

```bash
curl -X POST "http://localhost:8002/api/processing/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test_session_001",
    "recording_ids": [
      "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "3fa85f64-5717-4562-b3fc-2c963f66afa7"
    ],
    "output_format": "mp3"
  }'
```

**Expected Response (201 Created):**
```json
{
  "job_id": "9da85f64-5717-4562-b3fc-2c963f66afb8",
  "session_id": "test_session_001",
  "status": "pending",
  "total_tracks": 2,
  "output_format": "mp3"
}
```

**What happens internally:**
- ProcessingJob aggregate created with status PENDING
- `ProcessingJobCreated` event published

---

### Step 2: Start Processing

```bash
curl -X POST "http://localhost:8002/api/processing/jobs/<job_id>/start"
```

**Expected Response (200 OK):**
```json
{
  "job_id": "9da85f64-5717-4562-b3fc-2c963f66afb8",
  "session_id": "test_session_001",
  "status": "completed",
  "total_tracks": 2,
  "output_format": "mp3"
}
```

**What happens internally:**
- Job status changes through: SYNCHRONIZING → ENHANCING → MIXING → COMPLETED
- Events published for each step
- `ProcessingJobCompleted` event published at end

---

### Step 3: Get Job Status

```bash
curl "http://localhost:8002/api/processing/jobs/<job_id>"
```

**Expected Response:**
```json
{
  "job_id": "9da85f64-5717-4562-b3fc-2c963f66afb8",
  "session_id": "test_session_001",
  "status": "completed",
  "current_step": "mixing",
  "total_tracks": 2,
  "processed_tracks": 2,
  "output_format": "mp3",
  "output_file_path": "processed/test_session_001/final.mp3",
  "started_at": "2025-10-26T10:06:00",
  "completed_at": "2025-10-26T10:06:05",
  "duration_seconds": 5.0
}
```

---

## Scenario 3: Error Handling - Chunk Upload Failure and Retry

**Objective:** Test chunk upload failure and retry mechanism

### Step 1: Upload Chunk with Wrong Checksum

```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<upload_id>" \
  -F "sequence_number=0" \
  -F "checksum=wrong_checksum_123" \
  -F "chunk_file=@test_chunk.txt"
```

**Expected Response (400 Bad Request):**
```json
{
  "detail": "Checksum mismatch: expected wrong_checksum_123, got <actual_checksum>"
}
```

---

### Step 2: Retry with Correct Checksum

```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<upload_id>" \
  -F "sequence_number=0" \
  -F "checksum=$(md5sum test_chunk.txt | cut -d' ' -f1)" \
  -F "chunk_file=@test_chunk.txt"
```

**Expected Response (201 Created):**
Chunk uploaded successfully.

---

## Scenario 4: Multi-Participant Session

**Objective:** Test multiple participants recording simultaneously in the same session

### Step 1: Start Recording for Participant 1

```bash
curl -X POST "http://localhost:8001/api/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "podcast_session_123",
    "participant_id": "host_alice",
    "media_type": "video"
  }'
```

### Step 2: Start Recording for Participant 2

```bash
curl -X POST "http://localhost:8001/api/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "podcast_session_123",
    "participant_id": "guest_bob",
    "media_type": "audio"
  }'
```

### Step 3: Get All Recordings for Session

```bash
curl "http://localhost:8001/api/recordings/session/podcast_session_123"
```

**Expected Response (200 OK):**
```json
[
  {
    "recording_id": "...",
    "session_id": "podcast_session_123",
    "participant_id": "host_alice",
    "status": "recording",
    "media_type": "video"
  },
  {
    "recording_id": "...",
    "session_id": "podcast_session_123",
    "participant_id": "guest_bob",
    "status": "recording",
    "media_type": "audio"
  }
]
```

---

## Scenario 5: Running Automated Tests

### Unit Tests

```bash
cd media-recording-service
pytest tests/test_recording_service.py -v
pytest tests/test_api.py -v
```

**Expected Output:**
- All tests pass with green checkmarks
- Tests cover domain models, repositories, services, and APIs

---

## Summary

These scenarios demonstrate:
1. ✅ Recording lifecycle (start/stop)
2. ✅ Chunked upload with progress tracking
3. ✅ Processing job creation and execution
4. ✅ Error handling and validation
5. ✅ Multi-participant sessions
6. ✅ Event-driven communication via RabbitMQ
7. ✅ Hexagonal architecture implementation
8. ✅ REST API with OpenAPI documentation
9. ✅ WebRTC frontend integration
10. ✅ Automated testing

All scenarios can be executed via:
- **curl** commands (shown above)
- **Postman** collections (import and run)
- **Web Interface** (http://localhost:8001/static/index.html)
- **Automated Tests** (pytest)

