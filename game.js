/**
 * OBOL: The Cursed Coin Pusher
 * Main Roguelite Game Loop, Starter Loadouts, Skill-Shot Bonus Gate,
 * Hand Queue Swapping, Blood Pact, Pouch Smelting, & Meta-Progression Controller
 */

const ACHIEVEMENTS = (window.ACHIEVEMENTS = window.ACHIEVEMENT_CATALOG || [
  { id: 'first_quota', name: 'Debt Initiated', desc: 'Survive Quota #1 and pay the Collector.' },
  { id: 'combo_king', name: 'Fever Pitch', desc: 'Reach a x5.0+ Chute Combo Multiplier.' },
  { id: 'boss_slayer', name: 'Tax Evader', desc: 'Defeat a Boss Quota (Quota #3, #6, or #9).' },
  { id: 'high_value_coin', name: 'Midas Mint', desc: 'Score a single coin worth $250+ in the Chute.' },
  { id: 'blood_pact', name: 'Blood Debtor', desc: 'Strike a Blood Pact with the Collector.' },
  { id: 'skill_shot', name: 'Needle Threader', desc: 'Drop a token through the moving Skill-Shot Gate.' },
  { id: 'smelter', name: 'Crucible Master', desc: 'Smelt a Copper Obol or Brand a token class in the Pouch.' },
  { id: 'full_rig', name: 'Contraband Engineer', desc: 'Bolt 4+ Contraband Relics onto the cabinet.' },
  { id: 'alchemist', name: 'Forbidden Alchemist', desc: 'Synthesize a Mythic Alchemical Fusion on the board.' },
  { id: 'chest_hunter', name: 'Vault Breaker', desc: 'Shove a Reliquary Prize Chest over the Chute Lip.' },
  { id: 'quicksilver_lord', name: 'Quicksilver Lord', desc: 'Synthesize the Mercury Leviathan or Infernal Juggernaut on the board.' },
  { id: 'stygian_ferryman', name: 'Stygian Navigator', desc: 'Rescue a coin from the Furnace Gutters.' },
  { id: 'royal_minter', name: 'Royal Minter', desc: 'Accumulate 6 Contraband Relics in a single run.' },
  { id: 'abyssal_conqueror', name: 'Abyssal Conqueror', desc: 'Reach Act IV: The Abyssal Mint (Quota #10+).' }
]);

class ObolGame {
  constructor() {
    this.canvas = document.getElementById('pusher-canvas');
    this.audio = window.obolAudio;

    this.collectorQuotes = [
      '"FEED THE IRON LIP, DEBTOR..."',
      '"THE HOUSE FURNACE HUNGERS FOR YOUR GOLD."',
      '"AIM FOR THE MOVING BONUS GATE TO TRIGGER A JACKPOT!"',
      '"RIGHT-CLICK ANY COIN ON THE BED TO FLICK IT FORWARD (+10% TILT)!"',
      '"BOUNCE COINS OFF THE SPINNING BRASS BUMPERS FOR +$6 VALUE!"',
      '"STRIKE A BLOOD PACT IF YOU DARE RISK YOUR FINGERS..."'
    ];

    this.career = this.loadCareer();
    this.isPointerDown = false;
    this.selectedLoadoutId = 'usurer';
    this.tormentTier = 0;
    this.tormentQuotaMult = 1.0;
    this.handDropsCount = 0;
    this.globalCoinValueBonus = 0;
    this.bloodPactUsedThisQuota = false;
    this.flicksThisRun = 0;
    this.lastDropTime = 0;
    this.tokenBrands = {};
    this.endlessMode = false;
    this.pouch = [];
    this.pouchBag = [];
    this.pouchDrawsLeft = 12;
    this.pouchReloadTimer = 0;
    this.runSeed = 'OBOL-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    this.updateRunSeedBadge();

    // Initialize Physics Engine
    this.physics = new CoinPusherPhysics(this.canvas, {
      onCoinScored: (coin, fromSynergy) => this.onCoinScored(coin, fromSynergy),
      onCoinBurned: (coin) => this.handleCoinBurned(coin),
      onPushCycle: (cycle) => this.handlePushCycle(cycle),
      onRelicProc: (relicId) => this.triggerRelicProcVisual(relicId),
      onSkillGateHit: (coin) => this.handleSkillGateHit(coin),
      onTokenFused: (coin, recipe) => this.handleTokenFused(coin, recipe),
      onComboBoost: (amt) => this.boostCombo(amt),
      hasRelic: (relicId) => {
        if (relicId === 'furnace_catcher') {
          return (
            this.relics.includes('furnace_catcher') ||
            this.relics.includes('slag_return') ||
            this.relics.includes('mercury_trough')
          );
        }
        return this.relics.includes(relicId);
      },
      getBossModifier: () => this.getActiveBossModifier(),
      getTokenBrand: (typeId) => (this.tokenBrands && this.tokenBrands[typeId]) || null
    });

    this.init();
    this.bindEvents();
    this.initAttractState();
    this.openStartLoadoutModal();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  get tiltMeter() {
    return this.tiltGauge || 0;
  }

  set tiltMeter(val) {
    this.tiltGauge = val;
  }

  get chuteCombo() {
    return this.comboMult || 1.0;
  }

  set chuteCombo(val) {
    this.comboMult = val;
  }

  init() {
    const feverDemoBtn = document.getElementById('fever-demo-btn');
    if (feverDemoBtn) {
      if (window.location.search.includes('debug=1')) {
        feverDemoBtn.style.display = 'inline-flex';
      } else {
        feverDemoBtn.style.display = 'none';
      }
    }
    this.initTooltipSystem();
    window.getShortTacticalTag = (item) => this.getShortTacticalTag(item);
  }

  initTooltipSystem() {
    let tip = document.getElementById('obol-floating-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'obol-floating-tooltip';
      tip.className = 'obol-floating-tooltip hidden';
      tip.setAttribute('role', 'tooltip');
      tip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tip);
    }
    this.floatingTooltip = tip;
    this.activeTooltipTarget = null;

    const positionTooltip = (targetEl) => {
      if (!targetEl || !this.floatingTooltip) return;
      const rect = targetEl.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        this.hideFloatingTooltip();
        return;
      }
      const tipEl = this.floatingTooltip;
      const tipW = tipEl.offsetWidth || 270;
      const tipH = tipEl.offsetHeight || 96;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = rect.right + 12;
      if (rect.left > vw * 0.55 || left + tipW > vw - 10) {
        left = rect.left - tipW - 12;
      }
      if (left < 10) {
        left = Math.max(10, Math.min(vw - tipW - 10, rect.left + (rect.width - tipW) / 2));
      }

      let top = rect.top + (rect.height - tipH) / 2;
      top = Math.max(10, Math.min(vh - tipH - 10, top));

      tipEl.style.left = `${Math.round(left)}px`;
      tipEl.style.top = `${Math.round(top)}px`;
    };

    const showForTarget = (targetEl) => {
      const desc = targetEl.getAttribute('data-tooltip-desc');
      if (!desc) {
        this.hideFloatingTooltip();
        return;
      }
      const title = targetEl.getAttribute('data-tooltip-title') || 'HARDWARE MODULE';
      const tag = targetEl.getAttribute('data-tooltip-tag') || '';

      this.activeTooltipTarget = targetEl;
      this.floatingTooltip.innerHTML = `
        <span class="obol-tooltip-rivet tl"></span>
        <span class="obol-tooltip-rivet tr"></span>
        <span class="obol-tooltip-rivet bl"></span>
        <span class="obol-tooltip-rivet br"></span>
        <div class="obol-tooltip-header">
          <span class="obol-tooltip-title">${title}</span>
          ${tag ? `<span class="obol-tooltip-badge">${tag}</span>` : ''}
        </div>
        <div class="obol-tooltip-desc">${desc}</div>
      `;
      this.floatingTooltip.classList.remove('hidden');
      this.floatingTooltip.setAttribute('aria-hidden', 'false');
      positionTooltip(targetEl);
    };

    document.addEventListener('mouseover', (e) => {
      const target = e.target && e.target.closest ? e.target.closest('[data-tooltip-desc]') : null;
      if (target) {
        showForTarget(target);
      } else if (this.activeTooltipTarget) {
        this.hideFloatingTooltip();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.activeTooltipTarget) return;
      const target = e.target && e.target.closest ? e.target.closest('[data-tooltip-desc]') : null;
      if (target !== this.activeTooltipTarget) {
        if (target) {
          showForTarget(target);
        } else {
          this.hideFloatingTooltip();
        }
      } else {
        positionTooltip(target);
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (!this.activeTooltipTarget) return;
      const related = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-tooltip-desc]') : null;
      if (related !== this.activeTooltipTarget) {
        if (related) {
          showForTarget(related);
        } else {
          this.hideFloatingTooltip();
        }
      }
    });

