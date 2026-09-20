# Aim & Pop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans (or implement tasks directly when user asked to implement).

**Goal:** Camera practice mini-game (aim + pinch) + clearer camera errors.

**Architecture:** DOM overlay game (`AimPopPractice` + `AimPopOverlay`) driven by existing `HandTracker` / `HandInteractionEngine` frames. Practice mode suppresses carousel actions until "Enter Orbit".

### Task 1: Game model + tests
- Create `client/src/experiences/AimPopPractice.ts`
- Unit test: spawn, hit radius, score/combo, miss resets combo

### Task 2: Overlay UI
- Create `client/src/ui/AimPopOverlay.ts` + CSS in `command.css`
- Score HUD, targets as DOM nodes, HAND OK badge, action buttons

### Task 3: Wire camera → practice → Orbit
- `main.ts`: on CAMERA_READY show Aim & Pop; pinch hits practice targets; Enter Orbit enables carousel path
- Suppress carousel click/drag while practice active

### Task 4: Camera hardening
- `HandTracker`: throw `MEDIAPIPE_MISSING` / `INSECURE_CONTEXT`
- `CameraStateOverlay` + `main.ts` catch new errors with clear copy

### Task 5: Verify + push
- Unit tests + quick smoke; commit + push to GitHub
