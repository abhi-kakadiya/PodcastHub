# Multi-Track Recording Testing Guide

This guide explains how to test the new multi-track recording feature that simultaneously records:
1. **Audio track** - Microphone only
2. **Video track** - Camera + microphone
3. **Screen share track** - Screen + audio

## Quick Start (5 minutes)

### Step 1: Start the Services

```bash
# Terminal 1: Start RabbitMQ
cd /home/user/CAS-735-Project
docker-compose up -d rabbitmq

# Terminal 2: Start Media Recording Service
cd media-recording-service
python -m uvicorn src.main:app --reload --port 8001
```

### Step 2: Open the Multi-Track Interface

Open in a modern browser (Chrome, Edge, or Firefox):
```
http://localhost:8001/static/index-multitrack.html
```

### Step 3: Grant Permissions

When you click "Start Recording", the browser will request three permissions:
1. **Microphone** - for audio track
2. **Camera + Microphone** - for video track
3. **Screen Share** - for screen capture

Click "Allow" for each permission prompt.

### Step 4: Start Recording

1. The Session ID and Participant ID are auto-filled
2. Click **"🔴 Start Recording"**
3. Watch all three track panels:
   - **🎤 Audio Track** - should show "🔴 Recording"
   - **📹 Video Track** - should show "🔴 Recording"
   - **🖥️ Screen Share Track** - should show "🔴 Recording"

### Step 5: Monitor Progress

Each track panel shows:
- **Status**: Current state (Recording, Paused, Stopped, etc.)
- **Upload Progress**: Number of chunks uploaded
- **Log**: Detailed activity log with color-coded messages

### Step 6: Test Pause/Resume

1. Click **"⏸️ Pause"** - all three tracks pause
2. The timer stops
3. Click **"▶️ Resume"** - all three tracks resume
4. The timer continues from where it stopped

### Step 7: Stop Recording

1. Click **"⏹️ Stop Recording"**
2. Wait for all chunks to finish uploading
3. Each track shows "✅ Completed" when done

## What You'll See

### Successful Recording

For each track, you should see logs like:

```
[14:23:45] [AUDIO] Starting track...
[14:23:45] [AUDIO] Requesting media access...
[14:23:46] [AUDIO] ✓ Media access granted
[14:23:46] [AUDIO] Starting recording on server...
[14:23:46] [AUDIO] ✓ Recording started: 123e4567-e89b-12d3-a456-426614174000
[14:23:46] [AUDIO] Initializing upload session...
[14:23:47] [AUDIO] ✓ Upload session created: 234e5678-e89b-12d3-a456-426614174001
[14:23:47] [AUDIO] ✓ Local recording started
[14:23:52] [AUDIO] Chunk 0 queued (42KB)
[14:23:52] [AUDIO] Uploading chunk 0 (attempt 1/5)...
[14:23:53] [AUDIO] ✓ Chunk 0 uploaded successfully
```

### Track Status Colors

- 🟢 Green text = Success
- 🔵 Blue text = Info
- 🔴 Red text = Error
- 🟡 Yellow text = Warning

## Advanced Testing

### Test Individual Track Failures

You can test what happens if one track fails:

1. **Deny camera permission** - Video track will fail, but audio and screen should continue
2. **Cancel screen share** - Screen track will fail, but audio and video should continue

The system is designed to be resilient - if at least one track succeeds, recording continues.

### Test Chunk Upload Retry Logic

Each track has independent retry logic:
- Chunks retry up to 5 times with exponential backoff
- Failed chunks are logged but don't stop other tracks

### Test Pause/Resume Accuracy

The pause/resume feature:
- Pauses MediaRecorder locally
- Calls backend pause endpoint
- Stops the duration timer
- Resuming restarts from exact same point

Duration calculation excludes pause time on the backend.

### Test Browser Permissions

Multi-track recording requires:
- **Microphone**: Required for audio and video tracks
- **Camera**: Required for video track only
- **Screen capture**: Required for screen track only

If any permission is denied, that specific track will fail gracefully.

## Backend Verification

### Check Recording Records

Each track creates a separate recording in the database:

```bash
# Using the API
curl http://localhost:8001/api/recordings/session/{session_id}
```

You should see three recordings with different `track_type`:
- `"track_type": "audio"`
- `"track_type": "video"`
- `"track_type": "screen"`

### Check Uploaded Chunks

For each recording, verify chunks were uploaded:

```bash
curl http://localhost:8001/api/recordings/{recording_id}/chunks
```

### Check Storage

Files are stored separately by track type:

```bash
ls -lh ./storage/recordings/{session_id}/{participant_id}/
```

You should see three subdirectories:
- `audio/` - Audio-only chunks
- `video/` - Video chunks
- `screen/` - Screen share chunks

## Troubleshooting

### "Failed to start recording" Error

**Possible causes:**
1. Backend service not running
2. Session ID or Participant ID is empty
3. Network connection issue

**Solution:**
- Check that `uvicorn` is running on port 8001
- Fill in both Session ID and Participant ID
- Check browser console for detailed errors

### Permission Denied Errors

**Symptom:** One or more tracks show "❌ Failed" status

**Solution:**
1. Check browser permission settings
2. Reload the page
3. Grant permissions when prompted
4. Some browsers (Safari) may have additional restrictions

### Chunk Upload Failures

**Symptom:** Logs show "✗ Chunk X upload failed"

**Possible causes:**
1. Backend service stopped
2. Network interruption
3. Checksum mismatch

**Solution:**
- Check backend logs for detailed error messages
- Chunks will retry automatically (up to 5 times)
- If persistent, check storage permissions

### One Track Works, Others Don't

This is expected behavior when:
- User denies camera permission → Video track fails
- User cancels screen share → Screen track fails
- Microphone not available → Audio track fails

The system allows partial success - working tracks continue recording.

## Comparison: Single-Track vs Multi-Track

### Original Interface (index.html)
- Records ONE track at a time
- User selects: audio, video, OR screen
- Single MediaRecorder instance
- Single recording ID
- Simpler UI

### New Multi-Track Interface (index-multitrack.html)
- Records THREE tracks simultaneously
- No selection needed - captures all
- Three MediaRecorder instances
- Three recording IDs
- More complex UI with separate panels

Both interfaces work with the same backend!

## File Structure

```
media-recording-service/
├── static/
│   ├── index.html                 # Original single-track interface
│   ├── recorder.js                # Original single-track recorder
│   ├── index-multitrack.html      # NEW: Multi-track interface
│   └── recorder-multitrack.js     # NEW: Multi-track recorder
└── src/
    ├── domain/
    │   └── models/
    │       └── recording.py       # Updated: Added TrackType enum
    ├── application/
    │   └── services/
    │       └── recording_service.py  # Updated: Uses track_type
    └── adapters/
        └── inbound/
            └── rest/
                ├── dtos.py        # Updated: TrackTypeEnum
                └── recording_api.py  # Updated: track_type field
```

## API Changes

### Start Recording Endpoint

**Old request body:**
```json
{
  "session_id": "session_123",
  "participant_id": "user_456",
  "media_type": "audio"
}
```

**New request body:**
```json
{
  "session_id": "session_123",
  "participant_id": "user_456",
  "track_type": "audio"
}
```

### Response Changes

**Old response:**
```json
{
  "recording_id": "...",
  "media_type": "audio",
  ...
}
```

**New response:**
```json
{
  "recording_id": "...",
  "track_type": "audio",
  ...
}
```

## Next Steps

After testing multi-track recording, you can:

1. **Process recordings** - Each track can be processed separately in Media Processing Service
2. **Mix tracks** - Use FFmpeg to combine all three tracks
3. **Download tracks** - Each track is available as a separate WebM file
4. **Analyze data** - Query recordings by session to see all three tracks

## Performance Considerations

### Browser Resource Usage

Recording three tracks simultaneously:
- **CPU**: Moderate to high (encoding three streams)
- **Memory**: ~200-500MB (buffering chunks)
- **Network**: 3x bandwidth (three concurrent uploads)

### Recommended System Requirements

- **CPU**: Quad-core or better
- **RAM**: 8GB minimum
- **Network**: Stable broadband connection (5+ Mbps upload)
- **Browser**: Latest Chrome, Edge, or Firefox

### Chunk Upload Behavior

- Each track uploads ~1 chunk every 5 seconds
- Total: ~3 chunks every 5 seconds (all tracks combined)
- Each chunk is ~40-100KB depending on track type
- Network load: ~150-300KB every 5 seconds

## Summary

The multi-track recording feature provides a professional podcasting experience similar to Riverside.fm:
- ✅ Three separate high-quality tracks
- ✅ Independent upload and retry logic
- ✅ Synchronized pause/resume across all tracks
- ✅ Resilient to individual track failures
- ✅ Real-time progress monitoring
- ✅ Backend support for separate processing

This enables professional post-production workflows where:
- Audio track can be enhanced separately
- Video track provides visual content
- Screen share captures presentations/demos
- All tracks synchronized for easy editing
