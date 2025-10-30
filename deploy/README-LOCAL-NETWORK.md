# 📱 Quick Guide: Local Network Testing (Your Setup)

**Test your app between your laptop and phone on WiFi**

## Your Network Configuration

```
Laptop IP:    192.168.40.27
WiFi Network: cgocable.net
Gateway:      192.168.40.1
```

---

## 🚀 Quick Start (Windows)

### Option 1: Automated Setup (Recommended)

**Step 1: Run the Setup Script**

```powershell
# Right-click on PowerShell and "Run as Administrator"
cd C:\Users\YourUsername\CAS-735-Project\deploy

# Run the setup script
.\setup-local-network.ps1
```

This script will:
- ✅ Detect your local IP (192.168.40.27)
- ✅ Generate SSL certificates
- ✅ Configure environment variables
- ✅ Set up HTTPS server for Next.js
- ✅ Create Windows Firewall rules

**Step 2: Start Services**

```powershell
# Terminal 1: Start Docker
cd C:\Users\YourUsername\CAS-735-Project
docker-compose up -d

# Terminal 2: Start Backend
cd media-recording-service
python main.py

# Terminal 3: Start Frontend with HTTPS
cd podcast-frontend
npm run dev:https
```

**Step 3: Test!**

- **Laptop:** Open Chrome → `https://localhost:3000`
- **Phone:** Open Chrome → `https://192.168.40.27:3000`

---

### Option 2: Manual Setup

If you prefer to do it step-by-step, follow `LOCAL_NETWORK_TESTING.md`

---

## 🎯 What the Problem Was

Your phone couldn't access camera/microphone because:

### ❌ Before (HTTP - Not Working)
```
Phone Browser: http://192.168.40.27:3000
                ↓
            🚫 BLOCKED
            Camera/Mic permissions denied
            (insecure context)
```

### ✅ After (HTTPS - Working)
```
Phone Browser: https://192.168.40.27:3000
                ↓
            ✓ SECURE CONTEXT
            Camera/Mic permissions prompt shown
            P2P connection works!
```

**Why?** Modern browsers require HTTPS for WebRTC media access on non-localhost origins.

---

## 🧪 Testing Checklist

### Before You Start
- [ ] Laptop and phone on same WiFi (cgocable.net)
- [ ] Docker Desktop running
- [ ] Git for Windows installed (includes OpenSSL)
- [ ] Node.js installed
- [ ] Python installed

### After Setup
- [ ] Certificates generated in `certificates/` folder
- [ ] `podcast-frontend/server.js` exists
- [ ] Environment files updated (`.env` and `.env.local`)
- [ ] Windows Firewall rules created

### Testing on Laptop
- [ ] Open `https://localhost:3000`
- [ ] See certificate warning → Click "Advanced" → "Proceed"
- [ ] App loads successfully
- [ ] Camera/microphone permissions prompt appears
- [ ] Create a session successfully

### Testing on Phone
- [ ] Phone connected to same WiFi
- [ ] Open `https://192.168.40.27:3000`
- [ ] See certificate warning → Tap "Advanced" → "Proceed"
- [ ] App loads successfully
- [ ] **Camera/microphone permissions prompt appears** ← This was missing before!
- [ ] Join session successfully
- [ ] P2P connection establishes
- [ ] Video/audio works both ways

---

## 🐛 Common Issues & Fixes

### Issue 1: "Can't reach the app from phone"

```powershell
# Check if laptop is listening on the right IP
netstat -an | findstr "3000 8001"

# You should see:
# TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING
# TCP    0.0.0.0:8001           0.0.0.0:0              LISTENING
```

**Fix:** Ensure Windows Firewall allows the ports
```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "PodcastHub Frontend" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "PodcastHub Backend" -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow
```

### Issue 2: "Certificate warning won't go away"

**This is normal!** Self-signed certificates always show warnings.

**On laptop:**
1. Click "Advanced"
2. Click "Proceed to localhost (unsafe)"

**On phone:**
1. Tap "Advanced"
2. Tap "Proceed to 192.168.40.27 (unsafe)"

### Issue 3: "Still no camera/microphone prompt on phone"

