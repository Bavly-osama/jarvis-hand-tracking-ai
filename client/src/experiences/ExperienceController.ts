import * as THREE from 'three';
import gsap from 'gsap';
import { ExperienceState, NavigationState } from '../interaction/NavigationState';
import { CarouselController } from '../three/CarouselController';
import { GlobeController } from '../three/GlobeController';
import { SceneManager } from '../three/SceneManager';
import { AudioEventSystem } from '../audio/AudioEventSystem';
import { ExperienceView } from './ExperienceView';
import { OrbitGame } from './OrbitGame';
import { MODULES, MODULE_HINTS, ModuleName } from './modules';

const LOCATIONS = [ ['Cairo','30.04 N / 31.24 E'], ['London','51.51 N / 0.13 W'], ['Tokyo','35.68 N / 139.69 E'], ['Sydney','33.87 S / 151.21 E'] ];
const FILES = ['Field notes','Orbit log','Signal map','Core manual','Route plan','Scan report','Power model'];
const FILE_CONTENT = ['Observation: cloud cover is a reference texture, not a current forecast.','Orbit reference: Earth axial tilt 23.44 degrees; mean radius 6,371 km.','Signal map: cyan links represent illustrative communication routes.','Controls: swipe to navigate, pinch to select, grab to rotate, spread to zoom.','Route plan: select a destination and confirm to draw its path.','Scan report: simulated targets are safe to inspect. No real security systems are connected.','Power model: balanced, reserve and performance modes adjust simulated distribution.'];

export class ExperienceController {
  readonly state = new ExperienceState();
  readonly root = new THREE.Group();
  readonly earthDock = new THREE.Group();
  readonly game = new OrbitGame();
  private views = new Map<ModuleName,ExperienceView>();
  private view: ExperienceView | null = null;
  private timeline?: gsap.core.Timeline;
  private progress={value:0};
  private cameraHome=new THREE.Vector3();
  private homeZoom=1;
  private mode=0; private selected=0; private detail=false; private powered=true;
  private modeGate=new NavigationState(100);
  private aim=new THREE.Vector3();
  private raycaster=new THREE.Raycaster();
  private plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  private hit=new THREE.Vector3();
  private zoomValue=1;
  private aiState='IDLE'; private aiTime=0; private diagnosticTime=0;
  private burstTime=0; private hudTime=0; private lastClock=0;
  private aiHistory:string[]=[];
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  private panel:HTMLElement;
  private title:HTMLElement;
  private readout:HTMLElement;
  private detailEl:HTMLElement;
  private command:HTMLInputElement;
  private feedback:HTMLElement;
  private announce:HTMLElement;
  private homeNav:HTMLElement;
  private actionButton:HTMLButtonElement;
  private backButton:HTMLButtonElement;
  private keyHandler=(e:KeyboardEvent)=>{
    if(!document.getElementById('modal-mode-select')?.classList.contains('hidden'))return;
    if(e.target instanceof HTMLInputElement)return;
    if(e.key==='Escape')this.close();
    else if(e.key==='ArrowRight'){e.preventDefault();this.navigate(1);}
    else if(e.key==='ArrowLeft'){e.preventDefault();this.navigate(-1);}
    else if((e.key==='Enter'||e.key===' ') && !(e.target instanceof HTMLButtonElement)){e.preventDefault();this.activate();}
  };

