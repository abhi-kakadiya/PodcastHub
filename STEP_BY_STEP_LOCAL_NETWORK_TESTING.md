# 📱 Local Network Testing - Step-by-Step Guide

**Test your podcast app between your laptop (Windows) and phone on the same WiFi**

---

## 🎯 What We're Fixing

**Problem:** Your phone can't access camera/microphone because browsers block WebRTC over HTTP on IP addresses.

**Solution:** Set up HTTPS with self-signed certificates.

---

## 📋 Prerequisites

- [ ] Windows laptop with the app installed
- [ ] Phone and laptop connected to same WiFi
- [ ] Git for Windows installed (includes OpenSSL)
- [ ] Docker Desktop running

---

## 🔧 Step-by-Step Setup

### STEP 1: Find Your Laptop's IP Address

```powershell
# Open PowerShell
ipconfig

# Look for "Wireless LAN adapter Wi-Fi" section
# Find "IPv4 Address" - example: 192.168.40.27
# Write it down - you'll need it multiple times
```

**Your IP:** `___________________` (fill this in)

For this guide, I'll use `192.168.40.27` - **replace it with YOUR actual IP everywhere**

---

### STEP 2: Create Certificates Directory

```powershell
# Open PowerShell
cd C:\Users\YourUsername\CAS-735-Project

# Create certificates folder
mkdir certificates
cd certificates
```

---

### STEP 3: Generate SSL Certificates

**Find OpenSSL path:**

```powershell
# Check if Git is installed (includes OpenSSL)
"C:\Program Files\Git\usr\bin\openssl.exe" version

# If that works, copy this path:
# C:\Program Files\Git\usr\bin\openssl.exe
```

**If OpenSSL not found:** Install Git for Windows from https://git-scm.com/download/win

**Set OpenSSL variable for easier use:**

```powershell
$openssl = "C:\Program Files\Git\usr\bin\openssl.exe"
```

**Generate Private Key:**

```powershell
& $openssl genrsa -out localhost.key 2048
```

**Generate Certificate Signing Request:**

```powershell
# Replace 192.168.40.27 with YOUR IP
& $openssl req -new -key localhost.key -out localhost.csr -subj "/CN=192.168.40.27/O=PodcastHub/C=US"
```

**Create Certificate Extensions File:**

```powershell
# Replace 192.168.40.27 with YOUR IP
@"
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 192.168.40.27
IP.2 = 127.0.0.1
"@ | Out-File -FilePath "localhost.ext" -Encoding ASCII
```

**Generate Certificate:**

```powershell
& $openssl x509 -req -in localhost.csr -signkey localhost.key -out localhost.crt -days 365 -sha256 -extfile localhost.ext
```

**Verify files were created:**

```powershell
ls

# You should see:
# localhost.key
# localhost.crt
# localhost.csr
# localhost.ext
```

---

### STEP 4: Create HTTPS Server for Next.js

```powershell
# Go back to project root
cd ..

# Navigate to frontend
cd podcast-frontend
```

**Create `server.js` file:**

```powershell
notepad server.js
```

**Copy and paste this content into `server.js`:**

