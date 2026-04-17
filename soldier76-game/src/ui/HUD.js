import { ABILITIES, PLAYER, WEAPON } from '../utils/constants.js';

/** HUD DOM 조작 — 체력/탄약/쿨다운/스코어/킬피드/히트마커 */
export class HUD {
  constructor(container, events) {
    this.root = container;
    this.events = events;
    this._render();
    this._bindEvents();
  }

  _render() {
    this.root.innerHTML = `
      <div id="crosshair"><div class="dot"></div></div>
      <div id="hitmarker"></div>
      <div id="damage-vignette"></div>

      <div id="top-hud">
        <div class="stat"><div class="stat-label">SCORE</div><div class="stat-value" data-hud="score">0</div></div>
        <div class="stat"><div class="stat-label">KILLS</div><div class="stat-value" data-hud="kills">0</div></div>
        <div class="stat"><div class="stat-label">WAVE</div><div class="stat-value" data-hud="wave">1</div></div>
      </div>

      <div id="killfeed"></div>

      <div class="hud-bar">
        <div class="hud-block" style="min-width:240px;">
          <div class="hud-label">TACTICAL VISOR</div>
          <div class="hud-value" data-hud="health">${PLAYER.MAX_HEALTH}</div>
          <div id="health-bar"><div id="health-fill" style="width:100%;"></div></div>
        </div>

        <div id="abilities">
          <div class="ability ready" data-ability="rocket">
            <div class="ability-key">E</div>
            <div class="ability-icon">🚀</div>
            <div class="ability-name">HELIX</div>
            <div class="ability-cooldown" style="height:0;"></div>
          </div>
          <div class="ability ready" data-ability="heal">
            <div class="ability-key">Q</div>
            <div class="ability-icon">✚</div>
            <div class="ability-name">BIOTIC</div>
            <div class="ability-cooldown" style="height:0;"></div>
          </div>
          <div class="ability ready" data-ability="sprint">
            <div class="ability-key">⇧</div>
            <div class="ability-icon">💨</div>
            <div class="ability-name">SPRINT</div>
            <div class="ability-cooldown" style="height:0;"></div>
          </div>
        </div>

        <div class="hud-block" style="text-align:right;">
          <div class="hud-label">PULSE RIFLE</div>
          <div class="hud-value"><span data-hud="ammo">${WEAPON.MAX_AMMO}</span><span class="hud-sub"> / ${WEAPON.MAX_AMMO}</span></div>
          <div class="hud-sub" data-hud="reloading" style="color:#ff2a2a; display:none;">RELOADING...</div>
        </div>
      </div>
    `;

    this._el = {
      score: this.root.querySelector('[data-hud="score"]'),
      kills: this.root.querySelector('[data-hud="kills"]'),
      wave: this.root.querySelector('[data-hud="wave"]'),
      health: this.root.querySelector('[data-hud="health"]'),
      healthFill: this.root.querySelector('#health-fill'),
      ammo: this.root.querySelector('[data-hud="ammo"]'),
      reloading: this.root.querySelector('[data-hud="reloading"]'),
      killfeed: this.root.querySelector('#killfeed'),
      hitmarker: this.root.querySelector('#hitmarker'),
      vignette: this.root.querySelector('#damage-vignette'),
      ab: {
        rocket: this.root.querySelector('[data-ability="rocket"]'),
        heal: this.root.querySelector('[data-ability="heal"]'),
        sprint: this.root.querySelector('[data-ability="sprint"]'),
      },
    };
  }

  _bindEvents() {
    this.events.on('stats:update', (s) => {
      this._el.score.textContent = s.score;
      this._el.kills.textContent = s.kills;
      this._el.wave.textContent = s.wave;
    });
    this.events.on('player:damaged', ({ health }) => this._updateHealth(health));
    this.events.on('player:healed', ({ health }) => this._updateHealth(health));
    this.events.on('weapon:shot', ({ ammo }) => { this._el.ammo.textContent = ammo; });
    this.events.on('weapon:reload-start', () => { this._el.reloading.style.display = 'block'; });
    this.events.on('weapon:reload-end', ({ ammo }) => {
      this._el.reloading.style.display = 'none';
      this._el.ammo.textContent = ammo;
    });
    this.events.on('hit:marker', () => this._flashHitmarker());
    this.events.on('killfeed:add', ({ text }) => this._addKillFeed(text));
    this.events.on('damage:vignette', () => this._flashVignette());
  }

  _updateHealth(hp) {
    this._el.health.textContent = Math.max(0, Math.ceil(hp));
    const pct = Math.max(0, hp) / PLAYER.MAX_HEALTH;
    this._el.healthFill.style.width = `${pct * 100}%`;
    this._el.healthFill.classList.toggle('low', pct < 0.4);
  }

  updateCooldowns({ rocket, heal, sprint }) {
    this._renderCooldown(this._el.ab.rocket, rocket, ABILITIES.ROCKET.COOLDOWN);
    this._renderCooldown(this._el.ab.heal, heal, ABILITIES.HEAL.COOLDOWN);
    this._renderCooldown(this._el.ab.sprint, sprint, ABILITIES.SPRINT.COOLDOWN);
  }

  _renderCooldown(el, remaining, max) {
    const co = el.querySelector('.ability-cooldown');
    if (remaining > 0) {
      el.classList.remove('ready');
      co.style.height = `${(remaining / max) * 100}%`;
    } else {
      el.classList.add('ready');
      co.style.height = '0';
    }
  }

  _flashHitmarker() {
    this._el.hitmarker.classList.remove('active');
    void this._el.hitmarker.offsetWidth;
    this._el.hitmarker.classList.add('active');
  }

  _flashVignette() {
    this._el.vignette.style.boxShadow = 'inset 0 0 200px rgba(255, 0, 0, 0.6)';
    setTimeout(() => {
      this._el.vignette.style.boxShadow = 'inset 0 0 200px rgba(255, 0, 0, 0)';
    }, PLAYER.DAMAGE_VIGNETTE_MS);
  }

  _addKillFeed(text) {
    const msg = document.createElement('div');
    msg.className = 'kill-msg';
    msg.textContent = text;
    this._el.killfeed.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  }
}
