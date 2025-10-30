# PodcastHub - Professional Podcast Recording Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Next.js](https://img.shields.io/badge/next.js-14.0-black)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688)](https://fastapi.tiangolo.com/)

**CAS 735 - Software Design (Fall 2025)**
**McMaster University - Department of Computing and Software**

A production-grade, microservices-based podcast recording platform featuring real-time WebRTC collaboration, multi-track recording, cloud storage, and event-driven architecture.

---

## Overview

PodcastHub is a modern web application that enables distributed teams to record high-quality podcast sessions with real-time video collaboration. Unlike traditional recording solutions, PodcastHub streams recording chunks to cloud storage in real-time, ensuring data resilience and enabling immediate post-processing workflows.

### Problem Statement

Traditional podcast recording solutions face several challenges:
- **Data Loss Risk**: Local recording can lose hours of content due to crashes
- **Post-Production Complexity**: Multi-track editing requires manual synchronization  
- **Collaboration Limitations**: Remote guests need separate recording setup
- **Quality Inconsistency**: Browser-based solutions compromise on quality

### Solution

PodcastHub addresses these through:
- **Real-time Chunk Upload**: 5-second chunks uploaded immediately to MinIO (S3-compatible storage)
- **Multi-track Isolation**: Separate audio, video, and screen share tracks for editing flexibility
- **WebRTC Integration**: Browser-based peer-to-peer connections with studio-quality capture
- **Microservices Architecture**: Scalable, maintainable, and independently deployable services

---

## Key Features

### Recording Capabilities
- Multi-Track Recording (audio, video, screen share)
- Real-time upload to MinIO during recording
- Pause/Resume functionality
- Host/Guest role-based permissions
- SHA-256 checksum validation for data integrity
- Real-time upload progress visualization
- Automatic post-processing to MP3 (audio) and MP4 (video/screen) with chunk cleanup

### Video Collaboration
- WebRTC Peer-to-Peer connections
- HD Quality (1080p @ 30fps, 48kHz audio)
- Screen sharing support
- Individual media controls (mic, camera, screen)
- Join via 6-character room codes

### Technical Excellence
- Hexagonal Architecture (Ports & Adapters)
- Event-Driven with RabbitMQ
- Microservices-based design
- Cloud storage with MinIO (S3-compatible)
- Type-safe: TypeScript frontend, Python with type hints

---

## Technology Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript 5.6** - Type-safe development
- **Tailwind CSS 3.4** - Utility-first styling
- **WebRTC** - Peer-to-peer connections
- **Web Crypto API** - SHA-256 checksums

### Backend
- **FastAPI 0.104** - Async Python web framework
- **Python 3.11+** - Backend language
- **Pydantic 2.5** - Data validation
- **MinIO SDK 7.2** - Object storage client
- **asyncpg 0.29** - PostgreSQL async driver
- **aio-pika 9.3** - RabbitMQ async client

### Infrastructure
- **RabbitMQ** - Message broker
- **MinIO** - S3-compatible storage
- **PostgreSQL 15** - Relational database
- **Redis 7** - Caching and sessions
- **Docker Compose** - Service orchestration

---

## 📚 Documentation

### Main Guides
- **[QUICK_START.md](QUICK_START.md)** - Get running locally in 5 minutes
- **[STEP_BY_STEP_LOCAL_NETWORK_TESTING.md](STEP_BY_STEP_LOCAL_NETWORK_TESTING.md)** - ⭐ Test on WiFi (laptop + phone) - **Start Here!**
- **[PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md)** - Complete guide for deploying to production
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design and architecture details
- **[SCENARIO.md](SCENARIO.md)** - User scenarios and workflows

### Reference Documentation
- **[LOCAL_NETWORK_TESTING.md](LOCAL_NETWORK_TESTING.md)** - Detailed reference with troubleshooting

### Helper Scripts & Tools
- **[deploy/README-LOCAL-NETWORK.md](deploy/README-LOCAL-NETWORK.md)** - Quick reference for local network testing
- **[deploy/setup-local-network.ps1](deploy/setup-local-network.ps1)** - Automated HTTPS setup (Windows)
- **[deploy/setup-local-network.sh](deploy/setup-local-network.sh)** - Automated HTTPS setup (Linux/Mac)
- **[deploy/test-local.sh](deploy/test-local.sh)** - Test local environment
- **[deploy/test-turn.html](deploy/test-turn.html)** - TURN server connectivity tester

