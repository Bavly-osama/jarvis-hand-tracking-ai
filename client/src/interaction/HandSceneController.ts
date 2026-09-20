import * as THREE from 'three';
import type { SceneManager } from '../three/SceneManager';
import type { CarouselController } from '../three/CarouselController';
import type { ExperienceController } from '../experiences/ExperienceController';
import type { FingertipCursor } from '../ui/FingertipCursor';
import type { AudioEventSystem } from '../audio/AudioEventSystem';
import type { HandPointer } from '../ui/HandPointer';
import { HandInteractionEngine, type HandFrame } from './HandInteractionEngine';
import { screenToWorld } from '../tracking/ScreenProjection';
import { pointInPaddedBox } from './HitPad';

/** Scene effects are applied once per inferred sample; rendering stays on RAF. */
export class HandSceneController {
  readonly engine=new HandInteractionEngine();
  private raycaster=new THREE.Raycaster();
  private vector=new THREE.Vector3();
  private ndc=new THREE.Vector2();
  private corner=new THREE.Vector3();
  private lastTarget:string|null=null;
  private lastFrame=-Infinity;
  private buttons:{element:HTMLButtonElement;rect:DOMRect}[]=[];
  private lastBounds=0;
  private parallaxActive=false;
  drive3dCursor=false;
  /** When true, tracking still runs but carousel/experience actions are ignored (Aim & Pop). */
  suppressScene=false;
  result:ReturnType<HandInteractionEngine['process']>|null=null;
  clicks=0;
  constructor(
    private scene:SceneManager,
    private carousel:CarouselController,
    private experiences:ExperienceController,
    private cursor:FingertipCursor,
    private audio:AudioEventSystem,
    private handPointer?:HandPointer,
  ){}
  hitTest=(x:number,y:number):string|null=>{
    if(x<0||x>1||y<0||y>1)return null;
    if(!this.experiences.isHome){
      const now=performance.now();
      if(now-this.lastBounds>100){this.buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.experience-panel button')).filter(e=>!e.disabled&&e.getClientRects().length>0).map(element=>({element,rect:element.getBoundingClientRect()}));this.lastBounds=now;}
      const screenX=x*innerWidth,screenY=y*innerHeight;
      const fromPoint=typeof document!=='undefined'?document.elementFromPoint(screenX,screenY):null;
      const interactive=fromPoint?.closest?.('button,[data-interactive-card]');
      if(interactive instanceof HTMLElement && interactive.id)return 'button:'+interactive.id;
      const button=this.buttons.find(({rect})=>screenX>=rect.left&&screenX<=rect.right&&screenY>=rect.top&&screenY<=rect.bottom);
      if(button?.element.id)return 'button:'+button.element.id;
      if(this.experiences.active && x>.12&&x<.88&&y>.2&&y<.8)return 'experience';
      return null;
    }
    this.scene.scene.updateMatrixWorld(true);this.scene.camera.updateMatrixWorld(true);
    this.ndc.set(x*2-1,1-y*2);
    this.raycaster.setFromCamera(this.ndc,this.scene.camera);
    const meshes=this.carousel.getCardMeshes().filter(m=>m.parent?.visible && m.parent.position.z>0);
    const hit=this.raycaster.intersectObjects(meshes,false)[0];
    if(hit)return 'card-'+this.carousel.getCardMeshes().indexOf(hit.object);
    let best:string|null=null,bestZ=-Infinity;
    const all=this.carousel.getCardMeshes();
    for(const mesh of meshes){
      const box=this.projectMeshBox(mesh as THREE.Mesh);
      if(!pointInPaddedBox(this.ndc.x,this.ndc.y,box))continue;
      const z=mesh.parent?.position.z??0;
      if(z>bestZ){bestZ=z;best='card-'+all.indexOf(mesh);}
    }
    return best;
  };
  private projectMeshBox(mesh:THREE.Mesh){
    mesh.updateWorldMatrix(true,false);
    const geometry=mesh.geometry;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    const box=geometry.boundingBox!;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    const xs=[box.min.x,box.max.x],ys=[box.min.y,box.max.y],zs=[box.min.z,box.max.z];
    for(const px of xs)for(const py of ys)for(const pz of zs){
      this.corner.set(px,py,pz).applyMatrix4(mesh.matrixWorld).project(this.scene.camera);
      minX=Math.min(minX,this.corner.x);maxX=Math.max(maxX,this.corner.x);
      minY=Math.min(minY,this.corner.y);maxY=Math.max(maxY,this.corner.y);
    }
    return {minX,maxX,minY,maxY};
  }
  private drivePointer(frame:HandFrame,r:ReturnType<HandInteractionEngine['process']>){
    if(!this.handPointer)return;
    if(r.pointer){
      this.handPointer.setLogicalTarget(r.pointer.x,r.pointer.y,frame.timestamp);
    }else if(r.presence?.landmarks?.[8]){
      this.handPointer.setLogicalTarget(r.presence.landmarks[8].x,r.presence.landmarks[8].y,frame.timestamp);
    }else{
      const detected=frame.hands.find(h=>h.landmarks?.length===21);
      if(detected){
        const tip=detected.landmarks[8];
        const mapped=this.handPointer.mapFromCamera(tip.x,tip.y,frame);
        this.handPointer.setTarget(mapped.screenX,mapped.screenY,frame.timestamp);
      }
    }
    if(r.mode==='ZOOM')this.handPointer.setInteractionState('GRAB');
    else if(r.pinchState==='PINCHED'||r.state.startsWith('PINCH'))this.handPointer.setInteractionState('PRESS');
    else if(r.target)this.handPointer.setInteractionState('HOVER');
    else if(r.pointer||r.presence?.landmarks)this.handPointer.setInteractionState('TRACKING');
  }
  process(frame:HandFrame){
    const r=this.engine.process(frame,this.hitTest,{id:this.experiences.state.state+':'+this.experiences.name,home:this.experiences.isHome,scale:this.experiences.getZoom()});
    this.lastFrame=performance.now();this.result=r;
    this.drivePointer(frame,r);
    if(this.suppressScene){
      this.cursor.setTapProgress(r.progress);
      this.cursor.setPinchState(r.pinchState,false);
      return r;
    }
    if(this.drive3dCursor&&r.pointer){this.experiences.pointer(r.pointer.x,r.pointer.y);screenToWorld(r.pointer,this.scene.camera,this.vector);this.cursor.updatePosition(this.vector.x,this.vector.y,this.vector.z);}
    else if(r.pointer)this.experiences.pointer(r.pointer.x,r.pointer.y);
    this.cursor.setAttractionStrength(r.target||r.capturedTarget?1:0);this.cursor.setTapProgress(r.progress);
    this.cursor.setPinchState(r.pinchState,!!r.clickTarget);
    if(r.target!==this.lastTarget && r.target)this.audio.playCardSelect();
    this.lastTarget=r.target;
    this.carousel.setHover(r.target?.startsWith('card-')?Number(r.target.slice(5)):-1);
    this.carousel.setHandPress(r.progress>0?r.target:null,r.progress);

    // Priority: ZOOM > PINCH click > MOVE
    if(r.zoom!==null){
      this.carousel.cancelHandDrag();
      this.parallaxActive=false;
      this.experiences.zoom(r.zoom);
    }else if(r.clickTarget){
      this.carousel.cancelHandDrag();
      this.parallaxActive=false;
      this.clicks++;this.cursor.pulse();this.audio.playPinchStart();
      if(r.clickTarget.startsWith('card-')){this.carousel.focusForOpen(Number(r.clickTarget.slice(5)));this.experiences.activate();}
      else if(r.clickTarget.startsWith('button:'))document.getElementById(r.clickTarget.slice(7))?.click();
      else this.experiences.activate();
    }else if(this.experiences.isHome && r.mode!=='ZOOM' && r.pinchState==='OPEN'){
      if(r.navStep && !this.carousel.isAnimating){
        this.carousel.cancelHandDrag();
        this.parallaxActive=false;
        this.carousel.step(r.navStep);
      }else if((r.dragDelta.x||r.dragDelta.y) && !this.carousel.isAnimating && !r.navLocked){
        if(!this.parallaxActive){this.carousel.beginHandDrag();this.parallaxActive=true;}
        this.carousel.dragHand(r.dragDelta.x);
      }else if(this.parallaxActive && !r.dragDelta.x && !r.dragDelta.y){
        this.carousel.cancelHandDrag();
        this.parallaxActive=false;
      }
    }else if(this.parallaxActive){
      this.carousel.cancelHandDrag();
      this.parallaxActive=false;
    }
    return r;
  }
  render(now:number){
    if(now-this.lastFrame>220 && this.engine.state!=='IDLE' && this.engine.state!=='RECOVERING_TRACKING')this.process({hands:[],timestamp:now,space:'logical'});
    this.handPointer?.tick(now);
    const presence=this.engine.presence.sample(now);
    if(presence.landmarks?.[8] && this.handPointer && !this.handPointer.visible){
      this.handPointer.setLogicalTarget(presence.landmarks[8].x,presence.landmarks[8].y,now);
    }
    if(this.drive3dCursor)this.cursor.setPresenceState(presence.state,presence.opacity);
    else this.cursor.hide();
    return presence;
  }
  reset(){this.engine.reset();this.carousel.cancelHandDrag();this.parallaxActive=false;this.carousel.setHover(-1);this.carousel.setHandPress(null,0);this.result=null;this.lastTarget=null;this.buttons=[];this.lastBounds=0;this.cursor.setTapProgress(0);}
}
