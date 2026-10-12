import * as THREE from 'three';
import { COURT, GRAVITY, SHOOT } from '../core/constants';
import type { Player } from './entities';

/** 出手点到篮筐的水平距离 */
export function shotDistance(p: Player): number {
  return Math.hypot(COURT.hoop.x - p.pos.x, COURT.hoop.z - p.pos.z);
}

/** 该位置下的"完美蓄力值"（距篮越远，完美点越高） */
export function perfectPowerFor(p: Player): number {
  const d = shotDistance(p);
  return SHOOT.perfectBase + SHOOT.perfectRange * Math.min(d / 9, 1);
}

export interface ShotResult {
  release: THREE.Vector3;
  vel: THREE.Vector3;
}

/**
 * 由"蓄力值 + 误差"解算出手速度。
 * 思路（对齐文档 6.2）：视觉轨迹由真实物理模拟决定，服务/规则侧只影响精度。
 * 用固定出手角反解"完美速度"，再用 (power - perfect) 缩放速度，误差越大越容易打铁。
 */
export function computeShot(
  p: Player,
  power: number,
  dirNoise: number,
  speedNoise: number,
): ShotResult {
  const release = p.releasePoint();
  const dx = COURT.hoop.x - release.x;
  const dz = COURT.hoop.z - release.z;
  const D = Math.max(Math.hypot(dx, dz), 0.15);
  const dy = COURT.hoop.y - release.y;

  // 出手角随距离自适应：近距用高抛（否则球到框口时近乎水平、穿不进筐），远距用 52°
  let angleDeg: number;
  if (D <= SHOOT.closeThreshold) angleDeg = SHOOT.closeAngleDeg;
  else if (D >= SHOOT.farAngleDist) angleDeg = SHOOT.baseAngleDeg;
  else {
    const t = (D - SHOOT.closeThreshold) / (SHOOT.farAngleDist - SHOOT.closeThreshold);
    angleDeg = SHOOT.closeAngleDeg - (SHOOT.closeAngleDeg - SHOOT.baseAngleDeg) * t;
  }
  const ang = (angleDeg * Math.PI) / 180;
  const tan = Math.tan(ang);
  const cos = Math.cos(ang);

  // 抛体解算：dy = D·tanθ - g·D² / (2·v²·cos²θ)
  const denom = 2 * cos * cos * (D * tan - dy);
  let reqV: number;
  if (denom > 0.02) {
    reqV = Math.sqrt((GRAVITY * D * D) / denom);
  } else {
    // 过近/角度无法命中时退化为经验速度
    reqV = Math.sqrt(GRAVITY * D) * 1.1;
  }

  const perfect = perfectPowerFor(p);
  const speed = reqV * (1 + (power - perfect) * SHOOT.speedGain) * (1 + speedNoise);

  // 水平方向 + 角度噪声
  let hx = 0, hz = 1;
  if (D > 1e-4) { hx = dx / D; hz = dz / D; }
  const ca = Math.cos(dirNoise), sa = Math.sin(dirNoise);
  const rhx = hx * ca - hz * sa;
  const rhz = hx * sa + hz * ca;

  const vh = speed * cos;
  const vel = new THREE.Vector3(rhx * vh, speed * Math.sin(ang), rhz * vh);
  return { release, vel };
}