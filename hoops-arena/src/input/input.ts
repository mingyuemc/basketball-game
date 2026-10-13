export interface EdgeInput {
  jump: boolean;
  pass: boolean;
  steal: boolean;
  fake: boolean;       // 假动作（胯下/背后）
  iso: boolean;        // 背身/要球
  shootTap: boolean;   // 投篮"点击"边沿：第一次按下=开始蓄力；再次按下=出手
}

/** 键鼠输入：移动/冲刺/投篮蓄力 + 边沿（跳跃/传球/抢断/假动作/背身）
 *
 * 投篮模拟 NBA 2K 风格：
 *   - 鼠标左键**第一次按下**：开始自动蓄力（可松开鼠标）
 *   - 鼠标左键**再次按下**：以当前蓄力出手
 *   - 长按不再有意义（移除了"按住蓄力"逻辑），但保留持续状态以兼容移动端触摸
 */
export class Input {
  private keys = new Set<string>();
  private edges: EdgeInput = { jump: false, pass: false, steal: false, fake: false, iso: false, shootTap: false };

  moveX = 0;
  moveZ = 0;
  sprint = false;
  shootHeld = false;     // 当前鼠标左键是否按住（仅用于 UI 显示）

  // 2K 风格投篮：上次按下是否处于"待第二次按下出手"状态
  private shootArmed = false;

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
      if (e.code === 'KeyQ') this.edges.fake = true;     // 假动作
      if (e.code === 'KeyI') this.edges.iso = true;     // 背身/要球
      if (e.code === 'KeyF') this.edges.pass = true;     // 兼容：F 传球
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.shootHeld = false;
      this.shootArmed = false;
    });

    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.shootHeld = true;
        this.edges.shootTap = true;     // 每次按下都触发"点击"边沿
      }
      if (e.button === 2) this.edges.pass = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shootHeld = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // 触屏：单指点 = shootTap；2 触 = 传球
    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length >= 1) {
        this.shootHeld = true;
        this.edges.shootTap = true;
      }
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
    this.edges.fake = false;
    this.edges.iso = false;
    this.edges.shootTap = false;
    return e;
  }

  /** 是否"已蓄力等待出手"——给 UI 显示绿色条用 */
  isShootArmed() { return this.shootArmed; }
  setShootArmed(b: boolean) { this.shootArmed = b; }
}