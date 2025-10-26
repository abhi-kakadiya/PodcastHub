# New Implementation Plan: Riverside.fm-Style Architecture

## 🎯 Core Requirements

1. **WebRTC Streaming**: Real-time A/V streaming between participants in session
2. **Host Control**: Only host can start/stop recording, guests get notified
3. **Riverside Layout**: Clean, professional UI similar to Riverside.fm
4. **Upload Visibility**: All participants see chunk upload progress for everyone
5. **Shadcn UI**: Modern, dark theme, simple design
6. **Room Persistence**: Warn before leaving if recording/uploading active

---

## 🏗️ Architecture Design

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│  HOST creates room → Gets room link                          │
│  GUEST joins via room link                                   │
│  WebRTC establishes peer connections (live streaming)        │
│  Each participant sees/hears others in real-time             │
│  HOST clicks "Start Recording"                               │
│    → All participants notified                               │
│    → Each records locally (MediaRecorder)                    │
│    → Each uploads chunks independently                       │
│    → Upload progress visible to all via WebSocket            │
│  HOST clicks "Stop Recording"                                │
│    → All participants stop recording                         │
│  Anyone tries to leave → Warning if recording/uploading      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📱 Frontend Architecture (NEW)

### Technology Stack

- **Framework**: Next.js 14 (App Router)
- **UI Library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS (dark theme)
- **WebRTC**: Simple Peer or native RTCPeerConnection
- **State**: Zustand (lightweight state management)
- **WebSocket**: Socket.io-client
- **Icons**: Lucide React

### Page Structure

```
app/
├── page.tsx                 → Landing page (create/join room)
├── room/[roomId]/
│   └── page.tsx            → Room page (main interface)
├── components/
│   ├── ui/                 → Shadcn components
│   ├── VideoGrid.tsx       → Participant video grid
│   ├── ControlPanel.tsx    → Recording controls (host only)
│   ├── UploadIndicator.tsx → Chunk upload progress
│   └── ParticipantCard.tsx → Individual participant view
└── lib/
    ├── webrtc.ts          → WebRTC peer management
    ├── recorder.ts        → Local recording logic
    └── socket.ts          → WebSocket connection
```

### UI Layout (Riverside-style)

```
┌─────────────────────────────────────────────────────────────┐
│  PodcastHub                                    [Room: ABC123]│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │                      │  │                      │        │
│  │   Host Video         │  │   Guest 1 Video      │        │
│  │   Alice              │  │   Bob                │        │
│  │   🟢 ████░░░ 75%    │  │   🟢 ████░░░ 73%    │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                               │
│  ┌──────────────────────┐                                   │
│  │   Guest 2 Video      │                                   │
│  │   Charlie            │                                   │
│  │   🟢 ████░░░ 80%    │                                   │
│  └──────────────────────┘                                   │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  [🎙️ Mute] [📹 Camera] [⏺️ Start Recording] [🚪 Leave]    │
│                                                               │
│  ⏱️ 00:05:32  |  🔴 Recording  |  📦 12/12 chunks uploaded  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Backend Architecture (ENHANCED)

### Changes to Existing Services

#### Recording Service - Add Session Management

```python
# New endpoints
POST   /api/sessions/create        → Host creates room
POST   /api/sessions/{id}/join     → Guest joins room
GET    /api/sessions/{id}          → Get session state
POST   /api/sessions/{id}/start-recording    → Host starts (broadcasts to all)
POST   /api/sessions/{id}/stop-recording     → Host stops (broadcasts to all)
DELETE /api/sessions/{id}/leave    → Participant leaves

# WebSocket events
session.participant_joined
session.participant_left
session.recording_started
session.recording_stopped
chunk.uploaded (broadcast to all)
```

#### Session Domain Model

```python
@dataclass
class Session:
    session_id: UUID
    room_id: str
    host_participant_id: str
    participants: List[Participant]
    status: SessionStatus  # WAITING, RECORDING, STOPPED
    created_at: datetime

