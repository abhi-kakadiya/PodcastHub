# 🧪 End-to-End Testing Guide with Debugging

**Complete testing workflow for PodcastHub P2P Application**

This guide walks you through testing every component with debugging steps at each phase.

---

## 📋 Prerequisites

- [ ] Windows laptop
- [ ] Phone (Android/iOS)
- [ ] Both connected to same WiFi (or use ngrok for different networks)
- [ ] Docker Desktop installed
- [ ] Node.js 18+ installed
- [ ] Python 3.9+ installed

---

## 🎯 Testing Approach

We'll test in **7 phases**, verifying each layer before moving to the next:

```
Phase 1: Environment Setup
Phase 2: Infrastructure (Docker)
Phase 3: Backend API
Phase 4: Frontend Build
Phase 5: WebSocket Signaling
Phase 6: WebRTC P2P Connection
Phase 7: Recording & Upload
```

**At each phase:**
- ✅ Success criteria (what should work)
- 🐛 Debug commands (how to check)
- ❌ Failure scenarios (what to look for)
- 🔧 Fix actions (how to resolve)

---

## 📦 Phase 1: Environment Setup and Verification

### Goal
Verify all configuration files are correct before starting services.

### Step 1.1: Check Your Network Configuration

```bash
# Find your laptop's local IP
ipconfig

# Note your IPv4 Address (e.g., 192.168.40.27)
```

**Expected Output:**
```
Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . . . . . . . . . : 192.168.40.27
```

**🐛 Debug:**
```bash
# If no WiFi adapter shown
ipconfig /all

# Check if WiFi is connected
netsh wlan show interfaces
```

**Write down your IP:** `___________________`

---

### Step 1.2: Verify Backend Environment

```bash
cd media-recording-service
cat .env
```

**Expected Configuration:**
```env
ENVIRONMENT=development
DEBUG=True
HOST=0.0.0.0
PORT=8001

RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_EXCHANGE=podcast_events

# IMPORTANT: Must include both localhost and your IP with HTTPS
CORS_ORIGINS=["http://localhost:3000","https://localhost:3000","http://192.168.40.27:3000","https://192.168.40.27:3000"]

MAX_CHUNK_SIZE=5242880
MAX_UPLOAD_SIZE=524288000

MEDIA_PROCESSING_QUEUE=media.processing.requests

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=podcasthub
POSTGRES_PASSWORD=podcasthub123
POSTGRES_DATABASE=podcasthub
POSTGRES_URL=postgresql+asyncpg://podcasthub:podcasthub123@localhost:5432/podcasthub

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=False
MINIO_BUCKET=recordings

REDIS_HOST=localhost
REDIS_PORT=6379
```

**✅ Checklist:**
- [ ] `HOST=0.0.0.0` (NOT 127.0.0.1)
- [ ] `CORS_ORIGINS` includes `https://192.168.40.27:3000` (your IP)
- [ ] `POSTGRES_HOST=localhost` (NOT postgres for local testing)
- [ ] `MINIO_ENDPOINT=localhost:9000` (NOT minio:9000)

**🐛 Debug:**
```bash
# Check if file exists
ls -la .env

# Verify CORS setting
grep CORS_ORIGINS .env

# If missing, copy from example
cp .env.example .env
```

---

### Step 1.3: Verify Frontend Environment

```bash
cd ../podcast-frontend
cat .env.local
```

**Expected Configuration (Local Network):**
```env
# Backend API URL (your laptop's IP)
NEXT_PUBLIC_API_URL=http://192.168.40.27:8001/api

# WebSocket URL (your laptop's IP)
NEXT_PUBLIC_WS_URL=ws://192.168.40.27:8001/ws

# App Configuration
NEXT_PUBLIC_APP_NAME=PodcastHub
NEXT_PUBLIC_APP_DESCRIPTION=Professional Podcast Recording Platform

# TURN Server (REQUIRED for P2P)
NEXT_PUBLIC_TURN_URL=turn:openrelay.metered.ca:443
NEXT_PUBLIC_TURN_USERNAME=openrelayproject
NEXT_PUBLIC_TURN_CREDENTIAL=openrelayproject
```

**OR (Using ngrok):**
```env
NEXT_PUBLIC_API_URL=https://f94936b87e03.ngrok-free.app/api
NEXT_PUBLIC_WS_URL=wss://f94936b87e03.ngrok-free.app/ws

NEXT_PUBLIC_APP_NAME=PodcastHub
NEXT_PUBLIC_APP_DESCRIPTION=Professional Podcast Recording Platform

NEXT_PUBLIC_TURN_URL=turn:openrelay.metered.ca:443
NEXT_PUBLIC_TURN_USERNAME=openrelayproject
NEXT_PUBLIC_TURN_CREDENTIAL=openrelayproject
```

**✅ Checklist:**
- [ ] `NEXT_PUBLIC_TURN_URL` is set (CRITICAL!)
- [ ] `NEXT_PUBLIC_TURN_USERNAME` is set
- [ ] `NEXT_PUBLIC_TURN_CREDENTIAL` is set
- [ ] URLs match your setup (local IP or ngrok)

**🐛 Debug:**
```bash
# Check if file exists
ls -la .env.local

# Verify TURN is configured
grep TURN .env.local

# If missing, create it
notepad .env.local
```

---

### Step 1.4: Check SSL Certificates (For Local Network Only)

**Only needed if using HTTPS on local network**

```bash
cd ..
ls -la certificates/
```

**Expected Files:**
```
localhost.key
localhost.crt
```

**If missing:**
```bash
# Run the setup script
cd deploy
.\setup-local-network.ps1
```

