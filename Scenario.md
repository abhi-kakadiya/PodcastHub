# PodcastHub Scenario Narrative

> A storytelling walkthrough that links user experience to the microservice, domain, and event-driven concepts implemented in this project.

---

## 1. Characters

- **Asha (Host & Producer)** – coordinates the “Tech Tones” podcast and expects studio-quality output without manual file wrangling.
- **Miguel (Guest)** – joins from a different city and wants a simple, reliable guest experience.
- **PodcastHub Platform** – the ensemble of microservices (Recording Service, Processing Worker, Processing Service, Frontend) deployed via Docker Compose.

---

## 2. Before the Session

1. Asha launches the PodcastHub web app (`podcast-frontend` container).  
2. She clicks **Create Session**: the browser calls `POST /api/sessions/create`.  
3. Inside the **Media Recording Service**, the `RecordingService` use case instantiates a `Recording` aggregate, persists it (PostgreSQL), and emits a `session.created` event (RabbitMQ topic).  
4. The UI displays the generated six-character room code – already proving the value of the recording domain model.

---

## 3. Going Live

1. Miguel navigates to the join page, enters the room code.  
2. WebSocket signalling (`/ws/{session}`) negotiates the WebRTC connection between host and guest; this is the **inbound adapter** for real-time communication in our hexagon.  
3. MediaRecorders spin up on both browsers, each buffering 5-second `.webm` chunks.  
4. Asha hits **Start Recording**. The REST endpoint triggers the `RecordingService.start_recording` use case, which sets the aggregate state to `RECORDING` and publishes `recording.started`.

---

## 4. Chunk Upload Loop

Every five seconds:

1. Each browser POSTs to `/api/uploads/chunk` with multipart form-data (chunk bytes, sequence, checksum).  
2. The `UploadService` validates SHA-256 checksum, writes metadata via the `ChunkRepositoryPort`, and streams bytes to MinIO via the `StoragePort` adapter.  
3. Successful writes raise `chunk.uploaded`; when all expected chunks arrive the service emits `upload.completed`.  
4. In PostgreSQL, the `Upload` aggregate tracks progress, ensuring the UI can poll `/api/uploads/recording/{id}/progress` for live feedback.

This loop demonstrates **hexagonal structure** (REST adapter → application service → domain aggregate → storage/event ports) and **resilient storage** (MinIO for immutable chunks).

---

## 5. Handing Off to Processing

1. Asha presses **Stop Recording**; the aggregate transitions to `STOPPED`.  
2. The UI calls `POST /api/uploads/recording/{recordingId}/enqueue-processing`.  
3. The Recording Service compiles the ordered chunk list, session metadata, and track type into a JSON payload and pushes it to RabbitMQ queue `media.processing.requests` – fulfilling the **microservice choreography** contract.

---

## 6. Background Stitching & Events

1. The **Media Processing Worker** (same codebase, different entrypoint) consumes from the queue.  
2. For each payload it downloads chunks from MinIO, writes a concat manifest, and runs `ffmpeg -f concat -c copy`.  
3. The stitched file is uploaded to `sessions/{session}/recordings/{recording}/processed/`.  
4. The worker emits `recording.processed` on the RabbitMQ exchange with metadata (MinIO path, size, track type).  
5. Any interested consumers – including the UI via polling – can react. This is the **event-driven architecture** in action.

---

## 7. After the Session

1. The frontend polls for the processed status; once complete it surfaces a download link for Asha.  
2. Because events are durable, even if the worker or API restarts, no work is lost. Additional microservices (e.g., transcription) could subscribe to `recording.processed` without modifying existing code.

---

## 8. Key Takeaways for Reviewers

- The scenario underscores how **microservices** divide responsibilities: ingest, process, orchestrate, present.  
- **Domain-driven aggregates** ensure business rules (e.g., upload completion) live near the data that enforces them.  
- **Hexagonal adapters** keep us flexible: swapping MinIO for S3 or RabbitMQ for another broker only touches adapter implementations.  
- **Event-driven messaging** turns heavy FFmpeg work into an asynchronous pipeline that can scale horizontally.

By following this story during your presentation, both classmates and faculty can easily map user actions to the architectural patterns implemented throughout the project.
