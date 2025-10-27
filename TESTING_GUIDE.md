# PodcastHub - Complete Testing Guide

This guide walks you through testing the entire system from infrastructure setup to recording and uploading.

## Prerequisites

- Docker and Docker Compose installed
- Python 3.11+ installed
- Node.js 18+ and npm installed
- Two browser windows/tabs (to test host + guest)

## Step 1: Start Infrastructure Services

Start RabbitMQ, MinIO, PostgreSQL, and Redis using Docker Compose:

```bash
cd /home/user/CAS-735-Project

# Start all infrastructure services
docker-compose up -d

# Verify all services are running
docker-compose ps
```

**Expected output:**
```
NAME                COMMAND                  SERVICE      STATUS
rabbitmq            "docker-entrypoint.s…"   rabbitmq     Up
minio               "/usr/bin/docker-ent…"   minio        Up
postgres            "docker-entrypoint.s…"   postgres     Up
redis               "docker-entrypoint.s…"   redis        Up
```

### Verify Services

**RabbitMQ Management:**
- URL: http://localhost:15672
- Username: `guest`
- Password: `guest`
- Check: Exchanges, Queues tabs should load

**MinIO Console:**
- URL: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin`
- Check: You should see the MinIO dashboard
- Create bucket: Click "Buckets" → "Create Bucket" → Name: `recordings` → Create

**PostgreSQL:**
```bash
# Connect to PostgreSQL
docker exec -it $(docker ps -qf "name=postgres") psql -U podcasthub -d podcasthub

# Verify connection
\dt  # List tables (will be empty initially)
\q   # Quit
```

**Redis:**
```bash
# Test Redis connection
docker exec -it $(docker ps -qf "name=redis") redis-cli ping
# Expected: PONG
```

## Step 2: Set Up Backend (Media Recording Service)

### Install Dependencies

```bash
cd /home/user/CAS-735-Project/media-recording-service

# Create virtual environment (if not exists)
python -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Linux/Mac
# OR
venv\Scripts\activate     # On Windows

# Install dependencies
pip install -r requirements.txt
```

### Configure Environment

Create `.env` file:

```bash
cat > .env << 'EOF'
# Application
ENVIRONMENT=development
DEBUG=true
HOST=0.0.0.0
PORT=8001

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672/

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=false
MINIO_BUCKET=recordings

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=podcasthub
POSTGRES_PASSWORD=podcasthub123
POSTGRES_DATABASE=podcasthub

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS
CORS_ORIGINS=["http://localhost:3000"]
EOF
```

### Start Backend Server

```bash
# From media-recording-service directory
python main.py
```

**Expected output:**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
```

### Test Backend Health

Open a new terminal and test:

```bash
# Health check
curl http://localhost:8001/health

# Expected: {"status":"healthy"}

# API documentation
# Open in browser: http://localhost:8001/docs
# You should see the FastAPI Swagger UI
```

## Step 3: Set Up Frontend (Next.js)

### Install Dependencies

Open a new terminal:

```bash
cd /home/user/CAS-735-Project/podcast-frontend

# Install dependencies
npm install
```

**Note:** This may take a few minutes for first-time installation.

### Configure Environment

The `.env.example` is already configured correctly for local development:

```bash
# Copy example (if .env.local doesn't exist)
cp .env.example .env.local

# Verify configuration
cat .env.local
```

Should contain:
```
NEXT_PUBLIC_API_URL=http://localhost:8001/api
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws
```

### Start Frontend Development Server

```bash
# From podcast-frontend directory
npm run dev
```

**Expected output:**
```
   ▲ Next.js 14.0.3
   - Local:        http://localhost:3000
   - Network:      http://192.168.x.x:3000

 ✓ Ready in 2.3s
```

### Verify Frontend

Open browser to http://localhost:3000

**Expected:** You should see the PodcastHub landing page with dark purple/pink gradient theme.

## Step 4: End-to-End Testing Flow

### Test 1: Create Meeting (Host)

**Browser 1 - Host:**