---

### Step 1.5: Phase 1 Validation

**✅ Success Criteria:**
- [ ] Backend `.env` configured with correct CORS
- [ ] Frontend `.env.local` configured with TURN server
- [ ] Your local IP noted
- [ ] (Optional) SSL certificates generated

**🐛 Debug Command:**
```bash
# Quick validation script
echo "Backend CORS:"
grep CORS_ORIGINS media-recording-service/.env

echo "Frontend TURN:"
grep TURN podcast-frontend/.env.local

echo "Your IP:"
ipconfig | findstr IPv4
```

**❌ Common Issues:**
- Missing `.env` or `.env.local` → Copy from `.env.example`
- Wrong IP in CORS → Update to your actual IP
- No TURN configured → Add TURN server details

---

## 🐳 Phase 2: Infrastructure Services Testing

### Goal
Verify Docker services (RabbitMQ, MinIO, PostgreSQL, Redis) are running correctly.

### Step 2.1: Start Infrastructure

```bash
cd /path/to/CAS-735-Project

# Stop everything first
docker-compose down

# Start only infrastructure (NOT app services)
docker-compose up -d rabbitmq minio postgres redis

# Wait 30 seconds for initialization
timeout 30
```

**Expected Output:**
```
Creating podcasthub_rabbitmq ... done
Creating podcasthub_minio    ... done
Creating podcasthub_postgres ... done
Creating podcasthub_redis    ... done
```

---

### Step 2.2: Verify Services Status

```bash
docker-compose ps
```

**Expected Output:**
```
NAME                   STATUS    PORTS
podcasthub_rabbitmq    Up        5672->5672, 15672->15672
podcasthub_minio       Up        9000->9000, 9001->9001
podcasthub_postgres    Up        5432->5432
podcasthub_redis       Up        6379->6379
```

**✅ Checklist:**
- [ ] All 4 services show "Up"
- [ ] No "Restarting" or "Exited" status

**🐛 Debug:**
```bash
# Check logs if any service is down
docker-compose logs rabbitmq
docker-compose logs minio
docker-compose logs postgres
docker-compose logs redis

# Check resource usage
docker stats --no-stream
```

**❌ Common Issues:**
- Port already in use → Kill process using port
- Container keeps restarting → Check logs
- Out of memory → Restart Docker Desktop

---

### Step 2.3: Test RabbitMQ

```bash
# Open in browser
start http://localhost:15672

# Login: guest / guest
```

**Expected:**
- ✅ Login successful
- ✅ RabbitMQ Management UI loads
- ✅ Shows "Nodes" and "Overview" tabs

**🐛 Debug:**
```bash
# Test connection
curl -u guest:guest http://localhost:15672/api/overview

# Should return JSON with RabbitMQ info

# Check RabbitMQ logs
docker-compose logs rabbitmq | tail -20
```

---

### Step 2.4: Test MinIO

```bash
# Open in browser
start http://localhost:9001

# Login: minioadmin / minioadmin
```

**Expected:**
- ✅ Login successful
- ✅ MinIO Console UI loads
- ✅ Shows "Buckets" and "Object Browser"

**🐛 Debug:**
```bash
# Test connection
curl http://localhost:9000/minio/health/live

# Should return: 200 OK

# Check MinIO logs
docker-compose logs minio | tail -20
```

---

### Step 2.5: Test PostgreSQL

```bash
# Test connection
docker exec podcasthub_postgres psql -U podcasthub -d podcasthub -c "SELECT version();"
```

**Expected Output:**
```
PostgreSQL 15.x on x86_64-pc-linux-musl
```

**🐛 Debug:**
```bash
# Check if database exists
docker exec podcasthub_postgres psql -U podcasthub -l

# Check connection from host
psql -h localhost -U podcasthub -d podcasthub
# Password: podcasthub123

# Check logs
docker-compose logs postgres | tail -20
```

---

### Step 2.6: Test Redis

```bash
# Test connection
docker exec podcasthub_redis redis-cli ping
```

**Expected Output:**
```
PONG
```

**🐛 Debug:**
```bash
# Test from host
redis-cli -h localhost -p 6379 ping

# Check logs
docker-compose logs redis | tail -20
```

---

### Step 2.7: Phase 2 Validation

**✅ Success Criteria:**
- [ ] All 4 Docker services running
- [ ] RabbitMQ UI accessible (port 15672)
- [ ] MinIO UI accessible (port 9001)
- [ ] PostgreSQL connection works
- [ ] Redis responds to PING

**🐛 Debug Command:**
```bash
# Run all tests at once
echo "=== Docker Status ==="
docker-compose ps

echo "=== RabbitMQ ==="
curl -s -u guest:guest http://localhost:15672/api/overview | grep version

echo "=== MinIO ==="
curl -s http://localhost:9000/minio/health/live

echo "=== PostgreSQL ==="
docker exec podcasthub_postgres psql -U podcasthub -d podcasthub -c "SELECT 1;" 2>&1 | grep "1 row"

echo "=== Redis ==="
docker exec podcasthub_redis redis-cli ping
```

**❌ If any test fails, fix it before proceeding to Phase 3!**

---

## 🔧 Phase 3: Backend Service Testing

### Goal
Verify backend API and WebSocket endpoints are working.

### Step 3.1: Start Backend

```bash
# Open Terminal 1
cd media-recording-service

# Install dependencies (if not already)
pip install -r requirements.txt

# Start backend
python main.py
```

