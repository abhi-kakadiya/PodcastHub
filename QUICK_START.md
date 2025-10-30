# 🚀 Quick Start Guide - PodcastHub

Get your podcast application running in 5 minutes!

## 📋 Prerequisites

- Docker Desktop installed and running
- Node.js 18+ installed
- Python 3.9+ installed

## 🎯 Local Development (5 Minutes)

### Step 1: Clone and Navigate
```bash
cd /path/to/CAS-735-Project
```

### Step 2: Start Infrastructure (1 min)
```bash
# Start Docker services
docker-compose up -d

# Wait for services to initialize
sleep 30
```

**Verify:** Open http://localhost:15672 (RabbitMQ) - Login: guest/guest

### Step 3: Start Backend (1 min)
```bash
# Terminal 1
cd media-recording-service

# Copy environment file
cp .env.example .env

# Install dependencies (first time only)
pip install -r requirements.txt

# Start backend
python main.py
```

**Verify:** Open http://localhost:8001/health - Should see "healthy"

### Step 4: Start Frontend (1 min)
```bash
# Terminal 2
cd podcast-frontend

# Copy environment file
cp .env.example .env.local

# Install dependencies (first time only)
npm install

# Start frontend
npm run dev
```

**Verify:** Open http://localhost:3000

### Step 5: Test P2P Connection (2 min)

1. **Browser Window 1:**
   - Open http://localhost:3000
   - Click "Create Session" or "Start Recording"
   - Allow camera/microphone permissions
   - Copy the session ID

2. **Browser Window 2 (Incognito):**
   - Open http://localhost:3000
   - Click "Join Session"
   - Paste the session ID
   - Allow camera/microphone permissions

**Expected Result:**
✅ Both windows show video
✅ Audio is transmitted
✅ Console shows "Connection state: connected"

---

## 🧪 Testing Your Setup

We've included a test script to verify everything is working:

```bash
# Make script executable
chmod +x deploy/test-local.sh

# Run tests
./deploy/test-local.sh
```

This will check:
- Docker services running
- Backend health
- WebSocket endpoint
- Frontend accessibility
- Environment configuration

---

## 🔀 Testing TURN Server (Optional)

To test TURN server connectivity before deployment:

1. Open `deploy/test-turn.html` in your browser
2. Enter your TURN server details
3. Click "Test TURN Server"
4. Verify you see "relay" candidates

---

## 🌐 Next Steps: Public Deployment

Once local testing works, follow the comprehensive guide:

📖 **[PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md)**

This guide covers:
- Phase 1: Local Testing (✅ You just completed this!)
- Phase 2: Local Network Testing
- Phase 3: Public Internet with Tunnels (ngrok)
- Phase 4: TURN Server Setup
- Phase 5: Cloud Infrastructure Setup
- Phase 6: Production Deployment (Vercel + Railway)

---

## 🐛 Common Issues

### Issue: Backend won't start
```bash
# Check if port 8001 is already in use
lsof -i :8001

# Kill the process if needed
kill -9 <PID>

# Restart backend
python main.py
```

### Issue: Docker services not starting
```bash
# Check Docker is running
docker ps

# Restart Docker Desktop
# Then:
docker-compose down
docker-compose up -d
```

### Issue: Frontend won't start
```bash
# Check if port 3000 is already in use
lsof -i :3000

# Kill the process if needed
kill -9 <PID>

# Clear cache and restart
rm -rf .next
npm run dev
```

### Issue: P2P connection fails
- ✅ **Local testing:** Should work without TURN
- ⚠️ **Different networks:** Needs TURN server (see Phase 4 in PUBLIC_DEPLOYMENT.md)

Check browser console:
- "WebSocket connected" = Backend communication OK
- "Connection state: connected" = P2P OK
- "Connection state: failed" = Needs TURN server

---

## 📊 Service URLs

Once everything is running:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | - |
| **Backend API** | http://localhost:8001 | - |
| **Health Check** | http://localhost:8001/health | - |
| **API Docs** | http://localhost:8001/docs | - |
| **RabbitMQ UI** | http://localhost:15672 | guest/guest |
| **MinIO UI** | http://localhost:9001 | minioadmin/minioadmin |

---

## 🛑 Stopping Services

```bash
# Stop backend: Ctrl+C in terminal

# Stop frontend: Ctrl+C in terminal

# Stop Docker services:
docker-compose down

# Stop and remove all data:
docker-compose down -v
```

---

## 📞 Getting Help

If you encounter issues:

1. Run the test script: `./deploy/test-local.sh`
2. Check browser console (F12) for errors
3. Check backend logs in terminal
4. Review [PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md) troubleshooting section
5. Open an issue on GitHub with:
   - Test script output
   - Browser console logs
   - Backend terminal logs

---

## ✅ Success Checklist

- [ ] Docker services running (RabbitMQ, MinIO, PostgreSQL, Redis)
- [ ] Backend responds to health check
- [ ] Frontend loads in browser
- [ ] P2P connection works between two browser tabs
- [ ] Video and audio stream successfully
- [ ] Test script passes all tests

**Once all items are checked, you're ready for public deployment!**

📖 Continue to [PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md) for the next steps.
