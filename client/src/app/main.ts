import * as THREE from 'three';
import { HandSceneController } from '../interaction/HandSceneController';
import type { HandFrame } from '../interaction/HandInteractionEngine';
import { ExperienceController } from '../experiences/ExperienceController';
import { SceneManager }           from '../three/SceneManager';
import { GlobeController }        from '../three/GlobeController';
import { CarouselController }     from '../three/CarouselController';
import { HandTracker }            from '../tracking/HandTracker';
import { GestureStateMachine,
         GestureState }           from '../gestures/GestureStateMachine';
import { PointerTouchController } from '../interaction/PointerTouchController';
import { FingertipCursor }        from '../ui/FingertipCursor';
import { HandPointer }            from '../ui/HandPointer';
import { DebugOverlay }           from '../debug/DebugOverlay';
import { SocketClient }           from '../websocket/SocketClient';
import { GeminiIntentBridge }     from '../ai/GeminiIntentBridge';
import { AudioEventSystem }       from '../audio/AudioEventSystem';
import { CameraStateOverlay }     from '../ui/CameraStateOverlay';
import { GestureCoachmarks }      from '../ui/GestureCoachmarks';
import { HolographicHandRenderer } from '../visual/HolographicHandRenderer';
import { HandPresenceState }  from '../tracking/NormalizedHandState';
import { Landmark }               from '../tracking/LandmarkFilter';
import { HandDebugLayer }         from '../debug/HandDebugLayer';
import { PerformanceProfileManager } from '../perf/PerformanceProfileManager';
import { AimPopPractice } from '../experiences/AimPopPractice';
import { AimPopOverlay } from '../ui/AimPopOverlay';

// ─── Gesture pipeline thresholds ────────────────────────────────────────────