1. Open http://localhost:3000
2. Click **"Create Meeting"** button
3. Enter your name (e.g., "Alice")
4. Click **"Create Meeting"**

**Expected:**
- API call to `POST /api/sessions/create`
- Redirect to `/room/{sessionId}`
- Room code displayed in header (e.g., "ABC123")
- Your video should appear in local video panel
- Status shows "Waiting for participant..."

**Check Backend Logs:**
```
POST /api/sessions/create
Response: {"session_id": "...", "room_code": "ABC123", ...}
```

**Check MinIO:**
- Go to http://localhost:9001
- Navigate to "Buckets" → "recordings"
- Should be empty (no recording started yet)

### Test 2: Join Meeting (Guest)

**Browser 2 - Guest:**

1. Open http://localhost:3000 in a NEW browser window/incognito
2. Click **"Join Meeting"** button
3. Enter the room code from Host (e.g., "ABC123")
4. Enter your name (e.g., "Bob")
5. Click **"Join Meeting"**

**Expected:**
- API call to `POST /api/sessions/join`
- Redirect to `/room/{sessionId}`
- Both participants see each other's video (WebRTC connected)
- "Recording" button only visible to host

**Troubleshooting WebRTC:**
If videos don't connect:
- Check browser console for errors
- Ensure both windows have camera/mic permissions
- Backend WebSocket signaling must be implemented (see Step 5)

### Test 3: Media Controls

**Both browsers:**

1. Click microphone button - Audio should mute/unmute
2. Click camera button - Video should stop/start
3. Click screen share - Screen picker should appear

**Expected:**
- Icons change color (gray = active, red = off)
- Video feed updates accordingly
- Other participant sees changes

### Test 4: Start Recording (Host Only)

**Browser 1 - Host:**

1. Click **"Start Recording"** button

**Expected:**
- API call to `POST /api/recordings/start`
- Recording indicator appears (red dot, timer)
- Timer starts counting: 00:00:00
- Upload progress section appears below video

**Check Backend Logs:**
```
POST /api/recordings/start
Creating recording for session: {...}
Recording started: {...}
```

### Test 5: Monitor Real-time Upload

**Browser 1 - Host:**

Watch the "Real-time Upload Progress" section:

**Expected (every 5 seconds):**
- Audio chunks: 0/1, 0/2, 0/3... (uploaded/total)
- Video chunks: 0/1, 0/2, 0/3...
- Screen chunks: (if screen sharing) 0/1, 0/2...
- Progress bars fill up as chunks upload

**Backend logs should show:**
```
POST /api/uploads/chunk
Chunk uploaded: recording_id=..., sequence=0, track=audio
Chunk uploaded: recording_id=..., sequence=1, track=video
```

**Check MinIO Console:**

1. Go to http://localhost:9001
2. Click "Buckets" → "recordings"
3. Navigate: `sessions/{session_id}/recordings/{recording_id}/`
4. Should see folders: `audio/`, `video/`, `screen/`
5. Inside each folder: `chunk_00000.webm`, `chunk_00001.webm`, etc.

**Expected file structure:**
```
recordings/
└── sessions/
    └── {session_id}/
        └── recordings/
            └── {recording_id}/
                ├── audio/
                │   ├── chunk_00000.webm
                │   ├── chunk_00001.webm
                │   └── chunk_00002.webm
                ├── video/
                │   ├── chunk_00000.webm
                │   ├── chunk_00001.webm
                │   └── chunk_00002.webm
                └── screen/  (if screen sharing)
                    ├── chunk_00000.webm
                    └── chunk_00001.webm
```

### Test 6: Pause/Resume Recording

**Browser 1 - Host:**

1. Click **"Pause Recording"** button

**Expected:**
- Recording indicator changes to "PAUSED" (yellow)
- Timer stops
- New chunks stop uploading
- Upload progress freezes

**Backend logs:**
```
POST /api/recordings/pause
Recording paused: {...}
```

2. Click **"Resume Recording"** button