---

## Quick Start (5 Minutes)

**👉 For detailed setup instructions, see [QUICK_START.md](QUICK_START.md)**

### 1. Clone Repository
```bash
git clone https://github.com/abhi-kakadiya/CAS-735-Project.git
cd CAS-735-Project
```

### 2. Start Infrastructure
```bash
docker-compose up -d
docker-compose ps  # Verify all services running
```

> Docker Compose starts RabbitMQ, MinIO, PostgreSQL, Redis, the recording API, and the media-processing worker. After worker code changes run `docker compose build media-processing-worker && docker compose up -d media-processing-worker` to refresh the container.

### 3. Create MinIO Bucket
1. Open http://localhost:9001
2. Login: `minioadmin` / `minioadmin`
3. Create bucket named `recordings`

### 4. Start Backend
```bash
cd media-recording-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Verify: http://localhost:8001/docs

> When running via Docker Compose, the recording service connects to PostgreSQL using `POSTGRES_HOST=postgres` (already set in `.env`). If you launch the backend outside Docker, override `POSTGRES_HOST=localhost` so the app can reach the database.

### 5. Start Frontend
```bash
cd podcast-frontend
npm install
npm run dev
```

Verify: http://localhost:3000

> Optional: configure `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, and `NEXT_PUBLIC_TURN_CREDENTIAL` in `podcast-frontend/.env` to enable TURN relays for remote peers.

### 6. Test End-to-End
**Browser 1 (Host):**
1. Go to http://localhost:3000
2. Create Meeting  Enter name "Alice"
3. Note room code

**Browser 2 (Guest):**
1. Open http://localhost:3000 (new window/incognito)
2. Join Meeting  Enter room code
3. See each other's video connect

**Host:**
1. Start Recording
2. Watch upload progress in-app and observe status cards update
3. Verify chunks in MinIO Console

**Processing Worker:**
1. Tail logs with `docker compose logs -f media-processing-worker` to observe queue consumption (or run `python -m src.processors.media_processing_worker` locally if developing outside Docker).
2. Stop the recording from the host browser; the worker automatically downloads manifests, retries on transient errors, and emits `recording.processed` events.
3. Confirm processed assets under `recordings/sessions/<session>/recordings/<recording>/processed/` in MinIO (`audio_<id>.mp3`, `video_<id>.mp4`, `screen_<id>.mp4`) and note that raw chunks are cleaned up afterwards.

**Database Validation:**
- Inspect `recording_metadata` and `recording_chunks` tables in PostgreSQL (`docker exec -it podcasthub_postgres psql -U podcasthub`).
- Use the frontend recording status panel to confirm `queued -> processing -> completed/failed` transitions sourced from PostgreSQL.

---

## Project Structure

```
CAS-735-Project/
 media-recording-service/          # Backend (FastAPI)
    src/
       domain/                   # Business logic
          models/              # Recording, Session, Chunk
          exceptions/
       application/              # Use cases
          services/
          ports/
       adapters/                 # Interface adapters
          inbound/             # REST, WebSocket
             http/            # Session, Recording, Upload routes
          outbound/            # MinIO, RabbitMQ
       infrastructure/           # Config, DI
    main.py

 podcast-frontend/                 # Frontend (Next.js)
    src/
       app/                      # Pages
          page.tsx             # Landing
          create/              # Create meeting
          join/                # Join meeting
          room/[roomId]/       # Meeting room
       hooks/
           use-webrtc.ts        # WebRTC peer connections
           use-recording.ts     # Recording with upload
    package.json

 docker-compose.yml                # Infrastructure
 ARCHITECTURE.md                   # Architecture doc
 TESTING_GUIDE.md                  # Testing procedures
 SCENARIO.md                       # User scenarios
 README.md                         # This file
```

---

## Architecture

### Hexagonal Architecture (Ports & Adapters)