  constructor(private scene:SceneManager,private carousel:CarouselController,private globe:GlobeController,private audio:AudioEventSystem){
    this.scene.scene.add(this.root,this.earthDock);this.earthDock.add(globe.group);this.root.visible=false;
    this.panel=document.createElement('section');this.panel.className='experience-panel';this.panel.hidden=true;
    this.panel.innerHTML=`<header><button id="experience-back" type="button">← BACK</button><div><small id="experience-kind">SPATIAL EXPERIENCE</small><h1 id="experience-title"></h1></div><button id="experience-audio" type="button" aria-pressed="false">SOUND ON</button></header>
      <p id="experience-hint"></p><output id="experience-readout" aria-live="off"></output><div id="experience-detail" aria-live="polite"></div>
      <form id="experience-command" hidden><label for="ai-command">Local command</label><input id="ai-command" autocomplete="off" maxlength="120" placeholder="status / help / scan / power"><button type="submit">EXECUTE</button></form>
      <nav aria-label="Experience controls"><button id="experience-prev" type="button">← OPTION</button><button id="experience-action" type="button">SELECT</button><button id="experience-zoom" type="button">ZOOM +</button><button id="experience-next" type="button">OPTION →</button></nav>`;
    document.body.appendChild(this.panel);
    this.title=this.panel.querySelector('#experience-title')!;this.readout=this.panel.querySelector('#experience-readout')!;
    this.detailEl=this.panel.querySelector('#experience-detail')!;this.command=this.panel.querySelector('#ai-command')!;
    this.homeNav=document.getElementById('touch-nav')!;
    this.actionButton=this.panel.querySelector('#experience-action')!;this.backButton=this.panel.querySelector('#experience-back')!;
    this.feedback=document.createElement('div');this.feedback.className='gesture-feedback';this.feedback.setAttribute('aria-hidden','true');document.body.appendChild(this.feedback);
    this.announce=document.createElement('div');this.announce.className='sr-only';this.announce.setAttribute('aria-live','polite');document.body.appendChild(this.announce);
    this.backButton.onclick=()=>this.close();
    this.panel.querySelector<HTMLButtonElement>('#experience-prev')!.onclick=()=>this.navigate(-1);
    this.panel.querySelector<HTMLButtonElement>('#experience-next')!.onclick=()=>this.navigate(1);
    this.panel.querySelector<HTMLButtonElement>('#experience-zoom')!.onclick=()=>this.zoom(this.zoomValue>=1.8?1:this.zoomValue+.25);
    this.actionButton.onclick=()=>this.activate();
    this.panel.querySelector<HTMLFormElement>('#experience-command')!.onsubmit=e=>{e.preventDefault();this.processCommand();};
    const mute=this.panel.querySelector<HTMLButtonElement>('#experience-audio')!;
    mute.onclick=()=>{const muted=mute.getAttribute('aria-pressed')!=='true';mute.setAttribute('aria-pressed',String(muted));mute.textContent=muted?'SOUND OFF':'SOUND ON';this.audio.setMuted(muted);};
    window.addEventListener('keydown',this.keyHandler);
    this.carousel.onNavigate=direction=>{this.signal(direction>0?'NEXT →':'← PREVIOUS','ui_swipe');this.announce.textContent=MODULES[this.carousel.getActiveCard()];};
  }
  get name():ModuleName{return MODULES[this.state.index];}
  get isHome(){return this.state.canNavigate;}
  get active(){return this.state.state==='EXPERIENCE_ACTIVE';}
  private signal(label:string,event:string='ui_confirm'){
    this.feedback.textContent=label;gsap.killTweensOf(this.feedback);
    gsap.fromTo(this.feedback,{opacity:1,x:0},{opacity:0,x:label.includes('→')?20:label.includes('←')?-20:0,duration:.7,ease:'power2.out'});
    window.dispatchEvent(new CustomEvent('orbit:audio',{detail:{event,module:this.name}}));
    if(event==='ui_swipe')this.audio.playSwipe();else if(event==='ui_open'||event==='ui_confirm'||event==='game_hit')this.audio.playCardSelect();
  }
  observeNeutral(neutral:boolean,dt:number){this.carousel.observeNeutral(neutral,dt);this.modeGate.observeNeutral(neutral,dt);}
  releasePointer(){this.carousel.navigation.releasePointer();this.modeGate.releasePointer();}
  requireNeutral(){this.carousel.navigation.requireNeutral();this.modeGate.requireNeutral();}
  swipe(velocity:number){
    if(this.isHome)return this.carousel.swipe(velocity);
    if(!this.active||!this.modeGate.swipe(velocity))return false;
    this.modeGate.completeTransition();this.changeMode(velocity<0?1:-1);return true;
  }
  navigate(direction:number){
    if(this.isHome){this.carousel.step(direction);return;}
    if(this.active)this.changeMode(direction);
  }
  private changeMode(direction:number){
    this.mode=((this.mode+direction)%3+3)%3;this.selected=((this.selected+direction)%this.itemCount()+this.itemCount())%this.itemCount();this.detail=false;
    if(this.view)gsap.fromTo(this.view.group.position,{x:direction*.13},{x:0,duration:.45,ease:'power3.out'});
    this.signal(direction>0?'NEXT OPTION →':'← PREVIOUS OPTION','ui_swipe');this.detailEl.textContent='';this.refreshReadout();
  }
  private itemCount(){return this.name==='Files'?7:this.name==='Earth'?4:this.name==='System'?5:8;}
  press(){if(this.isHome&&!this.carousel.isAnimating){const card=this.carousel.getCards()[this.carousel.getActiveCard()];gsap.to(card.mesh.scale,{x:.95,y:.95,duration:.08});this.signal('SELECT','ui_select');}}
  activate(){
    if(this.isHome){this.open();return;}
    if(!this.active)return;
    this.pulse();
    switch(this.name){
      case 'Game':
        if(this.game.over){this.game.reset();this.signal('ROUND RESTARTED');}
        else{const hit=this.game.fire(this.aim.x,this.aim.y);this.signal(hit?`HIT / COMBO ${this.game.combo}`:'MISSED',hit?'game_hit':'ui_select');if(hit&&this.game.combo%3===0)window.dispatchEvent(new CustomEvent('orbit:audio',{detail:{event:'game_combo'}}));}break;
      case 'Earth':this.detailEl.textContent=`${LOCATIONS[this.selected%4][0]} · ${LOCATIONS[this.selected%4][1]} · Reference location. Atmospheric overlay is illustrative, not live weather.`;break;
      case 'Analytics':this.detail=!this.detail;this.detailEl.textContent=this.detail?`Dataset ${this.mode+1} · Sample ${this.selected+1} · ${(46+Math.sin(this.selected*.8+this.mode)*23).toFixed(1)} units · Generated sample data`:'';break;
      case 'System':this.diagnosticTime=2;this.detailEl.textContent='Checking rendering context, scene resources and input support…';break;
      case 'AI':this.processCommand();break;
      case 'Energy':this.powered=!this.powered;this.detailEl.textContent=this.powered?'Distribution subsystem online':'Distribution subsystem isolated';break;
      case 'Network':this.detail=!this.detail;this.detailEl.textContent=`Node ${this.selected+1}: ${this.detail?'alternate route engaged':'primary route restored'} · Simulated traffic`;break;
      case 'Security':this.detailEl.textContent=`Contact ${this.selected+1} inspected · ${['clear / civilian beacon','verified / relay node','review / unclassified echo'][this.mode]} · Simulated scan`;break;
      case 'Files':
        if(this.detail){this.detailEl.textContent=FILE_CONTENT[this.selected];this.actionButton.textContent='OPEN AGAIN';}
        else{this.detail=true;this.detailEl.textContent=`${FILES[this.selected]} · Reference document · Select again to open`;this.actionButton.textContent='CONFIRM OPEN';}break;
      case 'Navigation':this.detail=!this.detail;this.detailEl.textContent=`${['North relay','East station','South beacon'][this.mode]} · Route ${this.detail?'plotted':'cleared'} · ${(2.4+this.mode*1.7).toFixed(1)} km · ${[24,112,208][this.mode]}° bearing (simulation)`;break;
    }
    if(this.name!=='Game')this.signal('CONFIRMED');this.refreshReadout();
  }
  open(){
    if(this.carousel.isAnimating||!this.state.open(this.carousel.getActiveCard()))return;
    this.carousel.enabled=false;this.requireNeutral();this.homeZoom=this.globe.group.scale.x;this.cameraHome.copy(this.scene.camera.position);
    this.mode=0;this.selected=this.name==='Files'?3:0;this.detail=false;this.zoomValue=1;this.powered=true;this.aiState='IDLE';this.aiTime=0;this.diagnosticTime=0;
    this.view=this.views.get(this.name)??new ExperienceView(this.name);this.views.set(this.name,this.view);
    this.root.add(this.view.group);this.view.group.visible=true;this.view.group.rotation.set(this.name==='Navigation'?.18:0,0,0);this.root.visible=true;
    this.game.reset();this.panel.hidden=false;this.panel.classList.add('entering');this.title.textContent=this.name;
    this.panel.querySelector('#experience-hint')!.textContent=MODULE_HINTS[this.name];
    this.panel.querySelector<HTMLElement>('#experience-command')!.hidden=this.name!=='AI';
    this.panel.querySelector('#experience-kind')!.textContent=['Game','Earth','Files','System'].includes(this.name)?'SPATIAL EXPERIENCE':'SIMULATED DATA / INTERACTIVE';
    this.actionButton.textContent=this.name==='Game'?'FIRE':this.name==='System'?'RUN CHECK':'SELECT';this.detailEl.textContent='';
    this.homeNav.hidden=true;document.body.classList.add('experience-open');this.signal('ENTER '+this.name.toUpperCase(),'ui_open');
    this.timeline?.kill();
    this.timeline=gsap.timeline({onComplete:()=>{this.state.enter();this.panel.classList.remove('entering');this.backButton.focus({preventScroll:true});this.announce.textContent=`${this.name} opened. ${MODULE_HINTS[this.name]}`;}})
      .to(this.carousel.getCards()[this.state.index].mesh.scale,{x:1,y:1,duration:.12})
      .to(this.progress,{value:1,duration:this.reduced.matches?.18:.85,ease:'power3.inOut'},0)
      .to(this.scene.camera.position,{z:this.cameraHome.z-(this.name==='Game'?1.0:.45),duration:.8,ease:'power2.inOut'},0);
    this.refreshReadout();
  }
  close(){
    if(!this.state.close())return;
    this.timeline?.kill();this.aiTime=0;this.diagnosticTime=0;this.signal('RETURNING TO ORBIT','ui_close');this.panel.classList.add('entering');this.requireNeutral();
    this.timeline=gsap.timeline({onComplete:()=>{
      if(this.view)this.view.group.visible=false;this.root.visible=false;this.panel.hidden=true;this.homeNav.hidden=false;
      this.state.home();this.carousel.enabled=true;this.globe.applyZoom(this.homeZoom);document.body.classList.remove('experience-open');
      this.earthDock.position.set(0,0,0);this.earthDock.scale.setScalar(1);this.carousel.presentation.open=0;this.root.scale.setScalar(1);
      document.getElementById('btn-select')?.focus({preventScroll:true});this.announce.textContent=`Returned to ${MODULES[this.carousel.getActiveCard()]}`;
    }}).to(this.progress,{value:0,duration:this.reduced.matches?.18:.75,ease:'power3.inOut'},0)
      .to(this.scene.camera.position,{x:this.cameraHome.x,y:this.cameraHome.y,z:innerWidth/innerHeight<.8?12.8:10.8,duration:.75,ease:'power2.inOut'},0);
  }
  isHoveringBack(x: number, y: number): boolean {
    if (!this.active) return false;
    const rect=this.backButton.getBoundingClientRect();
    const hovering=x*innerWidth>=rect.left&&x*innerWidth<=rect.right&&y*innerHeight>=rect.top&&y*innerHeight<=rect.bottom;
    if (hovering) {
      this.backButton.classList.add('hover-highlight');
      this.backButton.style.background = '#32607f';
      this.backButton.style.borderColor = '#00ffff';
    } else {
      this.backButton.classList.remove('hover-highlight');
      this.backButton.style.background = '';
      this.backButton.style.borderColor = '';
    }
    return hovering;
  }
  pointer(x:number,y:number){
    if(!this.active||!this.view)return;
    this.isHoveringBack(x, y);
    this.raycaster.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),this.scene.camera);
    if(this.raycaster.ray.intersectPlane(this.plane,this.hit)){this.aim.copy(this.hit);this.root.worldToLocal(this.aim);}
    this.view.aim.position.set(this.aim.x,this.aim.y,.2);
    if(this.name==='Security'){
      let best=Infinity;this.view.elements.forEach((mesh,i)=>{const d=mesh.position.distanceTo(this.aim);if(d<best){best=d;this.selected=i;}});
    } else if(this.name==='Earth') {
      // Select actual geographic nodes by projection into screen coordinates.
      let best=Infinity;const locations=[[30.04,31.24],[51.51,-.13],[35.68,139.69],[-33.87,151.21]];
      const surface=this.globe.group.children.find(o=>o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) as THREE.Mesh;
      locations.forEach(([lat,lon],i)=>{const phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;const v=new THREE.Vector3(-1.5*Math.sin(phi)*Math.cos(theta),1.5*Math.cos(phi),1.5*Math.sin(phi)*Math.sin(theta));surface.localToWorld(v);v.project(this.scene.camera);const d=Math.hypot(v.x-(x*2-1),v.y-(1-y*2));if(d<best){best=d;this.selected=i;}});
    }
  }
  rotate(dx:number,dy:number){
    if(!this.active)return;
    if(this.name==='Earth')this.globe.directRotate(dx*1.4,dy*1.4);
    else if(this.name==='Files'&&this.view){const file=this.view.elements[this.selected];file.position.x+=dx;file.position.y-=dy;}
    else if(this.view&&this.name!=='Game'&&this.name!=='Security'){this.view.group.rotation.y+=dx;this.view.group.rotation.x=THREE.MathUtils.clamp(this.view.group.rotation.x+dy,-.6,.6);}
  }
  getZoom(){return this.zoomValue;}
  zoom(scale:number){if(!Number.isFinite(scale)||(!this.isHome&&!this.active))return;this.zoomValue=THREE.MathUtils.clamp(scale,.6,2.5);if(this.isHome)this.carousel.setHandZoom(this.zoomValue);else if(this.name==='Earth')this.globe.applyZoom(this.zoomValue);}
  private pulse(){if(!this.view)return;this.burstTime=.5;this.view.burst.position.copy(this.aim);this.view.burst.position.z=.15;this.view.burst.visible=true;}
  private processCommand(){
    if(!this.active||this.aiTime>0)return;
    this.aiState='LISTENING';this.aiTime=2.0;this.detailEl.textContent=`Command received: ${this.command.value.trim()||['status','scan','power'][this.mode]}`;
    this.aiHistory.unshift(this.command.value.trim()||['status','scan','power'][this.mode]);this.aiHistory=this.aiHistory.slice(0,3);
  }
  private refreshReadout(){
    const map:Record<ModuleName,string>={
      Earth:`LOCATION / ${LOCATIONS[this.selected%4][0]} · ${LOCATIONS[this.selected%4][1]}`,
      Game:`SCORE ${this.game.score.toString().padStart(5,'0')}  /  COMBO ×${this.game.combo}  /  CORE ${this.game.integrity}%  /  ${Math.ceil(this.game.remaining)}s${this.game.over?' · ROUND COMPLETE':''}`,
      Analytics:`${['NETWORK LOAD','ENERGY OUTPUT','SIGNAL QUALITY'][this.mode]} / GENERATED SAMPLES · RANGE ×${this.zoomValue.toFixed(1)}`,
      System:`${['RENDER','MEMORY','INPUT','SCENE','NETWORK'][this.selected%5]} / ${this.diagnosticTime>0?'CHECKING':'READY'}`,
      AI:`${this.aiState} / LOCAL COMMAND PROCESSOR`,
      Energy:`${['BALANCED','RESERVE','PERFORMANCE'][this.mode]} / ${this.powered?[62,35,91][this.mode]:0}% OUTPUT / SIMULATION`,
      Network:`${['MESH','RELAY','REDUNDANT'][this.mode]} / NODE ${this.selected+1} / ${Math.floor(120+Math.sin(this.lastClock)*18)} PACKETS/S (SIMULATED)`,
      Security:`${['PASSIVE','DEEP SCAN','SIGNAL TRACE'][this.mode]} / CONTACT ${this.selected+1}`,
      Files:`${this.selected+1} / 7 · ${FILES[this.selected]} · BUNDLED REFERENCE DOCUMENTS`,
      Navigation:`DESTINATION / ${['NORTH RELAY','EAST STATION','SOUTH BEACON'][this.mode]}`,
    };this.readout.textContent=map[this.name];
    if(this.name==='Game')this.actionButton.textContent=this.game.over?'PLAY AGAIN':'FIRE';
    if(this.name==='Files'&&!this.detail)this.actionButton.textContent='PREVIEW';
  }
  update(dt:number,time:number){
    dt=Math.min(dt,.05);this.lastClock=time;const p=this.progress.value;this.carousel.presentation.open=p;
    if(this.state.state==='MAIN_CAROUSEL')return;
    const earth=this.name==='Earth';this.earthDock.position.set(earth?0:-4*p,earth?.15*p:0,-(earth?0:2.5)*p);
    this.earthDock.scale.setScalar(1+p*(earth?.3:-.55));
    if(!this.view)return;
    this.view.opacity(Math.max(0,(p-.3)/.7));
    this.root.position.set(0,.45,-3*(1-p));
    const fit=Math.min(1,(innerWidth/innerHeight)/.95);
    const targetScale=(this.active?this.zoomValue:(.35+.65*p))*fit;
    this.root.scale.setScalar(THREE.MathUtils.lerp(this.root.scale.x,targetScale,.12));
    this.panel.style.setProperty('--enter',String(p));
    if(!this.active)return;
    if(this.name==='Game'){
      this.game.update(dt);this.game.targets.forEach((t,i)=>{const mesh=this.view!.elements[i];mesh.visible=t.active;mesh.position.set(t.x,t.y,0);mesh.rotation.z+=dt;});
    }
    if(this.name==='Analytics')this.view.elements.forEach((m,i)=>{const h=.35+(Math.sin(i*.68+this.mode*1.2+time*.5)+1)*.7;m.scale.y=THREE.MathUtils.lerp(m.scale.y,h,.08);m.position.y=-1.2+m.scale.y/2;});
    if(this.name==='System'){
      this.view.elements.forEach((m,i)=>(m.material as THREE.MeshStandardMaterial).emissiveIntensity=i===this.selected%5?.65:.08);
      if(this.diagnosticTime>0){this.diagnosticTime-=dt;if(this.diagnosticTime<=0){const gl=this.scene.renderer.getContext();this.detailEl.textContent=`Render context ${gl.isContextLost()?'LOST':'OK'} · ${this.scene.renderer.info.render.calls} draw calls · ${this.scene.renderer.info.memory.geometries} geometries · Pointer ${'PointerEvent' in window?'supported':'unavailable'} · Network ${navigator.onLine?'online':'offline'}`;}}
    }
    if(this.name==='Files')this.view.elements.forEach((m,i)=>{m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x,i===this.selected?1.12:.8,.1));m.position.z=THREE.MathUtils.lerp(m.position.z,i===this.selected?.6:-Math.abs(i-this.selected)*.3,.1);});
    if(this.name==='Network')this.view.links.forEach((line,i)=>{
      line.visible=this.mode===0||(this.mode===1?i%3===0:i%3!==1);
      const material=line.material as THREE.LineBasicMaterial;
      material.color.set(this.detail&&i%8===this.selected?'#d5b680':'#487c98');
      material.opacity=.25+Math.sin(time*2-i*.3)*.15;
    });
    if(this.name==='Security')this.view.elements.forEach((mesh,i)=>{mesh.scale.setScalar(i===this.selected?1.7:1);(mesh.material as THREE.MeshStandardMaterial).emissiveIntensity=i===this.selected?.8:.1;});
    if(this.name==='Energy')this.view.elements.forEach(mesh=>{(mesh.material as THREE.MeshStandardMaterial).emissiveIntensity=this.powered?[.2,.08,.6][this.mode]:0;});
    if(this.name==='Navigation')this.view.links.forEach((line,i)=>{line.visible=this.detail&&i===this.mode;});
    if(this.name==='AI'&&this.aiTime>0){
      this.aiTime-=dt;this.aiState=this.aiTime>1.6?'LISTENING':this.aiTime>.45?'THINKING':'RESPONDING';
      if(this.aiTime<=0){const cmd=(this.command.value.trim()||['status','scan','power'][this.mode]).toLowerCase();this.aiState='IDLE';
        this.detailEl.textContent=cmd.includes('help')?'Commands: status, scan, power. This local interpreter does not send chat to a model.':cmd.includes('scan')?'Scan complete: 36 simulated semantic nodes available.':cmd.includes('power')?'Power simulation: balanced mode, 62% reference output.':cmd.includes('status')?`Renderer ready. ${this.scene.renderer.info.render.calls} draw calls. All ten local modules available.`:'Unknown local command. Try status, help, scan, or power.';
      }
    }
    if(!this.reduced.matches){
      this.view.rings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?-.1:.12)*(this.name==='Energy'&&!this.powered?.1:1);});
      this.view.sweep.rotation.z-=dt*.7;
      if(this.name==='Energy')this.view.elements[0].rotation.y+=dt*(this.powered?.25:.03);
      if(this.name==='Network'||this.name==='AI')this.view.elements.forEach((m,i)=>{m.scale.setScalar(1+Math.sin(time*(this.aiState==='THINKING'?5:1.2)+i)*.2);});
    }
    if(this.burstTime>0){this.burstTime-=dt;this.view.burst.scale.setScalar(1+(0.5-this.burstTime)*4);(this.view.burst.material as THREE.MeshBasicMaterial).opacity=this.burstTime;this.view.burst.visible=this.burstTime>0;}
    this.hudTime+=dt;if(this.hudTime>.15){this.refreshReadout();this.hudTime=0;}
  }
  dispose(){this.timeline?.kill();this.views.forEach(view=>view.dispose());this.panel.remove();this.feedback.remove();this.announce.remove();window.removeEventListener('keydown',this.keyHandler);}
}