@dataclass
class Participant:
    participant_id: str
    user_name: str
    role: ParticipantRole  # HOST, GUEST
    recording_id: Optional[UUID]
    upload_progress: float  # 0.0 to 100.0
    is_connected: bool
```

---

## 🌐 WebRTC Implementation

### Simple Peer-to-Peer Mesh (For Small Groups)

**For 2-4 participants:**
- Each peer connects to every other peer (full mesh)
- Host acts as signaling coordinator
- Uses WebSocket for signaling (offer/answer/ICE)

```typescript
// Simplified WebRTC flow
class WebRTCManager {
  private peers: Map<string, RTCPeerConnection> = new Map();

  async addPeer(participantId: string) {
    const peer = new RTCPeerConnection(config);

    // Add local stream
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });

    // Handle remote stream
    peer.ontrack = (event) => {
      setRemoteStream(participantId, event.streams[0]);
    };

    this.peers.set(participantId, peer);
  }
}
```

### Signaling via WebSocket

```typescript
// Frontend sends
socket.emit('webrtc-offer', { to: participantId, offer });

// Backend broadcasts
socket.to(participantId).emit('webrtc-offer', { from: senderId, offer });
```

---

## 📊 Real-Time State Synchronization

### WebSocket Events

```typescript
// Client → Server
'session:join' → { roomId, userName }
'recording:chunk-uploaded' → { chunkId, sequence, progress }
'webrtc:offer' → { to, offer }
'webrtc:answer' → { to, answer }
'webrtc:ice-candidate' → { to, candidate }

// Server → Client
'session:state' → { session, participants }
'session:participant-joined' → { participant }
'session:recording-started' → { by: hostId }
'recording:chunk-progress' → { participantId, progress }
'webrtc:offer' → { from, offer }
```

---

## 🎨 Shadcn UI Components to Use

### Core Components

```typescript
// Layout
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

// Notifications
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"

// Dialogs
import { AlertDialog } from "@/components/ui/alert-dialog"
```

### Dark Theme Config

```typescript
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      background: "hsl(224, 71%, 4%)",
      foreground: "hsl(213, 31%, 91%)",
      primary: "hsl(210, 40%, 98%)",
      accent: "hsl(216, 34%, 17%)",
    }
  }
}
```

---

## 🔐 Role-Based Access Control

### Simple Implementation

```typescript
// Frontend
const isHost = participant.role === 'HOST';

{isHost && (
  <Button onClick={startRecording}>
    Start Recording
  </Button>
)}

// Backend
@router.post("/sessions/{session_id}/start-recording")
async def start_recording(session_id: str, participant_id: str):
    session = await get_session(session_id)
    if session.host_participant_id != participant_id:
        raise HTTPException(403, "Only host can start recording")

    # Broadcast to all participants
    await broadcast_event("recording_started", session_id)
```

---

## 📦 Chunk Upload Progress Indicators

### Visual Design

```tsx
<ParticipantCard participant={participant}>
  <Avatar>
    <video srcObject={participant.stream} />
  </Avatar>

  <div className="flex items-center gap-2">
    <span>{participant.name}</span>
    {participant.isRecording && (
      <Badge variant="destructive">
        <RecordIcon className="mr-1" />
        Recording
      </Badge>
    )}
  </div>

  {participant.uploadProgress > 0 && (
    <div className="space-y-1">
      <Progress value={participant.uploadProgress} />
      <p className="text-xs text-muted-foreground">
        {Math.round(participant.uploadProgress)}% uploaded
      </p>
    </div>
  )}
</ParticipantCard>
```

### Real-Time Updates

```typescript
// When chunk uploads successfully
socket.emit('chunk:uploaded', {
  participantId,
  chunkSequence,
  totalChunks,
  progress: (chunkSequence / totalChunks) * 100
});

