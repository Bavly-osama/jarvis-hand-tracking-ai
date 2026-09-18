# Holographic Hand-Tracking Interface

A cinematic, real-time holographic UI controlled entirely by hand gestures, built with Three.js, MediaPipe Hands, GSAP, Fastify, and Socket.IO.

---

## Quick Start

### 1. Backend

```bash
cd server
cp .env.example .env
# Edit .env: add your GEMINI_API_KEY (optional — interface works without it)
npm install
npm run dev
```

Server runs at `http://localhost:3001`

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Browser opens at `http://localhost:5173`

---

## Project Structure

```
holographic-ui/
├── client/          # Vite + TypeScript + Three.js frontend
│   └── src/
│       ├── app/          # Bootstrap
│       ├── three/        # Scene, Globe, Carousel, Shaders
│       ├── tracking/     # MediaPipe + One-Euro Filter
│       ├── gestures/     # State machine, confidence engine
│       ├── interaction/  # Gesture → scene bridge
│       ├── animation/    # Spring physics
│       ├── ui/           # Calibration, cursor
│       ├── debug/        # Debug overlay (backtick)
│       ├── audio/        # Synthetic Web Audio sounds
│       ├── websocket/    # Socket.IO client
│       └── ai/           # Gemini intent bridge
│
└── server/          # Fastify + Socket.IO + Gemini backend
    └── src/
        ├── ai/           # Gemini service
        ├── services/     # Session, gesture, config, prefs, telemetry
        ├── routes/       # REST API
        ├── websocket/    # Socket.IO gateway
        ├── middleware/   # Rate limiting, error handling
        └── tests/        # Jest test suites
```

---

## Gestures

| Gesture | Action |
|---------|--------|
| Horizontal swipe | Rotate carousel left / right |
| Closed fist + move | Grab and drag interface |
| Thumb + index pinch | Select active card |
| Two hands apart/together | Zoom Earth in / out |
| Index finger extended + move | Rotate Earth |
| Open hand hover near card | Magnetic card tilt |

---

## Controls

| Key | Action |
|-----|--------|
| `` ` `` (backtick) | Toggle debug overlay |

---

## Debug Overlay

Press `` ` `` to show real-time stats:
- FPS
- Active gesture + confidence
- Hand velocity
- Pinch distance
- Active card index
- WebSocket status
- AI intent + latency

---

## Environment Variables (server/.env)

```
PORT=3001
CORS_ORIGIN=http://localhost:5173
GEMINI_API_KEY=your_key_here        # Optional
GEMINI_MODEL=gemini-1.5-flash
RATE_LIMIT_MAX=200
LOG_LEVEL=info
NODE_ENV=development
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server + WebSocket + Gemini status |
| GET | `/api/config/gestures` | Gesture threshold config |
| POST | `/api/config/gestures` | Update gesture thresholds |
| GET | `/api/preferences/:sessionId` | User preferences |
| PUT | `/api/preferences/:sessionId` | Update preferences |

---

## WebSocket Events

| Direction | Event | Payload |
|-----------|-------|---------|
| → Server | `session:start` | `{ deviceType }` |
| ← Server | `session:ack` | `{ sessionId }` |
| → Server | `gesture:event` | `{ type, gesture, confidence, velocity, hand, duration, timestamp }` |
| → Server | `ai:request` | `{ recentGestures, activeObject, uiState, gestureConfidence, hand }` |
| ← Server | `ai:response` | `{ intent, confidence, reason }` |
| ← Server | `system:status` | `{ status, uptime, wsConnections }` |

---

## Textures (Optional)

Place NASA Blue Marble textures in `client/public/textures/`:
- `earth_day.jpg` — daytime surface
- `earth_night.jpg` — night lights
- `earth_clouds.jpg` — cloud layer

Without textures, the globe renders with a procedural blue sphere + atmosphere shader.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| 3D Rendering | Three.js + WebGL + UnrealBloom |
| Shaders | Custom GLSL (atmosphere, holographic glass, data arcs, hex grid) |
| Hand Tracking | MediaPipe Hands (30 FPS, local) |
| Landmark Filtering | One-Euro Filter |
| Animations | GSAP + custom spring physics |
| Gesture AI | Gemini 1.5 Flash (ambiguous gestures only) |
| Backend | Fastify + Socket.IO |
| Type Safety | TypeScript (strict mode) |
