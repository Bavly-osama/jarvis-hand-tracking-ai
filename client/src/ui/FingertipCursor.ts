import * as THREE from 'three';
import { ShaderLibrary } from '../three/ShaderLibrary';
import { PhysicsController } from '../animation/PhysicsController';

export class FingertipCursor {
  private scene:      THREE.Scene;
  public  group:      THREE.Group;

  private ring!:      THREE.Mesh;
  private dot!:       THREE.Mesh;
  private dwellRing!: THREE.Mesh;
  private trail!:     THREE.Points;

  // Spring-smoothed position
  private targetX: number = 0;
  private targetY: number = 0;
  private targetZ: number = 5;
  private currentX: number = 0;
  private currentY: number = 0;
  private currentZ: number = 5;
  private velX: number = 0;
  private velY: number = 0;
  private velZ: number = 0;

  // Pulse & Dwell state
  private pulseValue:    number = 0;
  private pulseTarget:   number = 0;
  private dwellProgress: number = 0; // 0..1

  // Trail
  private trailPositions: Float32Array = new Float32Array(0);
  private trailAlphas:    Float32Array = new Float32Array(0);
  private trailSizes:     Float32Array = new Float32Array(0);
  private readonly TRAIL_COUNT = 16;

  private visible_: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;

    this._buildRing();
    this._buildDot();
    this._buildDwellRing();
    this._buildTrail();

    scene.add(this.group);
  }

  private _buildRing() {
    const geo = new THREE.PlaneGeometry(0.32, 0.32);
    const mat = new THREE.ShaderMaterial({
      vertexShader:   ShaderLibrary.cursorRing.vertexShader,
      fragmentShader: ShaderLibrary.cursorRing.fragmentShader,
      uniforms: {
        time:  { value: 0 },
        pulse: { value: 0 },
        color: { value: new THREE.Color(0x9acbe0) }
      },
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      side:        THREE.DoubleSide
    });
    this.ring = new THREE.Mesh(geo, mat);
    this.group.add(this.ring);
  }

  private _buildDot() {
    const geo = new THREE.CircleGeometry(0.022, 16);
    const mat = new THREE.MeshBasicMaterial({
      color:       0xffffff,
      transparent: true,
      opacity:     0.95,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending
    });
    this.dot = new THREE.Mesh(geo, mat);
    this.dot.position.z = 0.001;
    this.group.add(this.dot);
  }

  private _buildDwellRing() {
    const geo = new THREE.RingGeometry(0.18, 0.22, 32);
    const mat = new THREE.MeshBasicMaterial({
      color:       0x00ffff,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      side:        THREE.DoubleSide,
      blending:    THREE.AdditiveBlending,
    });
    this.dwellRing = new THREE.Mesh(geo, mat);
    this.dwellRing.position.z = 0.002;
    this.group.add(this.dwellRing);
  }

  private _buildTrail() {
    const N = this.TRAIL_COUNT;
    this.trailPositions = new Float32Array(N * 3);
    this.trailAlphas    = new Float32Array(N);
    this.trailSizes     = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      this.trailAlphas[i] = 0;
      this.trailSizes[i]  = 0.12 * (1 - i / N);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.trailPositions, 3));
    geo.setAttribute('alpha',    new THREE.Float32BufferAttribute(this.trailAlphas, 1));
    geo.setAttribute('size',     new THREE.Float32BufferAttribute(this.trailSizes, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   ShaderLibrary.particleGlow.vertexShader,
      fragmentShader: ShaderLibrary.particleGlow.fragmentShader,
      uniforms:       { color: { value: new THREE.Color(0x9acbe0) } },
      blending:       THREE.AdditiveBlending,
      transparent:    true,
      depthWrite:     false
    });

    this.trail = new THREE.Points(geo, mat);
    this.scene.add(this.trail);
  }

  public updatePosition(x: number, y: number, z: number) {
    this.targetX   = x;
    this.targetY   = y;
    this.targetZ   = z;
    this.visible_  = true;
    this.group.visible = true;
    this.trail.visible = true;
  }

  public show() {
    this.visible_  = true;
    this.group.visible = true;
    this.trail.visible = true;
  }

  public hide() {
    this.visible_  = false;
    this.group.visible = false;
    this.trail.visible = false;
    for (let i = 0; i < this.TRAIL_COUNT; i++) this.trailAlphas[i] = 0;
    (this.trail.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  public pulse() {
    this.pulseTarget = 1.0;
  }

  public setDwellProgress(progress: number) {
    this.dwellProgress = Math.max(0, Math.min(1, progress));
  }

  public update(elapsed: number, dt: number = 0.016) {
    if (!this.visible_) return;

    // Spring-smooth cursor position
    const sx = PhysicsController.spring(this.currentX, this.targetX, this.velX, 350, 22, dt);
    const sy = PhysicsController.spring(this.currentY, this.targetY, this.velY, 350, 22, dt);
    const sz = PhysicsController.spring(this.currentZ, this.targetZ, this.velZ, 350, 22, dt);
    this.currentX = sx.position; this.velX = sx.velocity;
    this.currentY = sy.position; this.velY = sy.velocity;
    this.currentZ = sz.position; this.velZ = sz.velocity;

    this.group.position.set(this.currentX, this.currentY, this.currentZ);
    this.group.lookAt(this.group.position.clone().add(new THREE.Vector3(0, 0, 1)));

    // Update ring shader
    const ringMat = this.ring.material as THREE.ShaderMaterial;
    ringMat.uniforms.time.value  = elapsed;
    ringMat.uniforms.pulse.value = this.pulseValue;

    // Decay pulse
    this.pulseValue  = PhysicsController.lerp(this.pulseValue, this.pulseTarget, dt * 8);
    this.pulseTarget = PhysicsController.lerp(this.pulseTarget, 0, dt * 4);

    // Dwell ring animation
    const dwellMat = this.dwellRing.material as THREE.MeshBasicMaterial;
    if (this.dwellProgress > 0.05) {
      dwellMat.opacity = this.dwellProgress * 0.9;
      const scale = 0.8 + this.dwellProgress * 0.4;
      this.dwellRing.scale.setScalar(scale);
    } else {
      dwellMat.opacity = 0;
    }

    // Update trail
    for (let i = this.TRAIL_COUNT - 1; i > 0; i--) {
      this.trailPositions[i * 3]     = this.trailPositions[(i - 1) * 3];
      this.trailPositions[i * 3 + 1] = this.trailPositions[(i - 1) * 3 + 1];
      this.trailPositions[i * 3 + 2] = this.trailPositions[(i - 1) * 3 + 2];
    }
    this.trailPositions[0] = this.currentX;
    this.trailPositions[1] = this.currentY;
    this.trailPositions[2] = this.currentZ;

    for (let i = 0; i < this.TRAIL_COUNT; i++) {
      this.trailAlphas[i] = (1 - i / this.TRAIL_COUNT) * 0.55;
    }

    const geo = this.trail.geometry;
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.alpha    as THREE.BufferAttribute).needsUpdate = true;
  }
}
