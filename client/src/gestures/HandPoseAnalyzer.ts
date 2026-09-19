import { Landmark } from '../tracking/LandmarkFilter';
import { HandPose, FingerState, LM, Finger } from '../tracking/NormalizedHandState';

// ─── Configuration ──────────────────────────────────────────────────────────

const EXTENSION_RATIO = 1.12;   // tip must be this much further than MCP from wrist
const CURL_BASELINE   = 0.16;   // baseline hand size for curl normalization

// Finger landmark index groups: [MCP, PIP, DIP, TIP]
const FINGER_LANDMARKS: Record<Finger, [number, number, number, number]> = {
  [Finger.THUMB]:  [LM.THUMB_MCP, LM.THUMB_IP, LM.THUMB_IP, LM.THUMB_TIP],
  [Finger.INDEX]:  [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP],
  [Finger.MIDDLE]: [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP],
  [Finger.RING]:   [LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP],
  [Finger.PINKY]:  [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function sub(a: Landmark, b: Landmark): { x: number; y: number; z: number } {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 0.0001) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = sub(a, b);
  const v2 = sub(c, b);
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
  const m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);
  if (m1 < 0.0001 || m2 < 0.0001) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
}

// ─── HandPoseAnalyzer ───────────────────────────────────────────────────────

export interface PoseAnalysis {
  pose:           HandPose;
  poseConfidence: number;
  openness:       number;      // 0 = fist, 1 = fully open
  fingers:        FingerState[];
  fingerCurls:    number[];    // per-finger curl 0..1
  pinchDistance:   number;     // thumb-index, normalized by hand size
  indexMiddleSep:  number;     // separation between index and middle tips
  palmNormal:      { x: number; y: number; z: number };
  wristOrientation: { x: number; y: number; z: number };
  handSize:        number;
  fistConfidence:  number;
}

export class HandPoseAnalyzer {
  // ── Analyze landmarks → semantic pose ─────────────────────────────────

  public analyze(landmarks: Landmark[]): PoseAnalysis {
    const wrist = landmarks[LM.WRIST];
    const middleMcp = landmarks[LM.MIDDLE_MCP];
    const handSize = dist(wrist, middleMcp);
    const palmWidth = dist(landmarks[LM.INDEX_MCP], landmarks[LM.PINKY_MCP]);
    const sizeNorm = Math.max(palmWidth, handSize, 0.01);

    // Per-finger analysis
    const fingerStates: FingerState[] = [];
    const fingerCurls: number[] = [];

    for (let f = 0; f < 5; f++) {
      const finger = f as Finger;
      const [mcp, pip, dip, tip] = FINGER_LANDMARKS[finger].map(i => landmarks[i]);
      const state = this.analyzeFingerState(finger, mcp, pip, dip, tip, wrist, sizeNorm);
      fingerStates.push(state);
      fingerCurls.push(state.curl);
    }

    // Openness: average of (1 - curl) for 4 non-thumb fingers
    const openness = (
      (1 - fingerCurls[Finger.INDEX]) +
      (1 - fingerCurls[Finger.MIDDLE]) +
      (1 - fingerCurls[Finger.RING]) +
      (1 - fingerCurls[Finger.PINKY])
    ) / 4;

    // Pinch distance
    const pinchDistance = dist(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP]) / sizeNorm;

    // Index-middle separation
    const indexMiddleSep = dist(landmarks[LM.INDEX_TIP], landmarks[LM.MIDDLE_TIP]) / sizeNorm;

    // Palm normal (cross product of two palm vectors)
    const v1 = sub(landmarks[LM.INDEX_MCP], wrist);
    const v2 = sub(landmarks[LM.PINKY_MCP], wrist);
    const palmNormal = normalize(cross(v1, v2));

    // Wrist orientation
    const wristDir = normalize(sub(middleMcp, wrist));

    // Fist confidence
    const fistConfidence = this.computeFistConfidence(fingerCurls, openness);

    // Classify pose
    const { pose, confidence } = this.classifyPose(
      fingerStates, fingerCurls, openness, pinchDistance,
      fistConfidence, handSize
    );

