import type { AimPopPractice, AimTarget } from '../experiences/AimPopPractice';

export class AimPopOverlay {
  readonly root: HTMLDivElement;
  private stage: HTMLDivElement;
  private scoreEl: HTMLDivElement;
  private comboEl: HTMLDivElement;
  private handEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private targetsEl: HTMLDivElement;
  private nodes = new Map<number, HTMLDivElement>();
  onPlayAgain?: () => void;
  onEnterOrbit?: () => void;
  onMouseMode?: () => void;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'aim-pop-overlay';
    this.root.innerHTML = `
      <div class="aim-pop-hud">
        <div class="aim-pop-title">AIM &amp; POP</div>
        <div class="aim-pop-stats">
          <span data-score>SCORE 00000</span>
          <span data-combo>COMBO ×0</span>
          <span data-hand class="aim-pop-hand">HAND …</span>
        </div>
        <p class="aim-pop-hint" data-hint>Show your hand · move the tip onto a target · pinch to pop</p>
      </div>
      <div class="aim-pop-stage" data-stage></div>
      <div class="aim-pop-actions">
        <button type="button" data-again>PLAY AGAIN</button>
        <button type="button" data-orbit class="primary">ENTER ORBIT</button>
        <button type="button" data-mouse>MOUSE MODE</button>
      </div>`;
    document.body.appendChild(this.root);
    this.stage = this.root.querySelector('[data-stage]') as HTMLDivElement;
    this.targetsEl = this.stage;
    this.scoreEl = this.root.querySelector('[data-score]') as HTMLDivElement;
    this.comboEl = this.root.querySelector('[data-combo]') as HTMLDivElement;
    this.handEl = this.root.querySelector('[data-hand]') as HTMLDivElement;
    this.hintEl = this.root.querySelector('[data-hint]') as HTMLParagraphElement;
    this.root.querySelector('[data-again]')?.addEventListener('click', () => this.onPlayAgain?.());
    this.root.querySelector('[data-orbit]')?.addEventListener('click', () => this.onEnterOrbit?.());
    this.root.querySelector('[data-mouse]')?.addEventListener('click', () => this.onMouseMode?.());
    this.hide();
  }

  show() {
    this.root.classList.add('is-visible');
  }

  hide() {
    this.root.classList.remove('is-visible');
  }

  get visible() {
    return this.root.classList.contains('is-visible');
  }

  sync(game: AimPopPractice) {
    this.scoreEl.textContent = `SCORE ${String(game.score).padStart(5, '0')}`;
    this.comboEl.textContent = `COMBO ×${game.combo}`;
    this.handEl.textContent = game.handOk ? 'HAND OK' : 'HAND …';
    this.handEl.classList.toggle('ok', game.handOk);
    this.hintEl.textContent = game.handOk
      ? 'Aim at a circle · pinch thumb + index to pop'
      : 'Show an open hand to the camera';

    const alive = new Set(game.targets.filter(t => t.alive).map(t => t.id));
    for (const [id, node] of this.nodes) {
      if (!alive.has(id)) {
        node.remove();
        this.nodes.delete(id);
      }
    }
    for (const t of game.targets) {
      if (!t.alive) continue;
      let node = this.nodes.get(t.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'aim-pop-target';
        this.targetsEl.appendChild(node);
        this.nodes.set(t.id, node);
      }
      this.place(node, t);
    }
  }

  flashHit(target: AimTarget) {
    const node = this.nodes.get(target.id);
    if (!node) return;
    node.classList.add('pop');
    setTimeout(() => node.remove(), 180);
    this.nodes.delete(target.id);
  }

  private place(node: HTMLDivElement, t: AimTarget) {
    const size = Math.max(36, Math.min(innerWidth, innerHeight) * t.r * 2);
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
    node.style.left = `${t.x * 100}%`;
    node.style.top = `${t.y * 100}%`;
  }
}
