import * as THREE from 'three';
import { Landmark } from '../tracking/LandmarkFilter';
import { HandPresenceState, HAND_CONNECTIONS, PALM_INDICES, LM } from '../tracking/NormalizedHandState';
import { ShaderLibrary } from '../three/ShaderLibrary';
import { screenToWorld } from '../tracking/ScreenProjection';

/**
 * Renders a premium holographic hand visualization from MediaPipe landmarks.
 */
export class HolographicHandRenderer {
  private group: THREE.Group;
  private scene: THREE.Scene;

  // Visuals
  private skeletonLines!: THREE.LineSegments;
  private palmLines!: THREE.LineSegments;
  private fingertipPoints!: THREE.Points;
  private indexReticle!: THREE.Mesh;
  private palmSurface!: THREE.Mesh;

  // Materials
  private boneMaterial!: THREE.LineBasicMaterial;
  private palmLineMaterial!: THREE.LineBasicMaterial;
  private pointMaterial!: THREE.ShaderMaterial;
  private reticleMaterial!: THREE.MeshBasicMaterial;
  private palmSurfaceMaterial!: THREE.MeshBasicMaterial;

  // Debug Points
  private debugRawPoints!: THREE.Points;
  private debugFilteredPoints!: THREE.Points;
  private debugPredictedPoints!: THREE.Points;

  // Colors
  private baseColor = new THREE.Color(0x88ccff);
  private tipColor = new THREE.Color(0xaaddff);

  // Constants
  private readonly TIPS = [4, 8, 12, 16, 20];
  
