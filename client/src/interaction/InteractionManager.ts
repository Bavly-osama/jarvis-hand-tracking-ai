import * as THREE from 'three';
import { CarouselController } from '../three/CarouselController';
import { GlobeController } from '../three/GlobeController';
import { GestureState } from '../gestures/GestureStateMachine';
import { ConfidenceData } from '../gestures/GestureConfidenceEngine';
import { AudioEventSystem } from '../audio/AudioEventSystem';
import { GestureData } from '../gestures/GestureRecognizer';
import { ExperienceController } from '../experiences/ExperienceController';
import { FingertipCursor } from '../ui/FingertipCursor';

/** Routes recognizer output; handles pinch hysteresis, swipe navigation, grab physics, and exit gestures. */
export class InteractionManager {
  private pinchActive = false;
  private pinchStartedHome = false;
  private dwell = 0;
  private dwellConsumed = false;
  private lastPoint = new THREE.Vector2();
  private hasPoint = false;
  private wasGrabbing = false;

  constructor(
    private carousel: CarouselController,
    private globe: GlobeController,
    private audio: AudioEventSystem,
    private experiences: ExperienceController,
    private cursor?: FingertipCursor
  ) {}

  update(
    state: GestureState,
    primary: GestureData | null,
    secondary: GestureData | null,
    _time: number,
    dt: number
  ) {
    if (!primary) {
      this.onTrackingLost();
      return;
    }

    dt = Math.min(dt, 0.05);
    const speed = Math.hypot(primary.smoothedVel.x, primary.smoothedVel.y);
    const pinched = primary.isPinching;
    const neutral = !pinched && !primary.isFist && speed < 0.12 && !secondary;

    this.experiences.observeNeutral(neutral, dt);
    this.experiences.pointer(primary.pinchMidpoint.x, primary.pinchMidpoint.y);

    // ── Pinch Interaction ──────────────────────────────────────────────────
    if (primary.pinchEdge === 'start') {
      this.pinchActive = true;
      this.pinchStartedHome = this.experiences.isHome;
      this.cursor?.pulse();
      this.audio.playPinchStart();

      if (this.experiences.isHome) {
        this.experiences.press();
      } else {
        // Check if user is hovering back button inside an experience
        if (this.experiences.isHoveringBack(primary.pinchMidpoint.x, primary.pinchMidpoint.y)) {
          this.experiences.close();
        } else {
          this.experiences.activate();
        }
      }
    } else if (primary.pinchEdge === 'release') {
      if (this.pinchActive && this.pinchStartedHome && this.experiences.isHome) {
        this.experiences.activate();
      }
      this.pinchActive = false;
      this.pinchStartedHome = false;
    }

    // ── Cancel / Return Gesture (Downward swipe or CANCELING state) ────────
    if (state === GestureState.CANCELING || (this.experiences.active && primary.swipeVelocityY > 0.45 && !primary.isFist)) {
      this.experiences.close();
      return;
    }

    // ── Swipe Navigation (1 Swipe = 1 Card) ────────────────────────────────
    if (
      (state === GestureState.SWIPING_LEFT || state === GestureState.SWIPING_RIGHT) &&
      !pinched &&
      !primary.isFist &&
      primary.isSwipeHorizontal &&
      Math.abs(primary.swipeVelocityX) > 0.30
    ) {
      // Swipe direction: positive = rightward hand flick
      this.experiences.swipe(primary.swipeVelocityX);
      this.cursor?.pulse();
    }

    // ── Two-Hand Zoom ──────────────────────────────────────────────────────
    if (secondary && state === GestureState.ZOOMING && primary.twoHandDistance !== undefined) {
      this.experiences.zoom(1 + (primary.twoHandDistance - 0.35) * 4.5);
    }

    // ── Grab & Rotate (Direct 1:1 Physics) ──────────────────────────────────
    const isGrabbing = (state === GestureState.GRABBING && primary.isFist) ||
                       (state === GestureState.ROTATING && primary.indexExtended);

    if (isGrabbing) {
      this.wasGrabbing = true;
      const dx = primary.smoothedVel.x * dt * 2.2;
      const dy = primary.smoothedVel.y * dt * 2.2;
      if (this.experiences.isHome) {
        this.globe.directRotate(dx, dy);
      } else {
        this.experiences.rotate(dx, dy);
      }
    } else if (this.wasGrabbing) {
      // Grab released: transfer momentum as natural decay inertia
      this.wasGrabbing = false;
      if (this.experiences.isHome) {
        this.globe.releaseInertia(primary.smoothedVel.x, primary.smoothedVel.y);
      }
    }

    // ── Card Hover & Dwell Selection (Home Mode) ───────────────────────────
    if (this.experiences.isHome) {
      const active = this.carousel.getActiveCard();
      const isHovering = primary.indexExtended || pinched || primary.isOpen;
      this.carousel.setHover(isHovering ? active : -1);

      if (primary.indexExtended) {
        const card = this.carousel.getCards()[active];
        card.applyMagneticTilt(
          new THREE.Vector3((primary.pinchMidpoint.x - 0.5) * 8, (0.5 - primary.pinchMidpoint.y) * 6, 5),
          card.group.position,
          0.4
        );
      }

      // Dwell progress calculation
      const point = new THREE.Vector2(primary.pinchMidpoint.x, primary.pinchMidpoint.y);
      const stationary = this.hasPoint && point.distanceTo(this.lastPoint) < 0.02;

      if (primary.indexExtended && !pinched && stationary && speed < 0.12 && !this.carousel.isAnimating) {
        this.dwell += dt;
        const progress = Math.min(1, this.dwell / 0.9);
        this.cursor?.setDwellProgress(progress);

        if (this.dwell > 0.9 && !this.dwellConsumed) {
          this.dwellConsumed = true;
          this.cursor?.pulse();
          this.cursor?.setDwellProgress(0);
          this.experiences.activate();
        }
      } else {
        this.dwell = 0;
        this.cursor?.setDwellProgress(0);
        if (!primary.indexExtended) {
          this.dwellConsumed = false;
        }
      }

      this.lastPoint.copy(point);
      this.hasPoint = true;
    }
  }

  handleConfirmedGesture(_data: ConfidenceData) {}

  onTrackingLost() {
    this.pinchActive = false;
    this.pinchStartedHome = false;
    this.dwell = 0;
    this.hasPoint = false;
    this.wasGrabbing = false;
    this.cursor?.setDwellProgress(0);
    this.experiences.requireNeutral();
    this.carousel.setHover(-1);
    this.globe.resetInertia();
  }
}
