import * as THREE from 'three';
import { ExperienceController } from '../experiences/ExperienceController';
import { SceneManager }           from '../three/SceneManager';
import { GlobeController }        from '../three/GlobeController';
import { CarouselController }     from '../three/CarouselController';
import { HandTracker }            from '../tracking/HandTracker';
import { GestureRecognizer }      from '../gestures/GestureRecognizer';
import { GestureStateMachine,
         GestureState }           from '../gestures/GestureStateMachine';
import { GestureConfidenceEngine } from '../gestures/GestureConfidenceEngine';
import { InteractionManager }     from '../interaction/InteractionManager';
import { PointerTouchController } from '../interaction/PointerTouchController';
import { FingertipCursor }        from '../ui/FingertipCursor';
import { DebugOverlay }           from '../debug/DebugOverlay';
import { SocketClient }           from '../websocket/SocketClient';
import { GeminiIntentBridge }     from '../ai/GeminiIntentBridge';
import { AudioEventSystem }       from '../audio/AudioEventSystem';
import { GestureData }            from '../gestures/GestureRecognizer';
import { PhysicsController }      from '../animation/PhysicsController';
import { CameraStateOverlay }     from '../ui/CameraStateOverlay';
import { GestureCoachmarks }      from '../ui/GestureCoachmarks';
import { ClientGestureFeatureExtractor } from '../gestures/GestureFeatureExtractor';

// ─── Gesture pipeline thresholds ────────────────────────────────────────────

const SWIPE_THRESH    = 0.30;  // normalized comfortable wrist velocity
const TWO_HAND_ZOOM   = 0.05;  // min delta distance to enter ZOOM

// Smoothed twoHandDistance for zoom baseline
let twoHandBaseline: number | null = null;
let twoHandSmoothed: number = 0.35;
let currentZoom: number = 1.0;