```

           Domain Layer                  
  Recording | Session | Chunk           

                   

        Application Layer                
  RecordingService | UploadService       

                             
  
 Inbound            Outbound        
 Adapters           Adapters        
  REST API          MinIO         
  WebSocket         RabbitMQ      
  
```

### Data Flow
1. Session Creation  Room code generated
2. WebRTC Signaling  Peer connection established
3. Recording Start  IDs created for tracks
4. Chunk Capture  5s chunks with SHA-256
5. Real-time Upload  MinIO storage
6. Progress Update  Frontend visualization

---

## API Documentation

### Session Management
```http
POST /api/sessions/create
{
  "host_id": "Alice"
}
 { "session_id": "...", "room_code": "ABC123" }

POST /api/sessions/join
{
  "room_code": "ABC123",
  "participant_id": "Bob"
}
 { "session_id": "...", "room_code": "ABC123" }
```

### Recording
```http
POST /api/recordings/start
{
  "session_id": "...",
  "participant_id": "Alice",
  "track_types": ["audio", "video", "screen"]
}
 { "recording_ids": {"audio": "...", "video": "...", "screen": "..."} }
```

### Upload
```http
POST /api/uploads/chunk
Form Data:
- recording_id
- sequence
- checksum (SHA-256)
- chunk_file (binary)
 { "chunk_id": "...", "minio_path": "sessions/.../chunk_00000.webm" }
```

### WebSocket Signaling
```javascript
ws://localhost:8001/ws/{session_id}

Messages:
- join: Join session
- offer/answer: WebRTC SDP exchange
- ice-candidate: ICE candidate relay
- screen-share-started/stopped
```

---

## Testing

See **[TESTING_GUIDE.md](TESTING_GUIDE.md)** for comprehensive testing procedures.

### Quick Test
```bash
# 1. Start services
docker-compose up -d
python media-recording-service/main.py &
npm run dev --prefix podcast-frontend &

# 2. Create meeting (Browser 1)
# 3. Join meeting (Browser 2)
# 4. Start recording
# 5. Verify chunks in MinIO
```

---

## Performance

| Metric | Value |
|--------|-------|
| Chunk Upload Latency | <500ms (p95) |
| WebRTC Connection | <2s |
| API Response Time | <100ms (median) |
| Concurrent Sessions | 100+ |
| Storage Throughput | 50 MB/s |

---

## Security

**Implemented:**
- SHA-256 checksums for integrity
- CORS configuration
- Input validation (Pydantic)
- Type safety (TypeScript/Python)

**Production Recommendations:**
- JWT authentication
- HTTPS/TLS encryption
- Rate limiting
- API key management
- Database encryption

---

## Future Enhancements

### Short Term
- [ ] Harden TURN/TLS infrastructure for production NAT traversal
- [ ] Ship recording library UI with download/share workflows
- [ ] Add observability dashboards (metrics, tracing, alerting)
- [ ] Automate multi-minute end-to-end regression tests

### Long Term
- [ ] Multi-participant (3+)
- [ ] Live transcription
- [ ] User authentication
- [ ] AI-powered editing
- [ ] Mobile apps

---

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Complete architecture design
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Testing procedures
- **[SCENARIO.md](SCENARIO.md)** - User scenarios

---

## Contributing

```bash
git checkout -b feature/your-feature
# Make changes
git commit -m "Add feature"
git push origin feature/your-feature
# Create PR
```

---

## License

MIT License - see LICENSE file

---

## Acknowledgments

**Academic:**
- Course: CAS 735 - Software Design
- Institution: McMaster University
- Department: Computing and Software
- Semester: Fall 2025

**Inspiration:**
- Riverside.fm (UI/UX)
- Alistair Cockburn (Hexagonal Architecture)
- Eric Evans (Domain-Driven Design)

---

## Contact

**Abhi Kakadiya**
McMaster University
Email: kakadia@mcmaster.ca
GitHub: [@abhi-kakadiya](https://github.com/abhi-kakadiya)

---

[Report Bug](https://github.com/abhi-kakadiya/CAS-735-Project/issues) 
[Documentation](https://github.com/abhi-kakadiya/CAS-735-Project)

</div>


