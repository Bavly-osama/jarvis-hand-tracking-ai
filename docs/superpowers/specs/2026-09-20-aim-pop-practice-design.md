# Aim & Pop practice mode

Date: 2026-09-20

## Problem
Camera hand-tracking often fails or feels too hard for first use (carousel + pinch). Users need a plain game-like on-ramp that proves the camera works and trains move + pinch.

## Solution
After a successful camera start, enter **Aim & Pop** practice mode before the full Orbit carousel.

### Gameplay
- Small DOM pointer follows index tip
- Circular targets spawn in screen space
- Move tip onto a target + pinch → pop, +score, combo
- HUD: SCORE · COMBO · HAND OK (stable tracking)
- Actions: Play again · Enter Orbit · Mouse mode

### Camera hardening
- Detect missing MediaPipe (`Hands` undefined) with explicit error
- Map secure-context / permission / busy / not-found clearly
- Retry restarts tracker without full reload

### Non-goals
- No Gemini/backend changes
- No Orbit redesign; practice is an overlay on-ramp

## Success
- Camera errors are actionable
- First hand detection shows pointer and HAND OK
- Pinch pops a target and increments score
- Enter Orbit returns to existing carousel interaction
