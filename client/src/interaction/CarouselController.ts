import { CarouselController as ThreeCarouselController } from '../three/CarouselController';
import * as THREE from 'three';

export class CarouselController {
  private threeCarousel: ThreeCarouselController;

  constructor(threeCarousel: ThreeCarouselController) {
    this.threeCarousel = threeCarousel;
  }

  public onSwipe(direction: 'left' | 'right', velocity: number) {
    const sign = direction === 'left' ? -1 : 1;
    this.threeCarousel.swipe(sign * velocity);
  }

  public onPinch(index: number) {
    this.threeCarousel.selectCard(index);
  }

  public onHover(position: THREE.Vector3) {
    // Hover logic
  }
}
