import { Game } from './game/Game.js';
import { HUD } from './ui/HUD.js';
import { Screens } from './ui/Screens.js';

const app = document.getElementById('app');

// 게임 캔버스 컨테이너
const canvasWrap = document.createElement('div');
canvasWrap.id = 'canvas-wrap';
canvasWrap.style.position = 'fixed';
canvasWrap.style.inset = '0';
app.appendChild(canvasWrap);

// HUD 컨테이너
const hudRoot = document.createElement('div');
hudRoot.id = 'ui';
hudRoot.style.display = 'none';
app.appendChild(hudRoot);

const game = new Game({ container: canvasWrap, hudRoot });
const hud = new HUD(hudRoot, game.events);
const screens = new Screens(game.events);

// 쿨다운은 연속 신호라 HUD에서 받아 처리
game.events.on('cooldowns:update', (cd) => hud.updateCooldowns(cd));

// 스크린 이벤트 → 게임 상태 전환
game.events.on('screen:start', () => {
  screens.hideStart();
  hudRoot.style.display = 'block';
  game.start();
});

game.events.on('pause:show', () => screens.showPause());
game.events.on('pause:resume', () => screens.hidePause());
game.events.on('screen:resume', () => {
  if (!game.gameOver) game.requestPointerLock();
});

game.events.on('game:over', ({ score }) => {
  hudRoot.style.display = 'none';
  screens.showGameOver(score);
});
