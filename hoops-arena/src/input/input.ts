export interface EdgeInput {
  jump: boolean;
  pass: boolean;
  steal: boolean;
}

/** 键鼠输入：持续量（移动/冲刺/投篮蓄力）+ 边沿量（跳跃/传球/抢断） */
export class Input {
  private keys = new Set<string>();
  private edges: EdgeInput = { jump: false, pass: false, steal: false };

  moveX = 0;
  moveZ = 0;
  sprint = false;
  shootHeld = false;

  constructor(dom: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        this.keys.add(e.code);
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Space') { this.edges.jump = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.edges.steal = true;
      if (e.code === 'KeyP') this.edges.pass = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.shootHeld = false; });

    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.shootHeld = true;
      if (e.button === 2) this.edges.pass = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shootHeld = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // 触屏：点击右侧蓄力投篮（简化支持）
    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) this.shootHeld = true;
    }, { passive: true });
    dom.addEventListener('touchend', () => { this.shootHeld = false; });
  }

  /** 每帧刷新持续量 */
  update() {
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    // 摄像机固定在球员身后、朝向篮筐（+z），此时世界 +x 显示在屏幕左侧，故左右输入需取反
    const screenRight = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.moveZ = fwd;
    this.moveX = -screenRight;
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
  }

  takeEdges(): EdgeInput {
    const e = { ...this.edges };
    this.edges.jump = false;
    this.edges.pass = false;
    this.edges.steal = false;
    return e;
  }
}