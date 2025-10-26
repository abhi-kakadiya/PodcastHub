# End-to-End Testing Guide
## Complete Walkthrough for PodcastHub Services

This guide provides a complete end-to-end testing walkthrough with copy-paste commands.

---

## Prerequisites Checklist

Before starting, ensure you have:
- [ ] Docker and Docker Compose installed
- [ ] Python 3.11+ installed
- [ ] Chrome, Firefox, or Safari browser
- [ ] Terminal/Command prompt

---

## Part 1: Environment Setup (5 minutes)

### Step 1.1: Start RabbitMQ

```bash
cd /home/user/CAS-735-Project
docker-compose up -d
```

**Verify RabbitMQ is running:**
```bash
docker ps
```
You should see `rabbitmq:3-management-alpine` running.

**Access RabbitMQ Management UI:**
- URL: http://localhost:15672
- Username: `guest`
- Password: `guest`

---

### Step 1.2: Start Media Recording Service

Open **Terminal 1**:

```bash
cd /home/user/CAS-735-Project/media-recording-service

# Create virtual environment if not exists
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Linux/Mac
# venv\Scripts\activate   # On Windows

# Install dependencies
pip install -r requirements.txt

# Start the service
python main.py
```

**Expected Output:**
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     RabbitMQ connection established
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001
```

**Verify:**
- Open http://localhost:8001/docs in browser
- You should see Swagger UI with API documentation

---

### Step 1.3: Start Media Processing Service

Open **Terminal 2**:

```bash
cd /home/user/CAS-735-Project/media-processing-service

# Create virtual environment if not exists
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Linux/Mac
# venv\Scripts\activate   # On Windows

# Install dependencies
pip install -r requirements.txt

# Start the service
python main.py
```

**Expected Output:**
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     RabbitMQ connection established
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8002
```

**Verify:**
- Open http://localhost:8002/docs in browser
- You should see Swagger UI with API documentation

---

## Part 2: Web UI Testing (Easiest Method - 10 minutes)

### Step 2.1: Open the Recorder Interface

1. Open your browser and go to: **http://localhost:8001/static/index.html**
2. You should see the "PodcastHub - Media Recorder" interface

### Step 2.2: Start Recording

1. **Fill in the form:**
   - Session ID: `test_session_001`
   - Participant ID: `alice`
   - Media Type: Select "Audio Only"

2. **Click "Start Recording"**
   - Browser will ask for microphone permission - click "Allow"
   - You should see: "Status: Recording"
   - The recording timer should start

3. **Speak or play audio** for about 15-20 seconds
   - Watch the logs section at the bottom
   - You should see messages like:
     ```
     Chunk 0 uploaded successfully
     Chunk 1 uploaded successfully
     Chunk 2 uploaded successfully
     ```

### Step 2.3: Stop Recording

1. **Click "Stop Recording"**
   - You should see: "Status: Stopped"
   - Progress bar should show 100%
   - Final status: "Upload completed"

### Step 2.4: Verify in RabbitMQ

1. Go to http://localhost:15672
2. Click "Exchanges" tab
3. Click "podcast_events" exchange
4. You should see messages published with routing keys like:
   - `recording.started`
   - `upload.started`
   - `chunk.uploaded`
   - `upload.completed`
   - `recording.ended`

**Congratulations! You've completed the web UI test.**

---

## Part 3: API Testing with curl (15 minutes)

Open **Terminal 3** for running curl commands.

### Step 3.1: Start a Recording

```bash
curl -X POST "http://localhost:8001/api/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "api_test_session",
    "participant_id": "bob",
    "media_type": "audio"
  }'
```

**Expected Response:**
```json
{
  "recording_id": "some-uuid-here",
  "session_id": "api_test_session",
  "participant_id": "bob",
  "status": "recording",
  "media_type": "audio",
  "started_at": "2025-10-26T...",
  "created_at": "2025-10-26T..."
}
```

**IMPORTANT:** Copy the `recording_id` from the response - you'll need it for next steps!

---

### Step 3.2: Initiate Upload Session

Replace `<RECORDING_ID>` with the recording_id from Step 3.1:

```bash
curl -X POST "http://localhost:8001/api/uploads/initiate" \
  -H "Content-Type: application/json" \
  -d '{
    "recording_id": "<RECORDING_ID>",
    "session_id": "api_test_session",
    "file_name": "bob_audio.webm",
    "mime_type": "audio/webm",
    "total_chunks": 3
  }'
```

