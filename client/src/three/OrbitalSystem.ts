import * as THREE from 'three';

/** Geometry-only instruments; all motion is visual and independent of input state. */
export class OrbitalSystem extends THREE.Group {
  private tracks: THREE.Group[] = [];
  constructor() {
    super();
    for (let j = 0; j < 5; j++) {
      const track = new THREE.Group();
      const radius = 1.8 + j * 0.19;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) {
        const a = i / 160 * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const material = new THREE.LineBasicMaterial({ color: j === 3 ? '#9c896a' : '#4c90b5', transparent: true, opacity: j < 2 ? 0.5 : 0.24, depthWrite: false });
      track.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
      const ticks: THREE.Vector3[] = [];
      for (let i = 0; i < 100; i++) {
        if (j > 1 && i % 3) continue;
        const a = i / 100 * Math.PI * 2;
        const length = i % 5 === 0 ? 0.08 : 0.025;
        ticks.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius), new THREE.Vector3(Math.cos(a) * (radius + length), 0, Math.sin(a) * (radius + length)));
      }
      track.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), material));
      if (j < 2) {
        track.rotation.set(j === 0 ? 0.5 : -0.65, 0, j === 0 ? 0.25 : -0.45);
        const node = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.9, 2.4), toneMapped: false }));
        node.position.x = radius;
        track.add(node);
      } else track.position.y = -1.45 - (j - 2) * 0.07;
      this.tracks.push(track);
      this.add(track);
    }
  }
  update(time: number) {
    this.tracks.forEach((track, i) => { track.rotation.y = time * (i % 2 ? -0.023 : 0.018); });
  }
}
