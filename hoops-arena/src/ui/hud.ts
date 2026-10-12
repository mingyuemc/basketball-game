import type { World } from '../game/world';

const KIND_COLOR: Record<string, string> = {
  score: '#34e0a1',
  block: '#ff8a1e',
  steal: '#ff8a1e',
  violation: '#ffd166',
  oob: '#ffd166',
  start: '#ffffff',
  end: '#ffffff',
};

export class HUD {
  private scoreA = document.getElementById('scoreA')!;
  private scoreB = document.getElementById('scoreB')!;
  private gameClock = document.getElementById('gameClock')!;
  private shotClock = document.getElementById('shotClock')!;
  private powerWrap = document.getElementById('powerWrap')!;
  private powerFill = document.getElementById('powerFill')!;
  private perfectZone = document.getElementById('perfectZone')!;
  private msg = document.getElementById('msg')!;
  private fpsEl = document.getElementById('fps')!;

  private lastEventId = 0;
  private hideMsgAt = 0;
  private fpsSmooth = 60;

  update(world: World | null, dt: number) {
    // FPS
    if (dt > 0) this.fpsSmooth += (1 / dt - this.fpsSmooth) * 0.1;
    this.fpsEl.textContent = `${Math.round(this.fpsSmooth)} FPS`;

    if (!world) return;

    this.scoreA.textContent = String(world.score.a);
    this.scoreB.textContent = String(world.score.b);

    this.gameClock.textContent = fmtClock(world.gameClock);
    const sc = Math.max(0, Math.ceil(world.shotClock));
    this.shotClock.textContent = String(sc);
    this.shotClock.classList.toggle('warn', sc <= 5);

    // 蓄力条
    const lp = world.localPlayer;
    const hasBall = !!(lp && lp.hasBall);
    this.powerWrap.classList.toggle('active', hasBall);
    if (hasBall) {
      const ratio = world.getChargeRatio();
      this.powerFill.style.width = `${(ratio * 100).toFixed(1)}%`;
      const perfect = world.getPerfectPower();
      const left = Math.max(0, Math.min(1, perfect - 0.05)) * 100;
      this.perfectZone.style.left = `calc(${left}% )`;
      this.perfectZone.style.width = '12%';
    }

    // 事件消息
    const evs = world.events;
    if (evs.length) {
      const latest = evs[evs.length - 1];
      if (latest.id > this.lastEventId) {
        this.lastEventId = latest.id;
        this.msg.textContent = latest.text;
        this.msg.style.color = KIND_COLOR[latest.kind] ?? '#ffffff';
        this.msg.classList.add('show');
        this.hideMsgAt = performance.now() / 1000 + (latest.kind === 'end' ? 6 : 1.5);
      }
    }
    if (this.msg.classList.contains('show') && performance.now() / 1000 > this.hideMsgAt) {
      this.msg.classList.remove('show');
    }
  }
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}