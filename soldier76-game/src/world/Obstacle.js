import * as THREE from 'three';
import { COLORS } from '../utils/constants.js';

/**
 * 맵의 상자형 엄폐물.
 * AABB 정보(min/max)를 미리 계산해두어 충돌 비용 절감.
 */
export class Obstacle {
  constructor(scene, { x, z, width, height, depth, color = COLORS.OBSTACLE }) {
    this.width = width;
    this.height = height;
    this.depth = depth;

    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, height / 2, z);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // 네온 엣지
    const edges = new THREE.EdgesGeometry(geo);
    this.edge = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: COLORS.CYAN }),
    );
    this.edge.position.copy(this.mesh.position);
    scene.add(this.edge);

    this.min = new THREE.Vector3(x - width / 2, 0, z - depth / 2);
    this.max = new THREE.Vector3(x + width / 2, height, z + depth / 2);
  }

  intersects(point, radius = 0) {
    return (
      point.x + radius > this.min.x &&
      point.x - radius < this.max.x &&
      point.z + radius > this.min.z &&
      point.z - radius < this.max.z &&
      point.y < this.max.y
    );
  }
}
