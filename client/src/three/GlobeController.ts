import * as THREE from 'three';
import { OrbitalSystem } from './OrbitalSystem';
import { ShaderLibrary } from './ShaderLibrary';
import { PhysicsController } from '../animation/PhysicsController';
import type { PerformanceSettings } from '../perf/PerformanceProfileManager';

// ─── Zoom level detail types ────────────────────────────────────────────────
interface CityNode {
  lat: number;
  lon: number;
  name: string;
}

const CITIES: CityNode[] = [
  { lat: 40.7, lon: -74.0, name: 'New York' },
  { lat: 51.5, lon: -0.1,  name: 'London'   },
  { lat: 35.7, lon: 139.7, name: 'Tokyo'    },
  { lat: 48.9, lon:  2.3,  name: 'Paris'    },
  { lat: 22.3, lon: 114.2, name: 'Hong Kong'},
  { lat: -33.9, lon: 151.2, name: 'Sydney'  },
  { lat: 55.8, lon:  37.6, name: 'Moscow'   },
  { lat: 19.4, lon: -99.1, name: 'Mexico City'},
  { lat: -23.5, lon: -46.6, name: 'São Paulo'},
  { lat:  1.3,  lon: 103.8, name: 'Singapore'},
];

function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}

// ─── GlobeController ────────────────────────────────────────────────────────

export class GlobeController {
  public  group: THREE.Group;

  private orbits = new OrbitalSystem();
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private globe!:       THREE.Mesh;
  private cloudLayer!:  THREE.Mesh;
  private nightLayer!:  THREE.Mesh;
  private atmosphere!:  THREE.Mesh;

  // Zoom-level overlay groups
  private continentWireframe!: THREE.Group;  // L2
  private dataArcs!:           THREE.Group;  // L3
  private cityNodes!:          THREE.Group;  // L4
  private infoOverlays!:       THREE.Group;  // L5

  // Physics / rotation inertia
  private angularVelocityX: number = 0;
  private angularVelocityY: number = 0;
  private idleRotationSpeed: number = 0.04;
  private interacting: boolean = false;
  private interactCooldown: number = 0;

  // Zoom spring
  private currentScale: number = 1.0;
  private targetScale:  number = 1.0;
  private scaleVelocity:number = 0;
  private currentZoomLevel: number = 1;
  private globeSegments = 64;

  // Arc animation time
  private arcTime: number = 0;

  constructor(profile?: Pick<PerformanceSettings, 'globeSegments' | 'clouds' | 'orbitClutter'>) {
    this.group = new THREE.Group();
    this.group.position.y = 0.5;
    this.globeSegments = profile?.globeSegments ?? 64;
    this.group.add(this.orbits);
    this._buildGlobe();
    this._buildAtmosphere();
    this._buildCloudLayer();
    this._buildNightLayer();
    this._buildContinentWireframe();
    this._buildDataArcs();
    this._buildCityNodes();
    this._buildInfoOverlays();
    this._setZoomLevelVisibility(1);
    if (profile) this.applyProfile(profile);
  }

  applyProfile(profile: Pick<PerformanceSettings, 'clouds' | 'orbitClutter'>) {
    this.cloudLayer.visible = profile.clouds !== false;
    this.orbits.visible = profile.orbitClutter !== false;
  }

  // ── Construction helpers ──────────────────────────────────────────────────

