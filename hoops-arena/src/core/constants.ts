// 全局常量：物理 / 球场 / 规则 / 投篮（对齐开发文档附录 B）

export const GRAVITY = 9.81;

export const BALL = {
  radius: 0.12,        // m
  mass: 0.62,          // kg（标准篮球）
  restitution: 0.75,   // 地面弹性
  // 空气阻尼设为 0：抛体解算按理想抛物线求出"完美出手速度"，
  // 若加入阻尼会让解算结果系统性偏短（打前框），因此交由地面摩擦负责减速。
  linearDamping: 0,
  angularDamping: 0.3,
};

// 半场：宽 14m (x: -7..7)，深 15m (z: -7.5..7.5)，篮筐位于 +z 端
export const COURT = {
  halfWidth: 7,
  minZ: -7.5,
  maxZ: 7.5,
  hoop: { x: 0, y: 3.05, z: 6.675 },
  rimRadius: 0.25,     // 略放宽，兼顾手感
  rimTube: 0.02,
  backboard: { z: 7.05, halfWidth: 0.9, bottom: 2.9, top: 3.95 },
  threePoint: 6.75,
  keyWidth: 4.9,
  keyDepth: 5.8,       // 从底线起算
};

export const PLAYER = {
  radius: 0.35,
  height: 1.85,
  walkSpeed: 5.5,      // m/s（文档：非冲刺 5.5）
  sprintSpeed: 8.5,    // m/s（文档：冲刺 8.5）
  accel: 10,           // 速度趋近系数
  jumpVel: 4.6,
  jumpGravity: 12,     // 跳跃使用略强重力，手感更"脆"
  pickupDist: 1.15,
  stealRange: 1.5,
  releaseHeight: 2.05,
};

export const RULES = {
  shotClock: 24,
  quarterTime: 180,    // 单节 3 分钟
};

export const SHOOT = {
  baseAngleDeg: 52,      // 远距离出手角
  closeAngleDeg: 74,     // 近距离高抛角（否则球到框口近乎水平、穿不进筐）
  closeThreshold: 1.8,   // 距离小于该值用高抛角
  farAngleDist: 4.5,     // 距离大于该值用基础角，中间线性插值
  perfectBase: 0.35,
  perfectRange: 0.4,
  powerMaxTime: 1.1,   // 蓄力满所需秒数
  // 蓄力误差 → 出手速度误差的放大系数。取值较小，使"完美点附近"的容错窗口足够可玩
  // （窗口过窄会导致只有几帧的判定，手感极差）。
  speedGain: 0.25,

  // 命中判定容差：球心水平落在 (rimRadius - ballRadius*0.5) 内即算命中（街机化宽容度）
  scoreTolerance: 0.5,
};