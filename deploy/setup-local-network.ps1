# ========================================
# Local Network Testing - Automated Setup (PowerShell)
# ========================================
# Run this script on Windows to set up HTTPS for local network testing
# Right-click and "Run with PowerShell"

# Set error action
$ErrorActionPreference = "Stop"

Write-Host "🔧 PodcastHub Local Network Setup" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""

# Step 1: Detect local IP
Write-Host "🔍 Detecting your local IP address..." -ForegroundColor Cyan

$LocalIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" | Where-Object {$_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*"}).IPAddress

if (-not $LocalIP) {
    $LocalIP = Read-Host "Could not detect IP automatically. Please enter your local IP (e.g., 192.168.40.27)"
}

Write-Host "✓ Using Local IP: $LocalIP" -ForegroundColor Green
Write-Host ""

# Step 2: Check for OpenSSL
Write-Host "🔍 Checking for OpenSSL..." -ForegroundColor Cyan

$OpenSSLPath = $null

# Check common OpenSSL locations
$PossiblePaths = @(
    "C:\Program Files\Git\usr\bin\openssl.exe",
    "C:\Program Files (x86)\Git\usr\bin\openssl.exe",
    "C:\OpenSSL-Win64\bin\openssl.exe",
    "C:\Program Files\OpenSSL-Win64\bin\openssl.exe"
)

foreach ($Path in $PossiblePaths) {
    if (Test-Path $Path) {
        $OpenSSLPath = $Path
        break
    }
}

if (-not $OpenSSLPath) {
    # Try to find in PATH
    $OpenSSLPath = (Get-Command openssl -ErrorAction SilentlyContinue).Source
}

if (-not $OpenSSLPath) {
    Write-Host "❌ OpenSSL not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install one of the following:" -ForegroundColor Yellow
    Write-Host "  1. Git for Windows (includes OpenSSL)" -ForegroundColor Yellow
    Write-Host "     https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "  2. OpenSSL for Windows" -ForegroundColor Yellow
    Write-Host "     https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installation, run this script again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ Found OpenSSL at: $OpenSSLPath" -ForegroundColor Green
Write-Host ""

# Step 3: Create certificates directory
Write-Host "📁 Creating certificates directory..." -ForegroundColor Cyan
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CertDir = Join-Path $ProjectRoot "certificates"

if (-not (Test-Path $CertDir)) {
    New-Item -ItemType Directory -Path $CertDir -Force | Out-Null
}

Set-Location $CertDir

# Step 4: Generate SSL certificates
Write-Host "🔐 Generating SSL certificates..." -ForegroundColor Cyan

# Check if certificates already exist
if ((Test-Path "localhost.crt") -and (Test-Path "localhost.key")) {
    $Response = Read-Host "Certificates already exist. Regenerate? (y/N)"
    if ($Response -ne 'y' -and $Response -ne 'Y') {
        Write-Host "Using existing certificates" -ForegroundColor Yellow
        Set-Location $ProjectRoot
        Write-Host ""
        Write-Host "Setup skipped. Certificates already exist." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 0
    }
    Remove-Item localhost.* -Force
}

# Generate private key
& $OpenSSLPath genrsa -out localhost.key 2048 2>&1 | Out-Null
Write-Host "✓ Private key generated" -ForegroundColor Green

# Generate CSR
& $OpenSSLPath req -new -key localhost.key -out localhost.csr -subj "/CN=$LocalIP/O=PodcastHub/C=US" 2>&1 | Out-Null
Write-Host "✓ Certificate signing request created" -ForegroundColor Green

# Create config file
@"
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.local
IP.1 = $LocalIP
IP.2 = 127.0.0.1
IP.3 = ::1
"@ | Out-File -FilePath "localhost.ext" -Encoding ASCII

# Generate certificate
& $OpenSSLPath x509 -req -in localhost.csr -signkey localhost.key -out localhost.crt -days 365 -sha256 -extfile localhost.ext 2>&1 | Out-Null
Write-Host "✓ Self-signed certificate generated" -ForegroundColor Green
Write-Host ""

# Step 5: Create Next.js HTTPS server
Write-Host "⚙️  Creating HTTPS server for Next.js..." -ForegroundColor Cyan

$FrontendDir = Join-Path $ProjectRoot "podcast-frontend"
$ServerJsPath = Join-Path $FrontendDir "server.js"

$ServerJsContent = @"
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
      console.log('🖥️  Laptop:  https://localhost:' + port);
      console.log('           https://127.0.0.1:' + port);
      console.log('📱 Phone:   https://$LocalIP:' + port);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('⚠️  Certificate Warning:');
      console.log('   You will see a security warning in your browser.');
      console.log('   Click "Advanced" → "Proceed to ... (unsafe)"');
      console.log('   This is normal for self-signed certificates.');
      console.log('');
    });
});
"@