**Expected Response:**
```json
{
  "upload_id": "some-upload-uuid",
  "recording_id": "...",
  "session_id": "api_test_session",
  "status": "in_progress",
  "total_chunks": 3,
  "uploaded_chunks": 0,
  "progress_percentage": 0.0,
  "file_name": "bob_audio.webm"
}
```

**IMPORTANT:** Copy the `upload_id` - you'll need it for chunk uploads!

---

### Step 3.3: Create Test Data and Upload Chunks

Create a test file:
```bash
cd /tmp
echo "This is test audio chunk data for chunk 0" > chunk0.txt
echo "This is test audio chunk data for chunk 1" > chunk1.txt
echo "This is test audio chunk data for chunk 2" > chunk2.txt
```

Upload chunk 0:
```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<UPLOAD_ID>" \
  -F "sequence_number=0" \
  -F "checksum=$(md5sum /tmp/chunk0.txt | cut -d' ' -f1)" \
  -F "chunk_file=@/tmp/chunk0.txt"
```

Upload chunk 1:
```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<UPLOAD_ID>" \
  -F "sequence_number=1" \
  -F "checksum=$(md5sum /tmp/chunk1.txt | cut -d' ' -f1)" \
  -F "chunk_file=@/tmp/chunk1.txt"
```

Upload chunk 2:
```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<UPLOAD_ID>" \
  -F "sequence_number=2" \
  -F "checksum=$(md5sum /tmp/chunk2.txt | cut -d' ' -f1)" \
  -F "chunk_file=@/tmp/chunk2.txt"
```

**Expected Response for each chunk:**
```json
{
  "chunk_id": "...",
  "recording_id": "...",
  "sequence_number": 0,
  "data_size": 42,
  "status": "uploaded",
  "uploaded_at": "..."
}
```

---

### Step 3.4: Check Upload Progress

```bash
curl "http://localhost:8001/api/uploads/<UPLOAD_ID>/progress"
```

**Expected Response:**
```json
{
  "upload_id": "...",
  "recording_id": "...",
  "status": "completed",
  "progress_percentage": 100.0,
  "uploaded_chunks": 3,
  "total_chunks": 3,
  "uploaded_size_bytes": 126,
  "total_size_bytes": 126,
  "failed_chunks_count": 0,
  "can_resume": false,
  "file_name": "bob_audio.webm"
}
```

---

### Step 3.5: Stop Recording

```bash
curl -X POST "http://localhost:8001/api/recordings/<RECORDING_ID>/stop"
```

**Expected Response:**
```json
{
  "recording_id": "...",
  "session_id": "api_test_session",
  "participant_id": "bob",
  "status": "stopped",
  "ended_at": "...",
  "duration_seconds": 120.5
}
```

---

### Step 3.6: Get Recording Status

```bash
curl "http://localhost:8001/api/recordings/<RECORDING_ID>/status"
```

**Expected Response:**
```json
{
  "recording_id": "...",
  "session_id": "api_test_session",
  "participant_id": "bob",
  "status": "stopped",
  "media_type": "audio",
  "started_at": "...",
  "ended_at": "...",
  "duration_seconds": 120.5,
  "upload": {
    "upload_id": "...",
    "status": "completed",
    "progress_percentage": 100.0,
    "uploaded_chunks": 3,
    "total_chunks": 3
  }
}
```

**Congratulations! You've completed the recording workflow.**

---

## Part 4: Test Media Processing Service

### Step 4.1: Create Processing Job

Use the recording IDs from previous tests:

```bash
curl -X POST "http://localhost:8002/api/processing/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "api_test_session",
    "recording_ids": ["<RECORDING_ID_1>", "<RECORDING_ID_2>"],
    "output_format": "mp3"
  }'
```

**Expected Response:**
```json
{
  "job_id": "some-job-uuid",
  "session_id": "api_test_session",
  "status": "pending",
  "total_tracks": 2,
  "output_format": "mp3"
}
```

**Copy the `job_id`!**

---

### Step 4.2: Start Processing

```bash
curl -X POST "http://localhost:8002/api/processing/jobs/<JOB_ID>/start"
```

**Expected Response:**
```json
{
  "job_id": "...",
  "session_id": "api_test_session",
  "status": "completed",
  "total_tracks": 2,
  "output_format": "mp3"
}
```

The processing goes through phases:
- PENDING → SYNCHRONIZING → ENHANCING → MIXING → COMPLETED

---

### Step 4.3: Get Job Status

```bash
curl "http://localhost:8002/api/processing/jobs/<JOB_ID>"
```

**Expected Response:**
```json
{
  "job_id": "...",
  "session_id": "api_test_session",
  "status": "completed",
  "current_step": "mixing",
  "total_tracks": 2,
  "processed_tracks": 2,
  "output_format": "mp3",
  "output_file_path": "processed/api_test_session/final.mp3",
  "started_at": "...",
  "completed_at": "...",
  "duration_seconds": 5.2
}
```

