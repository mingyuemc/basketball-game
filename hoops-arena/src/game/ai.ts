import * as THREE from 'three';
import { COURT } from '../core/constants';
import type { Player } from './entities';
import { perfectPowerFor, shotDistance } from './shooting';
import type { World } from './world';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface DiffParams {
  reaction: number;    // 决策反应间隔（秒）
  shotNoise: number;   // 蓄力误差（弧度/比例）
  dirNoise: number;    // 方向噪声
  contestJump: number; // 封盖意愿
  sprintChase: boolean;
}

const DIFF: Record<Difficulty, DiffParams> = {
  easy:   { reaction: 0.55, shotNoise: 0.28, dirNoise: 0.060, contestJump: 0.015, sprintChase: false },
  normal: { reaction: 0.26, shotNoise: 0.10, dirNoise: 0.030, contestJump: 0.035, sprintChase: true },
  hard:   { reaction: 0.12, shotNoise: 0.045, dirNoise: 0.015, contestJump: 0.06, sprintChase: true },
};

let P: DiffParams = DIFF.normal;

export function setAIDifficulty(d: Difficulty) {
  P = DIFF[d];
}

const HOOP = new THREE.Vector3(COURT.hoop.x, COURT.hoop.y, COURT.hoop.z);

function planar(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

/** AI 主循环：决策 + 设置 moveDir / wantsJump / 触发投篮 */
export function updateAI(p: Player, world: World, dt: number) {
  const b = p.brain;
  b.reactTimer -= dt;
  b.jumpTimer -= dt;

  const ball = world.ball;
  const teamHasBall = world.possession === p.team;

  if (ball.holder === p) {
    offenseWithBall(p, world, dt);
  } else if (teamHasBall) {
    offBallOffense(p, world, dt);
  } else {
    defense(p, world, dt);
  }
}

function moveToward(p: Player, tx: number, tz: number, sprint: boolean) {
  const dx = tx - p.pos.x;
  const dz = tz - p.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) { p.moveDir.set(0, 0, 0); return; }
  p.moveDir.set(dx / len, 0, dz / len);
  p.sprinting = sprint && len > 2.5;
}

function offenseWithBall(p: Player, world: World, dt: number) {
  const b = p.brain;
  const d = shotDistance(p);
  const def = world.nearestOpponent(p);
  const defDist = def ? planar(p.pos.x, p.pos.z, def.pos.x, def.pos.z) : 99;
  const open = defDist > 1.7;

  // 2K 风格：AI 也先蓄力再出手（蓄力期间停在原地，让玩家看到"蓄力"动画）
  if (p.charging) {
    p.chargeTime = Math.min(p.chargeTime + dt, 1.1);
    // 到达 ~70% 蓄力出手（接近完美点）
    if (p.chargeTime >= 0.78) {
      const power = perfectPowerFor(p);
      world.shootPlayer(p, power, true, P.shotNoise, P.dirNoise);
      return;
    }
    moveToward(p, p.pos.x, p.pos.z, false);
    return;
  }

  if (b.reactTimer <= 0) {
    b.reactTimer = P.reaction * (0.7 + Math.random() * 0.6);

    // 空位或足够近 → 进入蓄力（移动中会触发急停跳投）
    if (d < 6.2 && (open || Math.random() < 0.3)) {
      p.charging = true;
      p.chargeTime = 0;
      p.stopAndPop = p.speed2D > 1.2;
      if (p.stopAndPop) p.yVel = Math.max(p.yVel, 4.0);
      // 急停：把水平速度减下来
      p.vel.x *= 0.3;
      p.vel.z *= 0.3;
      b.reactTimer = 1.0;
      return;
    }
    // 有队友且被贴身 → 传球
    if (!open && defDist < 1.5 && world.teammatesOf(p).length > 0 && Math.random() < 0.5) {
      world.aiPass(p);
      return;
    }
    // 否则选择突破方向（停在 3~3.4m 的投篮区，而非一路杀到篮下"必进"上篮）
    if (!open && d > 2.5) {
      const side = Math.random() < 0.5 ? -1 : 1;
      b.target.set(COURT.hoop.x + side * 2.4, 0, COURT.hoop.z - 3.4);
    } else {
      b.target.set(COURT.hoop.x, 0, COURT.hoop.z - 3.0);
    }
  }

  const tx = b.target.lengthSq() > 0 ? b.target.x : COURT.hoop.x;
  const tz = b.target.lengthSq() > 0 ? b.target.z : COURT.hoop.z - 3.0;
  moveToward(p, tx, tz, P.sprintChase);
  if (planar(p.pos.x, p.pos.z, tx, tz) < 0.5) b.target.set(0, 0, 0);
}

function offBallOffense(p: Player, world: World, dt: number) {
  const spot = world.offenseSpotFor(p);
  moveToward(p, spot.x, spot.z, false);
  // 顺带争取抢进攻篮板
  if (world.ball.state === 'flying' && !world.ball.holder) {
    moveToward(p, world.ball.pos.x, world.ball.pos.z, P.sprintChase);
  }
}

function defense(p: Player, world: World, dt: number) {
  const b = p.brain;
  const holder = world.ball.holder;

  // 球权不明 → 追球
  if (!holder) {
    if (world.ball.state === 'flying' || world.ball.state === 'loose') {
      moveToward(p, world.ball.pos.x, world.ball.pos.z, P.sprintChase);
    } else {
      const spot = world.defenseSpotFor(p);
      moveToward(p, spot.x, spot.z, false);
    }
    return;
  }

  const primary = world.primaryDefender(holder);
  if (primary === p) {
    // 站在持球人与篮筐之间
    const dx = HOOP.x - holder.pos.x;
    const dz = HOOP.z - holder.pos.z;
    const len = Math.max(Math.hypot(dx, dz), 1e-4);
    const standX = holder.pos.x + (dx / len) * 1.15;
    const standZ = holder.pos.z + (dz / len) * 1.15;
    moveToward(p, standX, standZ, true);

    // 封盖：对手蓄力/起跳且靠近
    const near = planar(p.pos.x, p.pos.z, holder.pos.x, holder.pos.z) < 1.6;
    if (near && (holder.charging || holder.airborne) && b.jumpTimer <= 0 && Math.random() < P.contestJump) {
      p.wantsJump = true;
      b.jumpTimer = 1.1;
    }
  } else {
    const mark = world.markTargetFor(p);
    moveToward(p, mark.x, mark.z, false);
  }
}