**Expected Output:**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
```

**✅ Checklist:**
- [ ] No errors during startup
- [ ] Shows "Uvicorn running on http://0.0.0.0:8001"
- [ ] NOT showing 127.0.0.1 (must be 0.0.0.0)

**🐛 Debug:**
```bash
# If port already in use
netstat -ano | findstr :8001
# Kill the process if needed

# Check for import errors
python -c "from main import app; print('OK')"

# Verify environment
python -c "from src.infrastructure.config import get_settings; print(get_settings().host)"
# Should print: 0.0.0.0
```

---

### Step 3.2: Test Health Endpoint

```bash
# In a new terminal
curl http://localhost:8001/health
```

**Expected Output:**
```json
{
  "status": "healthy",
  "service": "Media Recording & Upload Service",
  "version": "1.0.0",
  "environment": "development"
}
```

**🐛 Debug:**
```bash
# Test with verbose output
curl -v http://localhost:8001/health

# Test from laptop IP
curl http://192.168.40.27:8001/health

# If timeout, check firewall
Get-NetFirewallRule -DisplayName "PodcastHub*"
```

---

### Step 3.3: Test API Documentation

```bash
# Open in browser
start http://localhost:8001/docs
```

**Expected:**
- ✅ Swagger UI loads
- ✅ Shows all API endpoints
- ✅ Can expand and see endpoint details

**🐛 Debug:**
```bash
# Check if OpenAPI JSON is available
curl http://localhost:8001/openapi.json | head -20
```

---

### Step 3.4: Test Session Creation

```bash
# Create a test session
curl -X POST http://localhost:8001/api/sessions/create \
  -H "Content-Type: application/json" \
  -d "{\"host_id\": \"test-host\"}"
```

**Expected Output:**
```json
{
  "session_id": "7f0a56e7-927c-48b2-bb9a-c25ea9ec9a0f",
  "room_code": "O356VR",
  "host_id": "test-host",
  "status": "active",
  "created_at": "2025-10-30T04:50:15.168428"
}
```

**Save the session_id and room_code for later!**

**🐛 Debug:**
```bash
# Check backend logs for errors
# Look in Terminal 1 where backend is running

# Test with curl verbose
curl -v -X POST http://localhost:8001/api/sessions/create \
  -H "Content-Type: application/json" \
  -d "{\"host_id\": \"test-host\"}"

# Check database
docker exec podcasthub_postgres psql -U podcasthub -d podcasthub -c "SELECT * FROM sessions;"
```

---

### Step 3.5: Test WebSocket Endpoint

**Open a new browser tab and go to:**
```
http://localhost:8001/docs
```

**Scroll to WebSocket section, or test manually:**

```javascript
// Open browser console (F12) on http://localhost:8001/docs
const ws = new WebSocket('ws://localhost:8001/ws/test-session-123');

ws.onopen = () => {
  console.log('✅ WebSocket connected');

  // Send join message
  ws.send(JSON.stringify({
    type: 'join',
    sessionId: 'test-session-123',
    participantId: 'test-user',
    isHost: true
  }));
};

ws.onmessage = (event) => {
  console.log('📨 Received:', JSON.parse(event.data));
};

ws.onerror = (error) => {
  console.error('❌ Error:', error);
};
```

**Expected Output:**
```
✅ WebSocket connected
```

**🐛 Debug:**
```bash
# Check active sessions
curl http://localhost:8001/ws/sessions/active

# Should show:
# {"total_sessions": 1, "sessions": [...]}

# Check backend logs
# Look for: "WebSocket connection accepted for session: test-session-123"
```

---

### Step 3.6: Test CORS

```bash
# Test from different origin
curl -H "Origin: https://192.168.40.27:3000" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS http://localhost:8001/api/sessions/create
```

**Expected Output:**
```
access-control-allow-origin: https://192.168.40.27:3000
access-control-allow-methods: POST
```

**🐛 Debug:**
```bash
# Check CORS configuration
curl -v -H "Origin: https://192.168.40.27:3000" http://localhost:8001/health

# Look for Access-Control-Allow-Origin header

# Verify backend .env
grep CORS_ORIGINS media-recording-service/.env
```

---

### Step 3.7: Phase 3 Validation

**✅ Success Criteria:**
- [ ] Backend starts without errors
- [ ] Health endpoint returns 200
- [ ] API docs load at /docs
- [ ] Can create session via API
- [ ] WebSocket accepts connections
- [ ] CORS headers present

**🐛 Debug Command:**
```bash
# Run all backend tests
echo "=== Health Check ==="
curl -s http://localhost:8001/health | grep healthy

echo "=== Create Session ==="
curl -s -X POST http://localhost:8001/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"host_id":"test"}' | grep session_id

echo "=== Active Sessions ==="
curl -s http://localhost:8001/ws/sessions/active

echo "=== CORS ==="
curl -s -I -H "Origin: https://192.168.40.27:3000" http://localhost:8001/health | grep -i access-control
```

**Backend Terminal should show:**
```
INFO:     172.18.0.1:34376 - "POST /api/sessions/create HTTP/1.1" 200 OK
INFO:     172.18.0.1:53516 - "GET /health HTTP/1.1" 200 OK
```

---

## 🎨 Phase 4: Frontend Build and Configuration

### Goal
Build frontend with correct environment variables and TURN server configuration.

### Step 4.1: Clean Previous Builds

```bash
# Open Terminal 2
cd podcast-frontend

# Remove old build artifacts
rm -rf .next
rm -rf node_modules/.cache

