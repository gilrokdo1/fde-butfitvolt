import * as THREE from 'three';
import { ABILITIES } from '../utils/constants.js';
import { createRocket } from '../effects/Projectile.js';
import { disposeObject } from '../utils/math.js';

/**
 * 솔져76의 스킬 3종 관리자.
 * 쿨다운, 지속효과, 시각/오디오 이펙트를 모아둠.
 */
export class AbilityManager {
  constructor(scene, player, events, audio) {
    this.scene = scene;
    this.player = player;
    this.events = events;
    this.audio = audio;

    this.cooldowns = { rocket: 0, heal: 0, sprint: 0 };
    this._healTimer = null;
    this._healField = null;
    this._healLight = null;
  }

  get rocketCooldown() { return this.cooldowns.rocket; }
  get healCooldown() { return this.cooldowns.heal; }
  get sprintCooldown() { return this.cooldowns.sprint; }

  update(dt) {
    for (const key of Object.keys(this.cooldowns)) {
      if (this.cooldowns[key] > 0) {
        this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
      }
    }
  }

  /** 헬릭스 로켓 — 투사체 생성, 폭발은 Game에서 처리 */
  tryRocket() {
    if (this.cooldowns.rocket > 0) return null;
    this.cooldowns.rocket = ABILITIES.ROCKET.COOLDOWN;

    const dir = new THREE.Vector3();
    this.player.camera.getWorldDirection(dir);
    const rocket = createRocket(this.scene, this.player.position, dir, ABILITIES.ROCKET);
    this.audio?.playRocket();
    this.events.emit('ability:rocket');
    return rocket;
  }

  /** 바이오틱 필드 — 5초간 주기적으로 힐 */
  tryHeal() {
    if (this.cooldowns.heal > 0) return false;
    this.cooldowns.heal = ABILITIES.HEAL.COOLDOWN;

    const pos = this.player.position.clone();

    // 시각 효과 — 시안 원판 + 포인트 라이트
    const field = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 0.1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.4 }),
    );
    field.position.set(pos.x, 0.05, pos.z);
    this.scene.add(field);

    const light = new THREE.PointLight(0xffcc00, 2, 10);
    light.position.copy(pos);
    this.scene.add(light);

    this._healField = field;
    this._healLight = light;

    let ticks = 0;
    clearInterval(this._healTimer);
    this._healTimer = setInterval(() => {
      this.player.heal(ABILITIES.HEAL.TICK_AMOUNT);
      ticks += 1;
      if (ticks >= ABILITIES.HEAL.TICK_COUNT) {
        clearInterval(this._healTimer);
        this._disposeHealField();
      }
    }, ABILITIES.HEAL.TICK_INTERVAL_MS);

    this.audio?.playHeal();
    this.events.emit('ability:heal');
    return true;
  }

  /** 전술 질주 — 이속 증가 */
  trySprint() {
    if (this.cooldowns.sprint > 0) return false;
    this.cooldowns.sprint = ABILITIES.SPRINT.COOLDOWN;
    this.player.activateSprint(ABILITIES.SPRINT.DURATION);
    this.events.emit('ability:sprint');
    return true;
  }

  _disposeHealField() {
    if (this._healField) {
      disposeObject(this._healField);
      this._healField = null;
    }
    if (this._healLight) {
      disposeObject(this._healLight);
      this._healLight = null;
    }
  }

  dispose() {
    clearInterval(this._healTimer);
    this._disposeHealField();
  }
}
