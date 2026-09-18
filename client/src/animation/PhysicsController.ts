/**
 * PhysicsController — shared spring / inertia / friction math
 * All methods are stateless helpers, intentionally kept pure.
 */

export interface SpringResult {
  position: number;
  velocity: number;
}

export class PhysicsController {

  /**
   * Semi-implicit Euler spring integrator.
   * @param position  current value
   * @param target    desired value
   * @param velocity  current velocity
   * @param stiffness spring constant k  (e.g. 200 for snappy, 80 for loose)
   * @param damping   damping coefficient (e.g. 18 for critical-ish)
   * @param dt        delta time in seconds
   */
  static spring(
    position:  number,
    target:    number,
    velocity:  number,
    stiffness: number = 200,
    damping:   number = 18,
    dt:        number = 0.016
  ): SpringResult {
    const displacement = position - target;
    const springForce  = -stiffness * displacement;
    const dampForce    = -damping * velocity;
    const acceleration = springForce + dampForce;

    // Clamp dt to avoid instability at low frame rates
    const safeDt = Math.min(dt, 0.05);
    const newVelocity = velocity + acceleration * safeDt;
    const newPosition = position + newVelocity * safeDt;

    // Snap to target when close enough to avoid micro-oscillation
    if (Math.abs(newVelocity) < 0.0001 && Math.abs(newPosition - target) < 0.0001) {
      return { position: target, velocity: 0 };
    }

    return { position: newPosition, velocity: newVelocity };
  }

  /**
   * Frame-rate-independent exponential friction.
   * @param velocity  current velocity
   * @param friction  per-second friction factor (0 = instant stop, 0.95 = very slippery)
   * @param dt        delta time in seconds
   */
  static applyFriction(velocity: number, friction: number, dt: number): number {
    // Raise friction to the power of dt to make it frame-rate independent
    return velocity * Math.pow(friction, dt * 60);
  }

  /**
   * Smooth linear interpolation.
   */
  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(Math.max(t, 0), 1);
  }

  /**
   * Clamp value between min and max.
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Map a value from one range to another.
   */
  static remap(
    value:  number,
    inMin:  number,
    inMax:  number,
    outMin: number,
    outMax: number
  ): number {
    const t = (value - inMin) / (inMax - inMin);
    return outMin + PhysicsController.clamp(t, 0, 1) * (outMax - outMin);
  }

  /**
   * Smoothly snap an angle to the nearest multiple of step.
   */
  static snapAngle(angle: number, step: number, velocity: number, stiffness: number, damping: number, dt: number): SpringResult {
    const nearest = Math.round(angle / step) * step;
    return PhysicsController.spring(angle, nearest, velocity, stiffness, damping, dt);
  }
}
