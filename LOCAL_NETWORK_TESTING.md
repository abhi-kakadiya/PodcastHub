# 🏠 Local Network Testing Guide (Windows)

**Test your podcast app across devices on the same WiFi network**

## 🎯 The Problem

When accessing your app from a phone via `http://192.168.x.x:3000`, the browser **blocks camera/microphone access** because:
- Modern browsers require **HTTPS** for WebRTC media access on non-localhost origins
- `http://` connections from IP addresses are considered "insecure contexts"
- Chrome/Safari won't even show the permission prompt

## ✅ The Solution

We need to set up **HTTPS with self-signed certificates** for local testing.

---

## 📋 Prerequisites

- Windows laptop with the app running
- Phone and laptop on the same WiFi network
- OpenSSL installed (comes with Git Bash on Windows)

---

## 🔧 Step-by-Step Setup

### Step 1: Find Your Local IP Address

```powershell
# Open PowerShell and run:
ipconfig

# Look for "IPv4 Address" under your WiFi adapter
# Example: 192.168.1.100
# Note this IP - you'll need it throughout!
```

**For this guide, I'll use `192.168.1.100` - replace with YOUR actual IP**

---

### Step 2: Generate Self-Signed SSL Certificates

#### Option A: Using Git Bash (Recommended for Windows)

```bash
# Open Git Bash (comes with Git for Windows)
cd /c/Users/YourUsername/CAS-735-Project

# Create certificates directory
mkdir -p certificates
cd certificates

# Generate private key
openssl genrsa -out localhost.key 2048

# Generate certificate signing request
openssl req -new -key localhost.key -out localhost.csr -subj "/CN=192.168.1.100"

# Create config file for certificate
cat > localhost.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 192.168.1.100
IP.2 = 127.0.0.1
EOF

# Generate self-signed certificate (valid for 365 days)
openssl x509 -req -in localhost.csr -signkey localhost.key -out localhost.crt -days 365 -extfile localhost.ext

# Verify the certificate
openssl x509 -in localhost.crt -text -noout

echo "✅ Certificates generated successfully!"
ls -la
```

#### Option B: Using PowerShell (Alternative)

```powershell
# Open PowerShell as Administrator
cd C:\Users\YourUsername\CAS-735-Project

# Create certificates directory
New-Item -ItemType Directory -Force -Path certificates
cd certificates

# Generate self-signed certificate
$cert = New-SelfSignedCertificate `
    -DnsName "192.168.1.100", "localhost" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(1) `
    -KeyAlgorithm RSA `
    -KeyLength 2048

# Export the certificate
$pwd = ConvertTo-SecureString -String "podcast123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "localhost.pfx" -Password $pwd

# Convert to PEM format (requires OpenSSL)
# Download OpenSSL from: https://slproweb.com/products/Win32OpenSSL.html
# Or use Git Bash method above
```

**You should now have:**
- `certificates/localhost.key` (private key)
- `certificates/localhost.crt` (certificate)

---

### Step 3: Configure Frontend for HTTPS

#### Create HTTPS Server Script

Create `podcast-frontend/server.js`:

```javascript
const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Listen on all interfaces
const port = 3000;

// Load SSL certificates
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, '../certificates/localhost.key')),
  cert: fs.readFileSync(path.join(__dirname, '../certificates/localhost.crt')),
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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
    console.log(`✅ Frontend ready on https://${hostname}:${port}`);
    console.log(`📱 Access from phone: https://192.168.1.100:${port}`);
  });
});
```

#### Update package.json

Edit `podcast-frontend/package.json`:

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

---

### Step 4: Update Environment Variables

#### Frontend Environment

Edit `podcast-frontend/.env.local`:

```env
# ========================================
# LOCAL NETWORK TESTING
# ========================================
# Replace 192.168.1.100 with YOUR laptop's IP

# Backend API URL (use laptop's local IP)
NEXT_PUBLIC_API_URL=http://192.168.1.100:8001/api

# WebSocket URL (use laptop's local IP)
NEXT_PUBLIC_WS_URL=ws://192.168.1.100:8001/ws

# App Configuration
NEXT_PUBLIC_APP_NAME=PodcastHub
NEXT_PUBLIC_APP_DESCRIPTION=Professional Podcast Recording Platform

# TURN server (optional for local network)
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
```

#### Backend Environment

Edit `media-recording-service/.env`:

```env
# CORS Settings - Allow connections from laptop IP
CORS_ORIGINS=["http://localhost:3000","https://localhost:3000","http://192.168.1.100:3000","https://192.168.1.100:3000"]

