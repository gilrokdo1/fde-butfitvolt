import * as THREE from 'three';
import { WEAPON } from '../utils/constants.js';
import { createPlayerBullet } from '../effects/Projectile.js';

/** 펄스 라이플 — 탄약·재장전·사격 간격 관리. */
export class PulseRifle {
  constructor(scene, player, events, audio) {
    this.scene = scene;
    this.player = player;
    this.events = events;
    this.audio = audio;

    this.ammo = WEAPON.MAX_AMMO;
    this.maxAmmo = WEAPON.MAX_AMMO;
    this.reloading = false;
    this._lastShotTime = 0;
  }

  canShoot(nowMs) {
    if (this.reloading || this.ammo <= 0) return false;
    return nowMs - this._lastShotTime >= WEAPON.FIRE_INTERVAL_MS;
  }

  shoot(nowMs) {
    if (!this.canShoot(nowMs)) {
      if (this.ammo <= 0 && !this.reloading) this.reload();
      return null;
    }

    this.ammo -= 1;
    this._lastShotTime = nowMs;

    // 뷰모델 이펙트
    this.player.flashMuzzle();
    this.player.kickback();

    // 탄도 계산 (약간의 산포)
    const dir = new THREE.Vector3();
    this.player.camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * WEAPON.SPREAD;
    dir.y += (Math.random() - 0.5) * WEAPON.SPREAD;
    dir.normalize();

    const bullet = createPlayerBullet(this.scene, this.player.position, dir, WEAPON);
    this.audio?.playShoot();
    this.events.emit('weapon:shot', { ammo: this.ammo });

    return bullet;
  }

  reload() {
    if (this.reloading || this.ammo === this.maxAmmo) return;
    this.reloading = true;
    this.events.emit('weapon:reload-start');
    setTimeout(() => {
      this.ammo = this.maxAmmo;
      this.reloading = false;
      this.events.emit('weapon:reload-end', { ammo: this.ammo });
    }, WEAPON.RELOAD_MS);
  }
}
