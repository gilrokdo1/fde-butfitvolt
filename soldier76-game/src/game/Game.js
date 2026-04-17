import * as THREE from 'three';
import { CAMERA, ENEMY, MAP, PLAYER, SCORE, WEAPON } from '../utils/constants.js';
import { EventBus } from '../utils/events.js';
import { disposeObject, xzDistance } from '../utils/math.js';
import { GameMap } from '../world/Map.js';
import { Player } from './Player.js';
import { PulseRifle } from './Weapon.js';
import { AbilityManager } from './Abilities.js';
import { EnemyManager } from './EnemyManager.js';
import { SoundManager } from '../audio/SoundManager.js';
import { Explosion } from '../effects/Explosion.js';

/**
 * 게임 루프·상태·서브시스템 허브.
 * start() 호출 전까지는 렌더/업데이트 안 함.
 */
export class Game {
  constructor({ container, hudRoot }) {
    this.container = container;
    this.hudRoot = hudRoot;
    this.events = new EventBus();
    this.audio = new SoundManager();

    this.started = false;
    this.gameOver = false;
    this.paused = false;

    this.score = 0;
    this.kills = 0;

    this._initRenderer();
    this._initScene();
    this.map = new GameMap(this.scene);
    this.player = new Player(this.camera, this.events);
    this.weapon = new PulseRifle(this.scene, this.player, this.events, this.audio);
    this.abilities = new AbilityManager(this.scene, this.player, this.events, this.audio);
    this.enemies = new EnemyManager(this.scene, this.map, this.events);

    this.bullets = []; // 플레이어 총알
    this.enemyBullets = [];
    this.rockets = [];
    this.explosions = [];

    this._bindInternalEvents();
    this._bindResize();
    this._bindPointerLock();
    this._clock = new THREE.Clock();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(MAP.BACKGROUND_COLOR);
    this.scene.fog = new THREE.Fog(MAP.BACKGROUND_COLOR, MAP.FOG_NEAR, MAP.FOG_FAR);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      innerWidth / innerHeight,
      CAMERA.NEAR,
      CAMERA.FAR,
    );
    // 카메라를 씬에 추가해야 viewmodel(자식)이 렌더됨
    this.scene.add(this.camera);
  }

  _bindInternalEvents() {
    this.events.on('key', (code) => {
      if (!this.started || this.gameOver || this.paused) return;
      if (code === 'KeyR') this.weapon.reload();
      if (code === 'KeyE') {
        const r = this.abilities.tryRocket();
        if (r) this.rockets.push(r);
      }
      if (code === 'KeyQ') this.abilities.tryHeal();
      if (code === 'ShiftLeft' || code === 'ShiftRight') this.abilities.trySprint();
      if (code === 'Space') this.player.jump();
    });

    this.events.on('player:died', () => this._handleGameOver());

    this.events.on('enemy:killed', () => {
      this.kills += 1;
      this.score += SCORE.PER_KILL;
      this._emitStats();
      this.events.emit('killfeed:add', { text: 'SOLDIER: 76 ▸ TARGET' });
    });

    this.events.on('wave:start', ({ wave }) => {
      this._emitStats(wave);
      this.events.emit('killfeed:add', { text: `WAVE ${wave} INCOMING` });
    });

    this.events.on('screen:shake', () => {
      this.renderer.domElement.classList.remove('screen-shake');
      void this.renderer.domElement.offsetWidth;
      this.renderer.domElement.classList.add('screen-shake');
    });
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  _bindPointerLock() {
    this._onLockChange = () => {
      if (!this.started || this.gameOver) return;
      if (document.pointerLockElement === this.renderer.domElement) {
        this.paused = false;
        this.events.emit('pause:resume');
      } else {
        this.paused = true;
        this.events.emit('pause:show');
      }
    };
    this._onLockError = () => {
      console.warn('[Game] pointer lock failed. Click to retry.');
      if (this.started && !this.gameOver) {
        this.paused = true;
        this.events.emit('pause:show');
      }
    };
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);

    this.renderer.domElement.addEventListener('click', () => {
      if (this.started && !this.gameOver && document.pointerLockElement !== this.renderer.domElement) {
        this.requestPointerLock();
      }
    });
  }

  requestPointerLock() {
    const canvas = this.renderer.domElement;
    const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
    if (p?.catch) p.catch(() => canvas.requestPointerLock());
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.audio.ensureReady();
    this.player.bindInput(this.renderer);
    this.requestPointerLock();
    this.enemies.startFirstWave();
    this._clock.start();
    this._animate();
    this._emitStats(1);
  }

  _animate = () => {
    requestAnimationFrame(this._animate);
    if (!this.started || this.gameOver) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.paused) {
      // 포인터 락이 풀렸을 땐 렌더만 계속 (클럭 delta 누적 방지)
      this._clock.getDelta();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const dt = Math.min(this._clock.getDelta(), 0.05);
    const now = performance.now();
    this._update(dt, now);
    this.renderer.render(this.scene, this.camera);
  };

  _update(dt, now) {
    this.player.update(dt, this.map);

    // 자동 연사
    if (this.player.mouseDown) {
      const bullet = this.weapon.shoot(now);
      if (bullet) this.bullets.push(bullet);
    }

    // 투사체
    this._updatePlayerBullets(dt);
    this._updateEnemyBullets(dt);
    this._updateRockets(dt);
    this._updateExplosions(dt);

    // 적
    const newEnemyBullets = this.enemies.update(dt, this.player.position);
    for (const b of newEnemyBullets) {
      this.enemyBullets.push(b);
      this.audio.playEnemyShoot();
    }

    // 쿨다운
    this.abilities.update(dt);
    // HUD는 이벤트 기반이지만 쿨다운 바는 연속이라 직접 갱신 신호
    this.events.emit('cooldowns:update', {
      rocket: this.abilities.cooldowns.rocket,
      heal: this.abilities.cooldowns.heal,
      sprint: this.abilities.cooldowns.sprint,
    });
  }

  _updatePlayerBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const alive = b.update(dt);
      let hit = false;

      for (const e of this.enemies.enemies) {
        if (!e.alive) continue;
        const ePos = e.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        if (b.position.distanceTo(ePos) < ENEMY.HIT_RADIUS) {
          const headY = e.mesh.position.y + 2.1;
          const isHead = Math.abs(b.position.y - headY) < ENEMY.HEAD_HIT_Y_THRESHOLD;
          const dmg = isHead ? b.damage * WEAPON.HEADSHOT_MULTIPLIER : b.damage;
          e.takeDamage(dmg);
          this.events.emit('hit:marker');
          this.audio.playHit();
          hit = true;
          break;
        }
      }

      const out = !alive || hit || this.map.collides(b.position, 0.05) ||
        Math.abs(b.position.x) > MAP.SIZE / 2 || Math.abs(b.position.z) > MAP.SIZE / 2;

      if (out) {
        b.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  _updateEnemyBullets(dt) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      const alive = b.update(dt);
      let hit = false;
      if (xzDistance(b.position, this.player.position) < 0.6 &&
          Math.abs(b.position.y - this.player.position.y) < 1.5) {
        this.player.takeDamage(b.damage);
        this.events.emit('damage:vignette');
        hit = true;
      }
      const out = !alive || hit || this.map.collides(b.position, 0.05);
      if (out) {
        b.destroy();
        this.enemyBullets.splice(i, 1);
      }
    }
  }

  _updateRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const alive = r.update(dt);
      let hit = false;
      for (const e of this.enemies.enemies) {
        const ePos = e.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        if (r.position.distanceTo(ePos) < 1.2) {
          hit = true;
          break;
        }
      }
      const wallHit = this.map.collides(r.position, 0.1);
      const out = !alive || hit || wallHit ||
        Math.abs(r.position.x) > MAP.SIZE / 2 || Math.abs(r.position.z) > MAP.SIZE / 2;
      if (out) {
        this._triggerExplosion(r.position.clone());
        r.destroy();
        this.rockets.splice(i, 1);
      }
    }
  }

  _triggerExplosion(position) {
    const exp = new Explosion(this.scene, {
      position,
      radius: 5,
      damage: 120,
      enemies: this.enemies.enemies,
      obstacles: this.map.obstacles,
      audio: this.audio,
      events: this.events,
    });
    this.explosions.push(exp);
  }

  _updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const alive = this.explosions[i].update(dt);
      if (!alive) {
        this.explosions[i].destroy();
        this.explosions.splice(i, 1);
      }
    }
  }

  _emitStats(wave) {
    this.events.emit('stats:update', {
      score: this.score,
      kills: this.kills,
      wave: wave ?? this.enemies.wave,
    });
  }

  _handleGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    document.exitPointerLock();
    this.player.dispose();
    this.abilities.dispose();
    this.events.emit('game:over', { score: this.score, kills: this.kills, wave: this.enemies.wave });
  }
}
