import * as THREE from 'three';
import { COURT } from '../core/constants';
import type { World } from '../game/world';

/** 第三人称跟随摄像机：固定朝向篮筐方向，便于用 WASD 直觉操作 */
export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private look = new THREE.Vector3(0, 1.2, 2);
  private tmp = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  update(world: World | null, dt: number) {
    if (!world) {
      // 未开始时缓慢环绕
      const t = performance.now() / 6000;
      this.camera.position.set(Math.sin(t) * 13, 7, Math.cos(t) * 13 - 2);
      this.camera.lookAt(0, 1.8, 2.5);
      return;
    }

    const lp = world.localPlayer;
    const ball = world.ball.pos;

    const desired = this.tmp.set(
      lp.pos.x * 0.72,
      3.7,
      lp.pos.z - 6.4,
    );
    desired.x = THREE.MathUtils.clamp(desired.x, -4.8, 4.8);
    desired.z = Math.max(desired.z, COURT.minZ - 1.5);

    const posK = 1 - Math.exp(-5.5 * dt);
    this.camera.position.lerp(desired, posK);

    const targetLook = new THREE.Vector3(
      lp.pos.x * 0.5 + ball.x * 0.28,
      1.25,
      lp.pos.z * 0.55 + ball.z * 0.28 + 1.2,
    );
    const lookK = 1 - Math.exp(-7 * dt);
    this.look.lerp(targetLook, lookK);
    this.camera.lookAt(this.look);
  }
}