// All clients receive and update UI
socket.on('chunk:progress', ({ participantId, progress }) => {
  updateParticipantProgress(participantId, progress);
});
```

---

## ⚠️ Leave Warnings & Persistence

### Browser Warning

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isRecording || isUploading) {
      e.preventDefault();
      e.returnValue = 'Recording is in progress. Are you sure you want to leave?';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [isRecording, isUploading]);
```

### Leave Button Confirmation

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Leave Room</Button>
  </AlertDialogTrigger>

  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Leave Recording Session?</AlertDialogTitle>
      <AlertDialogDescription>
        {isRecording && "Recording is in progress. "}
        {isUploading && `${uploadProgress}% of chunks are still uploading. `}
        Are you sure you want to leave?
      </AlertDialogDescription>
    </AlertDialogHeader>

    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleLeave}>
        Leave Anyway
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 📁 Project Structure

```
CAS-735-Project/
├── frontend/                          # NEW Next.js app
│   ├── app/
│   │   ├── page.tsx                  # Landing page
│   │   └── room/[roomId]/page.tsx    # Room page
│   ├── components/
│   │   ├── ui/                       # Shadcn components
│   │   ├── VideoGrid.tsx
│   │   ├── ControlPanel.tsx
│   │   └── ParticipantCard.tsx
│   ├── lib/
│   │   ├── webrtc.ts
│   │   ├── recorder.ts
│   │   └── socket.ts
│   └── package.json
│
├── media-recording-service/           # ENHANCED
│   ├── src/
│   │   ├── domain/
│   │   │   └── session.py            # NEW: Session domain
│   │   ├── application/
│   │   │   └── session_service.py    # NEW: Session logic
│   │   └── adapters/
│   │       ├── inbound/
│   │       │   ├── session_api.py    # NEW: Session endpoints
│   │       │   └── websocket_handler.py  # ENHANCED
│   │       └── outbound/
│   │           └── session_repository.py
│   └── main.py
│
├── media-processing-service/          # Same
└── docker-compose.yml
```

---

## 🚀 Implementation Steps

### Phase 1: Backend Session Management (Day 1)
1. Create Session domain model
2. Add SessionService with CRUD operations
3. Add session API endpoints
4. Enhance WebSocket handler for broadcasting

### Phase 2: Frontend Setup (Day 1-2)
1. Initialize Next.js with shadcn
2. Create landing page (create/join room)
3. Setup WebSocket connection
4. Create room page shell

### Phase 3: WebRTC Integration (Day 2-3)
1. Implement peer connection manager
2. Add signaling via WebSocket
3. Create video grid component
4. Test with 2 participants

### Phase 4: Recording & Upload (Day 3-4)
1. Integrate existing recorder logic
2. Add upload progress tracking
3. Implement real-time progress updates
4. Add host control restrictions

### Phase 5: UI Polish (Day 4-5)
1. Implement dark theme
2. Add all shadcn components
3. Create leave warnings
4. Add upload indicators
5. Test full flow

---

## ✅ Success Criteria

- [ ] Host can create room, guests can join with link
- [ ] WebRTC streaming works between all participants
- [ ] Only host sees "Start Recording" button
- [ ] All participants notified when recording starts
- [ ] Each participant records locally + uploads chunks
- [ ] Everyone sees upload progress for all participants
- [ ] Warnings before leaving during recording/upload
- [ ] UI matches Riverside.fm style (dark, clean, simple)
- [ ] All buttons visible but not oversized

---

## 🎯 Key Simplifications

1. **Mesh Network**: For 2-4 participants, simple peer-to-peer
2. **No SFU**: Avoid complex media servers for now
3. **Local Recording**: Each records their own track (best quality)
4. **WebSocket Only**: No complex message queue for real-time
5. **In-Memory Sessions**: For Phase 2, can add Redis later
6. **Simple Roles**: Just HOST and GUEST, no permissions matrix

---

This is a **complete rewrite of the frontend** with **enhancements to the backend**.

Should I proceed with this implementation?