$ServerJsContent | Out-File -FilePath $ServerJsPath -Encoding UTF8
Write-Host "✓ HTTPS server created" -ForegroundColor Green

# Step 6: Update package.json
Write-Host "📝 Updating package.json..." -ForegroundColor Cyan

$PackageJsonPath = Join-Path $FrontendDir "package.json"
if (Test-Path $PackageJsonPath) {
    $PackageJson = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json

    if (-not $PackageJson.scripts.'dev:https') {
        $PackageJson.scripts | Add-Member -MemberType NoteProperty -Name 'dev:https' -Value 'node server.js' -Force
        $PackageJson | ConvertTo-Json -Depth 10 | Set-Content $PackageJsonPath
        Write-Host "✓ Added dev:https script to package.json" -ForegroundColor Green
    } else {
        Write-Host "✓ dev:https script already exists" -ForegroundColor Yellow
    }
}

# Step 7: Update environment variables
Write-Host "🌐 Configuring environment variables..." -ForegroundColor Cyan

# Frontend environment
$FrontendEnv = @"
# ========================================
# LOCAL NETWORK TESTING CONFIGURATION
# ========================================
# Auto-generated by setup-local-network.ps1

# Backend API URL (your laptop's IP)
NEXT_PUBLIC_API_URL=http://$LocalIP:8001/api

# WebSocket URL (your laptop's IP)
NEXT_PUBLIC_WS_URL=ws://$LocalIP:8001/ws

# App Configuration
NEXT_PUBLIC_APP_NAME=PodcastHub
NEXT_PUBLIC_APP_DESCRIPTION=Professional Podcast Recording Platform

# TURN Server (not needed for local network testing)
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
"@

$FrontendEnvPath = Join-Path $FrontendDir ".env.local"
$FrontendEnv | Out-File -FilePath $FrontendEnvPath -Encoding UTF8
Write-Host "✓ Frontend environment configured" -ForegroundColor Green

# Backend environment
$BackendDir = Join-Path $ProjectRoot "media-recording-service"
$BackendEnv = @"
# ========================================
# LOCAL NETWORK TESTING CONFIGURATION
# ========================================
# Auto-generated by setup-local-network.ps1

# Application Settings
ENVIRONMENT=development
DEBUG=True
HOST=0.0.0.0
PORT=8001

# RabbitMQ Settings
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_EXCHANGE=podcast_events

# CORS Settings - Allow connections from your local network
CORS_ORIGINS=["http://localhost:3000","https://localhost:3000","http://$LocalIP:3000","https://$LocalIP:3000","http://127.0.0.1:3000","https://127.0.0.1:3000"]

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
"@

$BackendEnvPath = Join-Path $BackendDir ".env"
$BackendEnv | Out-File -FilePath $BackendEnvPath -Encoding UTF8
Write-Host "✓ Backend environment configured" -ForegroundColor Green

# Step 8: Configure Windows Firewall (requires admin)
Write-Host ""
Write-Host "🔥 Configuring Windows Firewall..." -ForegroundColor Cyan