```javascript
const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3000;

// Load SSL certificates
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, '../certificates/localhost.key')),
  cert: fs.readFileSync(path.join(__dirname, '../certificates/localhost.crt')),
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

console.log('Starting HTTPS server...');

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log('');
    console.log('✅ HTTPS Server Ready!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🖥️  Laptop:  https://localhost:${port}`);
    console.log(`📱 Phone:   https://192.168.40.27:${port}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });
});
```

**IMPORTANT:** In the console.log line that says `https://192.168.40.27`, replace with YOUR IP.

**Save and close the file**

---

### STEP 5: Update Frontend Environment

```powershell
# Still in podcast-frontend directory
notepad .env.local
```

**Delete everything and paste this (replace IP with yours):**

```env
# Backend API URL (your laptop's IP)
NEXT_PUBLIC_API_URL=http://192.168.40.27:8001/api

# WebSocket URL (your laptop's IP)
NEXT_PUBLIC_WS_URL=ws://192.168.40.27:8001/ws

# App Configuration
NEXT_PUBLIC_APP_NAME=PodcastHub
NEXT_PUBLIC_APP_DESCRIPTION=Professional Podcast Recording Platform

# TURN Server (not needed for local network)
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
```

**Save and close**

---

### STEP 6: Update Backend Environment

```powershell
# Go to backend directory
cd ..
cd media-recording-service

notepad .env
```

**Delete everything and paste this (replace IP with yours):**

```env
# Application Settings
ENVIRONMENT=development
DEBUG=True
HOST=0.0.0.0
PORT=8001

# RabbitMQ Settings
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_EXCHANGE=podcast_events

# CORS Settings - Allow connections from your local network
CORS_ORIGINS=["http://localhost:3000","https://localhost:3000","http://192.168.40.27:3000","https://192.168.40.27:3000"]

# Upload Settings
MAX_CHUNK_SIZE=5242880
MAX_UPLOAD_SIZE=524288000

# Media Processing
MEDIA_PROCESSING_QUEUE=media.processing.requests

# PostgreSQL Settings
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=podcasthub
POSTGRES_PASSWORD=podcasthub123
POSTGRES_DATABASE=podcasthub
POSTGRES_URL=postgresql+asyncpg://podcasthub:podcasthub123@localhost:5432/podcasthub

# MinIO Settings
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=False
MINIO_BUCKET=recordings

# Redis Settings
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Save and close**

---

### STEP 7: Configure Windows Firewall

```powershell
# Open PowerShell as Administrator (Right-click → Run as Administrator)

# Allow Frontend (port 3000)
New-NetFirewallRule -DisplayName "PodcastHub Frontend HTTPS" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

# Allow Backend (port 8001)
New-NetFirewallRule -DisplayName "PodcastHub Backend API" -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow

# Verify rules were created
Get-NetFirewallRule -DisplayName "PodcastHub*"
```

---

### STEP 8: Update package.json

```powershell
# Go back to frontend directory (regular PowerShell, not Admin)
cd C:\Users\YourUsername\CAS-735-Project\podcast-frontend

notepad package.json
```

**Find the `"scripts"` section and add this line:**

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:https": "node server.js",
    "build": "next build",
    "start": "next start"
  }
}
```

**Just add the `"dev:https": "node server.js",` line**

**Save and close**

---

## 🚀 Start Everything

### Terminal 1: Start Docker Services

```powershell
# Open PowerShell Terminal 1
cd C:\Users\YourUsername\CAS-735-Project

docker-compose up -d

# Wait 30 seconds
Start-Sleep -Seconds 30

# Check services are running
docker-compose ps

# All services should show "Up"
```

---

### Terminal 2: Start Backend

```powershell
# Open NEW PowerShell Terminal 2
cd C:\Users\YourUsername\CAS-735-Project\media-recording-service

python main.py

# You should see:
# INFO:     Uvicorn running on http://0.0.0.0:8001
```

**Leave this terminal running**

---

### Terminal 3: Start Frontend with HTTPS

```powershell
# Open NEW PowerShell Terminal 3
cd C:\Users\YourUsername\CAS-735-Project\podcast-frontend

npm run dev:https

# You should see:
# ✅ HTTPS Server Ready!
# 🖥️  Laptop:  https://localhost:3000
# 📱 Phone:   https://192.168.40.27:3000
```

**Leave this terminal running**

---

## 🧪 Testing

### TEST 1: Test on Laptop

1. **Open Google Chrome on laptop**

2. **Navigate to:**
   ```
   https://localhost:3000
   ```

3. **You will see a security warning:**
   - Click **"Advanced"**
   - Click **"Proceed to localhost (unsafe)"**
   - This is normal for self-signed certificates

4. **The PodcastHub app should load**

5. **Click "Create Session" or "Start Recording"**

6. **Browser should prompt for camera/microphone permissions**
   - Click **"Allow"**

7. **You should see your video feed**

8. **Note the Session ID** (you'll need it for phone)

9. **Open Browser Console (F12)** and look for:
   ```
   ✓ WebSocket connected
   ✓ Created new peer connection
   ```

**✅ If you see your video and session is created, move to TEST 2**

---

### TEST 2: Test on Phone

1. **Make sure phone is connected to the SAME WiFi as laptop**

2. **Open Google Chrome on your phone**

3. **Navigate to (replace with YOUR laptop IP):**
   ```
   https://192.168.40.27:3000
   ```

4. **You will see a security warning:**
   - Tap **"Advanced"**
   - Tap **"Proceed to 192.168.40.27 (unsafe)"**

5. **The PodcastHub app should load**

6. **Tap "Join Session"**

7. **Enter the Session ID from laptop**

8. **🎯 CRITICAL: You should now see camera/microphone permission prompt!**
   - If you DON'T see this prompt, HTTPS setup failed
   - If you DO see it, tap **"Allow"**

9. **You should see:**
   - Your own video feed on phone
   - Laptop's video feed on phone
   - Phone's video feed on laptop

10. **Check that audio is working both ways**

---

## ✅ Success Criteria

**You've succeeded when:**

- [ ] Laptop loads `https://localhost:3000` with video
- [ ] Phone loads `https://192.168.40.27:3000`
- [ ] Phone shows camera/microphone permission prompt (THIS IS KEY!)
- [ ] Phone video appears on laptop
- [ ] Laptop video appears on phone
- [ ] Audio works both ways
- [ ] Browser console shows "Connection state: connected"

---

## 🐛 Troubleshooting (Only If Tests Fail)

### Problem 1: Phone can't reach the app (page won't load)

**Check laptop firewall:**
```powershell
# Verify rules exist
Get-NetFirewallRule -DisplayName "PodcastHub*"

# If no rules, run Step 7 again as Administrator
```

**Check services are listening:**
```powershell
netstat -an | findstr "3000 8001"

# Should show:
# TCP    0.0.0.0:3000    LISTENING
# TCP    0.0.0.0:8001    LISTENING
```

---

### Problem 2: Phone loads app but NO camera/microphone prompt

**This means HTTPS is not working. Check:**

1. **Are you using `https://` not `http://`?**
   - ❌ http://192.168.40.27:3000
   - ✅ https://192.168.40.27:3000

2. **Did certificate generation work?**
   ```powershell
   ls C:\Users\YourUsername\CAS-735-Project\certificates

   # Should show:
   # localhost.key
   # localhost.crt
   ```

3. **Is frontend using the HTTPS server?**
   ```powershell
   # Check Terminal 3 output
   # Should say "HTTPS Server Ready"
   # NOT "ready started server on"
   ```

4. **Clear phone browser cache:**
   - Chrome → Settings → Privacy → Clear browsing data
   - Or use Incognito mode

---

### Problem 3: Certificate warnings won't go away

**This is NORMAL!** Self-signed certificates always show warnings.

- **On laptop:** Advanced → Proceed to localhost (unsafe)
- **On phone:** Advanced → Proceed to [your-ip] (unsafe)

This is safe for testing on your own network.

---

### Problem 4: WebSocket connection fails

**Check browser console on both devices:**

```javascript
// Should see:
"✅ WebSocket connected"

// If you see error:
"❌ WebSocket error"
```

**Check backend CORS includes HTTPS:**
```powershell
cat C:\Users\YourUsername\CAS-735-Project\media-recording-service\.env | findstr CORS

# Should include:
# "https://192.168.40.27:3000"
```

---

### Problem 5: Video connects on laptop but not phone

**Check phone browser console:**
1. Connect phone to laptop via USB
2. Enable USB debugging on phone (Android)
3. Open `chrome://inspect` on laptop Chrome
4. Find your phone's browser tab
5. Click "Inspect"
6. Check console for errors

**Common errors:**
- "Permission denied" → Phone didn't grant camera/mic permissions
- "ICE connection failed" → Network issue (try TURN server)
- "NotAllowedError" → Clear site data and try again

---

## 📊 Summary

**Files you created/modified:**
```
✅ certificates/localhost.key           (generated)
✅ certificates/localhost.crt           (generated)
✅ podcast-frontend/server.js           (created)
✅ podcast-frontend/.env.local          (modified)
✅ podcast-frontend/package.json        (modified)
✅ media-recording-service/.env         (modified)
✅ Windows Firewall rules               (created)
```

**Services running:**
```
✅ Docker (RabbitMQ, MinIO, PostgreSQL, Redis)
✅ Backend (port 8001)
✅ Frontend HTTPS (port 3000)
```

**URLs:**
```
Laptop:  https://localhost:3000
Phone:   https://192.168.40.27:3000  (use YOUR IP!)
```

---

## 🎉 What's Next

Once this works, you can:

1. Test with multiple devices on same WiFi
2. Try ngrok for testing across different networks (see PUBLIC_DEPLOYMENT.md)
3. Deploy to production with Vercel + Railway

---

**End of Guide** - Follow each step in order, then test everything at the end.