**Check browser console:**
```javascript
// On laptop Chrome:
// 1. Connect phone via USB
// 2. Enable USB debugging on phone
// 3. Open chrome://inspect on laptop
// 4. Find your phone's browser tab
// 5. Click "Inspect"
// 6. Check console for errors
```

**Clear site data on phone:**
- Chrome → Settings → Site Settings
- Search for "192.168.40.27"
- Clear & Reset
- Try again

### Issue 4: "Setup script can't find OpenSSL"

**Install Git for Windows:**
1. Download: https://git-scm.com/download/win
2. Install with default options
3. Git includes OpenSSL in `C:\Program Files\Git\usr\bin\`
4. Run setup script again

### Issue 5: "Firewall rules not created"

**Manual firewall configuration:**

1. Search "Windows Defender Firewall" in Start Menu
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. TCP → Specific ports: `3000` → Next
6. Allow the connection → Next
7. Check all profiles → Next
8. Name: "PodcastHub Frontend" → Finish
9. Repeat for port `8001` (name it "PodcastHub Backend")

---

## 📊 Network Diagram (Your Setup)

```
┌─────────────────────────────────────────────────────┐
│  WiFi Network: cgocable.net                         │
│  Gateway: 192.168.40.1                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────────┐    ┌──────────────────┐  │
│  │  Laptop              │    │  Phone           │  │
│  │  192.168.40.27       │    │  192.168.40.xxx  │  │
│  │                      │    │                  │  │
│  │  ┌────────────────┐  │    │  Chrome Browser  │  │
│  │  │ Frontend       │←─┼────┼──https://        │  │
│  │  │ HTTPS :3000    │  │    │  192.168.40.27:  │  │
│  │  └────────────────┘  │    │  3000            │  │
│  │                      │    │                  │  │
│  │  ┌────────────────┐  │    │  📷 Camera ✅    │  │
│  │  │ Backend        │←─┼────┼──🎤 Microphone ✅│  │
│  │  │ HTTP :8001     │  │    │                  │  │
│  │  └────────────────┘  │    │  WebRTC P2P ✅   │  │
│  │                      │    │                  │  │
│  │  Docker:             │    └──────────────────┘  │
│  │  - RabbitMQ :5672    │                          │
│  │  - MinIO :9000       │                          │
│  │  - PostgreSQL :5432  │                          │
│  │  - Redis :6379       │                          │
│  └──────────────────────┘                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## ✅ Success Criteria

You've succeeded when:

- [ ] ✅ Phone loads `https://192.168.40.27:3000`
- [ ] ✅ Phone shows camera/microphone permission prompt
- [ ] ✅ Phone can join session
- [ ] ✅ WebSocket connection established
- [ ] ✅ P2P connection shows "connected" in console
- [ ] ✅ Video visible on both devices
- [ ] ✅ Audio working both ways

---

## 📝 Quick Commands Reference

### Check Services
```powershell
# Docker status
docker-compose ps

# Backend health
curl http://localhost:8001/health

# Network listening
netstat -an | findstr "3000 8001"

# Firewall rules
Get-NetFirewallRule -DisplayName "PodcastHub*"
```

### Restart Everything
```powershell
# Stop all
docker-compose down
# (Ctrl+C in backend terminal)
# (Ctrl+C in frontend terminal)

# Start all
docker-compose up -d
cd media-recording-service && python main.py
cd podcast-frontend && npm run dev:https
```

---

## 🎉 What's Next?

Once this works, you can:

1. **Test with more devices**
   - Add another phone
   - Add a tablet
   - All on same WiFi

2. **Test across different networks**
   - See `PUBLIC_DEPLOYMENT.md` Phase 3 (ngrok)
   - This requires TURN server

3. **Deploy to production**
   - See `PUBLIC_DEPLOYMENT.md` Phases 4-6
   - Deploy to Vercel + Railway

---

## 📞 Need Help?

1. Check `LOCAL_NETWORK_TESTING.md` for detailed troubleshooting
2. Check browser console on both devices
3. Verify firewall rules are created
4. Make sure both devices are on same WiFi
5. Try the certificate bypass method first

**Common mistake:** Using `http://` instead of `https://`
- ❌ `http://192.168.40.27:3000` (won't work)
- ✅ `https://192.168.40.27:3000` (works)
