import * as THREE from 'three';
import { disposeObject, hasLineOfSight } from '../utils/math.js';

/**
 * 폭발 이펙트 + 범위 데미지 (가시선 체크 포함).
 * 생성 후 update(dt)를 호출하다가 false를 반환하면 외부에서 제거.
 */
export class Explosion {
  constructor(scene, { position, radius, damage, enemies, obstacles, audio, events }) {
    this.scene = scene;
    this.position = position.clone();
    this.particles = [];
    this.elapsed = 0;
    this.duration = 0.8;

    // 조명
    this.light = new THREE.PointLight(0xff6600, 8, 15);
    this.light.position.copy(position);
    scene.add(this.light);

    // 파티클
    for (let i = 0; i < 20; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 4, 4),
        new THREE.MeshBasicMaterial({
          color: Math.random() > 0.5 ? 0xff8800 : 0xffcc00,
          transparent: true,
        }),
      );
      p.position.copy(position);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        Math.random() * 10,
        (Math.random() - 0.5) * 20,
      );
      scene.add(p);
      this.particles.push({ mesh: p, vel, life: 0.8 });
    }

    audio?.playExplosion();
    events?.emit('screen:shake');

    // 범위 데미지 — 가시선 체크로 벽 너머 적에게는 데미지 X
    for (const enemy of enemies) {
      const ePos = enemy.mesh.position.clone().add(new THREE.Vector3(0, 1, 0));
      const dist = ePos.distanceTo(position);
      if (dist > radius) continue;
      if (!hasLineOfSight(position, ePos, obstacles)) continue;
      const dmg = damage * (1 - dist / radius);
      enemy.takeDamage(dmg);
    }
  }

  update(dt) {
    this.elapsed += dt;
    this.light.intensity = Math.max(0, 8 * (1 - this.elapsed / 0.5));

    for (const p of this.particles) {
      p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
      p.vel.y -= 10 * dt;
      p.life -= dt;
      p.mesh.material.opacity = Math.max(0, p.life);
    }

    return this.elapsed < this.duration;
  }

  destroy() {
    disposeObject(this.light);
    for (const p of this.particles) disposeObject(p.mesh);
    this.particles.length = 0;
  }
}
