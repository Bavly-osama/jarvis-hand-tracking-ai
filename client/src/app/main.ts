import * as THREE from 'three';
import { ExperienceController } from '../experiences/ExperienceController';
import { SceneManager }           from '../three/SceneManager';
import { GlobeController }        from '../three/GlobeController';
import { CarouselController }     from '../three/CarouselController';
import { HandTracker }            from '../tracking/HandTracker';
import { HandPresenceManager }    from '../tracking/HandPresenceManager';
import { HandMotionHistory }      from '../tracking/HandMotionHistory';
import { GestureRecognizer }      from '../gestures/GestureRecognizer';
import { HandPoseAnalyzer }       from '../gestures/HandPoseAnalyzer';
import { AirTapRecognizer }       from '../gestures/AirTapRecognizer';
import { PinchRecognizer }        from '../gestures/PinchRecognizer';
import { SwipeRecognizer }        from '../gestures/SwipeRecognizer';
import { GrabRecognizer }         from '../gestures/GrabRecognizer';
import { GestureStateMachine,
         GestureState }           from '../gestures/GestureStateMachine';
import { GestureConfidenceEngine } from '../gestures/GestureConfidenceEngine';
import { InteractionManager }     from '../interaction/InteractionManager';
import { TargetIntentManager, TargetInfo }    from '../interaction/TargetIntentManager';
import { MagneticTargeting, MagneticTarget }      from '../interaction/MagneticTargeting';
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
import { HolographicHandRenderer } from '../visual/HolographicHandRenderer';
import { HandPresenceState, LM }  from '../tracking/NormalizedHandState';
import { Landmark }               from '../tracking/LandmarkFilter';

// ─── Gesture pipeline thresholds ────────────────────────────────────────────

