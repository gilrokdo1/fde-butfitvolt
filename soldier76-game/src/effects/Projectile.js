import * as THREE from 'three';
import { disposeObject } from '../utils/math.js';

/**
 * 일반 투사체(총알/적 탄환/로켓 공통) — 위치·방향·수명 관리.
 * update(dt) → true면 아직 살아있음, false면 외부에서 제거.
 */
export class Projectile {
  constructor(scene, { mesh, origin, direction, speed, life, damage = 0, owner = 'player', trail = null }) {
    this.scene = scene;
    this.mesh = mesh;
    this.trail = trail;
    this.direction = direction.clone().normalize();
    this.speed = speed;
    this.life = life;
    this.damage = damage;
    this.owner = owner;

    this.mesh.position.copy(origin);
    if (this.trail) this.trail.position.copy(origin);
    scene.add(this.mesh);
    if (this.trail) scene.add(this.trail);
  }

  update(dt) {
    const step = this.direction.clone().multiplyScalar(this.speed * dt);
    this.mesh.position.add(step);
    if (this.trail) this.trail.position.copy(this.mesh.position);
    this.life -= dt;
    return this.life > 0;
  }

  destroy() {
    disposeObject(this.mesh);
    if (this.trail) disposeObject(this.trail);
  }

  get position() {
    return this.mesh.position;
  }
}

/** 플레이어 펄스 라이플 총알 */
export function createPlayerBullet(scene, origin, direction, config) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff8800 }),
  );

  const trail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 2, 6),
    new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.6 }),
  );
  trail.lookAt(direction);
  trail.rotateX(Math.PI / 2);

  return new Projectile(scene, {
    mesh,
    origin: origin.clone().add(direction.clone().multiplyScalar(1.5)),
    direction,
    speed: config.BULLET_SPEED,
    life: config.BULLET_LIFE,
    damage: config.DAMAGE,
    owner: 'player',
    trail,
  });
}

/** 적 탄환 */
export function createEnemyBullet(scene, origin, direction, config) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  );
  return new Projectile(scene, {
    mesh,
    origin,
    direction,
    speed: config.BULLET_SPEED,
    life: config.BULLET_LIFE,
    damage: config.BULLET_DAMAGE,
    owner: 'enemy',
  });
}

/** 헬릭스 로켓 */
export function createRocket(scene, origin, direction, config) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8),
    new THREE.MeshStandardMaterial({
      color: 0x444444,
      emissive: 0xff4400,
      emissiveIntensity: 0.5,
    }),
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);

  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8800 }),
  );
  fire.position.z = 0.3;
  group.add(fire);

  const light = new THREE.PointLight(0xff6600, 3, 10);
  group.add(light);

  const spawnPos = origin.clone().add(direction.clone().multiplyScalar(1.5));
  group.position.copy(spawnPos);
  group.lookAt(spawnPos.clone().add(direction));

  return new Projectile(scene, {
    mesh: group,
    origin: spawnPos,
    direction,
    speed: config.SPEED,
    life: config.LIFE,
    damage: 0, // 폭발로 처리
    owner: 'player-rocket',
  });
}
