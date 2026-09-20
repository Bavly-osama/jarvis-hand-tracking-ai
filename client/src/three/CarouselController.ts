import * as THREE from 'three';
import { HolographicCard } from './HolographicCard';
import { PhysicsController } from '../animation/PhysicsController';
import gsap from 'gsap';

import { NavigationState } from '../interaction/NavigationState';
import { MODULES } from '../experiences/modules';
const CARD_TITLES = MODULES;

const NUM_CARDS   = CARD_TITLES.length;
const RADIUS      = 3.9;
const CARD_STEP   = (Math.PI * 2) / NUM_CARDS;

export class CarouselController {
  public group: THREE.Group;
  private cards: HolographicCard[] = [];

  public carouselAngle = 0;
  public presentation = { open: 0, anticipation: 0, pulse: 0 };
  public navigation = new NavigationState(NUM_CARDS);
  public enabled = true;
  public onNavigate: ((direction: number) => void) | null = null;
  private timeline?: gsap.core.Timeline;
  private outgoingIndex = 0;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private maxVisibleCards = 10;
  // Hover
  private hoveredIndex: number = -1;
  private handDragging=false;
  private handStartAngle=0;
  private handOffset=0;
  private handScale=1;
  private pressedIndex=-1;
  private pressProgress=0;

  public beginHandDrag(){
    if(!this.enabled||this.handDragging)return;
    this.timeline?.kill();this.navigation.completeTransition();this.presentation.anticipation=0;
    this.handDragging=true;this.handStartAngle=this.carouselAngle;this.handOffset=0;
  }
  /** Drop parallax without changing the selected card index. */
  public cancelHandDrag(){
    if(!this.handDragging)return;
    this.handDragging=false;
    this.handOffset=0;
    this.carouselAngle=this.navigation.index*CARD_STEP;
  }
  public dragHand(deltaX:number){
    if(!this.handDragging||!Number.isFinite(deltaX))return;
    this.handOffset+=deltaX;
    const limit=CARD_STEP*1.2;
    const offset=limit*Math.tanh(this.handOffset/limit);
    // Logical +X (hand RIGHT) increases carouselAngle — same sign as navStep +1.
    this.carouselAngle=this.handStartAngle+offset;
  }
  public endHandDrag(velocityX:number){
    if(!this.handDragging)return;
    this.handDragging=false;
    const momentum=THREE.MathUtils.clamp(velocityX*.035,-CARD_STEP*.15,CARD_STEP*.15);
    const slot=Math.round((this.carouselAngle+momentum)/CARD_STEP);
    const target=slot*CARD_STEP;
    this.navigation.index=((slot%NUM_CARDS)+NUM_CARDS)%NUM_CARDS;
    this.navigation.isAnimating=true;
    this.timeline?.kill();this.timeline=gsap.timeline({onComplete:()=>this.navigation.completeTransition()})
      .to(this,{carouselAngle:target,duration:.22,ease:'power2.out'});
  }
  public focusForOpen(index:number){
    if(!this.enabled||index<0||index>=NUM_CARDS)return;
    this.timeline?.kill();this.handDragging=false;this.navigation.index=index;this.navigation.completeTransition();
    this.carouselAngle=index*CARD_STEP;
  }
  public setHandZoom(scale:number){this.handScale=scale;}
  public setHandPress(target:string|null,progress:number){this.pressedIndex=target?.startsWith('card-')?Number(target.slice(5)):-1;this.pressProgress=progress;}

  constructor(options?: { visibleCards?: number; cardTransmission?: boolean }) {
    this.group = new THREE.Group();
    this.maxVisibleCards = options?.visibleCards ?? 10;
    for (let i = 0; i < NUM_CARDS; i++) {
      const card = new HolographicCard(CARD_TITLES[i], { transmission: options?.cardTransmission !== false });
      this.cards.push(card);
      this.group.add(card.group);
    }
  }
  applyProfile(options: { visibleCards?: number }) {
    if (options.visibleCards) this.maxVisibleCards = options.visibleCards;
  }

  // ── Gesture API ────────────────────────────────────────────────────────────

  /**
   * Add angular velocity from a swipe gesture.
   * velocityX is normalised hand velocity (positive = rightward in camera space → carousel rotates left)
   * @param velocityX normalised velocity in range ±1..±3 typical
   */
  public swipe(velocityX: number): boolean {
    if (!this.enabled) return false;
    const old = this.navigation.index;
    if (!this.navigation.swipe(velocityX)) return false;
    this.animateSlot(old, velocityX < 0 ? 1 : -1);
    return true;
  }
  public observeNeutral(neutral: boolean, dt: number) { this.navigation.observeNeutral(neutral, dt); }
  public selectCard(index: number): boolean {
    if (!this.enabled) return false;
    const old = this.navigation.index;
    if (!this.navigation.select(index)) return false;
    let difference = this.navigation.index - old;
    if (difference > NUM_CARDS / 2) difference -= NUM_CARDS;
    if (difference < -NUM_CARDS / 2) difference += NUM_CARDS;
    this.animateSlot(old, difference);
    return true;
  }
  public step(direction: number) { return this.selectCard(this.navigation.index + direction); }
  public getActiveCard() { return this.navigation.index; }
  public get isAnimating() { return this.navigation.isAnimating; }
  private animateSlot(old: number, direction: number) {
    this.outgoingIndex = old;
    const target = this.carouselAngle + direction * CARD_STEP;
    this.timeline?.kill();
    this.onNavigate?.(direction);
    this.presentation.pulse = Math.sign(direction);
    if (this.reduced.matches) {
      this.timeline = gsap.timeline({onComplete: () => this.navigation.completeTransition()})
        .to(this, {carouselAngle: target, duration: 0.15, ease: 'power2.out'});
      return;
    }
    this.timeline = gsap.timeline({onComplete: () => {
      this.carouselAngle = target; this.navigation.completeTransition();
      this.presentation.anticipation = 0; this.presentation.pulse = 0;
    }});
    this.timeline.to(this.presentation, {anticipation: -Math.sign(direction) * 0.13, duration: 0.11, ease: 'power2.out'}, 0.06)
      .to(this, {carouselAngle: target + Math.sign(direction) * 0.016, duration: 0.39, ease: 'power3.inOut'}, 0.15)
      .to(this.presentation, {anticipation: 0, duration: 0.25}, 0.2)
      .to(this, {carouselAngle: target, duration: 0.16, ease: 'power2.out'}, 0.54);
  }

