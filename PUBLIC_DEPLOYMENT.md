# 🚀 Production-Ready Podcast P2P Application: Complete Deployment Guide

**Transform your local app into a production-ready, distributed P2P platform that works across different networks worldwide.**

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Local Testing](#phase-1-local-testing)
4. [Phase 2: Local Network Testing](#phase-2-local-network-testing)
5. [Phase 3: Public Internet Testing with Tunnels](#phase-3-public-internet-testing-with-tunnels)
6. [Phase 4: TURN Server Setup](#phase-4-turn-server-setup)
7. [Phase 5: Cloud Infrastructure](#phase-5-cloud-infrastructure)
8. [Phase 6: Production Deployment](#phase-6-production-deployment)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

### Current State (Local Only)
```
┌─────────────────────────────────────┐
│  Your Computer                      │
│  ├─ Frontend (localhost:3000)       │
│  ├─ Backend (localhost:8001)        │
│  └─ Services (Docker)               │
│                                     │
│  Browser 1 ←──P2P──→ Browser 2     │
│  (Same machine only)               │
└─────────────────────────────────────┘
```

### Target State (Global P2P)
```
┌──────────────────────────────────────────────────────────┐
│  PRODUCTION ARCHITECTURE                                 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Users Worldwide ──► Vercel CDN (Frontend)              │
│                       │                                  │
│                       ├──► Railway (Backend+WebSocket)  │
│                       │    ├─ Recording Service         │
│                       │    ├─ Processing Service        │
│                       │    └─ Processing Worker         │
│                       │                                  │
│                       └──► Cloud Services               │
│                            ├─ CloudAMQP (RabbitMQ)      │
│                            ├─ Supabase (PostgreSQL)     │
│                            ├─ Cloudflare R2 (Storage)   │
│                            ├─ Upstash (Redis)           │
│                            └─ TURN Server (NAT/FW)      │
│                                                          │
│  User A (Home) ←═══ Direct P2P ═══→ User B (Office)    │
│  (Audio/Video streams peer-to-peer via TURN if needed) │
└──────────────────────────────────────────────────────────┘
```

---

## ✅ Prerequisites

Before starting, ensure you have:

- [ ] Git installed
- [ ] Node.js 18+ installed
- [ ] Python 3.9+ installed
- [ ] Docker Desktop running
- [ ] GitHub account
- [ ] Credit card (for cloud services - most have generous free tiers)

---

## 🧪 Phase 1: Local Testing

**Goal:** Verify everything works on your local machine

### Step 1.1: Clone and Setup

```bash
# Clone the repository
cd /path/to/your/project

# Verify all services are present
ls -la
# You should see: podcast-frontend, media-recording-service, media-processing-service
```

### Step 1.2: Start Infrastructure

```bash
# Start Docker services
docker-compose up -d rabbitmq minio postgres redis

# Wait 30 seconds for services to initialize
sleep 30

# Verify services are running
docker-compose ps
```

**✅ TEST CHECKPOINT 1.2:**
```bash
# All services should show "Up" status
# Access these URLs in your browser:
# - RabbitMQ: http://localhost:15672 (guest/guest)
# - MinIO: http://localhost:9001 (minioadmin/minioadmin)

# Expected: Both UIs should load successfully
```

### Step 1.3: Start Backend

```bash
# Navigate to backend
cd media-recording-service

# Create environment file
cp .env.example .env

# Install dependencies
pip install -r requirements.txt

# Start backend
python main.py
```

**✅ TEST CHECKPOINT 1.3:**
```bash
# In a new terminal, test the backend:
curl http://localhost:8001/health

# Expected output:
# {"status":"healthy","service":"Media Recording & Upload Service","version":"1.0.0"}

# Test WebSocket endpoint (should return 403 in browser, that's OK)
# http://localhost:8001/ws/test-session
```

### Step 1.4: Start Frontend

```bash
# In a new terminal
cd ../podcast-frontend

# Create environment file
cp .env.example .env.local

# Verify the content
cat .env.local
# Should show:
# NEXT_PUBLIC_API_URL=http://localhost:8001/api
# NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws

# Install dependencies
npm install

# Start frontend
npm run dev
```

**✅ TEST CHECKPOINT 1.4:**
```bash
# Open browser to: http://localhost:3000
# Expected: PodcastHub landing page loads

# Open browser console (F12)
# Expected: No red errors
```

### Step 1.5: Test Local P2P Connection

1. **Open first browser window:** http://localhost:3000
   - Click "Start Recording" or "Create Session"
   - You should see yourself in the video preview
   - Allow camera/microphone permissions

2. **Open second browser window (incognito mode):** http://localhost:3000
   - Join the same session ID
   - Allow camera/microphone permissions

**✅ TEST CHECKPOINT 1.5:**
```
Expected Behavior:
✓ Both users see their own video
✓ Both users see each other's video
✓ Audio is transmitted between browsers
✓ Browser console shows: "🔌 Connection state: connected"
✓ Browser console shows: "🧊 ICE connection state: connected"

If you see this, local P2P is working! ✅
```

**🐛 TROUBLESHOOTING 1.5:**
```
Problem: Can't see remote video
→ Check browser console for WebSocket connection
→ Verify both browsers allowed camera/mic permissions
→ Check: curl http://localhost:8001/ws/sessions/active

Problem: WebSocket connection fails
→ Ensure backend is running on port 8001
→ Check: netstat -an | grep 8001
→ Restart backend service
```

---

## 🏠 Phase 2: Local Network Testing

**Goal:** Test P2P between different devices on your home/office network

### Step 2.1: Find Your Local IP

```bash
# On Linux/Mac:
ifconfig | grep "inet "

# On Windows (PowerShell):
ipconfig

# Look for your local IP (e.g., 192.168.1.100)
```

### Step 2.2: Update Frontend for Local Network

```bash
cd podcast-frontend

# Edit .env.local
nano .env.local
```

Update to use your local IP:
```env
NEXT_PUBLIC_API_URL=http://192.168.1.100:8001/api
NEXT_PUBLIC_WS_URL=ws://192.168.1.100:8001/ws
```

```bash
# Restart frontend
npm run dev
```

### Step 2.3: Update Backend CORS

```bash
cd ../media-recording-service

# Edit .env
nano .env
```

Update CORS to allow your local network:
```env
CORS_ORIGINS=["http://localhost:3000","http://192.168.1.100:3000","http://192.168.1.100:8080"]
```

```bash
# Restart backend
python main.py
```

### Step 2.4: Test from Another Device

**On your computer:**
1. Open http://192.168.1.100:3000
2. Create a new session
3. Note the session ID

**On another device (phone, tablet, another laptop):**
1. Connect to same WiFi network
2. Open http://192.168.1.100:3000
3. Join the session ID from step 2

**✅ TEST CHECKPOINT 2.4:**
```
Expected Behavior:
✓ Both devices can access the frontend
✓ WebSocket connects successfully
✓ P2P connection establishes
✓ Video/audio streams between devices
✓ Console shows: "connected" states

If this works, your app works on local networks! ✅
```

**🐛 TROUBLESHOOTING 2.4:**
```
Problem: Can't access http://192.168.1.100:3000 from other device
→ Check firewall settings on host computer
→ Ensure both devices on same WiFi network
→ Try: curl http://192.168.1.100:8001/health from other device

Problem: WebSocket connects but P2P fails
→ This is normal for some network configurations
→ You'll need TURN server (Phase 4)
→ Check browser console for ICE candidate types
```

---

## 🌐 Phase 3: Public Internet Testing with Tunnels

**Goal:** Test with users on different networks using ngrok/cloudflare tunnels

### Step 3.1: Install ngrok

```bash
# Download from https://ngrok.com/download
# Or use Homebrew:
brew install ngrok

# Sign up for free account: https://dashboard.ngrok.com/signup
# Get your auth token
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### Step 3.2: Expose Backend with ngrok

```bash
# In a new terminal, expose backend
ngrok http 8001

# You'll see output like:
# Forwarding https://abc123.ngrok.io -> http://localhost:8001
# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
```

### Step 3.3: Update Frontend Environment

```bash
cd podcast-frontend

# Edit .env.local
nano .env.local
```

Update with your ngrok URLs:
```env
NEXT_PUBLIC_API_URL=https://abc123.ngrok.io/api
NEXT_PUBLIC_WS_URL=wss://abc123.ngrok.io/ws
```

**Important:** Note `wss://` (not `ws://`) for secure WebSocket!

```bash
# Restart frontend
npm run dev
```

### Step 3.4: Update Backend CORS for ngrok

```bash
cd ../media-recording-service

# Edit .env
nano .env
```

Update CORS:
```env
CORS_ORIGINS=["http://localhost:3000","https://abc123.ngrok.io"]
```

```bash
# Restart backend
python main.py
```

### Step 3.5: Test Across Different Networks

**Tester 1 (you):**
1. Open http://localhost:3000
2. Create session

**Tester 2 (friend on different WiFi/cellular):**
1. Share your ngrok URL: https://abc123.ngrok.io
2. Or deploy frontend to Vercel (see Step 3.6)
3. Join the session

**✅ TEST CHECKPOINT 3.5:**
```
Expected Behavior (WITHOUT TURN server):
✓ Both users can connect to WebSocket
✓ Signaling works (offer/answer exchange)
✗ P2P connection may fail for some network combinations
✓ Console shows ICE candidates being exchanged

Success Rate: ~60-80% (depends on NAT types)

If P2P fails, this is EXPECTED. You need TURN server (Phase 4).
```

### Step 3.6: Deploy Frontend to Vercel (Optional)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from frontend directory
cd podcast-frontend
vercel

# Follow prompts
# You'll get a URL like: https://your-app.vercel.app
```

Update `.env.local` in Vercel dashboard:
```env
NEXT_PUBLIC_API_URL=https://abc123.ngrok.io/api
NEXT_PUBLIC_WS_URL=wss://abc123.ngrok.io/ws
```

**✅ TEST CHECKPOINT 3.6:**
```bash
# Test the Vercel deployment
curl https://your-app.vercel.app

# Expected: Frontend loads successfully
# Test WebSocket in browser console
```

**🐛 TROUBLESHOOTING 3:**
```
Problem: WebSocket connection fails with wss://
→ ngrok free tier supports WSS ✓
→ Check URL is exactly: wss://abc123.ngrok.io/ws (no trailing slash)
→ Verify in Network tab: WebSocket shows 101 Switching Protocols

Problem: P2P connection fails
→ EXPECTED! You need TURN server
→ Check browser console for: "ICE connection state: failed"
→ Proceed to Phase 4

Problem: CORS errors
→ Update backend CORS_ORIGINS to include Vercel domain
→ Restart backend service
```

---

## 🔀 Phase 4: TURN Server Setup

**Goal:** Enable P2P through NATs and firewalls

### Why TURN is Required

```
Without TURN:
User A (Home NAT) ←✗→ User B (Corporate Firewall)
❌ Connection fails (~20-40% of cases)

With TURN:
User A ←→ TURN Server ←→ User B
✅ Connection succeeds (~99% of cases)
```

### Step 4.1: Choose a TURN Provider

| Provider | Free Tier | Setup Difficulty | Recommended For |
|----------|-----------|------------------|-----------------|
| **Metered.ca** | 50GB/month | ⭐ Easy | Testing |
| **Xirsys** | 500MB/month | ⭐⭐ Medium | Testing |
| **Twilio** | Pay-as-go | ⭐⭐⭐ Hard | Production |
| **Self-hosted coturn** | Unlimited | ⭐⭐⭐⭐ Expert | Production |

### Step 4.2: Setup Metered.ca (Recommended for Testing)

1. **Sign up:** https://www.metered.ca/tools/openrelay/
2. **Get credentials** (instant, no credit card):
   ```
   TURN URLs: turn:a.relay.metered.ca:80
             turn:a.relay.metered.ca:443
   Username: <provided>
   Credential: <provided>
   ```

### Step 4.3: Configure Frontend with TURN

```bash
cd podcast-frontend

# Edit .env.local
nano .env.local
```

Add TURN configuration:
```env
NEXT_PUBLIC_API_URL=https://abc123.ngrok.io/api
NEXT_PUBLIC_WS_URL=wss://abc123.ngrok.io/ws

# Add TURN server
NEXT_PUBLIC_TURN_URL=turn:a.relay.metered.ca:443
NEXT_PUBLIC_TURN_USERNAME=your-username-from-metered
NEXT_PUBLIC_TURN_CREDENTIAL=your-credential-from-metered
```

```bash
# Restart frontend
npm run dev
```

### Step 4.4: Verify TURN Configuration

Open browser console and check the WebRTC configuration:

```javascript
// In browser console:
// You should see logs like:
"✓ Using TURN server for ICE fallback"
```

### Step 4.5: Test P2P with TURN

**Tester 1:**
- Open http://localhost:3000 (or Vercel URL)
- Create session
- Open browser console (F12)

**Tester 2 (different network):**
- Join session
- Open browser console

**✅ TEST CHECKPOINT 4.5:**
```
Expected in Console:
✓ "Using TURN server for ICE fallback"
✓ ICE candidates include "relay" type
✓ Connection state: "connected"
✓ Video/audio streams successfully

Check ICE candidate types:
srflx = Public IP discovered via STUN ✓
relay = Using TURN server ✓

Success Rate: ~95-99% with TURN configured correctly
```

**🐛 TROUBLESHOOTING 4.5:**
```
Problem: Still no TURN candidates
→ Check TURN credentials are correct
→ Verify URL format: turn:server:port (not turns://)
→ Try port 443 instead of 80
→ Check browser console for TURN authentication errors

Problem: Connection still fails
→ Check TURN server is not blocked by firewall
→ Try alternative TURN provider
→ Use trickle ICE test: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

### Step 4.6: Alternative - Setup Your Own TURN Server (Advanced)

If you want full control:

```bash
# On a VPS (Digital Ocean, AWS, etc.)
# Ubuntu 20.04+

# Install coturn
sudo apt-get update
sudo apt-get install coturn

# Edit config
sudo nano /etc/turnserver.conf
```

Basic coturn configuration:
```conf
listening-port=3478
fingerprint
lt-cred-mech
user=myuser:mypassword
realm=mydomain.com
external-ip=YOUR_VPS_PUBLIC_IP
```

```bash
# Start coturn
sudo systemctl start coturn
sudo systemctl enable coturn

# Open firewall
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49152:65535/udp
```

Update frontend:
```env
NEXT_PUBLIC_TURN_URL=turn:your-vps-ip:3478
NEXT_PUBLIC_TURN_USERNAME=myuser
NEXT_PUBLIC_TURN_CREDENTIAL=mypassword
```

---

## ☁️ Phase 5: Cloud Infrastructure

**Goal:** Replace local Docker services with cloud alternatives

### Step 5.1: Setup Cloud PostgreSQL (Supabase)

1. **Sign up:** https://supabase.com
2. **Create new project:**
   - Project name: podcasthub-prod
   - Database password: (save this!)
   - Region: Choose closest to users

3. **Get connection string:**
   - Go to: Settings → Database
   - Copy: Connection string (Direct)
   - Format: `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`

4. **Update backend .env:**
```env
POSTGRES_URL=postgresql+asyncpg://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

**✅ TEST CHECKPOINT 5.1:**
```bash
# Test connection
python -c "
from sqlalchemy import create_engine
engine = create_engine('your-postgres-url')
with engine.connect() as conn:
    print('✓ PostgreSQL connected')
"
```

### Step 5.2: Setup Cloud RabbitMQ (CloudAMQP)

1. **Sign up:** https://www.cloudamqp.com
2. **Create instance:**
   - Name: podcasthub-prod
   - Plan: Little Lemur (Free)
   - Region: Choose closest to backend deployment

3. **Get AMQP URL:**
   - Copy from dashboard
   - Format: `amqps://[user]:[pass]@[server].cloudamqp.com/[vhost]`

4. **Update backend .env:**
```env
RABBITMQ_URL=amqps://[user]:[pass]@[server].cloudamqp.com/[vhost]
```

**✅ TEST CHECKPOINT 5.2:**
```bash
# Test RabbitMQ connection
python -c "
import pika
params = pika.URLParameters('your-rabbitmq-url')
conn = pika.BlockingConnection(params)
print('✓ RabbitMQ connected')
conn.close()
"
```

### Step 5.3: Setup Cloud Storage (Cloudflare R2)

1. **Sign up:** https://dash.cloudflare.com
2. **Create R2 bucket:**
   - R2 → Create bucket
   - Name: podcast-recordings

3. **Create API token:**
   - R2 → Manage R2 API Tokens → Create API Token
   - Permissions: Read & Write
   - Save Access Key ID and Secret Access Key

4. **Get endpoint:**
   - Format: `[account-id].r2.cloudflarestorage.com`

5. **Update backend .env:**
```env
MINIO_ENDPOINT=[account-id].r2.cloudflarestorage.com
MINIO_ACCESS_KEY=[your-r2-access-key]
MINIO_SECRET_KEY=[your-r2-secret-key]
MINIO_SECURE=True
MINIO_BUCKET=podcast-recordings
```

**✅ TEST CHECKPOINT 5.3:**
```bash
# Test S3/R2 connection
python -c "
from minio import Minio
client = Minio(
    'your-endpoint',
    access_key='your-key',
    secret_key='your-secret',
    secure=True
)
print('✓ R2 connected')
print('Buckets:', client.list_buckets())
"
```

### Step 5.4: Setup Cloud Redis (Upstash)

1. **Sign up:** https://console.upstash.com
2. **Create database:**
   - Type: Regional
   - Name: podcasthub-cache
   - Region: Choose closest to backend

3. **Get connection string:**
   - Format: `rediss://default:[password]@[endpoint].upstash.io:6379`

4. **Update backend .env:**
```env
REDIS_URL=rediss://default:[password]@[endpoint].upstash.io:6379
```

**✅ TEST CHECKPOINT 5.4:**
```bash
# Test Redis connection
python -c "
import redis
r = redis.from_url('your-redis-url')
r.ping()
print('✓ Redis connected')
"
```

### Step 5.5: Test with All Cloud Services

```bash
# Stop local Docker services
docker-compose down

# Restart backend with cloud services
cd media-recording-service
python main.py
```

**✅ TEST CHECKPOINT 5.5:**
```bash
# Verify all services connect
curl http://localhost:8001/health

# Expected: {"status":"healthy",...}

# Test full flow:
# 1. Create session
# 2. Start recording
# 3. Upload chunks
# 4. Check RabbitMQ queue (CloudAMQP dashboard)
# 5. Verify files in R2 (Cloudflare dashboard)
# 6. Check metadata in PostgreSQL (Supabase dashboard)
```

---

## 🚀 Phase 6: Production Deployment

**Goal:** Deploy all services to production

### Step 6.1: Deploy Backend to Railway

1. **Sign up:** https://railway.app
2. **Create new project:**
   - New Project → Deploy from GitHub repo
   - Connect your GitHub account
   - Select repository

3. **Add services:**

**Service 1: media-recording-service**
```bash
# In Railway dashboard:
# Settings → Service Name: podcast-recording
# Settings → Root Directory: /media-recording-service
# Settings → Start Command: python main.py

# Add environment variables (from your .env):
PORT=8001
ENVIRONMENT=production
DEBUG=False
POSTGRES_URL=... (from Supabase)
RABBITMQ_URL=... (from CloudAMQP)
MINIO_ENDPOINT=... (from Cloudflare R2)
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_SECURE=True
REDIS_URL=... (from Upstash)
CORS_ORIGINS=["https://your-app.vercel.app"]
```

4. **Generate public URL:**
   - Settings → Generate Domain
   - You'll get: `https://podcast-recording-production.up.railway.app`

**✅ TEST CHECKPOINT 6.1:**
```bash
# Test Railway deployment
curl https://podcast-recording-production.up.railway.app/health

# Expected: {"status":"healthy",...}

# Test WebSocket
# Open browser to: https://podcast-recording-production.up.railway.app/ws/test
# Expected: WebSocket error (403) is OK - means endpoint exists
```

**Service 2: media-processing-service**
```bash
# Settings → Service Name: podcast-processing
# Settings → Root Directory: /media-processing-service
# Settings → Start Command: python main.py

# Add environment variables
RABBITMQ_URL=... (same as above)
```

**Service 3: media-processing-worker**
```bash
# Settings → Service Name: podcast-worker
# Settings → Root Directory: /media-recording-service
# Settings → Start Command: python -m src.processors.media_processing_worker

# Add environment variables (same as recording service)
```

### Step 6.2: Deploy Frontend to Vercel

```bash
cd podcast-frontend

# Install Vercel CLI if not already
npm install -g vercel

# Deploy
vercel --prod

# Or connect via Vercel dashboard:
# https://vercel.com/new
# Import from GitHub
```

**Add environment variables in Vercel:**
```env
NEXT_PUBLIC_API_URL=https://podcast-recording-production.up.railway.app/api
NEXT_PUBLIC_WS_URL=wss://podcast-recording-production.up.railway.app/ws
NEXT_PUBLIC_TURN_URL=turn:a.relay.metered.ca:443
NEXT_PUBLIC_TURN_USERNAME=your-metered-username
NEXT_PUBLIC_TURN_CREDENTIAL=your-metered-credential
```

### Step 6.3: Update Backend CORS for Production

In Railway (podcast-recording service), update environment:
```env
CORS_ORIGINS=["https://your-app.vercel.app","https://your-custom-domain.com"]
```

Redeploy the service.

### Step 6.4: Final Production Test

**Tester 1 (your location):**
1. Open: https://your-app.vercel.app
2. Create new session
3. Share session link

**Tester 2 (different location/network):**
1. Open shared link
2. Join session

**✅ TEST CHECKPOINT 6.4:**
```
Expected Behavior:
✓ Both users load frontend from Vercel
✓ WebSocket connects to Railway backend
✓ P2P connection established (via TURN if needed)
✓ Video/audio streams successfully
✓ Recording starts and uploads to Cloudflare R2
✓ Processing triggers via CloudAMQP
✓ Metadata saved to Supabase PostgreSQL

Console should show:
✓ "WebSocket connected"
✓ "Connection state: connected"
✓ "Using TURN server for ICE fallback"

Success! Your app is now globally accessible! 🎉
```

### Step 6.5: Add Custom Domain (Optional)

**For Frontend (Vercel):**
1. Vercel Dashboard → Settings → Domains
2. Add custom domain: podcast.yourdomain.com
3. Update DNS records (Vercel provides instructions)

**For Backend (Railway):**
1. Railway Dashboard → Settings → Custom Domain
2. Add: api.yourdomain.com
3. Update DNS CNAME record

**Update environment variables:**
```env
# Vercel
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/ws

# Railway
CORS_ORIGINS=["https://podcast.yourdomain.com"]
```

---

## 🔍 Testing Checklist

Use this checklist to verify each phase:

### ✅ Local Testing
- [ ] Backend health endpoint responds
- [ ] Frontend loads without errors
- [ ] Two browser tabs can establish P2P
- [ ] Audio/video streams between tabs
- [ ] Console shows "connected" state

### ✅ Local Network Testing
- [ ] Access frontend from another device
- [ ] WebSocket connects across devices
- [ ] P2P works on same WiFi network

### ✅ Public Internet Testing
- [ ] ngrok exposes backend publicly
- [ ] WebSocket works over WSS
- [ ] Frontend deployed to Vercel
- [ ] Users on different networks can connect

### ✅ TURN Server Testing
- [ ] TURN credentials configured
- [ ] Console shows "Using TURN server"
- [ ] ICE candidates include "relay" type
- [ ] P2P works through NAT/firewalls

### ✅ Cloud Infrastructure
- [ ] PostgreSQL connection successful
- [ ] RabbitMQ connection successful
- [ ] R2/S3 storage accessible
- [ ] Redis connection successful
- [ ] Backend works with all cloud services

### ✅ Production Deployment
- [ ] Backend deployed to Railway
- [ ] Frontend deployed to Vercel
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] End-to-end test successful
- [ ] Recording and processing work

---

## 🐛 Troubleshooting

### WebSocket Connection Issues

**Problem:** "WebSocket connection failed"

```bash
# Debug steps:
1. Check backend is running:
   curl https://your-backend.railway.app/health

2. Verify WebSocket URL format:
   ✓ Local: ws://localhost:8001/ws
   ✓ Prod: wss://your-backend.railway.app/ws (note wss://)

3. Check browser console:
   - "101 Switching Protocols" = success ✓
   - "403 Forbidden" = CORS issue
   - "404 Not Found" = wrong URL path

4. Verify CORS settings include frontend domain
```

### P2P Connection Issues

**Problem:** "ICE connection failed"

```bash
# Check ICE candidates:
1. Open browser console
2. Look for logs: "🧊 New ICE candidate: host/srflx/relay"

Types:
- host: Local IP (always present)
- srflx: Public IP via STUN (should be present)
- relay: TURN server (only if TURN configured)

If no "relay" candidates:
→ Check TURN credentials
→ Verify TURN URL format
→ Try alternative TURN server
```

**Problem:** "Works locally but fails on different networks"

```
Cause: NAT traversal failure
Solution: Configure TURN server (Phase 4)

Debug with trickle ICE test:
https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

Add your TURN server and verify it generates relay candidates.
```

### CORS Errors

**Problem:** "Access-Control-Allow-Origin" error

```bash
# Backend .env should include ALL frontend domains:
CORS_ORIGINS=["http://localhost:3000","https://your-app.vercel.app","https://your-custom-domain.com"]

# Don't forget to restart backend after changing CORS!

# For Railway, redeploy the service
# For local, restart: python main.py
```

### Railway Deployment Issues

**Problem:** Build fails

```bash
# Check logs in Railway dashboard
# Common issues:

1. Wrong Python version:
   # Add runtime.txt in media-recording-service/:
   python-3.11

2. Missing dependencies:
   # Ensure requirements.txt is complete
   pip freeze > requirements.txt

3. Wrong start command:
   # Verify in Railway settings:
   python main.py
```

**Problem:** Service crashes on startup

```bash
# Check Railway logs
# Common issues:

1. Missing environment variables
   → Verify all required vars are set in Railway

2. Database connection fails
   → Test connection string manually
   → Check network access in Supabase

3. Port binding issues
   → Railway sets PORT automatically
   → Use: port = int(os.getenv("PORT", 8001))
```

### Vercel Deployment Issues

**Problem:** Environment variables not working

```bash
# Vercel requires NEXT_PUBLIC_ prefix for browser access
✗ API_URL=https://... (won't work in browser)
✓ NEXT_PUBLIC_API_URL=https://... (works)

# After updating env vars, redeploy:
vercel --prod
```

### TURN Server Issues

**Problem:** No relay candidates generated

```bash
# Test TURN server manually:
1. Go to: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

2. Add TURN server:
   turn:a.relay.metered.ca:443
   Username: your-username
   Credential: your-credential

3. Click "Gather candidates"

Expected: Should see "relay" type candidates
If not: TURN server credentials are wrong or server is blocked
```

**Problem:** High TURN server costs

```
TURN usage = bandwidth consumed when P2P fails

Optimization:
1. Use STUN first (free Google STUN servers)
2. TURN only as fallback
3. Encourage users on same network to use local IPs
4. Set up your own coturn server for production

Free tier limits:
- Metered.ca: 50GB/month
- Xirsys: 500MB/month

For 100 concurrent 1-hour sessions (720p video):
~ 100 sessions × 1 hour × 500MB/hour = 50GB/month
```

---

## 📊 Cost Estimation

### Free Tier (Good for testing & small scale)

| Service | Free Tier | Limit |
|---------|-----------|-------|
| **Vercel** | Yes | 100GB bandwidth/month |
| **Railway** | $5 credit/month | ~500 hours |
| **Supabase** | Yes | 500MB database, 1GB bandwidth |
| **CloudAMQP** | Yes | 1M messages/month |
| **Cloudflare R2** | Yes | 10GB storage, 1M requests |
| **Upstash Redis** | Yes | 10K commands/day |
| **Metered TURN** | Yes | 50GB/month |

**Total:** $0-5/month (mostly free)

### Production Scale (~1000 monthly users)

| Service | Cost | Details |
|---------|------|---------|
| **Vercel** | $20/month | Pro plan |
| **Railway** | $50/month | 2 services + worker |
| **Supabase** | $25/month | Pro plan |
| **CloudAMQP** | $9/month | Bunny plan |
| **Cloudflare R2** | $5/month | Storage costs |
| **Upstash Redis** | $10/month | Pro tier |
| **TURN Server** | $20/month | Self-hosted VPS or Twilio |

**Total:** ~$140/month

---

## 🎯 Next Steps

After successful deployment:

1. **Monitoring & Logging**
   - Set up Sentry for error tracking
   - Configure Railway log retention
   - Monitor TURN server usage

2. **Performance Optimization**
   - Implement CDN caching
   - Optimize video bitrates
   - Add connection quality indicators

3. **Security Enhancements**
   - Implement user authentication
   - Add rate limiting
   - Secure TURN server credentials rotation

4. **Scalability**
   - Add load balancing for multiple backend instances
   - Implement Redis session storage
   - Set up auto-scaling policies

---

## 📚 Resources

### Official Documentation
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Railway Deployment](https://docs.railway.app/)
- [Vercel Deployment](https://vercel.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)

### TURN Server Setup
- [coturn Setup Guide](https://github.com/coturn/coturn)
- [WebRTC Trickle ICE Test](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)

### Testing Tools
- [ngrok Documentation](https://ngrok.com/docs)
- [WebRTC Samples](https://webrtc.github.io/samples/)

---

## 🆘 Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review browser console for WebRTC errors
3. Check Railway/Vercel deployment logs
4. Test each phase incrementally
5. Open an issue on GitHub with:
   - Phase you're on
   - Error messages
   - Browser console logs
   - Network tab screenshots

---

## ✅ Success Criteria

Your deployment is successful when:

- [ ] Users worldwide can access your app
- [ ] P2P connections work across different networks
- [ ] TURN server enables connection through NATs/firewalls
- [ ] Recordings upload to cloud storage
- [ ] Processing pipeline works end-to-end
- [ ] No CORS or WebSocket connection errors
- [ ] All services are monitored and healthy

**Congratulations! You now have a production-ready, globally accessible P2P podcast platform! 🎉**
