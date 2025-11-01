# PodcastHub Deployment Guide (Free-Tier Friendly)

This document explains how to take the current **CAS-735 Project** codebase from a developer laptop to an internet-facing deployment that classmates, mentors, or evaluators can try without paying for infrastructure. The walkthrough assumes the repository layout that currently exists in the project root:

- `podcast-frontend/` – Next.js 14 UI
- `media-recording-service/` – FastAPI WebRTC/session API
- `media-processing-service/` – FastAPI processing control plane
- `docker-compose.yml` – Local orchestration (still useful for development)
- Supporting docs: `README.md`, `ARCHITECTURE.md`, `Scenario.md`

The production deployment replaces local Docker dependencies (PostgreSQL, RabbitMQ, MinIO, Redis) with hosted free tiers and pushes the three application services plus worker onto managed platforms.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 0 – Prepare the Repository](#step-0--prepare-the-repository)
3. [Step 1 – Provision Free Managed Dependencies](#step-1--provision-free-managed-dependencies)
4. [Step 2 – Configure Environment Variables](#step-2--configure-environment-variables)
5. [Step 3 – Deploy Backend Services on Render](#step-3--deploy-backend-services-on-render)
6. [Step 4 – Deploy the Frontend to Vercel](#step-4--deploy-the-frontend-to-vercel)
7. [Step 5 – Connect Domains & HTTPS](#step-5--connect-domains--https)
8. [Step 6 – Smoke Test the Platform](#step-6--smoke-test-the-platform)
9. [Estimated Cost & Upgrade Paths](#estimated-cost--upgrade-paths)

---

## Prerequisites

- GitHub account with this project pushed to a private or public repo.
- Basic command-line comfort (Git, Node.js 18+, Python 3.11+).
- Free accounts on:
  - [Render](https://render.com) – web services and background worker.
  - [Vercel](https://vercel.com) – frontend hosting.
  - [Neon](https://neon.tech) – PostgreSQL (or Supabase if you prefer a UI).
  - [CloudAMQP](https://www.cloudamqp.com) – managed RabbitMQ (Little Lemur tier).
  - [Upstash](https://upstash.com) – serverless Redis.
  - [Cloudflare R2](https://www.cloudflare.com/products/r2/) – S3-compatible object storage with a generous free tier (you only pay egress if you exceed limits).

> **Tip:** All services above have perpetual student-friendly free plans. They do require credit cards for anti-abuse, but you will not be charged unless usage exceeds free quotas.

---

## Step 0 – Prepare the Repository

1. Commit your latest local changes (including the refreshed hero preview and brand assets).
2. Push everything to GitHub.
3. Create production-ready environment files alongside the existing development ones. Do **not** commit actual secrets; instead, commit `.env.production.example` templates inside each service directory to document required keys.

Sample template for `media-recording-service/.env.production.example`:

```dotenv
ENVIRONMENT=production
DEBUG=False
HOST=0.0.0.0
PORT=8001

# RabbitMQ
RABBITMQ_URL=amqps://<user>:<password>@<host>/<vhost>
RABBITMQ_EXCHANGE=podcast_events

# Storage (Cloudflare R2 uses S3-compatible endpoints)
MINIO_ENDPOINT=<accountid>.r2.cloudflarestorage.com
MINIO_ACCESS_KEY=<r2-access-key-id>
MINIO_SECRET_KEY=<r2-secret>
MINIO_SECURE=True
MINIO_BUCKET=recordings

# Database (Neon)
POSTGRES_HOST=<neon-host>
POSTGRES_PORT=5432
POSTGRES_USER=<neon-user>
POSTGRES_PASSWORD=<neon-password>
POSTGRES_DATABASE=<neon-db>

# Redis (Upstash)
REDIS_URL=rediss://:password@<host>:<port>
```

Do the same for `media-processing-service` and the frontend, mirroring the variables discussed in later sections.

---

## Step 1 – Provision Free Managed Dependencies

Create each dependency before deploying app servers so you have connection strings ready.

### 1. PostgreSQL (Neon)
1. Sign in at [neon.tech](https://console.neon.tech).
2. Create a “Starter” project (free).
3. Inside the project, create a database named `podcasthub`.
4. Copy the **connection string** (e.g. `postgresql://user:pass@ep-neon-host/apidb`). You will split the components into host, user, password, database, port for the env vars.
5. (Optional) In the Neon dashboard, enable the connection pooling endpoint if you expect many connections.

### 2. RabbitMQ (CloudAMQP)
1. Create a CloudAMQP instance on the **Little Lemur** plan.
2. After provisioning, copy the AMQP URL (looks like `amqps://user:pass@host/vhost`). This becomes `RABBITMQ_URL` in both FastAPI services and the worker.

### 3. Redis (Upstash)
1. Create a new Redis database in Upstash.
2. Copy both the REST URL (if you need HTTP) and the `rediss://` URL. The code expects the standard URI, so set `REDIS_URL` (or whichever variable exists in your `.env`) to the provided `rediss://` string.

### 4. Object Storage (Cloudflare R2)
1. Enable the R2 service in your Cloudflare dashboard (free plan is fine).
2. Create a bucket named `recordings` (matching the default used in code).
3. Generate an **access key** and **secret** under “R2 > Manage R2 API Tokens” (choose permissions “Object Read & Write” for the `recordings` bucket).
4. Note the **S3 API hostname** – formatted as `<ACCOUNT_ID>.r2.cloudflarestorage.com`.
5. R2 is S3-compatible; when configuring the SDKs, set `MINIO_SECURE=True` so the clients connect via HTTPS.

### 5. Optional TURN server
The frontend already includes free Metered.ca credentials. Keep them unless you provision your own TURN infrastructure.

---

## Step 2 – Configure Environment Variables

Compile the connection secrets into the environment for each deploy target. The table below summarises what each component needs in production.

| Service | Required Variables | Notes |
|---------|-------------------|-------|
| **media-recording-service** | `ENVIRONMENT`, `DEBUG`, `HOST`, `PORT`,<br>`RABBITMQ_URL`, `RABBITMQ_EXCHANGE`,<br>`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_SECURE`, `MINIO_BUCKET`,<br>`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,<br>`REDIS_URL` | Update CORS origins with your Vercel/Render domains (`CORS_ORIGINS=["https://<frontend>.vercel.app"]`). |
| **media-processing-service** | `ENVIRONMENT`, `DEBUG`, `HOST`, `PORT`,<br>`RABBITMQ_URL`, `RABBITMQ_EXCHANGE`,<br>`CORS_ORIGINS`, plus any FFmpeg-related vars if you override defaults | This service mostly listens for processing requests; ensure CORS allows the frontend origin. |
| **media-processing-worker** (same repo as recording service) | Same RabbitMQ + R2 credentials as above, plus any temp storage config (`PROCESSING_TMP_DIR` if you add one). | Deploy as a background worker on Render. |
| **podcast-frontend** | `NEXT_PUBLIC_API_URL` (https://<recording-service>.onrender.com/api),<br>`NEXT_PUBLIC_WS_URL` (wss://<recording-service>.onrender.com/ws),<br>`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_DESCRIPTION`, TURN credentials | All `NEXT_PUBLIC_*` vars become part of the client bundle. Use `wss://` for the WebSocket URL so browsers keep TLS. |

Keep environment variables inside the hosting providers’ secret managers rather than committing real values to Git.

---

## Step 3 – Deploy Backend Services on Render

Render’s free tier provides 750 service hours/month—enough for two small web services and a background worker when they scale to zero on inactivity.

1. **Connect GitHub**  
   - In Render, click **New > Blueprint** if you want Infrastructure-as-Code, or **New > Web Service** for manual setup.  
   - Authorize Render to access your GitHub repo.

2. **Deploy `media-recording-service` (Web Service)**  
   - Service type: *Web Service*.  
   - Repository: select your repo.  
   - Root Directory: `media-recording-service`.  
   - Runtime: *Python*.  
   - Build Command: `pip install -r requirements.txt`.  
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port 8001`.  
   - Instance type: *Free*.  
   - Add Environment Variables from Step 2 (including Postgres, RabbitMQ, R2, Redis).  
   - Deploy. Render will issue a URL like `https://media-recording-service.onrender.com`. Note it for the frontend.

3. **Provision database connections**  
   - In the Render service dashboard, add a secret named `DATABASE_URL` if you prefer a single URI, or keep the individual env vars.  
   - Run the database migrations/initialization script if your service requires schema setup. (If migrations are not automated yet, SSH into the environment via Render Shell or run a temporary job that executes the SQL schema using the Neon connection.)

4. **Deploy `media-processing-service` (Web Service)**  
   - Repeat the steps above with Root Directory `media-processing-service`.  
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port 8002`.  
   - Only the RabbitMQ + R2 credentials and CORS origins are required (no Postgres/Redis unless referenced).

5. **Deploy `media-processing-worker` (Background Worker)**  
   - Service type: *Background Worker*.  
   - Root Directory: `media-recording-service` (the worker lives there).  
   - Build Command: `pip install -r requirements.txt`.  
   - Start Command: `python -m src.processors.media_processing_worker`.  
   - Use the same environment variables as the recording service.  
   - On Render’s free tier, workers scale to zero when idle, which keeps the process free. For long-running processing, upgrade later.

6. **Verify health**  
   - In the Render dashboard, open each service and confirm `/health` returns JSON `{"status": "healthy", ...}`.  
   - If the recording service cannot connect to Neon or R2, check the service logs and update firewall/SSL settings (Neon requires SSL mode `require`; Render’s `psycopg` driver handles it automatically when using the provided connection string).

---

## Step 4 – Deploy the Frontend to Vercel

1. Log into Vercel and click **New Project**.  
2. Import the same GitHub repo.  
3. When prompted for the framework, Vercel automatically detects Next.js.  
4. Set **Root Directory** to `podcast-frontend`.  
5. Define Environment Variables (Production):  
   - `NEXT_PUBLIC_API_URL=https://<your-recording-service>.onrender.com/api`  
   - `NEXT_PUBLIC_WS_URL=wss://<your-recording-service>.onrender.com/ws`  
   - `NEXT_PUBLIC_APP_NAME=PodcastHub` (or whatever branding you prefer)  
   - `NEXT_PUBLIC_APP_DESCRIPTION=Professional Podcast Recording Platform`  
   - TURN credentials if you keep the Metered defaults (they are safe as public values).  
6. Deploy. Vercel gives you a URL like `https://podcasthub.vercel.app`.  
7. After the build finishes, visit the URL and ensure the hero preview renders with the refreshed logo and the top-right buttons hit the Render backend (watch the browser console for network errors).

**Edge Cache Note:** Because the backend is on Render (US regions) and the frontend on Vercel (global edge), the latency is typically <200 ms. For even lower latency, consider moving the backend to Fly.io (closer to your users) later.

---

## Step 5 – Connect Domains & HTTPS

- Render and Vercel both issue free TLS certificates for their default subdomains.  
- To use a custom domain (e.g., `studio.yourname.dev`):
  1. Purchase/obtain the domain (Google Domains, Namecheap, or the free `.cloudns.net` domains if you truly need zero cost).
  2. Point the domain’s CNAME to the Vercel frontend. Vercel auto-provisions certificates.
  3. Optionally add subdomains for the APIs (e.g., `api.studio.yourname.dev`) pointing to the Render services. In Render, open the service → **Settings → Custom Domains** and follow the DNS instructions.

---

## Step 6 – Smoke Test the Platform

1. **API checks**
   - `curl https://<recording-service>.onrender.com/health`
   - `curl https://<media-processing-service>.onrender.com/health`
2. **Frontend checks**
   - Open the Vercel URL in two browser windows and verify the landing page loads the new logo and hero preview styling.
   - Click **Start a studio** to hit `/create`; ensure the API calls succeed (watch browser dev tools).
3. **WebRTC flow (quick test)**
   - Use Chrome’s *Guest window* mode or two devices.  
   - Create a room, join from the second window using the invite code.  
   - Start a short recording and stop it.  
   - In Cloudflare R2, confirm that objects appear under the `recordings/` prefix.  
   - In Render logs, verify the worker picks up the processing job without errors.
4. **Database sanity**
   - Connect to Neon via psql/Neon console and run a quick `SELECT * FROM recordings LIMIT 5;` to confirm metadata is being written.
5. **Monitoring**
   - Enable Render alerts (Settings → Notifications) so you receive email when deployments fail.  
   - CloudAMQP and Upstash provide dashboards to monitor usage spikes that could exhaust free quotas.

---

## Estimated Cost & Upgrade Paths

| Component | Provider | Free Quota | Upgrade Trigger |
|-----------|----------|------------|-----------------|
| Frontend | Vercel Hobby | 100 GB bandwidth/month | Heavy demo traffic |
| FastAPI services | Render Free | 750 instance hours + 500 MB RAM | Sustained usage without scale-to-zero |
| Worker | Render Free | Same as above | Long-running FFmpeg jobs |
| PostgreSQL | Neon Free | 3 GB storage | Larger catalogue of recordings |
| RabbitMQ | CloudAMQP Little Lemur | 1 M messages/month | Busy recording sessions |
| Redis | Upstash Free | 10K commands/day | High signalling churn |
| Storage | Cloudflare R2 | 10 GB storage + 1 GB egress/day | Many recordings delivered to guests |

When the project outgrows free plans, consider:
- Migrating services to [Fly.io](https://fly.io/) or [Railway](https://railway.app/) for more consistent performance.
- Moving storage to AWS S3 Standard and processing to AWS Lambda if you need autoscaling.
- Replacing CloudAMQP with self-managed RabbitMQ on a small VPS (e.g., Oracle Cloud Free Tier) if message throughput becomes a bottleneck.

---

## Final Checklist

- [ ] All Render services show “Healthy” status.
- [ ] Worker logs confirm jobs are processed without tracebacks.
- [ ] R2 bucket receives uploaded chunks and processed outputs.
- [ ] Vercel site loads with new logo/favicons, hero hover effect, and working CTAs.
- [ ] Invite-code recording workflow succeeds from two separate browsers.
- [ ] Documentation (`DEPLOYMENT.md`) committed so teammates can repeat the process.

Once the checklist passes, share the Vercel URL with your cohort—your PodcastHub instance is live on the open internet, powered entirely by free-tier infrastructure.