# Other settings remain the same
ENVIRONMENT=development
DEBUG=True
HOST=0.0.0.0
PORT=8001

RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_EXCHANGE=podcast_events

MAX_CHUNK_SIZE=5242880
MAX_UPLOAD_SIZE=524288000

MEDIA_PROCESSING_QUEUE=media.processing.requests

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=podcasthub
POSTGRES_PASSWORD=podcasthub123
POSTGRES_DATABASE=podcasthub
```

---

### Step 5: Configure Windows Firewall

#### Allow Inbound Connections

```powershell
# Open PowerShell as Administrator

# Allow Frontend (port 3000)
New-NetFirewallRule -DisplayName "PodcastHub Frontend HTTPS" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

# Allow Backend (port 8001)
New-NetFirewallRule -DisplayName "PodcastHub Backend API" -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow

# Verify rules were created
Get-NetFirewallRule -DisplayName "PodcastHub*"
```

**Alternative: Using Windows Defender Firewall GUI**

1. Search for "Windows Defender Firewall" in Start Menu
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. Select "TCP" → Specific local ports: `3000`
6. Select "Allow the connection"
7. Check all profiles (Domain, Private, Public)
8. Name: "PodcastHub Frontend HTTPS"
9. Repeat for port `8001`

---

### Step 6: Start All Services

#### Terminal 1: Start Docker Services

```bash
# Start infrastructure
docker-compose up -d

# Wait 30 seconds for services to initialize
timeout 30

# Verify services are running
docker-compose ps
```

#### Terminal 2: Start Backend

```bash
cd media-recording-service

# Make sure .env is configured with CORS for your IP
python main.py

# You should see:
# INFO:     Uvicorn running on http://0.0.0.0:8001
```

#### Terminal 3: Start Frontend with HTTPS

```bash
cd podcast-frontend

# Install dependencies if not already done
npm install

# Start with HTTPS
npm run dev:https

# You should see:
# ✅ Frontend ready on https://0.0.0.0:3000
# 📱 Access from phone: https://192.168.1.100:3000
```

---

### Step 7: Trust the Certificate on Your Laptop

#### Windows

1. Open the certificate file: `certificates/localhost.crt`
2. Click "Install Certificate"
3. Store Location: "Current User"
4. Place in store: "Trusted Root Certification Authorities"
5. Click "Finish"

**OR using PowerShell:**

```powershell
# Import certificate to Trusted Root
Import-Certificate -FilePath ".\certificates\localhost.crt" -CertStoreLocation Cert:\CurrentUser\Root
```

#### Verify in Chrome

1. Open Chrome
2. Go to `chrome://settings/certificates`
3. Go to "Authorities" tab
4. Look for your certificate

---

### Step 8: Trust the Certificate on Your Phone

#### Android

1. **Transfer the certificate to phone:**
   - Email `localhost.crt` to yourself
   - OR use Google Drive/Dropbox
   - OR use ADB: `adb push certificates/localhost.crt /sdcard/Download/`

2. **Install certificate:**
   - Go to Settings → Security → Encryption & credentials
   - Tap "Install a certificate" → "CA certificate"
   - Browse to the certificate file and install
   - Give it a name: "PodcastHub Local"

3. **Alternative (easier but less secure):**
   - Open Chrome on Android
   - Visit `https://192.168.1.100:3000`
   - You'll see "Your connection is not private"
   - Tap "Advanced"
   - Tap "Proceed to 192.168.1.100 (unsafe)"
   - This bypasses the warning (only for testing!)

#### iOS/Safari

1. **Transfer certificate:**
   - Email `localhost.crt` to yourself
   - Open on iPhone

2. **Install profile:**
   - Settings → General → VPN & Device Management
   - Tap the profile
   - Tap "Install"
   - Enter passcode

3. **Trust the certificate:**
   - Settings → General → About → Certificate Trust Settings
   - Enable the certificate

---

### Step 9: Test the Connection

#### On Laptop (Chrome)

1. Open **Chrome** (not Edge, not Firefox for now)
2. Go to `https://localhost:3000` or `https://192.168.1.100:3000`
3. You should see the PodcastHub app
4. Open browser console (F12)
5. Click "Create Session" or "Start Recording"
6. Allow camera/microphone when prompted
7. Note the **session ID**

#### On Phone (Chrome)

