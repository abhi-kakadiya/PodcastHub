# PodcastHub Frontend (Next.js + shadcn/ui)

## Overview

This is the Next.js frontend for PodcastHub, inspired by Riverside.fm's professional podcast recording interface.

## Technology Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: High-quality React components
- **Radix UI**: Accessible component primitives
- **Lucide Icons**: Beautiful icon library

## Features (Planned)

### Phase 1: Core Recording Interface
- [ ] Session management (create, join sessions)
- [ ] Multi-track recorder component
- [ ] Real-time recording status display
- [ ] Download recordings interface
- [ ] Pause/resume controls

### Phase 2: Collaboration
- [ ] WebRTC peer-to-peer streaming
- [ ] Multi-participant support
- [ ] Host/guest roles
- [ ] Live monitoring dashboard

### Phase 3: Advanced Features
- [ ] User authentication
- [ ] Team workspaces
- [ ] Recording library
- [ ] Export integrations
- [ ] Analytics dashboard

## Getting Started

### Installation

```bash
cd podcast-frontend
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build

```bash
npm run build
npm start
```

## Project Structure

```
podcast-frontend/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx          # Home page
│   │   ├── layout.tsx        # Root layout
│   │   ├── studio/           # Recording studio pages
│   │   │   └── [sessionId]/  # Dynamic session pages
│   │   └── api/              # API routes (if needed)
│   │
│   ├── components/           # React components
│   │   ├── ui/               # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── ...
│   │   ├── recorder/         # Recording components
│   │   │   ├── multi-track-recorder.tsx
│   │   │   ├── track-panel.tsx
│   │   │   ├── controls.tsx
│   │   │   └── download-modal.tsx
│   │   └── layout/           # Layout components
│   │       ├── header.tsx
│   │       └── sidebar.tsx
│   │
│   ├── lib/                  # Utility functions
│   │   ├── utils.ts          # General utilities
│   │   ├── recorder.ts       # Recording logic
│   │   └── indexeddb.ts      # IndexedDB wrapper
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── use-media-recorder.ts
│   │   ├── use-indexed-db.ts
│   │   └── use-session.ts
│   │
│   └── types/                # TypeScript types
│       ├── recording.ts
│       └── session.ts
│
├── public/                   # Static assets
├── tailwind.config.ts        # Tailwind configuration
├── tsconfig.json             # TypeScript configuration
└── next.config.js            # Next.js configuration
```

## Component Architecture

### Multi-Track Recorder Component

```typescript
<MultiTrackRecorder sessionId={sessionId}>
  <TrackPanel type="audio" />
  <TrackPanel type="video" />
  <TrackPanel type="screen" />
  <RecorderControls />
  <DownloadModal />
</MultiTrackRecorder>
```

### Key Components

1. **MultiTrackRecorder**: Main container with recording state
2. **TrackPanel**: Individual track display (audio/video/screen)
3. **RecorderControls**: Start/pause/resume/stop buttons
4. **DownloadModal**: Download interface for three files
5. **SessionManager**: Create/join session flow

## Integration with Backend

### API Endpoints

```typescript
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

export async function startRecording(data: StartRecordingRequest) {
  const response = await fetch(`${API_URL}/recordings/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
}
```

### Environment Variables

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8001/api
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws
```

## Styling with Tailwind + shadcn/ui

### Install shadcn/ui components

```bash
npx shadcn@latest init
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add avatar
```

### Custom Theme

Update `tailwind.config.ts` for Riverside-inspired dark theme:

```typescript
export default {
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#667eea",
          foreground: "#ffffff",
        },
      },
    },
  },
}
```

## Recording Logic

The recording logic is separated into:

1. **IndexedDB Storage** (`lib/indexeddb.ts`)
   - Store recordings metadata
   - Store chunks
   - Query recordings

2. **MediaRecorder Wrapper** (`lib/recorder.ts`)
   - Handle media capture
   - Manage MediaRecorder lifecycle
   - Process chunks

3. **Custom Hooks** (`hooks/use-media-recorder.ts`)
   - React integration
   - State management
   - Side effects handling

## Testing

```bash
# Run tests
npm test

# Run E2E tests (when added)
npm run test:e2e
```

## Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Roadmap

### Immediate (Phase 1)
- [ ] Set up basic Next.js structure
- [ ] Install shadcn/ui components
- [ ] Create MultiTrackRecorder component
- [ ] Integrate existing recorder-riverside.js logic
- [ ] Build download interface

### Short-term (Phase 2)
- [ ] Add WebRTC for real-time streaming
- [ ] Multi-participant support
- [ ] Host/guest role system
- [ ] Live monitoring dashboard

### Long-term (Phase 3)
- [ ] User authentication
- [ ] Team workspaces
- [ ] Recording library
- [ ] Processing status tracking
- [ ] Analytics and insights

## Current Status

**Status**: 🏗️ **SKELETON CREATED**

This is a basic skeleton structure. The working recorder is currently in:
- `media-recording-service/static/index-multitrack.html`
- `media-recording-service/static/recorder-riverside.js`

**Next Steps**:
1. Run `npm install` to install dependencies
2. Copy recording logic from `recorder-riverside.js` to React components
3. Add shadcn/ui components
4. Build session management
5. Implement WebRTC for collaboration

## Resources

- Next.js Docs: https://nextjs.org/docs
- shadcn/ui: https://ui.shadcn.com/
- Tailwind CSS: https://tailwindcss.com/
- WebRTC Guide: https://webrtc.org/getting-started/overview
- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

## License

MIT
