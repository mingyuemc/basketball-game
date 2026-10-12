import * as THREE from 'three';
import { BALL, COURT } from '../core/constants';
import type { World } from '../game/world';
import type { Player } from '../game/entities';

const TEAM_COLOR: Record<string, number> = { A: 0x2fd6a0, B: 0xff6b6b };

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

    const color = TEAM_COLOR[p.team];
    const bodyMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.7, metalness: 0.05,
      emissive: p.isHuman ? new THREE.Color(color).multiplyScalar(0.18) : new THREE.Color(0x000000),
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8a07a, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 6, 14), bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    g.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), skinMat);
    head.position.y = 1.72;
    head.castShadow = true;
    g.add(head);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.72, 0.2);
    g.add(nose);

    // 手臂（简单示意，指向身前）
    const arms = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), bodyMat);
    arms.rotation.x = Math.PI / 2.2;
    arms.position.set(0, 1.28, 0.16);
    arms.castShadow = true;
    g.add(arms);

    if (p.isHuman) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.48, 24),
        new THREE.MeshBasicMaterial({ color: 0x2fd6a0, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      g.add(ring);
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
      // 蓄力时手臂抬起示意
      const arms = g.children[3] as THREE.Mesh;
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