$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($IsAdmin) {
    try {
        # Frontend rule
        $FrontendRule = Get-NetFirewallRule -DisplayName "PodcastHub Frontend HTTPS" -ErrorAction SilentlyContinue
        if (-not $FrontendRule) {
            New-NetFirewallRule -DisplayName "PodcastHub Frontend HTTPS" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null
            Write-Host "✓ Firewall rule created for Frontend (port 3000)" -ForegroundColor Green
        } else {
            Write-Host "✓ Firewall rule already exists for Frontend" -ForegroundColor Yellow
        }

        # Backend rule
        $BackendRule = Get-NetFirewallRule -DisplayName "PodcastHub Backend API" -ErrorAction SilentlyContinue
        if (-not $BackendRule) {
            New-NetFirewallRule -DisplayName "PodcastHub Backend API" -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow | Out-Null
            Write-Host "✓ Firewall rule created for Backend (port 8001)" -ForegroundColor Green
        } else {
            Write-Host "✓ Firewall rule already exists for Backend" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Could not create firewall rules: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Not running as Administrator. Firewall rules NOT created." -ForegroundColor Yellow
    Write-Host "   You need to manually create firewall rules or run this script as admin." -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Configuration Summary:" -ForegroundColor Cyan
Write-Host "  Local IP:     $LocalIP"
Write-Host "  Frontend:     https://$LocalIP:3000"
Write-Host "  Backend:      http://$LocalIP:8001"
Write-Host ""
Write-Host "📁 Files Created/Updated:" -ForegroundColor Cyan
Write-Host "  ✓ certificates/localhost.key"
Write-Host "  ✓ certificates/localhost.crt"
Write-Host "  ✓ podcast-frontend/server.js"
Write-Host "  ✓ podcast-frontend/.env.local"
Write-Host "  ✓ media-recording-service/.env"
Write-Host ""

if (-not $IsAdmin) {
    Write-Host "🔥 Firewall Configuration Needed:" -ForegroundColor Yellow
    Write-Host "   Run PowerShell as Administrator and execute:" -ForegroundColor Yellow
    Write-Host "   New-NetFirewallRule -DisplayName 'PodcastHub Frontend' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow" -ForegroundColor White
    Write-Host "   New-NetFirewallRule -DisplayName 'PodcastHub Backend' -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow" -ForegroundColor White
    Write-Host ""
}

Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Start Docker services (if not already running):" -ForegroundColor White
Write-Host "     cd $ProjectRoot" -ForegroundColor Gray
Write-Host "     docker-compose up -d" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Start Backend (Terminal 1):" -ForegroundColor White
Write-Host "     cd media-recording-service" -ForegroundColor Gray
Write-Host "     python main.py" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Start Frontend with HTTPS (Terminal 2):" -ForegroundColor White
Write-Host "     cd podcast-frontend" -ForegroundColor Gray
Write-Host "     npm run dev:https" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. Test on laptop:" -ForegroundColor White
Write-Host "     Open Chrome: https://localhost:3000" -ForegroundColor Gray
Write-Host "     Click 'Advanced' → 'Proceed to localhost (unsafe)'" -ForegroundColor Gray
Write-Host "     Create a session" -ForegroundColor Gray
Write-Host ""
Write-Host "  5. Test on phone:" -ForegroundColor White
Write-Host "     Connect phone to same WiFi" -ForegroundColor Gray
Write-Host "     Open Chrome: https://$LocalIP:3000" -ForegroundColor Gray
Write-Host "     Click 'Advanced' → 'Proceed to $LocalIP (unsafe)'" -ForegroundColor Gray
Write-Host "     Join the session" -ForegroundColor Gray
Write-Host ""
Write-Host "📱 Phone Access URL: https://$LocalIP:3000" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  Security Note:" -ForegroundColor Yellow
Write-Host "   You will see a certificate warning. This is normal for"
Write-Host "   self-signed certificates. Click 'Advanced' and proceed."
Write-Host ""
Write-Host "📖 For detailed instructions, see:" -ForegroundColor Cyan
Write-Host "   LOCAL_NETWORK_TESTING.md"
Write-Host ""

Read-Host "Press Enter to exit"
