# Quick Start Guide - PodcastHub Services

## 5-Minute Setup

### 1. Prerequisites Check
```bash
python --version  # Should be 3.10+
docker --version  # Should be installed
```

### 2. Start RabbitMQ
```bash
cd /home/user/CAS-735-Project
docker-compose up -d
```

### 3. Setup & Run Recording Service
```bash
cd media-recording-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```
**Service running at: http://localhost:8001**

### 4. Setup & Run Processing Service (New Terminal)
```bash
cd media-processing-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```
**Service running at: http://localhost:8002**

### 5. Test It!

**Option A: Web Interface**
- Open: http://localhost:8001/static/index.html
- Enter session ID and participant ID
- Click "Start Recording"
- Allow microphone access
- Speak for 10-15 seconds
- Click "Stop Recording"
- Watch chunks upload automatically!

**Option B: API Documentation**
- Recording Service: http://localhost:8001/docs
- Processing Service: http://localhost:8002/docs
- Try the interactive API playground

**Option C: Quick API Test**
```bash
# Start a recording
curl -X POST "http://localhost:8001/api/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test_123", "participant_id": "user_456", "media_type": "audio"}'

# Check health
curl http://localhost:8001/health
curl http://localhost:8002/health
```

### 6. Run Tests
```bash
# Recording Service
cd media-recording-service
pytest tests/ -v

# Processing Service
cd media-processing-service
pytest tests/ -v
```

### 7. View RabbitMQ Management
- Open: http://localhost:15672
- Login: guest/guest
- See events being published in real-time!

---

## What You've Just Built

✅ **2 Microservices** following Hexagonal Architecture
✅ **REST APIs** with OpenAPI documentation
✅ **WebSocket** for real-time updates
✅ **RabbitMQ** for event-driven communication
✅ **WebRTC Frontend** for media capture
✅ **Domain-Driven Design** with aggregates and events
✅ **Comprehensive Tests** with pytest
✅ **Postman Collections** for API testing

---

## Next Steps

1. **Explore the Code:**
   - Check `src/domain/` for business logic
   - Check `src/application/` for use cases
   - Check `src/adapters/` for technical implementations

2. **Read Documentation:**
   - `PODCASTHUB_README.md` - Full documentation
   - `SCENARIO.md` - Test scenarios
   - `ARCHITECTURE.md` - Architecture details

3. **Experiment:**
   - Modify domain rules
   - Add new API endpoints
   - Implement real audio processing
   - Add database persistence

4. **Integration (Phase 3):**
   - Connect with Suleyman's Session Management Service
   - Subscribe to session events
   - Implement cross-service workflows

---

## Troubleshooting

**RabbitMQ not starting?**
```bash
docker-compose down
docker-compose up -d
```

**Port already in use?**
Edit `.env` file and change `PORT=8001` to another port.

**Dependencies not installing?**
```bash
pip install --upgrade pip
pip install -r requirements.txt --force-reinstall
```

**Tests failing?**
Make sure RabbitMQ is running:
```bash
docker-compose ps
```

---

## Architecture at a Glance

```
┌─────────────────┐        ┌──────────────────┐
│   Web Browser   │◄──────►│ Recording Service│
│   (WebRTC)      │        │   (Port 8001)    │
└─────────────────┘        └────────┬─────────┘
                                    │
                                    │ Events
                                    ▼
┌─────────────────┐        ┌──────────────────┐
│    RabbitMQ     │◄──────►│Processing Service│
│   (Port 5672)   │        │   (Port 8002)    │
└─────────────────┘        └──────────────────┘
```

**Flow:**
1. User records in browser (WebRTC)
2. Chunks upload to Recording Service (REST API)
3. Events published to RabbitMQ
4. Processing Service consumes events
5. Processes and outputs final podcast

---

## Resources

- **FastAPI Docs**: https://fastapi.tiangolo.com
- **RabbitMQ Tutorial**: https://www.rabbitmq.com/getstarted.html
- **Hexagonal Architecture**: https://alistair.cockburn.us/hexagonal-architecture/
- **Domain-Driven Design**: https://martinfowler.com/bliki/DomainDrivenDesign.html

---

**Enjoy building microservices! 🎙️🚀**
