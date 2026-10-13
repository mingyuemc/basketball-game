import * as THREE from 'three';
import { BALL, COURT } from '../core/constants';
import type { World } from '../game/world';
import type { Player } from '../game/entities';

const TEAM_PRIMARY: Record<string, number> = { A: 0x2fd6a0, B: 0xff6b6b };
const TEAM_SECONDARY: Record<string, number> = { A: 0x0d3d2e, B: 0x3a0e0e };

/** 球衣贴图：前片居中带号码、队徽、姓名条。两侧留纯色便于贴合胶囊前后 */
function makeJerseyTexture(team: 'A' | 'B', number: number, name: string): THREE.CanvasTexture {
  const W = 256, H = 384;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;

  const primary = '#' + TEAM_PRIMARY[team].toString(16).padStart(6, '0');
  const secondary = '#' + TEAM_SECONDARY[team].toString(16).padStart(6, '0');

  // 背景：球衣主色
  g.fillStyle = primary;
  g.fillRect(0, 0, W, H);

  // 球衣高光（中央略亮、两侧略暗）
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // 领口（V 形）
  g.fillStyle = secondary;
  g.beginPath();
  g.moveTo(W * 0.42, 0);
  g.lineTo(W * 0.5, H * 0.06);
  g.lineTo(W * 0.58, 0);
  g.closePath();
  g.fill();
  // 领口描边
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(W * 0.42, 0);
  g.lineTo(W * 0.5, H * 0.06);
  g.lineTo(W * 0.58, 0);
  g.stroke();

  // 队徽：左上角盾形 + 队名缩写
  g.fillStyle = secondary;
  g.beginPath();
  g.moveTo(W * 0.08, H * 0.08);
  g.lineTo(W * 0.22, H * 0.08);
  g.lineTo(W * 0.22, H * 0.16);
  g.lineTo(W * 0.15, H * 0.21);
  g.lineTo(W * 0.08, H * 0.16);
  g.closePath();
  g.fill();
  g.fillStyle = primary;
  g.font = 'bold 18px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(team === 'A' ? 'H' : 'V', W * 0.15, H * 0.135);

  // 队名（球衣上方）
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = 'bold 22px sans-serif';
  g.textAlign = 'center';
  g.fillText(team === 'A' ? 'HOOPS' : 'VENOM', W / 2, H * 0.075);

  // 号码（巨大，占据球衣中部）
  const numStr = String(number);
  const numSize = numStr.length >= 2 ? 110 : 140;
  g.fillStyle = '#ffffff';
  g.font = `bold ${numSize}px "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 描边
  g.strokeStyle = secondary;
  g.lineWidth = 8;
  g.strokeText(numStr, W / 2, H * 0.45);
  g.fillText(numStr, W / 2, H * 0.45);

  // 底部分隔线
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(W * 0.1, H * 0.78);
  g.lineTo(W * 0.9, H * 0.78);
  g.stroke();

  // 球衣底部边饰
  g.fillStyle = secondary;
  g.fillRect(0, H * 0.92, W, H * 0.08);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < W; i += 16) g.fillRect(i, H * 0.95, 8, 2);

  // 姓名条（球衣下方，背号上方偏右）
  if (name) {
    g.fillStyle = secondary;
    g.fillRect(W * 0.22, H * 0.81, W * 0.56, H * 0.08);
    g.fillStyle = '#ffffff';
    g.font = 'bold 18px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, W / 2, H * 0.85);
  }

  // 球衣"纤维"纹理（细斜线，营造运动衫质感）
  g.strokeStyle = 'rgba(255,255,255,0.04)';
  g.lineWidth = 1;
  for (let i = -H; i < W; i += 6) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + H, H);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 面部贴图：眼、鼻、嘴、护牙护具等 */
function makeFaceTexture(team: 'A' | 'B'): THREE.CanvasTexture {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const g = canvas.getContext('2d')!;

  const primary = '#' + TEAM_PRIMARY[team].toString(16).padStart(6, '0');
  const secondary = '#' + TEAM_SECONDARY[team].toString(16).padStart(6, '0');

  // 皮肤底色
  g.fillStyle = '#d8a07a';
  g.fillRect(0, 0, S, S);

  // 头带
  g.fillStyle = primary;
  g.fillRect(0, S * 0.32, S, S * 0.12);
  g.fillStyle = secondary;
  g.fillRect(0, S * 0.42, S, S * 0.03);
  // 头带队徽
  g.fillStyle = '#ffffff';
  g.font = 'bold 16px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(team, S * 0.5, S * 0.38);

  // 眉毛
  g.strokeStyle = '#3b2a1a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(S * 0.30, S * 0.55); g.lineTo(S * 0.45, S * 0.52);
  g.moveTo(S * 0.55, S * 0.52); g.lineTo(S * 0.70, S * 0.55);
  g.stroke();

  // 眼睛
  g.fillStyle = '#1a1a1a';
  g.beginPath();
  g.ellipse(S * 0.37, S * 0.62, 5, 3, 0, 0, Math.PI * 2);
  g.ellipse(S * 0.63, S * 0.62, 5, 3, 0, 0, Math.PI * 2);
  g.fill();
  // 眼神高光
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(S * 0.38, S * 0.61, 1.5, 0, Math.PI * 2);
  g.arc(S * 0.64, S * 0.61, 1.5, 0, Math.PI * 2);
  g.fill();

  // 鼻子
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(S * 0.5, S * 0.62);
  g.lineTo(S * 0.48, S * 0.72);
  g.lineTo(S * 0.52, S * 0.72);
  g.stroke();

  // 嘴
  g.strokeStyle = '#5a2a1a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(S * 0.42, S * 0.80);
  g.quadraticCurveTo(S * 0.5, S * 0.84, S * 0.58, S * 0.80);
  g.stroke();

  // 护牙（mouthguard，篮球员常戴）
  g.fillStyle = primary;
  g.beginPath();
  g.moveTo(S * 0.42, S * 0.82);
  g.quadraticCurveTo(S * 0.5, S * 0.92, S * 0.58, S * 0.82);
  g.quadraticCurveTo(S * 0.5, S * 0.86, S * 0.42, S * 0.82);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(S * 0.42, S * 0.82);
  g.quadraticCurveTo(S * 0.5, S * 0.92, S * 0.58, S * 0.82);
  g.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 球场地面贴图（按世界坐标绘制，px/m 缩放） */
function makeCourtTexture(): THREE.CanvasTexture {
  const M = 64; // 每米像素
  const W = COURT.halfWidth * 2 * M;
  const H = (COURT.maxZ - COURT.minZ) * M;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;

  const px = (x: number) => (x + COURT.halfWidth) * M;
  const pz = (z: number) => (z - COURT.minZ) * M;

  // 木地板
  g.fillStyle = '#c9905a';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,70,30,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x < W; x += M) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.fillRect(0, 0, W, H);

  // 线宽
  const lw = 4;
  g.lineWidth = lw;
  g.strokeStyle = '#f5f5f5';

  // 边界
  g.strokeRect(px(-COURT.halfWidth + 0.3), pz(COURT.minZ + 0.3),
    (COURT.halfWidth - 0.3) * 2 * M, (COURT.maxZ - COURT.minZ - 0.6) * M);

  // 罚球区（key）
  const baseZ = COURT.maxZ;
  const keyTopZ = baseZ - COURT.keyDepth;
  g.fillStyle = 'rgba(180,120,60,0.45)';
  g.fillRect(px(-COURT.keyWidth / 2), pz(keyTopZ), COURT.keyWidth * M, COURT.keyDepth * M);
  g.strokeRect(px(-COURT.keyWidth / 2), pz(keyTopZ), COURT.keyWidth * M, COURT.keyDepth * M);

  // 罚球圈
  g.beginPath();
  g.arc(px(0), pz(keyTopZ), 1.8 * M, 0, Math.PI * 2);
  g.stroke();

  // 三分弧（以篮筐圆心，朝球场张开）
  const hx = px(COURT.hoop.x), hz = pz(COURT.hoop.z), r3 = COURT.threePoint * M;
  g.beginPath();
  g.arc(hx, hz, r3, Math.PI, Math.PI * 2);
  g.stroke();

  // 底角三分直线
  const cornerX = 6.6;
  const dz = Math.sqrt(Math.max(COURT.threePoint ** 2 - cornerX ** 2, 0));
  const lineTopZ = COURT.hoop.z - dz;
  g.beginPath();
  g.moveTo(px(-cornerX), pz(COURT.maxZ));
  g.lineTo(px(-cornerX), pz(lineTopZ));
  g.moveTo(px(cornerX), pz(COURT.maxZ));
  g.lineTo(px(cornerX), pz(lineTopZ));
  g.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 篮球贴图（简易黑缝） */
function makeBallTexture(): THREE.CanvasTexture {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#e07a1f';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#20160c';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
  g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  g.beginPath(); g.arc(-S * 0.1, S / 2, S * 0.55, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(S * 1.1, S / 2, S * 0.55, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class GameScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;

  private playerMeshes = new Map<number, THREE.Group>();
  private ballMesh!: THREE.Mesh;
  private ballAxis = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 5.5, -9);
    this.camera.lookAt(0, 1.5, 2);

    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 22, 55);

    this.buildLights();
    this.buildCourt();
    this.buildHoop();
    this.buildBall();

    window.addEventListener('resize', () => this.onResize());
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a2118, 0.75);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff2dd, 1.15);
    dir.position.set(6, 12, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const d = 16;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 45;
    dir.shadow.bias = -0.0006;
    this.scene.add(dir);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    fill.position.set(-8, 8, -6);
    this.scene.add(fill);
  }

  private buildCourt() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT.halfWidth * 2, COURT.maxZ - COURT.minZ),
      new THREE.MeshStandardMaterial({ map: makeCourtTexture(), roughness: 0.85, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 场馆地面（场外暗色）
    const around = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 1 }),
    );
    around.rotation.x = -Math.PI / 2;
    around.position.y = -0.02;
    around.receiveShadow = true;
    this.scene.add(around);

    // 观众席（简易包围）
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1d2734, roughness: 1 });
    const mkStand = (w: number, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 1.2), standMat);
      m.position.set(x, 1.1, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    mkStand(COURT.halfWidth * 2 + 4, 0, COURT.minZ - 1.6, 0);
    mkStand(9, -COURT.halfWidth - 1.6, 0, Math.PI / 2);
    mkStand(9, COURT.halfWidth + 1.6, 0, Math.PI / 2);
  }

  private buildHoop() {
    const group = new THREE.Group();
    const bb = COURT.backboard;

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b323d, roughness: 0.6, metalness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.6, 12), poleMat);
    pole.position.set(0, 1.8, bb.z + 1.1);
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.2), poleMat);
    arm.position.set(0, bb.top - 0.2, bb.z + 0.5);
    arm.castShadow = true;
    group.add(arm);

    // 篮板
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(bb.halfWidth * 2, bb.top - bb.bottom, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0xdfe8f2, transparent: true, opacity: 0.34, roughness: 0.1, metalness: 0.1,
      }),
    );
    board.position.set(0, (bb.bottom + bb.top) / 2, bb.z);
    group.add(board);

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(bb.halfWidth * 2, bb.top - bb.bottom, 0.05)),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    border.position.copy(board.position);
    group.add(border);

    // 内框
    const inner = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.59, 0.45, 0.03)),
      new THREE.LineBasicMaterial({ color: 0xff5a2b }),
    );
    inner.position.set(0, COURT.hoop.y + 0.22, bb.z - 0.04);
    group.add(inner);

    // 篮筐
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(COURT.rimRadius, COURT.rimTube, 10, 28),
      new THREE.MeshStandardMaterial({ color: 0xff5a2b, roughness: 0.35, metalness: 0.5 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(COURT.hoop.x, COURT.hoop.y, COURT.hoop.z);
    rim.castShadow = true;
    group.add(rim);

    // 篮网
    const net = new THREE.Mesh(
      new THREE.CylinderGeometry(COURT.rimRadius, 0.15, 0.44, 12, 4, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 }),
    );
    net.position.set(COURT.hoop.x, COURT.hoop.y - 0.23, COURT.hoop.z);
    group.add(net);

    this.scene.add(group);
  }

  private buildBall() {
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 20, 16),
      new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.6, metalness: 0.05 }),
    );
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
  }

  private ensurePlayerMesh(p: Player): THREE.Group {
    let g = this.playerMeshes.get(p.id);
    if (g) return g;
    g = new THREE.Group();

    const color = TEAM_PRIMARY[p.team];
    const jerseyMap = makeJerseyTexture(p.team, p.jersey, p.name);
    const faceMap = makeFaceTexture(p.team);

    const jerseyMat = new THREE.MeshStandardMaterial({
      map: jerseyMap,
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.08,
      emissive: p.isHuman ? new THREE.Color(color).multiplyScalar(0.10) : new THREE.Color(0x000000),
    });
    const armMat = new THREE.MeshStandardMaterial({
      map: jerseyMap,
      color: 0xffffff,
      roughness: 0.6,
    });
    const headMat = new THREE.MeshStandardMaterial({
      map: faceMap,
      color: 0xffffff,
      roughness: 0.75,
    });

    // 躯干：胶囊形 → 贴球衣贴图
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 6, 14), jerseyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    g.add(body);

    // 短裤：略深，区分躯干与腿
    const shorts = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.26, 0.32, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: p.team === 'A' ? 0xffffff : 0x111418,
        roughness: 0.7,
      }),
    );
    shorts.position.y = 0.36;
    shorts.castShadow = true;
    g.add(shorts);

    // 头
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), headMat);
    head.position.y = 1.74;
    head.castShadow = true;
    g.add(head);

    // 护腕（前臂）
    const wristMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.5, emissive: new THREE.Color(color).multiplyScalar(0.25),
    });
    const wristL = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.10, 12), wristMat);
    wristL.position.set(0, 1.18, 0.32);
    g.add(wristL);

    // 手臂（指向身前）
    const arms = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), armMat);
    arms.name = 'arms';
    arms.rotation.x = Math.PI / 2.2;
    arms.position.set(0, 1.32, 0.16);
    arms.castShadow = true;
    g.add(arms);

    // 鞋：两个胶囊，黑底白边
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.4, metalness: 0.05 });
    const shoeL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, 8), shoeMat);
    shoeL.rotation.z = Math.PI / 2;
    shoeL.position.set(-0.12, 0.05, 0.08);
    g.add(shoeL);
    const shoeR = shoeL.clone();
    shoeR.position.x = 0.12;
    g.add(shoeR);

    // 发光脚环（跑动时更醒目）
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 28),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    g.add(ring);

    // 头顶：持有者头顶发光标记
    if (p.isHuman) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x2fd6a0 }),
      );
      halo.position.y = 2.06;
      g.add(halo);
    }

    this.scene.add(g);
    this.playerMeshes.set(p.id, g);
    return g;
  }

  syncWorld(world: World | null, dt: number) {
    if (!world) return;
    // 先隐藏全部，只显示当前比赛的球员（切换模式后避免残留）
    for (const m of this.playerMeshes.values()) m.visible = false;
    for (const p of world.players) {
      const g = this.ensurePlayerMesh(p);
      g.visible = true;
      g.position.set(p.pos.x, p.pos.y, p.pos.z);
      g.rotation.y = p.facing;

      // 轻微跑动起伏
      if (p.anim === 'run' || p.anim === 'dribble') {
        g.position.y += Math.abs(Math.sin(performance.now() / 90)) * 0.05;
      }
      // 2K 风格：急停跳投 — 球员在空中时整体略向前倾
      if (p.pos.y > 0.05 && p.charging) {
        g.rotation.x = -0.2;
      } else {
        g.rotation.x = 0;
      }
      // 蓄力时手臂抬起示意：按 name 找子节点（避免索引随 mesh 顺序改变）
      const arms = g.getObjectByName('arms') as THREE.Mesh | null;
      if (arms) arms.rotation.x = p.charging ? Math.PI / 4 : Math.PI / 2.2;
    }

    this.ballMesh.position.copy(world.ball.pos);
    const v = world.ball.vel;
    const sh = Math.hypot(v.x, v.z);
    if (sh > 0.15) {
      this.ballAxis.set(v.z, 0, -v.x).normalize();
      this.ballMesh.rotateOnWorldAxis(this.ballAxis, (sh * dt) / BALL.radius);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}