# Verify environment file
cat .env.local
```

**✅ Verify TURN is configured:**
```env
NEXT_PUBLIC_TURN_URL=turn:openrelay.metered.ca:443
NEXT_PUBLIC_TURN_USERNAME=openrelayproject
NEXT_PUBLIC_TURN_CREDENTIAL=openrelayproject
```

---

### Step 4.2: Install Dependencies

```bash
npm install
```

**Expected Output:**
```
added 500 packages in 45s
```

**🐛 Debug:**
```bash
# If npm errors
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Check Node version
node --version
# Should be: v18.x.x or higher
```

---

### Step 4.3: Build Frontend

```bash
# Build for production
npm run build
```

**Expected Output:**
```
✓ Compiled successfully
✓ Creating an optimized production build
✓ Collecting page data
Route (app)                              Size     First Load JS
┌ ○ /                                   xxx kB         xxx kB
└ ○ /room/[roomId]                     xxx kB         xxx kB

○  (Static)  prerendered as static content
```

**✅ Checklist:**
- [ ] No TypeScript errors
- [ ] No build errors
- [ ] Shows "Compiled successfully"

**🐛 Debug:**
```bash
# If build fails with TypeScript errors
npm run build 2>&1 | tee build-errors.txt

# Check for environment variable issues
npm run build -- --debug

# Verify environment variables are being picked up
npm run build 2>&1 | grep NEXT_PUBLIC
```

---

### Step 4.4: Verify Build Output

```bash
# Check if build artifacts exist
ls -la .next/

# Verify environment variables in build
grep -r "NEXT_PUBLIC_TURN" .next/
```

**Expected:**
- ✅ `.next` directory exists
- ✅ Contains build files
- ✅ TURN URL appears in build output

---

### Step 4.5: Start Frontend

**For Local Network (HTTPS):**
```bash
# Make sure server.js exists
ls -la server.js

# Start with HTTPS
npm run dev:https
```

**OR for ngrok (HTTP):**
```bash
npm start
```

**Expected Output:**
```
✅ HTTPS Server Ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖥️  Laptop:  https://localhost:3000
📱 Phone:   https://192.168.40.27:3000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**🐛 Debug:**
```bash
# If port 3000 already in use
netstat -ano | findstr :3000
# Kill the process

# If server.js missing, check STEP_BY_STEP_LOCAL_NETWORK_TESTING.md

# Test if frontend is accessible
curl http://localhost:3000
# Should return HTML
```

---

### Step 4.6: Test Frontend Load

**Open browser:**
```
https://localhost:3000
```

**Expected:**
- ✅ Page loads (may show certificate warning - click "Advanced" → "Proceed")
- ✅ Shows PodcastHub landing page
- ✅ No console errors (F12)

**🐛 Debug:**
```javascript
// Open browser console (F12)

// Check environment variables
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL);
console.log('WS URL:', process.env.NEXT_PUBLIC_WS_URL);
console.log('TURN URL:', process.env.NEXT_PUBLIC_TURN_URL);

// Should show your configured URLs
```

**❌ Common Issues:**
- Environment variables undefined → Rebuild with `rm -rf .next && npm run build`
- Page won't load → Check terminal for errors
- Certificate error → Click "Advanced" → "Proceed to localhost"

---

### Step 4.7: Phase 4 Validation

**✅ Success Criteria:**
- [ ] Frontend builds successfully
- [ ] No TypeScript errors
- [ ] Frontend starts on port 3000
- [ ] Page loads in browser
- [ ] Environment variables accessible in browser console
- [ ] TURN URL is set

**🐛 Debug Command:**
```bash
# Verify build and environment
echo "=== Frontend Status ==="
curl -s http://localhost:3000 | head -5

echo "=== Check if frontend is using correct backend ==="
curl -s http://localhost:3000 | grep -o 'NEXT_PUBLIC[^"]*'
```

**Browser Console Check:**
```javascript
// Run in browser console on http://localhost:3000
[
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_WS_URL',
  'NEXT_PUBLIC_TURN_URL',
  'NEXT_PUBLIC_TURN_USERNAME',
  'NEXT_PUBLIC_TURN_CREDENTIAL'
].forEach(key => {
  console.log(`${key}:`, process.env[key] || '❌ NOT SET');
});
```

---

## 🔌 Phase 5: WebSocket Connection Testing

### Goal
Verify WebSocket signaling works between devices.

### Step 5.1: Create Session (Host - Laptop)

**Browser 1 (Laptop):**
1. Open: `https://localhost:3000` (or `https://192.168.40.27:3000`)
2. Click "Advanced" → "Proceed to localhost"
3. Click "Create Session" or "Start as Host"
4. Enter name: "Laptop-Host"
5. Click "Create Room"

**Expected:**
- ✅ Redirects to `/room/[roomId]`
- ✅ Shows room code (e.g., "O356VR")
- ✅ Shows your video feed
- ✅ Shows "Waiting for participant..."

**🐛 Debug:**
```javascript
// Open browser console (F12)

// Should see:
✓ Local stream initialized: {audio: 1, video: 1}
🎥 Attaching local stream
✅ WebSocket connected

// Check sessionStorage
console.log('User Data:', sessionStorage.getItem('podcasthub_user'));
// Should show: {"name":"Laptop-Host","role":"host","sessionId":"...","roomCode":"O356VR"}
```

**Check Backend Terminal:**
```
INFO: WebSocket connection accepted for session: 7f0a56e7-...
INFO: Laptop-Host joined session 7f0a56e7-... as host
```

---

### Step 5.2: Check Active Sessions

```bash
# In another terminal
curl http://localhost:8001/ws/sessions/active
```

**Expected Output:**
```json
{
  "total_sessions": 1,
  "sessions": [
    {
      "session_id": "7f0a56e7-...",
      "participant_count": 1,
      "participants": [
        {
          "participantId": "Laptop-Host",
          "role": "host"
        }
      ]
    }
  ]
}
```

