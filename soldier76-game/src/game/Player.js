import * as THREE from 'three';
import { CAMERA, PLAYER } from '../utils/constants.js';
import { clamp } from '../utils/math.js';

/**
 * 1인칭 플레이어 — 카메라, 입력, 이동, 점프, 체력 관리.
 * Game에서 update(dt, map)를 호출하면 내부 상태와 카메라를 갱신한다.
 */
export class Player {
  constructor(camera, events) {
    this.camera = camera;
    this.events = events;

    this.health = PLAYER.MAX_HEALTH;
    this.maxHealth = PLAYER.MAX_HEALTH;

    this.yaw = 0;
    this.pitch = 0;

    this.velocity = new THREE.Vector3();
    this.onGround = true;
    this.sprintRemaining = 0;

    this.keys = {};
    this.mouseDown = false;

    // 카메라 초기 위치
    this.camera.position.set(0, PLAYER.HEIGHT, 0);
    this.camera.rotation.order = 'YXZ';

    // 손 — 카메라에 붙여서 FPS 뷰모델 흉내
    this.viewmodel = new THREE.Group();
    this.camera.add(this.viewmodel);
    this._buildViewmodel();

    this._headBobTime = 0;
  }

  _buildViewmodel() {
    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.3 }),
    );
    gunBody.position.set(0.3, -0.25, -0.5);
    this.viewmodel.add(gunBody);

    const gunBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.9 }),
    );
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0.3, -0.22, -0.85);
    this.viewmodel.add(gunBarrel);

    const gunScope = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.5 }),
    );
    gunScope.position.set(0.3, -0.15, -0.4);
    this.viewmodel.add(gunScope);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 }),
    );
    this.muzzleFlash.position.set(0.3, -0.22, -1.05);
    this.viewmodel.add(this.muzzleFlash);
  }

  bindInput(renderer) {
    this._keyDown = (e) => {
      this.keys[e.code] = true;
      this.events.emit('key', e.code);
    };
    this._keyUp = (e) => {
      this.keys[e.code] = false;
    };
    this._mouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
    };
    this._mouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    this._mouseMove = (e) => {
      if (document.pointerLockElement === renderer.domElement) {
        this.yaw -= e.movementX * CAMERA.MOUSE_SENSITIVITY;
        this.pitch -= e.movementY * CAMERA.MOUSE_SENSITIVITY;
        this.pitch = clamp(this.pitch, -CAMERA.PITCH_LIMIT, CAMERA.PITCH_LIMIT);
      }
    };

    document.addEventListener('keydown', this._keyDown);
    document.addEventListener('keyup', this._keyUp);
    document.addEventListener('mousedown', this._mouseDown);
    document.addEventListener('mouseup', this._mouseUp);
    document.addEventListener('mousemove', this._mouseMove);
  }

  dispose() {
    document.removeEventListener('keydown', this._keyDown);
    document.removeEventListener('keyup', this._keyUp);
    document.removeEventListener('mousedown', this._mouseDown);
    document.removeEventListener('mouseup', this._mouseUp);
    document.removeEventListener('mousemove', this._mouseMove);
  }

  get position() {
    return this.camera.position;
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  get isSprinting() {
    return this.sprintRemaining > 0;
  }

  activateSprint(duration) {
    this.sprintRemaining = duration;
  }

  jump() {
    if (this.onGround) {
      this.velocity.y = PLAYER.JUMP_VELOCITY;
      this.onGround = false;
    }
  }

  flashMuzzle(ms = 50) {
    this.muzzleFlash.material.opacity = 1;
    setTimeout(() => {
      this.muzzleFlash.material.opacity = 0;
    }, ms);
  }

  kickback(ms = 60) {
    this.viewmodel.position.z = 0.08;
    this.viewmodel.rotation.x = 0.08;
    setTimeout(() => {
      this.viewmodel.position.z = 0;
      this.viewmodel.rotation.x = 0;
    }, ms);
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.events.emit('player:damaged', { health: this.health, amount });
    if (this.health <= 0) this.events.emit('player:died');
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.events.emit('player:healed', { health: this.health, amount });
  }

  update(dt, map) {
    // 카메라 회전 적용
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // 이동
    const speed = this.isSprinting ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED;
    const move = new THREE.Vector3();
    if (this.keys['KeyW']) move.add(this.forward);
    if (this.keys['KeyS']) move.sub(this.forward);
    if (this.keys['KeyD']) move.add(this.right);
    if (this.keys['KeyA']) move.sub(this.right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);

    // 중력 / 점프
    this.velocity.y -= PLAYER.GRAVITY * dt;
    const desired = this.camera.position.clone().add(move);
    desired.y += this.velocity.y * dt;

    // 바닥 체크
    const groundY = PLAYER.HEIGHT;
    if (desired.y <= groundY) {
      desired.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // XZ 평면 충돌 해결 (축별 분리 — 벽 미끄러짐)
    const resolved = map.resolveMove(this.camera.position, desired, PLAYER.RADIUS);
    resolved.y = desired.y;
    this.camera.position.copy(resolved);

    // 헤드밥 + 뷰모델 흔들림 (땅에 있을 때만)
    if (this.onGround) {
      if (move.lengthSq() > 0) {
        this._headBobTime += dt * (this.isSprinting ? 14 : 10);
        this.camera.position.y += Math.sin(this._headBobTime) * 0.04;
        this.viewmodel.position.x = Math.sin(this._headBobTime) * 0.01;
        this.viewmodel.position.y = Math.abs(Math.sin(this._headBobTime)) * 0.008;
      } else {
        this._headBobTime += dt * 2;
        this.camera.position.y += Math.sin(this._headBobTime) * 0.01;
      }
    }

    // 스프린트 타이머
    if (this.sprintRemaining > 0) {
      this.sprintRemaining = Math.max(0, this.sprintRemaining - dt);
    }
  }
}
