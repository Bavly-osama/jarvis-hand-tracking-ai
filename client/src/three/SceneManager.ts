import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class SceneManager {
  public scene = new THREE.Scene();
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private aa = new ShaderPass(FXAAShader);
  private dust: THREE.Points;
  private floor: THREE.Mesh;
  private time = 0;
  private resize = () => this.onResize();
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  constructor(container: HTMLElement) {
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setClearAlpha(0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.domElement.classList.add('jarvis-effects');
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.AmbientLight('#6384a3', 0.35));
    const key = new THREE.DirectionalLight('#c2dcf6', 2.1);
    key.position.set(-3, 5, 4);
    const rim = new THREE.DirectionalLight('#537cae', 0.65);
    rim.position.set(4, 1, -3);
    this.scene.add(key, rim);
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);
    // HDR threshold limits bloom to deliberately over-range highlights.
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.35, 1.05));
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.aa);
    const positions = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      positions[i * 3] = Math.sin(i * 127.1) * 18;
      positions[i * 3 + 1] = Math.cos(i * 79.7) * 10;
      positions[i * 3 + 2] = -4 - (i % 47) * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#86abc6', size: 0.018, transparent: true, opacity: 0.25, depthWrite: false }));
    this.scene.add(this.dust);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 p; void main(){p=uv*36.-18.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 p; uniform float time;
        void main(){float r=length(p); vec2 g=abs(fract(p*1.5-.5)-.5)/fwidth(p*1.5);
        float grid=1.-min(min(g.x,g.y),1.); float rings=1.-smoothstep(.012,.024,abs(sin(r*2.8)));
        float pulse=exp(-pow(r-mod(time*.28,12.),2.)*30.);
        float a=(grid*.03+rings*.075+pulse*rings*.12)*exp(-r*.28);
        gl_FragColor=vec4(.22,.43,.58,a);}`
    }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -2.05;
    this.scene.add(this.floor);
    this.onResize();
    window.addEventListener('resize', this.resize);
  }
  render(delta = 0.016) {
    this.time += this.reduced.matches ? 0 : Math.min(delta, 0.05);
    this.dust.rotation.y = this.time * 0.002;
    (this.floor.material as THREE.ShaderMaterial).uniforms.time.value = this.time;
    this.composer.render();
  }
  private onResize() {
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    this.camera.position.set(0, 2.5, aspect < 0.8 ? 12.8 : 10.8);
    this.camera.lookAt(0, -0.2, 0);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    const ratio = this.renderer.getPixelRatio();
    this.aa.uniforms.resolution.value.set(1 / (innerWidth * ratio), 1 / (innerHeight * ratio));
    this.dust.geometry.setDrawRange(0, aspect < 0.8 ? 65 : 180);
  }
  dispose() {
    window.removeEventListener('resize', this.resize);
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    });
    this.composer.passes.forEach(pass => pass.dispose());
    this.composer.dispose();
    this.renderer.dispose();
  }
}
