# SOLDIER: 76

오버워치 솔져76 컨셉의 1인칭 FPS 웹 게임. 바닐라 JavaScript + Three.js + Vite.

## 실행

```bash
npm install
npm run dev   # http://localhost:5174
```

## 빌드

```bash
npm run build     # dist/ 생성
npm run preview   # 빌드 결과 미리보기
```

## 조작

| 키 | 동작 |
|----|------|
| WASD | 이동 |
| Mouse | 시점 |
| LMB | 펄스 라이플 사격 |
| E | 헬릭스 로켓 (쿨다운 8초) |
| Q | 바이오틱 필드 (쿨다운 15초) |
| Shift | 전술 질주 (쿨다운 6초) |
| Space | 점프 |
| R | 재장전 |
| ESC | 일시정지 |

## 구조

```
src/
├── main.js                 # 진입점
├── game/                   # 게임 로직 코어
│   ├── Game.js             # 게임 루프, 상태 관리, 이벤트 허브
│   ├── Player.js           # 플레이어 이동/카메라/충돌
│   ├── Weapon.js           # 펄스 라이플
│   ├── Abilities.js        # 헬릭스/바이오틱/스프린트
│   ├── Enemy.js            # 적 한 개체
│   └── EnemyManager.js     # 웨이브 스폰
├── world/
│   ├── Map.js              # 아레나 + 엄폐물
│   └── Obstacle.js         # AABB + 가시선 체크
├── effects/
│   ├── Projectile.js       # 총알/로켓/적 투사체
│   ├── Explosion.js
│   └── ParticleSystem.js
├── audio/
│   └── SoundManager.js     # WebAudio 기반
├── ui/
│   ├── HUD.js              # 체력/탄약/쿨다운/스코어
│   ├── Screens.js          # 시작/게임오버/일시정지
│   └── styles.css
└── utils/
    ├── constants.js        # 모든 튜닝값 한곳에
    ├── math.js
    └── events.js           # 간단한 EventEmitter
```
