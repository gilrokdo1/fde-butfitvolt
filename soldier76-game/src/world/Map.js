import * as THREE from 'three';
import { COLORS, MAP } from '../utils/constants.js';
import { Obstacle } from './Obstacle.js';

/** 아레나, 조명, 엄폐물 생성 관리. */
export class GameMap {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];

    this._createGround();
    this._createLights();
    this._createObstacles();
    this._createBoundary();
  }

  _createGround() {
    const geo = new THREE.PlaneGeometry(MAP.SIZE, MAP.SIZE, 50, 50);
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.GROUND, roughness: 0.9 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(MAP.SIZE, 40, COLORS.CYAN, 0x004050);
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  _createLights() {
    const ambient = new THREE.AmbientLight(0x4466aa, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeecc, 0.9);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);

    // 네온 포인트 라이트 (시안 / 레드)
    const neon1 = new THREE.PointLight(COLORS.CYAN, 2, 30);
    neon1.position.set(20, 5, 20);
    this.scene.add(neon1);
    const neon2 = new THREE.PointLight(COLORS.RED, 2, 30);
    neon2.position.set(-20, 5, -20);
    this.scene.add(neon2);
  }

  _createObstacles() {
    const specs = [
      // 4개 코너 건물
      { x: 15, z: 15, width: 6, height: 4, depth: 6 },
      { x: -15, z: 15, width: 6, height: 5, depth: 6 },
      { x: 15, z: -15, width: 6, height: 4, depth: 6 },
      { x: -15, z: -15, width: 6, height: 5, depth: 6 },
      // 남북 벽
      { x: 0, z: 25, width: 10, height: 3, depth: 2, color: COLORS.OBSTACLE_ALT },
      { x: 0, z: -25, width: 10, height: 3, depth: 2, color: COLORS.OBSTACLE_ALT },
      // 동서 벽
      { x: 25, z: 0, width: 2, height: 3, depth: 10, color: COLORS.OBSTACLE_ALT },
      { x: -25, z: 0, width: 2, height: 3, depth: 10, color: COLORS.OBSTACLE_ALT },
      // 중앙 엄폐
      { x: 8, z: 0, width: 2, height: 2, depth: 2, color: COLORS.OBSTACLE_SMALL },
      { x: -8, z: 0, width: 2, height: 2, depth: 2, color: COLORS.OBSTACLE_SMALL },
      { x: 0, z: 8, width: 2, height: 2, depth: 2, color: COLORS.OBSTACLE_SMALL },
      { x: 0, z: -8, width: 2, height: 2, depth: 2, color: COLORS.OBSTACLE_SMALL },
      // 외곽 건물
      { x: 35, z: 35, width: 4, height: 6, depth: 4 },
      { x: -35, z: 35, width: 4, height: 6, depth: 4 },
      { x: 35, z: -35, width: 4, height: 6, depth: 4 },
      { x: -35, z: -35, width: 4, height: 6, depth: 4 },
    ];

    for (const spec of specs) {
      this.obstacles.push(new Obstacle(this.scene, spec));
    }
  }

  _createBoundary() {
    const walls = [
      { x: 0, z: 60, width: 120, height: 6, depth: 2, color: COLORS.BOUNDARY },
      { x: 0, z: -60, width: 120, height: 6, depth: 2, color: COLORS.BOUNDARY },
      { x: 60, z: 0, width: 2, height: 6, depth: 120, color: COLORS.BOUNDARY },
      { x: -60, z: 0, width: 2, height: 6, depth: 120, color: COLORS.BOUNDARY },
    ];
    for (const spec of walls) {
      this.obstacles.push(new Obstacle(this.scene, spec));
    }
  }

  /** 해당 지점에서 radius 만큼 반경 내 엄폐물이 있는지 */
  collides(point, radius = 0) {
    for (const o of this.obstacles) {
      if (o.intersects(point, radius)) return true;
    }
    return false;
  }

  /** 플레이어가 지형/경계를 벗어나지 않도록 축별 투영 이동 처리 (벽 미끄러짐) */
  resolveMove(current, desired, radius) {
    const resolved = current.clone();

    // X 축
    const tryX = resolved.clone();
    tryX.x = desired.x;
    if (!this.collides(tryX, radius) && Math.abs(tryX.x) <= MAP.BOUNDARY) {
      resolved.x = desired.x;
    }

    // Z 축
    const tryZ = resolved.clone();
    tryZ.z = desired.z;
    if (!this.collides(tryZ, radius) && Math.abs(tryZ.z) <= MAP.BOUNDARY) {
      resolved.z = desired.z;
    }

    return resolved;
  }
}
