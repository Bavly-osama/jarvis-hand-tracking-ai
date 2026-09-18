import * as THREE from 'three';
import { CarouselController } from '../three/CarouselController';
import { GlobeController } from '../three/GlobeController';
import { FingertipCursor } from '../ui/FingertipCursor';
import { AudioEventSystem } from '../audio/AudioEventSystem';
import { SceneManager } from '../three/SceneManager';
import { GestureStateMachine } from '../gestures/GestureStateMachine';
import { ExperienceController } from '../experiences/ExperienceController';

export class PointerTouchController {
  private active=false;
  private pointers=new Map<number,{x:number,y:number}>();
  private start={x:0,y:0};private last={x:0,y:0};
  private dragged=false;private consumed=false;private multiTouch=false;
  private pinchDistance=0;private currentZoom=1;
  private ray=new THREE.Raycaster();private plane=new THREE.Plane(new THREE.Vector3(0,0,1),-3);private point=new THREE.Vector3();
  constructor(private domElement:HTMLElement,private scene:SceneManager,private carousel:CarouselController,private globe:GlobeController,private cursor:FingertipCursor,private audio:AudioEventSystem,_state:GestureStateMachine,private experiences:ExperienceController){}
  enable(){if(this.active)return;this.active=true;this.domElement.style.touchAction='none';this.domElement.addEventListener('pointerdown',this.down);window.addEventListener('pointermove',this.move);window.addEventListener('pointerup',this.up);window.addEventListener('pointercancel',this.cancel);this.domElement.addEventListener('wheel',this.wheel,{passive:false});this.domElement.addEventListener('contextmenu',this.context);}
  disable(){if(!this.active)return;this.active=false;this.domElement.removeEventListener('pointerdown',this.down);window.removeEventListener('pointermove',this.move);window.removeEventListener('pointerup',this.up);window.removeEventListener('pointercancel',this.cancel);this.domElement.removeEventListener('wheel',this.wheel);this.domElement.removeEventListener('contextmenu',this.context);this.pointers.clear();this.cursor.hide();this.experiences.requireNeutral();}
  isActive(){return this.active;}
  prevModule(){this.experiences.navigate(-1);this.cursor.pulse();}
  nextModule(){this.experiences.navigate(1);this.cursor.pulse();}
  selectCurrent(){this.experiences.activate();this.cursor.pulse();}
  toggleZoom(){this.currentZoom=this.currentZoom>=1.8?1:this.currentZoom+.3;this.experiences.zoom(this.currentZoom);this.cursor.pulse();}
  private context=(e:Event)=>e.preventDefault();
  private updatePointer(x:number,y:number){
    const nx=x/innerWidth,ny=y/innerHeight;this.experiences.pointer(nx,ny);
    this.ray.setFromCamera(new THREE.Vector2(nx*2-1,1-ny*2),this.scene.camera);
    if(this.ray.ray.intersectPlane(this.plane,this.point))this.cursor.updatePosition(this.point.x,this.point.y,this.point.z);
    if(this.experiences.isHome){const hits=this.ray.intersectObjects(this.carousel.getCardMeshes(),false);const index=hits.length?this.carousel.getCardMeshes().indexOf(hits[0].object):-1;this.carousel.setHover(index);if(index>=0)this.carousel.getCards()[index].applyMagneticTilt(this.point,this.carousel.getCards()[index].group.position,.4);}
  }
  private down=(e:PointerEvent)=>{
    if(!this.active)return;
    this.domElement.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(this.pointers.size===1){this.start={x:e.clientX,y:e.clientY};this.last={...this.start};this.dragged=false;this.consumed=false;this.multiTouch=false;this.updatePointer(e.clientX,e.clientY);this.experiences.press();}
    else {this.multiTouch=true;this.consumed=true;const [a,b]=[...this.pointers.values()];this.pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);}
  };
  private move=(e:PointerEvent)=>{
    if(!this.active)return;
    if(!this.pointers.size&&!(e.target instanceof HTMLCanvasElement))return;
    this.updatePointer(e.clientX,e.clientY);
    if(!this.pointers.has(e.pointerId))return;
    this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(this.pointers.size>1){const [a,b]=[...this.pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);if(this.pinchDistance>0){this.currentZoom=THREE.MathUtils.clamp(this.currentZoom+(distance-this.pinchDistance)/220,.6,2);this.experiences.zoom(this.currentZoom);}this.pinchDistance=distance;return;}
    if(this.multiTouch)return;
    const dx=e.clientX-this.last.x,dy=e.clientY-this.last.y,totalX=e.clientX-this.start.x,totalY=e.clientY-this.start.y;
    if(Math.hypot(totalX,totalY)>8)this.dragged=true;
    if(this.experiences.active&&this.experiences.name==='Game'){this.last={x:e.clientX,y:e.clientY};return;}
    if(e.shiftKey||e.buttons===2||Math.abs(totalY)>Math.abs(totalX)*1.3){
      if(this.experiences.isHome)this.globe.rotateByVelocity(dx*.02,dy*.02);else this.experiences.rotate(dx*.009,dy*.009);
    } else if(!this.consumed&&Math.abs(totalX)>=40){this.consumed=true;this.experiences.swipe(Math.sign(totalX));this.cursor.pulse();}
    this.last={x:e.clientX,y:e.clientY};
  };
  private up=(e:PointerEvent)=>{
    if(!this.active||!this.pointers.has(e.pointerId))return;
    this.pointers.delete(e.pointerId);
    if(!this.pointers.size){if(!this.dragged&&!this.multiTouch&&!this.consumed&&e.button===0)this.selectCurrent();this.experiences.releasePointer();this.multiTouch=false;this.pinchDistance=0;}
  };
  private cancel=()=>{this.pointers.clear();this.dragged=true;this.multiTouch=false;this.experiences.releasePointer();};
  private wheel=(e:WheelEvent)=>{if(!this.active)return;e.preventDefault();this.currentZoom=THREE.MathUtils.clamp(this.currentZoom-Math.sign(e.deltaY)*.15,.6,2);this.experiences.zoom(this.currentZoom);};
}