---

## Part 5: Test Multi-Participant Session

### Step 5.1: Create Multiple Recordings in Same Session

Participant 1 (Alice):
```bash
curl -X POST "http://localhost:8001/api/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "podcast_episode_001",
    "participant_id": "host_alice",
    "media_type": "video"
  }'
```

Participant 2 (Bob):
```bash
curl -X POST "http://localhost:8001/api/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "podcast_episode_001",
    "participant_id": "guest_bob",
    "media_type": "audio"
  }'
```

Participant 3 (Charlie):
```bash
curl -X POST "http://localhost:8001/api/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "podcast_episode_001",
    "participant_id": "guest_charlie",
    "media_type": "audio"
  }'
```

---

### Step 5.2: Get All Recordings for Session

```bash
curl "http://localhost:8001/api/recordings/session/podcast_episode_001"
```

**Expected Response:**
```json
[
  {
    "recording_id": "...",
    "session_id": "podcast_episode_001",
    "participant_id": "host_alice",
    "status": "recording",
    "media_type": "video"
  },
  {
    "recording_id": "...",
    "session_id": "podcast_episode_001",
    "participant_id": "guest_bob",
    "status": "recording",
    "media_type": "audio"
  },
  {
    "recording_id": "...",
    "session_id": "podcast_episode_001",
    "participant_id": "guest_charlie",
    "status": "recording",
    "media_type": "audio"
  }
]
```

This demonstrates multiple participants in the same podcast session.

---

## Part 6: Test Error Handling

### Step 6.1: Test Invalid Checksum

```bash
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<VALID_UPLOAD_ID>" \
  -F "sequence_number=0" \
  -F "checksum=invalid_checksum_123" \
  -F "chunk_file=@/tmp/chunk0.txt"
```

**Expected Response (400 Bad Request):**
```json
{
  "detail": "Checksum mismatch: expected invalid_checksum_123, got <actual_checksum>"
}
```

---

### Step 6.2: Test Duplicate Chunk Upload

Upload the same chunk twice:

```bash
# First upload (should succeed)
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<UPLOAD_ID>" \
  -F "sequence_number=0" \
  -F "checksum=$(md5sum /tmp/chunk0.txt | cut -d' ' -f1)" \
  -F "chunk_file=@/tmp/chunk0.txt"

# Second upload of same chunk (should succeed but be idempotent)
curl -X POST "http://localhost:8001/api/uploads/chunk" \
  -F "upload_id=<UPLOAD_ID>" \
  -F "sequence_number=0" \
  -F "checksum=$(md5sum /tmp/chunk0.txt | cut -d' ' -f1)" \
  -F "chunk_file=@/tmp/chunk0.txt"
```

Both should succeed - the system handles idempotent uploads.

---

### Step 6.3: Test Non-Existent Recording

```bash
curl "http://localhost:8001/api/recordings/00000000-0000-0000-0000-000000000000/status"
```

**Expected Response (404 Not Found):**
```json
{
  "detail": "Recording not found"
}
```

---

## Part 7: Verify Event-Driven Architecture

### Step 7.1: Monitor RabbitMQ Events

1. Go to http://localhost:15672
2. Click **"Exchanges"** tab
3. Click **"podcast_events"** exchange
4. Click **"Bindings"** to see all routing keys

You should see events like:
- `recording.started`
- `recording.ended`
- `upload.started`
- `upload.completed`
- `chunk.uploaded`
- `processing.job.created`
- `processing.job.completed`

### Step 7.2: Check Service Logs

In **Terminal 1** (Recording Service), you should see:
```
INFO: Published event: RecordingStarted
INFO: Published event: UploadStarted
INFO: Published event: ChunkUploaded
INFO: Published event: UploadCompleted
INFO: Published event: RecordingEnded
```

In **Terminal 2** (Processing Service), you should see:
```
INFO: Published event: ProcessingJobCreated
INFO: Published event: ProcessingJobCompleted
```

---

## Part 8: Run Automated Tests

### Step 8.1: Test Recording Service

```bash
cd /home/user/CAS-735-Project/media-recording-service
source venv/bin/activate
pytest tests/ -v
```

**Expected Output:**
```
tests/test_recording_service.py::test_recording_start PASSED
tests/test_recording_service.py::test_recording_stop PASSED
tests/test_upload_service.py::test_upload_initiate PASSED
tests/test_upload_service.py::test_chunk_upload PASSED
...
======================== 15 passed in 2.31s ========================
```

