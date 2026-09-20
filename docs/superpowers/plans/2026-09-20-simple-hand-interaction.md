# Simple Hand Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify camera hand control to MOVE (parallax + one-card snap/lock), PINCH click, and two-hand ZOOM only.

**Architecture:** Keep `HandInteractionEngine` + `HandSceneController` as the sole camera path. Emit `navStep` for discrete cards; keep `dragDelta` for parallax. Disable Gemini / legacy gesture machine from driving browse/open/zoom. Touch/mouse unchanged.

**Tech Stack:** TypeScript, MediaPipe Hands, Three.js carousel, Node test runner + esbuild bundle (existing `client/tests/*.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-20-simple-hand-interaction-design.md`

## Global Constraints

- Only MOVE / CLICK / ZOOM for camera basics — no Gemini for these
- Mirror camera X once in `HandCoordinateNormalizer`; `deltaX > 0` = RIGHT
- One card per snap; lock until hand slows
- Pinch: one click per close→open cycle (fire on release)
- Zoom: two hands; scale clamp 0.7–2.0; no carousel during zoom
- Pointer: landmark 8; hold ~200ms then fade

## File map

| File | Responsibility |
|------|----------------|
| `client/src/interaction/HandInteractionEngine.ts` | Priority, navStep+lock, pinch release click, zoom clamps |
| `client/src/interaction/HandSceneController.ts` | Parallax + `carousel.step(navStep)`; click; zoom |
| `client/src/ui/HandPointer.ts` | `POINTER_HOLD_MS = 200` |
| `client/src/ui/command.css` | Dot 5px, ring ~22px (already close) |
| `client/src/app/main.ts` | Disable Gemini intent for basic camera I/O |
| `client/tests/hand-engine.test.mjs` | Update + add navStep / zoom-no-nav tests |
| `client/tests/hand-pointer.test.mjs` | Hold timing at 200ms |

---

### Task 1: Engine — navStep + lock, pinch-on-release, zoom 0.7–2.0

**Files:**
- Modify: `client/src/interaction/HandInteractionEngine.ts`
- Test: `client/tests/hand-engine.test.mjs`

**Produces:**
- `HAND_CONFIG.MIN_ZOOM = 0.7`, `MAX_ZOOM = 2.0`
- `HAND_CONFIG.NAV_THRESHOLD`, `NAV_UNLOCK_SPEED`
- Result field `navStep: 0 | 1 | -1` (positive = RIGHT / next card index +1)
- No `DRAG` browse mode; pinch does not convert to drag
- `clickTarget` set once when pinch releases after a valid `PINCHED`

- [ ] **Step 1:** Extend `HAND_CONFIG` and `emptyResult` with nav fields; implement snap/lock and pinch-on-release; remove browse-DRAG / pinch→drag branches.
- [ ] **Step 2:** Update `hand-engine.test.mjs` for new semantics; add tests for 10 right/left navSteps, pinch release click, zoom with `navStep===0`.
- [ ] **Step 3:** Run `node --test client/tests/hand-engine.test.mjs` — all pass.

### Task 2: Scene controller wiring

**Files:**
- Modify: `client/src/interaction/HandSceneController.ts`

**Produces:** Home browsing uses `dragDelta` parallax via `beginHandDrag`/`dragHand` only while `navStep===0` and not locked mid-transition; on `navStep !== 0` call `carousel.step(navStep)` and end hand drag; ignore nav when `carousel.isAnimating` or zoom/pinch.

- [ ] **Step 1:** Rewrite process() gesture application for MOVE/CLICK/ZOOM priority.
- [ ] **Step 2:** Ensure pointer still driven every frame from tip 8.

### Task 3: Pointer hold + Gemini off

**Files:**
- Modify: `client/src/ui/HandPointer.ts` (`POINTER_HOLD_MS = 200`)
- Modify: `client/tests/hand-pointer.test.mjs`
- Modify: `client/src/app/main.ts` (remove/guard `aiBridge.requestIntent` in camera feed path)
- Modify: `client/src/ui/command.css` if sizes need tweak

- [ ] **Step 1:** Hold 200ms; update pointer tests.
- [ ] **Step 2:** Disable Gemini requests for basic interaction in `feedHand`.
- [ ] **Step 3:** Run pointer + hand-engine tests; `npm run build --prefix client`.

### Task 4: Commit + push

- [ ] Commit with message covering simplify MOVE/CLICK/ZOOM
- [ ] Push `origin main`
