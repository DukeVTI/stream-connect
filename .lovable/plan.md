

# LiveKit Livestreaming Feature — Full Implementation Outline

This is a comprehensive outline of **everything** required to add LiveKit-powered livestreaming to your platform. This is a large feature spanning database, backend, frontend, and external infrastructure.

---

## Prerequisites (You Do Outside Lovable)

Before any code is written, you need a self-hosted LiveKit server running:

1. **Provision a VPS** (e.g., Hetzner, DigitalOcean — 2+ cores, 4GB+ RAM, high bandwidth)
2. **Install LiveKit** via Docker on that server
3. **Open ports**: TCP 7880 (signaling), TCP 7881 (RPC), UDP 50000-60000 (media)
4. **Set up a domain** with SSL (e.g., `live.yourdomain.com`) pointing to the VPS
5. **Generate an API key + secret** in the LiveKit config
6. **Provide those credentials** — we'll store them as secrets (LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL) for use in backend functions

---

## Phase 1: Database Schema

### New Tables

**`live_sessions`** — tracks each livestream session
- `id` (uuid, PK)
- `channel_id` (uuid, FK → channels)
- `creator_id` (uuid, not null)
- `title` (text)
- `status` (text: 'live', 'ended') default 'live'
- `livekit_room_name` (text, unique) — the LiveKit room identifier
- `viewer_count` (integer, default 0)
- `started_at` (timestamptz, default now())
- `ended_at` (timestamptz, nullable)
- RLS: everyone can SELECT; only creator can INSERT/UPDATE their own sessions

**`live_messages`** — chat messages during a live session
- `id` (uuid, PK)
- `session_id` (uuid, FK → live_sessions)
- `user_id` (uuid, not null)
- `body` (text)
- `created_at` (timestamptz, default now())
- RLS: everyone can SELECT; authenticated users can INSERT their own
- **Realtime enabled** via `ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages`

### Schema Changes to Existing Tables

- Add `is_live` (boolean, default false) column to **`channels`** table — quick flag for UI badges

---

## Phase 2: Backend Functions (Edge Functions)

### Edge Function 1: `livekit-token`
Generates a LiveKit JWT token for a participant to join a room.

- **Input**: `roomName`, `participantName`, `isPublisher` (boolean)
- **Auth**: Requires authenticated user (JWT validation in code)
- **Logic**:
  - Uses LIVEKIT_API_KEY + LIVEKIT_API_SECRET to sign a LiveKit access token
  - Sets `canPublish: true` only if the user is the session creator
  - Sets `canSubscribe: true` for viewers
  - Returns the signed token
- **Uses**: `livekit-server-sdk` (Deno-compatible) or manual JWT signing

### Edge Function 2: `livekit-webhook` (optional, for later)
Receives LiveKit server webhooks for events like "participant joined", "room closed".

- Updates `viewer_count` on `live_sessions`
- Auto-sets `status = 'ended'` when the publisher disconnects

---

## Phase 3: Frontend — New Pages & Components

### 3a. "Go Live" Flow (Creator Side)

**Location**: New "Go Live" button on the Creator Dashboard (`/dashboard`)

- Creator selects a channel and enters a stream title
- On click: creates a `live_sessions` row, sets `channels.is_live = true`
- Calls the `livekit-token` edge function to get a publisher token
- Navigates to `/live/:sessionId`

### 3b. Live Streaming Page (`/live/:sessionId`)

**New page** with two modes — publisher (creator) and subscriber (viewer):

**Publisher view:**
- Connects to LiveKit room with publish permissions
- Shows local camera/screen preview
- Controls: toggle camera, toggle mic, share screen, end stream
- Live chat panel on the side
- Viewer count display

**Viewer view:**
- Connects to LiveKit room with subscribe-only permissions
- Renders the remote video/audio track from the publisher
- Live chat panel on the side
- Shows stream title, channel info, viewer count

**Components to build:**
- `LiveStreamPlayer` — renders the LiveKit video track
- `LiveStreamControls` — camera/mic/screen toggles for publisher
- `LiveChat` — real-time chat using database realtime subscriptions on `live_messages`
- `LiveBadge` — "LIVE" indicator badge component

### 3c. Discovery (Home Page / Channel Page)

- **Home page**: show currently live channels at the top (query `channels` where `is_live = true`)
- **Channel page**: if channel is live, show a prominent "Watch Live" banner linking to the active session
- **Content cards / sidebar**: show a red "LIVE" badge on channels that are currently streaming

### 3d. Routing

- Add `/live/:sessionId` route to `App.tsx`
- Protected: requires authentication to chat, but viewing could be open

---

## Phase 4: NPM Dependencies

- `livekit-client` — LiveKit browser SDK for connecting to rooms
- `@livekit/components-react` — pre-built React components (VideoTrack, AudioTrack, etc.)

---

## Phase 5: End Stream Cleanup

When the creator clicks "End Stream":
1. Disconnect from the LiveKit room
2. Update `live_sessions` → `status = 'ended'`, `ended_at = now()`
3. Update `channels` → `is_live = false`
4. Viewers see a "Stream has ended" message

---

## Summary of All Deliverables

| Area | Work Items |
|------|-----------|
| **Secrets** | LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL |
| **Database** | `live_sessions` table, `live_messages` table (realtime), `is_live` column on channels |
| **Edge Functions** | `livekit-token` (token generation) |
| **Pages** | `/live/:sessionId` (stream + chat page) |
| **Components** | LiveStreamPlayer, LiveStreamControls, LiveChat, LiveBadge |
| **Dashboard** | "Go Live" button + channel/title selector dialog |
| **Home/Channel** | Live channel discovery, "Watch Live" banners, LIVE badges |
| **Dependencies** | `livekit-client`, `@livekit/components-react` |
| **Routing** | New `/live/:sessionId` route in App.tsx |

This is a substantial feature. The recommended build order is: **Database → Secrets → Edge Function → Go Live flow → Stream page → Chat → Discovery UI**.

