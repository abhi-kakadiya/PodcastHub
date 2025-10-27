# Project Commit Story

The following narrative captures how a student could have iteratively developed the PodcastHub platform. Each entry lists the staged files and the commit message that describes the milestone.

| Step | `git add` Selection | Commit Message | Summary |
| --- | --- | --- | --- |
| 1 | `README.md`, `.gitignore`, `docker-compose.yml` | `chore: scaffold workspace and compose infra` | Initial repository setup with documentation shell and base infrastructure services (RabbitMQ, MinIO, Postgres, Redis). |
| 2 | `media-recording-service/src/domain`, `requirements.txt` | `feat(recording): model core aggregates` | Introduced domain models (`Recording`, `Chunk`, `Upload`) and ports to enforce DDD boundaries. |
| 3 | `media-recording-service/src/application`, `.../rest/*.py` | `feat(recording): add REST endpoints for sessions and recordings` | Implemented FastAPI routers for session management, recording lifecycle, and upload initiation. |
| 4 | `media-recording-service/src/adapters/outbound/storage`, `.../minio_storage.py` | `feat(storage): integrate MinIO chunk persistence` | Added adapter to stream chunk bytes to MinIO and capture metadata. |
| 5 | `media-recording-service/src/adapters/inbound/http/upload_routes.py`, `static/recorder-riverside.js` | `feat(upload): wire chunk ingestion from browser` | Created simplified HTTP routes for chunk uploads from the prototype UI. |
| 6 | `media-recording-service/src/adapters/outbound/messaging`, `RabbitMQEventPublisher` | `feat(events): publish upload lifecycle events` | Enabled event-driven notifications for chunk/upload milestones via RabbitMQ. |
| 7 | `podcast-frontend/src/*`, `package.json` | `feat(frontend): scaffold Next.js UI with host/guest flows` | Delivered the user-facing application with create/join meeting screens and WebRTC setup. |
| 8 | `media-processing-service/src/*` | `feat(processing-api): expose processing controls` | Added FastAPI service to monitor processing jobs and provide administrative endpoints. |
| 9 | `media-recording-service/src/processors/media_processing_worker.py`, `src/infrastructure/messaging/processing_queue.py` | `feat(worker): background FFmpeg stitching pipeline` | Implemented worker that consumes queue commands, stitches chunks using FFmpeg, and emits `recording.processed`. |
| 10 | `media-recording-service/src/adapters/inbound/http/upload_routes.py` | `feat(upload): enqueue processing command after uploads` | Added endpoint to push processing jobs onto RabbitMQ queue. |
| 11 | `podcast-frontend/Dockerfile`, `media-recording-service/Dockerfile`, `media-processing-service/Dockerfile` | `build: containerise services with ffmpeg support` | Authored Dockerfiles and `.dockerignore` for reproducible deployments. |
| 12 | `ARCHITECTURE.md`, `Scenario.md`, `EndToEndReport.md` | `docs: document architecture, scenario, and e2e report` | Final writing pass documenting architectural decisions, user scenario, and course report. |
| 13 | `ProjectCommitHistory.md`, Postman collections | `docs: capture commit story and API collections` | Added this commit history narrative plus Postman scripts for both services. |

### Tips for Oral Defence
- Highlight how each commit builds upon the previous one (domain → adapters → infrastructure → UI).
- Emphasise the decision to reuse the recording service image for the worker (commit 9) to reinforce Hexagonal Architecture.
- Reference documentation commits when discussing course alignment.