**Expected:**
- Recording indicator back to "RECORDING" (red)
- Timer resumes
- Chunks start uploading again
- Progress bars continue

**Backend logs:**
```
POST /api/recordings/resume
Recording resumed: {...}
```

### Test 7: Stop Recording

**Browser 1 - Host:**

1. Let recording run for 20-30 seconds (4-6 chunks per track)
2. Click **"Stop Recording"** button

**Expected:**
- Recording indicator disappears
- Timer resets to 00:00:00
- Upload progress hidden
- Final chunks finish uploading

**Backend logs:**
```
POST /api/recordings/stop
Recording stopped: {...}
Event published: recording.stopped
```

**Check MinIO:**
- All chunks should be uploaded
- Verify file sizes are reasonable (not 0 bytes)

### Test 8: Leave Meeting with Pending Uploads

**Browser 1 - Host:**

1. Start recording
2. **Immediately** click the red phone button (Leave)

**Expected:**
- Warning modal appears: "Uploads Pending"
- Message: "Some recording chunks are still uploading..."
- Two buttons: "Stay in Meeting" / "Leave Anyway"

3. Click **"Stay in Meeting"**

**Expected:**
- Modal closes
- Recording continues
- Chunks keep uploading

4. Wait for all uploads to complete (progress shows uploaded = total)
5. Click Leave button again

**Expected:**
- No warning modal
- Redirect to home page

### Test 9: Guest Leaves Meeting

**Browser 2 - Guest:**

1. Click red phone button (Leave)