  /** Notify of a hover change (affects card glow) */
  public setHover(index: number) {
    if (index === this.hoveredIndex) return;
    if (this.hoveredIndex >= 0) this.cards[this.hoveredIndex].setHover(false);
    this.hoveredIndex = index;
    if (index >= 0) this.cards[index].setHover(true);
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  public update(delta: number, time: number) {
    delta = Math.min(delta, 0.05);
    const activeIndex = this.navigation.index;
    const opening = this.presentation.open;
    // ── Position each card on the circle ──────────────────────────────────
    const reduced = this.reduced.matches;
    const neighborSpan = Math.max(1, Math.floor((this.maxVisibleCards - 1) / 2));
    for (let i = 0; i < NUM_CARDS; i++) {
      const cardBaseAngle = i * CARD_STEP;
      const relAngle      = cardBaseAngle - this.carouselAngle;

      // Normalize to [-π, π]
      const normAngle = ((relAngle + Math.PI) % (Math.PI * 2)) - Math.PI;

      // Position on circle
      const x = Math.sin(normAngle) * RADIUS + (i === this.outgoingIndex ? this.presentation.anticipation : 0);
      const z = Math.cos(normAngle) * 2.3; // offset so front cards are near origin

      // Depth factor: 1 at front, 0 at back
      const depth = (Math.cos(normAngle) + 1) * 0.5;

      // Active card: push forward, full scale
      const isActive = i === activeIndex;
      const wrap = Math.min(Math.abs(i - activeIndex), NUM_CARDS - Math.abs(i - activeIndex));
      const inBudget = this.maxVisibleCards >= NUM_CARDS || wrap <= neighborSpan;
      const targetZ = (isActive ? z + 0.32 + opening * 1.6 : z - opening * 4) - (i===this.pressedIndex?this.pressProgress*.1:0);
      const targetScl = isActive
        ? 1.14 * (1 + opening * 2.0) * this.handScale
        : PhysicsController.remap(depth, 0, 1, 0.68, 0.94);

      // Smooth position / scale
      this.cards[i].group.position.x = PhysicsController.lerp(this.cards[i].group.position.x, x * (isActive ? 1 - opening : 1 + opening * 0.3), delta * 10);
      this.cards[i].group.position.z = PhysicsController.lerp(this.cards[i].group.position.z, targetZ, delta * 10);
      const bob = !reduced && inBudget ? Math.sin(time * 0.45 + i) * 0.018 : 0;
      this.cards[i].group.position.y = -0.95 + (isActive ? opening * 1.0 : 0) + (1 - depth) * 0.65 + bob;

      const currentScale = this.cards[i].group.scale.x;
      const newScale = PhysicsController.lerp(currentScale, targetScl, delta * 10);
      this.cards[i].group.scale.setScalar(newScale);

      // Face center
      this.cards[i].group.rotation.y = PhysicsController.lerp(this.cards[i].group.rotation.y, -Math.sin(normAngle) * 0.42, delta * 8);
      this.cards[i].group.visible = inBudget && (window.innerWidth / window.innerHeight >= 0.8 || depth > 0.87 || wrap <= 1);

      if (!this.cards[i].group.visible) continue;

      // Opacity via material uniform
      const mat = (this.cards[i].mesh.material as THREE.ShaderMaterial).uniforms;
      const visibility = isActive ? 1 - Math.max(0, (opening - 0.48) / 0.52) : 1 - Math.min(1, opening * 1.7);
      this.cards[i].setPresentationVisibility(visibility);
      const targetOpacity = PhysicsController.remap(depth, 0, 1, 0.26, 0.92) * visibility;
      mat.opacity.value = PhysicsController.lerp(mat.opacity.value, targetOpacity, delta * 8);

      // Set selected state on active card
      this.cards[i].setSelected(isActive);

      // Update card internals
      this.cards[i].update(time, delta);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Return cards array for interaction raycasting */
  public getCardMeshes(): THREE.Object3D[] {
    return this.cards.map(c => c.mesh);
  }

  /** Return card objects (for magnetic tilt from hand position) */
  public getCards(): HolographicCard[] {
    return this.cards;
  }
}
