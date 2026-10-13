import * as THREE from 'three';
import { BALL as BALL_CONST, BLOCK, COURT, PLAYER, RULES, SHOOT } from '../core/constants';
import { Ball, Player, Team } from './entities';
import { stepBall } from './physics';
import { updateAI, setAIDifficulty, type Difficulty } from './ai';
import { computeShot, perfectPowerFor, shotDistance } from './shooting';

export type GameMode = '1v1' | '3v3';

export interface HumanInput {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;     // 边沿
  pass: boolean;     // 边沿
  steal: boolean;    // 边沿
  fake: boolean;     // 边沿：假动作（胯下/背后）
  iso: boolean;      // 边沿：背身/要球
  shootTap: boolean; // 边沿：投篮"点击"（2K 风格：第一次按下=开始蓄力；再次按下=出手）
  shootHeld: boolean;
}

export interface GameEvent {
  id: number;
  text: string;
  kind: string;
  time: number;
}

const HOOP = new THREE.Vector3(COURT.hoop.x, COURT.hoop.y, COURT.hoop.z);

function planarV(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 单机比赛世界：规则 + 自研物理 + AI 驱动 */
export class World {
  mode: GameMode;
  players: Player[] = [];
  ball = new Ball();
  score = { a: 0, b: 0 };
  gameClock = RULES.quarterTime;
  shotClock = RULES.shotClock;
  possession: Team = 'A';
  phase: 'playing' | 'deadball' | 'ended' = 'playing';
  events: GameEvent[] = [];
  localPlayer!: Player;
  humanInput: HumanInput = {
    moveX: 0, moveZ: 0, sprint: false,
    jump: false, pass: false, steal: false, fake: false, iso: false, shootTap: false,
    shootHeld: false,
  };

  private pendingPossession: Team = 'A';
  private deadTimer = 0;
  private lastShot: { shooter: Player; dist: number } | null = null;
  private evtId = 0;

  constructor(mode: GameMode, difficulty: Difficulty) {
    this.mode = mode;
    setAIDifficulty(difficulty);
    this.buildTeams();
    this.assembleOffense('A');
    this.event('比赛开始', 'start');
  }

  // ---------------- 建队 ----------------
  private buildTeams() {
    // 球衣号码：每名球员唯一（与 id 对应）
    const mk = (id: number, team: Team, human: boolean, name: string) =>
      new Player(id, team, human, name, team === 'A' ? id : id + 3);
    if (this.mode === '1v1') {
      this.localPlayer = mk(1, 'A', true, 'YOU');
      this.players.push(this.localPlayer, mk(2, 'B', false, 'CPU'));
    } else {
      this.localPlayer = mk(1, 'A', true, 'YOU');
      this.players.push(
        this.localPlayer,
        mk(2, 'A', false, 'KAI'),
        mk(3, 'A', false, 'LEO'),
        mk(4, 'B', false, 'JAX'),
        mk(5, 'B', false, 'RYO'),
        mk(6, 'B', false, 'ZED'),
      );
    }
    // 人类玩家控制索引
    this.localPlayer.isHuman = true;
  }

  // ---------------- 查询辅助 ----------------
  planar(a: THREE.Vector3, b: THREE.Vector3) { return planarV(a, b); }

  teammatesOf(p: Player) { return this.players.filter((q) => q.team === p.team && q !== p); }
  opponentsOf(p: Player) { return this.players.filter((q) => q.team !== p.team); }

  nearestOpponent(p: Player): Player | null {
    let best: Player | null = null, bestD = Infinity;
    for (const q of this.players) {
      if (q.team === p.team) continue;
      const d = planarV(p.pos, q.pos);
      if (d < bestD) { bestD = d; best = q; }
    }
    return best;
  }

  primaryDefender(holder: Player): Player | null {
    let best: Player | null = null, bestD = Infinity;
    for (const q of this.players) {
      if (q.team === holder.team) continue;
      const d = planarV(holder.pos, q.pos);
      if (d < bestD) { bestD = d; best = q; }
    }
    return best;
  }

  private spotIndex(p: Player) {
    return this.players.filter((q) => q.team === p.team).indexOf(p);
  }

  private offenseSpots(): number[][] {
    return this.mode === '1v1'
      ? [[0, -3.2]]
      : [[0, -3.4], [-4.6, 0.4], [4.7, 3.2]];
  }
  private defenseSpots(): number[][] {
    return this.mode === '1v1'
      ? [[0, -1.0]]
      : [[0, -1.2], [-3.7, 1.5], [3.8, 3.8]];
  }

  offenseSpotFor(p: Player): THREE.Vector3 {
    const s = this.offenseSpots();
    const i = this.spotIndex(p) % s.length;
    return new THREE.Vector3(s[i][0], 0, s[i][1]);
  }
  defenseSpotFor(p: Player): THREE.Vector3 {
    const s = this.defenseSpots();
    const i = this.spotIndex(p) % s.length;
    return new THREE.Vector3(s[i][0], 0, s[i][1]);
  }

  /** 非主防球员：盯最近的无球对手（略带向筐偏移） */
  markTargetFor(p: Player): THREE.Vector3 {
    const holder = this.ball.holder;
    const opp = this.players.filter((q) => q.team !== p.team && q !== holder);
    if (!opp.length) return new THREE.Vector3(0, 0, -0.5);
    opp.sort((a, b) => planarV(p.pos, a.pos) - planarV(p.pos, b.pos));
    const t = opp[0];
    const dx = HOOP.x - t.pos.x, dz = HOOP.z - t.pos.z;
    const len = Math.max(Math.hypot(dx, dz), 1e-4);
    return new THREE.Vector3(t.pos.x + (dx / len) * 1.0, 0, t.pos.z + (dz / len) * 1.0);
  }

  // ---------------- 主循环 ----------------
  update(dt: number) {
    if (this.phase === 'ended') return;

    if (this.phase === 'deadball') {
      this.deadTimer -= dt;
      this.stepPlayers(dt, true);
      // 死球期间球跟随持球人视觉即可
      if (this.deadTimer <= 0) {
        this.phase = 'playing';
        this.assembleOffense(this.pendingPossession);
      }
      return;
    }

    // 时钟
    this.gameClock -= dt;
    if (this.gameClock <= 0) {
      this.gameClock = 0;
      this.endGame();
      return;
    }
    this.shotClock -= dt;
    if (this.shotClock <= 0) {
      this.event('24秒违例 · 球权转换', 'violation');
      this.assembleOffense(this.possession === 'A' ? 'B' : 'A');
      return;
    }

    this.stepPlayers(dt, false);
    this.updateBall(dt);
    this.updatePickup(dt);
    this.checkOutOfBounds();
  }

  private stepPlayers(dt: number, frozen: boolean) {
    for (const p of this.players) {
      if (frozen) {
        p.moveDir.set(0, 0, 0);
        p.sprinting = false;
      } else if (p.isHuman) {
        this.applyHumanInput(p, dt);
      } else {
        updateAI(p, this, dt);
      }
      this.integratePlayer(p, dt);
    }
  }

  private applyHumanInput(p: Player, dt: number) {
    const inp = this.humanInput;
    p.moveDir.set(inp.moveX, 0, inp.moveZ);
    if (p.moveDir.lengthSq() > 1) p.moveDir.normalize();
    p.sprinting = inp.sprint && p.stamina > 0.05 && p.moveDir.lengthSq() > 0.01;
    if (inp.jump) p.wantsJump = true;

    if (p.hasBall) {
      // 2K 风格投篮：第一次点击 → 开始蓄力；再次点击 → 出手
      // 急停跳投：非持球移动状态(跑) 中按左键 → 立即起跳+蓄力
      const isMovingFast = p.speed2D > 1.2;
      if (inp.shootTap) {
        if (!p.charging) {
          // 进入蓄力；如果移动中且之前未站立 → 触发急停跳投
          p.charging = true;
          p.chargeTime = 0;
          p.stopAndPop = isMovingFast;
          if (isMovingFast) p.yVel = Math.max(p.yVel, PLAYER.jumpVel * 0.85);
        } else {
          // 第二次按下 → 出手
          this.shootPlayer(p, p.chargeTime / SHOOT.powerMaxTime, false);
        }
      }
      if (p.charging) {
        p.chargeTime = Math.min(p.chargeTime + dt, SHOOT.powerMaxTime);
        // 超时（约 1.3s）→ 自动以当前蓄力出手，避免无限等待
        if (p.chargeTime >= SHOOT.powerMaxTime * 1.1) {
          this.shootPlayer(p, Math.min(1, p.chargeTime / SHOOT.powerMaxTime), false);
        }
      }
      if (inp.pass) this.passFrom(p);
      if (inp.fake) this.doFake(p);
    } else {
      // 不持球时：清掉蓄力状态（但保留极短窗口允许接球即投的衔接）
      if (p.charging) {
        p.charging = false;
        p.chargeTime = 0;
        p.stopAndPop = false;
      }
    }

    if (inp.steal) this.trySteal(p);
  }

  private integratePlayer(p: Player, dt: number) {
    // 体力
    if (p.sprinting && p.moveDir.lengthSq() > 0.01) p.stamina = Math.max(0, p.stamina - 0.16 * dt);
    else p.stamina = Math.min(1, p.stamina + 0.13 * dt);

    const speed = (p.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * (0.62 + 0.38 * p.stamina);
    const k = 1 - Math.exp(-PLAYER.accel * dt);
    p.vel.x += (p.moveDir.x * speed - p.vel.x) * k;
    p.vel.z += (p.moveDir.z * speed - p.vel.z) * k;

    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;

    const m = PLAYER.radius;
    p.pos.x = Math.max(-COURT.halfWidth + m, Math.min(COURT.halfWidth - m, p.pos.x));
    p.pos.z = Math.max(COURT.minZ + m, Math.min(COURT.maxZ - m, p.pos.z));

    // 2K 风格：急停跳投 - 强制减速到接近 0，给"急停"反馈
    if (p.stopAndPop && p.speed2D > 0.4) {
      const decel = 1 - Math.exp(-12 * dt);
      p.vel.x -= p.vel.x * decel;
      p.vel.z -= p.vel.z * decel;
    }
    // 2K 风格：假动作期间 - 强制减速（顿一下）
    if (p.fakeTimer > 0) {
      const decel = 1 - Math.exp(-16 * dt);
      p.vel.x -= p.vel.x * decel;
      p.vel.z -= p.vel.z * decel;
      p.fakeTimer = Math.max(0, p.fakeTimer - dt);
    }

    // 跳跃
    if (p.wantsJump && p.pos.y <= 0.001 && p.shootCooldown <= 0) p.yVel = PLAYER.jumpVel;
    p.wantsJump = false;
    if (p.pos.y > 0 || p.yVel > 0) {
      p.yVel -= PLAYER.jumpGravity * dt;
      p.pos.y += p.yVel * dt;
      if (p.pos.y <= 0) { p.pos.y = 0; p.yVel = 0; }
    }

    // 朝向
    if (p.speed2D > 0.6) {
      p.facing = this.lerpAngle(p.facing, Math.atan2(p.vel.x, p.vel.z), 1 - Math.exp(-11 * dt));
    } else if (p.hasBall) {
      p.facing = this.lerpAngle(p.facing, Math.atan2(HOOP.x - p.pos.x, HOOP.z - p.pos.z), 1 - Math.exp(-7 * dt));
    }

    // 冷却
    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    p.stealCooldown = Math.max(0, p.stealCooldown - dt);
    if (p.hasBall) p.dribblePhase += dt * 9;

    // 动画状态
    if (p.pos.y > 0.05) p.anim = 'jump';
    else if (p.charging) p.anim = 'shoot';
    else if (p.speed2D > 0.6) p.anim = p.hasBall ? 'dribble' : 'run';
    else p.anim = 'idle';
  }

  private lerpAngle(a: number, b: number, t: number) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // ---------------- 球 ----------------
  private updateBall(dt: number) {
    if (this.ball.holder) {
      this.updateDribble(dt);
      return;
    }
    const res = stepBall(this.ball, dt);
    if (res.hitRim) this.ball.touchedRim = true;
    if (res.scored) { this.onScore(); return; }
    this.updateFlightInteractions();
  }

  private updateDribble(dt: number) {
    const p = this.ball.holder!;
    const f = p.forward;
    const r = p.right;
    p.dribblePhase += dt * 9;
    const bx = p.pos.x + f.x * 0.38 + r.x * 0.14;
    const bz = p.pos.z + f.z * 0.38 + r.z * 0.14;
    const bounce = 0.12 + Math.abs(Math.sin(p.dribblePhase)) * 0.62;
    this.ball.pos.set(bx, bounce, bz);
    this.ball.vel.set(0, 0, 0);
  }

  private updateFlightInteractions() {
    const b = this.ball;
    if (b.state !== 'flying') return;
    if (b.pos.y < 1.8) return;
    // 球已在篮板后方（穿过篮板飞出）→ 不应被盖帽
    if (b.pos.z > COURT.backboard.z + BALL_CONST.radius + 0.05) return;
    for (const p of this.players) {
      if (p === b.lastTouch) continue;
      if (b.lastTouch && p.team === b.lastTouch.team) continue;
      // 盖帽需满足：防守方起跳、横向足够近、且球已升到头顶以上（避免贴身一出球就被拍掉）
      if (p.pos.y > 0.25 && planarV(p.pos, b.pos) < BLOCK.horizRadius && b.pos.y > BLOCK.minBallY && b.pos.y < p.reachHeight) {
        const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z;
        const len = Math.max(Math.hypot(dx, dz), 1e-4);
        b.vel.set((dx / len) * BLOCK.reboundVelH, BLOCK.reboundVelY, (dz / len) * BLOCK.reboundVelH);
        b.lastTouch = p;
        p.blocks++;
        this.event(`${p.isHuman ? '你' : p.name} 盖帽!`, 'block');
        break;
      }
    }
  }

  private updatePickup(dt: number) {
    const b = this.ball;
    if (b.holder || b.state === 'dead') return;
    let best: Player | null = null, bestD = Infinity;
    for (const p of this.players) {
      if (p === b.lastTouch && b.airTime < 0.55) continue;
      const d = planarV(p.pos, b.pos);
      if (d < PLAYER.pickupDist && b.pos.y < 1.7 && d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      const wasRim = b.touchedRim;
      const sameTeam = best.team === this.possession;
      this.giveBall(best);
      if (wasRim) {
        best.rebounds++;
        if (sameTeam) this.shotClock = Math.max(this.shotClock, 14);
      }
    }
  }

  private checkOutOfBounds() {
    const b = this.ball;
    if (b.holder) return;
    const mg = 0.6;
    if (
      b.pos.x < -COURT.halfWidth - mg || b.pos.x > COURT.halfWidth + mg ||
      b.pos.z < COURT.minZ - mg || b.pos.z > COURT.maxZ + mg
    ) {
      this.event('出界 · 球权转换', 'oob');
      this.assembleOffense(this.possession === 'A' ? 'B' : 'A');
    }
  }

  // ---------------- 球权 / 回合 ----------------
  private giveBall(p: Player) {
    const b = this.ball;
    b.holder = p;
    b.state = 'held';
    b.airTime = 0;
    b.touchedRim = false;
    b.lastTouch = p;
    for (const q of this.players) q.hasBall = false;
    p.hasBall = true;
    if (this.possession !== p.team) {
      this.possession = p.team;
      this.shotClock = RULES.shotClock;
    }
  }

  /** 摆好进攻/防守站位并把球交给进攻方 */
  assembleOffense(team: Team) {
    this.possession = team;
    this.shotClock = RULES.shotClock;
    const off = this.players.filter((p) => p.team === team);
    const def = this.players.filter((p) => p.team !== team);
    const O = this.offenseSpots();
    const D = this.defenseSpots();

    off.forEach((p, i) => {
      const s = O[i % O.length];
      p.pos.set(s[0], 0, s[1]);
      p.vel.set(0, 0, 0); p.yVel = 0;
    });
    def.forEach((p, i) => {
      const s = D[i % D.length];
      p.pos.set(s[0], 0, s[1]);
      p.vel.set(0, 0, 0); p.yVel = 0;
    });
    for (const p of this.players) { p.hasBall = false; p.charging = false; p.chargeTime = 0; }

    const b = this.ball;
    b.holder = null; b.state = 'loose'; b.touchedRim = false; b.airTime = 0; b.vel.set(0, 0, 0);
    this.giveBall(off[0]);
  }

  // ---------------- 投篮 / 传球 / 抢断 ----------------
  aiShoot(p: Player, shotNoise = 0, dirNoise = 0) {
    const power = perfectPowerFor(p) + gauss() * 0.02;
    this.shootPlayer(p, power, true, shotNoise, dirNoise);
  }

  shootPlayer(p: Player, power: number, isAI: boolean, shotNoise = 0, dirNoise = 0) {
    if (!p.hasBall || p.shootCooldown > 0) return;

    // 出手前对准篮筐
    p.facing = Math.atan2(HOOP.x - p.pos.x, HOOP.z - p.pos.z);

    const d = shotDistance(p);
    this.lastShot = { shooter: p, dist: d };

    const def = this.nearestOpponent(p);
    const defDist = def ? planarV(p.pos, def.pos) : 99;
    const pressure = clamp01(1 - (defDist - 0.7) / 1.8);
    const distFactor = Math.min(d / 9, 1);

    const baseDirNoise = 0.005 + 0.036 * pressure + 0.007 * distFactor;
    const dirNoiseTotal = gauss() * baseDirNoise + (isAI ? gauss() * dirNoise : 0);
    // 内禀速度噪声取小值：让"完美释放"成为可靠峰值，命中率主要由玩家的蓄力误差决定
    const speedNoise = gauss() * 0.004;

    let powerFinal = power;
    if (isAI) powerFinal = clamp01(power + gauss() * shotNoise);

    const { release, vel } = computeShot(p, powerFinal, dirNoiseTotal, speedNoise);

    const b = this.ball;
    b.holder = null;
    p.hasBall = false;
    p.charging = false;
    p.chargeTime = 0;
    p.stopAndPop = false;
    p.shootCooldown = 0.55;

    b.pos.copy(release);
    b.vel.copy(vel);
    b.spin.set(0, 0, -8);
    b.state = 'flying';
    b.lastTouch = p;
    b.airTime = 0;
    b.touchedRim = false;
  }

  private passFrom(p: Player) {
    const mates = this.teammatesOf(p);
    if (!mates.length) return;
    mates.sort((a, b) => planarV(p.pos, a.pos) - planarV(p.pos, b.pos));
    this.passTo(p, mates[0]);
  }

  aiPass(p: Player) {
    const mates = this.teammatesOf(p);
    if (!mates.length) return;
    mates.sort((a, b) => planarV(p.pos, a.pos) - planarV(p.pos, b.pos));
    this.passTo(p, mates[0]);
  }

  private passTo(from: Player, to: Player) {
    const dx = to.pos.x - from.pos.x;
    const dz = to.pos.z - from.pos.z;
    const len = Math.max(Math.hypot(dx, dz), 0.5);
    const nx = dx / len, nz = dz / len;
    const speed = Math.min(15, 6 + len * 1.7);

    const b = this.ball;
    b.holder = null;
    from.hasBall = false;
    from.shootCooldown = 0.25;
    b.pos.set(from.pos.x + nx * 0.4, from.pos.y + 1.5, from.pos.z + nz * 0.4);
    b.vel.set(nx * speed, Math.min(3.2, len * 0.45), nz * speed);
    b.state = 'flying';
    b.lastTouch = from;
    b.airTime = 0;
    b.touchedRim = false;
  }

  trySteal(p: Player) {
    if (p.stealCooldown > 0) return;
    p.stealCooldown = 0.8;
    const holder = this.ball.holder;
    if (!holder || holder.team === p.team) return;
    if (planarV(p.pos, holder.pos) > PLAYER.stealRange) return;
    const chance = 0.22 * (0.5 + p.stamina);
    if (Math.random() < chance) {
      this.giveBall(p);
      p.steals++;
      this.event(`${p.isHuman ? '你' : p.name} 抢断!`, 'steal');
    }
  }

  /** 2K 风格假动作：持球瞬间向一侧前倾，0.4s 内若被贴身会触发对手失位 */
  doFake(p: Player) {
    if (!p.hasBall) return;
    p.fakeTimer = 0.45;
    this.event(`${p.isHuman ? '你' : p.name} 假动作`, 'fake');
  }

  // ---------------- 得分 / 结束 ----------------
  private onScore() {
    const shooter = this.ball.lastTouch;
    const team: Team = shooter ? shooter.team : this.possession;
    const pts = this.lastShot && this.lastShot.dist >= COURT.threePoint ? 3 : 2;
    this.score[team === 'A' ? 'a' : 'b'] += pts;
    if (shooter) shooter.points += pts;

    this.event(`${team === 'A' ? 'YOU' : 'CPU'} 得分 +${pts}`, 'score');

    this.ball.state = 'dead';
    this.ball.holder = null;
    this.ball.vel.set(0, 0, 0);
    for (const p of this.players) p.hasBall = false;

    this.pendingPossession = team === 'A' ? 'B' : 'A';
    this.phase = 'deadball';
    this.deadTimer = 2.0;
  }

  private endGame() {
    this.phase = 'ended';
    const a = this.score.a, b = this.score.b;
    const txt = a > b ? '你赢了!' : a < b ? '你输了' : '打平';
    this.event(txt, 'end');
  }

  private event(text: string, kind: string) {
    this.events.push({ id: ++this.evtId, text, kind, time: performance.now() / 1000 });
    if (this.events.length > 24) this.events.shift();
  }

  // ---------------- HUD 只读接口 ----------------
  getPerfectPower() {
    return this.localPlayer ? perfectPowerFor(this.localPlayer) : 0.5;
  }
  getChargeRatio() {
    const p = this.localPlayer;
    return p && p.charging ? p.chargeTime / SHOOT.powerMaxTime : 0;
  }
}