  private _buildGlobe() {
    const geo = new THREE.SphereGeometry(1.5, this.globeSegments, this.globeSegments);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb5bec9, roughness: 0.88, metalness: 0.08,
      emissive: new THREE.Color('#ffca88'), emissiveIntensity: 1.1
    });
    const loader = new THREE.TextureLoader();
    loader.load('/textures/earth_day.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; });
    loader.load('/textures/earth_night.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; mat.emissiveMap = t; mat.needsUpdate = true; });
    mat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
        totalEmissiveRadiance *= 1.0 - smoothstep(-0.1, 0.6, dot(worldNormal, normalize(vec3(-3.,5.,4.))));
      `);
    };
    this.globe = new THREE.Mesh(geo, mat);
    this.globe.rotation.y = -1.8;
    this.group.add(this.globe);
  }

  private _buildAtmosphere() {
    const geo = new THREE.SphereGeometry(1.545, this.globeSegments, this.globeSegments);
    const mat = new THREE.ShaderMaterial({
      vertexShader:   ShaderLibrary.atmosphere.vertexShader,
      fragmentShader: ShaderLibrary.atmosphere.fragmentShader,
      uniforms: {
        atmosphereStrength: { value: 0.72 },
        atmosphereColor:    { value: new THREE.Color(0.15, 0.55, 1.0) }
      },
      blending:    THREE.AdditiveBlending,
      side:        THREE.FrontSide,
      transparent: true,
      depthWrite:  false
    });
    this.atmosphere = new THREE.Mesh(geo, mat);
    this.group.add(this.atmosphere);
  }

  private _buildCloudLayer() {
    const geo = new THREE.SphereGeometry(1.52, this.globeSegments, this.globeSegments);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 1,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      color:       0xffffff,
      blending:    THREE.NormalBlending
    });
    const loader = new THREE.TextureLoader();
    loader.load('/textures/earth_clouds.jpg', t => {
      (mat as any).alphaMap = t;
      mat.opacity = 0.18;
      mat.needsUpdate = true;
    }, undefined, () => {});
    this.cloudLayer = new THREE.Mesh(geo, mat);
    this.group.add(this.cloudLayer);
  }

  private _buildNightLayer() {
    // Night lights as additive overlay on the night side
    const geo = new THREE.SphereGeometry(1.501, this.globeSegments, this.globeSegments);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity:     0.0,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      color:       0xffffaa
    });
    const loader = new THREE.TextureLoader();
    loader.load('/textures/earth_night.jpg', t => {
      (mat as THREE.MeshBasicMaterial).map = t;
      mat.needsUpdate = true;
    }, undefined, () => {});
    this.nightLayer = new THREE.Mesh(geo, mat);
    // City illumination is shaded on the Earth material, never a whole glowing shell.
    this.nightLayer.visible = false;
    this.group.add(this.nightLayer);
  }

  private _buildContinentWireframe() {
    this.continentWireframe = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: '#5b96b9', transparent: true, opacity: 0.11, depthWrite: false });
    for (let lat = -60; lat <= 60; lat += 30) {
      const points = Array.from({length: 129}, (_, i) => latLonToVec3(lat, i / 128 * 360, 1.512));
      this.continentWireframe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat));
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const points = Array.from({length: 65}, (_, i) => latLonToVec3(-90 + i / 64 * 180, lon, 1.512));
      this.continentWireframe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat));
    }
    this.continentWireframe.visible = false;
    this.group.add(this.continentWireframe);
  }

  private _buildDataArcs() {
    this.dataArcs = new THREE.Group();
    this.dataArcs.visible = false;

    const arcPairs: [CityNode, CityNode][] = [
      [CITIES[0], CITIES[1]], [CITIES[1], CITIES[2]],
      [CITIES[3], CITIES[4]], [CITIES[5], CITIES[6]],
      [CITIES[7], CITIES[8]], [CITIES[0], CITIES[9]],
    ];

    for (const [a, b] of arcPairs) {
      this._createArc(
        latLonToVec3(a.lat, a.lon, 1.51),
        latLonToVec3(b.lat, b.lon, 1.51),
        48
      );
    }

    this.group.add(this.dataArcs);
  }

  private _createArc(p1: THREE.Vector3, p2: THREE.Vector3, segments: number) {
    const mid = p1.clone().add(p2).multiplyScalar(0.5).normalize().multiplyScalar(2.1);
    const points: THREE.Vector3[] = [];
    const tValues: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t  = i / segments;
      const pt = new THREE.QuadraticBezierCurve3(p1, mid, p2).getPoint(t);
      points.push(pt);
      tValues.push(t);
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    geo.setAttribute('t', new THREE.Float32BufferAttribute(tValues, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   ShaderLibrary.dataArc.vertexShader,
      fragmentShader: ShaderLibrary.dataArc.fragmentShader,
      uniforms: {
        time:  { value: 0 },
        speed: { value: 0.3 + Math.random() * 0.2 },
        color: { value: new THREE.Color(0x8ecce8) }
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending
    });

    this.dataArcs.add(new THREE.Line(geo, mat));
  }

  private _buildCityNodes() {
    this.cityNodes = new THREE.Group();
    this.cityNodes.visible = false;

    const spriteMat = new THREE.SpriteMaterial({
      color:   0x96c8dd,
      blending:THREE.AdditiveBlending
    });

    for (const city of CITIES) {
      const pos = latLonToVec3(city.lat, city.lon, 1.55);
      const sprite = new THREE.Sprite(spriteMat.clone());
      sprite.scale.setScalar(0.04);
      sprite.position.copy(pos);
      (sprite as any).userData = { name: city.name };
      this.cityNodes.add(sprite);

      // Pulse ring
      const ringGeo = new THREE.RingGeometry(0.01, 0.025, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color:       0x8ecce8,
        transparent: true,
        opacity:     0.7,
        side:        THREE.DoubleSide,
        blending:    THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      (ring as any).userData = { isPulse: true, baseOpacity: 0.7 };
      this.cityNodes.add(ring);
    }

    this.group.add(this.cityNodes);
  }

  private _buildInfoOverlays() {
    this.infoOverlays = new THREE.Group();
    this.infoOverlays.visible = false;

    // Animated connection lines between all cities
    for (let i = 0; i < CITIES.length; i++) {
      for (let j = i + 1; j < Math.min(i + 3, CITIES.length); j++) {
        const p1 = latLonToVec3(CITIES[i].lat, CITIES[i].lon, 1.52);
        const p2 = latLonToVec3(CITIES[j].lat, CITIES[j].lon, 1.52);
        const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const mat = new THREE.LineBasicMaterial({
          color:       0x004488,
          transparent: true,
          opacity:     0.4,
          blending:    THREE.AdditiveBlending
        });
        this.infoOverlays.add(new THREE.Line(geo, mat));
      }
    }

    this.group.add(this.infoOverlays);
  }

  // ── Visibility control ────────────────────────────────────────────────────

  private _setZoomLevelVisibility(level: number) {
    this.continentWireframe.visible = level >= 1;
    this.dataArcs.visible           = level >= 1;
    this.cityNodes.visible          = level >= 1;
    this.infoOverlays.visible       = level >= 5;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Called every frame from the render loop.
   * @param delta seconds since last frame
   * @param elapsed total elapsed time
   */
  public update(delta: number, elapsed: number = 0) {
    // ── Arc animation time
    this.orbits.update(this.reduced.matches ? 0 : elapsed);
    this.arcTime += this.reduced.matches ? 0 : delta;
    this.dataArcs.children.forEach(child => {
      const mat = (child as THREE.Line).material as THREE.ShaderMaterial;
      if (mat.uniforms?.time) mat.uniforms.time.value = this.arcTime;
    });

    // ── Interaction cooldown → restore idle
    if (this.interactCooldown > 0) {
      this.interactCooldown -= delta;
    } else {
      this.interacting = false;
    }

    // ── Inertia decay
    if (!this.interacting) {
      this.angularVelocityX = PhysicsController.applyFriction(this.angularVelocityX, 0.95, delta);
      this.angularVelocityY = PhysicsController.applyFriction(this.angularVelocityY, 0.95, delta);
    }

    // ── Apply rotation
    const idleContrib = this.interacting || this.reduced.matches ? 0 : this.idleRotationSpeed * 0.35;
    this.globe.rotation.y += (this.angularVelocityY + idleContrib) * delta;
    this.globe.rotation.x += this.angularVelocityX * delta;

    this.nightLayer.rotation.copy(this.globe.rotation);
    // Cloud layer drifts slightly faster
    this.cloudLayer.rotation.y += (idleContrib + (this.reduced.matches ? 0 : 0.005) + this.angularVelocityY * 0.8) * delta;

    // Sync continent / arc / node / info groups with globe rotation
    [this.continentWireframe, this.dataArcs, this.cityNodes, this.infoOverlays]
      .forEach(g => {
        g.rotation.copy(this.globe.rotation);
      });

    // ── Scale spring
    const spring = PhysicsController.spring(
      this.currentScale,
      this.targetScale,
      this.scaleVelocity,
      200, // stiffness
      18,  // damping
      delta
    );
    this.currentScale  = spring.position;
    this.scaleVelocity = spring.velocity;
    this.group.scale.setScalar(this.currentScale);

    // ── City node pulse animation
    if (this.cityNodes.visible) {
      this.cityNodes.children.forEach((child, i) => {
        if ((child as any).userData?.isPulse) {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = 0.4 + 0.4 * Math.abs(Math.sin(elapsed * 2 + i * 0.8));
        }
      });
    }

    // ── Night layer — fade based on inferred time-of-day feel
    const nightMat = this.nightLayer.material as THREE.MeshBasicMaterial;
    nightMat.opacity = 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 0.05));
  }

  /**
   * Direct positional rotation during active hand grab (connected 1:1 feel).
   */
  public directRotate(dx: number, dy: number) {
    this.interacting = true;
    this.interactCooldown = 0.25;
    this.globe.rotation.y += dx * 2.2;
    this.globe.rotation.x = Math.max(-1.2, Math.min(1.2, this.globe.rotation.x + dy * 2.2));
  }

  /**
   * Release grab with inertia momentum.
   */
  public releaseInertia(vx: number, vy: number) {
    this.interacting = false;
    this.angularVelocityY = Math.max(-3.5, Math.min(3.5, vx * 1.5));
    this.angularVelocityX = Math.max(-2.0, Math.min(2.0, vy * 1.5));
  }

  /**
   * Add hand-driven rotation velocity (called from InteractionManager).
   * @param vx normalized horizontal velocity
   * @param vy normalized vertical velocity
   */
  public rotateByVelocity(vx: number, vy: number) {
    this.interacting = true;
    this.interactCooldown = 0.25;
    this.angularVelocityY = Math.max(-4, Math.min(4, vx * 2.2));
    this.angularVelocityX = Math.max(-2.5, Math.min(2.5, vy * 2.2));
  }

  /**
   * Set target scale (animated via spring).
   * @param scale target uniform scale
   */
  public applyZoom(scale: number) {
    this.targetScale = Math.max(0.4, Math.min(3.5, scale));
    this._updateZoomLevel();
  }

  private _updateZoomLevel() {
    const s = this.targetScale;
    let level = 1;
    if (s > 1.3) level = 2;
    if (s > 1.7) level = 3;
    if (s > 2.2) level = 4;
    if (s > 2.8) level = 5;
    if (level !== this.currentZoomLevel) {
      this.currentZoomLevel = level;
      this._setZoomLevelVisibility(level);
    }
  }

  /** Directly set zoom level (maps to scale + visibility) */
  public setZoomLevel(level: number) {
    const scales = [1, 1.3, 1.7, 2.2, 2.8];
    this.targetScale = scales[Math.max(0, Math.min(4, level - 1))];
    this.currentZoomLevel = level;
    this._setZoomLevelVisibility(level);
  }

  /** Reset interaction inertia (called on tracking loss) */
  public resetInertia() {
    this.angularVelocityX = 0;
    this.angularVelocityY = 0;
    this.interacting      = false;
    this.interactCooldown = 0;
  }
}