1. Connect to same WiFi as laptop
2. Open **Chrome** browser
3. Go to `https://192.168.1.100:3000` (use YOUR laptop's IP)
4. If you see security warning:
   - Tap "Advanced"
   - Tap "Proceed to 192.168.1.100 (unsafe)"
5. You should see the PodcastHub app
6. Tap "Join Session"
7. Enter the session ID from laptop
8. **You should now be prompted for camera/microphone!**
9. Allow permissions
10. You should see P2P connection establish

---

## ✅ Verification Checklist

### Laptop Checklist
- [ ] Docker services running (`docker-compose ps`)
- [ ] Backend responding: `curl http://localhost:8001/health`
- [ ] Frontend loading: `https://localhost:3000`
- [ ] No certificate errors in Chrome
- [ ] Camera/microphone permissions working
- [ ] Session created successfully

### Phone Checklist
- [ ] Connected to same WiFi network
- [ ] Can ping laptop: Check in network settings
- [ ] Can access frontend: `https://192.168.1.100:3000`
- [ ] App loads without errors
- [ ] Camera/microphone permission prompt appears
- [ ] Can join session

### Connection Checklist
- [ ] WebSocket connects (check browser console)
- [ ] ICE candidates are exchanged
- [ ] P2P connection establishes
- [ ] Video stream visible on both devices
- [ ] Audio working on both devices
- [ ] Console shows "Connection state: connected"

---

## 🐛 Troubleshooting

### Issue 1: Phone Can't Access Frontend

**Test connectivity:**
```powershell
# On laptop, check if port is listening
netstat -an | findstr "3000"
# Should show: TCP 0.0.0.0:3000 ... LISTENING
```

**Ping test from phone:**
- Download "Network Utilities" app on phone
- Ping `192.168.1.100`
- If ping fails, check:
  - Both devices on same WiFi network
  - Windows Firewall rules created correctly
  - Router not blocking device-to-device communication

**Fix:**
```powershell
# Temporarily disable Windows Firewall for testing
# (Re-enable after testing!)
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

# Test if it works
# If it works, the firewall is blocking. Create proper rules.

# Re-enable firewall
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
```

### Issue 2: Certificate Errors

**On laptop:**
```bash
# Regenerate certificates with correct IP
cd certificates
rm localhost.*
# Then follow Step 2 again with YOUR correct IP
```

**On phone:**
- Use "Advanced" → "Proceed anyway" for testing
- OR properly install certificate (see Step 8)

### Issue 3: Camera/Microphone Still Not Prompting on Phone

**Check browser console on phone:**

1. On Android Chrome:
   - Go to `chrome://inspect` on laptop Chrome
   - Connect phone via USB
   - Enable USB debugging on phone
   - Click "Inspect" on your phone's browser tab
   - Check console for errors

2. Common issues:
   ```javascript
   // Error: "getUserMedia is not supported over HTTP"
   // Fix: Use HTTPS (you should be already)

   // Error: "Permission denied"
   // Fix: Check phone Settings → Apps → Chrome → Permissions

   // Error: "NotAllowedError: Permission dismissed"
   // Fix: Clear site data and try again
   ```

**Clear site data on phone:**
- Chrome → Settings → Site Settings
- Search for your IP address
- Clear & Reset

### Issue 4: WebSocket Connection Fails

**Check backend CORS:**
```python
# In media-recording-service/.env
CORS_ORIGINS=["https://192.168.1.100:3000","https://localhost:3000"]
```

**Test WebSocket from phone browser console:**
```javascript
// Open https://192.168.1.100:3000 on phone
// Open DevTools (chrome://inspect on laptop)
// Run in console:
const ws = new WebSocket('ws://192.168.1.100:8001/ws/test-session');
ws.onopen = () => console.log('✅ WebSocket connected');
ws.onerror = (e) => console.error('❌ WebSocket error:', e);
```

### Issue 5: P2P Connection Fails (WebSocket OK)

**Check ICE candidates in console:**
```javascript
// Look for these patterns in browser console:
"🧊 New ICE candidate: host"     // Local IP
"🧊 New ICE candidate: srflx"    // Public IP via STUN
"🧊 New ICE candidate: relay"    // Via TURN server

// If you only see "host" candidates:
// → STUN servers might be blocked
// → Check internet connectivity
// → Some corporate networks block STUN
```

**On same local network, you should see:**
- `host` candidates (local IPs like 192.168.x.x)
- Connection should work with just host candidates

**If connection still fails:**
- Both devices might have firewall blocking UDP
- Try enabling TURN server (see PUBLIC_DEPLOYMENT.md Phase 4)

### Issue 6: Different Behavior on iPhone vs Android

**Safari (iOS) specific issues:**

1. **WebRTC limitations:**
   - Safari has stricter WebRTC policies
   - Requires user gesture to call getUserMedia
   - May need to tap a button before camera access

2. **Certificate trust:**
   - Safari requires certificate to be in system trust store
   - Follow iOS certificate installation carefully (Step 8)

3. **Console access:**
   - Safari → Settings → Advanced → Web Inspector
   - Connect iPhone to Mac
   - Safari → Develop → [Your iPhone] → [Page]

**Android Chrome specific:**

1. **Permissions:**
   - Settings → Apps → Chrome → Permissions
   - Ensure Camera and Microphone are allowed

2. **Site settings:**
   - Chrome → Settings → Site Settings → Camera/Microphone
   - Check your IP is allowed

---

## 🎯 Expected Console Output

### Laptop Console (Chrome DevTools)

```
✓ WebSocket connected
✓ Created new peer connection
➕ Adding local audio track
➕ Adding local video track
🎯 Host creating offer...
📤 Sending offer
🧊 New ICE candidate: host (192.168.1.100:12345)
🧊 ICE gathering state: gathering
📥 Received answer
✓ Set remote description
🧊 New ICE candidate: host (192.168.1.50:54321)
✓ Added ICE candidate
🔌 Connection state: connecting
🧊 ICE connection state: checking
🧊 ICE connection state: connected
🔌 Connection state: connected
🎥 Received remote track: audio
🎥 Received remote track: video
📺 Remote stream tracks: {audio: 1, video: 1}
```

### Phone Console (via chrome://inspect)

```
✓ WebSocket connected
👤 Participant joined
📥 Received offer
✓ Created new peer connection
➕ Adding local audio track
➕ Adding local video track
✓ Set remote description
🎯 Guest creating answer...
📤 Sending answer
🧊 New ICE candidate: host (192.168.1.50:54321)
🧊 ICE gathering state: gathering
🧊 New ICE candidate: host (192.168.1.100:12345)
✓ Added ICE candidate
🔌 Connection state: connecting
🧊 ICE connection state: checking
🧊 ICE connection state: connected
🔌 Connection state: connected
🎥 Received remote track: audio
🎥 Received remote track: video
```

---

## 🎉 Success Criteria

You've successfully completed local network testing when:

- [ ] ✅ Laptop can create session with camera/microphone
- [ ] ✅ Phone can access frontend via `https://192.168.1.100:3000`
- [ ] ✅ Phone is prompted for camera/microphone permissions
- [ ] ✅ Phone can join session
- [ ] ✅ WebSocket connection establishes on both devices
- [ ] ✅ P2P connection shows "connected" on both
- [ ] ✅ Laptop sees phone's video feed
- [ ] ✅ Phone sees laptop's video feed
- [ ] ✅ Audio is transmitted both ways
- [ ] ✅ No console errors related to WebRTC

**Congratulations! Your app now works across devices on your local network!**

---

## 📱 Quick Reference

### IP Address Quick Check
```powershell
# Windows
ipconfig | findstr IPv4

# Linux/Mac
ifconfig | grep "inet "
```

### Service Status Quick Check
```bash
# Docker services
docker-compose ps

# Backend health
curl http://localhost:8001/health

# Frontend access (from laptop)
https://localhost:3000

# Frontend access (from phone)
https://192.168.1.100:3000  # Use YOUR IP
```

### Firewall Quick Check
```powershell
# List all PodcastHub firewall rules
Get-NetFirewallRule -DisplayName "PodcastHub*" | Format-Table -Property DisplayName,Enabled,Direction,Action

# Test if ports are listening
netstat -an | findstr "3000 8001"
```

---

## 🚀 Next Steps

Once local network testing works:

1. **Test across different networks:**
   - See PUBLIC_DEPLOYMENT.md Phase 3 (ngrok tunneling)

2. **Add TURN server:**
   - See PUBLIC_DEPLOYMENT.md Phase 4
   - Required for ~20% of network configurations

3. **Deploy to production:**
   - See PUBLIC_DEPLOYMENT.md Phase 5 & 6
   - Vercel + Railway deployment

---

## 📞 Need Help?

If you're still having issues:

1. Check all steps above carefully
2. Verify each checkbox in the verification section
3. Check troubleshooting for your specific issue
4. Review browser console logs on both devices
5. Try the simpler "Proceed anyway" certificate bypass first
6. Open an issue on GitHub with:
   - Your laptop's IP (e.g., 192.168.1.100)
   - Phone type and OS version
   - Browser console logs from both devices
   - Screenshot of the error on phone