async function bootstrap() {
  // ── DOM elements ─────────────────────────────────────────────────────────
  const container = document.getElementById('app-container');
  if (!container) throw new Error('Missing #app-container');
  const video = document.getElementById('input_video') as HTMLVideoElement;
  if (!video) throw new Error('Missing #input_video');

  const btnModeCamera = document.getElementById('btn-mode-camera') as HTMLButtonElement;
  const btnModeTouch  = document.getElementById('btn-mode-touch') as HTMLButtonElement;
  const statusBar     = document.getElementById('status-bar') as HTMLDivElement;

  const btnPrev   = document.getElementById('btn-prev') as HTMLButtonElement;
  const btnNext   = document.getElementById('btn-next') as HTMLButtonElement;
  const btnSelect = document.getElementById('btn-select') as HTMLButtonElement;
  const btnZoom   = document.getElementById('btn-zoom') as HTMLButtonElement;

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene    = new SceneManager(container);
  const globe    = new GlobeController();
  const carousel = new CarouselController();
  const cursor   = new FingertipCursor(scene.scene);

  scene.scene.add(globe.group);
  scene.scene.add(carousel.group);

  // ── Services ──────────────────────────────────────────────────────────────
  const audio    = new AudioEventSystem();
  const socket   = new SocketClient();
  const aiBridge = new GeminiIntentBridge(socket);
  socket.connect();

  // ── Interaction ───────────────────────────────────────────────────────────
  const experiences = new ExperienceController(scene, carousel, globe, audio);
  const interaction = new InteractionManager(carousel, globe, audio, experiences, cursor);

  // ── Gesture pipeline ──────────────────────────────────────────────────────
  const tracker          = new HandTracker();
  const recognizerL      = new GestureRecognizer();   // left hand
  const recognizerR      = new GestureRecognizer();   // right hand
  const stateMachine     = new GestureStateMachine();
  const confidenceEngine = new GestureConfidenceEngine();

  // ── Pointer / Touch Controller (No-Camera Mode) ──────────────────────────
  const pointerController = new PointerTouchController(
    container,
    scene,
    carousel,
    globe,
    cursor,
    audio,
    stateMachine,
    experiences
  );

  const modalSelect    = document.getElementById('modal-mode-select');
  const modalBtnCamera = document.getElementById('modal-btn-camera');
  const modalBtnPc     = document.getElementById('modal-btn-pc');
  const toastEl        = document.getElementById('holo-notification');

  function showToast(message: string, durationMs: number = 4000) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.style.display = 'block';
    setTimeout(() => {
      if (toastEl) toastEl.style.display = 'none';
    }, durationMs);
  }

  // ── Debug & UI Overlays ───────────────────────────────────────────────────
  const debug          = new DebugOverlay();
  const cameraOverlay  = new CameraStateOverlay();
  const coachmarks     = new GestureCoachmarks();

  cameraOverlay.setCallbacks(
    () => enableTouchMode('SWITCHED TO MOUSE & TOUCH MODE'),
    () => enableCameraMode()
  );

  let isCameraMode = false;

  // ── Mode Switching ────────────────────────────────────────────────────────

  function enableTouchMode(reasonMessage?: string) {
    isCameraMode = false;
    interaction.onTrackingLost();
    tracker.stop();
    coachmarks.hide();
    cameraOverlay.hide();
    pointerController.enable();

    if (btnModeTouch && btnModeCamera) {
      btnModeTouch.classList.add('active');
      btnModeCamera.classList.remove('active');
    }

    if (statusBar) {
      statusBar.textContent = reasonMessage || 'HOLOGRAPHIC INTERFACE · MOUSE & TOUCH MODE ACTIVE';
    }

    cursor.show();
    audio.playCardSelect();
  }

  function enableCameraMode() {
    isCameraMode = true;
    interaction.onTrackingLost();
    pointerController.disable();

    if (btnModeTouch && btnModeCamera) {
      btnModeCamera.classList.add('active');
      btnModeTouch.classList.remove('active');
    }

    if (statusBar) {
      statusBar.textContent = 'HOLOGRAPHIC INTERFACE · CAMERA HAND TRACKING ACTIVE';
    }

    cameraOverlay.setState('CAMERA_LOADING', 'Initializing vision system and neural detector...');

    tracker.start(video)
      .then(() => {
        cameraOverlay.setState('CAMERA_READY');
        audio.playTrackingRestored();
        coachmarks.showTip('onboarding_start', '✋', 'RAISE YOUR HAND TO BEGIN INTERACTING', 4000);
      })
      .catch((err: any) => {
        console.warn('[Camera] Failed to start:', err.message || err);
        if (err.message === 'CAMERA_DENIED') {
          cameraOverlay.setState('CAMERA_DENIED');
        } else if (err.message === 'CAMERA_BUSY') {
          cameraOverlay.setState('CAMERA_ERROR', 'Webcam is in use by another app. Close it and retry, or use Touch mode.');
        } else if (err.message === 'CAMERA_NOT_FOUND') {
          cameraOverlay.setState('CAMERA_ERROR', 'No camera was detected on this device.');
        } else {
          cameraOverlay.setState('CAMERA_ERROR', 'Failed to connect to camera.');
        }
      });
  }

  // ── Startup Modal Selection Buttons ──────────────────────────────────────
  if (modalBtnCamera) {
    modalBtnCamera.addEventListener('click', () => {
      if (modalSelect) modalSelect.classList.add('hidden');
      enableCameraMode();
    });
  }

  if (modalBtnPc) {
    modalBtnPc.addEventListener('click', () => {
      if (modalSelect) modalSelect.classList.add('hidden');
      enableTouchMode();
    });
  }

  // Top Bar Mode Switcher Buttons
  if (btnModeCamera) {
    btnModeCamera.addEventListener('click', () => {
      if (modalSelect) modalSelect.classList.add('hidden');
      enableCameraMode();
    });
  }

  if (btnModeTouch) {
    btnModeTouch.addEventListener('click', () => {
      if (modalSelect) modalSelect.classList.add('hidden');
      enableTouchMode();
    });
  }

  // ── On-Screen Action Buttons ─────────────────────────────────────────────
  if (btnPrev) {
    btnPrev.addEventListener('click', () => pointerController.prevModule());
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => pointerController.nextModule());
  }
  if (btnSelect) {
    btnSelect.addEventListener('click', () => pointerController.selectCurrent());
  }
  if (btnZoom) {
    btnZoom.addEventListener('click', () => pointerController.toggleZoom());
  }

  // ── AI Intent Integration & Telemetry ────────────────────────────────────
  let stateVersion = 1;
  const gestureHistory: { gesture: string; time: number }[] = [];

  function recordGesture(gestureName: string) {
    const now = Date.now();
    gestureHistory.push({ gesture: gestureName, time: now });
    while (gestureHistory.length > 0 && now - gestureHistory[0].time > 2000) {
      gestureHistory.shift();
    }
  }

  // Register AI response handler
  socket.onAIResponse((resp) => {
    aiBridge.handleResponse(resp, stateMachine, experiences, stateVersion);
  });

  // Attach debug telemetry callback to overlay
  aiBridge.setDebugCallback((telemetry) => {
    debug.update('aiIntent', telemetry.aiIntent);
    debug.update('aiConf', telemetry.confidence.toFixed(2));
    debug.update('latency', `${telemetry.latencyMs}ms`);
    debug.update('final', telemetry.final);
  });

  stateMachine.onEnter(GestureState.GRABBING, () => audio.playGrabStart());

  // ── Tracking loop ─────────────────────────────────────────────────────────
  let lastInteractionTimestamp = 0;
  let lastTrackTime = performance.now();
  let trackFrameCount = 0;
  let trackFpsTimer = 0;
  let currentTrackFps = 30;

  tracker.onUpdate((multiHandLandmarks, timestamp, handedness) => {
    if (!isCameraMode) return;

    // Calculate tracking FPS
    const now = performance.now();
    const dtTrack = (now - lastTrackTime) / 1000;
    lastTrackTime = now;
    trackFrameCount++;
    trackFpsTimer += dtTrack;
    if (trackFpsTimer >= 0.5) {
      currentTrackFps = Math.round(trackFrameCount / trackFpsTimer);
      trackFrameCount = 0;
      trackFpsTimer = 0;
      debug.update('trackingFps', currentTrackFps.toString());
    }

    const hasHand = multiHandLandmarks.length > 0;

    if (!hasHand) {
      twoHandBaseline = null;
      coachmarks.showEdgeWarning(false);
      if (stateMachine.getState() !== GestureState.IDLE) {
        stateMachine.forceTransition(GestureState.IDLE);
        confidenceEngine.reset();
        recognizerR.reset();
        recognizerL.reset();
        interaction.onTrackingLost();
        cursor.hide();
        debug.update('gesture', 'IDLE (no hand)');
      }
      return;
    }

    // Primary hand (index 0)
    const primaryLandmarks   = multiHandLandmarks[0];
    const secondaryLandmarks = multiHandLandmarks.length > 1 ? multiHandLandmarks[1] : null;
    const primaryHandedness  = (handedness[0] || 'RIGHT').toUpperCase();
    const secondaryHandedness = (handedness[1] || 'LEFT').toUpperCase();

    // Check camera edge boundaries
    const centerLm = primaryLandmarks[9]; // middle MCP
    const isNearEdge = centerLm.x < 0.08 || centerLm.x > 0.92 || centerLm.y < 0.08 || centerLm.y > 0.92;
    coachmarks.showEdgeWarning(isNearEdge);

    const secondCenter = secondaryLandmarks ? secondaryLandmarks[9] : undefined;
    const primaryData  = recognizerR.recognize(primaryLandmarks, timestamp, primaryHandedness, secondCenter);
    const secondData   = secondaryLandmarks
      ? recognizerL.recognize(secondaryLandmarks, timestamp, secondaryHandedness, primaryLandmarks[9])
      : null;

    // ── Update fingertip cursor ────────────────────────────────────────────
    const tip = primaryLandmarks[8]; // index fingertip
    cursor.updatePosition(
      (tip.x - 0.5) * 10,
      -(tip.y - 0.5) * 7,
      5 - tip.z * 8
    );

    // ── Classify gesture → state machine ──────────────────────────────────
    let nextState   = GestureState.TRACKING;
    let confidence  = 0.5;
    let velocity    = 0;

    if (secondaryLandmarks && primaryData.twoHandDistance !== undefined) {
      if (twoHandBaseline === null) {
        twoHandBaseline = primaryData.twoHandDistance;
        twoHandSmoothed = primaryData.twoHandDistance;
      }
      twoHandSmoothed = PhysicsController.lerp(twoHandSmoothed, primaryData.twoHandDistance, 0.25);
      const delta = twoHandSmoothed - twoHandBaseline;

      if (Math.abs(delta) > TWO_HAND_ZOOM) {
        nextState  = GestureState.ZOOMING;
        confidence = Math.min(0.95, 0.75 + Math.abs(delta) * 2);
        velocity   = delta;
        currentZoom = THREE.MathUtils.clamp(1.0 + delta * 3.5, 0.6, 2.2);
        experiences.zoom(currentZoom);
      }
    } else {
      twoHandBaseline = null;
    }

    if (nextState !== GestureState.ZOOMING) {
      if (primaryData.isFist) {
        nextState  = GestureState.GRABBING;
        confidence = 0.88;
      } else if (primaryData.isPinching) {
        nextState  = GestureState.PINCHING;
        confidence = PhysicsController.remap(primaryData.pinchDistance, 0.16, 0, 0.8, 0.98);
        coachmarks.completeTip('pinch_hint');
      } else if (experiences.active && primaryData.swipeVelocityY > 0.45 && !primaryData.isFist) {
        nextState  = GestureState.CANCELING;
        confidence = 0.85;
      } else if (primaryData.isSwipeHorizontal && Math.abs(primaryData.swipeVelocityX) > SWIPE_THRESH) {
        nextState  = primaryData.swipeVelocityX > 0
          ? GestureState.SWIPING_RIGHT
          : GestureState.SWIPING_LEFT;
        confidence = Math.min(0.95, PhysicsController.remap(
          Math.abs(primaryData.swipeVelocityX), SWIPE_THRESH, 1.2, 0.75, 0.95
        ));
        velocity   = primaryData.swipeVelocityX;
        coachmarks.completeTip('onboarding_start');
      } else if (primaryData.indexExtended) {
        const speed = Math.hypot(primaryData.smoothedVel.x, primaryData.smoothedVel.y);
        if (speed > 0.005) {
          nextState  = GestureState.ROTATING;
          confidence = Math.min(0.92, 0.7 + speed * 20);
          velocity   = speed;
        } else {
          nextState  = GestureState.POINTING;
          confidence = 0.80;
        }
      } else if (primaryData.isOpen) {
        nextState  = GestureState.HOVER;
        confidence = 0.75;
      }
    }

    // Dynamic coachmark guidance
    if (experiences.isHome) {
      coachmarks.showTip('onboarding_start', '↔', 'SWIPE LEFT OR RIGHT TO BROWSE MODULES', 6000);
      if (carousel.getActiveCard() >= 0 && (primaryData.indexExtended || primaryData.isOpen)) {
        coachmarks.showTip('pinch_hint', '🤌', 'PINCH THUMB & INDEX TO OPEN MODULE', 4000);
      }
    } else {
      coachmarks.showTip('module_hint', '👈', 'PINCH [← BACK] OR SWIPE DOWN TO RETURN', 5000);
    }

    // Feed to confidence engine (hysteresis)
    const confirmed = confidenceEngine.update(nextState, confidence, Math.abs(velocity), timestamp);

    if (confirmed) {
      const prevState = stateMachine.getState();
      stateMachine.transition(nextState);
      if (stateMachine.getState() !== prevState) {
        stateVersion++;
      }
    } else if (
      nextState === GestureState.TRACKING &&
      stateMachine.getState() !== GestureState.IDLE
    ) {
      stateMachine.transition(GestureState.TRACKING);
    }

    // Record gesture in rolling 2-second history
    recordGesture(stateMachine.getStateName());

    const inputDelta = lastInteractionTimestamp ? Math.min(timestamp - lastInteractionTimestamp, 0.05) : 1 / 60;
    lastInteractionTimestamp = timestamp;
    interaction.update(stateMachine.getState(), primaryData, secondData, timestamp, inputDelta);

    // AI intent reasoning for ambiguous gestures (confidence 0.55 - 0.82)
    const ambiguous = confidenceEngine.getAmbiguous();
    const isAmbiguous = ambiguous.length > 0 || (confidence >= 0.55 && confidence < 0.82);

    if (isAmbiguous) {
      const semanticFeatures = ClientGestureFeatureExtractor.extract(
        primaryData,
        stateMachine.getStateDuration()
      );
      const recent = gestureHistory.map((h) => h.gesture);

      aiBridge.requestIntent({
        requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        gestureId: `g-${Date.now()}`,
        stateVersion: stateVersion,
        recentGestures: recent.length > 0 ? recent.slice(-5) : [stateMachine.getStateName()],
        activeObject: experiences.isHome ? 'CAROUSEL' : experiences.name,
        uiState: experiences.isHome ? 'MAIN_CAROUSEL' : experiences.state.state,
        gestureConfidence: confirmed?.confidence ?? confidence,
        hand: primaryHandedness,
        semanticFeatures: semanticFeatures,
      });
    }

    if (confirmed && confirmed.confidence > 0.82) {
      socket.sendGestureEvent({
        type:       'GESTURE',
        gesture:    confirmed.gesture_name,
        confidence: confirmed.confidence,
        velocity:   confirmed.velocity,
        hand:       primaryHandedness,
        duration:   confirmed.duration,
        timestamp:  timestamp
      });
    }

    // ── Debug overlay telemetry ───────────────────────────────────────────
    debug.update('hand',       primaryHandedness);
    debug.update('gesture',    stateMachine.getStateName());
    debug.update('confidence', (confirmed?.confidence ?? confidence).toFixed(2));
    debug.update('velocity',   primaryData.swipeVelocityX.toFixed(3));
    debug.update('pinch',      primaryData.pinchDistance.toFixed(3));
    debug.update('activeCard', experiences.isHome ? carousel.getActiveCard().toString() : experiences.name);
    debug.update('socket',     socket.isConnected() ? 'connected' : 'offline');
    debug.update('zoom',       currentZoom.toFixed(2));
  });

  // Default: start with pointer interaction enabled while awaiting mode selection
  pointerController.enable();

  // Tab blur / focus safety
  window.addEventListener('blur', () => {
    interaction.onTrackingLost();
    recognizerR.reset();
    recognizerL.reset();
  });

  // ── Render loop (60 FPS) ──────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let   frameCount = 0;
  let   fpsTimer   = 0;
  let   lastFPS    = 60;

  function renderLoop() {
    requestAnimationFrame(renderLoop);
    const delta   = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    frameCount++;
    fpsTimer += delta;
    if (fpsTimer >= 0.5) {
      lastFPS    = Math.round(frameCount / fpsTimer);
      frameCount = 0;
      fpsTimer   = 0;
      debug.update('fps', lastFPS.toString());
    }

    experiences.update(delta, elapsed);
    globe.update(Math.min(delta, 0.05), elapsed);
    carousel.update(delta, elapsed);
    cursor.update(elapsed, delta);

    scene.render(delta);
  }

  renderLoop();
}

bootstrap().catch(console.error);
