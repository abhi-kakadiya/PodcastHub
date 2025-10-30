#!/bin/bash

# ========================================
# Local Network Testing - Automated Setup
# ========================================
# This script sets up HTTPS for local network testing
# Run this on your Windows laptop using Git Bash

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔧 PodcastHub Local Network Setup${NC}"
echo "===================================="
echo ""

# Detect local IP
echo "🔍 Detecting your local IP address..."
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows (Git Bash)
    LOCAL_IP=$(ipconfig | grep -A 10 "Wireless LAN adapter Wi-Fi" | grep "IPv4 Address" | head -1 | awk '{print $NF}' | tr -d '\r')
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    LOCAL_IP=$(hostname -I | awk '{print $1}')
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LOCAL_IP=$(ipconfig getifaddr en0)
fi

if [ -z "$LOCAL_IP" ]; then
    echo -e "${RED}❌ Could not detect local IP automatically${NC}"
    read -p "Please enter your local IP address (e.g., 192.168.40.27): " LOCAL_IP
fi

echo -e "${GREEN}✓ Using Local IP: $LOCAL_IP${NC}"
echo ""

# Step 1: Create certificates directory
echo "📁 Creating certificates directory..."
mkdir -p ../certificates
cd ../certificates

# Step 2: Generate SSL certificates
echo "🔐 Generating SSL certificates..."

# Check if certificates already exist
if [ -f "localhost.crt" ] && [ -f "localhost.key" ]; then
    read -p "Certificates already exist. Regenerate? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing certificates"
        cd ..
        exit 0
    fi
    rm -f localhost.*
fi

# Generate private key
openssl genrsa -out localhost.key 2048
echo -e "${GREEN}✓ Private key generated${NC}"

# Generate certificate signing request
openssl req -new -key localhost.key -out localhost.csr -subj "/CN=$LOCAL_IP/O=PodcastHub/C=US"
echo -e "${GREEN}✓ Certificate signing request created${NC}"

# Create config file for SAN (Subject Alternative Names)
cat > localhost.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.local
IP.1 = $LOCAL_IP
IP.2 = 127.0.0.1
IP.3 = ::1
EOF

# Generate self-signed certificate
openssl x509 -req -in localhost.csr -signkey localhost.key -out localhost.crt -days 365 -sha256 -extfile localhost.ext
echo -e "${GREEN}✓ Self-signed certificate generated${NC}"

# Verify certificate
echo ""
echo "📋 Certificate Details:"
openssl x509 -in localhost.crt -noout -subject -issuer -dates
echo ""

# Step 3: Create Next.js HTTPS server
echo "⚙️  Creating HTTPS server for Next.js..."
cd ../podcast-frontend

