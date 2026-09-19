import * as THREE from 'three';
import type { SceneManager } from '../three/SceneManager';
import type { CarouselController } from '../three/CarouselController';
import type { ExperienceController } from '../experiences/ExperienceController';
import type { FingertipCursor } from '../ui/FingertipCursor';
import type { AudioEventSystem } from '../audio/AudioEventSystem';
import { HandInteractionEngine, type HandFrame } from './HandInteractionEngine';
import { screenToWorld } from '../tracking/ScreenProjection';

/** Scene effects are applied once per inferred sample; rendering stays on RAF. */
export class HandSceneController {
  readonly engine=new HandInteractionEngine();
  private raycaster=new THREE.Raycaster();
  private vector=new THREE.Vector3();
  private lastTarget:string|null=null;
  private lastFrame=-Infinity;
  private buttons:{element:HTMLButtonElement;rect:DOMRect}[]=[];
  private lastBounds=0;
  result:ReturnType<HandInteractionEngine['process']>|null=null;
  clicks=0;
  constructor(private scene:SceneManager,private carousel:CarouselController,private experiences:ExperienceController,private cursor:FingertipCursor,private audio:AudioEventSystem){}
  hitTest=(x:number,y:number):string|null=>{
    if(x<0||x>1||y<0||y>1)return null;
    if(!this.experiences.isHome){
      const now=performance.now();
      if(now-this.lastBounds>100){this.buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.experience-panel button')).filter(e=>!e.disabled&&e.getClientRects().length>0).map(element=>({element,rect:element.getBoundingClientRect()}));this.lastBounds=now;}
      const button=this.buttons.find(({rect})=>x*innerWidth>=rect.left&&x*innerWidth<=rect.right&&y*innerHeight>=rect.top&&y*innerHeight<=rect.bottom);
      if(button?.element.id)return 'button:'+button.element.id;
      if(this.experiences.active && x>.12&&x<.88&&y>.2&&y<.8)return 'experience';
      return null;
    }
    // Cards are WebGL meshes, not DOM elements. Ray intersection is exact and depth ordered.
    this.scene.scene.updateMatrixWorld(true);this.scene.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),this.scene.camera);
    const meshes=this.carousel.getCardMeshes().filter(m=>m.parent?.visible && m.parent.position.z>0);
    const hit=this.raycaster.intersectObjects(meshes,false)[0];
    if(!hit)return null;
    return 'card-'+this.carousel.getCardMeshes().indexOf(hit.object);
  };
  process(frame:HandFrame){
    const r=this.engine.process(frame,this.hitTest,{id:this.experiences.state.state+':'+this.experiences.name,home:this.experiences.isHome,scale:this.experiences.getZoom()});
    this.lastFrame=performance.now();this.result=r;
    if(r.pointer){this.experiences.pointer(r.pointer.x,r.pointer.y);screenToWorld(r.pointer,this.scene.camera,this.vector);this.cursor.updatePosition(this.vector.x,this.vector.y,this.vector.z);}
    this.cursor.setAttractionStrength(r.target?1:0);this.cursor.setTapProgress(r.progress);
    if(r.target!==this.lastTarget && r.target)this.audio.playCardSelect();
    this.lastTarget=r.target;
    this.carousel.setHover(r.target?.startsWith('card-')?Number(r.target.slice(5)):-1);
    this.carousel.setHandPress(r.progress>0?r.target:null,r.progress);
    if(r.dragStart&&this.experiences.isHome)this.carousel.beginHandDrag();
    if(r.state==='DRAG'){
      if(this.experiences.isHome)this.carousel.dragHand(r.dragDelta.x);
      else this.experiences.rotate(r.dragDelta.x*3,r.dragDelta.y*3);
    }
    if(r.dragEnd)this.carousel.endHandDrag(r.velocity.x);
    if(r.zoom!==null)this.experiences.zoom(r.zoom);
    if(r.clickTarget){
      this.clicks++;this.cursor.pulse();this.audio.playPinchStart();
      if(r.clickTarget.startsWith('card-')){this.carousel.focusForOpen(Number(r.clickTarget.slice(5)));this.experiences.activate();}
      else if(r.clickTarget.startsWith('button:'))document.getElementById(r.clickTarget.slice(7))?.click();
      else this.experiences.activate();
    }
    return r;
  }
  render(now:number){
    if(now-this.lastFrame>180 && this.engine.state!=='IDLE' && this.engine.state!=='RECOVERING_TRACKING')this.process({hands:[],timestamp:now,space:'logical'});
    const presence=this.engine.presence.sample(now);
    this.cursor.setPresenceState(presence.state,presence.opacity);
    return presence;
  }
  reset(){this.engine.reset();this.carousel.endHandDrag(0);this.carousel.setHover(-1);this.carousel.setHandPress(null,0);this.result=null;this.lastTarget=null;this.buttons=[];this.lastBounds=0;this.cursor.setTapProgress(0);}
}