  constructor(scene: THREE.Scene, private camera: THREE.Camera) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.setupMaterials();
    this.setupVisuals();
    this.setupDebugVisuals();
  }

  private setupMaterials(): void {
    const commonProps = {
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    };

    this.boneMaterial = new THREE.LineBasicMaterial({
      color: this.baseColor,
      opacity: 0.7,
      ...commonProps
    });

    this.palmLineMaterial = new THREE.LineBasicMaterial({
      color: 0xaaeeff,
      opacity: 0.8,
      ...commonProps
    });

    this.pointMaterial = new THREE.ShaderMaterial({
      vertexShader: ShaderLibrary.particleGlow.vertexShader,
      fragmentShader: ShaderLibrary.particleGlow.fragmentShader,
      uniforms: {
        color: { value: this.tipColor },
        opacity: { value: 1.0 },
      },
      ...commonProps
    });

    this.reticleMaterial = new THREE.MeshBasicMaterial({
      color: this.tipColor,
      opacity: 0.9,
      side: THREE.DoubleSide,
      ...commonProps
    });

    this.palmSurfaceMaterial = new THREE.MeshBasicMaterial({
      color: this.baseColor,
      opacity: 0.1,
      side: THREE.DoubleSide,
      ...commonProps
    });
  }

  private setupVisuals(): void {
    // Skeleton
    const skeletonGeo = new THREE.BufferGeometry();
    const skeletonPositions = new Float32Array(HAND_CONNECTIONS.length * 2 * 3);
    skeletonGeo.setAttribute('position', new THREE.BufferAttribute(skeletonPositions, 3));
    this.skeletonLines = new THREE.LineSegments(skeletonGeo, this.boneMaterial);
    this.group.add(this.skeletonLines);

    // Palm Outline
    const palmGeo = new THREE.BufferGeometry();
    const palmPositions = new Float32Array(PALM_INDICES.length * 2 * 3);
    palmGeo.setAttribute('position', new THREE.BufferAttribute(palmPositions, 3));
    this.palmLines = new THREE.LineSegments(palmGeo, this.palmLineMaterial);
    this.group.add(this.palmLines);

    // Palm Surface (Triangle strip roughly based on palm indices)
    const palmSurfaceGeo = new THREE.BufferGeometry();
    const palmSurfacePositions = new Float32Array((PALM_INDICES.length - 2) * 3 * 3);
    palmSurfaceGeo.setAttribute('position', new THREE.BufferAttribute(palmSurfacePositions, 3));
    this.palmSurface = new THREE.Mesh(palmSurfaceGeo, this.palmSurfaceMaterial);
    this.group.add(this.palmSurface);

    // Fingertips
    const pointsGeo = new THREE.BufferGeometry();
    const pointsPositions = new Float32Array(this.TIPS.length * 3);
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(pointsPositions, 3));
    pointsGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(5).fill(.7), 1));
    pointsGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(5).fill(.05), 1));
    this.fingertipPoints = new THREE.Points(pointsGeo, this.pointMaterial);
    this.group.add(this.fingertipPoints);

    // Index Reticle
    const reticleGeo = new THREE.RingGeometry(0.15, 0.2, 32);
    this.indexReticle = new THREE.Mesh(reticleGeo, this.reticleMaterial);
    this.group.add(this.indexReticle);
  }

  private setupDebugVisuals(): void {
    const createDebugPoints = (colorHex: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3));
      const mat = new THREE.PointsMaterial({
        color: colorHex,
        size: 0.2,
        depthWrite: false,
        transparent: true
      });
      const points = new THREE.Points(geo, mat);
      points.visible = false;
      this.group.add(points);
      return points;
    };

    this.debugRawPoints = createDebugPoints(0xff0000);      // Red
    this.debugFilteredPoints = createDebugPoints(0x00ff00); // Green
    this.debugPredictedPoints = createDebugPoints(0xffff00);// Yellow
  }

  private toWorldPos(landmark: Landmark, outVector: THREE.Vector3): void {
    screenToWorld(landmark,this.camera,outVector);
  }

  public updateLandmarks(landmarks: Landmark[] | null, presenceState: HandPresenceState, opacity: number): void {
    if (!landmarks || landmarks.length !== 21 || presenceState === HandPresenceState.LOST) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;

    // Determine target opacity based on presence state
    let stateOpacity = 1.0;
    let isPulse = false;

    switch (presenceState) {
      case HandPresenceState.TRACKED:
        stateOpacity = 0.7;
        break;
      case HandPresenceState.REACQUIRING:
      case HandPresenceState.UNCERTAIN:
        stateOpacity = 0.45;
        break;
      case HandPresenceState.TEMPORARILY_LOST:
        stateOpacity = 0.25;
        isPulse = true;
        break;
      default:
        stateOpacity = 0;
    }

    const finalOpacity = stateOpacity * opacity;
    const pulseFactor = isPulse ? .85 : 1.0;
    const currentOpacity = finalOpacity * (isPulse ? pulseFactor : 1.0);

    // Update Materials
    this.boneMaterial.opacity = currentOpacity;
    this.palmLineMaterial.opacity = currentOpacity * 1.1;
    if (this.pointMaterial.uniforms.opacity) {
      this.pointMaterial.uniforms.opacity.value = currentOpacity * 1.2;
    }
    this.reticleMaterial.opacity = currentOpacity * 1.3;
    this.palmSurfaceMaterial.opacity = currentOpacity * 0.15;
    const alpha=this.fingertipPoints.geometry.attributes.alpha as THREE.BufferAttribute;
    for(let i=0;i<5;i++)alpha.setX(i,currentOpacity);
    alpha.needsUpdate=true;
    this.group.traverse(object=>{object.frustumCulled=false;});

    // Prepare temp vector
    const tempVec1 = new THREE.Vector3();
    const tempVec2 = new THREE.Vector3();

    // Update Skeleton
    const skelPos = this.skeletonLines.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const [startIdx, endIdx] = HAND_CONNECTIONS[i];
      this.toWorldPos(landmarks[startIdx], tempVec1);
      this.toWorldPos(landmarks[endIdx], tempVec2);
      
      skelPos.setXYZ(i * 2, tempVec1.x, tempVec1.y, tempVec1.z);
      skelPos.setXYZ(i * 2 + 1, tempVec2.x, tempVec2.y, tempVec2.z);
    }
    skelPos.needsUpdate = true;

    // Update Palm Lines
    const palmPos = this.palmLines.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < PALM_INDICES.length; i++) {
      const startIdx = PALM_INDICES[i];
      const endIdx = PALM_INDICES[(i + 1) % PALM_INDICES.length]; // Connect back to form a loop
      this.toWorldPos(landmarks[startIdx], tempVec1);
      this.toWorldPos(landmarks[endIdx], tempVec2);
      
      palmPos.setXYZ(i * 2, tempVec1.x, tempVec1.y, tempVec1.z);
      palmPos.setXYZ(i * 2 + 1, tempVec2.x, tempVec2.y, tempVec2.z);
    }
    palmPos.needsUpdate = true;

    // Update Palm Surface (naive triangulation for demonstration)
    const palmSurfPos = this.palmSurface.geometry.attributes.position as THREE.BufferAttribute;
    const originIdx = PALM_INDICES[0];
    this.toWorldPos(landmarks[originIdx], tempVec1);
    
    for (let i = 1; i < PALM_INDICES.length - 1; i++) {
      const idx2 = PALM_INDICES[i];
      const idx3 = PALM_INDICES[i + 1];
      
      this.toWorldPos(landmarks[idx2], tempVec2);
      
      const v3 = new THREE.Vector3();
      this.toWorldPos(landmarks[idx3], v3);

      const offset = (i - 1) * 3;
      palmSurfPos.setXYZ(offset, tempVec1.x, tempVec1.y, tempVec1.z);
      palmSurfPos.setXYZ(offset + 1, tempVec2.x, tempVec2.y, tempVec2.z);
      palmSurfPos.setXYZ(offset + 2, v3.x, v3.y, v3.z);
    }
    palmSurfPos.needsUpdate = true;

    // Update Fingertips
    const tipPos = this.fingertipPoints.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.TIPS.length; i++) {
      this.toWorldPos(landmarks[this.TIPS[i]], tempVec1);
      tipPos.setXYZ(i, tempVec1.x, tempVec1.y, tempVec1.z);
    }
    tipPos.needsUpdate = true;

    // Update Index Reticle
    this.toWorldPos(landmarks[LM.INDEX_TIP], tempVec1);
    this.indexReticle.position.copy(tempVec1);
    // Orient reticle slightly to face camera (assuming camera at origin)
    this.indexReticle.quaternion.copy(this.camera.quaternion);
    this.indexReticle.visible = true;
  }

  public setDebugMode(raw: Landmark[] | null, filtered: Landmark[] | null, predicted: Landmark[] | null): void {
    const updateDebugPoints = (points: THREE.Points, marks: Landmark[] | null) => {
      if (!marks || marks.length !== 21) {
        points.visible = false;
        return;
      }
      points.visible = true;
      const posAttr = points.geometry.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < 21; i++) {
        this.toWorldPos(marks[i], v);
        posAttr.setXYZ(i, v.x, v.y, v.z);
      }
      posAttr.needsUpdate = true;
    };

    updateDebugPoints(this.debugRawPoints, raw);
    updateDebugPoints(this.debugFilteredPoints, filtered);
    updateDebugPoints(this.debugPredictedPoints, predicted);
  }

  public dispose(): void {
    this.scene.remove(this.group);
    
    // Dispose geometries
    this.skeletonLines.geometry.dispose();
    this.palmLines.geometry.dispose();
    this.fingertipPoints.geometry.dispose();
    this.indexReticle.geometry.dispose();
    this.palmSurface.geometry.dispose();
    
    this.debugRawPoints.geometry.dispose();
    this.debugFilteredPoints.geometry.dispose();
    this.debugPredictedPoints.geometry.dispose();

    // Dispose materials
    this.boneMaterial.dispose();
    this.palmLineMaterial.dispose();
    this.pointMaterial.dispose();
    this.reticleMaterial.dispose();
    this.palmSurfaceMaterial.dispose();
    
    (this.debugRawPoints.material as THREE.Material).dispose();
    (this.debugFilteredPoints.material as THREE.Material).dispose();
    (this.debugPredictedPoints.material as THREE.Material).dispose();
  }
}
