import * as THREE from 'three';
import { ModuleName } from './modules';

/** Reusable scene objects. Animations change transforms; no per-frame allocation. */
export class ExperienceView {
  group = new THREE.Group();
  elements: THREE.Mesh[] = [];
  rings: THREE.Mesh[] = [];
  links: THREE.Line[] = [];
  aim: THREE.Mesh;
  burst: THREE.Mesh;
  sweep: THREE.Mesh;
  private resources: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  constructor(public name: ModuleName) {
    this.aim = this.ring(.19, '#d7bb86');
    this.aim.visible = false;
    this.burst = this.ring(.3, '#b9eaff'); this.burst.visible = false;
    this.sweep = this.ring(2.3, '#76c4e5', Math.PI * .35); this.sweep.visible = false;
    if (name === 'Earth') {
      this.label('TERRA / LOCATION EXPLORER', 0, 2.4, .9);
      return;
    }
    for (let i=0;i<3;i++) { const r=this.ring(1.1+i*.62, '#385c76'); r.rotation.x=-Math.PI/2; r.position.y=-1.65+i*.025; this.rings.push(r); }
    switch(name) {
      case 'Game':
        this.ring(3.15, '#365970'); this.ring(.45,'#91d3e9');
        for(let i=0;i<12;i++) {const mesh=this.mesh(new THREE.IcosahedronGeometry(.13,0),'#dcaa78');mesh.visible=false;this.elements.push(mesh);}
        this.aim.visible=true;this.label('ORBIT DEFENSE',0,2.65,.65);break;
      case 'Analytics':
        for(let i=0;i<24;i++){const bar=this.mesh(new THREE.BoxGeometry(.13,1,.18),i%4===0?'#bca277':'#4b92b5');bar.position.set((i-11.5)*.2,-.5,0);this.elements.push(bar);}
        for(let row=0;row<3;row++){const points=Array.from({length:48},(_,i)=>new THREE.Vector3((i-23.5)*.1,Math.sin(i*.27+row)*.4+row*.6-1, -.65-row*.4));this.links.push(this.line(points,'#77b0cc'));}
        this.label('SIGNAL / SAMPLE SERIES',0,2.15,.72);break;
      case 'System':
        for(let i=0;i<5;i++){const mesh=this.mesh(new THREE.BoxGeometry(.95,.35,.6),'#46677e');mesh.position.set(0,(i-2)*.5,0);this.elements.push(mesh);this.label(['RENDER','MEMORY','INPUT','SCENE','NETWORK'][i],1.5,(i-2)*.5,.42);}
        this.label('DIAGNOSTIC STACK',0,2.2,.72);break;
      case 'Energy':
        this.elements.push(this.mesh(new THREE.IcosahedronGeometry(.75,1),'#739cbc',true));
        for(let i=0;i<4;i++){const r=this.ring(1.15+i*.17,i===2?'#d3b47d':'#64a9c8');r.rotation.set(i*.5,0,i*.55);this.rings.push(r);}
        this.label('ENERGY CORE / SIMULATION',0,2.3,.8);break;
      case 'Security':
        for(let i=1;i<=4;i++)this.ring(i*.58,'#416d86');
        this.line([new THREE.Vector3(-2.4,0,0),new THREE.Vector3(2.4,0,0)],'#31546c');
        this.line([new THREE.Vector3(0,-2.4,0),new THREE.Vector3(0,2.4,0)],'#31546c');
        for(let i=0;i<8;i++){const m=this.mesh(new THREE.OctahedronGeometry(.085),'#c3b08a');m.position.set(Math.cos(i*2.4)*(1+i*.12),Math.sin(i*2.4)*(1+i*.12),.04);this.elements.push(m);}
        this.aim.visible=true;this.sweep.visible=true;this.label('PERIMETER / SIMULATED CONTACTS',0,2.7,.8);break;
      case 'Files':
        for(let i=0;i<7;i++){const m=this.mesh(new THREE.BoxGeometry(1.3,1.6,.045),'#365b78');m.position.set((i-3)*.55,0,-Math.abs(i-3)*.3);m.rotation.y=(i-3)*-.08;this.elements.push(m);const label=this.label(['FIELD NOTES','ORBIT LOG','SIGNAL MAP','CORE MANUAL','ROUTE PLAN','SCAN REPORT','POWER MODEL'][i],0,.2,.85);m.add(label);label.position.set(0,.2,.04);}
        break;
      case 'Navigation':
        for(let i=0;i<25;i++){const m=this.mesh(new THREE.BoxGeometry(.32,.1+((i*7)%9)*.09,.32),'#314e65');m.position.set((i%5-2)*.8,-1,Math.floor(i/5)*.6-1.5);this.elements.push(m);}
        for(let i=0;i<4;i++){const points=[new THREE.Vector3(-1.8,-.6,1),new THREE.Vector3(-.6,-.6,-i*.4),new THREE.Vector3(.8,-.6,-i*.4),new THREE.Vector3(1.8,-.6,-1.5)];const line=this.line(points,i===0?'#d4b785':'#6fa9c6');this.links.push(line);}
        this.group.rotation.x=.18;this.label('SPATIAL ROUTE PLANNER',0,2,.8);break;
      case 'AI': case 'Network':
        for(let i=0;i<36;i++){const a=i*2.39996,y=1-(i/35)*2,r=Math.sqrt(1-y*y)*1.7;const m=this.mesh(new THREE.SphereGeometry(i%6===0?.09:.04,8,6),i%6===0?'#cdb88e':'#7bbbd5');m.position.set(Math.cos(a)*r,y*1.7,Math.sin(a)*r);this.elements.push(m);}
        for(let i=0;i<36;i++)for(let j=i+1;j<36;j++)if(this.elements[i].position.distanceTo(this.elements[j].position)<1.05)this.links.push(this.line([this.elements[i].position,this.elements[j].position],'#305d7b'));
        this.label(name==='AI'?'NEURAL COMMAND SPACE':'PACKET NETWORK / SIMULATION',0,2.35,.85);break;
    }
  }
  mesh(geometry: THREE.BufferGeometry,color: string,wireframe=false) {
    const material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.15,metalness:.35,roughness:.35,wireframe,transparent:true,opacity:.92});
    const mesh=new THREE.Mesh(geometry,material);this.resources.push(geometry,material);this.group.add(mesh);return mesh;
  }
  ring(radius:number,color:string,arc=Math.PI*2) {
    const geometry=new THREE.TorusGeometry(radius,.007,4,96,arc);
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false});
    const mesh=new THREE.Mesh(geometry,material);this.resources.push(geometry,material);this.group.add(mesh);return mesh;
  }
  line(points:THREE.Vector3[],color:string) {
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:.65});
    this.resources.push(geometry,material);const line=new THREE.Line(geometry,material);this.group.add(line);return line;
  }
  label(text:string,x:number,y:number,width:number) {
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=96;
    const c=canvas.getContext('2d')!;c.font='25px Consolas, monospace';c.textAlign='center';c.fillStyle='#b3cedf';c.fillText(text,384,54);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
    const sprite=new THREE.Sprite(material);sprite.position.set(x,y,.1);sprite.scale.set(width*4,width*.5,1);this.group.add(sprite);this.resources.push(texture,material);return sprite;
  }
  opacity(value:number) {
    this.group.traverse(o=>{const material=(o as THREE.Mesh).material as THREE.Material;if(material){if(material.userData.base===undefined)material.userData.base=material.opacity;material.opacity=material.userData.base*value;}});
  }
  dispose(){this.resources.forEach(resource=>resource.dispose());this.group.removeFromParent();}
}
