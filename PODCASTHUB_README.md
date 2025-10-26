# PodcastHub: Distributed Podcast Recording and Production Platform

## Phase 2: Individual Service Implementation

**Student:** Abhi Kakadiya  
**Course:** CAS 735 - Microservice-Oriented Architecture  
**Services Implemented:**
1. Media Recording & Upload Service (Port 8001)
2. Media Processing Service (Port 8002)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technical Dependencies](#technical-dependencies)
- [Installation & Setup](#installation--setup)
- [Running the Services](#running-the-services)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Design Justifications](#design-justifications)

---

## Architecture Overview

Both services follow **Hexagonal Architecture** (Ports & Adapters Pattern) with clear separation of concerns:

### Hexagonal Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              INBOUND ADAPTERS (Driving)                      │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐        │
│  │   REST   │  │ WebSocket  │  │ RabbitMQ Consumer│        │
│  │   API    │  │  Handler   │  │   (Events In)    │        │
│  └────┬─────┘  └─────┬──────┘  └────────┬─────────┘        │
│       │              │                   │                   │
│       └──────────────┼───────────────────┘                   │
│                      ▼                                       │
│              ┌───────────────┐                               │
│              │ Inbound Ports │ (Interfaces)                  │
│              │  (Services)   │                               │
│              └───────┬───────┘                               │
│                      ▼                                       │
│         ┌────────────────────────┐                           │
│         │   DOMAIN CORE          │                           │
│         │  - Business Logic      │                           │
│         │  - Domain Models       │                           │
│         │  - Domain Events       │                           │
│         └────────────┬───────────┘                           │
│                      ▼                                       │
│              ┌────────────────┐                              │
│              │ Outbound Ports │ (Interfaces)                 │
│              └────────┬───────┘                              │
│                      ▼                                       │
│  ┌──────────────────────────────────────────────┐           │
│  │         OUTBOUND ADAPTERS (Driven)           │           │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐ │           │
│  │  │Repository│  │ RabbitMQ │  │  Storage   │ │           │
│  │  │(In-Mem)  │  │ Publisher│  │ (In-Memory)│ │           │
│  │  └──────────┘  └──────────┘  └────────────┘ │           │
│  └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Dependencies

### Required Software

- **Python**: 3.10 or higher
- **pip**: Latest version
- **Docker & Docker Compose**: For RabbitMQ
- **Modern Web Browser**: For WebRTC frontend (Chrome/Firefox recommended)

### Python Packages

See `requirements.txt` in each service directory.

---

## Installation & Setup

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd CAS-735-Project
```

### Step 2: Start RabbitMQ

```bash
docker-compose up -d
```

Verify RabbitMQ is running:
- AMQP: `localhost:5672`
- Management UI: `http://localhost:15672` (guest/guest)

### Step 3: Set Up Media Recording & Upload Service

```bash
cd media-recording-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
```

### Step 4: Set Up Media Processing Service

```bash
cd ../media-processing-service

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
```

---

## Running the Services

### Terminal 1 - Media Recording & Upload Service:
```bash
cd media-recording-service
source venv/bin/activate
python main.py
```
Service starts on: `http://localhost:8001`

### Terminal 2 - Media Processing Service:
```bash
cd media-processing-service
source venv/bin/activate
python main.py
```
Service starts on: `http://localhost:8002`

### Verify Services

**Recording Service:**
```bash
curl http://localhost:8001/health
```

**Processing Service:**
```bash
curl http://localhost:8002/health
```

### Access Web Interface

Open browser: `http://localhost:8001/static/index.html`

---

## Testing

### Running Unit Tests

**Media Recording & Upload Service:**
```bash
cd media-recording-service
pytest tests/ -v
```

**Media Processing Service:**
```bash
cd media-processing-service
pytest tests/ -v
```

### Using Postman

Import the Postman collections:
- `media-recording-service/postman_collection.json`
- `media-processing-service/postman_collection.json`

---

## Project Structure

### Media Recording & Upload Service

```
media-recording-service/
├── src/
│   ├── domain/              # Core business logic (NO dependencies)
│   │   ├── models/          # Recording, Chunk, Upload
│   │   ├── events/          # Domain events
│   │   └── exceptions/      # Domain exceptions
│   ├── application/         # Use cases & orchestration
│   │   ├── ports/
│   │   │   ├── inbound/     # Service interfaces
│   │   │   └── outbound/    # Repository/messaging interfaces
│   │   └── services/        # RecordingService, UploadService
│   ├── adapters/
│   │   ├── inbound/         # REST API, WebSocket
│   │   └── outbound/        # Repositories, RabbitMQ, Storage
│   └── infrastructure/      # Config, DI
├── static/                  # WebRTC frontend
├── tests/                   # Unit & integration tests
├── main.py                  # Application entry point
└── requirements.txt
```

---

## API Documentation

### Interactive API Docs

**Recording Service:**
- Swagger UI: `http://localhost:8001/docs`
- ReDoc: `http://localhost:8001/redoc`

**Processing Service:**
- Swagger UI: `http://localhost:8002/docs`
- ReDoc: `http://localhost:8002/redoc`

---

## Design Justifications

### Why Hexagonal Architecture?

1. **Testability**: Domain logic can be tested without infrastructure
2. **Independence**: Business rules don't depend on frameworks
3. **Flexibility**: Easy to replace adapters
4. **Clarity**: Clear separation between business logic and technical details

### Why In-Memory Storage?

Per Phase 2 requirements: "Are NOT expected to have any persistence layer or real database"

### Why RabbitMQ?

- **Event-Driven Architecture**: Services communicate via events
- **Loose Coupling**: Services don't need to know about each other
- **Scalability**: Asynchronous processing

### Why WebRTC?

- **Local Recording**: High-quality capture without server load
- **Browser Support**: No plugins required
- **Real-time**: Low latency for interactive podcasting

---

## License

MIT License

---

## Contact

**Abhi Kakadiya**