---

### Step 8.2: Test Processing Service

```bash
cd /home/user/CAS-735-Project/media-processing-service
source venv/bin/activate
pytest tests/ -v
```

**Expected Output:**
```
tests/test_processing_service.py::test_job_creation PASSED
tests/test_processing_service.py::test_job_execution PASSED
...
======================== 10 passed in 1.82s ========================
```

---

## Part 9: Test with Postman (Optional)

### Step 9.1: Import Collections

1. Open Postman
2. Click **"Import"**
3. Import these files:
   - `media-recording-service/postman_collection.json`
   - `media-processing-service/postman_collection.json`

### Step 9.2: Set Environment Variables

1. Create new environment: **"PodcastHub Local"**
2. Add variables:
   - `recording_base_url` = `http://localhost:8001`
   - `processing_base_url` = `http://localhost:8002`

### Step 9.3: Run Collections

1. Select the collection
2. Click **"Run"**
3. All tests should pass with green checkmarks

---

## Complete End-to-End Scenario

Here's a complete workflow combining all services:

### Scenario: Record a 3-Person Podcast and Process It

**1. Start recordings for all participants (3 separate browser tabs or API calls)**
   - Alice (host) - video
   - Bob (guest 1) - audio
   - Charlie (guest 2) - audio

**2. Record for 2-3 minutes**
   - Chunks upload automatically every 5 seconds
   - Monitor progress in real-time

**3. Stop all recordings**
   - All participants click "Stop Recording"

**4. Create processing job**
   - Submit all 3 recording IDs to processing service

**5. Start processing**
   - Service synchronizes, enhances, and mixes all tracks

**6. Get final output**
   - Processing completes in ~5 seconds
   - Output file path provided

**7. Verify events**
   - Check RabbitMQ for all published events
   - Verify event-driven communication

---

## Troubleshooting

### Issue: "Connection refused" when starting services

**Solution:**
```bash
# Check if RabbitMQ is running
docker ps

# Restart RabbitMQ
docker-compose down
docker-compose up -d

# Wait 10 seconds for RabbitMQ to fully start
sleep 10

# Then start the services
```

---

### Issue: Browser doesn't ask for microphone permission

**Solution:**
1. Make sure you're accessing via `localhost` (not `127.0.0.1`)
2. Check browser settings → Privacy → Microphone
3. Try a different browser (Chrome works best)

---

### Issue: Chunks not uploading

**Solution:**
1. Check browser console (F12) for errors
2. Verify service is running on port 8001
3. Check file size limits in nginx/proxy if using

---

### Issue: Tests failing

**Solution:**
```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall

# Clear pytest cache
rm -rf .pytest_cache __pycache__

# Run tests with more verbosity
pytest tests/ -vv -s
```

---

## Success Criteria Checklist

After completing this guide, you should have:

- [x] RabbitMQ running and accessible
- [x] Both services running on ports 8001 and 8002
- [x] Successfully recorded audio via web UI
- [x] Successfully uploaded chunks with progress tracking
- [x] Successfully created and executed processing job
- [x] Verified multi-participant sessions
- [x] Tested error handling scenarios
- [x] Verified event-driven architecture in RabbitMQ
- [x] Passed all automated tests
- [x] Understood the complete workflow

---

## What You've Tested

This end-to-end guide demonstrates:

1. **Hexagonal Architecture**: Domain logic separated from infrastructure
2. **Event-Driven Architecture**: RabbitMQ message-driven communication
3. **REST APIs**: OpenAPI-compliant endpoints
4. **WebRTC**: Local media recording
5. **Chunked Uploads**: Resilient upload with retry logic
6. **Multi-Participant**: Multiple users in same session
7. **Processing Pipeline**: Synchronization → Enhancement → Mixing
8. **Error Handling**: Validation, checksums, idempotency
9. **In-Memory Storage**: Thread-safe repositories
10. **Automated Testing**: Unit and integration tests

---

## Next Steps

1. **Review Architecture**: Read `ARCHITECTURE.md` for detailed design decisions
2. **Explore Code**: Navigate the Hexagonal Architecture layers
3. **Extend Features**: Add authentication, real FFmpeg processing, etc.
4. **Integration**: Connect with teammate Suleyman's services
5. **Phase 3**: Add database persistence and production features

---

## Questions or Issues?

If you encounter any issues:
1. Check service logs in terminals
2. Verify RabbitMQ status
3. Review API documentation at `/docs` endpoints
4. Check `SCENARIO.md` for detailed test scenarios

---

**You're now ready to demonstrate your Phase 2 implementation!**
