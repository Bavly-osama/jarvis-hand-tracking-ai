/**
 * Debug overlay — toggled with backtick (`) key.
 * Shows gesture state, confidence, velocity, FPS, WebSocket status, AI intent telemetry,
 * and comprehensive hand tracking diagnostics.
 */
export class DebugOverlay {
  private container: HTMLDivElement;
  private fields: Record<string, HTMLDivElement> = {};
  private visible: boolean = false;

  private readonly FIELD_DEFS: { key: string; label: string }[] = [
    {key:'handCount',label:'Hands'},
    {key:'h1State',label:'HAND 1 state'},
    {key:'h1Conf',label:'HAND 1 confidence'},
    {key:'h1Raw',label:'HAND 1 raw X/Y'},
    {key:'h1Filt',label:'HAND 1 filtered X/Y'},
    {key:'h1Vel',label:'HAND 1 velocity'},
    {key:'h1Hand',label:'HAND 1 handedness'},
    {key:'h2State',label:'HAND 2 state'},
    {key:'h2Conf',label:'HAND 2 confidence'},
    {key:'h2Raw',label:'HAND 2 raw X/Y'},
    {key:'h2Filt',label:'HAND 2 filtered X/Y'},
    {key:'h2Vel',label:'HAND 2 velocity'},
    {key:'h2Hand',label:'HAND 2 handedness'},
    {key:'rawXY',label:'Raw logical X/Y'},
    {key:'filteredXY',label:'Filtered X/Y'},
    {key:'pinchRatio',label:'PINCH ratio'},
    {key:'pinchThr',label:'PINCH thresholds'},
    {key:'pinchTarget',label:'PINCH candidate'},
    {key:'zoomDist',label:'ZOOM distance'},
    {key:'zoomStart',label:'ZOOM start distance'},
    {key:'zoomRatio',label:'ZOOM ratio'},
    {key:'cameraFps',label:'CAMERA FPS'},
    {key:'trackingFps',label:'TRACKING FPS'},
    {key:'renderFps',label:'RENDER FPS'},
    {key:'inferenceMs',label:'Inference ms'},
    {key:'classifyMs',label:'Local pipeline ms'},
    {key:'handDetected',label:'HAND DETECTED'},
    {key:'pointerRaw',label:'Pointer raw XY'},
    {key:'pointerFiltered',label:'Pointer filtered XY'},
    {key:'pointerScreen',label:'Pointer screen XY'},
    {key:'deviceProfile',label:'DEVICE PROFILE'},
    {key:'pixelRatio',label:'PIXEL RATIO'},
    {key:'activeParticles',label:'ACTIVE PARTICLES'},
    {key:'drawCalls',label:'DRAW CALLS'},
    {key:'triangles',label:'TRIANGLES'},
    { key: 'fps',           label: '⚡ Render FPS' },
    { key: 'hand',          label: '🖐 Hand' },
    { key: 'presence',      label: '👁 Presence' },
    { key: 'trackConf',     label: '📶 Observation quality (not model confidence)' },
    { key: 'palmOpen',      label: '✋ Palm Open' },
    { key: 'indexExt',      label: '☝ Index Ext' },
    { key: 'pose',          label: '🤲 Pose' },
    { key: 'gesture',       label: '✋ Gesture State' },
    { key: 'confidence',    label: '📊 Local Conf' },
    { key: 'tapConf',       label: '👆 Tap Conf' },
    { key: 'tapState',      label: '🎯 Tap State' },
    { key: 'pinch',         label: '🤌 Pinch Dist' },
    { key: 'velocity',      label: '💨 Velocity X' },
    { key: 'velocityY',     label: '💨 Velocity Y' },
    { key: 'velocityZ',     label: '💨 Velocity Z' },
    { key: 'activeCard',    label: '🎴 Target' },
    { key: 'targetLock',    label: '🔒 Lock' },
    { key: 'socket',        label: '🌐 Socket' },
    { key: 'zoom',          label: '🔍 Zoom Scale' },
    { key: 'localIntent',   label: '🧭 Local Intent' },
    { key: 'aiIntent',      label: '🤖 AI Intent' },
    { key: 'aiConf',        label: '🧠 AI Conf' },
    { key: 'latency',       label: '⏱ AI Latency' },
    { key: 'final',         label: '🎯 Final Action' },
  ];

  constructor() {
    this.container = document.createElement('div');
    if(!import.meta.env.DEV)return;
    Object.assign(this.container.style, {
      position:        'fixed',
      top:             '12px',
      left:            '12px',
      backgroundColor: 'rgba(0, 8, 16, 0.88)',
      color:           '#00ff88',
      padding:         '14px 18px',
      fontFamily:      '"Courier New", Courier, monospace',
      fontSize:        '10px',
      lineHeight:      '1.6',
      pointerEvents:   'none',
      zIndex:          '9999',
      border:          '1px solid rgba(0, 255, 136, 0.35)',
      borderRadius:    '4px',
      backdropFilter:  'blur(8px)',
      display:         'none',
      minWidth:        '240px',
      maxHeight:       '90vh',
      overflowY:       'auto',
    });

    const header = document.createElement('div');
    header.textContent = '[ SPATIAL AI TELEMETRY ]';
    Object.assign(header.style, {
      color:        '#00ffff',
      fontWeight:   'bold',
      marginBottom: '8px',
      borderBottom: '1px solid rgba(0,255,255,0.3)',
      paddingBottom:'4px',
    });
    this.container.appendChild(header);

    for (const def of this.FIELD_DEFS) {
      const row = document.createElement('div');
      row.textContent = `${def.label}: —`;
      this.fields[def.key] = row;
      this.container.appendChild(row);
    }

    const hint = document.createElement('div');
    hint.textContent = '[ ` ] toggle debug';
    Object.assign(hint.style, {
      marginTop:  '8px',
      color:      'rgba(0,255,136,0.4)',
      fontSize:   '9px',
    });
    this.container.appendChild(hint);

    document.body.appendChild(this.container);

    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') {
        this.visible = !this.visible;
        this.container.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  public update(key: string, value: string | number): void {
    const def = this.FIELD_DEFS.find(d => d.key === key);
    const el  = this.fields[key];
    if (!el || !def) return;
    el.textContent = `${def.label}: ${value}`;

    if (key === 'confidence' || key === 'aiConf' || key === 'tapConf' || key === 'trackConf') {
      const v = parseFloat(value as string);
      el.style.color = v >= 0.80 ? '#00ff88' : v >= 0.55 ? '#ffcc00' : '#ff4444';
    }

    if (key === 'presence') {
      const s = value as string;
      el.style.color = s === 'TRACKED' || s === 'HAND_VISIBLE' ? '#00ff88'
                     : s === 'UNCERTAIN' || s === 'REACQUIRING' || s === 'HAND_WEAK' ? '#ffcc00'
                     : s === 'TEMPORARILY_LOST' || s === 'HAND_PREDICTED' ? '#ff8800'
                     : '#ff4444';
    }

    if (key === 'socket') {
      el.style.color = (value === 'connected') ? '#00ff88' : '#ff4444';
    }

    if (key === 'final') {
      el.style.color = value !== 'NONE' && value !== 'IDLE' ? '#00ffff' : '#888888';
      el.style.fontWeight = 'bold';
    }

    if (key === 'tapState') {
      el.style.color = value === 'PRESS' || value === 'CONTACT' ? '#ff00ff' : '#00ff88';
    }

    if (key === 'targetLock') {
      el.style.color = value === 'LOCKED' ? '#00ff88' : '#888888';
    }
  }
}
