import * as THREE from 'three';
import { createPanelArtwork } from './PanelArtwork';
import { ShaderLibrary } from './ShaderLibrary';
import { PhysicsController } from '../animation/PhysicsController';

export class HolographicCard {
  public  mesh:  THREE.Mesh;
  public  group: THREE.Group;
  public  title: string;

  private hoverGlowTarget: number = 0;
  private hoverGlow:       number = 0;
  private selectedTarget:  number = 0;
  private selected:        number = 0;

  // Magnetic tilt toward hand
  private tiltX: number = 0;
  private presentationVisibility = 1;
  public setPresentationVisibility(value: number) { this.presentationVisibility = value; }
  private tiltY: number = 0;
  private particles!: THREE.Points;
  private motionTrail!: THREE.Line;
  private previousX = 0;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(title: string) {
    this.title = title;
    this.group = new THREE.Group();

    // ── Holographic glass panel ──────────────────────────────────────────
    const geometry = new THREE.PlaneGeometry(1.5, 1.875);
    const material = new THREE.ShaderMaterial({
      vertexShader:   ShaderLibrary.holographicGlass.vertexShader,
      fragmentShader: ShaderLibrary.holographicGlass.fragmentShader,
      uniforms: {
        time:         { value: 0 },
        opacity:      { value: 0.85 },
        color:        { value: new THREE.Color(0x00ccff) },
        glowStrength: { value: 1.0 },
        selected:     { value: 0.0 }
      },
      transparent: true,
      side:        THREE.DoubleSide,
      blending:    THREE.NormalBlending,
      depthWrite:  false
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.group.add(this.mesh);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.49, 1.865), new THREE.MeshPhysicalMaterial({
      color: '#263a4c', metalness: 0.15, roughness: 0.22, transmission: 0.08,
      thickness: 0.04, ior: 1.45, clearcoat: 1, transparent: true, opacity: 0.16,
      depthWrite: false, side: THREE.DoubleSide
    }));
    glass.position.z = -0.015;
    this.group.add(glass);

    // ── Title canvas texture ─────────────────────────────────────────────
    this._buildTitleTexture(title);

    // ── Corner accent lines ──────────────────────────────────────────────
    this._buildCornerAccents();
    const points = Array.from({length: 12}, (_, i) => new THREE.Vector3(
      (i % 2 ? 1 : -1) * (0.79 + Math.sin(i * 4) * 0.035), (i / 11 - 0.5) * 1.8, 0.035
    ));
    this.particles = new THREE.Points(new THREE.BufferGeometry().setFromPoints(points), new THREE.PointsMaterial({
      color: '#a1cde2', size: 0.012, transparent: true, opacity: 0, depthWrite: false
    }));
    this.group.add(this.particles);
    this.motionTrail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.8, 0.88, -0.02), new THREE.Vector3(0.8, 0.88, -0.02)
    ]), new THREE.LineBasicMaterial({color: '#89b5d0', transparent: true, opacity: 0, depthWrite: false}));
    this.group.add(this.motionTrail);
  }

  private _buildTitleTexture(title: string) {
    const texture = createPanelArtwork(title);
    const mat = new THREE.MeshBasicMaterial({
      map:         texture,
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.NormalBlending
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.875), mat);
    plane.position.z = 0.018;
    plane.userData.artwork = true;
    this.group.add(plane);
  }

  private _buildCornerAccents() {
    const corners = [
      [-0.72, 0.90], [0.72, 0.90], [-0.72, -0.90], [0.72, -0.90]
    ];
    for (const [cx, cy] of corners) {
      const signX = cx > 0 ? 1 : -1;
      const signY = cy > 0 ? 1 : -1;
      const pts = [
        new THREE.Vector3(cx, cy - signY * 0.15, 0.008),
        new THREE.Vector3(cx, cy, 0.008),
        new THREE.Vector3(cx - signX * 0.15, cy, 0.008),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color:       0x8abed7,
        transparent: true,
        opacity:     0.5,
        blending:    THREE.AdditiveBlending
      });
      this.group.add(new THREE.Line(geo, mat));
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  public setHover(value: boolean) {
    this.hoverGlowTarget = value ? 1.0 : 0.0;
  }

  public setSelected(value: boolean) {
    this.selectedTarget = value ? 1.0 : 0.0;
  }

  /**
   * Magnetic tilt toward a world-space hand position.
   * @param handPos hand position in world space
   * @param cardWorldPos card center in world space
   * @param strength 0–1
   */
  public applyMagneticTilt(handPos: THREE.Vector3, cardWorldPos: THREE.Vector3, strength: number) {
    const delta = handPos.clone().sub(cardWorldPos);
    this.tiltX = PhysicsController.lerp(this.tiltX, -delta.y * 0.4 * strength, 0.15);
    this.tiltY = PhysicsController.lerp(this.tiltY,  delta.x * 0.4 * strength, 0.15);
  }

  public update(time: number, dt: number = 0.016) {
    // Smooth hover + selected
    this.hoverGlow = PhysicsController.lerp(this.hoverGlow, this.hoverGlowTarget, dt * 8);
    this.selected  = PhysicsController.lerp(this.selected,  this.selectedTarget,  dt * 6);

    // Apply tilt
    this.mesh.rotation.x = this.tiltX * 0.12;
    this.mesh.rotation.y = this.tiltY * 0.12;

    // Update shader uniforms
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms;
    u.time.value         = this.reduced.matches ? 0 : time;
    u.glowStrength.value = 1.0 + this.hoverGlow * 0.3;
    u.selected.value     = Math.max(this.hoverGlow, this.selected);
    const motion = Math.min(Math.abs(this.group.position.x - this.previousX) / Math.max(dt, 0.001), 3);
    this.previousX = this.group.position.x;
    (this.motionTrail.material as THREE.LineBasicMaterial).opacity = this.reduced.matches ? 0 : motion * 0.025;
    this.motionTrail.scale.x = 1 + motion * 0.09;
    (this.particles.material as THREE.PointsMaterial).opacity = this.selected * 0.45 * this.presentationVisibility;
    this.particles.position.y = this.reduced.matches ? 0 : Math.sin(time * 0.6) * 0.035;
    this.group.children.forEach(child => {
      const material = (child as THREE.Mesh).material as THREE.Material & {opacity: number};
      if (material && !child.userData.artwork && child !== this.mesh && child !== this.particles && child !== this.motionTrail) {
        if (child.userData.baseOpacity === undefined) child.userData.baseOpacity = material.opacity;
        material.opacity = child.userData.baseOpacity * this.presentationVisibility;
      }
      if (child.userData.artwork) (child as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity = (0.3 + u.opacity.value * 0.7) * this.presentationVisibility;
    });

  }
}
