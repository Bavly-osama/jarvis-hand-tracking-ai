import { SocketClient, AIRequestPayload, AIResponsePayload } from '../websocket/SocketClient';
import { GestureStateMachine, GestureState } from '../gestures/GestureStateMachine';
import { InteractionManager } from '../interaction/InteractionManager';
import { ExperienceController } from '../experiences/ExperienceController';

export type AllowedIntent =
  | 'NONE'
  | 'NEXT_CARD'
  | 'PREVIOUS_CARD'
  | 'SELECT'
  | 'OPEN'
  | 'CLOSE'
  | 'BACK'
  | 'CONFIRM'
  | 'CANCEL'
  | 'ROTATE_LEFT'
  | 'ROTATE_RIGHT'
  | 'ROTATE_UP'
  | 'ROTATE_DOWN'
  | 'ZOOM_IN'
  | 'ZOOM_OUT'
  | 'GRAB'
  | 'RELEASE'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'MOVE_UP'
  | 'MOVE_DOWN'
  | 'GAME_SHOOT'
  | 'GAME_MOVE'
  | 'GAME_PAUSE'
  | 'OPEN_ANALYTICS'
  | 'OPEN_EARTH'
  | 'OPEN_GAME'
  | 'OPEN_AI'
  | 'OPEN_FILES'
  | 'OPEN_SECURITY'
  | 'OPEN_NAVIGATION'
  | 'OPEN_ENERGY';

const VALID_INTENTS = new Set<string>([
  'NONE',
  'NEXT_CARD',
  'PREVIOUS_CARD',
  'SELECT',
  'OPEN',
  'CLOSE',
  'BACK',
  'CONFIRM',
  'CANCEL',
  'ROTATE_LEFT',
  'ROTATE_RIGHT',
  'ROTATE_UP',
  'ROTATE_DOWN',
  'ZOOM_IN',
  'ZOOM_OUT',
  'GRAB',
  'RELEASE',
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'MOVE_UP',
  'MOVE_DOWN',
  'GAME_SHOOT',
  'GAME_MOVE',
  'GAME_PAUSE',
  'OPEN_ANALYTICS',
  'OPEN_EARTH',
  'OPEN_GAME',
  'OPEN_AI',
  'OPEN_FILES',
  'OPEN_SECURITY',
  'OPEN_NAVIGATION',
  'OPEN_ENERGY',
]);

export class GeminiIntentBridge {
  private socket: SocketClient;
  private lastRequestTime: number = 0;
  private readonly REQUEST_COOLDOWN_MS = 1200;
  private pendingRequests = new Map<string, { timestamp: number; stateVersion: number }>();
  private onDebugUpdate?: (data: { aiIntent: string; confidence: number; latencyMs: number; final: string }) => void;

  constructor(socket: SocketClient) {
    this.socket = socket;
  }

  public setDebugCallback(cb: (data: { aiIntent: string; confidence: number; latencyMs: number; final: string }) => void) {
    this.onDebugUpdate = cb;
  }

  public requestIntent(context: AIRequestPayload) {
    const now = Date.now();
    this.expire(now);
    // Allow REST fallback when Socket.IO is offline (Vercel has no long-lived WS)
    if (this.pendingRequests.size > 0) return;
    if (now - this.lastRequestTime < this.REQUEST_COOLDOWN_MS) return;
    this.lastRequestTime = now;

    const reqId = context.requestId || `req-${now}-${Math.random().toString(36).slice(2, 6)}`;
    this.pendingRequests.set(reqId, {
      timestamp: now,
      stateVersion: context.stateVersion ?? 1,
    });

    this.socket.requestAIIntent({
      ...context,
      requestId: reqId,
      timestamp: now,
    });
  }

  public handleResponse(
    data: AIResponsePayload,
    stateMachine: GestureStateMachine,
    experiences: ExperienceController,
    currentStateVersion: number
  ) {
    if(!data || typeof data.requestId!=='string')return;
    const pending=this.pendingRequests.get(data.requestId);
    if(!pending)return;
    this.pendingRequests.delete(data.requestId);
    if(Date.now()-pending.timestamp>1800 || pending.stateVersion!==currentStateVersion)return;
    if(typeof data.confidence!=='number'||!Number.isFinite(data.confidence)||data.confidence<0||data.confidence>1)return;
    // 1. Validate intent is in strict allowlist
    if (!VALID_INTENTS.has(data.intent)) {
      console.warn('[GeminiBridge] Untrusted or invalid AI intent rejected:', data.intent);
      return;
    }

    // 2. Prevent stale / duplicate commands: discard if stateVersion has changed
    if (data.stateVersion !== undefined && data.stateVersion !== currentStateVersion) {
      console.debug('[GeminiBridge] Discarding stale AI response:', data.intent, 'expected version', currentStateVersion, 'got', data.stateVersion);
      return;
    }

    // Update debug telemetry
    this.onDebugUpdate?.({
      aiIntent: data.intent,
      confidence: data.confidence,
      latencyMs: data.latencyMs || 0,
      final: data.intent !== 'NONE' ? data.intent : 'IDLE',
    });

    // 3. Minimum confidence threshold & ignore NONE
    if (data.confidence < 0.65 || data.intent === 'NONE') return;

    // 4. Do not override active deterministic local gestures
    const currentState = stateMachine.getState();
    if (
      currentState === GestureState.PINCHING ||
      currentState === GestureState.ZOOMING ||
      currentState === GestureState.GRABBING
    ) {
      return;
    }

    // 5. Execute verified context-specific intent
    const intent = data.intent as AllowedIntent;
    switch (intent) {
      case 'NEXT_CARD':
        if (experiences.isHome) experiences.swipe(1);
        break;
      case 'PREVIOUS_CARD':
        if (experiences.isHome) experiences.swipe(-1);
        break;
      case 'SELECT':
      case 'OPEN':
        experiences.activate();
        break;
      case 'BACK':
      case 'CLOSE':
      case 'CANCEL':
        experiences.close();
        break;
      case 'ROTATE_LEFT':
        experiences.rotate(-0.06, 0);
        break;
      case 'ROTATE_RIGHT':
        experiences.rotate(0.06, 0);
        break;
      case 'ROTATE_UP':
        experiences.rotate(0, -0.06);
        break;
      case 'ROTATE_DOWN':
        experiences.rotate(0, 0.06);
        break;
      case 'ZOOM_IN':
        experiences.zoom(1.25);
        break;
      case 'ZOOM_OUT':
        experiences.zoom(0.85);
        break;
      case 'GAME_SHOOT':
        if (experiences.active && experiences.name === 'Game') {
          experiences.activate();
        }
        break;
    }
  }

  private expire(now=Date.now()) {
    for(const [id,request]of this.pendingRequests)if(now-request.timestamp>1800)this.pendingRequests.delete(id);
  }
  get pendingCount(){this.expire();return this.pendingRequests.size;}
  cancelPending(){this.pendingRequests.clear();}
}