cat > server.js << 'SERVERJS'
const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Listen on all network interfaces
const port = parseInt(process.env.PORT, 10) || 3000;

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
  })
    .once('error', (err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    })
    .listen(port, hostname, (err) => {
      if (err) throw err;
      console.log('');
      console.log('✅ HTTPS Server Ready!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🖥️  Laptop:  https://localhost:${port}`);
      console.log(`           https://127.0.0.1:${port}`);
SERVERJS

cat >> server.js << SERVERJS2
      console.log(\`📱 Phone:   https://$LOCAL_IP:\${port}\`);
SERVERJS2

cat >> server.js << 'SERVERJS3'
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('⚠️  Certificate Warning:');
      console.log('   You will see a security warning in your browser.');
      console.log('   Click "Advanced" → "Proceed to ... (unsafe)"');
      console.log('   This is normal for self-signed certificates.');
      console.log('');
    });
});
SERVERJS3

echo -e "${GREEN}✓ HTTPS server created${NC}"

# Step 4: Update package.json
echo "📝 Updating package.json..."
# Check if dev:https script exists
if grep -q '"dev:https"' package.json; then
    echo "Script already exists"
else
    # Backup package.json
    cp package.json package.json.backup
    # Add dev:https script using Node.js to properly edit JSON
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.scripts['dev:https'] = 'node server.js';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
    "
    echo -e "${GREEN}✓ Added dev:https script to package.json${NC}"
fi

# Step 5: Update environment variables
echo "🌐 Configuring environment variables..."
cd ../

cat > podcast-frontend/.env.local << ENVLOCAL
# ========================================
# LOCAL NETWORK TESTING CONFIGURATION
# ========================================
# Auto-generated by setup-local-network.sh

# Backend API URL (your laptop's IP)
NEXT_PUBLIC_API_URL=http://$LOCAL_IP:8001/api

# WebSocket URL (your laptop's IP)
NEXT_PUBLIC_WS_URL=ws://$LOCAL_IP:8001/ws

# App Configuration
NEXT_PUBLIC_APP_NAME=PodcastHub
NEXT_PUBLIC_APP_DESCRIPTION=Professional Podcast Recording Platform

# TURN Server (not needed for local network testing)
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
ENVLOCAL

echo -e "${GREEN}✓ Frontend environment configured${NC}"

# Update backend CORS
cat > media-recording-service/.env << ENVBACKEND
# ========================================
# LOCAL NETWORK TESTING CONFIGURATION
# ========================================
# Auto-generated by setup-local-network.sh

# Application Settings
ENVIRONMENT=development
DEBUG=True
HOST=0.0.0.0
PORT=8001

# RabbitMQ Settings
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_EXCHANGE=podcast_events

# CORS Settings - Allow connections from your local network
CORS_ORIGINS=["http://localhost:3000","https://localhost:3000","http://$LOCAL_IP:3000","https://$LOCAL_IP:3000","http://127.0.0.1:3000","https://127.0.0.1:3000"]

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
ENVBACKEND

echo -e "${GREEN}✓ Backend environment configured${NC}"

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Configuration Summary:"
echo "  Local IP:     $LOCAL_IP"
echo "  Frontend:     https://$LOCAL_IP:3000"
echo "  Backend:      http://$LOCAL_IP:8001"
echo ""
echo "📁 Files Created/Updated:"
echo "  ✓ certificates/localhost.key"
echo "  ✓ certificates/localhost.crt"
echo "  ✓ podcast-frontend/server.js"
echo "  ✓ podcast-frontend/.env.local"
echo "  ✓ media-recording-service/.env"
echo ""
echo "🚀 Next Steps:"
echo ""
echo "  1. Start Docker services (if not already running):"
echo "     cd $(pwd)"
echo "     docker-compose up -d"
echo ""
echo "  2. Start Backend (Terminal 1):"
echo "     cd media-recording-service"
echo "     python main.py"
echo ""
echo "  3. Start Frontend with HTTPS (Terminal 2):"
echo "     cd podcast-frontend"
echo "     npm run dev:https"
echo ""
echo "  4. Configure Windows Firewall:"
echo "     Run PowerShell as Administrator:"
echo "     New-NetFirewallRule -DisplayName 'PodcastHub Frontend' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow"
echo "     New-NetFirewallRule -DisplayName 'PodcastHub Backend' -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow"
echo ""
echo "  5. Test on laptop:"
echo "     Open Chrome: https://localhost:3000"
echo "     Click 'Advanced' → 'Proceed to localhost (unsafe)'"
echo "     Create a session"
echo ""
echo "  6. Test on phone:"
echo "     Connect phone to same WiFi"
echo "     Open Chrome: https://$LOCAL_IP:3000"
echo "     Click 'Advanced' → 'Proceed to $LOCAL_IP (unsafe)'"
echo "     Join the session"
echo ""
echo "📱 Phone Access URL: https://$LOCAL_IP:3000"
echo ""
echo "⚠️  Security Note:"
echo "   You will see a certificate warning. This is normal for"
echo "   self-signed certificates. Click 'Advanced' and proceed."
echo ""
echo "📖 For detailed instructions, see:"
echo "   LOCAL_NETWORK_TESTING.md"
echo ""
