# PodcastHub: Distributed Podcast Recording and Production Platform

## Phase 2: Individual Microservices Implementation

**Student:** Abhi Kakadiya
**Course:** CAS 735 - Microservice-Oriented Architecture

---

## 🎯 Project Overview

This repository contains **two microservices** implementing the Media Recording and Processing components of PodcastHub:

1. **Media Recording & Upload Service** (Port 8001)
   - WebRTC-based local recording
   - Resilient chunked uploads with retry logic
   - Real-time progress tracking via WebSocket
   - Event publishing to RabbitMQ

2. **Media Processing Service** (Port 8002)
   - Multi-track synchronization
   - Audio/video enhancement pipeline
   - Automated mixing and encoding
   - Event-driven workflow orchestration

---

## 🏗️ Architecture

Both services implement **Hexagonal Architecture** (Ports & Adapters) with:

- ✅ **Domain Layer**: Pure business logic, framework-independent
- ✅ **Application Layer**: Use case orchestration
- ✅ **Adapters Layer**: REST APIs, WebSocket, RabbitMQ, Repositories
- ✅ **Infrastructure Layer**: Configuration and dependency injection

**Key Principles:**
- Domain-Driven Design (Aggregates, Events, Value Objects)
- Event-Driven Communication (RabbitMQ)
- Dependency Inversion (Ports pattern)
- SOLID principles throughout

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Docker & Docker Compose

### 1. Start RabbitMQ
```bash
docker-compose up -d
```

### 2. Run Media Recording Service
```bash
cd media-recording-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```
**Service:** http://localhost:8001

### 3. Run Media Processing Service (New Terminal)
```bash
cd media-processing-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```
**Service:** http://localhost:8002

### 4. Test It!

**Web Interface:**
Open http://localhost:8001/static/index.html
- Start recording with your microphone
- Watch chunks upload in real-time
- See progress tracking

**API Documentation:**
- Recording Service: http://localhost:8001/docs
- Processing Service: http://localhost:8002/docs

**RabbitMQ Management:**
- URL: http://localhost:15672
- Credentials: guest/guest

---

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get running in 5 minutes
- **[PODCASTHUB_README.md](PODCASTHUB_README.md)** - Complete documentation
- **[SCENARIO.md](SCENARIO.md)** - Step-by-step test scenarios
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed architecture explanation
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Implementation overview

---

## 🧪 Testing

### Run Unit Tests
```bash
cd media-recording-service
pytest tests/ -v
```

### Import Postman Collections
- `media-recording-service/postman_collection.json`
- `media-processing-service/postman_collection.json`

---

## 📦 What's Included

### Media Recording & Upload Service

**Features:**
- WebRTC local recording (audio/video/screen)
- Chunked upload (5-second intervals)
- Automatic retry with exponential backoff
- MD5 checksum validation
- Real-time WebSocket progress updates
- REST API with 13 endpoints
- RabbitMQ event publishing

**Technology:**
- FastAPI (REST API)
- WebSocket (real-time updates)
- RabbitMQ/aio-pika (messaging)
- Pydantic (validation)
- In-memory storage (Phase 2 requirement)

**Architecture:**
```
REST API → Recording Service → Domain Models → Repository
                ↓
        RabbitMQ Events → Processing Service
```

### Media Processing Service

**Features:**
- Multi-track synchronization
- Processing pipeline (SYNC → ENHANCE → MIX)
- Job status tracking
- Event-driven workflow
- REST API with 3 endpoints

**Technology:**
- FastAPI
- RabbitMQ/aio-pika
- Mock media processor (ready for FFmpeg)

---

## 🎯 Phase 2 Requirements

### ✅ Technical Requirements

- [x] **REST API with OpenAPI**: Both services fully documented
- [x] **RabbitMQ Integration**: 15+ event types
- [x] **Hexagonal Architecture**: Strict layering with ports & adapters
- [x] **No Database**: In-memory repositories as required
- [x] **Two Services**: Recording and Processing

### ✅ Deliverables

- [x] **README.md**: Installation and usage guide
- [x] **SCENARIO.md**: Executable test scenarios
- [x] **Architecture Documentation**: Detailed justification
- [x] **Tests**: Unit and integration tests
- [x] **Postman Collections**: API testing

---

## 🔄 Integration Points

### With Session Management Service (Suleyman)

**Events Published:**
- `recording.started` - Recording begins
- `recording.ended` - Recording stops
- `upload.completed` - All chunks uploaded

