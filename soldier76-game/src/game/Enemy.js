import * as THREE from 'three';
import { COLORS, ENEMY } from '../utils/constants.js';
import { disposeObject } from '../utils/math.js';
import { createEnemyBullet } from '../effects/Projectile.js';

/**
 * 적 한 개체 — 몸 렌더링, 이동/AI, 사격 판정.
 * EnemyManager가 다수 인스턴스를 관리.
 */
export class Enemy {
  constructor(scene, { x, z, wave }) {
    this.scene = scene;
    this.health = ENEMY.BASE_HEALTH + wave * ENEMY.HEALTH_PER_WAVE;
    this.speed = ENEMY.BASE_SPEED + wave * ENEMY.SPEED_PER_WAVE;
    this.attackCooldown = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.alive = true;

    this.mesh = this._buildBody();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }

  _buildBody() {
    const body = new THREE.Group();

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.1, 0.4),
      new THREE.MeshStandardMaterial({ color: COLORS.ENEMY_TORSO, roughness: 0.7 }),
    );
    torso.position.y = 1.3;
    torso.castShadow = true;
    body.add(torso);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshStandardMaterial({ color: COLORS.ENEMY_HEAD, roughness: 0.8 }),
    );
    head.position.y = 2.1;
    head.castShadow = true;
    body.add(head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.1, 0.05),
      new THREE.MeshStandardMaterial({
        color: COLORS.ENEMY_VISOR,
        emissive: COLORS.ENEMY_VISOR,
        emissiveIntensity: 1.2,
      }),
    );
    visor.position.set(0, 2.15, 0.2);
    body.add(visor);

    const armL = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.9, 0.2),
      new THREE.MeshStandardMaterial({ color: COLORS.ENEMY_ARM }),
    );
    armL.position.set(-0.45, 1.3, 0);
    body.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.45;
    body.add(armR);

    const legL = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.8, 0.25),
      new THREE.MeshStandardMaterial({ color: COLORS.ENEMY_LEG }),
    );
    legL.position.set(-0.18, 0.4, 0);
    body.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.18;
    body.add(legR);

    this.legL = legL;
    this.legR = legR;
    return body;
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0 && this.alive) {
      this.alive = false;
    }
  }

  destroy() {
    disposeObject(this.mesh);
  }

  /**
   * AI 업데이트.
   * @returns 새로 만든 enemy bullet 또는 null
   */
  update(dt, playerPosition, map) {
    // 플레이어 바라보기 (xz 평면 기준)
    this.mesh.lookAt(playerPosition.x, this.mesh.position.y, playerPosition.z);

    const toPlayer = new THREE.Vector3().subVectors(playerPosition, this.mesh.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    toPlayer.normalize();

    // 거리 유지: 멀면 접근, 가까우면 후퇴
    let moveDir = null;
    if (dist > ENEMY.CHASE_RANGE) {
      moveDir = toPlayer.clone().multiplyScalar(this.speed * dt);
    } else if (dist < ENEMY.CLOSE_RANGE) {
      moveDir = toPlayer.clone().multiplyScalar(-this.speed * dt * 0.5);
    }

    if (moveDir) {
      const newPos = this.mesh.position.clone().add(moveDir);
      if (!map.collides(newPos, 0.4)) {
        this.mesh.position.copy(newPos);
      }
    }

    // 걷기 애니메이션
    if (moveDir) {
      this.walkPhase += dt * 8;
      this.legL.rotation.x = Math.sin(this.walkPhase) * 0.5;
      this.legR.rotation.x = -Math.sin(this.walkPhase) * 0.5;
    }

    // 사격
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0 && dist < ENEMY.ATTACK_RANGE) {
      this.attackCooldown = ENEMY.ATTACK_COOLDOWN_MIN + Math.random() * ENEMY.ATTACK_COOLDOWN_JITTER;
      return this._shoot(playerPosition);
    }
    return null;
  }

  _shoot(playerPosition) {
    const origin = this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    const dir = new THREE.Vector3().subVectors(playerPosition, origin).normalize();
    return createEnemyBullet(this.scene, origin, dir, ENEMY);
  }
}