**🐛 Debug:**
```bash
# If shows 0 sessions
# Check browser console for WebSocket errors
# Check backend logs for connection errors

# Verify WebSocket URL
grep NEXT_PUBLIC_WS_URL podcast-frontend/.env.local
```

---

### Step 5.3: Join Session (Guest - Phone)

**Browser 2 (Phone):**
1. Open: `https://192.168.40.27:3000` (use YOUR laptop's IP)
2. Click "Advanced" → "Proceed to [your-ip]"
3. Click "Join Session" or "Join as Guest"
4. Enter name: "Phone-Guest"
5. Enter room code from laptop (e.g., "O356VR")
6. Click "Join Room"

**Expected:**
- ✅ Redirects to `/room/[roomId]`
- ✅ Shows room code
- ✅ Shows your phone's video feed
- ✅ Prompts for camera/microphone permissions

**🐛 Debug on Phone:**
```javascript
// Use chrome://inspect on laptop to access phone console
// Or check Safari Web Inspector on Mac

// Should see:
✓ Local stream initialized: {audio: 1, video: 1}
🎥 Attaching local stream
✅ WebSocket connected
📨 Received: participant-joined
```

**Check Backend Terminal:**
```
INFO: WebSocket connection accepted for session: 7f0a56e7-...
INFO: Phone-Guest joined session 7f0a56e7-... as guest
```

---

### Step 5.4: Verify Mutual WebSocket Communication

```bash
# Check active sessions again
curl http://localhost:8001/ws/sessions/active
```

**Expected Output:**
```json
{
  "total_sessions": 1,
  "sessions": [
    {
      "session_id": "7f0a56e7-...",
      "participant_count": 2,
      "participants": [
        {
          "participantId": "Laptop-Host",
          "role": "host"
        },
        {
          "participantId": "Phone-Guest",
          "role": "guest"
        }
      ]
    }
  ]
}
```

**🐛 Debug:**
```bash
# If only 1 participant shown
# - Phone WebSocket didn't connect
# - Check phone browser console for errors
# - Check backend CORS includes your IP

# Verify both devices see each other
# Laptop console should show: 📨 Received: participant-joined
# Phone console should show: 📨 Received: participant-joined
```

---

### Step 5.5: Phase 5 Validation

**✅ Success Criteria:**
- [ ] Laptop WebSocket connects
- [ ] Phone WebSocket connects
- [ ] Backend shows 2 participants
- [ ] Both devices receive "participant-joined" message
- [ ] Both devices show their own video feed

**Laptop Console Should Show:**
```javascript
✅ WebSocket connected
✓ Local stream initialized: {audio: 1, video: 1}
📨 Received: participant-joined
👤 Participant joined
🎯 Host creating offer...
```

**Phone Console Should Show:**
```javascript
✅ WebSocket connected
✓ Local stream initialized: {audio: 1, video: 1}
📨 Received: participant-joined
📥 Received offer
```

**❌ If WebSocket doesn't connect:**
```bash
# Check network connectivity
ping 192.168.40.27

# Check firewall
Get-NetFirewallRule -DisplayName "PodcastHub*"

# Check CORS
grep CORS_ORIGINS media-recording-service/.env
```

---

## 🎥 Phase 6: WebRTC P2P Connection Testing

### Goal
Verify peer-to-peer video/audio connection establishes.

### Step 6.1: Monitor ICE Candidate Exchange

**Laptop Console (F12):**

Look for these logs:
```javascript
🎯 Host creating offer...
📤 Sending offer
🧊 New ICE candidate: host
🧊 New ICE candidate: srflx
🧊 New ICE candidate: relay  ← CRITICAL! Must see this
🧊 ICE gathering state: complete
📥 Received answer
✓ Set remote description
```

**Phone Console:**

```javascript
📥 Received offer
✓ Set remote description
🎯 Guest creating answer...
📤 Sending answer
🧊 New ICE candidate: host
🧊 New ICE candidate: srflx
🧊 New ICE candidate: relay  ← CRITICAL! Must see this
```

**🐛 Debug:**
```javascript
// Check if TURN server is being used
// Look for this log:
"✓ Using TURN server for ICE fallback"

// If NOT shown:
// 1. TURN is not configured
// 2. Check .env.local has TURN_URL
// 3. Rebuild frontend: rm -rf .next && npm run build

// Check ICE candidate types
// Must see at least one "relay" candidate
// If only "host" and "srflx", TURN is not working
```

---

### Step 6.2: Monitor Connection State

**Both Devices Should Show:**

```javascript
🧊 ICE connection state: checking
🧊 ICE connection state: connected  ← SUCCESS!
🔌 Connection state: connected  ← SUCCESS!
```

**✅ Success Indicators:**
- ✅ ICE state changes from "checking" to "connected"
- ✅ Connection state is "connected"
- ✅ No "failed" or "disconnected" states

**❌ Failure Indicators:**
```javascript
🧊 ICE connection state: failed  ❌
🔌 Connection state: failed  ❌
```

**🐛 Debug Failed Connection:**
```javascript
// In browser console, run:

// Check peer connection state
console.log('Connection State:', peerConnection?.connectionState);
console.log('ICE State:', peerConnection?.iceConnectionState);

// Check ICE candidates collected
peerConnection?.getStats().then(stats => {
  stats.forEach(report => {
    if (report.type === 'candidate-pair') {
      console.log('Candidate Pair:', report);
    }
  });
});
```

**Common Failure Reasons:**
1. **No "relay" candidates** → TURN not configured
2. **Only "host" candidates** → STUN/TURN not working
3. **"failed" state** → NAT/firewall blocking, need TURN

---

### Step 6.3: Verify Media Tracks Received

**Both Devices Should Show:**

```javascript
🎥 Received remote track: audio
🎥 Received remote track: video
📺 Remote stream tracks: {audio: 1, video: 1}
🎥 Attaching remote stream
```

**✅ Visual Confirmation:**
- ✅ Laptop sees phone's video
- ✅ Phone sees laptop's video
- ✅ Both can hear each other (if audio enabled)

**🐛 Debug No Video:**
```javascript
// Check if remote stream exists
console.log('Remote Stream:', remoteVideoRef.current?.srcObject);

// Should show: MediaStream {id: "...", active: true, ...}

// Check tracks
const stream = remoteVideoRef.current?.srcObject;
console.log('Audio Tracks:', stream?.getAudioTracks());
console.log('Video Tracks:', stream?.getVideoTracks());

// Should show at least one track each
```

---

### Step 6.4: Test Media Controls

**On Both Devices:**

1. **Toggle Microphone:**
   - Click mic button
   - Other device should see mic icon change
   - Audio should mute/unmute

2. **Toggle Camera:**
   - Click camera button
   - Video should stop/start
   - Other device should see black screen or video

3. **Test Audio:**
   - Speak into microphone
   - Other device should hear you
   - Check audio level indicators

**🐛 Debug Media Issues:**
```javascript
// Check local stream tracks
const localStream = localVideoRef.current?.srcObject;
console.log('Local Audio Track:', localStream?.getAudioTracks()[0]);
console.log('Local Video Track:', localStream?.getVideoTracks()[0]);

// Check track enabled state
localStream?.getAudioTracks().forEach(track => {
  console.log('Audio Track:', track.label, 'Enabled:', track.enabled);
});

localStream?.getVideoTracks().forEach(track => {
  console.log('Video Track:', track.label, 'Enabled:', track.enabled);
});
```

---

### Step 6.5: Check Connection Quality

**Monitor Console for Issues:**

```javascript
// Good signs:
🔌 Connection state: connected
🧊 ICE connection state: connected

// Warning signs:
🧊 ICE connection state: checking  // Should change to "connected"
⚠️ Connection disconnected  // May reconnect

// Bad signs:
❌ ICE connection failed
❌ Connection failed
```

**🐛 Debug Connection Quality:**
```javascript
// Get connection stats
peerConnection?.getStats().then(stats => {
  stats.forEach(report => {
    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      console.log('Video Bitrate:', report.bytesReceived, 'bytes');
      console.log('Packets Lost:', report.packetsLost);
    }
  });
});
```

---

### Step 6.6: Phase 6 Validation

**✅ Success Criteria:**
- [ ] Both devices show "Using TURN server for ICE fallback"
- [ ] Both devices show "relay" ICE candidates
- [ ] ICE state changes to "connected"
- [ ] Connection state is "connected"
- [ ] Remote video appears on both devices
- [ ] Audio works both ways
- [ ] Media controls work (mute/unmute)

**Complete Console Log Example (Success):**

**Laptop (Host):**
```javascript
✅ WebSocket connected
✓ Local stream initialized: {audio: 1, video: 1}
📨 Received: participant-joined
👤 Participant joined
✓ Using TURN server for ICE fallback
🎯 Host creating offer...
📤 Sending offer
🧊 New ICE candidate: host
🧊 New ICE candidate: srflx
🧊 New ICE candidate: relay
🧊 ICE gathering state: complete
📥 Received answer
✓ Set remote description
✓ Added ICE candidate
🧊 ICE connection state: checking
🧊 ICE connection state: connected
🔌 Connection state: connected
🎥 Received remote track: audio
🎥 Received remote track: video
📺 Remote stream tracks: {audio: 1, video: 1}
🎥 Attaching remote stream
```

**Phone (Guest):**
```javascript
✅ WebSocket connected
✓ Local stream initialized: {audio: 1, video: 1}
📨 Received: participant-joined
✓ Using TURN server for ICE fallback
📥 Received offer
✓ Set remote description
🎯 Guest creating answer...
📤 Sending answer
🧊 New ICE candidate: host
🧊 New ICE candidate: srflx
🧊 New ICE candidate: relay
✓ Added ICE candidate
🧊 ICE connection state: checking
🧊 ICE connection state: connected
🔌 Connection state: connected
🎥 Received remote track: audio
🎥 Received remote track: video
📺 Remote stream tracks: {audio: 1, video: 1}
🎥 Attaching remote stream
```

**🐛 If Connection Fails:**

**Scenario 1: No "relay" candidates**
```bash
# Fix: Configure TURN server
cd podcast-frontend
nano .env.local

# Add:
NEXT_PUBLIC_TURN_URL=turn:openrelay.metered.ca:443
NEXT_PUBLIC_TURN_USERNAME=openrelayproject
NEXT_PUBLIC_TURN_CREDENTIAL=openrelayproject

# Rebuild
rm -rf .next
npm run build
npm start
```

**Scenario 2: "Using TURN server" not shown**
```bash
# Fix: Frontend not using new environment
rm -rf .next
rm -rf node_modules/.cache
npm run build
npm start
```

**Scenario 3: ICE state "failed"**
```javascript
// Check network configuration
// - Firewall blocking UDP ports
// - TURN server credentials wrong
// - Network too restrictive (corporate firewall)

// Try different TURN server:
NEXT_PUBLIC_TURN_URL=turn:a.relay.metered.ca:443
```

---

## 🎙️ Phase 7: Recording and Upload Testing

### Goal
Verify recording functionality and real-time chunk uploads.

### Step 7.1: Start Recording (Host Only)

**On Laptop (Host):**

1. **Verify Connection:**
   - ✅ Green "Connected" badge visible
   - ✅ Can see guest's video

2. **Click "Start Recording"**

**Expected:**
- ✅ Button changes to "Stop Recording"
- ✅ Red "RECORDING" indicator appears
- ✅ Timer starts (00:00:00)
- ✅ Upload progress bars appear

**Console Should Show:**
```javascript
🎬 Starting recording for all tracks
🎬 Starting audio recording
🎬 Starting video recording
📤 Uploading chunk 1 of audio
📤 Uploading chunk 1 of video
✅ Chunk 1 uploaded successfully
```

**🐛 Debug:**
```javascript
// Check if mediaRecorder started
console.log('Recording State:', isRecording);
console.log('Local Stream:', streams.localStream);

// Check API calls
// Network tab (F12) should show:
// POST /api/recordings/start
// POST /api/recordings/upload-chunk
```

---

### Step 7.2: Monitor Real-time Upload

**Watch the Upload Progress section:**

Expected:
- ✅ Audio: X/Y chunks (Z%)
- ✅ Video: X/Y chunks (Z%)
- ✅ Progress bars filling up
- ✅ Numbers increasing every 5 seconds

**Backend Terminal Should Show:**
```
INFO: POST /api/recordings/start HTTP/1.1" 200 OK
INFO: POST /api/recordings/upload-chunk HTTP/1.1" 200 OK
INFO: POST /api/recordings/upload-chunk HTTP/1.1" 200 OK
```

**🐛 Debug:**
```javascript
// Check upload progress state
console.log('Upload Progress:', uploadProgress);
// Should show: {audio: {uploaded: 5, total: 10}, video: {...}}

// Check if chunks are being created
// Console should show:
// "📤 Uploading chunk X" every 5 seconds

// If no uploads:
// - Check API_URL is correct
// - Check backend is receiving requests
// - Check MinIO is accessible
```

---

### Step 7.3: Check MinIO Storage

**During recording:**

```bash
# Open MinIO console
start http://localhost:9001

# Login: minioadmin / minioadmin

# Navigate to "Buckets" → "recordings"
```

**Expected:**
- ✅ "recordings" bucket exists
- ✅ Folders for session_id
- ✅ Audio chunks (audio_*.webm)
- ✅ Video chunks (video_*.webm)
- ✅ Files increasing as recording continues

**🐛 Debug:**
```bash
# Check MinIO from CLI
docker exec podcasthub_minio mc ls local/recordings/

# Should show session folders

# Check if backend can write to MinIO
curl http://localhost:9000/minio/health/live
```

---

### Step 7.4: Test Pause/Resume

**On Laptop:**

1. **Click "Pause Recording"**

**Expected:**
- ✅ Button changes to "Resume Recording"
- ✅ Timer stops
- ✅ "PAUSED" indicator appears
- ✅ No new chunks uploaded

2. **Wait 10 seconds**

3. **Click "Resume Recording"**

**Expected:**
- ✅ Button changes back to "Stop Recording"
- ✅ Timer resumes
- ✅ "RECORDING" indicator
- ✅ Chunk uploads resume

**🐛 Debug:**
```javascript
// Check recording state
console.log('Is Recording:', isRecording);
console.log('Is Paused:', isPaused);

// Check mediaRecorder state
// Should be: "paused" when paused, "recording" when active
```

---

### Step 7.5: Stop Recording

**On Laptop:**

1. **Click "Stop Recording"**

**Expected:**
- ✅ Recording stops
- ✅ Upload progress continues (finalizing chunks)
- ✅ "Processing" status appears
- ✅ Recording Status section shows processing progress

**Console Should Show:**
```javascript
🛑 Stopping recording for all tracks
🛑 Stopping audio recording
🛑 Stopping video recording
📤 Uploading final chunk
✅ All chunks uploaded
```

**Backend Terminal:**
```
INFO: POST /api/recordings/stop HTTP/1.1" 200 OK
INFO: Publishing upload.completed event
```

**🐛 Debug:**
```javascript
// Check if all uploads complete
console.log('Uploads Complete:', areUploadsComplete());

// Check recording status
console.log('Recording Statuses:', recordingStatuses);

// Network tab should show:
// POST /api/recordings/stop
```

---

### Step 7.6: Verify Processing

**Watch Recording Status Section:**

Expected progression:
```
Audio: STOPPED → PROCESSING → COMPLETED
Video: STOPPED → PROCESSING → COMPLETED
```

**Check Backend Logs:**
```
INFO: Received upload.completed event
INFO: Processing session 7f0a56e7-...
INFO: Merging audio chunks
INFO: Merging video chunks
INFO: Processing complete
```

**🐛 Debug Processing:**
```bash
# Check RabbitMQ queue
# Open: http://localhost:15672
# Check "Queues" tab
# Should see: media.processing.requests

# Check if worker is running
docker-compose logs media-processing-worker

# Manually check MinIO for processed files
# Look for: {session_id}/processed/audio.mp3
```

---

### Step 7.7: Phase 7 Validation

**✅ Success Criteria:**
- [ ] Recording starts successfully
- [ ] Chunks upload in real-time (every 5 seconds)
- [ ] Upload progress bars update
- [ ] Pause/resume works correctly
- [ ] Stop recording completes all uploads
- [ ] Processing status updates
- [ ] Files appear in MinIO
- [ ] Processed files generated

**🐛 Complete Recording Test:**
```bash
# Check final output in MinIO
# Open: http://localhost:9001
# Navigate to: recordings/{session_id}/processed/
# Should see:
# - audio.mp3 (merged audio)
# - video.mp4 (merged video)

# Check database
docker exec podcasthub_postgres psql -U podcasthub -d podcasthub -c "
SELECT session_id, status, processing_status
FROM recordings
ORDER BY created_at DESC
LIMIT 5;"
```

---

## 🎉 Complete End-to-End Test Success

### Final Validation Checklist

**Infrastructure ✅**
- [ ] Docker services running
- [ ] RabbitMQ accessible
- [ ] MinIO accessible
- [ ] PostgreSQL connected
- [ ] Redis responding

**Backend ✅**
- [ ] Health endpoint returns 200
- [ ] Sessions API works
- [ ] WebSocket accepts connections
- [ ] CORS configured correctly

**Frontend ✅**
- [ ] Builds without errors
- [ ] Loads in browser
- [ ] Environment variables set
- [ ] TURN server configured

**WebSocket ✅**
- [ ] Laptop connects
- [ ] Phone connects
- [ ] Both devices see each other
- [ ] Signaling messages exchanged

**WebRTC ✅**
- [ ] TURN server used
- [ ] Relay candidates generated
- [ ] ICE connection succeeds
- [ ] Connection state: connected
- [ ] Video appears on both devices
- [ ] Audio works both ways

**Recording ✅**
- [ ] Recording starts
- [ ] Chunks upload in real-time
- [ ] Pause/resume works
- [ ] Stop completes uploads
- [ ] Processing triggers
- [ ] Processed files generated

---

## 🐛 Common Issues Quick Reference

### Issue: WebSocket Won't Connect

**Symptoms:**
- Console shows connection error
- No "✅ WebSocket connected" message

**Debug:**
```bash
# Check backend is running
netstat -ano | findstr :8001

# Check WebSocket URL
grep NEXT_PUBLIC_WS_URL podcast-frontend/.env.local

# Test manually
# In browser console:
const ws = new WebSocket('ws://localhost:8001/ws/test');
ws.onopen = () => console.log('OK');
```

**Fix:**
1. Verify backend running on 0.0.0.0:8001
2. Check firewall allows port 8001
3. Verify WebSocket URL in `.env.local`
4. Rebuild frontend

---

### Issue: No Video Connection

**Symptoms:**
- WebSocket connects
- ICE state: "failed"
- No remote video

**Debug:**
```javascript
// In browser console:
console.log('ICE State:', peerConnection?.iceConnectionState);
console.log('Connection State:', peerConnection?.connectionState);

// Check for relay candidates
// Look for: 🧊 New ICE candidate: relay
```

**Fix:**
1. Add TURN server to `.env.local`
2. Rebuild frontend: `rm -rf .next && npm run build`
3. Restart frontend
4. Verify "Using TURN server" message in console

---

### Issue: Recording Doesn't Upload

**Symptoms:**
- Recording starts
- No chunk uploads
- Progress bars at 0%

**Debug:**
```javascript
// Check API URL
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL);

// Check network requests (F12 → Network)
// Look for: POST /api/recordings/upload-chunk

// Check backend logs for errors
```

**Fix:**
1. Verify API_URL in `.env.local`
2. Check backend health: `curl http://localhost:8001/health`
3. Check MinIO is accessible: `curl http://localhost:9000/minio/health/live`
4. Verify CORS includes frontend origin

---

### Issue: Environment Variables Not Working

**Symptoms:**
- `process.env.NEXT_PUBLIC_*` is undefined
- TURN not configured despite setting env

**Debug:**
```bash
# Check if env file exists
ls -la podcast-frontend/.env.local

# Verify content
cat podcast-frontend/.env.local

# Check if Next.js picked it up
grep -r "NEXT_PUBLIC_TURN" podcast-frontend/.next/
```

**Fix:**
```bash
cd podcast-frontend

# Clean everything
rm -rf .next
rm -rf node_modules/.cache

# Rebuild
npm run build

# Verify in browser console
console.log(process.env.NEXT_PUBLIC_TURN_URL);
# Should NOT be undefined
```

---

## 📞 Getting Help

If you're stuck after following this guide:

1. **Note which Phase failed** (1-7)
2. **Collect debug information:**
   ```bash
   # System info
   node --version
   python --version
   docker --version

   # Service status
   docker-compose ps
   netstat -ano | findstr "3000 8001"

   # Environment
   cat podcast-frontend/.env.local
   cat media-recording-service/.env
   ```

3. **Collect logs:**
   - Backend terminal output
   - Frontend terminal output
   - Browser console logs (F12 → Console)
   - Network tab (F12 → Network)

4. **Provide details:**
   - What phase failed?
   - What error messages do you see?
   - What's the expected vs actual behavior?

---

## 🎓 Understanding the Flow

```
User Opens App
     ↓
REST API: Create/Join Session
     ↓
Navigate to Room Page
     ↓
Initialize Media (Camera/Mic)
     ↓
Connect WebSocket
     ↓
Send "join" Message
     ↓
Wait for Other Participant
     ↓
Exchange WebRTC Offer/Answer
     ↓
Exchange ICE Candidates (via TURN)
     ↓
Establish P2P Connection
     ↓
Stream Video/Audio
     ↓
Start Recording (Host)
     ↓
Upload Chunks in Real-time
     ↓
Stop Recording
     ↓
Process Media Files
     ↓
Download/View Recordings
```

Each phase builds on the previous one. If Phase N fails, fix it before proceeding to Phase N+1!

---

**End of Guide** - Follow each phase sequentially with debugging at every step!