async function bootstrap() {
  // ── DOM elements ─────────────────────────────────────────────────────────
  const container = document.getElementById('app-container');
  if (!container) throw new Error('Missing #app-container');
  const stage = container;
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
  const perf     = new PerformanceProfileManager();
  const scene    = new SceneManager(container, perf.profile);
  const globe    = new GlobeController(perf.profile);
  const carousel = new CarouselController({ visibleCards: perf.profile.visibleCards, cardTransmission: perf.profile.cardTransmission });
  const cursor   = new FingertipCursor(scene.scene);
  const handPointer = new HandPointer(container);

  scene.scene.add(globe.group);
  scene.scene.add(carousel.group);

  // ── Services ──────────────────────────────────────────────────────────────
  const audio    = new AudioEventSystem();
  const socket   = new SocketClient();
  const aiBridge = new GeminiIntentBridge(socket);
  socket.connect();

  // ── Interaction ───────────────────────────────────────────────────────────
  const experiences = new ExperienceController(scene, carousel, globe, audio);

  // ── Gesture pipeline ──────────────────────────────────────────────────────
  const tracker          = new HandTracker();
  tracker.applyProfile(perf.profile);
  const stateMachine     = new GestureStateMachine();

  // ── New hand interaction modules ──────────────────────────────────────────
  const handRenderer = perf.profile.holographicHands ? new HolographicHandRenderer(scene.scene, scene.camera) : null;
  const handControl = new HandSceneController(scene, carousel, experiences, cursor, audio, handPointer);
  const debugHands = new HandDebugLayer(document.getElementById('hand-debug-layer') as HTMLCanvasElement);

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
  const aimPop         = new AimPopPractice();
  const aimPopUi       = new AimPopOverlay();
  let practiceActive = false;
  let prevPinchState = 'OPEN';
  let practiceClock = 0;

  function stopPractice() {
    practiceActive = false;
    handControl.suppressScene = false;
    aimPopUi.hide();
    document.body.classList.remove('aim-pop-active');
    prevPinchState = 'OPEN';
  }

  function startPractice() {
    practiceActive = true;
    handControl.suppressScene = true;
    handControl.reset();
    aimPop.reset();
    aimPop.spawn(0.5, 0.42);
    aimPopUi.show();
    aimPopUi.sync(aimPop);
    document.body.classList.add('aim-pop-active');
    if (statusBar) statusBar.textContent = 'AIM & POP · SHOW YOUR HAND · PINCH TO SCORE';
    coachmarks.showTip('aim_pop', '◎', 'MOVE TIP ONTO A CIRCLE · PINCH TO POP', 4500);
  }

  function enterOrbitFromPractice() {
    stopPractice();
    if (statusBar) statusBar.textContent = 'HOLOGRAPHIC INTERFACE · CAMERA HAND TRACKING ACTIVE';
    coachmarks.showTip('onboarding_start', '✋', 'MOVE AN OPEN HAND TO BROWSE · PINCH TO OPEN', 4000);
    showToast('ORBIT UNLOCKED · BROWSE CARDS WITH YOUR HAND', 3500);
  }

  aimPopUi.onPlayAgain = () => {
    aimPop.reset();
    aimPop.spawn(0.5, 0.42);
    aimPopUi.sync(aimPop);
    audio.playCardSelect();
  };
  aimPopUi.onEnterOrbit = () => enterOrbitFromPractice();
  aimPopUi.onMouseMode = () => enableTouchMode('SWITCHED TO MOUSE & TOUCH MODE');

  cameraOverlay.setCallbacks(
    () => enableTouchMode('SWITCHED TO MOUSE & TOUCH MODE'),
    () => enableCameraMode()
  );

  let isCameraMode = false;
  let modeVersion=0;
  let interactionFocused=true;

  // ── Mode Switching ────────────────────────────────────────────────────────

  function enableTouchMode(reasonMessage?: string) {
    isCameraMode = false;
    modeVersion++;
    aiBridge.cancelPending();
    stopPractice();
    handControl.reset();
    tracker.stop();
    coachmarks.hide();
    cameraOverlay.hide();
    pointerController.enable();
    stage.classList.remove('camera-live');
    document.body.classList.remove('camera-live');
    debugHands.clear();
    handRenderer?.updateLandmarks(null, HandPresenceState.LOST, 0);
    handPointer.hide();

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
    const version=++modeVersion;
    aiBridge.cancelPending();
    stopPractice();
    handControl.reset();
    pointerController.disable();
    cursor.hide();
    stage.classList.add('camera-live');
    document.body.classList.add('camera-live');

    if (btnModeTouch && btnModeCamera) {
      btnModeCamera.classList.add('active');
      btnModeTouch.classList.remove('active');
    }

    if (statusBar) {
      statusBar.textContent = 'HOLOGRAPHIC INTERFACE · STARTING CAMERA…';
    }

    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      cameraOverlay.setState('CAMERA_ERROR', 'Camera needs HTTPS (or localhost). Open the secure site URL and try again.');
      return;
    }

    cameraOverlay.setState('CAMERA_LOADING', 'Allow camera access when prompted, then show your hand for Aim & Pop practice.');

    tracker.start(video)
      .then(() => {
        if(version!==modeVersion || !isCameraMode)return;
        cameraOverlay.setState('CAMERA_READY');
        audio.playTrackingRestored();
        startPractice();
      })
      .catch((err: any) => {
        if(version!==modeVersion || !isCameraMode)return;
        console.warn('[Camera] Failed to start:', err.message || err);
        const msg = String(err.message || err);
        if (msg === 'CAMERA_DENIED') {
          cameraOverlay.setState('CAMERA_DENIED');
        } else if (msg === 'CAMERA_BUSY') {
          cameraOverlay.setState('CAMERA_ERROR', 'Webcam is in use by another app. Close Zoom/Teams/etc, then Retry.');
        } else if (msg === 'CAMERA_NOT_FOUND') {
          cameraOverlay.setState('CAMERA_ERROR', 'No camera was detected. Plug in a webcam or use Mouse mode.');
        } else if (msg === 'MEDIAPIPE_MISSING') {
          cameraOverlay.setState('CAMERA_ERROR', 'Hand AI failed to load (MediaPipe). Check your network, refresh, then Retry.');
        } else if (msg === 'INSECURE_CONTEXT' || msg === 'CAMERA_NOT_SUPPORTED') {
          cameraOverlay.setState('CAMERA_ERROR', 'This browser blocked the camera. Use HTTPS or localhost, then Retry.');
        } else {
          cameraOverlay.setState('CAMERA_ERROR', 'Failed to connect to camera. Retry or use Mouse mode.');
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
  let latestRawLandmarks: Landmark[] | null = null;
  let isLandmarkDebug = false;
  window.addEventListener('keydown', e => {
    if(import.meta.env.DEV && e.key.toLowerCase()==='l'){
      isLandmarkDebug=!isLandmarkDebug;
      stage.classList.toggle('debug-hands',isLandmarkDebug);
    }
  });
  let stateKey='';
  let lastTelemetry=0;
  let lastFPS=0;
  const feedHand = (frame:HandFrame) => {
    if(!isCameraMode || document.hidden || !interactionFocused)return;
    const begin=performance.now();
    frame.stage={width:innerWidth,height:innerHeight};
    const r=handControl.process(frame);
    latestRawLandmarks=r.raw;

    if(practiceActive){
      const now=frame.timestamp;
      const dt=Math.min(0.05, Math.max(0.001, (now - practiceClock) / 1000 || 0.033));
      practiceClock=now;
      const handVisible=!!(r.pointer || r.presence?.landmarks || frame.hands.some(h=>h.landmarks?.length===21));
      aimPop.update(dt, now, handVisible);
      const pinch=r.pinchState;
      if(pinch==='PINCHED' && prevPinchState!=='PINCHED' && r.pointer){
        const hit=aimPop.tryHit(r.pointer.x, r.pointer.y);
        if(hit){aimPopUi.flashHit(hit);audio.playPinchStart();coachmarks.completeTip('aim_pop');}
        else audio.playCardSelect();
      }
      prevPinchState=pinch;
      aimPopUi.sync(aimPop);
    }

    const key=r.state+':'+r.target+':'+experiences.state.state;
    if(key!==stateKey){stateVersion++;stateKey=key;aiBridge.cancelPending();}
    const localState=r.state==='ZOOM'?GestureState.ZOOMING:r.state==='MOVE'?GestureState.POINTING:
      r.state.startsWith('PINCH')?GestureState.PINCHING:r.state==='IDLE'?GestureState.IDLE:GestureState.POINTING;
    stateMachine.forceTransition(localState);
    recordGesture(r.state);
    // Gemini is not used for MOVE / CLICK / ZOOM — local engine owns those.
    if(!practiceActive){
      if(r.clickTarget){coachmarks.completeTip('pinch_hint');coachmarks.completeTip('onboarding_start');}
      else if(r.target)coachmarks.showTip('pinch_hint','◎','PINCH TO OPEN · MOVE HAND LEFT / RIGHT',4000);
    }
    if(performance.now()-lastTelemetry>100){
      lastTelemetry=performance.now();
      const drawStats=scene.getDrawStats();
      const fields:Record<string,string|number>={hand:r.handedness,handCount:r.handCount,presence:r.presence.state,
        trackConf:r.quality.toFixed(2),palmOpen:r.openness.toFixed(2),pose:r.pose,gesture:r.state,
        pinch:r.pinchDistance.toFixed(3),pinchRatio:(r.pinchRatio??r.pinchDistance).toFixed(3),
        pinchThr:`${r.pinchThresholdDown ?? .22} / ${r.pinchThresholdRelease ?? .34}`,
        pinchTarget:r.capturedTarget??'none',
        velocity:r.velocity.x.toFixed(3),velocityY:r.velocity.y.toFixed(3),
        velocityZ:r.velocity.z.toFixed(3),activeCard:r.capturedTarget??r.target??'none',zoom:experiences.getZoom().toFixed(2),
        zoomDist:(r.zoomDistance??0).toFixed(3),zoomStart:(r.zoomStartDistance??0).toFixed(3),zoomRatio:(r.zoomRatio??1).toFixed(3),
        rawXY:r.raw? r.raw[8].x.toFixed(3)+', '+r.raw[8].y.toFixed(3):'—',
        filteredXY:r.pointer?r.pointer.x.toFixed(3)+', '+r.pointer.y.toFixed(3):'—',
        h1State:r.hands?.[0]?.state??'—',h1Conf:(r.hands?.[0]?.confidence??0).toFixed(2),
        h1Raw:r.hands?.[0]?`${r.hands[0].rawX.toFixed(3)}, ${r.hands[0].rawY.toFixed(3)}`:'—',
        h1Filt:r.hands?.[0]?`${r.hands[0].filteredX.toFixed(3)}, ${r.hands[0].filteredY.toFixed(3)}`:'—',
        h1Vel:r.hands?.[0]?`${r.hands[0].velocityX.toFixed(3)}, ${r.hands[0].velocityY.toFixed(3)}`:'—',
        h1Hand:r.hands?.[0]?.handedness??'—',
        h2State:r.hands?.[1]?.state??'—',h2Conf:(r.hands?.[1]?.confidence??0).toFixed(2),
        h2Raw:r.hands?.[1]?`${r.hands[1].rawX.toFixed(3)}, ${r.hands[1].rawY.toFixed(3)}`:'—',
        h2Filt:r.hands?.[1]?`${r.hands[1].filteredX.toFixed(3)}, ${r.hands[1].filteredY.toFixed(3)}`:'—',
        h2Vel:r.hands?.[1]?`${r.hands[1].velocityX.toFixed(3)}, ${r.hands[1].velocityY.toFixed(3)}`:'—',
        h2Hand:r.hands?.[1]?.handedness??'—',
        classifyMs:(performance.now()-begin).toFixed(2),cameraFps:tracker.metrics.cameraFPS.toFixed(1),
        trackingFps:tracker.metrics.trackingFPS.toFixed(1),renderFps:lastFPS.toString(),inferenceMs:tracker.metrics.inferenceMs.toFixed(1),
        handDetected:frame.hands.some(h=>h.landmarks?.length===21)?'YES':'NO',
        pointerRaw:r.raw? r.raw[8].x.toFixed(3)+', '+r.raw[8].y.toFixed(3):'—',
        pointerFiltered:r.pointer?r.pointer.x.toFixed(3)+', '+r.pointer.y.toFixed(3):'—',
        pointerScreen:handPointer.visible?`${Math.round(handPointer.x)}, ${Math.round(handPointer.y)}`:'—',
        deviceProfile:perf.profile.name,pixelRatio:scene.renderer.getPixelRatio().toFixed(2),
        activeParticles:drawStats.particles,drawCalls:drawStats.drawCalls,triangles:drawStats.triangles,
        socket:socket.isConnected()?'connected':'offline',localIntent:r.state,final:r.clickTarget??r.state};
      for(const [key,value]of Object.entries(fields))debug.update(key,value);
    }
  };
  tracker.onUpdate(feedHand);
  if(import.meta.env.DEV){
    (window as any).__handTest={
      feed:(frame:HandFrame)=>{isCameraMode=true;pointerController.disable();cursor.hide();document.getElementById('modal-mode-select')?.classList.add('hidden');feedHand(frame);handPointer.tick(performance.now());return handControl.result;},
      reset:()=>{handControl.reset();},
      snapshot:()=>({state:handControl.result?.state,clicks:handControl.clicks,angle:carousel.carouselAngle,
        index:carousel.getActiveCard(),scale:experiences.getZoom(),uiState:experiences.state.state,
        resources:{...scene.renderer.info.memory},aiPending:aiBridge.pendingCount,
        cursorVisible:cursor.group.visible,tracking:{...tracker.metrics},
        historySize:handControl.engine.history.length,cursor:cursor.group.position.toArray(),
        pointerVisible:handPointer.visible,pointerState:handPointer.state,pointerXY:[handPointer.x,handPointer.y],
        profile:perf.profile.name,pixelRatio:scene.renderer.getPixelRatio(),draw:scene.getDrawStats(),fps:lastFPS,
        practice:practiceActive,aimScore:aimPop.score,aimCombo:aimPop.combo,handOk:aimPop.handOk,
        cards:carousel.getCards().map((c,i)=>{const p=c.group.getWorldPosition(new THREE.Vector3()).project(scene.camera);return {id:'card-'+i,x:(p.x+1)/2,y:(1-p.y)/2,worldX:c.group.position.x,visible:c.group.visible};})}),
      hitTest:handControl.hitTest,
    };
  }

  const applyProfile = (profile = perf.profile) => {
    scene.applyProfile(profile);
    globe.applyProfile(profile);
    carousel.applyProfile(profile);
    tracker.applyProfile(profile);
  };
  perf.onChange(applyProfile);

  const refreshPointer = () => {
    handPointer.refreshRect();
    const previous = perf.profile.name;
    perf.reclassify();
    if (perf.profile.name !== previous) applyProfile();
  };
  window.addEventListener('resize', refreshPointer);
  window.addEventListener('orientationchange', refreshPointer);

  // Default: start with pointer interaction enabled while awaiting mode selection
  pointerController.enable();

  document.addEventListener('visibilitychange',()=>{if(document.hidden)handControl.reset();});
  // Tab blur / focus safety
  window.addEventListener('focus',()=>{interactionFocused=true;handControl.reset();});
  window.addEventListener('blur', () => {
    interactionFocused=false;aiBridge.cancelPending();
    handControl.reset();
  });

  // ── Render loop (60 FPS) ──────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let   frameCount = 0;
  let   fpsTimer   = 0;

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
      debug.update('renderFps', lastFPS.toString());
      perf.sampleFps(lastFPS, performance.now());
      const draw = scene.getDrawStats();
      debug.update('deviceProfile', perf.profile.name);
      debug.update('pixelRatio', draw.pixelRatio.toFixed(2));
      debug.update('drawCalls', draw.drawCalls);
      debug.update('triangles', draw.triangles);
      debug.update('activeParticles', draw.particles);
    }

    if(isCameraMode){
      const presence=handControl.render(performance.now());
      handRenderer?.updateLandmarks(presence.landmarks,presence.state,presence.opacity);
      handRenderer?.setDebugMode(isLandmarkDebug?latestRawLandmarks:null,isLandmarkDebug?handControl.result?.landmarks??null:null,
        isLandmarkDebug&&presence.state===HandPresenceState.TEMPORARILY_LOST?presence.landmarks:null);
      debug.update('pointerScreen', handPointer.visible?`${Math.round(handPointer.x)}, ${Math.round(handPointer.y)}`:'—');
      debug.update('handDetected', handControl.result?.raw ? 'YES' : 'NO');
      if(isLandmarkDebug&&(handControl.result?.raw||handControl.result?.landmarks)){
        debugHands.draw(
          [{landmarks:handControl.result.raw??handControl.result.landmarks??[]}],
          null,
          isCameraMode?'camera':'logical',
          video
        );
      }else if(!isLandmarkDebug)debugHands.clear();
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