**Expected:**
- No upload warning (guest doesn't record)
- Redirect to home page
- Host sees "Waiting for participant..." again

## Step 5: Verify Data Integrity

### Check MinIO Storage

```bash
# List all objects in bucket using MinIO CLI (optional)
docker exec -it $(docker ps -qf "name=minio") mc ls local/recordings --recursive

# Or use MinIO Console (http://localhost:9001)
```

**Verify:**
- All chunks have reasonable file sizes (> 1 KB)
- Chunk sequences are continuous (0, 1, 2, 3...)
- No missing chunks

### Download and Play Chunks

1. In MinIO Console, navigate to a chunk file
2. Click the three dots → Download
3. Open in VLC or browser
4. Should play audio/video (5 seconds each)

### Check RabbitMQ Events

1. Go to http://localhost:15672
2. Login: guest/guest
3. Click "Queues" tab
4. Look for `podcast_events` exchange
5. Check message count and routing

## Common Issues and Troubleshooting

### Issue: Backend Won't Start

**Error:** `ModuleNotFoundError: No module named 'pydantic_settings'`

**Solution:**
```bash
cd media-recording-service
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Issue: Frontend Won't Start

**Error:** `Module not found: Can't resolve '@/hooks/use-webrtc'`

**Solution:**
```bash
cd podcast-frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Issue: "Cannot read properties of undefined (reading 'localStream')"

**Cause:** WebRTC hook not initialized

**Solution:**
- Check browser console for getUserMedia errors
- Grant camera/microphone permissions
- Try in Chrome/Edge (better WebRTC support)

### Issue: Chunks Not Uploading

**Check:**

1. Backend logs for errors:
```bash
# In backend terminal
# Look for: "Error uploading chunk", "Checksum mismatch"
```

2. MinIO is running:
```bash
docker ps | grep minio
# Should show running container

curl http://localhost:9000/minio/health/live
# Should return: 200 OK
```

3. CORS settings:
```bash
# In media-recording-service/.env
CORS_ORIGINS=["http://localhost:3000"]
```

### Issue: WebRTC Peer Connection Fails

**Symptoms:** Remote video shows "Waiting for participant..." even after guest joins

**Cause:** WebSocket signaling server not implemented yet

**Workaround:** This is expected - WebSocket signaling is in the "Next Steps" section. For now:
- You can test local video/audio capture
- You can test recording and upload
- Peer-to-peer connection requires WebSocket implementation

**To implement:** See `ARCHITECTURE.md` WebRTC Signaling section

### Issue: "Room not found" when joining

**Check:**
1. Backend is running
2. Room code is correct (6 chars, uppercase)
3. Host actually created the session
4. Session API endpoints are implemented

### Issue: Video Permission Denied

**Solution:**
1. Click the camera icon in browser address bar
2. Select "Allow" for camera and microphone
3. Refresh the page
4. Try again

For HTTPS requirement (some browsers):
```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Update Next.js to use HTTPS (next.config.js)
```

## Performance Testing

### Test Large Recordings

1. Start recording
2. Let it run for 5+ minutes
3. Monitor:
   - Upload progress (should stay near 100%)
   - Memory usage (browser dev tools)
   - Network activity
   - MinIO storage growth

**Expected:**
- Smooth upload without lag
- Memory doesn't grow unbounded
- Chunk uploads complete in < 2 seconds each

### Test Multiple Sessions

1. Open 4+ browser tabs
2. Create 2 separate meetings (2 hosts)
3. Join each with a guest
4. Start recordings in both

**Expected:**
- Both sessions work independently
- No interference or data mixing
- Each session has unique session_id

### Test Edge Cases

1. **Slow network:** Throttle network in DevTools → See retry logic
2. **Backend restart:** Kill backend → See upload failures → Restart → Uploads should retry
3. **MinIO down:** Stop MinIO → Uploads fail gracefully → Start MinIO → Retry succeeds

## Next Steps: Implementing Missing Features

After basic testing, implement these features:

### 1. WebSocket Signaling Server

**File:** `media-recording-service/src/adapters/inbound/websocket_handler.py`

Implement:
- `/ws/{session_id}` endpoint
- Broadcast offer/answer/ICE candidates
- Session participant tracking

### 2. Session Management API

**File:** `media-recording-service/src/adapters/inbound/http/session_routes.py`

Implement:
- `POST /api/sessions/create` → Create session, generate room code
- `POST /api/sessions/join` → Validate room code, join session
- `GET /api/sessions/{id}` → Get session details

### 3. PostgreSQL Database Integration

**File:** `media-recording-service/src/infrastructure/database/`

Implement:
- Database connection pooling
- Session repository
- Recording repository
- Migration scripts

### 4. Media Processing Service

**New Service:** `media-processing-service/`

Implement:
- RabbitMQ consumer for `recording.stopped` events
- FFmpeg chunk stitching
- Upload processed files to MinIO
- Publish `recording.processed` events

## Test Checklist

- [ ] Infrastructure services start successfully
- [ ] Backend API responds to health checks
- [ ] Frontend loads without errors
- [ ] Host can create meeting
- [ ] Guest can join with room code
- [ ] Local video/audio capture works
- [ ] Media controls (mic, camera, screen) work
- [ ] Recording starts and timer runs
- [ ] Chunks upload to MinIO every 5 seconds
- [ ] Upload progress displays correctly
- [ ] Pause/resume recording works
- [ ] Stop recording completes all uploads
- [ ] Leave warning shows when uploads pending
- [ ] MinIO contains all chunks with correct structure
- [ ] Chunks are playable in VLC
- [ ] RabbitMQ receives events
- [ ] Multiple sessions work independently

## Success Criteria

✅ **Basic Flow Complete:**
- Host creates → Guest joins → Record → Upload → Stop → Verify in MinIO

✅ **Real-time Upload:**
- Chunks upload DURING recording (not download at end)
- Progress bars update every 5 seconds
- All chunks present in MinIO

✅ **Data Integrity:**
- Checksums validate correctly
- No missing chunks
- Files are playable
- Correct folder structure in MinIO

## Contact & Support

If you encounter issues not covered here:

1. Check backend logs for detailed errors
2. Check browser console for frontend errors
3. Verify all services are running: `docker-compose ps`
4. Check MinIO connectivity: `curl http://localhost:9000/minio/health/live`
5. Review `ARCHITECTURE.md` for system design details

---

**Happy Testing!** 🎙️🚀
