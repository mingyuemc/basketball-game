import { GameScene } from './render/scene';
import { CameraController } from './render/camera';
import { Input } from './input/input';
import { HUD } from './ui/hud';
import { World, type GameMode } from './game/world';
import type { Difficulty } from './game/ai';

const app = document.getElementById('app')!;
const menu = document.getElementById('menu')!;

// 无 WebGL 时优雅降级，避免整个模块因渲染器构造失败而中断
if (!webglAvailable()) {
  menu.innerHTML =
    '<h1>HOOPS <span>ARENA</span></h1>' +
    '<p class="sub">当前浏览器或设备未启用 WebGL，无法运行 3D 渲染。<br/>请改用支持 WebGL 的现代浏览器（Chrome / Edge / Safari / Firefox）后重试。</p>';
} else {
  startApp();
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function startApp() {
  const playBtn = document.getElementById('playBtn')! as HTMLButtonElement;
  const scene = new GameScene(app);
  const cameraCtl = new CameraController(scene.camera);
  const input = new Input(scene.renderer.domElement);
  const hud = new HUD();

  let world: World | null = null;
  let mode: GameMode = '1v1';
  let difficulty: Difficulty = 'normal';

  // ---------- 菜单选择 ----------
  function bindOptions(rowId: string, attr: string, onPick: (v: string) => void) {
    const row = document.getElementById(rowId)!;
    row.querySelectorAll<HTMLElement>('.opt').forEach((el) => {
      el.addEventListener('click', () => {
        row.querySelectorAll('.opt').forEach((o) => o.classList.remove('selected'));
        el.classList.add('selected');
        onPick(el.dataset[attr]!);
      });
    });
  }
  bindOptions('modeRow', 'mode', (v) => { mode = v as GameMode; });
  bindOptions('diffRow', 'diff', (v) => { difficulty = v as Difficulty; });

  playBtn.addEventListener('click', () => {
    menu.classList.add('hidden');
    startGame();
  });

  // 结束后按 R 重开
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && world && world.phase === 'ended') {
      startGame();
    }
  });

  function startGame() {
    world = new World(mode, difficulty);
    input.takeEdges();
    menu.classList.add('hidden');
  }

  // ---------- 主循环 ----------
  let acc = 0;
  let last = performance.now() / 1000;

  function frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(now - last, 0.1);
    last = now;

    input.update();

    if (world && world.phase !== 'ended') {
      const edges = input.takeEdges();
      world.humanInput = {
        moveX: input.moveX,
        moveZ: input.moveZ,
        sprint: input.sprint,
        jump: edges.jump,
        pass: edges.pass,
        steal: edges.steal,
        shootHeld: input.shootHeld,
      };
      acc += dt;
      let steps = 0;
      while (acc >= 1 / 60 && steps < 5) {
        world.update(1 / 60);
        acc -= 1 / 60;
        steps++;
      }
    } else {
      input.takeEdges();
    }

    scene.syncWorld(world, dt);
    cameraCtl.update(world, dt);
    hud.update(world, dt);
    scene.render();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}