    window.addEventListener('mousedown', () => this.hideFloatingTooltip());
    window.addEventListener('keydown', () => this.hideFloatingTooltip());
  }

  hideFloatingTooltip() {
    this.activeTooltipTarget = null;
    if (this.floatingTooltip) {
      this.floatingTooltip.classList.add('hidden');
      this.floatingTooltip.setAttribute('aria-hidden', 'true');
    }
  }

  getShortTacticalTag(item) {
    if (!item) return 'CURSED HARDWARE';
    const TAG_MAP = {
      // 16 Contraband Relics (<= 19 chars for zero truncation)
      welded_guardrails: '45% GUTTER SHIELDS',
      overclocked_piston: '+38% PISTON SPEED',
      blood_magnet: 'MAGNETIC FRONT LIP',
      combo_metronome: '+0.5x RAPID COMBO',
      cut_tilt_wire: '-45% TILT • COOL',
      furnace_catcher: '40% GUTTER RETURN',
      slag_return: '40% GUTTER RETURN',
      sacrificial_grate: '+$18 & +0.6x BURN',
      greased_bed: '+$5/PEG • SLICK BED',
      tesla_coil: 'ZAP 3 LIP COINS +$12',
      vampire_funnel: '+40% LEECH & COMBO',
      golden_gate: '+35% GATE • +$20',
      hydraulic_bumper: '2x BUMPER (+$12)',
      mercury_trough: 'SAVED +$25 & GILDED',
      pendulum_blade: 'GATE +$18 & +x0.5',
      ossuary_dice: '2x DIE ROLL • +$10',
      sovereign_mint: '5TH DROP FREE GILD',
      // 24 Cursed Tokens (<= 19 chars for zero truncation)
      copper_obol: '$10 • LEECH FUEL',
      leech_penny: 'DRAINS • +$2/PUSH',
      blast_cap: '3-PUSH DETONATOR',
      lodestone: '2.3x • MAGNET PULL',
      mimic_tooth: 'CLONES HIT TOKEN',
      glass_sovereign: 'x3 CHUTE • FRAGILE',
      silver_drachma: '$28 • 1.75x SHOVER',
      soul_chain: 'TETHERS & YANKS',
      oil_cask: 'SLICK OIL COATING',
      voltaic_coil: 'ZAPS 3 COINS +$2',
      void_singularity: 'VORTEX • +$12 BUFF',
      necro_die: 'D6: BUFF/SHOVE/MINT',
      cursed_skull: '+$25/GUTTER LOSS',
      sun_bullion: '2.6x • +1.5x COMBO',
      reliquary_chest: 'PRIZE • FREE RELIC',
      alchemist_mercury: 'COATS 3 COINS +$12',
      hellfire_ducat: 'SCORCHES +$10/PUSH',
      charon_barge: 'GUTTER WARP +$35',
      obsidian_mirror: 'COPIES TOP COIN $',
      plasma_dynamo: 'MYTHIC • ZAP+BLAST',
      crimson_sovereign: 'MYTHIC • +$18 DRAIN',
      abyssal_magnetar: 'MYTHIC • PULL +$12',
      quicksilver_sovereign: 'MYTHIC • +$20 TOUCH',
      infernal_juggernaut: 'MYTHIC • FREE SLAM'
    };
    if (item.id && TAG_MAP[item.id]) {
      return TAG_MAP[item.id];
    }
    const rawDesc = String(item.desc || '').trim();
    if (!rawDesc) return 'CURSED HARDWARE';
    return rawDesc.length > 19 ? `${rawDesc.slice(0, 17).trim().toUpperCase()}...` : rawDesc.toUpperCase();
  }

  getHandTokenStatPill(def, brandDef) {
    if (!def) return '$10 • 1.0x • BRONZE MINT';
    let baseVal = (def.baseValue || 10) + (this.globalCoinValueBonus || 0);
    let massVal = def.mass || 1.0;
    if (brandDef && brandDef.id === 'gilded') {
      baseVal *= 2;
    } else if (brandDef && brandDef.id === 'heavy') {
      baseVal += 15;
      massVal = +(massVal * 1.8).toFixed(2);
    }
    const TRAIT_MAP = {
      copper_obol: 'BRONZE MINT',
      leech_penny: 'LEECH DRAIN',
      blast_cap: '3-PUSH BLAST',
      lodestone: 'MAGNET PULL',
      mimic_tooth: 'CLONES COIN',
      glass_sovereign: 'x3 CHUTE PAY',
      silver_drachma: 'BULLDOZER',
      soul_chain: 'TETHERS COIN',
      oil_cask: 'SLICK OIL',
      voltaic_coil: 'CHAIN ZAP',
      void_singularity: 'VOID VORTEX',
      necro_die: 'D6 ROLLER',
      cursed_skull: '+$25/GUTTER',
      sun_bullion: '+1.5x COMBO',
      reliquary_chest: 'PRIZE CHEST',
      alchemist_mercury: 'QUICKSILVER',
      hellfire_ducat: 'HELLFIRE +$10',
      charon_barge: 'GUTTER IMMUNE',
      obsidian_mirror: 'VALUE MIRROR',
      plasma_dynamo: 'ZAP & BLAST',
      crimson_sovereign: 'SIPHON KING',
      abyssal_magnetar: 'BOARD VORTEX',
      quicksilver_sovereign: 'MERCURY KING',
      infernal_juggernaut: 'MOLTEN SLAM'
    };
    const trait = TRAIT_MAP[def.id] || 'CURSED MINT';
    const massStr = Number.isInteger(massVal) ? `${massVal.toFixed(1)}x` : `${massVal}x`;
    return `$${baseVal} • ${massStr} • ${trait}`;
  }

  getQuotaComboCap() {
    const q = Math.max(1, this.quotaLevel || 1);
    return Math.min(32.0, 4.0 + (q - 1) * 3.0);
  }

  getTormentConfig(tier = this.tormentTier) {
    const t = Math.max(0, Math.min(3, Number(tier) || 0));
    const list = window.TORMENT_TIERS || [
      {
        tier: 0,
        id: 'torment_0',
        label: 'TORMENT 0: STANDARD',
        quotaMult: 1.0,
        tiltMult: 1.0,
        prestigeMult: 1.0,
        desc: 'Standard Debt Ledger (1.0x Quota Target • 1.0x Career Prestige)'
      },
      {
        tier: 1,
        id: 'torment_1',
        label: "TORMENT I: USURER'S TAX",
        quotaMult: 1.2,
        tiltMult: 1.0,
        prestigeMult: 1.25,
        desc: "Usurer's Tax (1.2x Quota Target • +25% Career Obol Prestige)"
      },
      {
        tier: 2,
        id: 'torment_2',
        label: 'TORMENT II: IRON TILT',
        quotaMult: 1.4,
        tiltMult: 1.15,
        prestigeMult: 1.5,
        desc: 'Iron Tilt (1.4x Quota Target • +15% Tilt Sensitivity • +50% Career Prestige)'
      },
      {
        tier: 3,
        id: 'torment_3',
        label: 'TORMENT III: ABYSSAL DEBT',
        quotaMult: 1.65,
        tiltMult: 1.25,
        prestigeMult: 2.0,
        desc: 'Abyssal Debt (1.65x Quota Target • +25% Tilt Sensitivity • 2.0x Career Prestige)'
      }
    ];
    return list[t] || list[0];
  }

  getTormentMultiplier(tier = this.tormentTier) {
    const cfg = this.getTormentConfig(tier);
    return cfg && Number.isFinite(cfg.quotaMult) ? cfg.quotaMult : 1.0;
  }

  getTormentTiltMultiplier(tier = this.tormentTier) {
    const cfg = this.getTormentConfig(tier);
    return cfg && Number.isFinite(cfg.tiltMult) ? cfg.tiltMult : 1.0;
  }

  getTormentPrestigeMultiplier(tier = this.tormentTier) {
    const cfg = this.getTormentConfig(tier);
    return cfg && Number.isFinite(cfg.prestigeMult) ? cfg.prestigeMult : 1.0;
  }

  setTormentTier(tier = 0) {
    const clamped = Math.max(0, Math.min(3, Number(tier) || 0));
    this.tormentTier = clamped;
    this.tormentQuotaMult = this.getTormentMultiplier(clamped);
    const cfg = this.getTormentConfig(clamped);

    document.querySelectorAll('.torment-tier-btn').forEach((btn) => {
      const btnTier = Number(btn.dataset.tormentTier) || 0;
      const isSelected = btnTier === clamped;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });

    const descEl = document.getElementById('torment-active-desc');
    if (descEl && cfg) {
      descEl.textContent = cfg.desc;
    }
  }

  loadCareer() {
    return this.loadCareerStats();
  }

  loadCareerStats() {
    try {
      const raw = localStorage.getItem('obol_career_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        let safeTotal = Number(parsed.totalObols) || 0;
        if (!Number.isFinite(safeTotal) || safeTotal < 0 || safeTotal > 1e8) {
          safeTotal = 0;
        }
        const stats = {
          bestQuota: Math.min(999, Math.max(1, Number(parsed.bestQuota) || 1)),
          bestCombo: Math.min(32.0, Math.max(1.0, Number(parsed.bestCombo) || 1.0)),
          totalObols: safeTotal,
          achievements: Array.isArray(parsed.achievements) ? parsed.achievements : []
        };
        localStorage.setItem('obol_career_v1', JSON.stringify(stats));
        return stats;
      }
    } catch (e) {
      // Ignore storage errors
    }
    return { bestQuota: 1, bestCombo: 1.0, totalObols: 0, achievements: [] };
  }

  formatHUDMoney(val) {
    const num = Number(val) || 0;
    if (!Number.isFinite(num) || Math.abs(num) >= 100000) {
      return window.formatObolMoney ? window.formatObolMoney(num) : '$99.9K';
    }
    return `$${Math.round(num).toLocaleString()}`;
  }

  saveCareerStats() {
    try {
      localStorage.setItem('obol_career_v1', JSON.stringify(this.career));
    } catch (e) {
      // Ignore storage errors
    }
  }

  updateRunSeedBadge() {
    const seedEl = document.getElementById('run-seed-badge');
    if (seedEl) {
      seedEl.textContent = `SEED: ${this.runSeed}`;
    }
  }

  unlockAchievement(achId) {
    if (!this.career.achievements) this.career.achievements = [];
    if (this.career.achievements.includes(achId)) return;
    const achCatalog = window.ACHIEVEMENT_CATALOG || window.ACHIEVEMENTS || ACHIEVEMENTS || [];
    const ach = achCatalog.find((a) => a.id === achId);
    if (!ach) return;

    this.career.achievements.push(achId);
    this.saveCareerStats();
    window.obolAudio.playQuotaCleared();
    if (this.physics && this.physics.addAchievementToast) {
      this.physics.addAchievementToast(`ACHIEVEMENT: ${ach.name} (+$5 START WALLET)!`);
    } else if (this.physics && this.physics.addPopup) {
      this.physics.addPopup(300, 115, `ACHIEVEMENT: ${ach.name} (+$5 START WALLET)!`, '#39ff5a', 1.3);
    }
  }

  getActiveBossModifier() {
    if (!this.quotaLevel || this.quotaLevel < 3 || this.quotaLevel % 3 !== 0) return null;
    const map = window.BOSS_MODIFIERS || {};
    if (!map[12]) {
      map[12] = {
        name: 'BOSS QUOTA: THE ABYSSAL EMPEROR',
        desc: 'Quota Target +35%, Tilt Gain +25%, Chute Payouts +35%!',
        quotaMultiplier: 1.35,
        tiltPenalty: 1.25,
        payoutBonus: 1.35
      };
    }
    if (map[this.quotaLevel]) return map[this.quotaLevel];
    const cycle = [3, 6, 9, 12];
    const key = cycle[(Math.floor(this.quotaLevel / 3) - 1) % cycle.length];
    return map[key] || null;
  }

  triggerHudValuePop(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove('hud-value-pop');
    void el.offsetWidth;
    el.classList.add('hud-value-pop');
  }

  triggerShaderShockwave(pxX = 340, pxY = 480) {
    if (
      this.physics &&
      this.physics.shaderPipeline &&
      typeof this.physics.shaderPipeline.triggerShockwave === 'function'
    ) {
      const w = (this.physics && this.physics.width) || 680;
      const h = (this.physics && this.physics.height) || 640;
      this.physics.shaderPipeline.triggerShockwave(
        Math.max(0.1, Math.min(0.9, pxX / w)),
        Math.max(0.1, Math.min(0.9, pxY / h))
      );
    }
  }

  boostCombo(amount) {
    const bossMod = this.getActiveBossModifier();
    const mult = bossMod && bossMod.comboBoost ? bossMod.comboBoost : 1.0;
    const quotaComboCap = this.getQuotaComboCap();
    this.comboMult = Math.min(quotaComboCap, +(this.comboMult + amount * mult).toFixed(2));
    const comboWindow = this.relics.includes('combo_metronome') ? 2.95 : 2.25;
    this.comboTimer = Math.max(this.comboTimer, comboWindow);
    if (this.comboMult > this.maxComboThisRun) {
      this.maxComboThisRun = this.comboMult;
    }
    if (this.comboMult >= 5.0) {
      this.unlockAchievement('combo_king');
    }
    this.triggerHudValuePop('combo-mult-text');
    this.updateHUD();
  }

  initAttractState() {
    this.quotaLevel = 1;
    this.tormentTier = Number(this.tormentTier) || 0;
    this.tormentQuotaMult = this.getTormentMultiplier(this.tormentTier);
    this.quotaTarget = 150;
    this.chuteBank = 0;
    this.wallet = 45;
    this.timeLeft = 180;
    this.fingers = 3;
    this.tiltGauge = 0;
    this.isPaused = true;
    this.isAttractMode = true;
    this.globalCoinValueBonus = 0;
    this.bloodPactUsedThisQuota = false;
    this.handDropsCount = 0;
    this.tokenBrands = {};
    this.endlessMode = false;

    this.comboMult = 1.0;
    this.comboStreak = 0;
    this.comboTimer = 0;
    this.maxComboThisRun = 1.0;
    this.furnaceLostCount = 0;
    this.totalEarnedRun = 0;

    const defaultKit = (window.STARTER_LOADOUTS && window.STARTER_LOADOUTS[0]) || {};
    this.pouch = [...(defaultKit.tokens || defaultKit.pouch || ['copper_obol', 'copper_obol', 'leech_penny', 'blast_cap'])];
    this.pouchBag = [...this.pouch];
    this.shuffleArray(this.pouchBag);
    this.pouchDrawsLeft = this.pouchBag.length;
    this.pouchReloadTimer = 0;
    this.drawIndex = 0;
    this.handQueue = [];
    for (let i = 0; i < 5; i++) {
      this.handQueue.push(this.drawNextFromPouch());
    }

    this.relics = [];
    this.maxRelics = 6;
    this.marketItems = [];

    this.physics.resetBoard();
    this.rollBlackMarket();
    this.updateFingerUI();
    this.updateRelicsUI();
    this.updateQueueUI();
    this.updateBossBanner();
    this.updateHUD();
  }

  openStartLoadoutModal() {
    this.isPaused = true;
    this.isAttractMode = true;

    document.getElementById('career-best-quota').textContent = `QUOTA #${this.career.bestQuota}`;
    document.getElementById('career-best-combo').textContent = `x${this.career.bestCombo.toFixed(1)}`;
    document.getElementById('career-total-obols').textContent = this.formatHUDMoney(this.career.totalObols);

    this.setTormentTier(this.tormentTier || 0);

    const grid = document.getElementById('loadout-grid');
    grid.innerHTML = '';

    (window.STARTER_LOADOUTS || []).forEach((kit) => {
      const card = document.createElement('div');
      card.className = 'loadout-card';
      const subText = kit.tagline || kit.subtitle || '';
      card.innerHTML = `
        <div>
          <div class="loadout-header">
            <div class="loadout-icon">${kit.icon}</div>
            <div>
              <div class="loadout-title">${kit.name}</div>
              <div class="loadout-subtitle">${subText}</div>
            </div>
          </div>
          <div class="loadout-desc">${kit.desc}</div>
        </div>
        <button class="industrial-btn proceed-btn">
          <span>ENTER BOOTH WITH POUCH &rarr;</span>
        </button>
      `;
      card.addEventListener('click', () => {
        window.obolAudio.init();
        window.obolAudio.playBuyItem();
        document.getElementById('start-modal').classList.add('hidden');
        this.startNewRun(kit.id);
      });
      grid.appendChild(card);
    });

    document.getElementById('start-modal').classList.remove('hidden');
  }

  applyStarterLoadout(loadoutId = 'usurer') {
    this.startNewRun(loadoutId);
  }

  startNewRun(loadoutId = 'usurer') {
    const aliasMap = {
      standard: 'usurer',
      blood: 'arcanist',
      demolition: 'demolitionist',
      high_roller: 'highroller',
      quicksilver: 'alchemist',
      charon: 'ferryman'
    };
    const normalizedId = aliasMap[loadoutId] || loadoutId || 'usurer';
    this.selectedLoadoutId = normalizedId;
    ['start-modal', 'gameover-modal', 'victory-modal', 'draft-modal'].forEach((modalId) => {
      const el = document.getElementById(modalId);
      if (el) el.classList.add('hidden');
    });
    this.runSeed = 'OBOL-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    this.updateRunSeedBadge();

    const kit =
      (window.STARTER_LOADOUTS || []).find((k) => k.id === normalizedId) ||
      (window.STARTER_LOADOUTS && window.STARTER_LOADOUTS[0]) ||
      {};

    this.tormentTier = Number(this.tormentTier) || 0;
    this.tormentQuotaMult = this.getTormentMultiplier(this.tormentTier);
    this.quotaLevel = 1;
    this.quotaTarget = Math.round(150 * this.tormentQuotaMult);
    this.chuteBank = 0;
    const achBonus = ((this.career && this.career.achievements && this.career.achievements.length) || 0) * 5;
    const kitWallet = Number.isFinite(kit.startingWallet) ? kit.startingWallet : Number.isFinite(kit.wallet) ? kit.wallet : 45;
    this.wallet = kitWallet + achBonus;
    this.timeLeft = 180;
    this.fingers = 3;
    this.tiltGauge = 0;
    this.isPaused = false;
    this.isAttractMode = false;
    this.globalCoinValueBonus = 0;
    this.bloodPactUsedThisQuota = false;
    this.flicksThisRun = 0;
    this.handDropsCount = 0;
    this.tokenBrands = {};
    this.endlessMode = false;

    this.comboMult = 1.0;
    this.comboStreak = 0;
    this.comboTimer = 0;
    this.maxComboThisRun = 1.0;
    this.furnaceLostCount = 0;
    this.totalEarnedRun = 0;

    this.pouch = [...(kit.tokens || kit.pouch || ['copper_obol', 'copper_obol', 'leech_penny', 'blast_cap'])];
    this.pouchBag = [...this.pouch];
    this.shuffleArray(this.pouchBag);
    this.pouchDrawsLeft = this.pouchBag.length;
    this.pouchReloadTimer = 0;
    this.drawIndex = 0;
    this.handQueue = [];
    for (let i = 0; i < 5; i++) {
      this.handQueue.push(this.drawNextFromPouch());
    }

    this.relics = kit.startingRelic ? [kit.startingRelic] : [];
    this.maxRelics = 6;
    this.marketItems = [];

    this.physics.resetBoard();
    this.rollBlackMarket();
    this.updateFingerUI();
    this.updateRelicsUI();
    this.updateQueueUI();
    this.updateBossBanner();
    this.updateHUD();
    const tormentCfg = this.getTormentConfig(this.tormentTier);
    const tormentTag = this.tormentTier > 0 && tormentCfg ? ` [${tormentCfg.label}]` : '';
    this.setCollectorQuote(`"QUOTA #1 BEGINS${tormentTag}. AIM FOR THE BONUS GATE, SINNER."`);
  }

  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  drawNextFromPouch() {
    if (this.pouch.length === 0) return 'copper_obol';
    if (!Array.isArray(this.pouchBag) || this.pouchBag.length === 0) {
      this.pouchBag = [...this.pouch];
      this.shuffleArray(this.pouchBag);
    }
    const nextToken = this.pouchBag.pop();
    this.pouchDrawsLeft = this.pouchBag.length;
    return nextToken;
  }

  swapHandToken(targetIdx = 1) {
    if (this.handQueue.length < 2) return;
    const idx = Math.max(1, Math.min(this.handQueue.length - 1, targetIdx));
    const temp = this.handQueue[0];
    this.handQueue[0] = this.handQueue[idx];
    this.handQueue[idx] = temp;
    window.obolAudio.playRelicProc();
    this.updateQueueUI();
  }

  bindEvents() {
    const updateAimFromEvent = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const logicalW = (this.physics && this.physics.width) || 680;
      const logicalH = (this.physics && this.physics.height) || 640;
      const scaleX = logicalW / rect.width;
      const scaleY = logicalH / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      this.physics.setAimX(x, y);
      if (this.physics && typeof this.physics.setMousePos === 'function') {
        this.physics.setMousePos(x, y);
      }
      return x;
    };

    this.canvas.addEventListener('mousemove', (e) => {
      updateAimFromEvent(e);
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.physics && typeof this.physics.setMousePos === 'function') {
        this.physics.setMousePos(-1000, -1000);
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.isPointerDown = true;
      const x = updateAimFromEvent(e);
      this.tryDropCurrentToken(x);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.isPaused) return;
      const rect = this.canvas.getBoundingClientRect();
      const logicalW = (this.physics && this.physics.width) || 680;
      const logicalH = (this.physics && this.physics.height) || 640;
      const scaleX = logicalW / rect.width;
      const scaleY = logicalH / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      const wasOffCooldown = (this.physics.flickCooldown || 0) <= 0;
      const flicked = this.physics.flickCoinAt(mx, my);
      if (flicked) {
        const cutWire = this.relics.includes('cut_tilt_wire');
        const bossMod = this.getActiveBossModifier();
        const tiltMult = (bossMod && bossMod.tiltPenalty ? bossMod.tiltPenalty : 1.0) * this.getTormentTiltMultiplier();
        const tiltAdd = (cutWire ? 5.5 : 10) * tiltMult;
        this.tiltGauge = Math.min(100, this.tiltGauge + tiltAdd);
        this.flicksThisRun++;
        if (this.tiltGauge >= 100) {
          this.punishTiltOverload();
        }
        this.updateHUD();
      } else if (wasOffCooldown && this.physics.flickCooldown <= 0) {
        this.physics.addPopup(mx, my, 'NO COIN IN FLICK RANGE', '#a89f91', 0.85);
      }
    });

    document.querySelectorAll('.torment-tier-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.obolAudio.init();
        window.obolAudio.playRelicProc();
        this.setTormentTier(Number(btn.dataset.tormentTier) || 0);
      });
    });

    window.addEventListener('mouseup', () => {
      this.isPointerDown = false;
    });

    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
          const rect = this.canvas.getBoundingClientRect();
          const logicalW = (this.physics && this.physics.width) || 680;
          const logicalH = (this.physics && this.physics.height) || 640;
          const scaleX = logicalW / rect.width;
          const scaleY = logicalH / rect.height;
          const x = (e.touches[0].clientX - rect.left) * scaleX;
          const y = (e.touches[0].clientY - rect.top) * scaleY;
          this.physics.setAimX(x, y);
          this.tryDropCurrentToken(x);
        }
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      const startModal = document.getElementById('start-modal');
      if (startModal && !startModal.classList.contains('hidden')) {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
          e.preventDefault();
          window.obolAudio.init();
          startModal.classList.add('hidden');
          this.startNewRun('usurer');
        }
        return;
      }
      if (e.code === 'Escape') {
        const dismissable = ['grimoire-modal', 'pouch-modal', 'help-modal'];
        let closedAny = false;
        dismissable.forEach((id) => {
          const el = document.getElementById(id);
          if (el && !el.classList.contains('hidden')) {
            el.classList.add('hidden');
            closedAny = true;
          }
        });
        if (closedAny && !this.isAttractMode) {
          this.isPaused = false;
        }
        return;
      }
      if (this.isPaused) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.triggerCabinetSlam();
      } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
        const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
        const laneX = 136 + idx * 102;
        this.physics.setAimX(laneX, 30);
        this.tryDropCurrentToken(laneX);
      } else if (e.code === 'KeyF' && window.location.search.includes('debug=1')) {
        this.triggerViralShowcase();
      } else if (e.code === 'KeyR' || e.code === 'KeyE') {
        this.swapHandToken(1);
      } else if (e.code === 'KeyT') {
        this.toggleTheater3DMode();
      }
    });

    const closeStartBtn = document.getElementById('close-start-btn');
    if (closeStartBtn) {
      closeStartBtn.addEventListener('click', () => {
        window.obolAudio.init();
        window.obolAudio.playBuyItem();
        document.getElementById('start-modal').classList.add('hidden');
        this.startNewRun('usurer');
      });
    }

    const quickStartBtn = document.getElementById('quick-start-btn');
    if (quickStartBtn) {
      quickStartBtn.addEventListener('click', () => {
        window.obolAudio.init();
        window.obolAudio.playBuyItem();
        document.getElementById('start-modal').classList.add('hidden');
        this.startNewRun('usurer');
      });
    }

    const swapBtn = document.getElementById('swap-hand-btn');
    if (swapBtn) {
      swapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.swapHandToken(1);
      });
    }

    const handQueueEl = document.getElementById('hand-queue');
    if (handQueueEl) {
      handQueueEl.addEventListener('click', (e) => {
        if (e.target.closest('.upcoming-chip')) return;
        this.swapHandToken(1);
      });
    }

    const bloodPactBtn = document.getElementById('blood-pact-btn');
    if (bloodPactBtn) {
      bloodPactBtn.addEventListener('click', () => {
        this.triggerBloodPact();
      });
    }

    const smeltBtn = document.getElementById('smelt-obol-btn');
    if (smeltBtn) {
      smeltBtn.addEventListener('click', () => {
        this.smeltCopperObol();
      });
    }

    document.getElementById('slam-btn').addEventListener('click', () => {
      this.triggerCabinetSlam();
    });

    document.getElementById('pay-quota-btn').addEventListener('click', () => {
      if (this.chuteBank >= this.quotaTarget) {
        this.completeQuota();
      }
    });

    document.getElementById('mint-obol-btn').addEventListener('click', () => {
      if (this.wallet >= 15 && !this.isPaused) {
        this.wallet -= 15;
        if (window.ObolSecurityShield) window.ObolSecurityShield.sealState(this);
        this.pouchReloadTimer = 0;
        this.pouchBag.push('copper_obol', 'copper_obol', 'copper_obol');
        this.pouchDrawsLeft = this.pouchBag.length;
        window.obolAudio.playBuyItem();
        for (let i = 0; i < 3; i++) {
          const rx = 180 + i * 150 + (Math.random() * 24 - 12);
          this.physics.spawnCoinOnBed('copper_obol', rx, 176, { bonusValue: this.globalCoinValueBonus }, 'shelf');
        }
        this.physics.addPopup(340, 170, '+3 MINTED OBOLS!', '#ffbf36', 1.1);
        this.updateQueueUI();
        this.updateHUD();
      }
    });

    const seedBadgeEl = document.getElementById('run-seed-badge');
    if (seedBadgeEl) {
      seedBadgeEl.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(this.runSeed);
          }
        } catch (err) {
          // Ignore clipboard permissions error
        }
        seedBadgeEl.textContent = 'SEED COPIED!';
        setTimeout(() => {
          this.updateRunSeedBadge();
        }, 1400);
      });
    }

    document.getElementById('reroll-market-btn').addEventListener('click', () => {
      if (this.wallet >= 20 && !this.isPaused) {
        this.wallet -= 20;
        if (window.ObolSecurityShield) window.ObolSecurityShield.sealState(this);
        window.obolAudio.playBuyItem();
        this.rollBlackMarket();
        this.updateHUD();
      }
    });

    const feverBtn = document.getElementById('fever-demo-btn');
    if (feverBtn) {
      feverBtn.addEventListener('click', () => {
        this.triggerViralShowcase();
      });
    }

    document.getElementById('loadout-btn').addEventListener('click', () => {
      this.openStartLoadoutModal();
    });

    const grimoireBtn = document.getElementById('grimoire-btn');
    if (grimoireBtn) {
      grimoireBtn.addEventListener('click', () => {
        this.openGrimoireModal('ach');
      });
    }

    document.querySelectorAll('#grimoire-modal .grimoire-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        this.switchGrimoireTab(tabBtn.dataset.tab || 'ach');
      });
    });

    const closeGrimoireBtn = document.getElementById('close-grimoire-btn');
    if (closeGrimoireBtn) {
      closeGrimoireBtn.addEventListener('click', () => {
        document.getElementById('grimoire-modal').classList.add('hidden');
        if (!this.isAttractMode) this.isPaused = false;
      });
    }

    document.getElementById('mute-btn').addEventListener('click', (e) => {
      const muted = window.obolAudio.toggleMute();
      e.currentTarget.innerHTML = window.ObolIcons
        ? window.ObolIcons.svg(muted ? 'speaker_off' : 'speaker_on', 16)
        : muted
          ? 'MUTE'
          : 'SND';
    });

    document.getElementById('crt-btn').addEventListener('click', () => {
      const crt = document.getElementById('crt-overlay');
      const isEnabled = crt.classList.toggle('crt-enabled');
      if (this.physics && this.physics.shaderPipeline) {
        this.physics.shaderPipeline.enabled = isEnabled;
      }
    });

    document.getElementById('fullscreen-btn').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    document.getElementById('help-btn').addEventListener('click', () => {
      this.isPaused = true;
      document.getElementById('help-modal').classList.remove('hidden');
    });

    document.getElementById('close-help-btn').addEventListener('click', () => {
      document.getElementById('help-modal').classList.add('hidden');
      if (!this.isAttractMode) this.isPaused = false;
    });

    document.getElementById('view-pouch-btn').addEventListener('click', () => {
      this.openPouchInspector();
    });

    document.getElementById('close-pouch-btn').addEventListener('click', () => {
      document.getElementById('pouch-modal').classList.add('hidden');
      if (!this.isAttractMode) this.isPaused = false;
    });

    document.getElementById('next-quota-btn').addEventListener('click', () => {
      this.advanceToNextQuota();
    });

    document.getElementById('restart-run-btn').addEventListener('click', () => {
      document.getElementById('gameover-modal').classList.add('hidden');
      this.openStartLoadoutModal();
    });

    const continueEndlessBtn = document.getElementById('continue-endless-btn');
    if (continueEndlessBtn) {
      continueEndlessBtn.addEventListener('click', () => {
        document.getElementById('victory-modal').classList.add('hidden');
        this.endlessMode = true;
        this.openDraftModal(
          this.pendingQuotaReward ? this.pendingQuotaReward.totalBonus : 60,
          this.pendingQuotaReward ? this.pendingQuotaReward.timeBonus : 15,
          this.pendingQuotaReward ? this.pendingQuotaReward.interestBonus : 15
        );
      });
    }

    const victoryNewRunBtn = document.getElementById('victory-new-run-btn');
    if (victoryNewRunBtn) {
      victoryNewRunBtn.addEventListener('click', () => {
        document.getElementById('victory-modal').classList.add('hidden');
        this.openStartLoadoutModal();
      });
    }

    ['grimoire-modal', 'pouch-modal', 'help-modal'].forEach((modalId) => {
      const backdrop = document.getElementById(modalId);
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) {
            backdrop.classList.add('hidden');
            if (!this.isAttractMode) this.isPaused = false;
          }
        });
      }
    });
  }

  /**
   * Alchemical Board Fusion Trigger (Raccoin-style Cross-Token Synthesis)
   */
  handleTokenFused(coin, recipe) {
    if (window.obolAudio && typeof window.obolAudio.playFusion === 'function') {
      window.obolAudio.playFusion();
    }
    if (
      this.physics &&
      this.physics.shaderPipeline &&
      typeof this.physics.shaderPipeline.triggerShockwave === 'function' &&
      coin
    ) {
      this.physics.shaderPipeline.triggerShockwave(
        Math.max(0.1, Math.min(0.9, coin.x / ((this.physics && this.physics.width) || 680))),
        Math.max(0.1, Math.min(0.9, coin.y / ((this.physics && this.physics.height) || 640)))
      );
    }
    this.boostCombo(1.0);
    this.unlockAchievement('alchemist');
    const resId = (coin && coin.typeId) || (recipe && recipe.result) || '';
    if (resId === 'quicksilver_sovereign' || resId === 'infernal_juggernaut') {
      this.unlockAchievement('quicksilver_lord');
    }
    this.setCollectorQuote(`"FORBIDDEN ALCHEMY?! YOU SYNTHESIZED A ${coin.name.toUpperCase()} ON MY BED!"`);
    this.updateHUD();
  }

  /**
   * Alchemical Token Branding in Pouch Inspector (Balatro / Raccoin Seals)
   */
  brandTokenClass(typeId, brandId) {
    if (brandId === 'lead') brandId = 'heavy';
    const bDef = window.TOKEN_BRANDS && window.TOKEN_BRANDS[brandId];
    if (!bDef || this.wallet < bDef.cost) return;
    if (this.tokenBrands[typeId] === brandId) return;

    this.wallet -= bDef.cost;
    this.tokenBrands[typeId] = brandId;
    window.obolAudio.playBuyItem();
    this.unlockAchievement('smelter');

    const maxBoardVal = window.getCoinMaxVal ? window.getCoinMaxVal(this, 1.2) : 65 + (this.quotaLevel - 1) * 50;
    // Immediately upgrade existing unbranded coins of this class on the board too!
    for (const c of this.physics.coins) {
      if (c.typeId === typeId && c.brand !== brandId) {
        c.brand = brandId;
        if (brandId === 'gilded') {
          c.value = Math.min(maxBoardVal, c.value * 2);
          c.gilded = true;
        } else if (brandId === 'heavy') {
          c.mass = +(c.mass * 1.8).toFixed(2);
          c.value = Math.min(maxBoardVal, c.value + 15);
        }
        this.physics.spawnRingParticles(c.x, c.y, bDef.color, 12);
      }
    }

    this.openPouchModal();
    this.updateQueueUI();
    this.updateHUD();
  }

  /**
   * Moving Skill-Shot "BONUS GATE" Trigger
   */
  handleSkillGateHit(coin) {
    window.obolAudio.playQuotaCleared();
    if (coin) {
      this.triggerShaderShockwave(coin.x, coin.y);
    }
    const goldenBonus = this.relics.includes('golden_gate') ? 20 : 0;
    if (goldenBonus > 0) {
      this.triggerRelicProcVisual('golden_gate');
    }
    const pendulumBonus = this.relics.includes('pendulum_blade') ? 18 : 0;
    if (pendulumBonus > 0) {
      this.boostCombo(0.5);
      this.triggerRelicProcVisual('pendulum_blade');
      if (this.physics && this.physics.addPopup) {
        this.physics.addPopup(coin.x, coin.y - 18, 'RAZOR GATE: +$18 & +x0.5 COMBO!', '#ffdf40', 1.05);
      }
    }
    const maxVal = window.getCoinMaxVal ? window.getCoinMaxVal(this) : 55 + (this.quotaLevel - 1) * 45;
    coin.value = Math.min(maxVal, Math.round(coin.value * 1.25) + 4 + goldenBonus + pendulumBonus);
    coin.gilded = true;
    this.unlockAchievement('skill_shot');

    const quotaComboCap = this.getQuotaComboCap();
    const roll = Math.floor(Math.random() * 5);
    if (roll === 0) {
      // 1. Obol Shower: Spawn bonus Copper Obol(s) onto the upper shelf
      const showerCount = this.quotaLevel === 1 ? 1 : 2;
      for (let i = 0; i < showerCount; i++) {
        this.physics.spawnCoinOnBed('copper_obol', 250 + i * 180, 176, { bonusValue: this.globalCoinValueBonus }, 'shelf');
      }
      this.physics.addPopup(340, 155, `GATE JACKPOT: +${showerCount} COIN SHOWER!`, '#39ff5a', 1.15);
      this.setCollectorQuote('"CURSE THAT SKILL GATE! FREE COINS RAINING FROM THE CEILING!"');
    } else if (roll === 1) {
      // 2. Overdrive Piston & Electric Guardrails
      const odDur = this.quotaLevel === 1 ? 1.6 : 4.0;
      this.physics.overdriveTimer = Math.max(this.physics.overdriveTimer, odDur);
      this.physics.addPopup(340, 145, `GATE JACKPOT: ${odDur.toFixed(1)}s OVERDRIVE!`, '#39ff5a', 1.15);
      this.setCollectorQuote('"THE PISTON IS OVERCLOCKED AND THE SIDE GUTTERS ARE SEALED!"');
    } else if (roll === 2) {
      // 3. Midas Transmutation: Upgrade 1 Copper Obol on the bed into a Silver Drachma
      const coppers = this.physics.coins.filter((c) => c.typeId === 'copper_obol' && c.layer === 'bed');
      this.shuffleArray(coppers);
      coppers.slice(0, 1).forEach((target) => {
        const sDef = window.TOKEN_CATALOG.silver_drachma;
        target.typeId = sDef.id;
        target.id = sDef.id;
        target.rawId = sDef.id;
        target.name = sDef.name;
        target.icon = sDef.icon;
        target.value = Math.min(maxVal, sDef.baseValue);
        target.colorPrimary = sDef.colorPrimary;
        target.colorSecondary = sDef.colorSecondary;
        target.colorRim = sDef.colorRim;
        target.gilded = true;
        if (this.physics && this.physics.tokenSpriteCache) {
          this.physics.tokenSpriteCache.delete(target.uid);
        }
        this.physics.spawnRingParticles(target.x, target.y, '#ffbf36', 12);
      });
      this.physics.addPopup(340, 145, 'GATE JACKPOT: MIDAS UPGRADE!', '#ffdf40', 1.15);
    } else if (roll === 3) {
      // 4. Free Blast Cap on the upper shelf
      this.physics.spawnCoinOnBed('blast_cap', 340 + (Math.random() * 60 - 30), 178, null, 'shelf');
      this.physics.addPopup(340, 145, 'GATE JACKPOT: FREE BLAST CAP!', '#ff9922', 1.15);
    } else {
      // 5. Instant +x0.35 Chute Combo Multiplier
      this.comboMult = Math.min(quotaComboCap, +(this.comboMult + 0.35).toFixed(2));
      this.comboTimer = 3.0;
      this.triggerHudValuePop('combo-mult-text');
      this.physics.addPopup(340, 145, `GATE JACKPOT: +x0.35 COMBO (x${this.comboMult.toFixed(1)})!`, '#ffbf36', 1.15);
    }
    this.updateHUD();
  }

  /**
   * Collector's Blood Pact: Once per Quota high-stakes deal
   */
  triggerBloodPact() {
    if (this.isPaused || this.bloodPactUsedThisQuota) return;
    this.bloodPactUsedThisQuota = true;
    window.obolAudio.playCollectorPunish();
    this.triggerShaderShockwave(340, 210);

    const pactTokens = ['leech_penny', 'blast_cap', 'silver_drachma', 'oil_cask', 'mimic_tooth'];
    pactTokens.forEach((t, i) => {
      this.physics.spawnCoinOnBed(t, 150 + i * 92, 178, { bonusValue: this.globalCoinValueBonus }, 'shelf');
    });

    const quotaComboCap = this.getQuotaComboCap();
    this.comboMult = Math.min(quotaComboCap, +(this.comboMult + 0.75).toFixed(2));
    this.comboTimer = 4.5;
    this.triggerHudValuePop('combo-mult-text');
    this.tiltGauge = Math.min(100, this.tiltGauge + 40);
    this.physics.addShake(10, 0.35);
    this.physics.addPopup(340, 210, 'BLOOD PACT: +5 CURSED TOKENS & +x0.75 COMBO!', '#ff4d58', 1.35);
    this.setCollectorQuote('"A BLOOD PACT SEALED! TAKE YOUR CURSED GOLD... WATCH THE TILT GAUGE!"');
    this.unlockAchievement('blood_pact');
    if (this.comboMult >= 5.0) {
      this.unlockAchievement('combo_king');
    }

    if (this.tiltGauge >= 100) {
      this.punishTiltOverload();
    }
    this.updateHUD();
  }

  /**
   * Smelt 1 Copper Obol from Pouch & Permanently Buff All Coins +$4
   */
  smeltCopperObol() {
    const copperIdx = this.pouch.indexOf('copper_obol');
    if (this.wallet < 25 || copperIdx === -1) return;

    this.wallet -= 25;
    this.pouch.splice(copperIdx, 1);
    if (Array.isArray(this.pouchBag)) {
      const bagIdx = this.pouchBag.indexOf('copper_obol');
      if (bagIdx !== -1) {
        this.pouchBag.splice(bagIdx, 1);
      }
      this.pouchDrawsLeft = this.pouchBag.length;
    } else {
      this.pouchDrawsLeft = Math.min(this.pouch.length, this.pouchDrawsLeft);
    }
    this.globalCoinValueBonus += 4;
    window.obolAudio.playBuyItem();
    this.unlockAchievement('smelter');
    this.openPouchModal();
    this.updateQueueUI();
    this.updateHUD();
  }

  triggerViralShowcase() {
    window.obolAudio.init();
    this.physics.triggerViralJackpotShowcase();
    this.setCollectorQuote('"WHAT SORCERY IS THIS?! MY MACHINE IS OVERFLOWING!"');
  }

  tryDropCurrentToken(x) {
    if (this.isPaused) return false;
    if (this.pouchReloadTimer > 0 && !(this.physics && this.physics.overdriveTimer > 0)) {
      return false;
    }
    const currentTypeId = this.handQueue[0];
    const dropped = this.physics.dropToken(currentTypeId, x, this.globalCoinValueBonus);
    if (!dropped) return false;

    this.handDropsCount = (this.handDropsCount || 0) + 1;
    const newCoin =
      typeof dropped === 'object' && dropped !== null
        ? dropped
        : this.physics && Array.isArray(this.physics.coins) && this.physics.coins.length > 0
          ? this.physics.coins[this.physics.coins.length - 1]
          : null;

    if (newCoin && newCoin.typeId === 'obsidian_mirror') {
      if (
        window.TOKEN_MUTATION_HANDLERS &&
        window.TOKEN_MUTATION_HANDLERS.obsidian_mirror &&
        typeof window.TOKEN_MUTATION_HANDLERS.obsidian_mirror.onSpawn === 'function'
      ) {
        window.TOKEN_MUTATION_HANDLERS.obsidian_mirror.onSpawn(newCoin, this.physics, this);
      }
    }

    if (newCoin && this.relics.includes('sovereign_mint') && this.handDropsCount % 5 === 0) {
      const maxVal = window.getCoinMaxVal ? window.getCoinMaxVal(this, 1.2) : 65 + (this.quotaLevel - 1) * 50;
      if (!newCoin.gilded) {
        newCoin.gilded = true;
        newCoin.value = Math.min(maxVal, newCoin.value * 2);
      } else {
        newCoin.value = Math.min(maxVal, newCoin.value + 20);
      }
      if (this.physics && this.physics.tokenSpriteCache) {
        this.physics.tokenSpriteCache.delete(newCoin.uid);
      }
      if (this.physics && this.physics.spawnRingParticles) {
        this.physics.spawnRingParticles(newCoin.x, newCoin.y, '#ffdf40', 14);
      }
      if (this.physics && this.physics.addPopup) {
        this.physics.addPopup(newCoin.x, newCoin.y + 18, 'ROYAL MINT: FREE GILD (2x)!', '#ffdf40', 1.1);
      }
      this.triggerRelicProcVisual('sovereign_mint');
    }

    const wasLastBagToken = Array.isArray(this.pouchBag) && this.pouchBag.length === 0;
    if (this.physics.overdriveTimer <= 0 && wasLastBagToken) {
      this.pouchReloadTimer = 0.55;
      this.physics.addPopup(340, 92, 'RESHUFFLING POUCH (0.6s)...', '#ffbf36', 0.7);
    }

    const nowSec = performance.now() / 1000;
    const elapsedSinceDrop = this.lastDropTime > 0 ? nowSec - this.lastDropTime : 0;
    this.lastDropTime = nowSec;

    if (this.relics.includes('combo_metronome') && elapsedSinceDrop <= 2.0) {
      this.boostCombo(0.25);
      this.triggerRelicProcVisual('combo_metronome');
    }

    this.handQueue.shift();
    this.handQueue.push(this.drawNextFromPouch());
    this.updateQueueUI();
    this.updateHUD();
    return true;
  }

  triggerRelicProcVisual(relicId) {
    window.obolAudio.playRelicProc();
    if (relicId === 'furnace_catcher') {
      this.unlockAchievement('stygian_ferryman');
      if (this.relics.includes('mercury_trough') && this.physics && Array.isArray(this.physics.coins)) {
        const rescued = this.physics.coins.find((c) => c && c.layer === 'shelf' && Math.abs(c.y - 176) <= 6);
        if (rescued) {
          const maxVal = window.getCoinMaxVal ? window.getCoinMaxVal(this, 1.2) : 65 + (this.quotaLevel - 1) * 50;
          rescued.value = Math.min(maxVal, (rescued.value || 10) + 25);
          rescued.gilded = true;
          if (this.physics.tokenSpriteCache) {
            this.physics.tokenSpriteCache.delete(rescued.uid);
          }
          if (this.physics.spawnRingParticles) {
            this.physics.spawnRingParticles(rescued.x, rescued.y, '#b8d8e8', 12);
          }
          if (this.physics.addPopup) {
            this.physics.addPopup(rescued.x, rescued.y - 14, 'QUICKSILVER TROUGH: +$25 & GILDED!', '#e6f7ff', 1.05);
          }
        }
      }
    }

    const targetIds = [relicId];
    if (relicId === 'furnace_catcher') {
      if (this.relics.includes('slag_return')) targetIds.push('slag_return');
      if (this.relics.includes('mercury_trough')) targetIds.push('mercury_trough');
    }
    targetIds.forEach((id) => {
      const badge = document.querySelector(`.relic-badge[data-relic-id="${id}"]`);
      if (badge) {
        badge.classList.remove('proc-bounce');
        void badge.offsetWidth;
        badge.classList.add('proc-bounce');
        setTimeout(() => badge.classList.remove('proc-bounce'), 320);
      }
    });
  }

  openReliquaryChest(coin) {
    const bonusCash = 35 + this.quotaLevel * 15;
    this.unlockAchievement('chest_hunter');
    const quotaComboCap = this.getQuotaComboCap();
    this.comboMult = Math.min(quotaComboCap, +(this.comboMult + 0.6).toFixed(2));
    this.physics.overdriveTimer = Math.max(this.physics.overdriveTimer, 6.0);
    // Spawn 2 Silver Drachmas onto the upper shelf
    for (let i = 0; i < 2; i++) {
      const sc = this.physics.spawnCoinOnBed(
        'silver_drachma',
        240 + i * 160,
        176,
        { bonusValue: this.globalCoinValueBonus },
        'shelf'
      );
      if (sc) sc.gilded = true;
    }
    // Grant a FREE unowned Contraband Relic if slot available, else +$45 Wallet
    const unownedRelics = Object.keys(window.RELIC_CATALOG || {}).filter((r) => !this.relics.includes(r));
    if (unownedRelics.length > 0 && this.relics.length < this.maxRelics) {
      this.shuffleArray(unownedRelics);
      const freeRelicId = unownedRelics[0];
      const rDef = window.RELIC_CATALOG[freeRelicId];
      this.relics.push(freeRelicId);
      this.updateRelicsUI();
      if (coin && this.physics) {
        this.physics.addPopup(
          coin.x,
          this.physics.lipY - 46,
          `CHEST: +$${bonusCash} + FREE ${rDef.name.toUpperCase()}!`,
          '#ffea85',
          1.15
        );
      }
    } else {
      this.wallet += 45;
      if (coin && this.physics) {
        this.physics.addPopup(
          coin.x,
          this.physics.lipY - 46,
          `CHEST: +$${bonusCash} CHUTE + $45 WALLET!`,
          '#ffea85',
          1.15
        );
      }
    }
    this.setCollectorQuote('"MY RELIQUARY LOCKBOX?! YOU LOOTED MY CONTRABAND VAULT!"');
    return bonusCash;
  }

  handleCoinScored(coin, fromSynergy) {
    return this.onCoinScored(coin, fromSynergy);
  }

  onCoinScored(coin, fromSynergy) {
    if (this.isAttractMode) {
      if (coin && this.physics) {
        this.physics.addPopup(coin.x, this.physics.lipY - 12, `+$${Math.round(coin.value || 10)}`, '#ffdf70', 1.0);
      }
      return 0;
    }
    const bossMod = this.getActiveBossModifier();
    const comboBoostMult = bossMod && bossMod.comboBoost ? bossMod.comboBoost : 1.0;
    const payoutBonusMult = bossMod && bossMod.payoutBonus ? bossMod.payoutBonus : 1.0;

    const maxAllowedCoinVal = 65 + (this.quotaLevel - 1) * 50;
    const baseCoinVal = Math.min(Math.max(1, coin.value || 10), maxAllowedCoinVal);
    const quotaComboCap = Math.min(32.0, 4.0 + (this.quotaLevel - 1) * 3.0);

    this.comboStreak++;
    if (coin.typeId === 'hellfire_ducat') {
      this.comboStreak++;
    }
    const comboWindow = this.relics.includes('combo_metronome') ? 2.25 : 1.55;
    this.comboTimer = Math.max(this.comboTimer, comboWindow);

    let coinValueMult = 1;
    let isChest = false;
    let chestBonusCash = 0;

    if (coin.typeId === 'reliquary_chest') {
      isChest = true;
      chestBonusCash = this.openReliquaryChest(coin);
    } else {
      this.comboMult = Math.min(quotaComboCap, +(this.comboMult + 0.10 * comboBoostMult).toFixed(2));
      if (coin.typeId === 'glass_sovereign' || coin.typeId === 'fragile') {
        coinValueMult = 3;
        this.physics.addPopup(coin.x, this.physics.lipY - 34, 'SOVEREIGN x3 VALUE!', '#99f6ff', 1.25);
      } else if (coin.typeId === 'sun_bullion' || coin.typeId === 'sun_coin') {
        this.comboMult = Math.min(quotaComboCap, +(this.comboMult + 0.5 * comboBoostMult).toFixed(2));
        this.physics.addPopup(coin.x, this.physics.lipY - 34, 'BULLION +x0.5 COMBO!', '#ffdf40', 1.2);
      } else if (coin.typeId === 'hellfire_ducat') {
        this.comboMult = Math.min(quotaComboCap, +(this.comboMult + 0.15 * comboBoostMult).toFixed(2));
        this.physics.addPopup(coin.x, this.physics.lipY - 34, 'HELLFIRE +1 STREAK!', '#ff5e1a', 1.12);
      }
    }

    this.comboMult = Math.min(quotaComboCap, this.comboMult);

    if (this.comboMult > this.maxComboThisRun) {
      this.maxComboThisRun = Math.min(32.0, this.comboMult);
    }
    if (this.comboMult >= 5.0) {
      this.unlockAchievement('combo_king');
    }

    let val = isChest
      ? chestBonusCash
      : Math.round(baseCoinVal * coinValueMult * this.comboMult * payoutBonusMult);

    if (!isChest && this.quotaLevel === 1) {
      val = Math.min(val, 42);
      if (this.chuteBank >= Math.round(this.quotaTarget * 1.65)) {
        val = Math.max(4, Math.round(val * 0.32));
      }
    } else if (!isChest && this.quotaLevel === 2) {
      val = Math.min(val, 45 + this.quotaLevel * 35);
    } else if (!isChest) {
      val = Math.min(val, Math.max(45 + this.quotaLevel * 35, Math.round(this.quotaTarget * 0.45)));
    }

    const payout = Math.max(1, val);
    if (payout >= 250) {
      this.unlockAchievement('high_value_coin');
    }

    this.chuteBank += payout;
    const baseMint = Math.min(12, Math.max(2, Math.round(baseCoinVal * 0.14)));
    const comboMint = Math.min(6, Math.floor(this.comboMult * 0.45));
    const surplusShare = baseMint + comboMint + (coin.gilded ? 2 : 0);
    this.wallet += surplusShare;
    this.totalEarnedRun += payout;

    this.triggerHudValuePop('bank-display');
    this.triggerHudValuePop('wallet-display');
    this.triggerHudValuePop('combo-mult-text');

    if (
      (payout >= 35 || isChest) &&
      this.physics &&
      this.physics.shaderPipeline &&
      typeof this.physics.shaderPipeline.triggerShockwave === 'function'
    ) {
      this.physics.shaderPipeline.triggerShockwave(
        Math.max(0.15, Math.min(0.85, (coin ? coin.x : 340) / ((this.physics && this.physics.width) || 680))),
        0.76
      );
    }

    const prestigePayout = Math.round(payout * this.getTormentPrestigeMultiplier(this.tormentTier));
    this.career.totalObols = Math.min(99999999, (this.career.totalObols || 0) + prestigePayout);
    if (this.comboMult > this.career.bestCombo) {
      this.career.bestCombo = Math.min(32.0, this.comboMult);
    }

    window.obolAudio.playScoreCoin(this.comboStreak);

    // Apply satisfying Game Feel (Hit-stop & Screen Shake) for big impacts
    if (this.physics && payout >= 40) {
      const shakeMag = Math.min(24, 6 + payout * 0.08);
      const hitStopDur = payout >= 100 ? 0.08 : 0.04;
      this.physics.addShake(shakeMag, 0.4);
      if (!isChest) this.hitStop(hitStopDur);
    }

    const popupColor = this.comboMult >= 4 ? '#ffdf40' : this.comboMult >= 2 ? '#ffbf36' : '#42e66c';
    const scale = Math.min(1.22, 1.0 + (this.comboMult - 1) * 0.06);
    if (this.physics.addScorePopup) {
      this.physics.addScorePopup(coin.x, this.physics.lipY - 12, payout, this.comboMult, popupColor, scale);
    } else {
      this.physics.addPopup(
        coin.x,
        this.physics.lipY - 12,
        `+${window.formatObolMoney(payout)}${this.comboMult > 1 ? ` (x${this.comboMult})` : ''}`,
        popupColor,
        scale
      );
    }

    if (this.chuteBank >= this.quotaTarget && !this.isPaused && !this.isAttractMode) {
      this.setCollectorQuote('"DEBT PAID... CASH OUT EARLY FOR INTEREST OR KEEP GREEDING."');
    }

    this.updateHUD();
  }

  handleCoinBurned(coin) {
    if (coin && coin.typeId === 'charon_barge' && this.physics && typeof this.physics.spawnCoinOnBed === 'function') {
      const maxVal = window.getCoinMaxVal ? window.getCoinMaxVal(this, 1.25) : 65 + (this.quotaLevel - 1) * 50;
      const hasTrough = this.relics.includes('mercury_trough');
      const warped = this.physics.spawnCoinOnBed(
        'charon_barge',
        210 + Math.random() * 260,
        176,
        { bonusValue: this.globalCoinValueBonus },
        'shelf'
      );
      if (warped) {
        warped.value = Math.min(maxVal, Math.max(warped.value, (coin.value || 55) + 35 + (hasTrough ? 25 : 0)));
        if (hasTrough || coin.gilded) {
          warped.gilded = true;
          if (this.physics.tokenSpriteCache) {
            this.physics.tokenSpriteCache.delete(warped.uid);
          }
        }
        if (this.physics.spawnRingParticles) {
          this.physics.spawnRingParticles(warped.x, warped.y, '#8cf5df', 14);
        }
        if (this.physics.addPopup) {
          this.physics.addPopup(
            warped.x,
            warped.y - 12,
            hasTrough ? "CHARON'S FERRY: WARP +$60 & GILDED!" : "CHARON'S FERRY: WARPED +$35!",
            '#8cf5df',
            1.1
          );
        }
      }
      if (hasTrough) {
        this.triggerRelicProcVisual('mercury_trough');
      }
      this.unlockAchievement('stygian_ferryman');
      this.updateHUD();
      return;
    }

    this.furnaceLostCount++;
    if (this.relics.includes('sacrificial_grate')) {
      this.wallet += 18;
      this.triggerHudValuePop('wallet-display');
      const quotaComboCap = this.getQuotaComboCap();
      this.comboMult = Math.min(quotaComboCap, +(this.comboMult + 0.35).toFixed(2));
      this.comboTimer = Math.max(this.comboTimer, 6.0);
      this.triggerHudValuePop('combo-mult-text');
      if (this.comboMult > this.maxComboThisRun) {
        this.maxComboThisRun = Math.min(32.0, this.comboMult);
      }
      if (this.comboMult >= 5.0) {
        this.unlockAchievement('combo_king');
      }
      this.triggerRelicProcVisual('sacrificial_grate');
      this.physics.addPopup(((this.physics && this.physics.width) || 680) / 2, 490, 'TITHE +$18 & +x0.35 COMBO!', '#42e66c', 1.05);
    }
    this.updateHUD();
  }

  clampBoardCoinValues() {
    if (!this.physics || !Array.isArray(this.physics.coins)) return;
    const handlers = window.TOKEN_MUTATION_HANDLERS || {};
    for (const c of this.physics.coins) {
      if (!c) continue;
      if (
        c.typeId === 'obsidian_mirror' &&
        !c._mirrorCopied &&
        handlers.obsidian_mirror &&
        typeof handlers.obsidian_mirror.onSpawn === 'function'
      ) {
        handlers.obsidian_mirror.onSpawn(c, this.physics, this);
      }
      const mult = c.isFusedMythic ? 1.5 : c.typeId === 'sun_bullion' ? 1.3 : c.typeId === 'parasite' ? 1.2 : 1.0;
      const maxVal = window.getCoinMaxVal
        ? window.getCoinMaxVal(this, mult)
        : Math.round((55 + (this.quotaLevel - 1) * 45) * mult);
      if (c.value > maxVal) {
        c.value = maxVal;
      }
    }
  }

  handlePushCycle(cycleCount) {
    if (this.physics && Array.isArray(this.physics.coins)) {
      const handlers = window.TOKEN_MUTATION_HANDLERS || {};
      const expansionPushTypes = [
        'alchemist_mercury',
        'hellfire_ducat',
        'quicksilver_sovereign',
        'infernal_juggernaut'
      ];
      for (const c of this.physics.coins) {
        if (!c || !expansionPushTypes.includes(c.typeId)) continue;
        const h = handlers[c.typeId];
        if (h && typeof h.onPushCycle === 'function') {
          h.onPushCycle(c, this.physics, this);
        }
        if (c.typeId === 'infernal_juggernaut') {
          this.triggerShaderShockwave(c.x, c.y);
        }
      }

      if (this.relics.includes('ossuary_dice')) {
        const diceCoins = this.physics.coins.filter((c) => c && c.typeId === 'necro_die');
        if (diceCoins.length > 0) {
          const maxVal = window.getCoinMaxVal ? window.getCoinMaxVal(this) : 55 + (this.quotaLevel - 1) * 45;
          diceCoins.forEach((dieCoin) => {
            if (handlers.necro_die && typeof handlers.necro_die.onPushCycle === 'function') {
              handlers.necro_die.onPushCycle(dieCoin, this.physics, this);
            }
            dieCoin.value = Math.min(maxVal, (dieCoin.value || 18) + 10);
            if (this.physics.addPopup) {
              this.physics.addPopup(dieCoin.x, dieCoin.y - 18, 'OSSUARY BONES: 2x ROLL +$10!', '#d4b8ff', 0.95);
            }
          });
          this.triggerRelicProcVisual('ossuary_dice');
        }
      }
    }

    this.clampBoardCoinValues();
    if (cycleCount % 5 === 0 && !this.isAttractMode) {
      const q = this.collectorQuotes[Math.floor(Math.random() * this.collectorQuotes.length)];
      this.setCollectorQuote(q);
    }
    this.updateHUD();
  }

  triggerCabinetSlam() {
    if (this.isPaused) return;

    const cutWire = this.relics.includes('cut_tilt_wire');
    const bossMod = this.getActiveBossModifier();
    const tiltMult = (bossMod && bossMod.tiltPenalty ? bossMod.tiltPenalty : 1.0) * this.getTormentTiltMultiplier();
    const tiltAdded = (cutWire ? 20 : 38) * tiltMult;
    if (cutWire) this.triggerRelicProcVisual('cut_tilt_wire');

    this.tiltGauge = Math.min(100, this.tiltGauge + tiltAdded);
    this.physics.slamCabinet(1.18);
    this.triggerShaderShockwave(340, 360);

    if (this.tiltGauge >= 100) {
      this.punishTiltOverload();
    }
    this.updateHUD();
  }

  triggerPenalty() {
    return this.punishTiltOverload();
  }

  triggerGuillotine() {
    return this.punishTiltOverload();
  }

  punishTiltOverload() {
    this.tiltGauge = 0;
    window.obolAudio.playTiltAlarm();
    window.obolAudio.playFingerSever();

    const flash = document.getElementById('blood-flash');
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 480);

    const fingerNames = ['INDEX FINGER', 'MIDDLE FINGER', 'RING FINGER'];
    const severedName = fingerNames[Math.max(0, this.fingers - 1)] || 'FINGER';
    this.fingers--;
    if (this.physics.triggerFingerSeverCutscene) {
      this.physics.triggerFingerSeverCutscene(severedName);
    }
    if (window.obolEngine3D && typeof window.obolEngine3D.triggerGuillotineCutscene3D === 'function') {
      window.obolEngine3D.triggerGuillotineCutscene3D(this.fingers);
    }
    this.updateFingerUI();
    this.setCollectorQuote('"YOU DARE TILT MY MACHINE?! A FINGER FOR THE FURNACE!"');

    if (this.fingers <= 0) {
      this.triggerGameOver("You severed all 3 fingers tilting the Collector's cabinet.");
    }
  }

  completeQuota() {
    if (this.isPaused) return;
    this.isPaused = true;
    window.obolAudio.playQuotaCleared();

    this.unlockAchievement('first_quota');
    if (this.quotaLevel >= 3) {
      this.unlockAchievement('boss_slayer');
    }
    if (this.quotaLevel >= 10) {
      this.unlockAchievement('abyssal_conqueror');
    }

    if (this.quotaLevel > this.career.bestQuota) {
      this.career.bestQuota = this.quotaLevel;
    }
    this.saveCareerStats();

    const timeBonus = Math.min(40, Math.floor(this.timeLeft * 0.22));
    const interestBonus = Math.min(35, Math.floor(this.wallet * 0.20));
    const overkillRatio = Math.max(0, (this.chuteBank - this.quotaTarget) / Math.max(50, this.quotaTarget));
    const overkillBonus = Math.min(30, Math.floor(overkillRatio * 10));
    const totalBonus = 30 + timeBonus + interestBonus + overkillBonus;
    this.wallet += totalBonus;
    this.pendingQuotaReward = { totalBonus, timeBonus, interestBonus, overkillBonus };

    if (this.quotaLevel === 9 && !this.endlessMode) {
      this.openVictoryModal(totalBonus, timeBonus, interestBonus);
    } else {
      this.openDraftModal(totalBonus, timeBonus, interestBonus);
    }
    this.updateHUD();
  }

  openVictoryModal(totalBonus, timeBonus, interestBonus) {
    const modal = document.getElementById('victory-modal');
    if (!modal) {
      this.openDraftModal(totalBonus, timeBonus, interestBonus);
      return;
    }
    const statsEl = document.getElementById('victory-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div>Final Boss Conquered: <strong class="gold-text">QUOTA #9 (THE COLLECTOR'S TITHE)</strong></div>
        <div>Total Obols Scored: <strong class="green-text">${this.formatHUDMoney(this.totalEarnedRun)}</strong></div>
        <div>Highest Chute Combo: <strong class="amber-text">x${this.maxComboThisRun.toFixed(1)}</strong></div>
        <div>Fingers Intact: <strong class="gold-text">${this.fingers} / 3</strong> &bull; Wallet: <strong class="green-text">${this.formatHUDMoney(this.wallet)}</strong></div>
        <div>Run Seed: <strong class="amber-text">${this.runSeed}</strong></div>
      `;
    }
    this.setCollectorQuote('"IMPOSSIBLE! MY LEDGER IS SHATTERED... TAKE YOUR FINGERS OR GAMBLE IN ENDLESS ANTE!"');
    modal.classList.remove('hidden');
  }

  openDraftModal(totalBonus, timeBonus, interestBonus) {
    const modal = document.getElementById('draft-modal');
    document.getElementById('draft-title').textContent = `QUOTA #${this.quotaLevel} SATISFIED!`;
    const okBonus = this.pendingQuotaReward && this.pendingQuotaReward.overkillBonus ? this.pendingQuotaReward.overkillBonus : 0;
    document.getElementById('draft-reward-summary').innerHTML =
      `<strong>SURVIVAL PAYOUT: +$${totalBonus} TO WALLET</strong> ` +
      `(Base $30 + Early Clock Bonus $${timeBonus} + 20% Interest [Max $35] $${interestBonus}` +
      `${okBonus > 0 ? ` + Overkill Bonus $${okBonus}` : ''})`;
    document.getElementById('modal-wallet-amount').textContent = `$${this.wallet}`;

    const tokenGrid = document.getElementById('draft-tokens-grid');
    tokenGrid.innerHTML = '';
    const tokenKeys = Object.keys(window.TOKEN_CATALOG).filter(
      (k) =>
        k !== 'copper_obol' &&
        !window.TOKEN_CATALOG[k].isFusedMythic &&
        !window.TOKEN_CATALOG[k].isPrizeTotem
    );
    this.shuffleArray(tokenKeys);
    const tokenChoices = tokenKeys.slice(0, 3);
    this.draftedTokenThisRound = false;

    tokenChoices.forEach((key) => {
      const def = window.TOKEN_CATALOG[key];
      const rarityLabel = String(def.rarity || 'Common').replace(/\b\w/g, (c) => c.toUpperCase());
      const card = document.createElement('div');
      card.className = 'draft-choice-card';
      card.innerHTML = `
        <div>
          <div class="draft-card-top">
            <span class="draft-card-icon">${def.icon}</span>
            <div>
              <div class="draft-card-title">${def.name}</div>
              <div style="font-size:0.68rem;color:#8c7b65">${rarityLabel} &bull; Base $${def.baseValue}</div>
            </div>
          </div>
          <div class="draft-card-desc">${def.desc}</div>
        </div>
        <button class="industrial-btn draft-pick-btn">DRAFT INTO POUCH (FREE)</button>
      `;
      card.querySelector('button').addEventListener('click', (e) => {
        if (this.draftedTokenThisRound) return;
        this.draftedTokenThisRound = true;
        this.pouch.push(def.id);
        this.pouch.push(def.id);
        if (Array.isArray(this.pouchBag)) {
          this.pouchBag.push(def.id, def.id);
          this.pouchDrawsLeft = this.pouchBag.length;
        } else {
          this.pouchDrawsLeft += 2;
        }
        window.obolAudio.playBuyItem();
        card.classList.add('selected');
        e.currentTarget.textContent = 'ADDED 2x TO POUCH';
        e.currentTarget.disabled = true;
        this.updateQueueUI();
      });
      tokenGrid.appendChild(card);
    });

    const relicGrid = document.getElementById('draft-relics-grid');
    relicGrid.innerHTML = '';
    const availableRelics = Object.keys(window.RELIC_CATALOG).filter((r) => !this.relics.includes(r));
    this.shuffleArray(availableRelics);
    const relicChoices = availableRelics.slice(0, 3);

    relicChoices.forEach((rKey) => {
      const rDef = window.RELIC_CATALOG[rKey];
      const card = document.createElement('div');
      card.className = 'draft-choice-card';
      const canBuy = this.wallet >= rDef.cost && this.relics.length < this.maxRelics;
      card.innerHTML = `
        <div>
          <div class="draft-card-top">
            <span class="draft-card-icon">${rDef.icon}</span>
            <div>
              <div class="draft-card-title">${rDef.name}</div>
              <div style="font-size:0.68rem;color:#39ff5a">Cost: $${rDef.cost}</div>
            </div>
          </div>
          <div class="draft-card-desc">${rDef.desc}</div>
        </div>
        <button class="industrial-btn relic-buy-btn" ${!canBuy ? 'disabled' : ''}>
          BOLT TO CABINET ($${rDef.cost})
        </button>
      `;
      card.querySelector('button').addEventListener('click', (e) => {
        if (this.wallet < rDef.cost || this.relics.length >= this.maxRelics || this.relics.includes(rDef.id)) return;
        this.wallet -= rDef.cost;
        this.relics.push(rDef.id);
        if (window.ObolSecurityShield) window.ObolSecurityShield.sealState(this);
        window.obolAudio.playBuyItem();
        card.classList.add('selected');
        e.currentTarget.textContent = 'BOLTED TO MACHINE';
        e.currentTarget.disabled = true;
        document.getElementById('modal-wallet-amount').textContent = `$${this.wallet}`;
        this.updateRelicsUI();
        this.updateHUD();
      });
      relicGrid.appendChild(card);
    });

    modal.classList.remove('hidden');
  }

  advanceToNextQuota() {
    document.getElementById('draft-modal').classList.add('hidden');
    this.quotaLevel++;
    this.bloodPactUsedThisQuota = false;

    if (this.quotaLevel >= 10) {
      this.unlockAchievement('abyssal_conqueror');
    }

    if (this.quotaLevel > this.career.bestQuota) {
      this.career.bestQuota = this.quotaLevel;
      this.saveCareerStats();
    }

    const bossMod = this.getActiveBossModifier();
    const mult = bossMod && bossMod.quotaMultiplier ? bossMod.quotaMultiplier : 1.0;
    const tormentMult = this.getTormentMultiplier(this.tormentTier);

    this.chuteBank = 0;
    this.quotaTarget = Math.round(150 * Math.pow(1.72, this.quotaLevel - 1) * mult * tormentMult);
    this.timeLeft = 180;
    this.pouchBag = [...this.pouch];
    this.shuffleArray(this.pouchBag);
    this.pouchDrawsLeft = this.pouchBag.length;
    this.pouchReloadTimer = 0;
    this.isPaused = false;

    for (let i = 0; i < 4; i++) {
      this.physics.spawnCoinOnBed('copper_obol', 180 + i * 100, 176, { bonusValue: this.globalCoinValueBonus }, 'shelf');
    }

    // Spawn a fresh Reliquary Prize Chest on the lower bed each new Quota!
    const hasChest = this.physics.coins.some((c) => c.typeId === 'reliquary_chest');
    if (!hasChest && this.physics.spawnReliquaryChest) {
      this.physics.spawnReliquaryChest(290 + Math.random() * 100, 278);
    }

    this.rollBlackMarket();
    this.updateBossBanner();
    this.setCollectorQuote(
      bossMod
        ? `"${bossMod.name}: ${bossMod.desc.toUpperCase()}"`
        : `"QUOTA #${this.quotaLevel}: I DEMAND $${this.quotaTarget} IN THE CHUTE!"`
    );
    this.updateQueueUI();
    this.updateHUD();
  }

  updateBossBanner() {
    const banner = document.getElementById('boss-banner');
    const bossMod = this.getActiveBossModifier();
    if (bossMod) {
      banner.textContent = `${bossMod.name} — ${bossMod.desc}`;
      banner.classList.remove('hidden');
      const bossNameUpper = String(bossMod.name || '').toUpperCase();
      if (bossNameUpper.includes('INQUISITOR')) {
        this.setCollectorQuote('"THE IRON INQUISITOR DEMANDS TITHE! CENTER PINS DEFY YOU, SINNER!"');
      } else if (bossNameUpper.includes('FURNACE') || bossNameUpper.includes('PYRE')) {
        this.setCollectorQuote('"THE MOLTEN FURNACE ROARS! OUTER OBOLS SHALL BURN TO SLAG!"');
      } else {
        this.setCollectorQuote(`"${bossMod.name.toUpperCase()}: ${String(bossMod.desc || '').toUpperCase()}"`);
      }
    } else {
      banner.classList.add('hidden');
      if (this.quotaLevel > 1) {
        this.setCollectorQuote(`"QUOTA #${this.quotaLevel} BEGINS. I DEMAND $${this.quotaTarget} IN THE CHUTE!"`);
      }
    }
  }

  rollBlackMarket() {
    const unownedRelics = Object.keys(window.RELIC_CATALOG).filter((r) => !this.relics.includes(r));
    this.shuffleArray(unownedRelics);

    const specialTokens = Object.keys(window.TOKEN_CATALOG).filter(
      (k) =>
        k !== 'copper_obol' &&
        !window.TOKEN_CATALOG[k].isFusedMythic &&
        !window.TOKEN_CATALOG[k].isPrizeTotem
    );
    this.shuffleArray(specialTokens);

    const offers = [];
    if (unownedRelics.length > 0) {
      const r = window.RELIC_CATALOG[unownedRelics[0]];
      offers.push({
        kind: 'relic',
        id: r.id,
        icon: window.ObolIcons ? window.ObolIcons.svg(r.id, 26) : r.icon,
        name: r.name,
        rawName: r.name,
        rarity: 'Relic',
        desc: r.desc,
        cost: r.cost
      });
    }
    for (let i = 0; i < 2; i++) {
      const t = window.TOKEN_CATALOG[specialTokens[i]];
      offers.push({
        kind: 'token',
        id: t.id,
        icon: window.ObolIcons ? window.ObolIcons.svg(t.id, 26) : t.icon,
        name: t.name,
        rawName: t.name,
        rarity: t.rarity || 'Common',
        baseValue: t.baseValue,
        desc: t.desc,
        cost: t.shopCost
      });
    }

    this.marketItems = offers;
    this.renderShop();
  }

  renderShop() {
    const outerContainer = document.getElementById('live-market-items');
    if (!outerContainer) return;
    let container = document.getElementById('shop-items');
    if (!container || !outerContainer.contains(container)) {
      outerContainer.innerHTML = '<div id="shop-items" class="shop-items-grid"></div>';
      container = document.getElementById('shop-items');
    } else {
      container.innerHTML = '';
    }

    this.marketItems.forEach((item, idx) => {
      const div = document.createElement('div');
      const rarityKey = String(item.rarity || (item.kind === 'relic' ? 'relic' : 'common'))
        .toLowerCase()
        .replace(/\s+/g, '-');
      div.className = `market-row shop-card vending-cartridge rarity-${rarityKey}${item.bought ? ' is-sold' : ''}`;
      const canAfford = this.wallet >= item.cost && !item.bought;

      const cleanTitle = String(item.rawName || item.name || '').replace(/\s*\(Drop Now \+ Pouch\)/i, '');
      const shortTag = this.getShortTacticalTag(item);
      const iconSvg = window.ObolIcons ? window.ObolIcons.svg(item.id, 26) : item.icon;
      const tooltipTag =
        item.kind === 'relic'
          ? `CONTRABAND RELIC • $${item.cost}`
          : `${String(item.rarity || 'TOKEN').toUpperCase()} • DROP + POUCH • $${item.cost}`;

      if (typeof div.setAttribute === 'function') {
        div.setAttribute('data-tooltip-title', cleanTitle);
        div.setAttribute('data-tooltip-tag', tooltipTag);
        div.setAttribute('data-tooltip-desc', item.desc || '');
      }

      const bayLabel = item.kind === 'relic' ? 'CONTRABAND RIG' : `${String(item.rarity || 'TOKEN').toUpperCase()} • +POUCH`;
      div.innerHTML = `
        <div class="market-row-left cartridge-left">
          <div class="market-row-icon cartridge-well rarity-ring-${rarityKey}">${iconSvg}</div>
          <div class="market-row-text cartridge-center">
            <div class="cartridge-bay-label">${bayLabel}</div>
            <div class="market-row-name cartridge-title">${cleanTitle}</div>
            <div class="market-row-desc cartridge-tag">${shortTag}</div>
          </div>
        </div>
        <button class="buy-market-btn cartridge-buy-btn" data-market-idx="${idx}" ${!canAfford ? 'disabled' : ''}>
          ${item.bought ? 'SOLD' : `$${item.cost}`}
        </button>
      `;

      const btn = div.querySelector('button');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.wallet < item.cost || item.bought || this.isPaused) return;
        this.wallet -= item.cost;
        item.bought = true;
        if (window.ObolSecurityShield) window.ObolSecurityShield.sealState(this);
        div.classList.add('is-sold');
        window.obolAudio.playBuyItem();

        if (item.kind === 'relic') {
          if (this.relics.length < this.maxRelics) {
            this.relics.push(item.id);
            this.updateRelicsUI();
          }
        } else {
          this.pouch.push(item.id);
          if (Array.isArray(this.pouchBag)) {
            this.pouchBag.push(item.id);
            this.pouchDrawsLeft = this.pouchBag.length;
          } else {
            this.pouchDrawsLeft += 1;
          }
          this.physics.spawnCoinOnBed(
            item.id,
            340 + (Math.random() * 60 - 30),
            188,
            { bonusValue: this.globalCoinValueBonus },
            'shelf'
          );
          this.updateQueueUI();
        }
        this.updateBlackMarketAffordability();
        this.updateHUD();
      });

      container.appendChild(div);
    });
  }

  renderBlackMarket() {
    return this.renderShop();
  }

  updateBlackMarketAffordability() {
    const container = document.getElementById('live-market-items');
    if (!container) return;
    const buttons = container.querySelectorAll('.buy-market-btn');
    if (buttons.length !== this.marketItems.length) {
      this.renderBlackMarket();
      return;
    }
    buttons.forEach((btn, idx) => {
      const item = this.marketItems[idx];
      if (!item) return;
      const canAfford = this.wallet >= item.cost && !item.bought;
      const label = item.bought ? 'SOLD' : `$${item.cost}`;
      if (btn.disabled !== !canAfford) {
        btn.disabled = !canAfford;
      }
      if (btn.textContent.trim() !== label) {
        btn.textContent = label;
      }
    });
  }

  openPouchInspector() {
    return this.openPouchModal();
  }

  openPouchModal() {
    this.isPaused = true;
    const grid = document.getElementById('pouch-grid') || document.getElementById('pouch-inspector-grid');
    const outerGrid = document.getElementById('pouch-inspector-grid');
    if (outerGrid && grid && outerGrid !== grid && !outerGrid.contains(grid)) {
      outerGrid.innerHTML = '';
      outerGrid.appendChild(grid);
    }
    if (grid) {
      grid.innerHTML = '';
    }

    const counts = {};
    for (const id of this.pouch) {
      counts[id] = (counts[id] || 0) + 1;
    }

    const inBagCounts = {};
    const activeBag = Array.isArray(this.pouchBag) ? this.pouchBag : [];
    for (const id of activeBag) {
      inBagCounts[id] = (inBagCounts[id] || 0) + 1;
    }

    const brands = window.TOKEN_BRANDS || {};
    Object.keys(counts).forEach((id) => {
      const count = counts[id];
      const def = window.TOKEN_CATALOG[id];
      if (!def) return;
      const activeBrandId = this.tokenBrands ? this.tokenBrands[id] : null;
      const activeBrandDef = activeBrandId ? brands[activeBrandId] : null;
      const div = document.createElement('div');
      div.className = 'pouch-item-card';
      div.style.flexDirection = 'column';
      div.style.alignItems = 'stretch';

      const brandPillHtml = activeBrandDef
        ? `<span class="brand-tag-pill" style="border-color:${activeBrandDef.color};color:${activeBrandDef.color}">${activeBrandDef.icon} ${activeBrandDef.name}</span>`
        : '';

      let effectiveBase = def.baseValue + this.globalCoinValueBonus;
      if (activeBrandId === 'gilded') effectiveBase *= 2;
      else if (activeBrandId === 'heavy') effectiveBase += 15;

      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.5rem">${def.icon}</span>
          <div>
            <div style="font-size:0.8rem;font-weight:bold;color:#ffbf36">${def.name}${brandPillHtml}</div>
            <div style="font-size:0.65rem;color:#8c7b65">Base $${effectiveBase}${activeBrandDef ? ` • ${activeBrandDef.desc}` : ''}</div>
            <div class="pouch-bag-stats">
              <span class="pouch-owned-pill">OWNED: x${count}</span>
              <span class="pouch-inbag-pill">IN BAG: ${inBagCounts[id] || 0}/${count}</span>
            </div>
          </div>
        </div>
        <div class="brand-btn-row"></div>
      `;

      const btnRow = div.querySelector('.brand-btn-row');
      Object.values(brands).forEach((bDef) => {
        const isCurrent = activeBrandId === bDef.id;
        const canAfford = this.wallet >= bDef.cost && !isCurrent;
        const btn = document.createElement('button');
        btn.className = `brand-mini-btn ${isCurrent ? 'active-brand' : ''}`;
        btn.disabled = !canAfford;
        btn.title = `${bDef.name}: ${bDef.desc}`;
        btn.innerHTML = isCurrent
          ? `${bDef.icon} ${bDef.name.toUpperCase()} [EQUIPPED]`
          : `${bDef.icon} ${bDef.name} ($${bDef.cost})`;
        btn.addEventListener('click', () => {
          this.brandTokenClass(id, bDef.id);
        });
        btnRow.appendChild(btn);
      });

      if (grid) {
        grid.appendChild(div);
      }
    });

    const smeltBtn = document.getElementById('smelt-obol-btn');
    if (smeltBtn) {
      const hasCopper = (counts.copper_obol || 0) > 0;
      smeltBtn.disabled = !hasCopper || this.wallet < 25;
      const fireSvg = window.ObolIcons ? window.ObolIcons.svg('fire', 15) : '';
      smeltBtn.innerHTML = `<span>${fireSvg} SMELT 1 COPPER OBOL &amp; BUFF ALL COINS +$4 ($25) [CURRENT BONUS: +$${this.globalCoinValueBonus}]</span>`;
    }

    document.getElementById('pouch-modal').classList.remove('hidden');
  }

  switchGrimoireTab(tabId = 'ach') {
    const tabs = document.querySelectorAll('#grimoire-modal .grimoire-tab');
    tabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    const panes = document.querySelectorAll('#grimoire-modal .grimoire-tab-pane');
    panes.forEach((pane) => {
      const isMatch = pane.dataset.pane === tabId;
      pane.classList.toggle('active', isMatch);
      pane.style.display = isMatch ? 'block' : 'none';
    });
  }

  openGrimoireModal(defaultTab = 'ach') {
    this.isPaused = true;
    const unlocked = (this.career && this.career.achievements) || [];
    const achCatalog = window.ACHIEVEMENT_CATALOG || [];

    const countEl = document.getElementById('grimoire-ach-count');
    if (countEl) {
      countEl.textContent = `${unlocked.length} / ${achCatalog.length} (+$${unlocked.length * 5} STARTING WALLET)`;
    }

    const achGrid = document.getElementById('grimoire-ach-grid');
    if (achGrid) {
      achGrid.innerHTML = '';
      achCatalog.forEach((ach) => {
        const isUnlocked = unlocked.includes(ach.id);
        const div = document.createElement('div');
        div.className = `pouch-item-card grimoire-card ${isUnlocked ? 'ach-card-unlocked' : 'ach-card-locked'}`;
        const lockSvg = window.ObolIcons ? window.ObolIcons.svg('lock', 20) : 'LOCKED';
        div.innerHTML = `
          <span style="font-size:1.5rem">${isUnlocked ? ach.icon : lockSvg}</span>
          <div>
            <div style="font-size:0.78rem;font-weight:bold;color:${isUnlocked ? '#42e66c' : '#998a78'}">${ach.name}</div>
            <div style="font-size:0.65rem;color:#e6dac8">${ach.desc}</div>
          </div>
        `;
        achGrid.appendChild(div);
      });
    }

    const fusGrid = document.getElementById('grimoire-fusion-grid') || document.getElementById('grimoire-fusions-grid');
    if (fusGrid) {
      fusGrid.innerHTML = '';
      (window.FUSION_RECIPES || []).forEach((rec) => {
        const resDef = window.TOKEN_CATALOG && window.TOKEN_CATALOG[rec.result];
        if (!resDef) return;
        const div = document.createElement('div');
        div.className = 'pouch-item-card grimoire-card';
        div.innerHTML = `
          <span style="font-size:1.6rem">${resDef.icon}</span>
          <div>
            <div style="font-size:0.78rem;font-weight:bold;color:#00f5d4">${resDef.name} (Base $${resDef.baseValue})</div>
            <div class="fusion-recipe-formula">${rec.formulaText || rec.formula}</div>
            <div style="font-size:0.63rem;color:#c7b8a3">${resDef.desc}</div>
          </div>
        `;
        fusGrid.appendChild(div);
      });
    }

    const tokGrid = document.getElementById('grimoire-token-grid') || document.getElementById('grimoire-tokens-grid');
    if (tokGrid) {
      tokGrid.innerHTML = '';
      Object.values(window.TOKEN_CATALOG || {}).forEach((def) => {
        const div = document.createElement('div');
        div.className = 'pouch-item-card grimoire-card';
        div.innerHTML = `
          <span style="font-size:1.5rem">${def.icon}</span>
          <div>
            <div style="font-size:0.78rem;font-weight:bold;color:#ffbf36">${def.name} ($${def.baseValue})</div>
            <div style="font-size:0.63rem;color:#c7b8a3">${def.desc}</div>
          </div>
        `;
        tokGrid.appendChild(div);
      });
    }

    const relGrid = document.getElementById('grimoire-relic-grid') || document.getElementById('grimoire-relics-grid');
    if (relGrid) {
      relGrid.innerHTML = '';
      Object.values(window.RELIC_CATALOG || {}).forEach((def) => {
        const div = document.createElement('div');
        div.className = 'pouch-item-card grimoire-card';
        div.innerHTML = `
          <span style="font-size:1.5rem">${def.icon}</span>
          <div>
            <div style="font-size:0.78rem;font-weight:bold;color:#39ff5a">${def.name} ($${def.cost})</div>
            <div style="font-size:0.63rem;color:#c7b8a3">${def.desc}</div>
          </div>
        `;
        relGrid.appendChild(div);
      });
    }

    this.switchGrimoireTab(defaultTab || 'ach');
    document.getElementById('grimoire-modal').classList.remove('hidden');
  }

  triggerGameOver(reason) {
    this.isPaused = true;
    window.obolAudio.playGameOver();
    this.saveCareerStats();

    document.getElementById('gameover-title').textContent = 'CONSUMED BY THE FURNACE';
    document.getElementById('gameover-reason').textContent = reason;
    document.getElementById('gameover-stats').innerHTML = `
      <div>Quotas Survived: <strong class="gold-text">${this.quotaLevel - 1}</strong></div>
      <div>Total Obols Scored: <strong class="green-text">${this.formatHUDMoney(this.totalEarnedRun)}</strong></div>
      <div>Highest Combo Chain: <strong class="amber-text">x${this.maxComboThisRun.toFixed(1)}</strong></div>
      <div>Coins Lost to Furnace: <strong class="red-text">${this.furnaceLostCount}</strong></div>
      <div>Run Seed: <strong class="amber-text">${this.runSeed}</strong></div>
    `;
    document.getElementById('gameover-modal').classList.remove('hidden');
  }

  toggleTheater3DMode(forceState) {
    this.theater3DMode =
      typeof forceState === 'boolean' ? forceState : !this.theater3DMode;
    const isActive = Boolean(this.theater3DMode);
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('theater-3d-mode', isActive);
      document.body.classList.toggle('theater-3d-active', isActive);
      const btn = document.getElementById('btn-theater-3d');
      if (btn) {
        btn.classList.toggle('active', isActive);
      }
      if (isActive) {
        const presetBtns = document.querySelectorAll('#camera-view-bar .cam-preset-btn');
        presetBtns.forEach((b) => b.classList.remove('active'));
      }
    }
    if (typeof window !== 'undefined' && window.obolEngine3D) {
      if (typeof window.obolEngine3D.setCameraPreset === 'function') {
        window.obolEngine3D.setCameraPreset(isActive ? 'theater' : 'playfield');
      }
      if (typeof window.obolEngine3D.resize === 'function') {
        window.obolEngine3D.resize();
      }
    }
    return this.theater3DMode;
  }

  setCollectorQuote(text) {
    const el = document.getElementById('collector-quote');
    const changed = el && el.textContent !== text;
    if (el) el.textContent = text;
    if (changed) {
      if (typeof window !== 'undefined' && window.obolEngine3D && typeof window.obolEngine3D.triggerCollectorSpeech === 'function') {
        window.obolEngine3D.triggerCollectorSpeech(1.4, 'taunt');
      }
      if (typeof window !== 'undefined' && window.obolAudio) {
        if (typeof window.obolAudio.playCollectorChatter === 'function') {
          window.obolAudio.playCollectorChatter(4, 'taunt');
        }
        if (typeof window.obolAudio.playCollectorFingerTap === 'function') {
          window.obolAudio.playCollectorFingerTap(0);
        }
      }
    }
  }

  updateFingerUI() {
    const labels = ['L-INDEX', 'L-MID', 'L-RING'];
    const slots = document.querySelectorAll('.finger-box, .finger-slot');
    slots.forEach((slot, i) => {
      const iconEl = slot.querySelector('.finger-icon, .finger-graphic');
      const labelEl = slot.querySelector('.finger-label');
      if (i < this.fingers) {
        slot.classList.add('intact');
        slot.classList.remove('severed');
        if (iconEl) iconEl.innerHTML = window.ObolIcons ? window.ObolIcons.svg('finger', 18) : 'I';
        if (labelEl) labelEl.textContent = labels[i] || `FINGER ${i + 1}`;
      } else {
        slot.classList.remove('intact');
        slot.classList.add('severed');
        if (iconEl) iconEl.innerHTML = window.ObolIcons ? window.ObolIcons.svg('severed', 18) : 'X';
        if (labelEl) labelEl.textContent = 'SEVERED';
      }
    });
    const countLabel = document.getElementById('fingers-count-label');
    if (countLabel) {
      countLabel.textContent = `${this.fingers} / 3 INTACT`;
    }
  }

  renderRelicBar() {
    const outerList = document.getElementById('relics-list');
    if (!outerList) return;
    let grid = document.getElementById('contraband-slot-list');
    if (!grid || !outerList.contains(grid)) {
      outerList.innerHTML = '<div id="contraband-slot-list" class="contraband-socket-grid"></div>';
      grid = document.getElementById('contraband-slot-list');
    } else {
      grid.innerHTML = '';
    }

    const countEl = document.getElementById('relic-slots-count');
    if (countEl) {
      countEl.textContent = `${this.relics.length} / ${this.maxRelics}`;
    }
    if (this.relics.length >= 4) {
      this.unlockAchievement('full_rig');
    }
    if (this.relics.length >= 6) {
      this.unlockAchievement('royal_minter');
    }

    const totalSlots = this.maxRelics || 6;
    for (let i = 0; i < totalSlots; i++) {
      const rId = this.relics[i];
      const slotEl = document.createElement('div');
      if (rId && window.RELIC_CATALOG && window.RELIC_CATALOG[rId]) {
        const def = window.RELIC_CATALOG[rId];
        const iconSvg = window.ObolIcons ? window.ObolIcons.svg(rId, 24) : def.icon;
        slotEl.className = 'relic-badge relic-socket filled';
        slotEl.dataset.relicId = rId;
        if (typeof slotEl.setAttribute === 'function') {
          slotEl.setAttribute('data-tooltip-title', def.name);
          slotEl.setAttribute('data-tooltip-tag', `SOCKET #0${i + 1} • ACTIVE RIG`);
          slotEl.setAttribute('data-tooltip-desc', def.desc);
        }
        slotEl.innerHTML = `
          <div class="relic-socket-top">
            <div class="relic-icon relic-socket-well">${iconSvg}</div>
            <span class="relic-socket-code">RIG #0${i + 1}</span>
            <span class="socket-led active"></span>
          </div>
          <div class="relic-meta relic-socket-meta">
            <div class="relic-title">${def.name}</div>
          </div>
        `;
      } else {
        const lockSvg = window.ObolIcons ? window.ObolIcons.svg('lock', 14) : '';
        slotEl.className = 'relic-socket empty';
        slotEl.dataset.slotIndex = String(i);
        if (typeof slotEl.setAttribute === 'function') {
          slotEl.setAttribute('data-tooltip-title', `EMPTY SOCKET #0${i + 1}`);
          slotEl.setAttribute('data-tooltip-tag', 'UNOCCUPIED MOUNT');
          slotEl.setAttribute(
            'data-tooltip-desc',
            'Recessed cast-iron mounting bracket. Survive a Quota or purchase Contraband in the Black-Market Slot below to bolt a permanent hardware rig into this socket.'
          );
        }
        slotEl.innerHTML = `
          <div class="relic-socket-top">
            <div class="relic-socket-well empty-well">${lockSvg}</div>
            <span class="relic-socket-code empty-code">SLOT #0${i + 1}</span>
            <span class="socket-led"></span>
          </div>
          <div class="relic-socket-meta">
            <div class="relic-socket-empty-title">EMPTY SOCKET</div>
          </div>
        `;
      }
      grid.appendChild(slotEl);
    }
  }

  updateRelicsUI() {
    return this.renderRelicBar();
  }

  updateHandUI() {
    const pouchCountText =
      this.pouchReloadTimer > 0
        ? `RELOAD ${this.pouchReloadTimer.toFixed(1)}s`
        : `${this.pouchDrawsLeft}/${this.pouch.length}`;
    const pouchSizeEl = document.getElementById('pouch-size');
    if (pouchSizeEl) pouchSizeEl.textContent = pouchCountText;

    const currentDef = window.TOKEN_CATALOG[this.handQueue[0]] || window.TOKEN_CATALOG.copper_obol;
    const brandId = this.tokenBrands ? this.tokenBrands[this.handQueue[0]] : null;
    const bDef = brandId && window.TOKEN_BRANDS ? window.TOKEN_BRANDS[brandId] : null;
    const brandTag = bDef ? ` [${bDef.name.toUpperCase()}]` : '';

    const iconEl = document.getElementById('next-token-icon');
    if (iconEl) {
      iconEl.innerHTML = window.ObolIcons ? window.ObolIcons.svg(currentDef.id, 26) : currentDef.icon;
    }

    const nameEl = document.getElementById('next-token-name');
    if (nameEl) {
      nameEl.textContent = `${currentDef.name}${brandTag}${this.globalCoinValueBonus > 0 ? ` (+$${this.globalCoinValueBonus})` : ''}`;
    }

    const statPillText = this.getHandTokenStatPill(currentDef, bDef);
    const nextDescEl = document.getElementById('next-token-desc');
    const handDescEl = document.getElementById('hand-token-desc');
    if (handDescEl && nextDescEl && nextDescEl.contains(handDescEl)) {
      handDescEl.textContent = statPillText;
    } else {
      if (nextDescEl) nextDescEl.textContent = statPillText;
      if (handDescEl) handDescEl.textContent = statPillText;
    }

    const fullTooltipTitle = `${currentDef.name}${brandTag}`;
    const fullTooltipTag = `${String(currentDef.rarity || 'TOKEN').toUpperCase()} • IN HAND [R TO SWAP]`;
    const fullTooltipDesc = `${currentDef.desc}${bDef ? ` [${bDef.name}: ${bDef.desc}]` : ''}`;

    ['next-token-card', 'hand-token-card'].forEach((cardId) => {
      const cardEl = document.getElementById(cardId);
      if (cardEl && typeof cardEl.setAttribute === 'function') {
        cardEl.setAttribute('data-tooltip-title', fullTooltipTitle);
        cardEl.setAttribute('data-tooltip-tag', fullTooltipTag);
        cardEl.setAttribute('data-tooltip-desc', fullTooltipDesc);
      }
    });

    const upcomingEl = document.getElementById('upcoming-queue');
    if (upcomingEl) {
      upcomingEl.innerHTML = '';
      for (let i = 1; i < this.handQueue.length; i++) {
        const def = window.TOKEN_CATALOG[this.handQueue[i]] || window.TOKEN_CATALOG.copper_obol;
        const chip = document.createElement('div');
        chip.className = 'upcoming-pill upcoming-chip';
        if (typeof chip.setAttribute === 'function') {
          chip.setAttribute('data-tooltip-title', def.name);
          chip.setAttribute('data-tooltip-tag', `QUEUE #${i} • CLICK TO SWAP`);
          chip.setAttribute('data-tooltip-desc', def.desc);
        }
        chip.innerHTML = window.ObolIcons ? window.ObolIcons.svg(def.id, 17) : def.icon;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          this.swapHandToken(i);
        });
        upcomingEl.appendChild(chip);
      }
    }
  }

  updateQueueUI() {
    return this.updateHandUI();
  }

  updateHUD() {
    if (this.quotaLevel >= 10 && !this.isAttractMode) {
      this.unlockAchievement('abyssal_conqueror');
    }
    const actBadgeEl = document.getElementById('act-badge');
    if (actBadgeEl) {
      if (this.quotaLevel >= 10) {
        actBadgeEl.textContent = `ACT IV • QUOTA #${this.quotaLevel}`;
      } else if (this.tormentTier > 0) {
        actBadgeEl.textContent = `QUOTA #${this.quotaLevel} • T${this.tormentTier}`;
      } else {
        actBadgeEl.textContent = `QUOTA #${this.quotaLevel}`;
      }
    }
    document.getElementById('bank-display').textContent = this.formatHUDMoney(this.chuteBank);
    document.getElementById('quota-display').textContent = this.formatHUDMoney(this.quotaTarget);
    document.getElementById('wallet-display').textContent = this.formatHUDMoney(this.wallet);

    const pouchCountText =
      this.pouchReloadTimer > 0
        ? `RELOAD ${this.pouchReloadTimer.toFixed(1)}s`
        : `${this.pouchDrawsLeft}/${this.pouch.length}`;
    const pouchSizeEl = document.getElementById('pouch-size');
    if (pouchSizeEl) pouchSizeEl.textContent = pouchCountText;

    const pct = Math.min(100, Math.floor((this.chuteBank / this.quotaTarget) * 100));
    document.getElementById('quota-bar').style.width = `${pct}%`;
    document.getElementById('quota-pct').textContent = `${pct}% OF DEBT PAID`;

    const payBtn = document.getElementById('pay-quota-btn');
    payBtn.disabled = this.chuteBank < this.quotaTarget;

    const pactBtn = document.getElementById('blood-pact-btn');
    if (pactBtn) {
      if (pactBtn.disabled !== this.bloodPactUsedThisQuota) {
        pactBtn.disabled = this.bloodPactUsedThisQuota;
      }
      const stateKey = this.bloodPactUsedThisQuota ? 'sealed' : 'open';
      if (pactBtn.dataset.pactState !== stateKey) {
        pactBtn.dataset.pactState = stateKey;
        const bloodSvg = window.ObolIcons ? window.ObolIcons.svg('BLOOD', 15) : '';
        const spanEl = pactBtn.querySelector('span');
        if (spanEl) {
          spanEl.innerHTML = this.bloodPactUsedThisQuota
            ? `${bloodSvg} BLOOD PACT SEALED THIS QUOTA`
            : `${bloodSvg} BLOOD PACT (+5 TOKENS / +40% TILT)`;
        }
      }
    }

    const mins = Math.floor(this.timeLeft / 60);
    const secs = Math.floor(this.timeLeft % 60);
    document.getElementById('timer-display').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    document.getElementById('combo-mult-text').textContent = `x${this.comboMult.toFixed(1)}`;
    document.getElementById('combo-streak-text').textContent = `${this.comboStreak} COINS`;
    const maxComboWindow = this.relics.includes('combo_metronome') ? 2.95 : 2.25;
    document.getElementById('combo-timer-fill').style.width = `${Math.min(100, (this.comboTimer / maxComboWindow) * 100)}%`;

    const comboHud = document.getElementById('combo-hud');
    if (this.comboMult >= 3.0 || this.physics.overdriveTimer > 0) {
      comboHud.classList.add('fever');
    } else {
      comboHud.classList.remove('fever');
    }

    const tiltInt = Math.round(this.tiltGauge);
    document.getElementById('tilt-pct-text').textContent = `${tiltInt}%`;
    document.getElementById('tilt-meter-fill').style.width = `${tiltInt}%`;

    const teeterCount = this.physics.coins.filter((c) => c.isTeetering).length;
    document.getElementById('stat-bed-coins').textContent = this.physics.coins.length;
    document.getElementById('stat-teeter-coins').textContent = teeterCount;
    document.getElementById('stat-furnace-lost').textContent = this.furnaceLostCount;
    document.getElementById('stat-push-count').textContent = `#${this.physics.pushCycleCount}`;
    document.getElementById('stat-best-combo').textContent = `x${this.maxComboThisRun.toFixed(1)}`;

    this.updateBlackMarketAffordability();
  }

  hitStop(duration) {
    this.freezeTimer = Math.max(this.freezeTimer || 0, duration);
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
      // Skip physics update during hit-stop (freeze frame)
    } else if (this.isAttractMode) {
      if (typeof this.attractDropTimer !== 'number') {
        this.attractDropTimer = 1.25;
      }
      this.attractDropTimer -= dt;
      if (this.attractDropTimer <= 0 && this.physics.coins.length < 56) {
        this.attractDropTimer = 0.85;
        const attractPool = ['copper_obol', 'silver_drachma', 'sun_bullion', 'emerald_serpent', 'lodestone'];
        const pick = attractPool[Math.floor(Math.random() * attractPool.length)];
        const sweepX = 340 + Math.sin(now * 0.0021) * 165;
        this.physics.dropToken(pick, sweepX, 0);
      }
      this.physics.update(dt);
      this.clampBoardCoinValues();
    } else if (!this.isPaused) {
      if (this.isPointerDown && this.physics.dropCooldown <= 0) {
        this.tryDropCurrentToken(this.physics.aimX);
      }

      this.physics.update(dt);
      this.clampBoardCoinValues();

      if (this.pouchReloadTimer > 0) {
        this.pouchReloadTimer = Math.max(0, this.pouchReloadTimer - dt);
        if (this.pouchReloadTimer <= 0) {
          if (!Array.isArray(this.pouchBag) || this.pouchBag.length === 0) {
            this.pouchBag = [...this.pouch];
            this.shuffleArray(this.pouchBag);
          }
          this.pouchDrawsLeft = Math.max(1, this.pouchBag.length);
          this.updateQueueUI();
          this.updateHUD();
        }
      }

      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) {
        if (this.chuteBank >= this.quotaTarget) {
          this.completeQuota();
        } else {
          const fingerNames = ['INDEX FINGER', 'MIDDLE FINGER', 'RING FINGER'];
          const severedName = fingerNames[Math.max(0, this.fingers - 1)] || 'FINGER';
          this.fingers--;
          if (window.ObolSecurityShield) window.ObolSecurityShield.sealState(this);
          if (this.physics.triggerFingerSeverCutscene) {
            this.physics.triggerFingerSeverCutscene(severedName);
          }
          this.updateFingerUI();
          window.obolAudio.playFingerSever();
          if (this.fingers <= 0) {
            this.triggerGameOver('Time expired and you had no fingers left to pay the Collector.');
          } else {
            this.timeLeft = 65;
            this.setCollectorQuote('"TIME EXPIRED! I TAKE ONE FINGER FOR +65 SECONDS OF BORROWED TIME!"');
          }
        }
      }

      if (this.comboTimer > 0) {
        this.comboTimer = Math.max(0, this.comboTimer - dt);
        if (this.comboTimer === 0) {
          this.comboMult = 1.0;
          this.comboStreak = 0;
        }
      }

      if (this.tiltGauge > 0) {
        const coolRate = this.relics.includes('cut_tilt_wire') ? 7.8 : 5.2;
        this.tiltGauge = Math.max(0, this.tiltGauge - dt * coolRate);
      }

      this._loopTick = (this._loopTick || 0) + 1;
      if (this._loopTick % 3 === 0) {
        const eyeOffset = ((this.physics.aimX - 340) / 340) * 6;
        const leftEye = document.getElementById('eye-left');
        const rightEye = document.getElementById('eye-right');
        if (leftEye && rightEye) {
          leftEye.style.transform = `translateX(${eyeOffset}px)`;
          rightEye.style.transform = `translateX(${eyeOffset}px)`;
        }
        this.updateHUD();
      }
    }

    if (this.audio && this.audio.initialized && (this._loopTick || 0) % 3 === 0) {
      this.audio.updatePistonAudio(
        this.physics.shelfPhase,
        this.physics.shelfVelY,
        this.physics.overdriveTimer > 0,
        this.tiltMeter / 100
      );
      if (this.audio.updateAdaptiveMusic) {
        this.audio.updateAdaptiveMusic(
          this.comboMult || 1.0,
          this.physics.overdriveTimer > 0,
          this.tiltMeter / 100,
          this.quotaLevel >= 3 && this.quotaLevel % 3 === 0
        );
      }
      if (this.tiltGauge >= 60 && typeof this.audio.playHeartbeat === 'function') {
        this._heartbeatTimer = (this._heartbeatTimer || 0) - dt * 3;
        if (this._heartbeatTimer <= 0) {
          this._heartbeatTimer = Math.max(0.45, 0.95 - ((this.tiltGauge - 60) / 40) * 0.45);
          this.audio.playHeartbeat(this.tiltGauge / 100);
        }
      }
    }

    const nextDef = window.TOKEN_CATALOG[this.handQueue[0]] || window.TOKEN_CATALOG.copper_obol;
    this.physics.render(nextDef);

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = window.obolGame = new ObolGame();
  if (window.ObolSecurityShield && typeof window.ObolSecurityShield.attachToGame === 'function') {
    window.ObolSecurityShield.attachToGame(window.obolGame);
  }
});
