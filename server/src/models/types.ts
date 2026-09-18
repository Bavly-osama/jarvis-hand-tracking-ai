export interface Session {
  id: string;
  startTime: number;
  deviceType: string;
  gestureCount: number;
  recognizedGestures: number;
  failedGestures: number;
  avgConfidence: number;
  calibration?: any;
}

export interface GestureEvent {
  type: string;
  gesture: string;
  confidence: number;
  velocity: number;
  hand: 'LEFT' | 'RIGHT' | 'UNKNOWN';
  duration: number;
  timestamp: number;
}

export interface AIRequest {
  recentGestures: string[];
  activeObject: string | null;
  uiState: string;
  gestureConfidence: number;
  hand: string;
}

export interface AIResponse {
  intent: string;
  confidence: number;
  reason: string;
}

export interface UserPreferences {
  gestureSensitivity: number;
  dominantHand: 'LEFT' | 'RIGHT';
  animationSpeed: number;
  soundEnabled: boolean;
  aiEnabled: boolean;
  trackingSensitivity: number;
}

export interface GestureConfig {
  swipe: { minVelocity: number; confidence: number };
  pinch: { threshold: number };
  zoom: { minDelta: number };
  rotate: { minVelocity: number };
  deadZone: number;
}
