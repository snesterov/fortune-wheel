/**
 * FORTUNE WHEEL WIDGET (Колесо Фортуны)
 * Standalone embeddable interactive lead-generation widget for websites & Tilda
 * Compatible with Yandex Metrika, Telegram bot & MAX
 */
(function(window, document) {
  'use strict';

  // Default configuration
  const DEFAULT_CONFIG = {
    title: 'Испытай удачу!',
    subtitle: 'Крути колесо и забирай гарантированный подарок от студии',
    buttonText: 'Крутить колесо',
    floatingBtnText: 'Подарок за спин',
    themeColor: '#ff4d6d',
    secondaryColor: '#f72585',
    goldColor: '#fbbf24',
    bgColor: '#0f0c1b',
    sectors: [
      { id: 1, text: 'Скидка 15%', color: '#ff4d6d', winText: 'Скидка 15% на любые услуги', weight: 30, promo: 'SPIN15' },
      { id: 2, text: 'Подарок 1 000 ₽', color: '#1f1b2e', winText: 'Сертификат 1 000 ₽ на услуги', weight: 25, promo: 'GIFT1000' },
      { id: 3, text: 'Скидка 20%', color: '#f72585', winText: 'Скидка 20% на услуги', weight: 15, promo: 'SUPER20' },
      { id: 4, text: 'Бесплатный разбор', color: '#1f1b2e', winText: 'Бесплатная персональная консультация', weight: 15, promo: 'FREEAUDIT' },
      { id: 5, text: 'Скидка 10%', color: '#7209b7', winText: 'Скидка 10% на чек', weight: 10, promo: 'SALE10' },
      { id: 6, text: 'VIP Бонус 2 000 ₽', color: '#3a0ca3', winText: 'VIP Сертификат 2 000 ₽', weight: 5, promo: 'VIP2000' }
    ],
    telegramBot: 'ssp_agency_bot', // имя телеграм бота без @
    maxMessengerLink: '', // ссылка на MAX если используется
    metrikaCounterId: null, // ID Яндекс.Метрики
    metrikaGoal: 'fortune_wheel_lead', // цель в метрике
    webhookUrl: '', // url для отправки лида
    allowMultipleSpins: false // повторный спин
  };

  class FortuneWheelWidget {
    constructor(customConfig = {}) {
      this.config = Object.assign({}, DEFAULT_CONFIG, customConfig);
      this.isSpinning = false;
      this.hasSpun = false;
      this.currentRotation = 0;
      this.wonSector = null;
      this.init();
    }

    init() {
      // Проверка localStorage на уже сыгранный спин
      if (!this.config.allowMultipleSpins) {
        try {
          const savedWon = localStorage.getItem('fw_won_sector');
          if (savedWon) {
            this.hasSpun = true;
            this.wonSector = JSON.parse(savedWon);
          }
        } catch (e) {}
      }

      this.injectStyles();
      this.createFloatingTrigger();
      this.createModal();
      this.setupCanvas();
      this.drawWheel(0);
      this.attachEvents();
    }

    // Аудиокликер на Web Audio API (без внешних mp3)
    playTick() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!this.audioCtx) this.audioCtx = new AudioCtx();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.audioCtx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.045);
      } catch (e) {}
    }

    injectStyles() {
      if (document.getElementById('fw-styles')) return;
      const style = document.createElement('style');
      style.id = 'fw-styles';
      style.innerHTML = `
        /* --- FW WIDGET STYLES --- */
        .fw-floating-btn {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99990;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 22px 12px 16px;
          background: linear-gradient(135deg, #ff4d6d, #f72585 50%, #fbbf24);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 9999px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(247, 37, 133, 0.45), 0 0 15px rgba(251, 191, 36, 0.35);
          animation: fw-pulse 2.2s infinite ease-in-out;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
          user-select: none;
        }
        .fw-floating-btn:hover {
          transform: translateY(-3px) scale(1.04);
          box-shadow: 0 14px 40px rgba(247, 37, 133, 0.65);
        }
        .fw-floating-btn svg {
          width: 26px;
          height: 26px;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        @keyframes fw-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }

        /* Modal Overlay */
        .fw-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(10, 8, 18, 0.85);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
          padding: 16px;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .fw-modal-backdrop.fw-open {
          opacity: 1;
          visibility: visible;
        }
        .fw-modal-card {
          position: relative;
          width: 100%;
          max-width: 860px;
          background: linear-gradient(160deg, #181329 0%, #0e0a1a 100%);
          border: 1px solid rgba(247, 37, 133, 0.35);
          border-radius: 28px;
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.8), 0 0 40px rgba(247, 37, 133, 0.2);
          padding: 36px 32px;
          box-sizing: border-box;
          color: #ffffff;
          overflow: hidden;
        }
        .fw-close-btn {
          position: absolute;
          top: 18px;
          right: 18px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          cursor: pointer;
          transition: background 0.2s, transform 0.2s;
          z-index: 10;
        }
        .fw-close-btn:hover {
          background: rgba(247, 37, 133, 0.3);
          transform: rotate(90deg);
        }

        /* Layout Grid */
        .fw-layout {
          display: grid;
          grid-template-columns: 1.15fr 0.95fr;
          gap: 32px;
          align-items: center;
        }
        @media (max-width: 768px) {
          .fw-layout {
            grid-template-columns: 1fr;
            gap: 20px;
          }
          .fw-modal-card {
            padding: 26px 18px;
            max-height: 94vh;
            overflow-y: auto;
          }
        }

        /* Wheel Area */
        .fw-wheel-container {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 0 auto;
        }
        .fw-wheel-wrapper {
          position: relative;
          width: 360px;
          height: 360px;
          max-width: 100%;
        }
        @media (max-width: 480px) {
          .fw-wheel-wrapper {
            width: 290px;
            height: 290px;
          }
        }
        .fw-wheel-canvas {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          box-shadow: 0 0 35px rgba(247, 37, 133, 0.4), inset 0 0 20px rgba(0,0,0,0.6);
        }
        .fw-pointer {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 12;
          width: 34px;
          height: 42px;
          filter: drop-shadow(0 4px 10px rgba(0,0,0,0.7));
          transition: transform 0.1s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        .fw-wheel-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);
          border: 4px solid #ffffff;
          box-shadow: 0 0 20px rgba(251, 191, 36, 0.8);
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 11px;
          color: #110d1f;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
        }

        /* Right Content Area */
        .fw-info-pane h3 {
          font-size: 26px;
          font-weight: 800;
          margin: 0 0 10px;
          line-height: 1.2;
          background: linear-gradient(135deg, #ffffff 0%, #fbcfe8 50%, #fbbf24 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .fw-info-pane p {
          font-size: 14px;
          line-height: 1.5;
          color: #cbd5e1;
          margin: 0 0 24px;
        }
        .fw-spin-btn {
          width: 100%;
          padding: 16px 24px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #ff4d6d 0%, #f72585 50%, #fbbf24 100%);
          color: #ffffff;
          font-size: 16px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 8px 25px rgba(247, 37, 133, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.6);
          cursor: pointer;
          transition: transform 0.25s, box-shadow 0.25s;
        }
        .fw-spin-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 35px rgba(247, 37, 133, 0.7);
        }
        .fw-spin-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Win Result & Lead Form */
        .fw-result-box {
          display: none;
          animation: fw-fade-up 0.4s ease;
        }
        .fw-result-box.fw-active {
          display: block;
        }
        @keyframes fw-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fw-prize-badge {
          background: rgba(251, 191, 36, 0.15);
          border: 1px solid #fbbf24;
          border-radius: 14px;
          padding: 14px 18px;
          margin-bottom: 20px;
          text-align: center;
        }
        .fw-prize-badge .fw-won-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #fbbf24;
          font-weight: 700;
        }
        .fw-prize-badge .fw-won-title {
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 4px;
        }
        .fw-input-field {
          width: 100%;
          padding: 14px 18px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.06);
          border: 1.5px solid rgba(247, 37, 133, 0.35);
          color: #ffffff;
          font-size: 15px;
          box-sizing: border-box;
          margin-bottom: 12px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .fw-input-field:focus {
          border-color: #fbbf24;
          box-shadow: 0 0 15px rgba(251, 191, 36, 0.3);
        }
        .fw-input-field::placeholder {
          color: #94a3b8;
        }

        /* Success screen with bot link */
        .fw-success-pane {
          display: none;
          text-align: center;
          padding: 10px 0;
        }
        .fw-success-pane.fw-active {
          display: block;
        }
        .fw-promo-tag {
          display: inline-block;
          padding: 8px 18px;
          border-radius: 8px;
          background: #201a35;
          border: 1px dashed #fbbf24;
          color: #fbbf24;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.1em;
          margin: 12px 0 16px;
        }
        .fw-bot-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 14px 20px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #229ed9 0%, #1783b9 100%);
          color: #ffffff;
          text-decoration: none;
          font-size: 15px;
          font-weight: 700;
          margin-top: 10px;
          box-shadow: 0 6px 20px rgba(34, 158, 217, 0.4);
          transition: transform 0.2s;
          box-sizing: border-box;
        }
        .fw-bot-btn:hover {
          transform: translateY(-2px);
        }
        .fw-bot-btn svg {
          width: 20px;
          height: 20px;
          fill: currentColor;
        }
      `;
      document.head.appendChild(style);
    }

    createFloatingTrigger() {
      if (document.getElementById('fw-trigger-btn')) return;
      const btn = document.createElement('div');
      btn.id = 'fw-trigger-btn';
      btn.className = 'fw-floating-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 12 20 22 4 22 4 12"></polyline>
          <rect x="2" y="7" width="20" height="5"></rect>
          <line x1="12" y1="22" x2="12" y2="7"></line>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
        </svg>
        <span>${this.config.floatingBtnText}</span>
      `;
      btn.addEventListener('click', () => this.openModal());
      document.body.appendChild(btn);
    }

    createModal() {
      if (document.getElementById('fw-modal')) return;
      const modal = document.createElement('div');
      modal.id = 'fw-modal';
      modal.className = 'fw-modal-backdrop';
      modal.innerHTML = `
        <div class="fw-modal-card">
          <div class="fw-close-btn" id="fw-close">&times;</div>
          <div class="fw-layout">
            
            <!-- Left: Wheel -->
            <div class="fw-wheel-container">
              <div class="fw-wheel-wrapper">
                <svg class="fw-pointer" viewBox="0 0 34 42" fill="none">
                  <path d="M17 40L4 8C2.5 5 4.5 1 8 1H26C29.5 1 31.5 5 30 8L17 40Z" fill="#FBBF24" stroke="#FFFFFF" stroke-width="2.5"/>
                  <circle cx="17" cy="12" r="4" fill="#110D1F"/>
                </svg>
                <canvas id="fw-canvas" class="fw-wheel-canvas"></canvas>
                <div class="fw-wheel-center" id="fw-center-spin">СПИН</div>
              </div>
            </div>

            <!-- Right: Interactive Panel -->
            <div class="fw-info-pane">
              
              <!-- State 1: Before Spin -->
              <div id="fw-initial-box">
                <h3>${this.config.title}</h3>
                <p>${this.config.subtitle}</p>
                <button class="fw-spin-btn" id="fw-main-spin-btn">${this.config.buttonText}</button>
              </div>

              <!-- State 2: Win Result + Lead Form -->
              <div id="fw-result-box" class="fw-result-box">
                <div class="fw-prize-badge">
                  <div class="fw-won-label">🎉 Ваш выигрыш:</div>
                  <div class="fw-won-title" id="fw-won-title">Скидка 15%</div>
                </div>
                <p style="margin-bottom: 14px;">Введите телефон, чтобы зафиксировать подарок за вашим номером:</p>
                <input type="text" class="fw-input-field" id="fw-name" placeholder="Ваше имя">
                <input type="tel" class="fw-input-field" id="fw-phone" placeholder="+7 (___) ___-__-__">
                <button class="fw-spin-btn" id="fw-claim-btn" style="margin-top: 4px;">Забрать подарок</button>
              </div>

              <!-- State 3: Success Screen with Telegram / MAX Bot -->
              <div id="fw-success-box" class="fw-success-pane">
                <h3 style="font-size: 24px;">Подарок забронирован!</h3>
                <p style="margin-bottom: 8px;">Ваш персональный промокод:</p>
                <div class="fw-promo-tag" id="fw-promo-code">SPIN15</div>
                <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">
                  Активируйте промокод через нашего Telegram-бота прямо сейчас:
                </p>
                <a href="#" target="_blank" class="fw-bot-btn" id="fw-bot-link">
                  <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.37.74-.56 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.23 0 .37z"/></svg>
                  <span>Забрать в Telegram</span>
                </a>
              </div>

            </div>

          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    setupCanvas() {
      this.canvas = document.getElementById('fw-canvas');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      const size = 720; // High-res retina
      this.canvas.width = size;
      this.canvas.height = size;
      this.center = size / 2;
      this.radius = size / 2 - 10;
    }

    drawWheel(angleRad = 0) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const sectors = this.config.sectors;
      const numSectors = sectors.length;
      const arc = (2 * Math.PI) / numSectors;

      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw Outer Rim with metallic studs
      ctx.save();
      ctx.translate(this.center, this.center);
      ctx.rotate(angleRad);

      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();

      // Outer gold glowing border
      ctx.beginPath();
      ctx.arc(0, 0, this.radius - 8, 0, 2 * Math.PI);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Draw Sectors
      for (let i = 0; i < numSectors; i++) {
        const sectorAngle = i * arc;
        const sector = sectors[i];

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, this.radius - 10, sectorAngle, sectorAngle + arc);
        ctx.closePath();
        ctx.fillStyle = sector.color;
        ctx.fill();

        // Sector divider line
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.stroke();

        // Sector Text
        ctx.save();
        ctx.rotate(sectorAngle + arc / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.fillText(sector.text, this.radius - 40, 0);
        ctx.restore();

        // Light studs on border
        const dotAngle = sectorAngle;
        const dotX = Math.cos(dotAngle) * (this.radius - 1);
        const dotY = Math.sin(dotAngle) * (this.radius - 1);
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      ctx.restore();
    }

    pickWinningSector() {
      const sectors = this.config.sectors;
      const totalWeight = sectors.reduce((sum, s) => sum + (s.weight || 10), 0);
      let rand = Math.random() * totalWeight;
      for (let s of sectors) {
        if (rand < (s.weight || 10)) {
          return s;
        }
        rand -= (s.weight || 10);
      }
      return sectors[0];
    }

    spin() {
      if (this.isSpinning) return;
      if (this.hasSpun && !this.config.allowMultipleSpins) {
        alert('Вы уже крутили колесо! Заполните форму, чтобы забрать приз.');
        return;
      }

      this.isSpinning = true;
      document.getElementById('fw-main-spin-btn').disabled = true;

      const sectors = this.config.sectors;
      const numSectors = sectors.length;
      const arc = (2 * Math.PI) / numSectors;

      const winningSector = this.pickWinningSector();
      this.wonSector = winningSector;

      // Pointer is located at TOP (-Math.PI / 2).
      // Calculate target angle
      const winningIndex = sectors.findIndex(s => s.id === winningSector.id);
      const sectorCenterAngle = (winningIndex * arc) + (arc / 2);
      
      // We need: (targetAngle + sectorCenterAngle) % 2PI = 3PI/2 (top)
      const topOffset = (3 * Math.PI / 2) - sectorCenterAngle;
      const fullRotations = (5 + Math.floor(Math.random() * 3)) * 2 * Math.PI; // 5-7 spins
      const totalTargetRotation = this.currentRotation + fullRotations + (topOffset - (this.currentRotation % (2 * Math.PI)) + 2 * Math.PI);

      const durationMs = 5200;
      const startTime = performance.now();
      const startRotation = this.currentRotation;
      let lastTickAngle = startRotation;

      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3.2);

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const eased = easeOutCubic(progress);

        this.currentRotation = startRotation + (totalTargetRotation - startRotation) * eased;
        this.drawWheel(this.currentRotation);

        // Sound effect tick when crossing sectors
        if (Math.abs(this.currentRotation - lastTickAngle) >= arc) {
          this.playTick();
          lastTickAngle = this.currentRotation;
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.isSpinning = false;
          this.hasSpun = true;
          try {
            localStorage.setItem('fw_won_sector', JSON.stringify(this.wonSector));
          } catch (e) {}
          this.showResult(this.wonSector);
        }
      };

      requestAnimationFrame(animate);
    }

    showResult(sector) {
      document.getElementById('fw-initial-box').style.display = 'none';
      const resultBox = document.getElementById('fw-result-box');
      resultBox.classList.add('fw-active');
      document.getElementById('fw-won-title').innerText = sector.winText || sector.text;
    }

    claimPrize() {
      const name = document.getElementById('fw-name').value.trim();
      const phone = document.getElementById('fw-phone').value.trim();

      if (!phone || phone.length < 10) {
        alert('Пожалуйста, укажите корректный номер телефона для бронирования приза.');
        document.getElementById('fw-phone').focus();
        return;
      }

      const leadData = {
        name: name || 'Гость',
        phone: phone,
        prize: this.wonSector.winText || this.wonSector.text,
        promo: this.wonSector.promo || 'PROMO',
        date: new Date().toISOString()
      };

      // 1. Отправка цели в Яндекс.Метрику если подключена
      if (typeof window.ym === 'function' && this.config.metrikaCounterId) {
        try {
          window.ym(this.config.metrikaCounterId, 'reachGoal', this.config.metrikaGoal, leadData);
        } catch (e) {}
      }

      // 2. Webhook если настроен
      if (this.config.webhookUrl) {
        try {
          fetch(this.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadData)
          }).catch(() => {});
        } catch (e) {}
      }

      // 3. Сохранение локально
      try {
        localStorage.setItem('fw_lead_sent', JSON.stringify(leadData));
      } catch (e) {}

      // Переход на экран поздравления и бота
      document.getElementById('fw-result-box').classList.remove('fw-active');
      const successBox = document.getElementById('fw-success-box');
      successBox.classList.add('fw-active');
      document.getElementById('fw-promo-code').innerText = leadData.promo;

      // Ссылка на Telegram бота со start параметром
      const botUrl = `https://t.me/${this.config.telegramBot}?start=prize_${leadData.promo}_${encodeURIComponent(leadData.phone.replace(/\\D/g, ''))}`;
      const botBtn = document.getElementById('fw-bot-link');
      botBtn.href = botUrl;
    }

    attachEvents() {
      // Кнопки открытия/закрытия
      document.getElementById('fw-close').addEventListener('click', () => this.closeModal());
      document.getElementById('fw-modal').addEventListener('click', (e) => {
        if (e.target.id === 'fw-modal') this.closeModal();
      });

      // Запуск вращения
      document.getElementById('fw-main-spin-btn').addEventListener('click', () => this.spin());
      document.getElementById('fw-center-spin').addEventListener('click', () => this.spin());

      // Получение приза
      document.getElementById('fw-claim-btn').addEventListener('click', () => this.claimPrize());

      // Маска телефона РФ
      const phoneInput = document.getElementById('fw-phone');
      if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
          let val = e.target.value.replace(/\\D/g, '');
          if (!val) {
            e.target.value = '';
            return;
          }
          if (val[0] === '7' || val[0] === '8') val = val.substring(1);
          let formatted = '+7 (';
          if (val.length > 0) formatted += val.substring(0, 3);
          if (val.length >= 3) formatted += ') ' + val.substring(3, 6);
          if (val.length >= 6) formatted += '-' + val.substring(6, 8);
          if (val.length >= 8) formatted += '-' + val.substring(8, 10);
          e.target.value = formatted;
        });
      }
    }

    openModal() {
      const modal = document.getElementById('fw-modal');
      if (modal) modal.classList.add('fw-open');
    }

    closeModal() {
      const modal = document.getElementById('fw-modal');
      if (modal) modal.classList.remove('fw-open');
    }
  }

  // Экспорт в глобальную область
  window.FortuneWheelWidget = FortuneWheelWidget;

  // Авто-инициализация если передан конфиг через window.FORTUNE_WHEEL_CONFIG
  if (window.FORTUNE_WHEEL_AUTO_INIT !== false) {
    document.addEventListener('DOMContentLoaded', () => {
      window.fwInstance = new FortuneWheelWidget(window.FORTUNE_WHEEL_CONFIG || {});
    });
  }

})(window, document);