const SWIPE_THRESH    = 0.25;  // lowered for comfort
const TWO_HAND_ZOOM   = 0.05;

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
  const recognizerL      = new GestureRecognizer();
  const recognizerR      = new GestureRecognizer();
  const stateMachine     = new GestureStateMachine();
  const confidenceEngine = new GestureConfidenceEngine();

  // ── New hand interaction modules ──────────────────────────────────────────
  const presenceManager  = new HandPresenceManager();
  const motionHistory    = new HandMotionHistory();
  const poseAnalyzer     = new HandPoseAnalyzer();
  const airTapRecognizer = new AirTapRecognizer();
  const pinchRecognizer  = new PinchRecognizer();
  const swipeRecognizer  = new SwipeRecognizer();
  const grabRecognizer   = new GrabRecognizer();
  const targetIntent     = new TargetIntentManager();
  const magneticTarget   = new MagneticTargeting();
  const handRenderer     = new HolographicHandRenderer(scene.scene);

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
    handRenderer.updateLandmarks(null, HandPresenceState.HAND_LOST, 0);

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

  // ── Render-frame interpolated landmark storage ────────────────────────────
  let latestLandmarks: Landmark[] | null = null;
  let latestRawLandmarks: Landmark[] | null = null;
  let latestPresenceState: HandPresenceState = HandPresenceState.HAND_LOST;
  let latestPresenceOpacity: number = 0;
  let isLandmarkDebug = false;

  // Toggle landmark debugging (Red=Raw, Green=Filtered, Yellow=Predicted)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'l' || e.key === 'L') {
      isLandmarkDebug = !isLandmarkDebug;
      showToast(isLandmarkDebug ? 'LANDMARK DEBUG: ON (Red=Raw, Green=Filtered, Yellow=Predicted)' : 'LANDMARK DEBUG: OFF', 2500);
      if (!isLandmarkDebug) {
        handRenderer.setDebugMode(null, null, null);
      }
    }
  });

  // ── Tracking loop ─────────────────────────────────────────────────────────
  let lastInteractionTimestamp = 0;
  let lastTrackTime = performance.now();
  let trackFrameCount = 0;
  let trackFpsTimer = 0;
  let currentTrackFps = 30;

  // Track if we showed the first air tap hint
  let airTapHintShown = false;

  tracker.onUpdate((multiHandLandmarks, timestamp, handedness, confidences, velocities, rawLandmarks) => {
    if (!isCameraMode) return;
    latestRawLandmarks = (rawLandmarks && rawLandmarks.length > 0) ? rawLandmarks[0] : null;

    // Calculate tracking FPS
    const now = performance.now();
    const nowMs = now;
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
    const rawConfidence = hasHand ? (confidences[0] ?? 0.5) : 0;
    const primaryVelocity = hasHand && velocities.length > 0 && velocities[0].length > 9
      ? velocities[0][LM.MIDDLE_MCP]  // palm center velocity
      : { x: 0, y: 0, z: 0 };

    // ── HandPresenceManager: graceful tracking degradation ──────────────
    const presenceResult = presenceManager.update(
      hasHand ? multiHandLandmarks[0] : null,
      rawConfidence,
      primaryVelocity,
      nowMs
    );

    latestPresenceState = presenceResult.state;
    latestPresenceOpacity = presenceResult.opacity;

    // Update context based on current experience
    stateMachine.setContext(
      experiences.isHome ? 'MAIN_CAROUSEL' :
      experiences.name === 'Earth' ? 'EARTH' :
      experiences.name === 'Game' ? 'GAME' : 'DEFAULT'
    );

    // If we should reset velocity (reacquisition), soft-reset recognizers
    if (presenceResult.shouldResetVelocity) {
      recognizerR.reset();
      recognizerL.reset();
      motionHistory.softReset();
      airTapRecognizer.reset();
      swipeRecognizer.reset();
      grabRecognizer.reset();
    }

    // ── Handle presence states ──────────────────────────────────────────
    if (presenceResult.state === HandPresenceState.HAND_LOST) {
      twoHandBaseline = null;
      coachmarks.showEdgeWarning(false);
      if (stateMachine.getState() !== GestureState.IDLE) {
        stateMachine.forceTransition(GestureState.IDLE);
        confidenceEngine.reset();
        recognizerR.reset();
        recognizerL.reset();
        motionHistory.reset();
        interaction.onTrackingLost();
        targetIntent.reset();
        airTapRecognizer.reset();
        pinchRecognizer.reset();
        swipeRecognizer.reset();
        grabRecognizer.reset();
      }
      // Cursor fades out via presence state (not instant hide)
      cursor.setPresenceState(HandPresenceState.HAND_LOST, 0);
      latestLandmarks = null;
      return;
    }

    // We have landmarks (actual or predicted)
    const primaryLandmarks = presenceResult.landmarks!;
    latestLandmarks = primaryLandmarks;

    // Set cursor presence state for visual feedback
    cursor.setPresenceState(presenceResult.state, presenceResult.opacity);

    // Secondary hand
    const secondaryLandmarks = multiHandLandmarks.length > 1 ? multiHandLandmarks[1] : null;
    const primaryHandedness  = (handedness[0] || 'RIGHT').toUpperCase();
    const secondaryHandedness = (handedness[1] || 'LEFT').toUpperCase();

    // Check camera edge boundaries
    const centerLm = primaryLandmarks[LM.MIDDLE_MCP];
    const isNearEdge = centerLm.x < 0.08 || centerLm.x > 0.92 || centerLm.y < 0.08 || centerLm.y > 0.92;
    coachmarks.showEdgeWarning(isNearEdge);

    const secondCenter = secondaryLandmarks ? secondaryLandmarks[LM.MIDDLE_MCP] : undefined;
    const primaryData  = recognizerR.recognize(primaryLandmarks, timestamp, primaryHandedness, secondCenter);
    const secondData   = secondaryLandmarks
      ? recognizerL.recognize(secondaryLandmarks, timestamp, secondaryHandedness, primaryLandmarks[LM.MIDDLE_MCP])
      : null;

    // ── Hand pose analysis ──────────────────────────────────────────────
    const poseResult = poseAnalyzer.analyze(primaryLandmarks);

    // ── Motion history ──────────────────────────────────────────────────
    const indexTip = primaryLandmarks[LM.INDEX_TIP];
    const palmVelocity = primaryData.smoothedVel;

    // ── Target Identification & Magnetic Projection ────────────────────
    const tip = primaryLandmarks[LM.INDEX_TIP];
    const magneticTargets: MagneticTarget[] = [];
    const targetInfos: TargetInfo[] = [];
    const tempCardWorldPos = new THREE.Vector3();

    if (experiences.isHome) {
      const cards = carousel.getCards();
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card.group.visible) continue;
        card.group.getWorldPosition(tempCardWorldPos);
        // Only target cards positioned in front of the camera
        if (tempCardWorldPos.z < 0) continue;
        tempCardWorldPos.project(scene.camera);
        // Convert NDC to normalized viewport coordinates [0..1]
        const screenX = (tempCardWorldPos.x + 1) / 2;
        const screenY = (1 - tempCardWorldPos.y) / 2;
        const cardId = `card-${i}`;

        magneticTargets.push({
          id: cardId,
          x: screenX,
          y: screenY,
          radius: 0.16,
        });

        targetInfos.push({
          id: cardId,
          center: { x: screenX, y: screenY },
          radius: 0.16,
        });
      }
    }

    // Update target intent manager with hysteresis target locking
    const targetResult = targetIntent.update(tip.x, tip.y, targetInfos, nowMs);
    const currentTargetId = targetResult.targetId;

    // Apply magnetic cursor attraction
    const magnetResult = magneticTarget.computeAttraction(tip.x, tip.y, magneticTargets);
    cursor.setAttractionStrength(magnetResult.attractionStrength);

    // Compute cursor world position using subtle magnetized coordinates
    const visualTipX = magnetResult.x;
    const visualTipY = magnetResult.y;
    const cursorWorldX = (visualTipX - 0.5) * 10;
    const cursorWorldY = -(visualTipY - 0.5) * 7;
    const cursorWorldZ = 5 - tip.z * 8;
    cursor.updatePosition(cursorWorldX, cursorWorldY, cursorWorldZ);

    // Set card hover & magnetic tilt based on locked target
    if (experiences.isHome) {
      if (currentTargetId && currentTargetId.startsWith('card-')) {
        const targetCardIdx = parseInt(currentTargetId.replace('card-', ''), 10);
        carousel.setHover(targetCardIdx);

        if (targetCardIdx >= 0 && targetCardIdx < carousel.getCards().length) {
          const card = carousel.getCards()[targetCardIdx];
          card.applyMagneticTilt(
            new THREE.Vector3(cursorWorldX, cursorWorldY, cursorWorldZ),
            card.group.position,
            0.4
          );
        }
      } else {
        carousel.setHover(-1);
      }
    }

    motionHistory.push({
      position: { x: indexTip.x, y: indexTip.y, z: indexTip.z },
      velocity: { x: palmVelocity.x, y: palmVelocity.y, z: palmVelocity.z },
      pose: poseResult.pose,
      confidence: rawConfidence,
      targetId: currentTargetId,
      timestamp: nowMs,
      landmarks: primaryLandmarks,
    });

    // ── Air Tap Recognition ─────────────────────────────────────────────
    const tapResult = airTapRecognizer.update(
      primaryLandmarks[LM.INDEX_TIP],
      primaryLandmarks[LM.INDEX_DIP],
      primaryLandmarks[LM.INDEX_MCP],
      primaryLandmarks[LM.WRIST],
      primaryLandmarks[LM.MIDDLE_MCP],
      palmVelocity,
      poseResult.fingerCurls[1], // index finger curl
      poseResult.fingers[1].extended, // index extended
      currentTargetId,
      motionHistory,
      nowMs
    );

    // Show tap progress on cursor
    cursor.setTapProgress(tapResult.progress);

    // Visual depress response during PRESS
    if (tapResult.state === 'PRESS') {
      if (experiences.isHome) {
        experiences.press();
      }
    }

    // Handle air tap event (fires on completion)
    if (tapResult.event) {
      cursor.pulse();
      audio.playPinchStart();
      if (experiences.isHome) {
        experiences.activate();
      } else {
        if (experiences.isHoveringBack(tip.x, tip.y)) {
          experiences.close();
        } else {
          experiences.activate();
        }
      }
      coachmarks.completeTip('tap_hint');
      coachmarks.completeTip('onboarding_start');
    }

    // ── Pinch Recognition ───────────────────────────────────────────────
    const pinchResult = pinchRecognizer.update(
      primaryLandmarks[LM.THUMB_TIP],
      primaryLandmarks[LM.INDEX_TIP],
      primaryData.handSize,
      nowMs
    );

    // ── Swipe Recognition ───────────────────────────────────────────────
    // Mirror-corrected velocity
    const swipeVelX = -palmVelocity.x; // invert for mirror
    const swipeResult = swipeRecognizer.update(
      { x: swipeVelX, y: palmVelocity.y, z: palmVelocity.z },
      { x: -primaryData.smoothedVel.x, y: primaryData.smoothedVel.y, z: primaryData.smoothedVel.z },
      poseResult.openness > 0.5,
      poseResult.fistConfidence > 0.6,
      motionHistory,
      nowMs
    );

    // ── Grab Recognition ────────────────────────────────────────────────
    const grabResult = grabRecognizer.update(
      poseResult.fingerCurls,
      null, // target distance — could be computed from raycasting
      motionHistory,
      nowMs
    );

    // ── Classify gesture → state machine ────────────────────────────────
    let nextState   = GestureState.TRACKING;
    let confidence  = 0.5;
    let velocity    = 0;

    // Two-hand zoom
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
      // Air tap states take priority when in progress
      if (tapResult.state === 'PRESS' || tapResult.state === 'CONTACT') {
        nextState  = GestureState.TAP_PRESSING;
        confidence = tapResult.confidence;
      } else if (tapResult.state === 'RELEASE') {
        nextState  = GestureState.TAP_RELEASE;
        confidence = 0.85;
      } else if (tapResult.state === 'READY') {
        nextState  = GestureState.TAP_READY;
        confidence = 0.70;
      } else if (grabResult.isGrabbing) {
        nextState  = GestureState.GRABBING;
        confidence = grabResult.grabConfidence;
      } else if (pinchResult.isPinching) {
        nextState  = GestureState.PINCHING;
        confidence = PhysicsController.remap(pinchResult.pinchDistance, 0.16, 0, 0.8, 0.98);
        coachmarks.completeTip('pinch_hint');
      } else if (experiences.active && primaryData.swipeVelocityY > 0.45 && !primaryData.isFist) {
        nextState  = GestureState.CANCELING;
        confidence = 0.85;
      } else if (swipeResult.isSwipe && !swipeResult.consumed) {
        nextState  = swipeResult.direction === 'right'
          ? GestureState.SWIPING_RIGHT
          : GestureState.SWIPING_LEFT;
        confidence = Math.min(0.95, PhysicsController.remap(
          Math.abs(swipeResult.velocity), 0.25, 1.2, 0.72, 0.95
        ));
        velocity = swipeResult.velocity;
        coachmarks.completeTip('onboarding_start');
      } else if (poseResult.fingers[1].extended && !poseResult.fingers[2].extended) {
        const speed = Math.hypot(primaryData.smoothedVel.x, primaryData.smoothedVel.y);
        if (speed > 0.005) {
          nextState  = GestureState.ROTATING;
          confidence = Math.min(0.92, 0.7 + speed * 20);
          velocity   = speed;
        } else {
          nextState  = GestureState.POINTING;
          confidence = 0.80;
        }
      } else if (poseResult.openness > 0.65) {
        nextState  = GestureState.HOVER;
        confidence = 0.72;
      }
    }

    // Handle pinch edge events directly
    if (pinchResult.pinchEdge === 'start') {
      cursor.pulse();
      audio.playPinchStart();
      if (experiences.isHome) {
        experiences.press();
      } else {
        if (experiences.isHoveringBack(tip.x, tip.y)) {
          experiences.close();
        } else {
          experiences.activate();
        }
      }
    } else if (pinchResult.pinchEdge === 'release') {
      if (experiences.isHome) {
        experiences.activate();
      }
    }

    // Dynamic coachmark guidance
    if (experiences.isHome) {
      coachmarks.showTip('onboarding_start', '↔', 'SWIPE LEFT OR RIGHT TO BROWSE MODULES', 6000);
      const activeCardIdx = carousel.getActiveCard();
      if (activeCardIdx >= 0 && (poseResult.fingers[1].extended || poseResult.openness > 0.5)) {
        if (!airTapHintShown) {
          coachmarks.showTip('tap_hint', '👆', 'TAP FORWARD OR PINCH TO OPEN MODULE', 4000);
          airTapHintShown = true;
        }
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

    // Update swipe neutral observation
    const speed = Math.hypot(primaryData.smoothedVel.x, primaryData.smoothedVel.y);
    const inputDelta = lastInteractionTimestamp ? Math.min(timestamp - lastInteractionTimestamp, 0.05) : 1 / 60;
    swipeRecognizer.observeNeutral(speed, inputDelta);

    lastInteractionTimestamp = timestamp;

    // Update primary data with new pinch state from PinchRecognizer
    const enhancedPrimaryData: GestureData = {
      ...primaryData,
      isPinching: pinchResult.isPinching,
      pinchEdge: pinchResult.pinchEdge,
      pinchDistance: pinchResult.pinchDistance,
      pinchMidpoint: pinchResult.pinchMidpoint,
    };
    interaction.update(stateMachine.getState(), enhancedPrimaryData, secondData, timestamp, inputDelta);

    // AI intent reasoning for ambiguous gestures
    const ambiguous = confidenceEngine.getAmbiguous();
    const isAmbiguous = ambiguous.length > 0 || (confidence >= 0.50 && confidence < 0.78);

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

    if (confirmed && confirmed.confidence > 0.78) {
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

    // ── Debug overlay telemetry ─────────────────────────────────────────
    debug.update('hand',       primaryHandedness);
    debug.update('presence',   presenceResult.state);
    debug.update('trackConf',  rawConfidence.toFixed(2));
    debug.update('palmOpen',   poseResult.openness.toFixed(2));
    debug.update('indexExt',   poseResult.fingers[1].extended ? 'YES' : 'NO');
    debug.update('pose',       poseResult.pose);
    debug.update('gesture',    stateMachine.getStateName());
    debug.update('confidence', (confirmed?.confidence ?? confidence).toFixed(2));
    debug.update('tapConf',    tapResult.confidence.toFixed(2));
    debug.update('tapState',   tapResult.state);
    debug.update('pinch',      pinchResult.pinchDistance.toFixed(3));
    debug.update('velocity',   swipeVelX.toFixed(3));
    debug.update('velocityY',  palmVelocity.y.toFixed(3));
    debug.update('velocityZ',  palmVelocity.z.toFixed(3));
    debug.update('activeCard', experiences.isHome ? carousel.getActiveCard().toString() : experiences.name);
    debug.update('targetLock', targetIntent.getCurrentTargetId() ? 'LOCKED' : '—');
    debug.update('socket',     socket.isConnected() ? 'connected' : 'offline');
    debug.update('zoom',       currentZoom.toFixed(2));
    debug.update('localIntent', stateMachine.getStateName());
  });

  // Default: start with pointer interaction enabled while awaiting mode selection
  pointerController.enable();

  // Tab blur / focus safety
  window.addEventListener('blur', () => {
    interaction.onTrackingLost();
    recognizerR.reset();
    recognizerL.reset();
    motionHistory.reset();
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

    // Update holographic hand renderer every render frame
    if (isCameraMode) {
      handRenderer.updateLandmarks(latestLandmarks, latestPresenceState, latestPresenceOpacity);
      if (isLandmarkDebug) {
        handRenderer.setDebugMode(
          latestRawLandmarks,
          latestLandmarks,
          latestPresenceState === HandPresenceState.HAND_PREDICTED ? latestLandmarks : null
        );
      }
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
