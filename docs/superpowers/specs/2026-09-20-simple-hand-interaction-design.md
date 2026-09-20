# Simple Hand Interaction — MOVE / CLICK / ZOOM

**Date:** 2026-09-20  
**Status:** Draft for review  
**Approach:** Simplify in place (`HandInteractionEngine` + `HandSceneController`)  
**Carousel feel:** Continuous parallax + one-card snap + lock (option A)

## Goal

Make camera control understandable in seconds using only:

1. **MOVE** left / right  
2. **CLICK** (pinch)  
3. **ZOOM** (two hands)

No Gemini for these actions. No grab, fist, complex pose trees, or multi-card swipes.

## Non-goals

- Adding new gesture types  
- Rewriting the whole tracking stack as a parallel controller  
- Keeping Air Tap if unreliable (disable if it fights pinch)  
- Using Gemini / remote AI for navigate / select / zoom

## Architecture

```
MediaPipe Hands
  → HandCoordinateNormalizer (mirror once)
  → HandInteractionEngine  (priority: ZOOM > PINCH > MOVE)
  → HandSceneController    (parallax, snap, click, zoom → scene)
  → HandPointer            (landmark 8 DOM tip, always when tracked)
```

Legacy `GestureRecognizer` / `GestureStateMachine` / `GeminiIntentBridge` paths in camera mode must not drive carousel, open, or zoom. Touch/mouse path stays unchanged.

## Coordinate system

- Mirror camera coordinates **once** in `HandCoordinateNormalizer`.  
- After that: `deltaX > 0` → RIGHT, `deltaX < 0` → LEFT.  
- Do not invert X anywhere else (carousel, swipe helpers, Gemini, etc.).

## MOVE (one hand)

While home / browsing:

1. **Parallax:** map small palm/hand `deltaX` into light carousel offset (existing drag feel, reduced if needed).  
2. **Snap:** when accumulated intentional `|deltaX|` (or velocity-gated displacement) crosses `NAV_THRESHOLD`, emit **exactly one** card step in that direction.  
3. **Lock:** after a snap, ignore further nav until hand speed drops below `NAV_UNLOCK_SPEED` (and optional short cooldown).  
4. Never skip multiple cards from one continuous motion while locked.

Priority blocks:

- Two hands → no MOVE  
- Pinch active → no MOVE  
- Card transition running → no MOVE  

## CLICK (pinch)

- Landmarks: thumb tip (4) + index tip (8).  
- States: `OPEN` → `PINCH_CANDIDATE` → `PINCHED` → release → **one** `clickTarget`.  
- Fire on **release** after a valid close (or confirmed press+release), not while held closed.  
- Target = forgiving hit-test under index tip at press time (HitPad padding).  
- Pointer over GAME + pinch → open GAME; same for EARTH / other cards.

Air Tap: keep only if already stable and does not double-fire with pinch; otherwise disable in the simplified path.

## ZOOM (two hands)

- On second hand appear: capture `startDistance`, `startScale`.  
- Scale = clamp(`startScale * (currentDistance / startDistance)`, `0.7`, `2.0`).  
- Smooth toward target (`ZOOM_SMOOTH`). No jump on engage.  
- While two hands: disable carousel MOVE entirely.

## Pointer

- Always driven by index tip (landmark 8) whenever landmarks exist.  
- Independent of gesture mode (MOVE / PINCH / ZOOM).  
- Visual: center dot 4–6px, outer ring 20–24px; no large hand mesh for control.  
- Brief loss: hold last position ~150–250ms, then soft fade.  
- Adaptive smoothing: more when slow, less when fast.

## Priority

```
if handCount >= 2 → ZOOM
else if pinch active → CLICK (no nav)
else → MOVE (parallax + snap)
```

## Mobile / performance

- Prefer DOM/CSS pointer.  
- Reduced MediaPipe resolution on mobile profiles.  
- No full skeleton for interaction.  
- No Gemini calls for MOVE/CLICK/ZOOM.  
- If FPS drops, degrade Three.js effects before dropping hand control.

## Files (expected touch set)

| File | Change |
|------|--------|
| `HandInteractionEngine.ts` | Snap+lock nav signals; strip drag-as-nav multi-step; pinch one-shot; zoom limits 0.7–2.0 |
| `HandSceneController.ts` | Apply parallax + `navigate(±1)` once; honor locks; pinch open; zoom only |
| `HandPointer.ts` + CSS | Size + hold timing 150–250ms |
| `main.ts` | Stop Gemini / old gesture machine from driving basic I/O in camera mode |
| `CarouselController` / `NavigationState` | Support one-step navigate + transition lock if missing |
| Tests | Direction, one-card snap, pinch one-shot, zoom no-jump / no-nav |

## Acceptance tests

1. Move right 10 times → 10 right card steps (no left, no multi-skip).  
2. Move left 10 times → 10 left card steps.  
3. Pinch 20 times on different cards → one pinch = one open.  
4. Zoom in/out 10 times → correct direction, no scale jump, no carousel moves during zoom.

## Open defaults (tunable constants)

| Constant | Default |
|----------|---------|
| `NAV_THRESHOLD` | ~0.12 logical X (tune) |
| `NAV_UNLOCK_SPEED` | low palm speed after snap |
| `POINTER_HOLD_MS` | 200 |
| `minScale` / `maxScale` | 0.7 / 2.0 |
| Pinch down / release ratios | keep current hysteresis unless flaky |
