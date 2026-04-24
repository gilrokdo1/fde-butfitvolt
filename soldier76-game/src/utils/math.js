import * as THREE from 'three';

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Three.js 객체 회수 — geometry / material 전부 dispose */
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) m.dispose();
    }
  });
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) m.dispose();
  }
  obj.parent?.remove(obj);
}

/** 두 Vector3 간 xz 평면 거리 */
export function xzDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

/** 벽 너머 적이 맞지 않도록 하는 가시선 체크 — Obstacle 배열에 대해 raycast */
export function hasLineOfSight(from, to, obstacles) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const maxDist = dir.length();
  if (maxDist === 0) return true;
  dir.normalize();
  const ray = new THREE.Raycaster(from, dir, 0, maxDist);
  const meshes = obstacles.map((o) => o.mesh).filter(Boolean);
  return ray.intersectObjects(meshes, false).length === 0;
}
