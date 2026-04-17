import { ENEMY, WAVE, MAP } from '../utils/constants.js';
import { Enemy } from './Enemy.js';
import { randomInRange } from '../utils/math.js';

/**
 * 웨이브 진행과 적 스폰을 관리.
 * 외부에서 alive 적 목록을 enemies 게터로 접근.
 */
export class EnemyManager {
  constructor(scene, map, events) {
    this.scene = scene;
    this.map = map;
    this.events = events;

    this.wave = 1;
    this.inWave = 0;
    this.killedInWave = 0;
    this.enemies = [];
    this._pendingSpawnTimers = [];
  }

  startFirstWave() {
    this.wave = 1;
    this.inWave = WAVE.INITIAL_COUNT;
    this.killedInWave = 0;
    this._spawnBatch(this.inWave);
    this.events.emit('wave:start', { wave: this.wave });
  }

  _nextWave() {
    this.wave += 1;
    this.inWave = WAVE.BASE_COUNT + this.wave * WAVE.COUNT_PER_WAVE;
    this.killedInWave = 0;
    this._spawnBatch(this.inWave);
    this.events.emit('wave:start', { wave: this.wave });
  }

  _spawnBatch(count) {
    for (let i = 0; i < count; i++) {
      const t = setTimeout(() => this._spawnOne(), i * WAVE.SPAWN_INTERVAL_MS);
      this._pendingSpawnTimers.push(t);
    }
  }

  _spawnOne() {
    // 플레이어와 맵 경계를 고려해 스폰 위치 선정 — 충돌/벽 밖 회피
    let x = 0;
    let z = 0;
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = randomInRange(ENEMY.SPAWN_DISTANCE_MIN, ENEMY.SPAWN_DISTANCE_MAX);
      x = Math.cos(angle) * dist;
      z = Math.sin(angle) * dist;
      const test = { x, y: 0.5, z };
      if (
        Math.abs(x) < MAP.BOUNDARY - 2 &&
        Math.abs(z) < MAP.BOUNDARY - 2 &&
        !this.map.collides(test, 0.5)
      ) {
        break;
      }
    }
    const enemy = new Enemy(this.scene, { x, z, wave: this.wave });
    this.enemies.push(enemy);
  }

  update(dt, playerPosition) {
    const newBullets = [];
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        e.destroy();
        this.enemies.splice(i, 1);
        this.killedInWave += 1;
        this.events.emit('enemy:killed', { wave: this.wave });
        if (this.killedInWave >= this.inWave && this.enemies.length === 0) {
          setTimeout(() => this._nextWave(), 1500);
        }
        continue;
      }
      const bullet = e.update(dt, playerPosition, this.map);
      if (bullet) newBullets.push(bullet);
    }
    return newBullets;
  }

  dispose() {
    for (const t of this._pendingSpawnTimers) clearTimeout(t);
    for (const e of this.enemies) e.destroy();
    this.enemies.length = 0;
  }
}