**Integration:**
```
Session Service → POST /api/recordings/start
                ↓
        Recording Service publishes events
                ↓
        Session Service subscribes to updates
```

### With Notification Service (Suleyman)

**Events Consumed:**
- `upload.completed` - Trigger notification
- `processing.job.completed` - Notify user

---

## 🏛️ Architecture Highlights

### Hexagonal Architecture Benefits

**Domain Independence:**
```python
# Domain model has NO framework dependencies
@dataclass
class Recording:
    def start(self):
        if self.status != RecordingStatus.WAITING:
            raise ValueError("Cannot start")
        self.status = RecordingStatus.RECORDING
```

**Testability:**
```python
# Test domain logic without any infrastructure
def test_recording_start():
    recording = Recording(status=RecordingStatus.WAITING)
    recording.start()
    assert recording.status == RecordingStatus.RECORDING
```

**Flexibility:**
```python
# Swap implementations without changing application code
repository = InMemoryRecordingRepository()  # Phase 2
# repository = PostgresRecordingRepository()  # Phase 3+
```

### Event-Driven Communication

**Publisher:**
```python
event = RecordingStarted(recording_id=..., session_id=...)
await event_publisher.publish(event, routing_key="recording.started")
```

**Subscriber (Other Services):**
```python
# Session Management subscribes to "recording.*"
# Notification Service subscribes to "upload.*"
# Processing Service subscribes to "upload.completed"
```

---

## 📊 Project Structure

```
CAS-735-Project/
├── media-recording-service/
│   ├── src/
│   │   ├── domain/              # Pure business logic
│   │   │   ├── models/          # Recording, Chunk, Upload
│   │   │   ├── events/          # Domain events
│   │   │   └── exceptions/      # Domain exceptions
│   │   ├── application/         # Use cases
│   │   │   ├── ports/           # Interfaces
│   │   │   └── services/        # Service implementations
│   │   ├── adapters/            # External integrations
│   │   │   ├── inbound/         # REST, WebSocket
│   │   │   └── outbound/        # Repositories, RabbitMQ
│   │   └── infrastructure/      # Config, DI
│   ├── static/                  # WebRTC frontend
│   ├── tests/                   # Tests
│   ├── main.py                  # Entry point
│   ├── requirements.txt
│   └── postman_collection.json
│
├── media-processing-service/
│   └── [Similar structure]
│
├── docker-compose.yml           # RabbitMQ
├── ARCHITECTURE.md              # Architecture documentation
├── SCENARIO.md                  # Test scenarios
└── README.md                    # This file
```

---

## 🎓 Learning Outcomes

This implementation demonstrates:

1. **Hexagonal Architecture** in practice
2. **Domain-Driven Design** patterns
3. **Event-Driven Architecture** with RabbitMQ
4. **Microservices** best practices
5. **REST API** design with OpenAPI
6. **WebSocket** for real-time updates
7. **Test-Driven Development**
8. **Clean Code** principles

---

## 📝 For Your Report

Use **ARCHITECTURE.md** as the foundation for your 3-page report. It includes:

- High-level architecture diagrams
- Interface descriptions (REST + Messages)
- DTO justifications
- Hexagonal architecture compliance
- Design decisions and trade-offs

---

## 🆘 Need Help?

**Quick Links:**
- Installation issues? → [QUICKSTART.md](QUICKSTART.md)
- How to test? → [SCENARIO.md](SCENARIO.md)
- Architecture questions? → [ARCHITECTURE.md](ARCHITECTURE.md)
- Full documentation? → [PODCASTHUB_README.md](PODCASTHUB_README.md)

**API Documentation:**
- http://localhost:8001/docs (Recording Service)
- http://localhost:8002/docs (Processing Service)

---

## 📈 Statistics

- **Lines of Code:** ~7,300
- **Files Created:** 99
- **Test Cases:** 15+
- **API Endpoints:** 16
- **Domain Events:** 15+
- **Documentation:** 5 comprehensive files

---

## 📜 License

MIT License - See [LICENSE.md](LICENSE.md)

---

## 🙏 Acknowledgments

- **Course:** CAS 735 - Microservice-Oriented Architecture
- **Institution:** McMaster University
- **Architecture Pattern:** Hexagonal Architecture by Alistair Cockburn
- **Design Principles:** Domain-Driven Design by Eric Evans

---

**Built with Hexagonal Architecture & Domain-Driven Design** 🎙️

**Ready for Phase 3 Integration & Phase 4 Deployment** 🚀