    return {
      pose,
      poseConfidence: confidence,
      openness,
      fingers: fingerStates,
      fingerCurls,
      pinchDistance,
      indexMiddleSep,
      palmNormal,
      wristOrientation: wristDir,
      handSize,
      fistConfidence,
    };
  }

  // ── Analyze individual finger ─────────────────────────────────────────

  private analyzeFingerState(
    finger: Finger,
    mcp: Landmark, pip: Landmark, dip: Landmark, tip: Landmark,
    wrist: Landmark, handSize: number
  ): FingerState {
    // Extension check: is tip further from wrist than MCP?
    const tipDist = dist(tip, wrist);
    const mcpDist = dist(mcp, wrist);
    const extended = tipDist > mcpDist * EXTENSION_RATIO;

    // Curl: angle-based
    // Curl = 1 means fully curled (angles are small/tight)
    // Curl = 0 means fully extended (angles are ~180°)
    let curl: number;
    if (finger === Finger.THUMB) {
      // Thumb has different geometry — use distance ratio
      const maxDist = dist(mcp, wrist) * 1.8;
      curl = 1 - Math.min(1, tipDist / Math.max(maxDist, 0.01));
    } else {
      const angle1 = angleBetween(mcp, pip, dip);
      const angle2 = angleBetween(pip, dip, tip);
      // Straight finger: angles ~π, curled: angles small
      curl = 1 - Math.min(1, ((angle1 + angle2) / (2 * Math.PI)) * 1.2);
    }
    curl = Math.max(0, Math.min(1, curl));

    // Direction: tip relative to DIP
    const direction = normalize(sub(tip, dip));

    return { extended, curl, direction };
  }

  // ── Fist confidence ───────────────────────────────────────────────────

  private computeFistConfidence(curls: number[], openness: number): number {
    // High curl on all non-thumb fingers = fist
    const avgCurl = (curls[Finger.INDEX] + curls[Finger.MIDDLE] +
                     curls[Finger.RING] + curls[Finger.PINKY]) / 4;
    // Boosted when all fingers are consistently curled
    const minCurl = Math.min(
      curls[Finger.INDEX], curls[Finger.MIDDLE],
      curls[Finger.RING], curls[Finger.PINKY]
    );
    const consistency = minCurl > 0.4 ? 1.0 : minCurl / 0.4;

    return Math.min(1, avgCurl * 0.6 + consistency * 0.4);
  }

  // ── Classify hand pose ────────────────────────────────────────────────

  private classifyPose(
    fingers: FingerState[],
    curls: number[],
    openness: number,
    pinchDist: number,
    fistConf: number,
    handSize: number
  ): { pose: HandPose; confidence: number } {
    // Score each pose candidate
    const scores: { pose: HandPose; score: number }[] = [];

    // PINCH: thumb and index close together
    if (pinchDist < 0.25) {
      const pinchScore = Math.max(0, 1 - pinchDist / 0.25);
      scores.push({ pose: HandPose.PINCH, score: pinchScore });
    }

    // FIST: all fingers curled
    if (fistConf > 0.5) {
      scores.push({ pose: HandPose.FIST, score: fistConf });
    }

    // POINT: only index extended
    const indexExt = fingers[Finger.INDEX].extended;
    const middleExt = fingers[Finger.MIDDLE].extended;
    const ringExt = fingers[Finger.RING].extended;
    const pinkyExt = fingers[Finger.PINKY].extended;

    if (indexExt && !middleExt && !ringExt && !pinkyExt) {
      const pointScore = 0.5 + (1 - curls[Finger.INDEX]) * 0.3 +
                         curls[Finger.MIDDLE] * 0.1 + curls[Finger.RING] * 0.1;
      scores.push({ pose: HandPose.POINT, score: Math.min(1, pointScore) });
    }

    // TAP_READY: index extended and relatively stable, pointing forward
    if (indexExt && !middleExt) {
      const forwardness = Math.abs(fingers[Finger.INDEX].direction.z);
      if (forwardness > 0.3) {
        scores.push({ pose: HandPose.TAP_READY, score: 0.5 + forwardness * 0.3 });
      }
    }

    // OPEN_PALM: all fingers extended
    if (openness > 0.65) {
      const openScore = openness * 0.8 + 0.2;
      scores.push({ pose: HandPose.OPEN_PALM, score: Math.min(1, openScore) });
    }

    // RELAXED: partial extension, neutral pose
    if (openness > 0.3 && openness < 0.7 && fistConf < 0.4) {
      scores.push({ pose: HandPose.RELAXED, score: 0.5 });
    }

    // Select highest scoring pose
    if (scores.length === 0) {
      return { pose: HandPose.UNKNOWN, confidence: 0.3 };
    }

    scores.sort((a, b) => b.score - a.score);
    return { pose: scores[0].pose, confidence: scores[0].score };
  }
}
