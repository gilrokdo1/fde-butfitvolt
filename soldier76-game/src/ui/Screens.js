/** 시작/게임오버/일시정지 오버레이 관리. */
export class Screens {
  constructor(events) {
    this.events = events;
    this._render();
  }

  _render() {
    this.start = document.createElement('div');
    this.start.id = 'start-screen';
    this.start.innerHTML = `
      <h1>SOLDIER: <span>76</span></h1>
      <div class="subtitle">TACTICAL VISOR ENGAGED</div>
      <div class="controls">
        <h3>CONTROLS</h3>
        <div><span class="key">WASD</span> 이동</div>
        <div><span class="key">MOUSE</span> 시점 조작</div>
        <div><span class="key">LMB</span> 펄스 라이플 발사</div>
        <div><span class="key">E</span> 헬릭스 로켓 (광역)</div>
        <div><span class="key">Q</span> 바이오틱 필드 (체력 회복)</div>
        <div><span class="key">SHIFT</span> 전술 질주</div>
        <div><span class="key">SPACE</span> 점프</div>
        <div><span class="key">R</span> 재장전</div>
      </div>
      <button type="button" data-action="engage">ENGAGE</button>
    `;
    document.body.appendChild(this.start);

    this.pause = document.createElement('div');
    this.pause.id = 'pause-overlay';
    this.pause.innerHTML = `<h2>PAUSED</h2><p>CLICK TO RESUME</p>`;
    document.body.appendChild(this.pause);

    this.gameOver = document.createElement('div');
    this.gameOver.id = 'game-over';
    this.gameOver.style.display = 'none';
    this.gameOver.innerHTML = `
      <h1>ELIMINATED</h1>
      <div class="final-score">SCORE: <span data-hud="final-score">0</span></div>
      <button type="button" data-action="restart">RESTART</button>
    `;
    document.body.appendChild(this.gameOver);

    this.start.querySelector('[data-action="engage"]').addEventListener('click', () => {
      this.events.emit('screen:start');
    });
    this.gameOver.querySelector('[data-action="restart"]').addEventListener('click', () => {
      location.reload();
    });
    this.pause.addEventListener('click', () => {
      this.events.emit('screen:resume');
    });
  }

  hideStart() {
    this.start.style.display = 'none';
  }

  showGameOver(score) {
    this.gameOver.querySelector('[data-hud="final-score"]').textContent = score;
    this.gameOver.style.display = 'flex';
  }

  showPause() {
    this.pause.classList.add('show');
  }
  hidePause() {
    this.pause.classList.remove('show');
  }
}
