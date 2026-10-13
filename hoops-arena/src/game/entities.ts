import * as THREE from 'three';
import { PLAYER } from '../core/constants';

export type Team = 'A' | 'B';
export type AnimState = 'idle' | 'run' | 'dribble' | 'shoot' | 'jump';

export interface AIBrain {
  reactTimer: number;
  jumpTimer: number;
  target: THREE.Vector3;
  aggressiveness: number;
}

/** 球员实体（运动学，自研物理，不使用刚体引擎） */
export class Player {
  id: number;
  team: Team;
  isHuman: boolean;
  name: string;
  jersey: number;        // 球衣号码

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yVel = 0;
  facing = 0;            // 弧度，0 = +z 方向（朝向篮筐）
  moveDir = new THREE.Vector3();
  wantsJump = false;

  hasBall = false;
  anim: AnimState = 'idle';
  stamina = 1;
  sprinting = false;

  charging = false;
  chargeTime = 0;
  shootCooldown = 0;
  stealCooldown = 0;
  dribblePhase = 0;

  points = 0;
  rebounds = 0;
  steals = 0;
  blocks = 0;

  brain: AIBrain;

  constructor(id: number, team: Team, isHuman: boolean, name: string, jersey: number, x = 0, z = 0) {
    this.id = id;
    this.team = team;
    this.isHuman = isHuman;
    this.name = name;
    this.jersey = jersey;
    this.pos.set(x, 0, z);
    this.brain = {
      reactTimer: Math.random() * 0.3,
      jumpTimer: 0,
      target: new THREE.Vector3(),
      aggressiveness: 0.5 + Math.random() * 0.5,
    };
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  get right() {
    return new THREE.Vector3(Math.cos(this.facing), 0, -Math.sin(this.facing));
  }

  get airborne() {
    return this.pos.y > 0.02;
  }

  get speed2D() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** 出手点：身前上方 */
  releasePoint(): THREE.Vector3 {
    const f = this.forward;
    return new THREE.Vector3(
      this.pos.x + f.x * 0.32,
      this.pos.y + PLAYER.releaseHeight,
      this.pos.z + f.z * 0.32,
    );
  }

  /** 站立可触球高度 */
  get reachHeight() {
    return this.pos.y + PLAYER.height + 0.7;
  }
}

/** 篮球实体 */
export class Ball {
  pos = new THREE.Vector3(0, 0.12, -2);
  vel = new THREE.Vector3();
  spin = new THREE.Vector3();
  holder: Player | null = null;
  lastTouch: Player | null = null;
  state: 'held' | 'flying' | 'loose' | 'dead' = 'loose';

  prevX = 0;
  prevY = 0.12;
  prevZ = 0;
  airTime = 0;
  touchedRim = false;
  deadTimer = 0;
}