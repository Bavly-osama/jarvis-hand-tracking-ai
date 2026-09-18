export const CONSTANTS = {
  GESTURE: {
    PINCH_THRESHOLD: 0.05,
    OPEN_HAND_THRESHOLD: 0.8,
    FIST_THRESHOLD: 0.2,
    ENTER_CONFIDENCE: 0.82,
    EXIT_CONFIDENCE: 0.6,
    AI_MIN_CONFIDENCE: 0.45,
    AI_MAX_CONFIDENCE: 0.75,
  },
  ANIMATION: {
    SPRING_STIFFNESS: 0.1,
    SPRING_DAMPING: 0.8,
    FRICTION: 0.92,
  },
  COLORS: {
    CYAN: '#00ffff',
    BLUE: '#0088ff',
    GREEN: '#00ff88',
    WHITE: '#ffffff',
  },
  SOCKET: {
    // Auto-detect: connect to whichever origin is serving this page
    URL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001',
    RECONNECT_DELAY: 1000,
  }
};
