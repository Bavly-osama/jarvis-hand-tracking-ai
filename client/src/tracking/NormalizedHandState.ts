import { Landmark } from './LandmarkFilter';

// ─── Presence states ────────────────────────────────────────────────────────

export enum HandPresenceState {
  TRACKED = 'TRACKED',
  UNCERTAIN = 'UNCERTAIN',
  TEMPORARILY_LOST = 'TEMPORARILY_LOST',
  LOST = 'LOST',
  REACQUIRING = 'REACQUIRING',
}

// ─── Semantic hand poses ────────────────────────────────────────────────────

export enum HandPose {
  OPEN_PALM = 'OPEN_PALM',
  POINT     = 'POINT',
  PINCH     = 'PINCH',
  FIST      = 'FIST',
  RELAXED   = 'RELAXED',
  TAP_READY = 'TAP_READY',
  UNKNOWN   = 'UNKNOWN',
}

// ─── Finger identifiers ────────────────────────────────────────────────────

export enum Finger {
  THUMB  = 0,
  INDEX  = 1,
  MIDDLE = 2,
  RING   = 3,
  PINKY  = 4,
}

// ─── Per-finger analysis ────────────────────────────────────────────────────

export interface FingerState {
  extended:  boolean;
  curl:      number;   // 0 = fully extended, 1 = fully curled
  direction: { x: number; y: number; z: number };
}

// ─── Normalized hand output ─────────────────────────────────────────────────

export interface NormalizedHandState {
  // Position (viewport-normalized, 0..1)
  x: number;
  y: number;
  z: number;

  // Palm metrics
  palmSize:    number;  // wrist-to-middle-MCP distance (normalized)
  palmCenter:  Landmark;
  palmNormal:  { x: number; y: number; z: number };

  // Kinematics
  velocity:     { x: number; y: number; z: number };
  acceleration: { x: number; y: number; z: number };
  speed:        number;

  // Hand shape
  openness:      number;  // 0 = fist, 1 = fully open
  fingers:       FingerState[];
  pinchDistance:  number;  // thumb-to-index, normalized by hand size

  // Index finger
  indexTip:       Landmark;
  indexDirection: { x: number; y: number; z: number };

  // Classification
  pose:       HandPose;
  handedness: 'LEFT' | 'RIGHT';
  confidence: number;  // tracking confidence 0..1

  // Raw data
  landmarks:  Landmark[];
  timestamp:  number;
}

// ─── Tap event ──────────────────────────────────────────────────────────────

export interface AirTapEvent {
  tapId:      string;
  position:   { x: number; y: number };
  confidence: number;
  targetId?:  string;
  timestamp:  number;
}

// ─── Landmark index constants ───────────────────────────────────────────────

export const LM = {
  WRIST:      0,
  THUMB_CMC:  1, THUMB_MCP:  2, THUMB_IP:  3, THUMB_TIP:  4,
  INDEX_MCP:  5, INDEX_PIP:  6, INDEX_DIP: 7, INDEX_TIP:  8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP:  13, RING_PIP:  14, RING_DIP:  15, RING_TIP:  16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const;

// Skeletal connections for rendering (pairs of landmark indices)
export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [LM.WRIST, LM.THUMB_CMC], [LM.THUMB_CMC, LM.THUMB_MCP],
  [LM.THUMB_MCP, LM.THUMB_IP], [LM.THUMB_IP, LM.THUMB_TIP],
  // Index
  [LM.WRIST, LM.INDEX_MCP], [LM.INDEX_MCP, LM.INDEX_PIP],
  [LM.INDEX_PIP, LM.INDEX_DIP], [LM.INDEX_DIP, LM.INDEX_TIP],
  // Middle
  [LM.WRIST, LM.MIDDLE_MCP], [LM.MIDDLE_MCP, LM.MIDDLE_PIP],
  [LM.MIDDLE_PIP, LM.MIDDLE_DIP], [LM.MIDDLE_DIP, LM.MIDDLE_TIP],
  // Ring
  [LM.WRIST, LM.RING_MCP], [LM.RING_MCP, LM.RING_PIP],
  [LM.RING_PIP, LM.RING_DIP], [LM.RING_DIP, LM.RING_TIP],
  // Pinky
  [LM.WRIST, LM.PINKY_MCP], [LM.PINKY_MCP, LM.PINKY_PIP],
  [LM.PINKY_PIP, LM.PINKY_DIP], [LM.PINKY_DIP, LM.PINKY_TIP],
  // Palm
  [LM.INDEX_MCP, LM.MIDDLE_MCP], [LM.MIDDLE_MCP, LM.RING_MCP],
  [LM.RING_MCP, LM.PINKY_MCP], [LM.PINKY_MCP, LM.WRIST],
];

// Palm polygon for translucent surface
export const PALM_INDICES = [
  LM.WRIST, LM.THUMB_CMC, LM.INDEX_MCP, LM.MIDDLE_MCP,
  LM.RING_MCP, LM.PINKY_MCP,
];
