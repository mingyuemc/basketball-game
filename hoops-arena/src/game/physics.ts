import * as THREE from 'three';
import { BALL, COURT, GRAVITY, SHOOT } from '../core/constants';
import type { Ball } from './entities';

const RIM = new THREE.Vector3(COURT.hoop.x, COURT.hoop.y, COURT.hoop.z);

const _ring = new THREE.Vector3();
const _n = new THREE.Vector3();

export interface BallStepResult {
  scored: boolean;
  hitRim: boolean;
}

/** 自研篮球物理积分：重力 + 阻尼 + 地面/篮筐/篮板碰撞 + 进球判定 */
export function stepBall(ball: Ball, dt: number): BallStepResult {
  ball.prevX = ball.pos.x;
  ball.prevY = ball.pos.y;
  ball.prevZ = ball.pos.z;
  ball.airTime += dt;

  // 积分：Verlet 形式（重力恒定 → 对抛物线精确，避免半隐式欧拉的"偏低"误差）
  ball.pos.addScaledVector(ball.vel, dt);
  ball.pos.y -= 0.5 * GRAVITY * dt * dt;
  ball.vel.y -= GRAVITY * dt;
  if (BALL.linearDamping > 0) {
    ball.vel.multiplyScalar(Math.max(0, 1 - BALL.linearDamping * dt));
  }

  const scored = detectScore(ball);
  const hitRim = resolveRim(ball);
  resolveBackboard(ball);
  resolveFloor(ball, dt);

  ball.spin.multiplyScalar(Math.max(0, 1 - BALL.angularDamping * dt));

  return { scored, hitRim };
}

/** 篮筐：把框看作水平圆环（torus），只对"球心水平落在环内、且不在环中央落区"的部分做擦框反弹；
 *  球心正中央穿过（半径 < ballRadius）视为正常进球路径，不与管碰撞 */
function resolveRim(ball: Ball): boolean {
  const r = BALL.radius;
  const tube = COURT.rimTube;
  const R = COURT.rimRadius;

  const dx = ball.pos.x - RIM.x;
  const dz = ball.pos.z - RIM.z;
  const horiz = Math.hypot(dx, dz);

  // 球心在环正中央（半径 < 球半径）→ 视为穿过筐口，不与管壁碰撞
  if (horiz + r < R) return false;

  // 球心水平已在环外 → 球完全错过筐，0.05m 容忍后跳过
  if (horiz > R + tube + r) return false;

  // 球心离环中心水平距离 → 取最近环上点的方向
  let dirx: number, dirz: number;
  if (horiz < 1e-5) { dirx = 1; dirz = 0; }
  else { dirx = dx / horiz; dirz = dz / horiz; }
  _ring.set(RIM.x + dirx * R, RIM.y, RIM.z + dirz * R);
  _n.subVectors(ball.pos, _ring);
  const dist = _n.length();
  const minDist = r + tube;
  if (dist >= minDist) return false;

  if (dist < 1e-6) _n.set(0, 1, 0);
  else _n.multiplyScalar(1 / dist);

  // 推出穿透
  ball.pos.addScaledVector(_n, minDist - dist);
  const vn = ball.vel.dot(_n);
  if (vn < 0) ball.vel.addScaledVector(_n, -(1 + BALL.restitution) * vn);
  ball.vel.multiplyScalar(0.92);
  return true;
}

/** 篮板：朝向球场的竖直平面，每帧只反弹一次（避免位置反复推回造成振荡） */
function resolveBackboard(ball: Ball) {
  const bb = COURT.backboard;
  const r = BALL.radius;
  const overlap = ball.pos.z + r > bb.z && ball.pos.z < bb.z + 0.5;
  const inX = Math.abs(ball.pos.x) < bb.halfWidth + r;
  const inY = ball.pos.y > bb.bottom - r && ball.pos.y < bb.top + r;
  if (overlap && inX && inY) {
    ball.pos.z = bb.z - r;
    if (ball.vel.z > 0) ball.vel.z = -ball.vel.z * 0.72;
  }
}

/** 地面弹性 + 摩擦，低速时静止 */
function resolveFloor(ball: Ball, dt: number) {
  const r = BALL.radius;
  if (ball.pos.y <= r) {
    ball.pos.y = r;
    if (ball.vel.y < 0) {
      ball.vel.y = -ball.vel.y * BALL.restitution;
      ball.vel.x *= 0.82;
      ball.vel.z *= 0.82;
      if (ball.vel.y < 0.5) ball.vel.y = 0;
    }
    // 贴地滚动摩擦
    if (Math.abs(ball.vel.y) < 0.05) {
      const f = Math.max(0, 1 - 1.6 * dt);
      ball.vel.x *= f;
      ball.vel.z *= f;
    }
  }
}

/** 进球：球心自上方下穿篮筐平面，且水平落在框内 */
function detectScore(ball: Ball): boolean {
  const y = COURT.hoop.y;
  if (ball.prevY > y && ball.pos.y <= y && ball.vel.y < 0) {
    // 在离散步之间线性插值出"精确穿越篮筐平面"的水平位置，避免步长过冲导致完美出手误判打铁
    const dy = ball.prevY - ball.pos.y;
    const t = dy > 1e-6 ? (ball.prevY - y) / dy : 0;
    const cx = ball.prevX + (ball.pos.x - ball.prevX) * t;
    const cz = ball.prevZ + (ball.pos.z - ball.prevZ) * t;
    const dx = cx - RIM.x;
    const dz = cz - RIM.z;
    if (Math.hypot(dx, dz) < COURT.rimRadius - BALL.radius * SHOOT.scoreTolerance) return true;
  }
  return false;
}