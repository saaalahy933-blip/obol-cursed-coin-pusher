/**
 * OBOL: The Cursed Coin Pusher
 * Custom 2.5D/3D Coin Pusher Physics Engine, Diegetic Mechanical Collector,
 * Spatial-Hash O(N) Broadphase + Background Web Worker 3D Rigid-Body Co-Processor,
 * Multi-Pass Piston-to-Pile Contact Chain Solver, Blender 5.2 PBR 3D Asset Renderer,
 * Moving Skill-Shot Bonus Gate, Brass Capstan Bumpers, Right-Click Coin Flick, & VFX
 */

class SpatialHashGrid {
  constructor(cellSize = 48) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.queryCount = 0;
  }

  clear() {
    this.cells.clear();
  }

  _key(cx, cy) {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  rebuild(coins) {
    this.cells.clear();
    const inv = 1 / this.cellSize;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c) continue;
      const cx = Math.floor(c.x * inv);
      const cy = Math.floor(c.y * inv);
      const k = this._key(cx, cy);
      let bucket = this.cells.get(k);
      if (!bucket) {
        bucket = [];
        this.cells.set(k, bucket);
      }
      bucket.push(c);
    }
  }

  queryRadius(x, y, radius, excludeCoin = null) {
    this.queryCount++;
    const inv = 1 / this.cellSize;
    const minCx = Math.floor((x - radius) * inv);
    const maxCx = Math.floor((x + radius) * inv);
    const minCy = Math.floor((y - radius) * inv);
    const maxCy = Math.floor((y + radius) * inv);
    const rSq = radius * radius;
    const out = [];

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const other = bucket[i];
          if (!other || other === excludeCoin || other.layer === 'drop') continue;
          const dx = other.x - x;
          const dy = other.y - y;
          if (dx * dx + dy * dy <= rSq) {
            out.push(other);
          }
        }
      }
    }
    return out;
  }
}

class CoinPusherPhysics {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.callbacks = callbacks || {};

    this.renderScale = 1;
    this.width = (this.canvas && this.canvas.width) || 680;
    this.height = (this.canvas && this.canvas.height) || 640;

    // 2.5D Playfield Bed Geometry (Supports 680x640 and 720x740 dynamically)
    this.leftWallX = 76;
    this.rightWallX = this.width - 76;
    this.backWallY = 50;
    this.lipY = 478;
    this.chuteY = 588;

    // Upper Pusher Shelf (Piston Bar & Tiered Step)
    this.shelfMinY = 204;
    this.shelfMaxY = 256;
    this.shelfY = this.shelfMinY;
    this.shelfSpeed = 1.62; // radians per sec
    this.shelfPhase = 0;
    this.prevShelfPhase = 0;
    this.pushCycleCount = 0;

    // Fixed Backstop Scraper Blade (forces shelf coins onto the lower bed on retraction)
    this.scraperY = 148;
    this.shelfBaseY = this.scraperY;

    // Moving Skill-Shot Bonus Gate (oscillates above the shelf in the pegboard zone)
    this.gateX = this.width * 0.5;
    this.gateY = 128;
    this.gateWidth = 86;
    this.gatePhase = 0;
    this.gateFlashTimer = 0;

    // Spinning Brass Bumpers on the Lower Bed
    this.bumpers = [];
    this.initBumpers();

    // Entities & 3D Rigid-Body Telemetry Counters
    this.coins = [];
    this.fallingCoins = [];
    this.chuteCoinPile = [];
    this.pegs = [];
    this.particles = [];
    this.popups = [];
    this.lightningArcs = [];
    this.oilSlicks = [];
    this.cleanBeautyShotMode = false;
    this.floatingSouls = 0; // Banked inside Cursed Skulls
    this.tumbling3DFrames = 0;
    this.multiLayerStacksObserved = 0;
    this.totalDropsMade = 0;
    this.collectorTilt = 0;
    this.shaderPipeline = null;

    // S6: O(N) Spatial Hash Grid + Background Web Worker 3D Co-Processor (240Hz 4x Sub-Step)
    this.spatialGrid = new SpatialHashGrid(48);
    this.spatialGridActive = true;
    this.physicsWorker = null;
    this.workerActive = false;
    this.workerStepCount = 0;
    this.lastStepMs = 0.25;
    this.substepRateHz = 240;
    this.workerSubstepRateHz = 240;
    this.lastWorkerSubsteps = 4;
    this.lastMaxStackPressure = 0;
    this.warmStartedContactsCount = 0;
    this.gyroWobbleCoinsActive = 0;
    this.warmContactCache = new Map();
    this._nextCoinUid = 0;
    this._lastWobbleAudioTime = 0;
    this.initPhysicsWorker();

    // Dropper & Overdrive State
    this.aimX = this.width * 0.5;
    this.aimY = 30;
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.hoveredCoin = null;
    this.dropCooldown = 0;
    this.overdriveTimer = 0;

    // Screen Shake & Diegetic Mechanical Overlays
    this.shakeTime = 0;
    this.shakeMagnitude = 0;
    this.collectorLookX = this.width * 0.5;
    this.collectorBlink = 0;
    this.collectorTalkTimer = 0.8;
    this.collectorMood = 'taunt';
    this.collectorJawAngle = 0;
    this.collectorTauntsTriggered = 1;
    this.guillotineTimer = 0;
    this.guillotineFingerName = '';
    this.guillotine = {
      active: false,
      timer: 0,
      phase: 'idle',
      bladeY: -120,
      fingerName: '',
      sparksSpawned: false
    };
    this.achievementBanner = null;

    // Offscreen Static Cabinet Cache + 3D Token Stamp Cache + Pre-Rendered Blender 5.2 PBR Textures
    this.staticCabinetCanvas = null;
    this.staticCabinetWidth = 0;
    this.staticCabinetHeight = 0;
    this.tokenSpriteCache = new Map();

    this.texBaize = null;
    this.texIron = null;
    this.texBackplate = null;
    this.texCollector = null;
    this.texClaw = null;
    this.texChest = null;
    this.texGuillotine = null;
    this.texCoinPBR = null;
    this.texBumper = null;
    this.texFurnace = null;
    this.texChute = null;
    if (typeof Image !== 'undefined') {
      this.texBaize = new Image();
      this.texBaize.onload = () => this.buildStaticCabinetCache();
      this.texBaize.src = 'assets/art/baize-felt.png?v=s8';

      this.texIron = new Image();
      this.texIron.onload = () => this.buildStaticCabinetCache();
      this.texIron.src = 'assets/art/iron-grain.png?v=s8';

      this.texFurnace = new Image();
      this.texFurnace.onload = () => this.buildStaticCabinetCache();
      this.texFurnace.src = 'assets/art/furnace-gutter.png?v=s8';

      this.texChute = new Image();
      this.texChute.onload = () => this.buildStaticCabinetCache();
      this.texChute.src = 'assets/art/collection-chute.png?v=s8';

      this.texBackplate = new Image();
      this.texBackplate.onload = () => {
        if (this.textures) this.textures.backplateLoaded = true;
        this.buildStaticCabinetCache();
      };
      this.texBackplate.src = 'assets/art/pegboard-backplate.png?v=s8';

      this.texCollector = new Image();
      this.texCollector.src = 'assets/art/collector-automaton.png?v=s8';

      this.texClaw = new Image();
      this.texClaw.src = 'assets/art/collector-claw.png?v=s8';

      this.texChest = new Image();
      this.texChest.src = 'assets/art/reliquary-chest.png?v=s8';

      this.texGuillotine = new Image();
      this.texGuillotine.src = 'assets/art/guillotine-blade.png?v=s8';

      this.texCoinPBR = new Image();
      this.texCoinPBR.src = 'assets/art/coin-pbr-base.png?v=s8';

      this.texBumper = new Image();
      this.texBumper.src = 'assets/art/bumper-capstan.png?v=s8';
    }

    this.textures = {
      get feltLoaded() {
        return Boolean(this._owner.texBaize && this._owner.texBaize.complete && this._owner.texBaize.naturalWidth > 0);
      },
      get ironLoaded() {
        return Boolean(this._owner.texIron && this._owner.texIron.complete && this._owner.texIron.naturalWidth > 0);
      },
      get backplateLoaded() {
        return Boolean(
          this._backplateLoaded ||
            (this._owner.texBackplate &&
              this._owner.texBackplate.complete &&
              this._owner.texBackplate.naturalWidth > 0)
        );
      },
      set backplateLoaded(val) {
        this._backplateLoaded = Boolean(val);
      },
      get collectorLoaded() {
        return Boolean(
          this._owner.texCollector && this._owner.texCollector.complete && this._owner.texCollector.naturalWidth > 0
        );
      },
      get clawLoaded() {
        return Boolean(this._owner.texClaw && this._owner.texClaw.complete && this._owner.texClaw.naturalWidth > 0);
      },
      get chestLoaded() {
        return Boolean(this._owner.texChest && this._owner.texChest.complete && this._owner.texChest.naturalWidth > 0);
      },
      get guillotineLoaded() {
        return Boolean(
          this._owner.texGuillotine && this._owner.texGuillotine.complete && this._owner.texGuillotine.naturalWidth > 0
        );
      },
      get coinPBRLoaded() {
        return Boolean(
          this._owner.texCoinPBR && this._owner.texCoinPBR.complete && this._owner.texCoinPBR.naturalWidth > 0
        );
      },
      get bumperLoaded() {
        return Boolean(
          this._owner.texBumper && this._owner.texBumper.complete && this._owner.texBumper.naturalWidth > 0
        );
      },
      _owner: this
    };

    this.initDropPegs();
    this.buildStaticCabinetCache();
    this.engine3d =
      typeof window !== 'undefined' && typeof window.ObolEngine3D === 'function'
        ? new window.ObolEngine3D(this)
        : null;
  }

  initPhysicsWorker() {
    if (typeof window === 'undefined' || typeof window.Worker !== 'function' || typeof window.Blob !== 'function') {
      return;
    }
    try {
      const workerCode = `
        self.onmessage = function(e) {
          const buf = e.data;
          if (!buf || !buf.length) return;
          // 240Hz (4x Sub-Step) Analytical 3D Circular-Disc Manifold & Stack-Weight Overburden Co-Processor
          const stride = 8; // [x, y, vx, vy, radius, z, mass, stackLayer]
          const n = Math.floor(buf.length / stride);
          const substepsRun = 4;
          const subDt = 1 / 240;
          let activePairs = 0;
          let maxStackPressure = 0;
          for (let step = 0; step < substepsRun; step++) {
            let stepPairs = 0;
            for (let i = 0; i < n; i++) {
              const b = i * stride;
              buf[b] += buf[b + 2] * subDt;
              buf[b + 1] += buf[b + 3] * subDt;
            }
            for (let i = 0; i < n; i++) {
              const b = i * stride;
              const x = buf[b], y = buf[b + 1], r = buf[b + 4], z = buf[b + 5], m = buf[b + 6], sl = buf[b + 7];
              let overburden = 0;
              for (let j = i + 1; j < n; j++) {
                const b2 = j * stride;
                const dx = buf[b2] - x;
                const dy = buf[b2 + 1] - y;
                const r2 = buf[b2 + 4];
                const minD = (r + r2) * 0.90;
                const dSq = dx * dx + dy * dy;
                if (dSq < minD * minD && dSq > 0.0001) {
                  stepPairs++;
                  const dist = Math.sqrt(dSq);
                  const nx = dx / dist;
                  const ny = dy / dist;
                  const pen = (minD - dist) * 0.25;
                  buf[b] -= nx * pen;
                  buf[b + 1] -= ny * pen;
                  buf[b2] += nx * pen;
                  buf[b2 + 1] += ny * pen;
                  const z2 = buf[b2 + 5], m2 = buf[b2 + 6], sl2 = buf[b2 + 7];
                  if (sl >= 1 || z > z2 + 2.5) {
                    overburden += m * 0.45;
                  } else if (sl2 >= 1 || z2 > z + 2.5) {
                    overburden += m2 * 0.45;
                  }
                }
              }
              if (overburden > maxStackPressure) maxStackPressure = overburden;
            }
            activePairs = stepPairs;
          }
          self.postMessage({ activePairs, substepsRun: 4, maxStackPressure, count: n });
        };
      `;
      const blob = new window.Blob([workerCode], { type: 'application/javascript' });
      const url = window.URL.createObjectURL(blob);
      this.physicsWorker = new window.Worker(url);
      this.workerActive = true;
      this.physicsWorker.onmessage = (e) => {
        if (e && e.data) {
          this.workerStepCount++;
          this.lastWorkerPairs = e.data.activePairs || 0;
          this.lastWorkerSubsteps = e.data.substepsRun || 4;
          this.lastMaxStackPressure = e.data.maxStackPressure || 0;
        }
      };
    } catch (err) {
      this.workerActive = false;
    }
  }

  syncCanvasDimensions() {
    const cw = (this.canvas && this.canvas.width) || 680;
    const ch = (this.canvas && this.canvas.height) || 640;
    if (cw !== this.width || ch !== this.height) {
      this.width = cw;
      this.height = ch;
      this.leftWallX = 76;
      this.rightWallX = this.width - 76;
      this.initBumpers();
      this.initDropPegs();
      this.buildStaticCabinetCache();
    }
  }

  initBumpers() {
    const cx = this.width * 0.5;
    const spread = 144;
    this.bumpers = [
      { x: cx - spread, y: 298, radius: 22, hitTimer: 0, angle: 0 },
      { x: cx + spread, y: 298, radius: 22, hitTimer: 0, angle: Math.PI / 4 }
    ];
  }

  initPegs() {
    this.initDropPegs();
  }

  initDropPegs() {
    this.pegs = [];
    const minX = this.leftWallX + 46;
    const maxX = this.rightWallX - 46;
    const span = maxX - minX;

    // 2 staggered rows of brass pachinko pins in the upper drop zone (y=64, y=96)
    // Wide 109px horizontal spacing (63px diagonal) ensures even colossal 44px tokens never wedge!
    const rows = [
      { y: 64, count: 5, inset: 0 },
      { y: 96, count: 4, inset: span / 8 }
    ];

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const startX = minX + row.inset;
      const endX = maxX - row.inset;
      const step = row.count > 1 ? (endX - startX) / (row.count - 1) : 0;
      for (let i = 0; i < row.count; i++) {
        this.pegs.push({
          x: startX + i * step,
          y: row.y,
          radius: 4.5,
          hitTimer: 0
        });
      }
    }
  }

  normalizeTypeId(typeId) {
    const aliasMap = {
      obol: 'copper_obol',
      copper: 'copper_obol',
      heavy: 'silver_drachma',
      silver: 'silver_drachma',
      blood: 'leech_penny',
      leech: 'leech_penny',
      curse: 'cursed_skull',
      skull: 'cursed_skull',
      bomb: 'blast_cap',
      magnet: 'lodestone',
      chest: 'reliquary_chest',
      mercury: 'alchemist_mercury',
      hellfire: 'hellfire_ducat',
      ferry: 'charon_barge',
      mirror: 'obsidian_mirror',
      leviathan: 'quicksilver_sovereign',
      juggernaut: 'infernal_juggernaut'
    };
    if (aliasMap[typeId]) return aliasMap[typeId];
    if (window.TOKEN_CATALOG && window.TOKEN_CATALOG[typeId]) return typeId;
    return 'copper_obol';
  }

  buildStaticCabinetCache() {
    const scale = this.renderScale || 2;
    const off = document.createElement('canvas');
    off.width = this.width * scale;
    off.height = this.height * scale;
    const ctx = off.getContext('2d');
    ctx.scale(scale, scale);

    // 1. Deep Pit Void & Warm Overhead Vignette
    const pitGrad = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.42,
      40,
      this.width * 0.5,
      this.height * 0.5,
      this.width * 0.65
    );
    pitGrad.addColorStop(0, '#120d0a');
    pitGrad.addColorStop(0.65, '#080504');
    pitGrad.addColorStop(1, '#030202');
    ctx.fillStyle = pitGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Side Furnace Lava Gutters (Left & Right Abyssal Trenches)
    this.drawFurnaceGutterStatic(ctx, 4, this.backWallY, this.leftWallX - 9, this.lipY - this.backWallY);
    this.drawFurnaceGutterStatic(ctx, this.rightWallX + 5, this.backWallY, this.width - this.rightWallX - 9, this.lipY - this.backWallY);

    // 2b. Upper Arch & Lower Vault Cast-Iron & Brass Corner Bolsters (eliminates empty black corner voids)
    const bolsterRegions = [
      { x: 4, y: 4, w: this.width * 0.5 - 128, h: this.backWallY - 6 },
      { x: this.width * 0.5 + 124, y: 4, w: this.width * 0.5 - 128, h: this.backWallY - 6 },
      { x: 4, y: this.lipY, w: this.leftWallX, h: this.height - this.lipY - 8 },
      { x: this.rightWallX - 4, y: this.lipY, w: this.leftWallX, h: this.height - this.lipY - 8 }
    ];
    for (const br of bolsterRegions) {
      const bGrad = ctx.createLinearGradient(br.x, br.y, br.x + br.w, br.y + br.h);
      bGrad.addColorStop(0, '#2a1c12');
      bGrad.addColorStop(0.5, '#17100b');
      bGrad.addColorStop(1, '#24180f');
      ctx.fillStyle = bGrad;
      ctx.strokeStyle = '#6e4e2e';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(br.x, br.y, br.w, br.h, 4);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 214, 138, 0.16)';
      ctx.lineWidth = 1;
      ctx.strokeRect(br.x + 3, br.y + 3, br.w - 6, br.h - 6);

      const rivetPositions = [
        [br.x + 7, br.y + 7],
        [br.x + br.w - 7, br.y + 7],
        [br.x + 7, br.y + br.h - 7],
        [br.x + br.w - 7, br.y + br.h - 7]
      ];
      ctx.fillStyle = '#c89646';
      for (const [rx, ry] of rivetPositions) {
        ctx.beginPath();
        ctx.arc(rx, ry, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Main Playfield Lower Bed (Luxurious Royal Crimson-Mahogany Velvet Baize + Sacred-Geometry Astrolabe Filigree)
    const bedWidth = this.rightWallX - this.leftWallX;
    const bedHeight = this.lipY - this.backWallY;
    const bedCx = this.width * 0.5;
    const bedCy = (198 + this.lipY) * 0.5;

    const upperRecessGrad = ctx.createLinearGradient(0, this.backWallY, 0, 204);
    upperRecessGrad.addColorStop(0, '#120c0a');
    upperRecessGrad.addColorStop(1, '#1d120f');
    ctx.fillStyle = upperRecessGrad;
    ctx.fillRect(this.leftWallX, this.backWallY, bedWidth, 204 - this.backWallY);

    const baizeGrad = ctx.createRadialGradient(
      bedCx,
      bedCy,
      24,
      bedCx,
      bedCy,
      Math.max(bedWidth, bedHeight) * 0.68
    );
    baizeGrad.addColorStop(0, '#36131b');
    baizeGrad.addColorStop(0.48, '#260d13');
    baizeGrad.addColorStop(0.82, '#18080c');
    baizeGrad.addColorStop(1, '#100507');

    ctx.fillStyle = baizeGrad;
    ctx.fillRect(this.leftWallX, 198, bedWidth, this.lipY - 198);

    // Composite Runware Dark-Occult Alchemical Baize Medallion Centered on the Lower Coin Bed
    if (this.texBaize && this.texBaize.complete && this.texBaize.naturalWidth > 0) {
      try {
        ctx.save();
        ctx.globalAlpha = 0.36;
        ctx.drawImage(this.texBaize, this.leftWallX, 198, bedWidth, this.lipY - 198);
        ctx.restore();
      } catch (e) {
        // Ignore drawImage error in headless test environments
      }
    }

    // Luminous Golden Sacred-Geometry Astrolabe Rings & Engraved Brass Corner Filigree (Zero 4px scanline banding!)
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.leftWallX + 4, 202, bedWidth - 8, this.lipY - 206);
    ctx.clip();

    // Outer & inner astrolabe circles
    ctx.strokeStyle = 'rgba(255, 204, 112, 0.16)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(bedCx, bedCy + 6, 118, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 204, 112, 0.11)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(bedCx, bedCy + 6, 84, 0, Math.PI * 2);
    ctx.arc(bedCx, bedCy + 6, 44, 0, Math.PI * 2);
    ctx.stroke();

    // 8-point sacred geometry compass rays
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(bedCx + Math.cos(a) * 44, bedCy + 6 + Math.sin(a) * 44);
      ctx.lineTo(bedCx + Math.cos(a) * 118, bedCy + 6 + Math.sin(a) * 118);
      ctx.stroke();
    }

    // Subtle perspective bullion guide lanes
    ctx.strokeStyle = 'rgba(255, 208, 128, 0.05)';
    const laneCount = 6;
    for (let i = 1; i < laneCount; i++) {
      const lx = this.leftWallX + (bedWidth / laneCount) * i;
      ctx.beginPath();
      ctx.moveTo(lx, 204);
      ctx.lineTo(lx, this.lipY - 14);
      ctx.stroke();
    }

    // Engraved Brass Corner Filigree Brackets on the Lower Baize Bed
    ctx.strokeStyle = 'rgba(240, 186, 96, 0.26)';
    ctx.lineWidth = 1.5;
    const corners = [
      [this.leftWallX + 14, 214, 1, 1],
      [this.rightWallX - 14, 214, -1, 1],
      [this.leftWallX + 14, this.lipY - 22, 1, -1],
      [this.rightWallX - 14, this.lipY - 22, -1, -1]
    ];
    for (let cIdx = 0; cIdx < corners.length; cIdx++) {
      const [cx0, cy0, dx, dy] = corners[cIdx];
      ctx.beginPath();
      ctx.moveTo(cx0, cy0 + dy * 22);
      ctx.lineTo(cx0, cy0);
      ctx.lineTo(cx0 + dx * 26, cy0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx0 + dx * 6, cy0 + dy * 6, 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Inner ambient occlusion shadows along left/right bed rails
    const leftAO = ctx.createLinearGradient(this.leftWallX, 0, this.leftWallX + 22, 0);
    leftAO.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    leftAO.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = leftAO;
    ctx.fillRect(this.leftWallX, this.backWallY, 22, bedHeight);

    const rightAO = ctx.createLinearGradient(this.rightWallX - 22, 0, this.rightWallX, 0);
    rightAO.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rightAO.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
    ctx.fillStyle = rightAO;
    ctx.fillRect(this.rightWallX - 22, this.backWallY, 22, bedHeight);

    // 4. Cast-Iron & Riveted Brass Side Rails along the Playfield Edges
    ctx.fillStyle = '#3a291c';
    ctx.fillRect(this.leftWallX - 5, this.backWallY, 5, bedHeight);
    ctx.fillRect(this.rightWallX, this.backWallY, 5, bedHeight);

    for (let ry = this.backWallY + 18; ry < this.lipY - 10; ry += 36) {
      ctx.fillStyle = '#b3823e';
      ctx.beginPath();
      ctx.arc(this.leftWallX - 2.5, ry, 2, 0, Math.PI * 2);
      ctx.arc(this.rightWallX + 2.5, ry, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Fixed Brass Backstop Scraper Bar (Forces shelf coins onto the lower bed)
    const scraperGrad = ctx.createLinearGradient(0, this.scraperY - 7, 0, this.scraperY + 5);
    scraperGrad.addColorStop(0, '#5e4327');
    scraperGrad.addColorStop(0.5, '#a8793e');
    scraperGrad.addColorStop(1, '#261a0f');
    ctx.fillStyle = scraperGrad;
    ctx.fillRect(this.leftWallX, this.scraperY - 7, bedWidth, 11);
    ctx.strokeStyle = '#ffcf70';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.leftWallX + 0.5, this.scraperY - 6.5, bedWidth - 1, 10);

    // 6. The Iron Lip (3D Beveled Front Edge Drop-Off + Hazard Chevrons)
    const lipGrad = ctx.createLinearGradient(0, this.lipY - 14, 0, this.lipY + 16);
    lipGrad.addColorStop(0, '#594738');
    lipGrad.addColorStop(0.35, '#8c6f56');
    lipGrad.addColorStop(0.65, '#2b2018');
    lipGrad.addColorStop(1, '#0e0a07');
    ctx.fillStyle = lipGrad;
    ctx.fillRect(this.leftWallX, this.lipY - 14, bedWidth, 28);

    // Warning Hazard Stripes on the Iron Lip
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.leftWallX, this.lipY - 11, bedWidth, 9);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 185, 48, 0.24)';
    for (let x = this.leftWallX - 24; x < this.rightWallX + 24; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, this.lipY - 11);
      ctx.lineTo(x + 13, this.lipY - 11);
      ctx.lineTo(x + 5, this.lipY - 2);
      ctx.lineTo(x - 8, this.lipY - 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Specular highlight along top of the Iron Lip
    ctx.strokeStyle = 'rgba(255, 224, 158, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.leftWallX, this.lipY - 13.5);
    ctx.lineTo(this.rightWallX, this.lipY - 13.5);
    ctx.stroke();

    // 7. Bottom Payout Collection Chute (3D Cast-Iron & Polished-Brass Bullion Vault Hopper)
    const chuteTop = this.lipY + 14;
    const chuteH = this.height - chuteTop - 8;
    const chuteX = this.leftWallX + 8;
    const chuteW = bedWidth - 16;

    // Deep recessed vault floor gradient with warm golden-amber bullion spotlight in center
    const chuteGrad = ctx.createLinearGradient(0, chuteTop, 0, this.height);
    chuteGrad.addColorStop(0, '#040302');
    chuteGrad.addColorStop(0.28, '#140e09');
    chuteGrad.addColorStop(0.72, '#1f150c');
    chuteGrad.addColorStop(1, '#090604');
    ctx.fillStyle = chuteGrad;
    ctx.fillRect(chuteX, chuteTop, chuteW, chuteH);

    const vaultGlow = ctx.createRadialGradient(
      this.width * 0.5,
      chuteTop + chuteH * 0.55,
      18,
      this.width * 0.5,
      chuteTop + chuteH * 0.55,
      chuteW * 0.52
    );
    vaultGlow.addColorStop(0, 'rgba(255, 196, 76, 0.22)');
    vaultGlow.addColorStop(0.55, 'rgba(66, 230, 108, 0.09)');
    vaultGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = vaultGlow;
    ctx.fillRect(chuteX, chuteTop, chuteW, chuteH);

    if (this.texChute && this.texChute.complete && this.texChute.naturalWidth > 0) {
      try {
        ctx.save();
        ctx.beginPath();
        ctx.rect(chuteX, chuteTop, chuteW, chuteH);
        ctx.clip();
        ctx.globalAlpha = 0.34;
        ctx.drawImage(this.texChute, chuteX, chuteTop - 16, chuteW, chuteH + 32);
        ctx.restore();
      } catch (e) {
        // Ignore in headless mock context
      }
    }

    // 3D Perspective Angled Brass Bullion Divider Fins inside the Vault Hopper
    const finCount = 7;
    for (let f = 1; f < finCount; f++) {
      const frac = f / finCount;
      const topFx = chuteX + frac * chuteW;
      const botFx = chuteX + (frac - 0.5) * 1.08 * chuteW + chuteW * 0.5;
      const finGrad = ctx.createLinearGradient(topFx, chuteTop + 8, botFx, chuteTop + chuteH - 6);
      finGrad.addColorStop(0, 'rgba(92, 64, 30, 0.25)');
      finGrad.addColorStop(0.5, 'rgba(235, 182, 92, 0.46)');
      finGrad.addColorStop(1, 'rgba(74, 48, 20, 0.25)');
      ctx.strokeStyle = finGrad;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(topFx, chuteTop + 6);
      ctx.lineTo(botFx, chuteTop + chuteH - 6);
      ctx.stroke();
    }

    // Beveled 3D Cast-Iron & Polished-Brass Hopper Frame
    ctx.strokeStyle = '#9c7338';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(chuteX, chuteTop, chuteW, chuteH);
    ctx.strokeStyle = 'rgba(255, 224, 150, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(chuteX + 3, chuteTop + 3, chuteW - 6, chuteH - 6);

    // Top overhang shadow inside the Collection Chute below the Iron Lip
    const chuteShadow = ctx.createLinearGradient(0, chuteTop, 0, chuteTop + 30);
    chuteShadow.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
    chuteShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = chuteShadow;
    ctx.fillRect(chuteX + 2, chuteTop, chuteW - 4, 30);

    // Riveted Diegetic Brass Bullion Nameplate centered in the Collection Vault
    const plateW = 336;
    const plateH = 20;
    const plateX = this.width * 0.5 - plateW * 0.5;
    const plateY = this.lipY + 34;
    const plateGrad = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateH);
    plateGrad.addColorStop(0, '#2e2012');
    plateGrad.addColorStop(0.5, '#171009');
    plateGrad.addColorStop(1, '#261a0e');
    ctx.fillStyle = plateGrad;
    ctx.strokeStyle = '#c89646';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(plateX, plateY, plateW, plateH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd875';
    ctx.font = 'bold 10.5px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼ BULLION VAULT — COINS OVER THE LIP PAY QUOTA ▼', this.width * 0.5, plateY + plateH * 0.5 + 0.5);

    this.staticCabinetCanvas = off;
    this.staticCabinetWidth = this.width;
    this.staticCabinetHeight = this.height;
  }

  drawFurnaceGutterStatic(ctx, x, y, w, h) {
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, '#140303');
    grad.addColorStop(0.5, '#3b0808');
    grad.addColorStop(1, '#140303');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    if (this.texFurnace && this.texFurnace.complete && this.texFurnace.naturalWidth > 0) {
      try {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.globalAlpha = 0.76;
        ctx.drawImage(this.texFurnace, x - 6, y, w + 12, h);
        ctx.restore();
      } catch (e) {
        // Ignore in headless mock context
      }
    }

    ctx.strokeStyle = 'rgba(255, 82, 42, 0.34)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(255, 138, 108, 0.78)';
    ctx.font = 'bold 10px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOUSE FURNACE (LOST)', 0, 4);
    ctx.restore();
  }

  resetBoard() {
    this.syncCanvasDimensions();
    this.coins = [];
    this.fallingCoins = [];
    this.chuteCoinPile = [];
    this.particles = [];
    this.popups = [];
    this.lightningArcs = [];
    this.oilSlicks = [];
    this.cleanBeautyShotMode = false;
    this.shelfPhase = 0;
    this.prevShelfPhase = 0;
    this.pushCycleCount = 0;
    this.overdriveTimer = 0;
    this.floatingSouls = 0;
    this.flickCooldown = 0;
    this.tumbling3DFrames = 0;
    this.multiLayerStacksObserved = 0;
    this.warmStartedContactsCount = 0;
    this.gyroWobbleCoinsActive = 0;
    if (this.warmContactCache) {
      this.warmContactCache.clear();
    }
    this.totalDropsMade = 0;
    if (typeof window !== 'undefined' && window.obolGame) {
      window.obolGame.dropsMade = 0;
    }
    this.collectorTalkTimer = 0.8;
    this.collectorMood = 'taunt';
    this.collectorJawAngle = 0;
    this.collectorTauntsTriggered = 1;
    this.heraldBanner = null;
    this.achievementBanner = null;
    this.seedInitialPile();
  }

  seedInitialBoard() {
    return this.seedInitialPile();
  }

  seedInitialPile() {
    const cx = this.width * 0.5;

    // 1. Seed 21 coins across 3 hex-staggered rows on the upper reciprocating pusher shelf (y = [170, 184, 198])
    // 7 coins per row across x = cx - 198 to cx + 198 (step = 66px, alternating rowShift = ±10px)
    const shelfTypes = [
      'copper_obol', 'copper_obol', 'silver_drachma', 'copper_obol', 'leech_penny', 'copper_obol', 'copper_obol',
      'copper_obol', 'leech_penny', 'copper_obol', 'silver_drachma', 'copper_obol', 'copper_obol', 'leech_penny',
      'copper_obol', 'silver_drachma', 'copper_obol', 'copper_obol', 'leech_penny', 'copper_obol', 'copper_obol'
    ];
    const shelfRowY = [170, 184, 198];
    for (let r = 0; r < shelfRowY.length; r++) {
      const y = shelfRowY[r];
      const rowShift = r % 2 === 0 ? -10 : 10;
      for (let col = 0; col < 7; col++) {
        const x = cx - 198 + col * 66 + rowShift + Math.sin(r * 3.1 + col * 1.7) * 3.2;
        const yOff = Math.cos(r * 2.3 + col * 1.9) * 2.2;
        const t = shelfTypes[(r * 7 + col) % shelfTypes.length];
        const sc = this.spawnCoinOnBed(t, x, y + yOff, null, 'shelf');
        if (sc) {
          const isShelfLayer1 =
            (r === 1 && (col === 1 || col === 3 || col === 5)) ||
            (r === 2 && col === 3);
          if (isShelfLayer1) {
            sc.stackLayer = 1;
            sc.z = 5.8;
            sc.pitch = -0.12;
            sc.roll = 0;
            sc._lastTargetZ = 5.8;
            sc.supportTimer = 0.6;
          } else {
            sc.stackLayer = 0;
            sc.z = 0;
            sc.pitch = 0;
            sc.roll = 0;
          }
          sc.renderZ = sc.z;
          sc.renderPitch = sc.pitch;
          sc.renderRoll = sc.roll;
          sc.isSeeded = true;
        }
      }
    }

    // 2. Seed 60 coins across 7 staggered rows on the lower baize bed (bedRowY = [262, 294, 326, 358, 390, 424, 456])
    // Total seeded tokens = 21 (shelf) + 60 (bed) + 1 (chest) = 82!
    const bedPool = [
      'copper_obol', 'voltaic_coil', 'copper_obol', 'leech_penny', 'emerald_serpent', 'silver_drachma',
      'copper_obol', 'soul_chain', 'leech_penny', 'copper_obol', 'sun_bullion',
      'silver_drachma', 'copper_obol', 'voltaic_coil', 'lodestone', 'copper_obol', 'leech_penny',
      'copper_obol', 'emerald_serpent', 'silver_drachma', 'soul_chain', 'leech_penny',
      'copper_obol', 'sun_bullion', 'copper_obol', 'silver_drachma', 'voltaic_coil', 'copper_obol',
      'copper_obol', 'leech_penny', 'emerald_serpent', 'copper_obol', 'copper_obol'
    ];

    const bedRowY = [262, 294, 326, 358, 390, 424, 456];
    const cols9 = [-224, -168, -112, -56, 0, 56, 112, 168, 224];
    const cols8 = [-196, -140, -84, -28, 28, 84, 140, 196];
    let idx = 0;
    for (let r = 0; r < bedRowY.length; r++) {
      const baseRy = bedRowY[r];
      const isOddRow = r % 2 === 1;
      const cols = isOddRow ? cols8 : cols9;
      for (let col = 0; col < cols.length; col++) {
        // Organic arcade cascade offsets (±4.5px X, ±3.5px Y, central V-wave bow toward the lip)
        const centerPull = (1 - Math.abs(cols[col]) / 230) * 4.5;
        const jitterX = Math.sin(idx * 2.17 + r * 1.3) * 4.5;
        const jitterY = Math.cos(idx * 1.63 + col * 1.9) * 3.5 + centerPull;
        let rx = cx + cols[col] + jitterX;
        let ry = Math.min(this.lipY - 13, baseRy + jitterY);

        // Let outer coins on rows 2 and 4 sit right on the side furnace bevels so lateral compression can claim tributes
        if (!isOddRow && (r === 2 || r === 4) && col === 0) rx = this.leftWallX + 11;
        if (!isOddRow && (r === 2 || r === 4) && col === cols.length - 1) rx = this.rightWallX - 11;

        // Bumper Clearance: keep a clean 48px radial showcase ring around both Multi-Tiered Capstan Bumpers
        let skipForHardware = false;
        let nearHardware = false;
        for (let bIdx = 0; bIdx < this.bumpers.length; bIdx++) {
          const b = this.bumpers[bIdx];
          const bDist = Math.hypot(rx - b.x, ry - b.y);
          if (bDist < 48) {
            skipForHardware = true;
            break;
          }
          if (bDist < 74) {
            nearHardware = true;
          }
        }
        // Reliquary Chest Plinth & Rotating Rune Halo Clearance around (cx, 352)
        const cDist = Math.hypot(rx - cx, ry - 352);
        if (cDist < 30) {
          skipForHardware = true;
        } else if (cDist < 58) {
          nearHardware = true;
        }
        if (skipForHardware) {
          continue;
        }

        const type = bedPool[idx % bedPool.length];
        idx++;
        const c = this.spawnCoinOnBed(type, rx, ry, null, 'bed');
        if (c) {
          c.isSeeded = true;
          const isLayer2 =
            !nearHardware &&
            ((r === 2 && (col === 3 || col === 5)) ||
              (r === 3 && (col === 3 || col === 4)));
          const isLayer1 =
            !nearHardware &&
            !isLayer2 &&
            ((r === 1 && col >= 2 && col <= 5) ||
              (r === 2 && (col === 2 || col === 4 || col === 6)) ||
              (r === 3 && (col === 1 || col === 2 || col === 5 || col === 6)) ||
              (r === 4 && (col === 2 || col === 4 || col === 6)) ||
              (r === 5 && (col === 3 || col === 4)));

          if (isLayer2) {
            c.stackLayer = 2;
            c.z = 11.4;
            c.pitch = -0.18;
            c._lastTargetZ = 11.4;
            c.supportTimer = 0.65;
          } else if (isLayer1) {
            c.stackLayer = 1;
            c.z = 5.8;
            c.pitch = -0.14;
            c._lastTargetZ = 5.8;
            c.supportTimer = 0.65;
          } else {
            c.stackLayer = 0;
            c.z = 0;
            c.pitch = 0;
          }
          if (ry >= 445) {
            c.isTeetering = true;
            c.teeterProgress = Math.min(1, Math.max(0.18, (ry - (this.lipY - c.radius * 0.95)) / (c.radius * 0.95 + 5.5)));
            c.pitch = Math.max(c.pitch || 0, c.teeterProgress * 0.72);
          }
          c.renderZ = c.z;
          c.renderPitch = c.pitch;
          c.renderRoll = c.roll;
        }
      }
    }

    // 3. Seed 1 Reliquary Prize Chest nestled in the central treasure cluster
    const chest = this.spawnReliquaryChest(cx, 352);
    if (chest) {
      chest.stackLayer = 1;
      chest.z = 6.5;
      chest.pitch = -0.08;
      chest._lastTargetZ = 6.5;
      chest.supportTimer = 0.65;
      chest.renderZ = chest.z;
      chest.renderPitch = chest.pitch;
    }
  }

  spawnReliquaryChest(x, y) {
    const cx = x !== undefined ? x : this.width * 0.5;
    const cy = y !== undefined ? y : 286;
    const chest = this.spawnCoinOnBed('reliquary_chest', cx, cy, null, 'bed');
    if (chest) {
      this.spawnRingParticles(cx, cy, '#ffd86b', 18);
    }
    return chest;
  }

  project3D(bx, by, bz = 0) {
    if (this.engine3d && this.engine3d.active && typeof this.engine3d.worldToScreen === 'function') {
      const pt = this.engine3d.worldToScreen(bx, by, bz);
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        return {
          x: pt.x,
          y: pt.y,
          scale: Number.isFinite(pt.scale) ? pt.scale : 1,
          visible: pt.visible !== false
        };
      }
    }
    return { x: bx, y: by - bz * 0.44, scale: 1, visible: true };
  }

  unprojectScreenCoords(rawX, rawY, bz = 0) {
    if (
      this.engine3d &&
      this.engine3d.active &&
      this.engine3d.activeCameraPreset &&
      this.engine3d.activeCameraPreset !== 'playfield' &&
      typeof this.engine3d.screenToBoard === 'function' &&
      Number.isFinite(rawX) &&
      Number.isFinite(rawY) &&
      rawX > -500 &&
      rawY > -500
    ) {
      const pt = this.engine3d.screenToBoard(rawX, rawY, bz);
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        return { x: pt.x, y: pt.y };
      }
    }
    return { x: rawX, y: rawY };
  }

  getCanvasCoords(e, bz = 0) {
    if (!this.canvas || !e) return { x: this.width * 0.5, y: 30 };
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / Math.max(1, rect.width);
    const scaleY = this.height / Math.max(1, rect.height);
    const rawX = (e.clientX - rect.left) * scaleX;
    const rawY = (e.clientY - rect.top) * scaleY;
    return this.unprojectScreenCoords(rawX, rawY, bz);
  }

  setAimX(x, y) {
    let boardX = x;
    let boardY = y;
    if (y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
      this._lastRawInputX = x;
      this._lastRawInputY = y;
      const pt = this.unprojectScreenCoords(x, y, 0);
      boardX = pt.x;
      boardY = pt.y;
    }
    this.aimX = Math.max(this.leftWallX + 24, Math.min(this.rightWallX - 24, boardX));
    if (boardY !== undefined) {
      this.aimY = boardY;
      this.mouseX = Number.isFinite(boardX) ? boardX : -1000;
      this.mouseY = Number.isFinite(boardY) ? boardY : -1000;
      this.updateHoveredCoin(this.mouseX, this.mouseY);
    }
  }

  setMousePos(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= -500 || y <= -500) {
      this.mouseX = -1000;
      this.mouseY = -1000;
      this.updateHoveredCoin(-1000, -1000);
      return;
    }
    const pt = this.unprojectScreenCoords(x, y, 0);
    this.mouseX = pt.x;
    this.mouseY = pt.y;
    this.updateHoveredCoin(this.mouseX, this.mouseY);
  }

  updateHoveredCoin(mx, my) {
    this.hoveredCoin = null;
    if (!Number.isFinite(mx) || !Number.isFinite(my)) return;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c || c.layer === 'drop') continue;
      const screenY = c.y - (c.z || 0) * 0.85;
      const d = Math.min(Math.hypot(c.x - mx, screenY - my), Math.hypot(c.x - mx, c.y - my));
      if (d <= (c.radius || 17) + 6) {
        this.hoveredCoin = c;
        break;
      }
    }
  }

  addShake(magnitude, duration) {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  triggerCollectorTaunt(mood = 'taunt', duration = 1.2) {
    this.collectorTalkTimer = Math.max(this.collectorTalkTimer || 0, duration);
    this.collectorMood = mood;
    this.collectorTauntsTriggered = (this.collectorTauntsTriggered || 0) + 1;
    if (this.engine3d && typeof this.engine3d.triggerCollectorSpeech === 'function') {
      this.engine3d.triggerCollectorSpeech(duration, mood);
    }
    if (typeof window !== 'undefined' && window.obolAudio && typeof window.obolAudio.playCollectorChatter === 'function') {
      window.obolAudio.playCollectorChatter(4, mood);
    }
  }

  triggerFingerSeverCutscene(fingerName) {
    this.guillotineTimer = 2.4;
    this.guillotineFingerName = fingerName || 'INDEX FINGER';
    this.heraldBanner = null;
    this.achievementBanner = null;
    this.popups = [];
    this.guillotine = {
      active: true,
      timer: 2.4,
      phase: 'drop',
      bladeY: 48,
      fingerName: this.guillotineFingerName,
      sparksSpawned: false
    };
    this.addShake(16, 0.55);
    this.spawnParticles(this.width * 0.5, 240, '#ff1e27', 34);
  }

  sanitizeBannerText(rawText) {
    return String(rawText || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  addAchievementToast(text) {
    const clean = this.sanitizeBannerText(text);
    this.achievementBanner = {
      text: clean || 'ACHIEVEMENT UNLOCKED',
      timer: 2.8,
      maxTimer: 2.8
    };
  }

  addScorePopup(x, y, payout, comboMult = 1.0, color = '#42e66c', scale = 1.0) {
    const moneyText = window.formatObolMoney ? window.formatObolMoney(payout) : `$${Math.round(payout)}`;
    const badge = comboMult >= 1.5 ? ` x${comboMult.toFixed(1)}` : '';
    const chutePopupY = Math.max(this.lipY + 72, y);
    this.addPopup(x, chutePopupY, `+${moneyText}${badge}`, color, Math.min(1.22, scale));
  }

  addPopup(x, y, text, color = '#ffbf36', scale = 1.0) {
    const cleanText = this.sanitizeBannerText(text);
    if (!cleanText) return;

    const upper = cleanText.toUpperCase();
    const isMajorBanner =
      upper.includes('FUSION') ||
      upper.includes('RELIQUARY') ||
      upper.includes('OVERDRIVE') ||
      upper.includes('CRUSHED') ||
      upper.includes('BLOOD PACT') ||
      upper.includes('GATE JACKPOT') ||
      upper.includes('CHEST:') ||
      upper.includes('BLAST') ||
      upper.includes('SLAM') ||
      upper.includes('SHATTER') ||
      upper.includes('MIMIC:') ||
      scale >= 1.25;

    if (isMajorBanner) {
      this.heraldBanner = {
        text: cleanText,
        color: color || '#ffd86b',
        life: 1.85,
        maxLife: 1.85,
        scale: Math.min(1.3, Math.max(1.0, scale))
      };
      return;
    }

    if (this.popups.length >= 6) {
      this.popups.shift();
    }

    const isChutePopup = y >= this.lipY;
    const minPopupY = isChutePopup ? this.lipY + 22 : 66;
    const maxPopupY = isChutePopup ? this.height - 16 : this.lipY - 22;

    const clampedScale = Math.min(1.22, Math.max(0.78, scale));
    const estHalfW = Math.max(26, cleanText.length * 4.6 * clampedScale + 10);
    const minPopupX = this.leftWallX + estHalfW + 8;
    const maxPopupX = this.rightWallX - estHalfW - 8;
    let px = Math.max(minPopupX, Math.min(maxPopupX, x));
    let py = Math.max(minPopupY, Math.min(maxPopupY, y));

    const hasOverlap = (cx, cy) => {
      for (let i = 0; i < this.popups.length; i++) {
        const p = this.popups[i];
        if (Math.abs(p.x - cx) < (p.halfW || 48) + estHalfW + 8 && Math.abs(p.y - cy) < 24) {
          return true;
        }
      }
      return false;
    };

    if (hasOverlap(px, py)) {
      const yCandidates = isChutePopup
        ? [this.lipY + 26, this.lipY + 52, this.lipY + 78, this.lipY + 104, this.height - 16]
        : [py - 28, py + 28, py - 56, py + 56, py - 84];
      const xOffsets = [0, -135, 135, -210, 210];
      let found = false;
      for (let yi = 0; yi < yCandidates.length && !found; yi++) {
        const cy = Math.max(minPopupY, Math.min(maxPopupY, yCandidates[yi]));
        for (let xi = 0; xi < xOffsets.length; xi++) {
          const cx = Math.max(minPopupX, Math.min(maxPopupX, x + xOffsets[xi]));
          if (!hasOverlap(cx, cy)) {
            px = cx;
            py = cy;
            found = true;
            break;
          }
        }
      }
    }

    py = Math.max(minPopupY, Math.min(maxPopupY, py));

    this.popups.push({
      x: px,
      y: py,
      minY: minPopupY,
      text: cleanText,
      color,
      scale: clampedScale,
      halfW: estHalfW,
      life: 0.95,
      maxLife: 0.95
    });
  }

  spawnSeedCoin(typeId, x, y, z = 0) {
    return this.spawnCoinOnBed(typeId, x, y, null, z === 1 && y < this.shelfMaxY ? 'shelf' : 'bed');
  }

  dropCoin(x, typeId = 'copper_obol') {
    return this.dropToken(typeId, x, 0);
  }

  spawnCoinDirect(x, y, typeId = 'copper_obol', z = 0) {
    return this.spawnCoinOnBed(typeId, x, y, null, z === 1 && y < this.shelfMaxY ? 'shelf' : 'bed');
  }

  spawnCoinOnBed(typeId, x, y, customProps = null, layer = 'bed') {
    const normId = this.normalizeTypeId(typeId);
    const def = (window.TOKEN_CATALOG && window.TOKEN_CATALOG[normId]) || window.TOKEN_CATALOG.copper_obol;
    const brandId =
      (customProps && customProps.brand) ||
      (this.callbacks.getTokenBrand ? this.callbacks.getTokenBrand(normId) : null);

    let baseVal = def.baseValue + ((customProps && customProps.bonusValue) || 0);
    let mass = def.mass;
    let gilded = Boolean(customProps && customProps.gilded);

    if (brandId === 'gilded') {
      baseVal *= 2;
      gilded = true;
    } else if (brandId === 'heavy') {
      baseVal += 15;
      mass = +(mass * 1.8).toFixed(2);
    }

    const resolvedLayer = layer || 'bed';
    const thickness = mass >= 1.5 || def.radius >= 22 || brandId === 'heavy' ? 8.5 : 5.8;
    const numId = ++this._nextCoinUid;
    const coin = {
      uid: Math.random().toString(36).slice(2, 10),
      numId,
      id: def.id,
      typeId: def.id,
      type: def,
      rawId: typeId,
      name: def.name,
      icon: def.icon,
      x: Math.max(this.leftWallX + 4, Math.min(this.rightWallX - 4, x)),
      y,
      vx: (customProps && customProps.vx) || 0,
      vy: (customProps && customProps.vy) || 0,
      radius: def.radius,
      mass,
      thickness,
      friction: def.friction,
      restitution: def.restitution,
      baseValue: Math.round(def.baseValue || 10),
      value: Math.round(baseVal),
      colorPrimary: def.colorPrimary,
      colorSecondary: def.colorSecondary,
      colorRim: def.colorRim,
      isPrizeTotem: Boolean(def.isPrizeTotem),
      isFusedMythic: Boolean(def.isFusedMythic),
      layer: resolvedLayer, // 'drop' | 'shelf' | 'bed'
      z: (customProps && customProps.z) || 0,
      vz: (customProps && customProps.vz) || 0,
      stackLayer: (customProps && customProps.stackLayer) || 0,
      overburdenWeight: 0,
      pitch: Math.max(-1.35, Math.min(1.35, (Math.random() - 0.5) * 0.45)),
      roll: Math.max(-1.35, Math.min(1.35, (Math.random() - 0.5) * 0.45)),
      omegaPitch: (Math.random() - 0.5) * 5.0,
      omegaRoll: (Math.random() - 0.5) * 5.0,
      flipAngle: 0,
      flipVel: 0,
      nutationAngle: Math.random() * Math.PI * 2,
      nutationAmp: resolvedLayer === 'drop' ? 0.14 : 0.04,
      nutationFreq: 18,
      angle: (Math.random() - 0.5) * 0.6,
      angularVel: (Math.random() - 0.5) * 0.4,
      pushedImpulse: 0,
      brand: brandId || null,
      gilded,
      pegHits: 0,
      bumperHits: 0,
      gatePassed: false,
      mimicUsed: false,
      fuseCount: def.id === 'blast_cap' ? 3 : def.id === 'void_singularity' ? 2 : 0,
      tetherPartnerUid: null,
      oilTimer: 0,
      isTeetering: false,
      teeterProgress: 0,
      pulsePhase: Math.random() * Math.PI * 2,
      spawnScale: 1.0,
      supportTimer: 0,
      _lastTargetZ: 0,
      renderX: Math.max(this.leftWallX + 4, Math.min(this.rightWallX - 4, x)),
      renderY: y,
      renderZ: (customProps && customProps.z) || 0,
      renderPitch: 0,
      renderRoll: 0
    };

    if (customProps) {
      if (customProps.value !== undefined) coin.value = Math.round(customProps.value);
    }

    this.coins.push(coin);
    return coin;
  }

  dropToken(typeId, x, bonusVal = 0) {
    if (this.dropCooldown > 0) return false;
    let dropX = x !== undefined ? x : this.aimX;
    if (
      x !== undefined &&
      Number.isFinite(this._lastRawInputX) &&
      Math.abs(x - this._lastRawInputX) < 0.001
    ) {
      dropX = this.aimX;
    }
    const clampedX = Math.max(this.leftWallX + 24, Math.min(this.rightWallX - 24, dropX));
    this.dropCooldown = this.overdriveTimer > 0 ? 0.12 : 0.22;

    const normId = this.normalizeTypeId(typeId);
    const brandId = this.callbacks.getTokenBrand ? this.callbacks.getTokenBrand(normId) : null;
    const coin = this.spawnCoinOnBed(
      normId,
      clampedX + (Math.random() * 3 - 1.5),
      32,
      {
        bonusValue: bonusVal,
        vx: (Math.random() - 0.5) * 16,
        vy: 145,
        vz: 38,
        z: 8,
        brand: brandId
      },
      'drop'
    );
    if (coin) {
      coin.angularVel = (Math.random() - 0.5) * 2.4;
      coin.omegaPitch = (Math.random() - 0.5) * 7.5;
      coin.omegaRoll = (Math.random() - 0.5) * 7.5;
      coin.flipVel = (Math.random() < 0.5 ? 1 : -1) * (9.5 + Math.random() * 5.0);
    }

    if (brandId === 'echo') {
      const twinOffset = clampedX > this.width * 0.5 ? -28 : 28;
      const twin = this.spawnCoinOnBed(
        normId,
        clampedX + twinOffset,
        34,
        {
          bonusValue: bonusVal,
          vx: twinOffset * 0.6,
          vy: 140,
          vz: 42,
          z: 8,
          brand: 'echo'
        },
        'drop'
      );
      if (twin) {
        twin.angularVel = -coin.angularVel;
        twin.omegaPitch = -coin.omegaPitch;
        twin.omegaRoll = -coin.omegaRoll;
        twin.flipVel = -coin.flipVel;
        this.spawnRingParticles(twin.x, twin.y, '#d6bcfa', 8);
      }
    }

    if (window.obolAudio) {
      window.obolAudio.playDropCoin();
    }
    this.totalDropsMade = (this.totalDropsMade || 0) + 1;
    if (typeof window !== 'undefined' && window.obolGame) {
      window.obolGame.dropsMade = this.totalDropsMade;
    }
    return true;
  }

  dropTokenAt(typeId, x, y, bonusVal = 0) {
    return this.spawnCoinOnBed(typeId, x, y, { bonusValue: bonusVal }, y < this.shelfY ? 'shelf' : 'bed');
  }

  flickCoinAt(mx, my, isBoardCoords = false) {
    if ((this.flickCooldown || 0) > 0) return false;
    let target = null;
    let bestDist = 48;

    // 1. Check if caller passed direct board coordinates (e.g., automated telemetry or exact coin reference)
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c || c.layer === 'drop') continue;
      const dBoard = Math.hypot(c.x - mx, c.y - my);
      if (dBoard < (isBoardCoords ? bestDist : 3.5)) {
        bestDist = dBoard;
        target = c;
      }
    }

    // 2. Otherwise unproject 2D screen coordinates through the active 3D camera onto the coin bed plane
    if (!target && !isBoardCoords) {
      const pt = this.unprojectScreenCoords(mx, my, 0);
      bestDist = 48;
      for (let i = 0; i < this.coins.length; i++) {
        const c = this.coins[i];
        if (!c || c.layer === 'drop') continue;
        const d = Math.hypot(c.x - pt.x, c.y - pt.y);
        if (d < bestDist) {
          bestDist = d;
          target = c;
        }
      }
      // 3. Fallback to board-coordinate proximity if unprojected point missed
      if (!target) {
        bestDist = 48;
        for (let i = 0; i < this.coins.length; i++) {
          const c = this.coins[i];
          if (!c || c.layer === 'drop') continue;
          const d = Math.hypot(c.x - mx, c.y - my);
          if (d < bestDist) {
            bestDist = d;
            target = c;
          }
        }
      }
    }
    if (!target) return false;

    this.flickCooldown = 0.35;
    const centerBias = (this.width * 0.5 - target.x) * 0.36;
    target.vy = Math.max(target.vy || 0, 168);
    target.vx = (target.vx || 0) + centerBias + (Math.random() * 20 - 10);
    target.vz = Math.max(target.vz || 0, 58);
    target.z = Math.max(target.z || 0, 4);
    target.omegaPitch = (target.omegaPitch || 0) - 5.5;
    target.omegaRoll = (target.omegaRoll || 0) + (Math.random() - 0.5) * 6.0;
    target.nutationAmp = 0.22;
    target.nutationFreq = 18;
    target.pushedImpulse = Math.max(target.pushedImpulse || 0, 125);
    target.angularVel = (target.angularVel || 0) + (Math.random() - 0.5) * 4.0;
    target._impulseLockFrames = 12;

    if (this.engine3d && typeof this.engine3d.syncCoinImpulseFrom2D === 'function') {
      this.engine3d.syncCoinImpulseFrom2D(target);
    }

    this.spawnRingParticles(target.x, target.y, '#ffbf36', 12);
    this.addPopup(target.x, target.y - 16, 'FLICK!', '#ffd86b', 0.9);
    if (window.obolAudio) {
      if (window.obolAudio.playPegHit) window.obolAudio.playPegHit(3);
      if (window.obolAudio.playCoinWobbleSettle) window.obolAudio.playCoinWobbleSettle(0.6);
    }
    return true;
  }

  slamCabinet(power = 1.0) {
    this.addShake(11 * power, 0.32);
    if (this.shaderPipeline && this.shaderPipeline.triggerShockwave) {
      this.shaderPipeline.triggerShockwave(0.5, 0.55);
    }
    if (window.obolAudio) {
      window.obolAudio.playSlam();
    }
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      c.vy += (68 + Math.random() * 44) * power;
      c.vx += (Math.random() - 0.5) * 52 * power;
      c.vz = Math.max(c.vz || 0, (42 + Math.random() * 38) * power);
      c.z = Math.min(22, (c.z || 0) + 2.5 * power);
      c.omegaPitch = (c.omegaPitch || 0) + (Math.random() - 0.5) * 7.0 * power;
      c.omegaRoll = (c.omegaRoll || 0) + (Math.random() - 0.5) * 7.0 * power;
      c.nutationAmp = Math.max(c.nutationAmp || 0, 0.22 * power);
      c.nutationFreq = 18;
      c.pushedImpulse = Math.max(c.pushedImpulse || 0, 92 * power);
      c.angularVel += (Math.random() - 0.5) * 4.5;
      c._impulseLockFrames = 12;
      if (this.engine3d && typeof this.engine3d.syncCoinImpulseFrom2D === 'function') {
        this.engine3d.syncCoinImpulseFrom2D(c);
      }
    }
    this.addPopup(this.width * 0.5, 260, 'CABINET SLAM!', '#ff5964', 1.15);
    this.triggerCollectorTaunt('rage', 1.4);
  }

  triggerViralJackpotShowcase() {
    this.overdriveTimer = 10.0;
    this.addShake(14, 0.6);
    if (this.shaderPipeline && this.shaderPipeline.triggerShockwave) {
      this.shaderPipeline.triggerShockwave(0.5, 0.35);
    }
    const showcaseTypes = [
      'sun_bullion', 'silver_drachma', 'plasma_dynamo', 'crimson_sovereign',
      'abyssal_magnetar', 'leech_penny', 'blast_cap', 'voltaic_coil'
    ];
    for (let i = 0; i < 12; i++) {
      const t = showcaseTypes[i % showcaseTypes.length];
      const rx = this.leftWallX + 55 + ((i * 43) % (this.rightWallX - this.leftWallX - 110));
      const ry = 168 + (i % 3) * 24;
      const c = this.spawnCoinOnBed(t, rx, ry, { gilded: true, stackLayer: i % 3, z: (i % 3) * 5.8 }, 'shelf');
      if (c) {
        c.vy = 110;
        c.pushedImpulse = 120;
      }
    }
    this.addPopup(this.width * 0.5, 140, 'OVERDRIVE FEVER CASCADE!', '#ffdf40', 1.3);
  }

  stepPhysics(dt) {
    this.update(dt);
  }

  update(dt) {
    this.syncCanvasDimensions();
    if (!Number.isFinite(dt) || dt <= 0) return;
    const clampedDt = Math.min(0.05, dt);

    if (this.dropCooldown > 0) this.dropCooldown = Math.max(0, this.dropCooldown - clampedDt);
    if (this.flickCooldown > 0) this.flickCooldown = Math.max(0, this.flickCooldown - clampedDt);
    if (this.overdriveTimer > 0) this.overdriveTimer = Math.max(0, this.overdriveTimer - clampedDt);
    if (this.gateFlashTimer > 0) this.gateFlashTimer = Math.max(0, this.gateFlashTimer - clampedDt);
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - clampedDt);

    if (this.guillotineTimer > 0) {
      this.guillotineTimer = Math.max(0, this.guillotineTimer - clampedDt);
    }
    if (this.guillotine && this.guillotine.active) {
      this.guillotine.timer = Math.max(0, this.guillotine.timer - clampedDt);
      const elapsed = 2.4 - this.guillotine.timer;
      if (elapsed < 0.28) {
        this.guillotine.phase = 'drop';
        this.guillotine.bladeY = 48 + (elapsed / 0.28) * 235;
      } else if (elapsed < 1.35) {
        this.guillotine.phase = 'hold';
        this.guillotine.bladeY = 283;
        if (!this.guillotine.sparksSpawned) {
          this.guillotine.sparksSpawned = true;
          this.spawnParticles(this.width * 0.5, 283, '#ff2a38', 28);
          this.spawnRingParticles(this.width * 0.5, 283, '#ff9d3b', 16);
        }
      } else {
        this.guillotine.phase = 'retract';
        const retractT = Math.min(1, (elapsed - 1.35) / 1.05);
        this.guillotine.bladeY = 283 - retractT * 240;
      }
      if (this.guillotine.timer <= 0) {
        this.guillotine.active = false;
      }
    }

    if (this.heraldBanner) {
      this.heraldBanner.life -= clampedDt;
      if (this.heraldBanner.life <= 0) this.heraldBanner = null;
    }
    if (this.achievementBanner) {
      this.achievementBanner.timer -= clampedDt;
      if (this.achievementBanner.timer <= 0) this.achievementBanner = null;
    }

    // Smooth Collector Eye Tracking & Animatronic Jaw Articulation
    this.collectorLookX += (this.aimX - this.collectorLookX) * Math.min(1, clampedDt * 8.5);
    if (this.collectorTalkTimer > 0) {
      this.collectorTalkTimer = Math.max(0, this.collectorTalkTimer - clampedDt);
      this.collectorJawAngle = Math.abs(Math.sin(this.shelfPhase * 9.5)) * 0.38;
    } else {
      this.collectorJawAngle = (Math.sin(this.shelfPhase * 1.2) * 0.5 + 0.5) * 0.06;
    }

    // Moving Skill-Shot Bonus Gate Oscillation (unobstructed corridor at y=128)
    const hasGoldenGate = this.callbacks.hasRelic && this.callbacks.hasRelic('golden_gate');
    this.gateWidth = hasGoldenGate ? 116 : 88;
    this.gatePhase += clampedDt * 1.45;
    const gateTravel = (this.rightWallX - this.leftWallX - this.gateWidth - 36) * 0.5;
    this.gateX = this.width * 0.5 + Math.sin(this.gatePhase) * gateTravel;

    // Update Spinning Brass Bumpers
    for (let i = 0; i < this.bumpers.length; i++) {
      const b = this.bumpers[i];
      b.angle += clampedDt * 1.8;
      if (b.hitTimer > 0) b.hitTimer = Math.max(0, b.hitTimer - clampedDt);
    }

    // 1. Reciprocating Pusher Shelf Kinematics
    const hasOverclock = this.callbacks.hasRelic && this.callbacks.hasRelic('overclocked_piston');
    const bossMod = this.callbacks.getBossModifier ? this.callbacks.getBossModifier() : null;
    let speedMult = 1.0;
    if (hasOverclock) speedMult *= 1.38;
    if (this.overdriveTimer > 0) speedMult *= 1.55;
    if (bossMod && bossMod.name && bossMod.name.includes('FURNACE')) speedMult *= 1.25;

    this.prevShelfPhase = this.shelfPhase;
    this.shelfPhase += clampedDt * this.shelfSpeed * speedMult;

    const prevY = this.shelfY;
    const sinWave = (Math.sin(this.shelfPhase - Math.PI * 0.5) + 1) * 0.5;
    this.shelfY = this.shelfMinY + sinWave * (this.shelfMaxY - this.shelfMinY);
    this.shelfVelY = (this.shelfY - prevY) / clampedDt;
    const shelfDeltaY = this.shelfY - prevY;

    // Detect completion of a full forward push stroke (peak extension near Math.PI)
    const prevCycle = Math.floor((this.prevShelfPhase + Math.PI * 0.5) / (Math.PI * 2));
    const currCycle = Math.floor((this.shelfPhase + Math.PI * 0.5) / (Math.PI * 2));
    if (currCycle > prevCycle) {
      this.pushCycleCount++;
      this.executePushSynergies();
      if (this.callbacks.onPushCycle) {
        this.callbacks.onPushCycle(this.pushCycleCount);
      }
    }

    // 2. Coin Kinematics, 3D Tumbling, Layer Transitions & Direct Piston Contact
    const hasGreasedBed = this.callbacks.hasRelic && this.callbacks.hasRelic('greased_bed');
    const hasBloodMagnet = this.callbacks.hasRelic && this.callbacks.hasRelic('blood_magnet');
    const hasWeldedRails = this.callbacks.hasRelic && this.callbacks.hasRelic('welded_guardrails');
    const shoveMult = hasOverclock ? 1.35 : 1.0;

    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      c.pulsePhase += clampedDt * 4.0;
      if (c.oilTimer > 0) c.oilTimer = Math.max(0, c.oilTimer - clampedDt);
      c._hasSupport = false;
      c._targetZ = 0;

      if (c.layer === 'drop') {
        // Free-falling through upper pachinko drop board with 3D pitch & roll tumbling
        c.vy += 490 * clampedDt;
        c.x += c.vx * clampedDt;
        c.y += c.vy * clampedDt;
        c.angle += (c.angularVel || 0) * clampedDt;
        c.angularVel = (c.angularVel || 0) * 0.985;

        // 3D cylindrical tumbling integration while falling through pegboard (c.y < 142 / drop layer)
        c.pitch = Math.max(-1.35, Math.min(1.35, (c.pitch || 0) + (c.omegaPitch || 0) * clampedDt));
        c.roll = Math.max(-1.35, Math.min(1.35, (c.roll || 0) + (c.omegaRoll || 0) * clampedDt));
        c.omegaPitch = (c.omegaPitch || 0) * Math.pow(0.68, clampedDt);
        c.omegaRoll = (c.omegaRoll || 0) * Math.pow(0.68, clampedDt);
        c.vz = (c.vz || 0) - 240 * clampedDt;
        c.z = Math.max(0, Math.min(26, (c.z || 0) + c.vz * clampedDt));

        // Bounce off drop-zone side walls
        if (c.x - c.radius < this.leftWallX + 6) {
          c.x = this.leftWallX + 6 + c.radius;
          c.vx = Math.abs(c.vx) * 0.65;
          c.angularVel = (c.angularVel || 0) + c.vy * 0.01;
          c.omegaRoll = (c.omegaRoll || 0) + 4.5;
        } else if (c.x + c.radius > this.rightWallX - 6) {
          c.x = this.rightWallX - 6 - c.radius;
          c.vx = -Math.abs(c.vx) * 0.65;
          c.angularVel = (c.angularVel || 0) - c.vy * 0.01;
          c.omegaRoll = (c.omegaRoll || 0) - 4.5;
        }

        // Check Skill-Shot Bonus Gate passage at y = gateY (128)
        if (!c.gatePassed && c.y >= this.gateY - 10 && c.y <= this.gateY + 14) {
          const halfGate = this.gateWidth * 0.5;
          if (Math.abs(c.x - this.gateX) <= halfGate - 4) {
            c.gatePassed = true;
            this.gateFlashTimer = 0.65;
            this.spawnRingParticles(c.x, this.gateY, '#39ff5a', 16);
            this.triggerCollectorTaunt('laugh', 1.3);
            if (this.callbacks.onSkillGateHit) {
              this.callbacks.onSkillGateHit(c);
            }
          } else if (Math.abs(Math.abs(c.x - this.gateX) - halfGate) < c.radius + 4) {
            // Deflect off brass gate post
            const dir = c.x < this.gateX ? -1 : 1;
            c.vx = dir * 95;
            c.vy *= 0.65;
            c.angularVel = (c.angularVel || 0) + dir * 3.5;
            c.omegaRoll = (c.omegaRoll || 0) + dir * 6.5;
            c.vz = Math.max(c.vz || 0, 55);
          }
        }

        // Collide with Brass Drop Pegs
        for (let pIdx = 0; pIdx < this.pegs.length; pIdx++) {
          const peg = this.pegs[pIdx];
          if (peg.hitTimer > 0) peg.hitTimer = Math.max(0, peg.hitTimer - clampedDt);
          const dx = c.x - peg.x;
          const dy = c.y - peg.y;
          const dist = Math.hypot(dx, dy);
          const minDist = c.radius + peg.radius;
          if (dist < minDist && dist > 0.001) {
            const nx = dx / dist;
            const ny = dy / dist;
            c.x = peg.x + nx * minDist;
            c.y = peg.y + ny * minDist;
            const vn = c.vx * nx + c.vy * ny;
            if (vn < 0) {
              c.vx -= (1 + 0.58) * vn * nx;
              c.vy -= (1 + 0.58) * vn * ny;
            }
            if (Math.abs(nx) < 0.38) {
              const deflectDir = pIdx % 2 === 0 ? 1 : -1;
              c.vx += deflectDir * 72;
            }
            c.vx += (Math.random() - 0.5) * 32;
            c.angularVel = (c.angularVel || 0) + nx * 4.2;
            // S1: Strong 3D angular impulses, 180-deg face-over-face flipVel, and vertical pop on peg collisions
            c.omegaPitch = (c.omegaPitch || 0) + ny * 7.8 + (Math.random() - 0.5) * 4.5;
            c.omegaRoll = (c.omegaRoll || 0) + nx * 8.5 + (Math.random() - 0.5) * 4.5;
            c.flipVel = (Math.random() < 0.5 ? 1 : -1) * (10.5 + Math.random() * 6.0);
            c.vz = Math.min(110, Math.max(c.vz || 0, 48 + Math.random() * 52));
            c.z = Math.min(26, Math.max(c.z || 0, 5));

            if (peg.hitTimer <= 0 && (c.pegHits || 0) < 8) {
              peg.hitTimer = 0.25;
              c.pegHits = (c.pegHits || 0) + 1;
              this.spawnParticles(peg.x + nx * peg.radius, peg.y + ny * peg.radius, '#ffd86b', 4);

              const nowPegMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
              if (window.obolAudio && nowPegMs - (this._lastPegAudioTime || 0) > 55) {
                this._lastPegAudioTime = nowPegMs;
                window.obolAudio.playPegHit(c.pegHits);
              }

              if (hasGreasedBed) {
                c.value += 5;
                this.addPopup(c.x, c.y - 10, '+$5 PEG', '#42e66c', 0.82);
              }
              if (bossMod && bossMod.pegDouble && c.pegHits === 1) {
                c.value *= 2;
                this.addPopup(c.x, c.y - 12, 'x2 PEG!', '#ffd86b', 0.88);
              }
            }
            if ((c.pegHits || 0) >= 6) {
              c.vy = Math.max(c.vy, 135);
            }

            // Glass Sovereign shatters after 5 peg hits
            if (c.typeId === 'glass_sovereign' && c.pegHits >= 5) {
              this.shatterCoin(c);
              break;
            }
          }
        }

        // Land onto Upper Pusher Shelf once reaching y >= 166 with a 3D vertical bounce & gyroscopic nutation
        if (c.y >= 166) {
          c.z = Math.max(c.z || 0, 9.5);
          c.vz = -95;
          c.pitch = 0.28;
          c.omegaPitch = -5.2;
          c.nutationAmp = 0.22;
          c.nutationFreq = 18;
          const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (nowMs - (this._lastWobbleAudioTime || 0) > 180) {
            this._lastWobbleAudioTime = nowMs;
            if (window.obolAudio && window.obolAudio.playCoinWobbleSettle) {
              window.obolAudio.playCoinWobbleSettle(0.55);
            }
          }
          if (c.y <= this.shelfY + 8) {
            c.layer = 'shelf';
            c.y = Math.max(this.scraperY + 4 + c.radius, Math.min(c.y, 174));
            c.vy = Math.min(28, Math.max(12, c.vy * 0.22));
            c.vx *= 0.35;
            c.pushedImpulse = Math.max(c.pushedImpulse || 0, 72);
          } else {
            c.layer = 'bed';
            c.vy = Math.min(42, Math.max(18, c.vy * 0.32));
            c.vx *= 0.45;
            c.pushedImpulse = Math.max(c.pushedImpulse || 0, 95);
          }
          // Obsidian Mirror: copies the highest value among all coins currently on the board (excluding Reliquary Chest)
          if (c.typeId === 'obsidian_mirror') {
            let maxVal = c.value || 0;
            for (let m = 0; m < this.coins.length; m++) {
              const other = this.coins[m];
              if (
                other &&
                other !== c &&
                other.typeId !== 'reliquary_chest' &&
                !other.isPrizeTotem &&
                (other.value || 0) > maxVal
              ) {
                maxVal = other.value;
              }
            }
            if (maxVal > c.value) {
              c.value = maxVal;
              this.spawnRingParticles(c.x, c.y, '#d4b8ff', 12);
              this.addPopup(c.x, c.y - 14, `MIRROR: $${Math.round(c.value)}!`, '#d4b8ff', 0.95);
            }
          }
          if (window.obolAudio && window.obolAudio.playCoinClink) {
            window.obolAudio.playCoinClink(0.65);
          }
          // Tactile impact wave: nudge nearby upper-shelf coins directly in the landing column
          for (let j = 0; j < this.coins.length; j++) {
            const other = this.coins[j];
            if (other !== c && !other.collected && !other.lostToFurnace && Math.abs(other.x - c.x) < 64) {
              if (other.layer === 'shelf') {
                other.vy = Math.max(other.vy, 24);
                other.pushedImpulse = Math.max(other.pushedImpulse || 0, 68);
              }
            }
          }
        }
      } else if (c.layer === 'shelf') {
        // Resting on Upper Reciprocating Pusher Shelf:
        // Coins ride 1:1 with the high-friction brushed brass shelf deck in BOTH directions,
        // and are only scraped forward toward the shelf lip when blocked by the fixed Backstop Scraper Bar (scraperY=148) or pushed by newly dropped coins!
        c.y += shelfDeltaY;

        const scraperLimitY = this.scraperY + 4 + c.radius;
        if (c.y < scraperLimitY) {
          const scrapedDist = scraperLimitY - c.y;
          c.y = scraperLimitY;
          c.vy = Math.max(c.vy, Math.min(42, scrapedDist * 12));
          c.pushedImpulse = Math.max(c.pushedImpulse || 0, 78);
        }

        c.x += c.vx * clampedDt;
        c.y += c.vy * clampedDt;
        c.vx *= Math.pow(0.06, clampedDt);
        c.vy *= Math.pow(0.05, clampedDt);
        c.angle += (c.angularVel || 0) * clampedDt;
        c.angularVel = (c.angularVel || 0) * 0.90;

        // Keep shelf coins inside side walls
        if (c.x - c.radius < this.leftWallX + 8) {
          c.x = this.leftWallX + 8 + c.radius;
          c.vx = Math.abs(c.vx) * 0.4;
        } else if (c.x + c.radius > this.rightWallX - 8) {
          c.x = this.rightWallX - 8 - c.radius;
          c.vx = -Math.abs(c.vx) * 0.4;
        }

        // S1: Ledge-Tipping Torque when straddling the Upper Shelf cliff (shelfY)
        if (c.y > this.shelfY - c.radius * 0.45) {
          c.omegaPitch = (c.omegaPitch || 0) + 9.5 * clampedDt;
          c.pitch = Math.max(-1.35, Math.min(1.15, (c.pitch || 0) + c.omegaPitch * clampedDt));
          c.z = Math.max(c.z || 0, 6);
          c.vz = (c.vz || 0) - 180 * clampedDt;
        }

        // Fall off the front edge of the Upper Shelf onto the Lower Bed!
        if (c.y > this.shelfY + 2) {
          c.layer = 'bed';
          c.z = Math.max(c.z || 0, 7.5);
          c.vz = -160;
          c.pitch = Math.max(c.pitch || 0, 0.72);
          c.omegaPitch = Math.max(c.omegaPitch || 0, 8.5);
          c.flipVel = (Math.random() < 0.5 ? 1 : -1) * (10.5 + Math.random() * 6.0);
          c.y = Math.max(c.y, this.shelfY + c.radius * 0.52);
          c.vy = Math.max(32, Math.max(18, this.shelfVelY) * 0.92 * shoveMult);
          c.pushedImpulse = Math.max(c.pushedImpulse || 0, 92 * shoveMult);
        }
      } else {
        // Lower Bed Coin ('bed')
        // TRUE PHYSICAL SHELF CONTACT ONLY (Zero telekinetic forcefield on distant coins!)
        if (this.shelfVelY > 0) {
          const backEdge = c.y - c.radius;
          if (backEdge <= this.shelfY + 3 && c.y >= this.scraperY - 8) {
            c.y = Math.max(c.y, this.shelfY + c.radius + 1.0);
            const pushSpeed = this.shelfVelY * 0.95 * shoveMult;
            c.vy = Math.max(c.vy, pushSpeed);
            c.pushedImpulse = Math.max(c.pushedImpulse || 0, pushSpeed);
          }
        }

        // Prevent lower bed coins from clipping behind the scraper bar
        if (c.y - c.radius < this.scraperY + 6) {
          c.y = this.scraperY + 6 + c.radius;
          c.vy = Math.max(0, c.vy);
        }

        // Lodestone & Abyssal Magnetar center pull
        if (c.typeId === 'lodestone' || c.typeId === 'abyssal_magnetar') {
          const pullRadius = c.typeId === 'abyssal_magnetar' ? 180 : 95;
          const pullForce = c.typeId === 'abyssal_magnetar' ? 42 : 20;
          for (let j = 0; j < this.coins.length; j++) {
            const other = this.coins[j];
            if (other === c || other.layer !== 'bed') continue;
            const dx = c.x - other.x;
            const dy = c.y - other.y;
            const d = Math.hypot(dx, dy);
            if (d < pullRadius && d > 8 && other.x > this.leftWallX + 26 && other.x < this.rightWallX - 26) {
              other.vx += (dx / d) * pullForce * clampedDt;
            }
          }
        }

        // Blood Magnet Relic pulls teetering coins near the front lip
        if (hasBloodMagnet && c.y > this.lipY - 56) {
          c.vy += 68 * clampedDt;
          c.pushedImpulse = Math.max(c.pushedImpulse || 0, 45);
        }

        // Boss Modifier side-gutter pull
        if (bossMod && bossMod.sidePull && c.y > 240 && c.y < this.lipY - 15) {
          const dirFromCenter = c.x < this.width * 0.5 ? -1 : 1;
          const resist = c.brand === 'heavy' ? 0.35 : 1.0;
          c.vx += dirFromCenter * bossMod.sidePull * resist * clampedDt;
        }

        // Integrate position & friction on the bed
        c.x += c.vx * clampedDt;
        c.y += c.vy * clampedDt;
        c.angle += (c.angularVel || 0) * clampedDt;
        c.angularVel = (c.angularVel || 0) * 0.88;

        const isOiled = c.oilTimer > 0 || hasGreasedBed;
        // 3-Layer Stack-Weight Overburden modulates lower-layer bed friction
        const overburdenFactor = 1 / (1 + Math.min(1.5, (c.overburdenWeight || 0) * 0.28));
        const damp = isOiled ? 0.20 : 0.06 * overburdenFactor;
        c.vx *= Math.pow(damp, clampedDt);
        c.vy *= Math.pow(damp, clampedDt);
        c.pushedImpulse = Math.max(0, (c.pushedImpulse || 0) * Math.pow(0.04, clampedDt));
        c.overburdenWeight = 0;

        // Collide with Spinning Brass Bumpers on the lower bed (rigid mechanical deflection, not a free thruster)
        for (let bIdx = 0; bIdx < this.bumpers.length; bIdx++) {
          const b = this.bumpers[bIdx];
          const dx = c.x - b.x;
          const dy = c.y - b.y;
          const dist = Math.hypot(dx, dy);
          const minDist = c.radius + b.radius;
          if (dist < minDist && dist > 0.001) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            c.x += nx * overlap;
            c.y += ny * overlap;
            if ((c.pushedImpulse || 0) > 4 || Math.hypot(c.vx, c.vy) > 8) {
              c.vx += nx * 24;
              c.vy += Math.max(0, ny * 18);
              c.angularVel = (c.angularVel || 0) + (nx > 0 ? 2.5 : -2.5);
              c.omegaPitch = (c.omegaPitch || 0) + ny * 6.0;
              c.omegaRoll = (c.omegaRoll || 0) + nx * 6.5;
              c.vz = Math.max(c.vz || 0, 52);
              if ((c.bumperHits || 0) < 1 && b.hitTimer <= 0) {
                c.bumperHits = (c.bumperHits || 0) + 1;
                b.hitTimer = 0.35;
                const hasHydraulic = this.callbacks.hasRelic && this.callbacks.hasRelic('hydraulic_bumper');
                const addVal = hasHydraulic ? 8 : 2;
                c.value += addVal;
                this.spawnRingParticles(b.x, b.y, '#ffbf36', 8);
                if (hasHydraulic) {
                  this.addPopup(c.x, c.y - 12, `+$${addVal} BUMPER`, '#ffd86b', 0.85);
                }
                if (window.obolAudio) window.obolAudio.playPegHit(2);
              }
            }
          }
        }

        // Guardrails along the side walls (Overdrive Electric Guardrails or Welded Guardrails Relic)
        const railProtected =
          this.overdriveTimer > 0 ||
          (hasWeldedRails && c.y > 250 && c.y < 395);

        if (railProtected) {
          if (c.x - c.radius < this.leftWallX + 2) {
            c.x = this.leftWallX + 2 + c.radius;
            c.vx = Math.abs(c.vx) * 0.7 + 22;
          } else if (c.x + c.radius > this.rightWallX - 2) {
            c.x = this.rightWallX - 2 - c.radius;
            c.vx = -Math.abs(c.vx) * 0.7 - 22;
          }
        } else if (
          c.y > 255 &&
          c.y < this.lipY - 12 &&
          ((c.pushedImpulse || 0) > 2 || c.vy > 4 || Math.abs(c.vx) > 3)
        ) {
          // Outer bevel slope near the Left & Right Furnace Gutters
          if (c.x < this.leftWallX + 34) {
            c.vx -= 68 * clampedDt;
          } else if (c.x > this.rightWallX - 34) {
            c.vx += 68 * clampedDt;
          }
        }
      }
    }

    // 3. Multi-Pass Top-to-Bottom Contact-Chain Wave Solver (8 passes) + 240Hz 3D Disc-Manifold + 3-Layer Vertical Stacking
    if (this.spatialGrid) {
      this.spatialGrid.rebuild(this.coins);
    }
    if (this.physicsWorker && this.workerActive && this.coins.length > 0) {
      const stride = 8;
      const buf = new Float32Array(this.coins.length * stride);
      for (let k = 0; k < this.coins.length; k++) {
        const ck = this.coins[k];
        const base = k * stride;
        buf[base] = ck.x;
        buf[base + 1] = ck.y;
        buf[base + 2] = ck.vx || 0;
        buf[base + 3] = ck.vy || 0;
        buf[base + 4] = ck.radius || 17;
        buf[base + 5] = ck.z || 0;
        buf[base + 6] = ck.mass || 1;
        buf[base + 7] = ck.stackLayer || 0;
      }
      try {
        this.physicsWorker.postMessage(buf, [buf.buffer]);
      } catch (e) {
        // Fallback if transferable postMessage is throttled
      }
    }

    const solverPasses = 8;
    for (let pass = 0; pass < solverPasses; pass++) {
      this.coins.sort((a, b) => {
        const la = a.layer === 'bed' ? 0 : 1;
        const lb = b.layer === 'bed' ? 0 : 1;
        return la - lb || a.y - b.y;
      });

      // Re-enforce direct shelf face contact at the start of each solver pass
      if (this.shelfVelY > 0) {
        for (let i = 0; i < this.coins.length; i++) {
          const c = this.coins[i];
          if (c.layer === 'bed' && c.y - c.radius <= this.shelfY + 4 && c.y >= this.scraperY - 8) {
            c.y = Math.max(c.y, this.shelfY + c.radius + 1.5);
            c.vy = Math.max(c.vy, this.shelfVelY * 0.95 * shoveMult);
            c.pushedImpulse = Math.max(c.pushedImpulse || 0, this.shelfVelY * 0.85 * shoveMult);
          }
        }
      }

      for (let i = 0; i < this.coins.length; i++) {
        const a = this.coins[i];
        if (a.layer === 'drop') continue;

        for (let j = i + 1; j < this.coins.length; j++) {
          const b = this.coins[j];
          if (b.layer !== a.layer) continue;
          if (b.y - a.y > 48) break; // O(N) Sweep-and-Prune y-axis cutoff

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          // Allow slight 2.5D shingle overlap (0.88) on the bed while transmitting rigid contact force
          const overlapFactor = a.layer === 'bed' ? 0.88 : 0.95;
          const minDist = (a.radius + b.radius) * overlapFactor;

          if (dist < minDist && dist > 0.0001) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            // Check Alchemical Fusion on first solver pass
            if (pass === 0 && a.layer === 'bed') {
              if (this.tryAlchemicalFusion(a, b)) continue;
              // Mimic Tooth bite duplication
              if (
                (a.typeId === 'mimic_tooth' && !a.mimicUsed && b.typeId !== 'mimic_tooth') ||
                (b.typeId === 'mimic_tooth' && !b.mimicUsed && a.typeId !== 'mimic_tooth')
              ) {
                const mimic = a.typeId === 'mimic_tooth' ? a : b;
                const victim = mimic === a ? b : a;
                mimic.mimicUsed = true;
                const copyDef = window.TOKEN_CATALOG[victim.typeId];
                if (copyDef) {
                  mimic.typeId = copyDef.id;
                  mimic.id = copyDef.id;
                  mimic.rawId = mimic.typeId;
                  mimic.type = copyDef;
                  mimic.name = copyDef.name;
                  mimic.icon = copyDef.icon;
                  mimic.value = victim.value;
                  mimic.colorPrimary = copyDef.colorPrimary;
                  mimic.colorSecondary = copyDef.colorSecondary;
                  mimic.colorRim = copyDef.colorRim;
                  this.tokenSpriteCache.delete(mimic.uid);
                  this.spawnRingParticles(mimic.x, mimic.y, '#fff9ed', 14);
                  this.addPopup(mimic.x, mimic.y - 14, `MIMIC: ${copyDef.name.toUpperCase()}!`, '#fff9ed', 0.95);
                }
              }
            }

            // Determine contact-chain wave propagation bias (ONLY when upstream coin `a` is actively pushed!)
            const upstreamPushed =
              (a.pushedImpulse || 0) > 2 ||
              a.vy > 5 ||
              (a.layer === 'bed' && this.shelfVelY > 0 && a.y - a.radius <= this.shelfY + 6) ||
              (a.layer === 'shelf' && a.y - a.radius <= this.scraperY + 8);

            // S1: 3-Layer Vertical Coin Stacking (`stackLayer` 0, 1, 2 & `z` Elevation) with Exact 3D Disc-Rim Shingling Inclination & Overburden Weight
            if (ny > 0.08 && (upstreamPushed || overlap > 0.45 || (a.stackLayer || 0) >= 1)) {
              const supportZ = Math.min(18, (b.z || 0) + (b.thickness || 5.8));
              a.stackLayer = Math.min(2, (b.stackLayer || 0) + 1);
              a._hasSupport = true;
              a.supportTimer = 0.24;
              a._targetZ = Math.max(a._targetZ || 0, supportZ);
              a._lastTargetZ = a._targetZ;
              b.overburdenWeight = (b.overburdenWeight || 0) + (a.mass || 1) * 0.45;
              if (pass === 0) {
                if ((a.z || 0) < supportZ) {
                  a.vz = Math.max(a.vz || 0, (supportZ - (a.z || 0)) * 6.5);
                  a.z = Math.min(26, (a.z || 0) + (supportZ - (a.z || 0)) * 0.28);
                }
                // Exact 3D Disc-Rim-on-Disc-Face Shingling Inclination: theta = -arcsin(clamp(h_b / (r_a + r_b), 0.10, 0.38))
                const ratio = Math.max(0.10, Math.min(0.38, (b.thickness || 5.8) / Math.max(20, (a.radius || 17) + (b.radius || 17))));
                const thetaShingle = -Math.asin(ratio);
                a.pitch += (thetaShingle - (a.pitch || 0)) * Math.min(1, clampedDt * 9.0);
                a.roll += ((dx / minDist) * 0.16 - (a.roll || 0)) * Math.min(1, clampedDt * 8.0);
              }
            }

            const idA = a.numId || 1;
            const idB = b.numId || 2;
            const pairKey = idA < idB ? idA * 65536 + idB : idB * 65536 + idA;
            if (pass === 0 && this.warmContactCache) {
              const cachedImp = this.warmContactCache.get(pairKey) || 0;
              if (cachedImp > 0.001) {
                this.warmStartedContactsCount++;
                if (upstreamPushed) {
                  const warmJ = cachedImp * 0.35;
                  b.vy += (warmJ / b.mass) * ny * 0.15;
                }
              }
            }

            const effMassB = b.mass + (b.overburdenWeight || 0) * 0.35;
            const totalMass = a.mass + effMassB;
            let shareA = effMassB / totalMass;
            let shareB = a.mass / totalMass;

            // Bias vertical separation 80% downstream toward the front lip during an active push chain!
            if (ny > 0.12 && upstreamPushed) {
              shareA = 0.20;
              shareB = 0.80;
            }

            // Natural lateral wedge deflection so dense piles fan toward both center lip and side gutters
            const lateralScale = a.layer === 'bed' && upstreamPushed ? 0.68 : 0.82;
            a.x -= nx * overlap * shareA * lateralScale;
            a.y -= ny * overlap * shareA;
            b.x += nx * overlap * shareB * lateralScale;
            b.y += ny * overlap * shareB;

            // Strictly enforce the Brass Backstop Scraper wall during solver passes so shelf/bed coins never push into the drop zone
            if (a.layer === 'shelf') {
              if (a.y - a.radius < this.scraperY + 4) a.y = this.scraperY + 4 + a.radius;
              if (a.x - a.radius < this.leftWallX + 8) a.x = this.leftWallX + 8 + a.radius;
              if (a.x + a.radius > this.rightWallX - 8) a.x = this.rightWallX - 8 - a.radius;
            } else if (a.layer === 'bed' && a.y - a.radius < this.scraperY + 6) {
              a.y = this.scraperY + 6 + a.radius;
            }
            if (b.layer === 'shelf') {
              if (b.y - b.radius < this.scraperY + 4) b.y = this.scraperY + 4 + b.radius;
              if (b.x - b.radius < this.leftWallX + 8) b.x = this.leftWallX + 8 + b.radius;
              if (b.x + b.radius > this.rightWallX - 8) b.x = this.rightWallX - 8 - b.radius;
            } else if (b.layer === 'bed' && b.y - b.radius < this.scraperY + 6) {
              b.y = this.scraperY + 6 + b.radius;
            }

            // Enforce Multi-Tiered Capstan Bumper radial clearance during solver passes so coins never bury the bumpers
            if (a.layer === 'bed' || b.layer === 'bed') {
              for (let bIdx = 0; bIdx < this.bumpers.length; bIdx++) {
                const bmp = this.bumpers[bIdx];
                for (const coinRef of [a, b]) {
                  if (coinRef.layer !== 'bed') continue;
                  const bdx = coinRef.x - bmp.x;
                  const bdy = coinRef.y - bmp.y;
                  const bDist = Math.hypot(bdx, bdy);
                  const bMin = (coinRef.radius || 17) + (bmp.radius || 22) + 5;
                  if (bDist < bMin && bDist > 0.001) {
                    coinRef.x = bmp.x + (bdx / bDist) * bMin;
                    coinRef.y = bmp.y + (bdy / bDist) * bMin;
                    coinRef.stackLayer = 0;
                    coinRef.z = 0;
                  }
                }
              }
            }

            // Propagate downstream velocity & impulse through the touching chain across solver passes
            if (upstreamPushed && ny > 0.12) {
              b.pushedImpulse = Math.max(b.pushedImpulse || 0, (a.pushedImpulse || 0) * 0.90);
              b.vy = Math.max(b.vy, Math.min(34, a.vy * 0.72));
              if (pass === 0) {
                b.vx += nx * 14 * clampedDt;
              }
            }

            // Normal + tangential velocity impulse + rotational spin transfer
            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const vn = rvx * nx + rvy * ny;
            if (vn < 0) {
              const e = Math.min(a.restitution, b.restitution) * 0.45;
              const jImp = (-(1 + e) * vn) / (1 / a.mass + 1 / effMassB);
              if (this.warmContactCache) {
                this.warmContactCache.set(pairKey, jImp);
              }
              a.vx -= (jImp / a.mass) * nx * 0.55;
              a.vy -= (jImp / a.mass) * ny * (upstreamPushed ? 0.25 : 0.65);
              b.vx += (jImp / effMassB) * nx * 0.55;
              b.vy += (jImp / effMassB) * ny * (upstreamPushed ? 0.92 : 0.75);

              // Impart slight rotational spin from tangential contact
              const tx = -ny;
              const ty = nx;
              const vt = rvx * tx + rvy * ty;
              a.angularVel = (a.angularVel || 0) - vt * 0.015;
              b.angularVel = (b.angularVel || 0) + vt * 0.015;
            } else if (pass === 0 && this.warmContactCache) {
              this.warmContactCache.set(pairKey, Math.max(0.25, overlap * 1.5));
            }
          }
        }
      }
    }

    // 3b. S1 Post-Solver 3D Vertical Gravity Collapse, Ledge-Tipping, 180° Coin Flipping, 240Hz Gyroscopic Euler Nutation & Telemetry Tracking
    let activeGyroCount = 0;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c) continue;

      if (c.layer === 'shelf' && c.y > this.shelfY + 2) {
        c.layer = 'bed';
        c.z = Math.max(c.z || 0, 7.5);
        c.vz = -160;
        c.pitch = Math.max(c.pitch || 0, 0.72);
        c.omegaPitch = Math.max(c.omegaPitch || 0, 8.5);
        c.flipVel = (Math.random() < 0.5 ? 1 : -1) * (10.5 + Math.random() * 6.0);
        c.nutationAmp = 0.22;
        c.nutationFreq = 18;
        c.y = Math.max(c.y, this.shelfY + c.radius * 0.52);
        c.vy = Math.max(c.vy, 32 * shoveMult);
        c.pushedImpulse = Math.max(c.pushedImpulse || 0, 92 * shoveMult);
      }

      // 240Hz Gyroscopic Euler Nutation / Coin-Settle Wobble
      if ((c.nutationAmp || 0) > 0.002) {
        c.nutationFreq = Math.min(56, (c.nutationFreq || 18) + 28 * clampedDt);
        c.nutationAngle = (c.nutationAngle || 0) + c.nutationFreq * clampedDt;
        c.nutationAmp *= Math.pow(0.08, clampedDt);
        activeGyroCount++;
      } else {
        c.nutationAmp = 0;
      }

      if (c.layer !== 'drop') {
        const nearShelfCliff = c.layer === 'shelf' && c.y > this.shelfY - c.radius * 0.45;
        const nearLipCliff = c.layer === 'bed' && Math.abs(c.y - this.lipY) < c.radius * 0.95;

        if (!c._hasSupport && (c.supportTimer || 0) > 0) {
          c.supportTimer = Math.max(0, c.supportTimer - clampedDt);
          if (c.supportTimer > 0) {
            c._hasSupport = true;
            c._targetZ = c._lastTargetZ || 5.8;
          }
        }

        if (nearShelfCliff || nearLipCliff) {
          // Ledge-Tipping Torque over Upper Shelf or Lower Lip
          c.omegaPitch = (c.omegaPitch || 0) + 9.5 * clampedDt;
          c.pitch = Math.max(-1.35, Math.min(1.15, (c.pitch || 0) + c.omegaPitch * clampedDt));
          c.z = Math.max(c.z || 0, 6);
          c.vz = (c.vz || 0) - 180 * clampedDt;
          c.z = Math.max(0, Math.min(26, c.z + c.vz * clampedDt));
        } else if (c._hasSupport) {
          // Supported in a 2-layer or 3-layer stack bridge
          c.vz = (c.vz || 0) * Math.pow(0.15, clampedDt);
          c.z = Math.max(0, Math.min(26, (c.z || 0) + ((c._targetZ || 5.8) - (c.z || 0)) * Math.min(1, clampedDt * 10)));
          c.pitch = Math.max(-1.35, Math.min(1.35, (c.pitch || 0) + (-0.22 - (c.pitch || 0)) * Math.min(1, clampedDt * 8)));
          c.roll = (c.roll || 0) * Math.pow(0.08, clampedDt);
          c.omegaPitch = (c.omegaPitch || 0) * Math.pow(0.08, clampedDt);
          c.omegaRoll = (c.omegaRoll || 0) * Math.pow(0.08, clampedDt);
        } else {
          // Unsupported: gravity pulls elevated coins back down to the bed (collapsing unsupported bridges!)
          c.vz = (c.vz || 0) - 280 * clampedDt;
          c.z = Math.max(0, Math.min(26, (c.z || 0) + c.vz * clampedDt));
          if (c.z <= 0.15) {
            if (c.vz < -72) {
              // Crisp 3D metallic bounce when landing on shelf or lower bed
              c.z = 0.25;
              c.vz = -c.vz * 0.36;
              c.omegaPitch = (c.omegaPitch || 0) * -0.45 + (Math.random() - 0.5) * 3.2;
              c.omegaRoll = (c.omegaRoll || 0) + (Math.random() - 0.5) * 3.2;
            } else {
              c.z = 0;
              c.vz = 0;
              c.stackLayer = 0;
            }
          } else if (c.z < 5.0) {
            c.stackLayer = 0;
          } else if (c.z < 10.5) {
            c.stackLayer = Math.min(1, c.stackLayer || 1);
          }
          // Smoothly damp 3D pitch and roll on flat supported surfaces
          c.pitch = (c.pitch || 0) + (c.omegaPitch || 0) * clampedDt;
          c.roll = (c.roll || 0) + (c.omegaRoll || 0) * clampedDt;
          c.omegaPitch = (c.omegaPitch || 0) * Math.pow(0.08, clampedDt);
          c.omegaRoll = (c.omegaRoll || 0) * Math.pow(0.08, clampedDt);
          c.pitch *= Math.pow(0.08, clampedDt);
          c.roll *= Math.pow(0.08, clampedDt);
        }
      }

      // True 180° Face-Over-Face Coin Flipping (flipAngle & flipVel)
      if (c.layer === 'drop' || (c.z || 0) > 1.5) {
        c.flipAngle = (c.flipAngle || 0) + (c.flipVel || 0) * clampedDt;
      } else {
        const nearestFace = Math.round((c.flipAngle || 0) / Math.PI) * Math.PI;
        c.flipAngle = (c.flipAngle || 0) + (nearestFace - (c.flipAngle || 0)) * Math.min(1, clampedDt * 14);
        c.flipVel = (c.flipVel || 0) * Math.pow(0.04, clampedDt);
      }

      c.pitch = Math.max(-1.35, Math.min(1.35, c.pitch || 0));
      c.roll = Math.max(-1.35, Math.min(1.35, c.roll || 0));
      c.z = Math.max(0, Math.min(26, c.z || 0));

      // Smooth 60fps visual interpolation to eliminate discrete contact-solver position jitter
      const posAlpha = Math.min(1, 1 - Math.exp(-36 * clampedDt));
      const rotAlpha = Math.min(1, 1 - Math.exp(-24 * clampedDt));
      if (!Number.isFinite(c.renderX) || Math.hypot(c.x - c.renderX, c.y - c.renderY) > 42) {
        c.renderX = c.x;
        c.renderY = c.y;
        c.renderZ = c.z;
        c.renderPitch = c.pitch;
        c.renderRoll = c.roll;
      } else {
        c.renderX += (c.x - c.renderX) * posAlpha;
        c.renderY += (c.y - c.renderY) * posAlpha;
        c.renderZ += (c.z - (c.renderZ || 0)) * rotAlpha;
        c.renderPitch += (c.pitch - (c.renderPitch || 0)) * rotAlpha;
        c.renderRoll += (c.roll - (c.renderRoll || 0)) * rotAlpha;
      }

      // Increment S1 3D Telemetry Counters
      if (Math.abs(c.pitch) > 0.12 || Math.abs(c.roll) > 0.12 || Math.abs(c.flipVel || 0) > 0.5) {
        this.tumbling3DFrames = (this.tumbling3DFrames || 0) + 1;
      }
      if (c.z >= 3.5 || (c.stackLayer || 0) >= 1) {
        this.multiLayerStacksObserved = (this.multiLayerStacksObserved || 0) + 1;
      }
    }
    this.gyroWobbleCoinsActive = Math.max(this.gyroWobbleCoinsActive || 0, activeGyroCount);

    // 4. Evaluate Front Payout Lip Teetering, Chute Scoring, & Side Furnace Gutters
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c || c.layer !== 'bed') continue;

      // Charon's Ferry Barge: Furnace Gutter Immunity (warps back to upper shelf up to 2 times!)
      if (
        c.typeId === 'charon_barge' &&
        (c.ferrySaves || 0) < 2 &&
        (c.x < this.leftWallX + 8 || c.x > this.rightWallX - 8)
      ) {
        c.ferrySaves = (c.ferrySaves || 0) + 1;
        c.value += 35;
        c.layer = 'shelf';
        c.x = this.width * 0.5 + (Math.random() - 0.5) * 90;
        c.y = this.scraperY + 22;
        c.vx = 0;
        c.vy = 18;
        c.z = 14;
        c.renderX = c.x;
        c.renderY = c.y;
        c.renderZ = c.z;
        this.spawnRingParticles(c.x, c.y, '#38ef7d', 14);
        this.spawnParticles(c.x, c.y, '#5ce1e6', 14);
        this.addPopup(c.x, c.y - 12, 'CHARON WARP +$35!', '#5ce1e6', 0.95);
        continue;
      }

      // Side Furnace Gutter Check (coin center crosses past leftWallX or rightWallX)
      if (c.x < this.leftWallX - 2 || c.x > this.rightWallX + 2) {
        const hasCatcher = this.callbacks.hasRelic && this.callbacks.hasRelic('furnace_catcher');
        if (hasCatcher && Math.random() < 0.4) {
          c.x = this.width * 0.5 + (Math.random() * 120 - 60);
          c.y = 176;
          c.vx = 0;
          c.vy = 40;
          c.layer = 'shelf';
          c.z = 5.8;
          c.stackLayer = 1;
          this.spawnRingParticles(c.x, c.y, '#42e66c', 12);
          this.addPopup(c.x, c.y, 'SLAG RETURNED!', '#42e66c', 0.9);
          if (this.callbacks.onRelicProc) this.callbacks.onRelicProc('furnace_catcher');
          continue;
        }

        // Coin burns in the Side Furnace Gutter
        c.lostToFurnace = true;
        if ((c.value || 0) >= 25) {
          this.triggerCollectorTaunt('laugh', 1.1);
        }
        this.spawnParticles(c.x, c.y, '#ff4422', 16);
        this.addPopup(
          c.x < this.width * 0.5 ? this.leftWallX + 28 : this.rightWallX - 28,
          c.y,
          'BURNED!',
          '#ff5964',
          0.85
        );
        if (window.obolAudio) window.obolAudio.playBurnCoin();

        // Feed any Ossuary Skulls (cursed_skull) on the board
        for (let k = 0; k < this.coins.length; k++) {
          const sk = this.coins[k];
          if (sk && sk.typeId === 'cursed_skull') {
            if (window.TOKEN_MUTATION_HANDLERS && window.TOKEN_MUTATION_HANDLERS.cursed_skull) {
              window.TOKEN_MUTATION_HANDLERS.cursed_skull(sk, 1, window.obolGame);
            } else {
              sk.value += 12;
            }
            this.spawnRingParticles(sk.x, sk.y, '#fbb6ce', 10);
          }
        }

        // Spawn a 3D tumbling furnace-fall coin that plunges into the glowing side gutter trench
        const sideDir = c.x < this.width * 0.5 ? -1 : 1;
        this.fallingCoins.push({
          ...c,
          uid: `${c.uid}_burn_${Date.now()}`,
          fallType: 'furnace',
          x: sideDir < 0 ? Math.min(c.x, this.leftWallX - 8) : Math.max(c.x, this.rightWallX + 8),
          y: c.y,
          vx: sideDir * (32 + Math.random() * 24),
          vy: Math.max(60, c.vy + 45),
          vz: -110,
          z: Math.max(0, c.z || 2),
          pitch: c.pitch || 0.25,
          roll: sideDir * 0.55,
          omegaPitch: (Math.random() - 0.5) * 9.0,
          omegaRoll: sideDir * (12.0 + Math.random() * 5.0),
          angularVel: (c.angularVel || 0) + sideDir * 6.0,
          fallScale: 1.0,
          life: 0.48,
          maxLife: 0.48,
          isReserveCoin: true
        });

        this.coins.splice(i, 1);
        if (this.callbacks.onCoinBurned) {
          this.callbacks.onCoinBurned(c);
        }
        continue;
      }

      // Front Iron Lip Teetering & True 3D Cantilever Overhang Payout Chute Drop-off
      const lipTipThreshold = this.lipY + 5.5;
      if (c.y >= this.lipY - c.radius * 0.95) {
        c.isTeetering = true;
        c.teeterProgress = Math.min(1, Math.max(0, (c.y - (this.lipY - c.radius * 0.95)) / (c.radius * 0.95 + 5.5)));
        c.pitch = Math.max(c.pitch || 0, c.teeterProgress * 0.72);
        c.renderPitch = Math.max(c.renderPitch || 0, c.pitch);
        // Gravitational torque over the beveled front lip
        if (c.y >= this.lipY - c.radius * 0.32) {
          c.vy += 155 * clampedDt;
        }
      } else {
        c.isTeetering = false;
        c.teeterProgress = 0;
      }

      if (c.y >= lipTipThreshold) {
        // Scored over the Iron Lip into the Collection Chute!
        this.spawnParticles(c.x, this.lipY + 10, '#42e66c', 14);
        this.spawnRingParticles(c.x, this.lipY + 6, c.colorRim || '#ffbf36', 10);

        // If Soul-Chained Ducat, yank its tethered partner toward the lip!
        if (c.typeId === 'soul_chain' && c.tetherPartnerUid) {
          const partner = this.coins.find((other) => other.uid === c.tetherPartnerUid);
          if (partner && partner.layer === 'bed') {
            partner.y = Math.max(partner.y, this.lipY - 4);
            partner.vy = 180;
            this.lightningArcs.push({
              x1: c.x,
              y1: this.lipY,
              x2: partner.x,
              y2: partner.y,
              color: '#68f7cc',
              life: 0.35
            });
          }
        }

        // Spawn a 3D tumbling chute-fall coin that accelerates over the cliff & bounces in the Collection Hopper Tray
        this.fallingCoins.push({
          ...c,
          uid: `${c.uid}_chute_${Date.now()}`,
          fallType: 'chute',
          x: c.x,
          y: c.y,
          vx: (c.vx || 0) * 0.45 + (Math.random() - 0.5) * 28,
          vy: Math.max(135, (c.vy || 0) * 1.25 + 95),
          vz: -140,
          z: Math.max(4, c.z || 6),
          pitch: Math.max(0.45, c.pitch || 0.45),
          roll: c.roll || (Math.random() - 0.5) * 0.35,
          omegaPitch: 11.5 + Math.random() * 5.0,
          omegaRoll: (Math.random() - 0.5) * 8.5,
          angularVel: (c.angularVel || 0) + (Math.random() - 0.5) * 5.5,
          fallScale: 1.0,
          bouncedChute: false,
          life: 0.62,
          maxLife: 0.62,
          isReserveCoin: true
        });

        this.coins.splice(i, 1);
        if (this.callbacks.onCoinScored) {
          this.callbacks.onCoinScored(c, false);
        }
      }
    }

    // 4b. Simulate 3D Falling/Tumbling Coins in Collection Chute & Furnace Gutters
    for (let i = this.fallingCoins.length - 1; i >= 0; i--) {
      const fc = this.fallingCoins[i];
      fc.life -= clampedDt;
      if (fc.life <= 0) {
        if (fc.fallType === 'chute') {
          this.chuteCoinPile.push({
            uid: fc.uid + '_pile',
            id: fc.id,
            typeId: fc.typeId,
            rawId: fc.rawId,
            x: Math.max(this.leftWallX + 32, Math.min(this.rightWallX - 32, fc.x)),
            y: Math.min(this.height - 20, Math.max(this.lipY + 84, fc.y)),
            radius: Math.min(16, (fc.radius || 16) * 0.92),
            thickness: fc.thickness || 5.8,
            z: (this.chuteCoinPile.length % 3) * 2.2,
            pitch: (Math.random() - 0.5) * 0.24,
            roll: (Math.random() - 0.5) * 0.24,
            angle: fc.angle || 0,
            colorPrimary: fc.colorPrimary,
            colorSecondary: fc.colorSecondary,
            colorRim: fc.colorRim,
            gilded: fc.gilded,
            isReserveCoin: true
          });
          if (this.chuteCoinPile.length > 16) {
            this.chuteCoinPile.shift();
          }
        }
        this.fallingCoins.splice(i, 1);
        continue;
      }

      if (fc.fallType === 'chute') {
        fc.vy += 820 * clampedDt;
        fc.x += fc.vx * clampedDt;
        fc.y += fc.vy * clampedDt;
        fc.vz = (fc.vz || 0) - 220 * clampedDt;
        fc.z = Math.max(0, (fc.z || 0) + fc.vz * clampedDt);
        fc.pitch = ((fc.pitch || 0) + (fc.omegaPitch || 0) * clampedDt) % (Math.PI * 2);
        fc.roll = ((fc.roll || 0) + (fc.omegaRoll || 0) * clampedDt) % (Math.PI * 2);
        fc.angle = (fc.angle || 0) + (fc.angularVel || 0) * clampedDt;

        const hopperFloorY = this.height - 26;
        if (fc.y >= hopperFloorY) {
          fc.y = hopperFloorY;
          if (!fc.bouncedChute) {
            fc.bouncedChute = true;
            fc.vy = -Math.abs(fc.vy) * 0.42;
            fc.vx *= 0.65;
            fc.omegaPitch *= -0.45;
            fc.omegaRoll *= 0.5;
            this.spawnParticles(fc.x, hopperFloorY - 4, fc.colorRim || '#ffdf40', 5);
          } else {
            fc.vy = 0;
            fc.vx *= 0.7;
            fc.omegaPitch *= 0.7;
            fc.omegaRoll *= 0.7;
          }
        }
      } else {
        // Furnace gutter plunge
        fc.vy += 520 * clampedDt;
        fc.x += fc.vx * clampedDt;
        fc.y += fc.vy * clampedDt;
        fc.vx *= Math.pow(0.25, clampedDt);
        fc.pitch = (fc.pitch || 0) + (fc.omegaPitch || 0) * clampedDt;
        fc.roll = (fc.roll || 0) + (fc.omegaRoll || 0) * clampedDt;
        fc.angle = (fc.angle || 0) + (fc.angularVel || 0) * clampedDt;
        fc.fallScale = Math.max(0.35, fc.life / (fc.maxLife || 0.48));
      }
      fc.renderX = fc.x;
      fc.renderY = fc.y;
      fc.renderZ = fc.z;
      fc.renderPitch = Math.max(-1.3, Math.min(1.3, Math.sin(fc.pitch)));
      fc.renderRoll = Math.max(-1.3, Math.min(1.3, Math.sin(fc.roll)));
    }

    // 5. Update Particles, Popups, Lightning Arcs, & Oil Slicks
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= clampedDt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.isRing) {
        p.radius += p.expandSpeed * clampedDt;
      } else {
        p.x += p.vx * clampedDt;
        p.y += p.vy * clampedDt;
        p.vy += 240 * clampedDt;
      }
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= clampedDt;
      if ((pop.minY || 64) <= 100) {
        pop.y = Math.max(pop.minY || 64, pop.y - 20 * clampedDt);
      }
      if (pop.life <= 0) {
        this.popups.splice(i, 1);
      }
    }

    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      this.lightningArcs[i].life -= clampedDt;
      if (this.lightningArcs[i].life <= 0) {
        this.lightningArcs.splice(i, 1);
      }
    }

    for (let i = this.oilSlicks.length - 1; i >= 0; i--) {
      this.oilSlicks[i].life -= clampedDt;
      if (this.oilSlicks[i].life <= 0) {
        this.oilSlicks.splice(i, 1);
      }
    }
  }

  tryAlchemicalFusion(a, b) {
    if (!window.FUSION_RECIPES || a.isFusedMythic || b.isFusedMythic) return false;
    if (a.isSeeded && b.isSeeded) return false;
    for (let r = 0; r < window.FUSION_RECIPES.length; r++) {
      const rec = window.FUSION_RECIPES[r];
      const matchPrimary =
        (a.typeId === rec.ingredients[0] && b.typeId === rec.ingredients[1]) ||
        (a.typeId === rec.ingredients[1] && b.typeId === rec.ingredients[0]);
      const matchAlt =
        rec.altIngredients &&
        ((a.typeId === rec.altIngredients[0] && b.typeId === rec.altIngredients[1]) ||
          (a.typeId === rec.altIngredients[1] && b.typeId === rec.altIngredients[0]));

      if (matchPrimary || matchAlt) {
        const resDef = window.TOKEN_CATALOG[rec.result];
        if (!resDef) return false;

        const midX = (a.x + b.x) * 0.5;
        const midY = (a.y + b.y) * 0.5;
        const combinedVal = Math.max(resDef.baseValue, Math.round((a.value + b.value) * 1.15));

        const survivor = a;
        survivor.typeId = resDef.id;
        survivor.id = resDef.id;
        survivor.rawId = survivor.typeId;
        survivor.type = resDef;
        survivor.name = resDef.name;
        survivor.icon = resDef.icon;
        survivor.radius = resDef.radius;
        survivor.mass = resDef.mass;
        survivor.value = combinedVal;
        survivor.colorPrimary = resDef.colorPrimary;
        survivor.colorSecondary = resDef.colorSecondary;
        survivor.colorRim = resDef.colorRim;
        survivor.isFusedMythic = true;
        survivor.x = midX;
        survivor.y = midY;
        survivor.vy = Math.max(survivor.vy, 75);
        survivor.pushedImpulse = 110;
        this.tokenSpriteCache.delete(survivor.uid);

        const bIdx = this.coins.indexOf(b);
        if (bIdx !== -1) this.coins.splice(bIdx, 1);

        this.spawnRingParticles(midX, midY, '#00f5d4', 20);
        this.spawnParticles(midX, midY, '#ffd86b', 22);
        this.addShake(18, 0.45);
        if (window.obolGame && window.obolGame.hitStop) {
          window.obolGame.hitStop(0.12);
        }
        this.addPopup(midX, midY, `ALCHEMICAL FUSION: ${resDef.name.toUpperCase()}!`, '#00f5d4', 1.3);
        this.triggerCollectorTaunt('shock', 1.5);
        if (this.callbacks.onTokenFused) {
          this.callbacks.onTokenFused(a, rec);
        }
        return true;
      }
    }
    return false;
  }

  executePushSynergies() {
    const gameRef = window.obolGame || window.game || null;
    const hasVampireFunnel = this.callbacks.hasRelic && this.callbacks.hasRelic('vampire_funnel');
    const hasTeslaCoil = this.callbacks.hasRelic && this.callbacks.hasRelic('tesla_coil');
    const handlers = window.TOKEN_MUTATION_HANDLERS || {};

    // Tesla Lip Coil Relic: every 3rd push zaps the 3 coins closest to the lip
    if (hasTeslaCoil && this.pushCycleCount % 3 === 0) {
      const bedCoins = this.coins
        .filter((c) => c.layer === 'bed')
        .sort((a, b) => b.y - a.y)
        .slice(0, 3);
      if (bedCoins.length > 0) {
        if (this.callbacks.onRelicProc) this.callbacks.onRelicProc('tesla_coil');
        for (const target of bedCoins) {
          target.value += 12;
          target.vy = Math.max(target.vy, 92);
          target.pushedImpulse = Math.max(target.pushedImpulse || 0, 95);
          this.lightningArcs.push({
            x1: this.width * 0.5,
            y1: this.lipY,
            x2: target.x,
            y2: target.y,
            color: '#76e4f7',
            life: 0.35
          });
        }
      }
    }

    if (this.spatialGrid) {
      this.spatialGrid.rebuild(this.coins);
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c || c.layer === 'drop') continue;

      // Find nearby coins within radius via O(1) SpatialHashGrid cell lookup
      const reach =
        c.typeId === 'leech_penny' && hasVampireFunnel
          ? 118
          : c.typeId === 'quicksilver_sovereign'
            ? 115
            : c.typeId === 'alchemist_mercury' || c.typeId === 'infernal_juggernaut'
              ? 95
              : 88;
      const nearby = this.spatialGrid
        ? this.spatialGrid.queryRadius(c.x, c.y, reach, c)
        : this.coins.filter((other) => other && other !== c && other.layer !== 'drop' && Math.hypot(other.x - c.x, other.y - c.y) <= reach);

      if (c.typeId === 'leech_penny' || c.typeId === 'crimson_sovereign') {
        const fn = handlers[c.typeId];
        if (fn && nearby.length > 0) {
          const prevVal = c.value;
          fn(c, nearby, gameRef);
          if (c.value > prevVal) {
            this.spawnRingParticles(c.x, c.y, '#ff5964', 8);
            for (let k = 0; k < Math.min(2, nearby.length); k++) {
              this.lightningArcs.push({
                x1: nearby[k].x,
                y1: nearby[k].y,
                x2: c.x,
                y2: c.y,
                color: '#ff2a38',
                life: 0.28
              });
            }
            if (hasVampireFunnel && this.callbacks.onComboBoost) {
              this.callbacks.onComboBoost(0.2);
            }
          }
        }
      } else if (c.typeId === 'blast_cap') {
        c.fuseCount = (c.fuseCount || 3) - 1;
        if (c.fuseCount <= 0) {
          this.explodeBombCoin(c, nearby, gameRef);
        }
      } else if (c.typeId === 'void_singularity') {
        c.fuseCount = (c.fuseCount || 2) - 1;
        if (c.fuseCount <= 0) {
          c.fuseCount = 2;
          if (handlers.void_singularity) handlers.void_singularity(c, nearby, gameRef);
          for (const target of nearby) {
            const dx = c.x - target.x;
            target.vx += dx * 0.85;
            target.vy = Math.max(target.vy, 95);
            target.pushedImpulse = Math.max(target.pushedImpulse || 0, 95);
          }
          this.spawnRingParticles(c.x, c.y, '#d6bcfa', 16);
        }
      } else if (c.typeId === 'voltaic_coil' || c.typeId === 'plasma_dynamo') {
        const fn = handlers[c.typeId];
        if (fn && nearby.length > 0) {
          fn(c, nearby, gameRef);
          for (let k = 0; k < Math.min(3, nearby.length); k++) {
            const target = nearby[k];
            this.lightningArcs.push({
              x1: c.x,
              y1: c.y,
              x2: target.x,
              y2: target.y,
              color: '#76e4f7',
              life: 0.32
            });
          }
        }
      } else if (c.typeId === 'oil_cask') {
        this.oilSlicks.push({ x: c.x, y: c.y, radius: 42, life: 4.5, maxLife: 4.5 });
        for (const target of nearby) {
          target.oilTimer = 4.0;
        }
      } else if (c.typeId === 'alchemist_mercury') {
        const targets = nearby.filter((other) => Math.hypot(other.x - c.x, other.y - c.y) < 95).slice(0, 3);
        if (targets.length > 0) {
          for (const other of targets) {
            other.oilTimer = 5.0;
            other.value += 12;
          }
          this.oilSlicks.push({ x: c.x, y: c.y, radius: 46, life: 5.0, maxLife: 5.0 });
          this.spawnRingParticles(c.x, c.y, '#5ce1e6', 10);
          this.addPopup(c.x, c.y - 12, '+$12 QUICKSILVER!', '#5ce1e6', 0.9);
        }
      } else if (c.typeId === 'hellfire_ducat') {
        const targets = nearby.filter((other) => Math.hypot(other.x - c.x, other.y - c.y) < 88);
        if (targets.length > 0) {
          for (const other of targets) {
            other.value += 10;
            this.spawnParticles(other.x, other.y, '#ff5964', 4);
          }
          this.spawnRingParticles(c.x, c.y, '#ff852b', 12);
          this.addPopup(c.x, c.y - 12, '+$10 HELLFIRE!', '#ff852b', 0.9);
        }
      } else if (c.typeId === 'quicksilver_sovereign') {
        const targets = nearby.filter((other) => Math.hypot(other.x - c.x, other.y - c.y) < 115);
        if (targets.length > 0) {
          for (const other of targets) {
            other.value += 20;
            other.oilTimer = 6.0;
          }
          this.oilSlicks.push({ x: c.x, y: c.y, radius: 58, life: 6.0, maxLife: 6.0 });
          this.spawnRingParticles(c.x, c.y, '#38ef7d', 14);
          this.addPopup(c.x, c.y - 12, '+$20 LEVIATHAN!', '#38ef7d', 0.95);
        }
      } else if (c.typeId === 'infernal_juggernaut') {
        const targets = nearby.filter((other) => other.layer === 'bed' || c.layer === 'shelf');
        if (targets.length > 0) {
          for (const other of targets) {
            other.vy += 42;
            other.value += 15;
            other.pushedImpulse = Math.max(other.pushedImpulse || 0, 88);
          }
          this.spawnRingParticles(c.x, c.y, '#ff3b4e', 16);
          this.addPopup(c.x, c.y - 12, 'JUGGERNAUT PULSE!', '#ff3b4e', 0.95);
        }
      } else if (c.typeId === 'soul_chain') {
        if (!c.tetherPartnerUid && nearby.length > 0) {
          c.tetherPartnerUid = nearby[0].uid;
        }
        if (handlers.soul_chain && nearby.length > 0) {
          handlers.soul_chain(c, nearby, gameRef);
        }
      } else if (c.typeId === 'sun_bullion' || c.typeId === 'abyssal_magnetar') {
        const fn = handlers[c.typeId];
        if (fn && nearby.length > 0) {
          fn(c, nearby, gameRef);
        }
      } else if (c.typeId === 'necro_die') {
        const hasOssuaryDice = this.callbacks.hasRelic && this.callbacks.hasRelic('ossuary_dice');
        const rolls = hasOssuaryDice ? 2 : 1;
        if (hasOssuaryDice) {
          c.value += 10;
          if (this.callbacks.onRelicProc) this.callbacks.onRelicProc('ossuary_dice');
        }
        for (let rIdx = 0; rIdx < rolls; rIdx++) {
          const roll = 1 + Math.floor(Math.random() * 6);
          c.lastDieRoll = roll;
          if (roll <= 3) {
            for (const target of nearby.slice(0, 3)) {
              target.value += hasOssuaryDice ? 10 : 4;
            }
          } else if (roll <= 5) {
            for (const target of nearby) {
              if (hasOssuaryDice) target.value += 10;
              target.vy = Math.max(target.vy, 88);
              target.pushedImpulse = Math.max(target.pushedImpulse || 0, 90);
            }
          } else {
            this.spawnCoinOnBed('copper_obol', c.x + (Math.random() * 24 - 12), Math.max(175, c.y - 18), null, c.layer);
            if (this.callbacks.onComboBoost) this.callbacks.onComboBoost(0.35);
            this.addPopup(c.x, c.y - 12, 'DIE [6]: +OBOL!', '#fff9ed', 0.9);
          }
        }
      }
    }
  }

  shatterCoin(coin) {
    this.spawnParticles(coin.x, coin.y, '#99f6ff', 20);
    this.addPopup(coin.x, coin.y, 'SHATTERED!', '#99f6ff', 0.95);
    if (window.obolAudio) window.obolAudio.playBurnCoin();
    const idx = this.coins.indexOf(coin);
    if (idx !== -1) this.coins.splice(idx, 1);
  }

  explodeBombCoin(bomb, nearby, gameRef) {
    if (window.TOKEN_MUTATION_HANDLERS && window.TOKEN_MUTATION_HANDLERS.blast_cap) {
      window.TOKEN_MUTATION_HANDLERS.blast_cap(bomb, nearby, gameRef);
    }
    for (let i = 0; i < this.coins.length; i++) {
      const other = this.coins[i];
      if (!other || other === bomb || other.layer === 'drop') continue;
      const dx = other.x - bomb.x;
      const dy = other.y - bomb.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 110 && dist > 0.001) {
        const force = (1 - dist / 110) * 105;
        // Blast coins radial/downward toward the front Payout Lip without teleporting
        other.vx += (dx / dist) * force * 0.42;
        other.vy = Math.max(other.vy, Math.abs((dy / dist) * force * 0.68) + 62);
        other.pushedImpulse = Math.max(other.pushedImpulse || 0, 86);
      }
    }

    this.spawnRingParticles(bomb.x, bomb.y, '#ff852b', 22);
    this.spawnParticles(bomb.x, bomb.y, '#ffbf36', 26);
    this.addShake(11, 0.32);
    this.addPopup(bomb.x, bomb.y, 'BLAST DETONATION!', '#ff852b', 1.1);
    if (window.obolAudio && window.obolAudio.playSlam) {
      window.obolAudio.playSlam();
    }

    const idx = this.coins.indexOf(bomb);
    if (idx !== -1) this.coins.splice(idx, 1);
  }

  consumeCoin(coin) {
    const idx = this.coins.indexOf(coin);
    if (idx !== -1) this.coins.splice(idx, 1);
  }

  spawnParticles(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 150;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 2.2 + Math.random() * 3.2,
        color,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        isRing: false
      });
    }
  }

  spawnRingParticles(x, y, color, count = 12) {
    this.particles.push({
      x,
      y,
      radius: 8,
      expandSpeed: 125,
      color,
      life: 0.38,
      maxLife: 0.38,
      isRing: true
    });
    this.spawnParticles(x, y, color, Math.min(10, Math.floor(count * 0.6)));
  }

  render(nextTokenDef) {
    this.syncCanvasDimensions();
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (this.shakeTime > 0) {
      const mag = this.shakeMagnitude * (this.shakeTime / 0.4) * (this.shakeTime / 0.4); // Quadratic decay
      const t = performance.now() * 0.001;
      const shakeX = mag * Math.sin(t * 31.0);
      const shakeY = mag * Math.sin(t * 43.0);
      ctx.translate(shakeX, shakeY);
    }

    // Sort Overlapping 3D Stacked & Shingled Coin Pile (Sorted by tier, stackLayer, z elevation, then y)
    this.coins.sort(
      (a, b) =>
        ((a.layer === 'shelf' ? 1 : 0) - (b.layer === 'shelf' ? 1 : 0)) ||
        ((a.stackLayer || 0) - (b.stackLayer || 0)) ||
        ((a.z || 0) - (b.z || 0)) ||
        (a.y - b.y)
    );
    this.updateHoveredCoin(this.mouseX, this.mouseY);

    const useFull3D = Boolean(this.engine3d && (this.engine3d.active || this.engine3d.enabled));
    const gl3dCanvas = useFull3D ? this.engine3d.render(this) : null;

    if (gl3dCanvas) {
      ctx.fillStyle = '#040202';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.drawImage(gl3dCanvas, 0, 0, this.width, this.height);
    } else {
      // 2D Fallback when WebGL is unavailable
      // 1. Cabinet Architecture, Upper Pegboard Recess, Clockwork Cogs, Pistons & Loaded Upper Pusher Shelf
      this.drawCabinet(ctx);

      // 2. Oil Slick Puddles on the Lower Bed
      for (let i = 0; i < this.oilSlicks.length; i++) {
        const s = this.oilSlicks[i];
        const alpha = Math.min(0.65, (s.life / s.maxLife) * 0.65);
        ctx.save();
        ctx.fillStyle = `rgba(12, 9, 7, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.radius, s.radius * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(217, 161, 87, ${alpha * 0.55})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // 3. Welded Guardrails / Overdrive Electric Guardrails
      this.drawElectricGuardrails(ctx);

      // 4. Moving Skill-Shot Bonus Gate (y = 128)
      this.drawSkillGate(ctx);

      // 5. Spinning Brass Bumpers on the Lower Bed
      this.drawBumpers(ctx);

      for (let i = 0; i < this.coins.length; i++) {
        this.drawCoin25D(ctx, this.coins[i], false);
      }

      // 7b. Render Persistent Scored Coins in the Bottom Collection Hopper Tray & Active 3D Tumbling Falling Coins
      if (this.chuteCoinPile && this.chuteCoinPile.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(this.leftWallX + 10, this.lipY + 16, this.rightWallX - this.leftWallX - 20, this.height - this.lipY - 22);
        ctx.clip();
        for (let i = 0; i < this.chuteCoinPile.length; i++) {
          this.drawCoin25D(ctx, this.chuteCoinPile[i], false);
        }
        ctx.restore();
      }
      if (this.fallingCoins && this.fallingCoins.length > 0) {
        for (let i = 0; i < this.fallingCoins.length; i++) {
          const fc = this.fallingCoins[i];
          ctx.save();
          if (fc.fallType === 'furnace') {
            ctx.globalAlpha = Math.max(0.15, fc.life / (fc.maxLife || 0.48));
          }
          this.drawCoin25D(ctx, fc, false);
          ctx.restore();
        }
      }
    }

    if (!useFull3D) {
      // 6. 2D Fallback Soul-Chain Magnetic Tethers between Linked Coins (in 3D mode rendered as 3D volumetric energy tubes)
      for (let i = 0; i < this.coins.length; i++) {
        const c = this.coins[i];
        if (c && c.typeId === 'soul_chain' && c.tetherPartnerUid) {
          const partner = this.coins.find((other) => other && other.uid === c.tetherPartnerUid);
          if (partner) {
            const p1 = this.project3D(c.x, c.y, 10);
            const p2 = this.project3D(partner.x, partner.y, 10);
            if (p1.visible && p2.visible) {
              ctx.save();
              ctx.strokeStyle = 'rgba(104, 247, 204, 0.72)';
              ctx.lineWidth = 2.2;
              ctx.setLineDash([5, 4]);
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      }

      // 8. 2D Fallback Chain Lightning & Blood Siphon Arcs (in 3D mode rendered as 3D volumetric energy tubes)
      for (let i = 0; i < this.lightningArcs.length; i++) {
        const arc = this.lightningArcs[i];
        const p1 = this.project3D(arc.x1, arc.y1, 10);
        const p2 = this.project3D(arc.x2, arc.y2, 10);
        if (!p1.visible && !p2.visible) continue;
        ctx.save();
        ctx.strokeStyle = arc.color || '#76e4f7';
        ctx.lineWidth = 2.4;
        ctx.shadowColor = arc.color || '#76e4f7';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        const midX = (p1.x + p2.x) * 0.5 + (Math.random() - 0.5) * 18;
        const midY = (p1.y + p2.y) * 0.5 + (Math.random() - 0.5) * 18;
        ctx.lineTo(midX, midY);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (!this.cleanBeautyShotMode) {
      // 9. 3D-Projected Particles & Shockwave Rings
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const pt = this.project3D(p.x, p.y, 10);
        if (!pt.visible) continue;
        const alpha = Math.max(0, p.life / (p.maxLife || 0.5));
        const pScale = pt.scale || 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (p.isRing) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, p.radius * pScale, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, p.size * pScale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 10. Top Aiming Drop Reticle & Next Token Preview
      this.drawDropReticle(ctx, nextTokenDef);

      // 11. 3D-Projected Hovered Coin Inspection Ring (Right-Click Flick Hint)
      if (this.hoveredCoin && this.hoveredCoin.layer !== 'drop') {
        const hc = this.hoveredCoin;
        const hcPt = this.project3D(hc.x, hc.y, (hc.z || 0) + 8);
        if (hcPt.visible) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 223, 64, 0.85)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(hcPt.x, hcPt.y, ((hc.radius || 17) + 5) * (hcPt.scale || 1), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 12. 3D-Projected Collision-Avoided Floating Popups
      for (let i = 0; i < this.popups.length; i++) {
        const pop = this.popups[i];
        const popPt = this.project3D(pop.x, pop.y, 18);
        if (!popPt.visible) continue;
        const t = 1 - pop.life / pop.maxLife;
        const easeOut = 1 - Math.pow(1 - Math.min(1, t * 3.5), 3);
        const alpha = pop.life < 0.25 ? pop.life / 0.25 : 1.0;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(popPt.x, popPt.y);
        ctx.scale(pop.scale * easeOut, pop.scale * easeOut);

        ctx.font = 'bold 12px "JetBrains Mono", "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(pop.text).width + 14;

        ctx.fillStyle = 'rgba(8, 6, 5, 0.86)';
        ctx.strokeStyle = pop.color || '#ffbf36';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(-w * 0.5, -10, w, 20, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pop.color || '#ffbf36';
        ctx.fillText(pop.text, 0, 0.5);
        ctx.restore();
      }

      // 13. Top Herald Banner & Achievement Toast Ribbon
      this.drawHeraldBanner(ctx);
      this.drawAchievementBanner(ctx);

      // 14. Clipped Guillotine Finger-Sever Cutscene Overlay
      if ((this.guillotine && this.guillotine.active) || this.guillotineTimer > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 46, this.width, this.height - 46);
        ctx.clip();
        this.drawGuillotineOverlay(ctx);
        ctx.restore();
      }

      // 15. 3D-Projected Crisp Floating Diegetic Inspector Callout (NAME • $VALUE) above Hovered Coin
      if (this.hoveredCoin && this.hoveredCoin.layer !== 'drop') {
        const hc = this.hoveredCoin;
        const hcPt = this.project3D(hc.x, hc.y, (hc.z || 0) + 8);
        if (hcPt.visible) {
          const hcName = String(hc.name || (hc.type && hc.type.name) || hc.typeId || 'OBOL').toUpperCase();
          const hcVal = `$${Math.round(hc.value || 10)}`;
          const calloutText = `${hcName} • ${hcVal}`;

          ctx.save();
          ctx.font = 'bold 10.5px "JetBrains Mono", "Share Tech Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const boxW = Math.max(92, ctx.measureText(calloutText).width + 18);
          const boxH = 20;
          const minCalloutX = useFull3D ? boxW * 0.5 + 12 : this.leftWallX + boxW * 0.5 + 6;
          const maxCalloutX = useFull3D ? this.width - boxW * 0.5 - 12 : this.rightWallX - boxW * 0.5 - 6;
          const hx = Math.max(minCalloutX, Math.min(maxCalloutX, hcPt.x));
          const hy = Math.max(32, hcPt.y - (hc.radius || 17) * (hcPt.scale || 1) - 16);

          ctx.fillStyle = 'rgba(10, 7, 5, 0.94)';
          ctx.strokeStyle = hc.gilded ? '#ffea85' : hc.colorRim || '#ffcf70';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.roundRect(hx - boxW * 0.5, hy - boxH * 0.5, boxW, boxH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fff5e4';
          ctx.fillText(calloutText, hx, hy + 0.5);
          ctx.restore();
        }
      }
    }

    ctx.restore();

    // 18. Full-Screen WebGL GLSL Post-Processing Shader Pass (S2)
    if (typeof window !== 'undefined' && window.CabinetShaderPipeline) {
      if (!this.shaderPipeline && this.canvas && this.canvas.parentElement) {
        this.shaderPipeline = new window.CabinetShaderPipeline(this.canvas);
      }
      if (this.shaderPipeline) {
        const gameRef = window.obolGame || window.game;
        const tiltRatio = gameRef ? (gameRef.tiltGauge || gameRef.tiltMeter || 0) / 100 : (this.collectorTilt || 0);
        const crtEnabled = Boolean(this.shaderPipeline._crtEnabled);
        const needsPostPass =
          !useFull3D ||
          (this.shaderPipeline.framesRendered || 0) < 2 ||
          crtEnabled;
        if (needsPostPass) {
          if (this.shaderPipeline.glCanvas) {
            this.shaderPipeline.glCanvas.style.opacity = '1';
          }
          this.shaderPipeline.render(this, tiltRatio, crtEnabled);
        } else {
          if (this.shaderPipeline.glCanvas) {
            this.shaderPipeline.glCanvas.style.opacity = '0';
          }
          if (typeof this.shaderPipeline._syncLiveTelemetry === 'function') {
            this.shaderPipeline._syncLiveTelemetry(this, tiltRatio, crtEnabled);
          }
        }
      }
    }
  }

  draw(nextTokenDef) {
    return this.render(nextTokenDef);
  }

  drawCoin3DReadouts(ctx) {
    // 1. 3D-Projected Skill-Shot Bonus Gate Readout Pill (BONUS GATE x2)
    const gatePt = this.project3D(this.gateX, (this.gateY || 126) - 18, 28);
    if (gatePt && gatePt.visible && gatePt.y >= -20 && gatePt.y <= this.height + 20) {
      const isFlashing = this.gateFlashTimer > 0;
      const pillW = 92;
      const pillH = 16;
      ctx.save();
      ctx.fillStyle = isFlashing ? 'rgba(28, 46, 18, 0.94)' : 'rgba(6, 18, 10, 0.90)';
      ctx.strokeStyle = isFlashing ? '#ffea85' : '#39ff5a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(gatePt.x - pillW * 0.5, gatePt.y - pillH * 0.5, pillW, pillH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isFlashing ? '#ffffff' : '#eaffef';
      ctx.font = 'bold 8.5px "JetBrains Mono", "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BONUS GATE x2', gatePt.x, gatePt.y + 0.5);
      ctx.restore();
    }

    // 2. 3D-Projected Bullion Vault Chute Plaque
    const vaultPt = this.project3D(this.width * 0.5, this.lipY + 26, 8);
    if (vaultPt && vaultPt.visible && vaultPt.y >= 40 && vaultPt.y <= this.height + 24) {
      const plateW = 336;
      const plateH = 20;
      const plateX = vaultPt.x - plateW * 0.5;
      const plateY = vaultPt.y - plateH * 0.5;
      ctx.save();
      const plateGrad = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateH);
      plateGrad.addColorStop(0, 'rgba(46, 32, 18, 0.92)');
      plateGrad.addColorStop(0.5, 'rgba(23, 16, 9, 0.95)');
      plateGrad.addColorStop(1, 'rgba(38, 26, 14, 0.92)');
      ctx.fillStyle = plateGrad;
      ctx.strokeStyle = '#c89646';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(plateX, plateY, plateW, plateH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffd875';
      ctx.font = 'bold 10.5px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▼ BULLION VAULT — COINS OVER THE LIP PAY QUOTA ▼', vaultPt.x, vaultPt.y + 0.5);
      ctx.restore();
    }

    // 3. 3D-Projected Reliquary Chest, Fused Mythic & Blast Cap Readouts
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c) continue;
      const rx = typeof c.renderX === 'number' ? c.renderX : c.x;
      const ry = typeof c.renderY === 'number' ? c.renderY : c.y;
      const rz = typeof c.renderZ === 'number' ? c.renderZ : (c.z || 0);

      if (c.typeId === 'reliquary_chest' || c.isChest) {
        const chestPt = this.project3D(rx, ry, 28);
        if (!chestPt || !chestPt.visible) continue;
        ctx.save();
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(10, 6, 4, 0.88)';
        ctx.strokeStyle = '#ffd266';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(chestPt.x - 44, chestPt.y - 20, 88, 16, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe58f';
        ctx.fillText(`CHEST • $${Math.round(c.value || 75)}`, chestPt.x, chestPt.y - 12);
        ctx.restore();
      } else if (c.isFusedMythic) {
        const mythicPt = this.project3D(rx, ry, ((c.stackLayer || 0) * 6 + rz) + 8);
        if (!mythicPt || !mythicPt.visible) continue;
        const r = (c.radius || 18) * (mythicPt.scale || 1);
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 245, 212, 0.72)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.ellipse(mythicPt.x, mythicPt.y - 2, r + 3, (r + 3) * 0.88, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (c.typeId === 'blast_cap' && typeof c.fuseCount === 'number') {
        const fusePt = this.project3D(rx, ry, ((c.stackLayer || 0) * 6 + rz) + 8);
        if (!fusePt || !fusePt.visible) continue;
        ctx.save();
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff5964';
        ctx.fillText(`[${c.fuseCount}]`, fusePt.x, fusePt.y - (c.radius || 16) - 4);
        ctx.restore();
      }
    }
  }

  drawCabinet(ctx) {
    if (
      !this.staticCabinetCanvas ||
      this.staticCabinetWidth !== this.width ||
      this.staticCabinetHeight !== this.height
    ) {
      this.buildStaticCabinetCache();
    }
    ctx.drawImage(this.staticCabinetCanvas, 0, 0, this.width, this.height);

    const cx = this.width * 0.5;
    const bedWidth = this.rightWallX - this.leftWallX;
    const shelfTopY = 148;
    const strokeFrac = Math.max(0, Math.min(1, (this.shelfY - this.shelfMinY) / Math.max(1, this.shelfMaxY - this.shelfMinY)));
    const shelfVisY = this.shelfY;
    const shelfH = Math.max(40, shelfVisY - shelfTopY);
    const yokeY = 82 + strokeFrac * 46;

    // 1. Upper Pegboard Recess (y = 46..this.shelfY)
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.leftWallX, 46, bedWidth, Math.max(20, shelfTopY - 44));
    ctx.clip();

    const recessGrad = ctx.createLinearGradient(0, 46, 0, this.shelfMaxY);
    recessGrad.addColorStop(0, '#0a0705');
    recessGrad.addColorStop(0.55, '#16100c');
    recessGrad.addColorStop(1, '#090604');
    ctx.fillStyle = recessGrad;
    ctx.fillRect(this.leftWallX, 46, bedWidth, this.shelfMaxY - 46);

    if (this.texBackplate && this.texBackplate.complete && this.texBackplate.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.drawImage(this.texBackplate, this.leftWallX, 46, this.rightWallX - this.leftWallX, this.shelfMaxY - 46);
      ctx.restore();
    }

    // 3 Animated Rotating Brass Clockwork Cogwheels (rotating slowly with this.shelfPhase * 0.35)
    const cogs = [
      { x: cx - 134, y: 84, r: 23, teeth: 12, dir: 1 },
      { x: cx, y: 78, r: 29, teeth: 14, dir: -1 },
      { x: cx + 134, y: 84, r: 23, teeth: 12, dir: 1 }
    ];
    for (let i = 0; i < cogs.length; i++) {
      const cg = cogs[i];
      const cogAngle = this.shelfPhase * 0.35 * cg.dir + i * 0.4;
      ctx.save();
      ctx.translate(cg.x, cg.y);
      ctx.rotate(cogAngle);

      // Gear teeth ring
      ctx.fillStyle = '#5e4122';
      ctx.strokeStyle = '#9c713b';
      ctx.lineWidth = 1.1;
      for (let t = 0; t < cg.teeth; t++) {
        const ta = (t / cg.teeth) * Math.PI * 2;
        ctx.save();
        ctx.rotate(ta);
        ctx.fillRect(-3, -cg.r - 4.5, 6, 6);
        ctx.strokeRect(-3, -cg.r - 4.5, 6, 6);
        ctx.restore();
      }

      // Outer brass cogwheel rim
      const cogGrad = ctx.createRadialGradient(-4, -4, 3, 0, 0, cg.r);
      cogGrad.addColorStop(0, '#b58442');
      cogGrad.addColorStop(0.65, '#634321');
      cogGrad.addColorStop(1, '#26180a');
      ctx.fillStyle = cogGrad;
      ctx.beginPath();
      ctx.arc(0, 0, cg.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d4a15a';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Inner recessed hub & 4 clockwork spokes
      ctx.fillStyle = '#140d08';
      ctx.beginPath();
      ctx.arc(0, 0, cg.r * 0.66, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#8f6532';
      ctx.lineWidth = 3.2;
      for (let s = 0; s < 4; s++) {
        const sa = (s * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(sa) * 4, Math.sin(sa) * 4);
        ctx.lineTo(Math.cos(sa) * (cg.r * 0.68), Math.sin(sa) * (cg.r * 0.68));
        ctx.stroke();
      }

      // Center brass axle bolt
      ctx.fillStyle = '#d4a15a';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#291a0c';
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2 Heavy Vertical Hydraulic Piston Drive Rods & Moving Crosshead Yoke driving shelfTopY
    const pistonOffsets = [-92, 92];
    for (let i = 0; i < pistonOffsets.length; i++) {
      const px = cx + pistonOffsets[i];
      const rodLen = Math.max(12, shelfTopY - 46);

      // Machined steel inner hydraulic ram rod (46..shelfTopY)
      const ramGrad = ctx.createLinearGradient(px - 7, 0, px + 7, 0);
      ramGrad.addColorStop(0, '#1e1916');
      ramGrad.addColorStop(0.35, '#8c7e70');
      ramGrad.addColorStop(0.55, '#d6c7b8');
      ramGrad.addColorStop(1, '#17120e');
      ctx.fillStyle = ramGrad;
      ctx.fillRect(px - 6, 46, 12, rodLen);

      // Reciprocating brass hydraulic piston crosshead collar moving 1:1 with strokeFrac (yokeY)
      ctx.fillStyle = '#3b2614';
      ctx.strokeStyle = '#ffcf70';
      ctx.lineWidth = 1.2;
      ctx.fillRect(px - 11, yokeY - 6, 22, 12);
      ctx.strokeRect(px - 11, yokeY - 6, 22, 12);

      // Outer heavy cast-iron hydraulic sleeve cylinder at top (46..84)
      const cylGrad = ctx.createLinearGradient(px - 11, 0, px + 11, 0);
      cylGrad.addColorStop(0, '#1c120b');
      cylGrad.addColorStop(0.5, '#6e4d2c');
      cylGrad.addColorStop(1, '#170e08');
      ctx.fillStyle = cylGrad;
      ctx.fillRect(px - 10, 46, 20, 36);
      ctx.strokeStyle = '#c49248';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(px - 10, 46, 20, 36);

      // Brass pressure collar & lower clevis joint bolted into shelfTopY
      ctx.fillStyle = '#d49b4b';
      ctx.fillRect(px - 12, 78, 24, 6);
      ctx.fillRect(px - 11, shelfTopY - 8, 22, 8);
    }
    ctx.restore();

    // 2. Diegetic Animated Collector Presence in Upper Booth (y = 2..46)
    this.drawCollectorPresence(ctx);

    // 3. Reciprocating Upper Pusher Shelf (Rigid 115px Damascus-Steel Plate sliding out from under Fixed Brass Scraper Bar at shelfTopY)
    ctx.save();
    // Cast drop shadow onto the lower bed immediately in front of the shelf lip
    const shadowGrad = ctx.createLinearGradient(0, shelfVisY, 0, shelfVisY + 28);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.84)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(this.leftWallX + 2, shelfVisY, bedWidth - 4, 28);

    // Rigidly translating Shelf Deck Surface (anchored to shelfVisY - 115 .. shelfVisY, clipped at shelfTopY)
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.leftWallX + 4, shelfTopY, bedWidth - 8, shelfH);
    ctx.clip();

    const deckGrad = ctx.createLinearGradient(0, shelfVisY - 115, 0, shelfVisY);
    deckGrad.addColorStop(0, '#18120e');
    deckGrad.addColorStop(0.55, '#2e2219');
    deckGrad.addColorStop(0.88, '#4f3a27');
    deckGrad.addColorStop(1, '#24180e');
    ctx.fillStyle = deckGrad;
    ctx.fillRect(this.leftWallX + 4, shelfVisY - 115, bedWidth - 8, 115);

    // Composite Runware Brushed Damascus Steel Plate Texture moving 1:1 with the shelf
    if (this.texIron && this.texIron.complete && this.texIron.naturalWidth > 0) {
      try {
        ctx.save();
        ctx.globalAlpha = 0.46;
        ctx.drawImage(this.texIron, this.leftWallX + 4, shelfVisY - 115, bedWidth - 8, 115);
        ctx.restore();
      } catch (e) {
        // Ignore drawImage errors in headless mock contexts
      }
    }

    // Heavy Riveted Iron Cross-Braces translating RIGIDLY with shelfVisY (zero accordion stretching!)
    ctx.strokeStyle = 'rgba(20, 14, 10, 0.72)';
    ctx.lineWidth = 4;
    const braceCount = 5;
    for (let b = 1; b < braceCount; b++) {
      const bx = this.leftWallX + (bedWidth / braceCount) * b;
      ctx.beginPath();
      ctx.moveTo(bx, shelfVisY - 108);
      ctx.lineTo(bx, shelfVisY - 12);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(212, 155, 75, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx - 6, shelfVisY - 106);
      ctx.lineTo(bx + 6, shelfVisY - 12);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20, 14, 10, 0.72)';
      ctx.lineWidth = 4;
    }
    ctx.restore();

    // Stationary Backstop Brass Scraper Header Bar along shelfTopY (scrapes upper-shelf coins forward on retraction)
    const topBarGrad = ctx.createLinearGradient(0, shelfTopY, 0, shelfTopY + 10);
    topBarGrad.addColorStop(0, '#c89246');
    topBarGrad.addColorStop(0.5, '#6e4c23');
    topBarGrad.addColorStop(1, '#1d1208');
    ctx.fillStyle = topBarGrad;
    ctx.fillRect(this.leftWallX + 4, shelfTopY, bedWidth - 8, 10);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(this.leftWallX + 4, shelfTopY + 10, bedWidth - 8, 5);

    // 3D Extruded Front Pusher Bumper Face (13px thick heavy brass bar along shelfVisY)
    const faceGrad = ctx.createLinearGradient(0, shelfVisY - 11, 0, shelfVisY + 4);
    faceGrad.addColorStop(0, '#e0a958');
    faceGrad.addColorStop(0.45, '#8c5e26');
    faceGrad.addColorStop(1, '#2b1b0a');
    ctx.fillStyle = faceGrad;
    ctx.fillRect(this.leftWallX + 4, shelfVisY - 11, bedWidth - 8, 13);

    // Machined Brass Pusher Teeth along the Front Pusher Lip (shelfVisY)
    for (let tx = this.leftWallX + 18; tx < this.rightWallX - 22; tx += 28) {
      ctx.fillStyle = '#f2c16b';
      ctx.strokeStyle = '#3b240c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, shelfVisY - 2);
      ctx.lineTo(tx + 12, shelfVisY - 2);
      ctx.lineTo(tx + 9, shelfVisY + 4.5);
      ctx.lineTo(tx + 3, shelfVisY + 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Rivets along the front pusher bar
    ctx.fillStyle = '#ffe39e';
    for (let rx = this.leftWallX + 32; rx < this.rightWallX - 20; rx += 56) {
      ctx.beginPath();
      ctx.arc(rx, shelfVisY - 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = this.overdriveTimer > 0 ? '#ffbf36' : '#ffcf70';
    ctx.lineWidth = this.overdriveTimer > 0 ? 2.2 : 1.4;
    ctx.strokeRect(this.leftWallX + 4.5, shelfTopY + 0.5, bedWidth - 9, shelfH - 1);
    ctx.restore();

    // 4. Enhanced 9 Brass Drop Pegs with Recessed Bronze Mounting Washers & Warm Amber Bumper Rings
    for (let i = 0; i < this.pegs.length; i++) {
      const peg = this.pegs[i];
      const isHit = peg.hitTimer > 0;
      ctx.save();

      // Drop shadow on clockwork backplate
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      ctx.arc(peg.x + 1, peg.y + 3.5, peg.radius + 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Recessed Bronze Mounting Washer bolted into the backplate
      const washerGrad = ctx.createRadialGradient(peg.x, peg.y, peg.radius, peg.x, peg.y, peg.radius + 4.2);
      washerGrad.addColorStop(0, '#2a1a0d');
      washerGrad.addColorStop(0.65, '#6e4823');
      washerGrad.addColorStop(1, '#1c1108');
      ctx.fillStyle = washerGrad;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.radius + 4.2, 0, Math.PI * 2);
      ctx.fill();

      // Warm Amber Bumper Ring
      ctx.strokeStyle = isHit ? '#ffea85' : 'rgba(255, 185, 56, 0.72)';
      ctx.lineWidth = isHit ? 2.0 : 1.3;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.radius + 2.4, 0, Math.PI * 2);
      ctx.stroke();

      // Central 3D Brass Capstan Pin
      const pegGrad = ctx.createRadialGradient(
        peg.x - 1.5,
        peg.y - 1.5,
        1,
        peg.x,
        peg.y,
        peg.radius
      );
      pegGrad.addColorStop(0, isHit ? '#ffffff' : '#fff3c4');
      pegGrad.addColorStop(0.55, isHit ? '#ffdf40' : '#d49b3b');
      pegGrad.addColorStop(1, '#4f3310');
      ctx.fillStyle = pegGrad;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
      ctx.fill();

      if (isHit) {
        ctx.strokeStyle = 'rgba(255, 223, 64, 0.82)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, peg.radius + 5.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4b. Subtle Rising Furnace Embers inside Left & Right Gutters + Lip Jackpot Shimmer Bar
    const animT = Date.now() * 0.002;
    ctx.save();
    for (let eIdx = 0; eIdx < 6; eIdx++) {
      const isRight = eIdx >= 3;
      const localIdx = eIdx % 3;
      const baseX = isRight
        ? this.width - 60 + localIdx * 15
        : 24 + localIdx * 15;
      const cycle = (animT * (0.42 + localIdx * 0.14) + eIdx * 0.37) % 1;
      const ey = this.lipY - 18 - cycle * (this.lipY - this.backWallY - 36);
      const ex = baseX + Math.sin(animT * 2.1 + eIdx * 1.9) * 4.5;
      const alpha = Math.sin(cycle * Math.PI) * 0.72;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = eIdx % 2 === 0 ? '#ff6b2b' : '#ffd166';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.8 + (localIdx % 2) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (this.coins && this.coins.some((c) => c && c.isTeetering)) {
      ctx.save();
      const shimmerPulse = 0.55 + 0.45 * Math.sin(animT * 3.2);
      const shimGrad = ctx.createLinearGradient(this.leftWallX, 0, this.rightWallX, 0);
      shimGrad.addColorStop(0, 'rgba(66, 230, 108, 0)');
      shimGrad.addColorStop(0.25, `rgba(255, 216, 107, ${(0.35 * shimmerPulse).toFixed(2)})`);
      shimGrad.addColorStop(0.5, `rgba(104, 247, 204, ${(0.62 * shimmerPulse).toFixed(2)})`);
      shimGrad.addColorStop(0.75, `rgba(255, 216, 107, ${(0.35 * shimmerPulse).toFixed(2)})`);
      shimGrad.addColorStop(1, 'rgba(66, 230, 108, 0)');
      ctx.fillStyle = shimGrad;
      ctx.fillRect(this.leftWallX + 8, this.lipY - 5, bedWidth - 16, 4);
      ctx.restore();
    }
  }

  drawCollateralHand(ctx) {
    const intactFingers =
      typeof window !== 'undefined' && window.obolGame && typeof window.obolGame.fingers === 'number'
        ? window.obolGame.fingers
        : 3;
    const tilt =
      (typeof window !== 'undefined' && window.obolGame && window.obolGame.tiltGauge) || 0;

    const stockX = 82;
    const stockY = 550;
    const stockW = 88;
    const stockH = 76;
    const isTrembling = tilt > 50;

    ctx.save();

    // 1. Deep Recessed Bronze & Cast-Iron Reliquary Alcove Frame with Outer Drop Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.beginPath();
    ctx.roundRect(stockX - 2, stockY - 1, stockW + 4, stockH + 4, 7);
    ctx.fill();

    const frameGrad = ctx.createLinearGradient(stockX, stockY, stockX + stockW, stockY + stockH);
    frameGrad.addColorStop(0, '#593e22');
    frameGrad.addColorStop(0.5, '#2b1c0e');
    frameGrad.addColorStop(1, '#4a3219');
    ctx.fillStyle = frameGrad;
    ctx.strokeStyle = isTrembling || intactFingers < 3 ? '#d92b38' : '#b88746';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(stockX, stockY, stockW, stockH, 6);
    ctx.fill();
    ctx.stroke();

    // Tufted Dark Crimson Velvet Reliquary Cushion Inside Alcove
    const velvetGrad = ctx.createRadialGradient(
      stockX + stockW * 0.5,
      stockY + stockH * 0.54,
      6,
      stockX + stockW * 0.5,
      stockY + stockH * 0.54,
      stockW * 0.58
    );
    velvetGrad.addColorStop(0, '#380d14');
    velvetGrad.addColorStop(0.65, '#1c0609');
    velvetGrad.addColorStop(1, '#0c0304');
    ctx.fillStyle = velvetGrad;
    ctx.beginPath();
    ctx.roundRect(stockX + 4, stockY + 13, stockW - 8, stockH - 17, 4);
    ctx.fill();

    // Top Engraved Brass Micro-Header Plaque
    const headerGrad = ctx.createLinearGradient(stockX + 4, stockY + 2, stockX + 4, stockY + 13);
    headerGrad.addColorStop(0, '#3a2714');
    headerGrad.addColorStop(1, '#1c1209');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(stockX + 4, stockY + 2.5, stockW - 8, 10.5);
    ctx.fillStyle = isTrembling ? '#ff6b78' : '#f0c27b';
    ctx.font = 'bold 7.5px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COLLATERAL STOCK', stockX + stockW * 0.5, stockY + 8);

    // Sculpted Anatomical Dorsal Left Hand & Leather Gauntlet Cuff
    const palmX = stockX + 12;
    const palmW = stockW - 24;
    const palmGrad = ctx.createLinearGradient(palmX, 603, palmX + palmW, 623);
    palmGrad.addColorStop(0, '#6e4c36');
    palmGrad.addColorStop(0.35, '#cfa888');
    palmGrad.addColorStop(0.65, '#b58b6b');
    palmGrad.addColorStop(1, '#4f3524');
    ctx.fillStyle = palmGrad;
    ctx.strokeStyle = '#24140b';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(palmX + 4, 604);
    ctx.quadraticCurveTo(stockX + stockW * 0.5, 600, palmX + palmW - 4, 604);
    ctx.lineTo(palmX + palmW, 621);
    ctx.quadraticCurveTo(stockX + stockW * 0.5, 624, palmX, 621);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dorsal metacarpal tendon shading lines on the back of the hand
    ctx.strokeStyle = 'rgba(72, 42, 24, 0.48)';
    ctx.lineWidth = 1.1;
    const slotXs = [101, 126, 151];
    for (let t = 0; t < 3; t++) {
      ctx.beginPath();
      ctx.moveTo(slotXs[t], 605);
      ctx.lineTo(slotXs[t] + (t - 1) * 2.5, 619);
      ctx.stroke();
    }

    // 3 Finger Slots: L-INDEX (0), L-MID (1), L-RING (2)
    const fingerLabels = ['L-INDEX', 'L-MID', 'L-RING'];
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    for (let fingerIndex = 0; fingerIndex < 3; fingerIndex++) {
      const fxBase = slotXs[fingerIndex];
      const slotTopY = fingerIndex === 1 ? 566 : 569;
      const slotBotY = 607;

      // Recessed dark iron guillotine channel groove with brass trim
      ctx.fillStyle = '#080404';
      ctx.strokeStyle = 'rgba(184, 135, 70, 0.28)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.roundRect(fxBase - 7.5, slotTopY - 1, 15, slotBotY - slotTopY + 2, 5);
      ctx.fill();
      ctx.stroke();

      if (fingerIndex < intactFingers) {
        // Intact Sculpted Anatomical Finger with tapered phalanges, knuckles, fingernail & brass shackle ring
        const trembleX = isTrembling ? Math.sin(now * 0.055 + fingerIndex * 2.1) * ((tilt - 50) * 0.032) : 0;
        const trembleY = isTrembling ? Math.cos(now * 0.068 + fingerIndex * 1.7) * 0.75 : 0;
        const fx = fxBase + trembleX;
        const fy = slotTopY + trembleY;
        const fh = slotBotY - slotTopY;

        const fleshGrad = ctx.createLinearGradient(fx - 5.5, fy, fx + 5.5, fy);
        fleshGrad.addColorStop(0, '#6e4b34');
        fleshGrad.addColorStop(0.38, '#e8cfb6');
        fleshGrad.addColorStop(0.7, '#c79f7e');
        fleshGrad.addColorStop(1, '#4d3221');
        ctx.fillStyle = fleshGrad;
        ctx.strokeStyle = '#29170d';
        ctx.lineWidth = 1.05;

        // Tapered anatomical finger silhouette with subtle knuckle swell
        ctx.beginPath();
        ctx.moveTo(fx - 5.2, fy + fh);
        ctx.lineTo(fx - 5.4, fy + fh * 0.52);
        ctx.quadraticCurveTo(fx - 4.8, fy + 4, fx - 3.6, fy + 1.2);
        ctx.quadraticCurveTo(fx, fy - 0.6, fx + 3.6, fy + 1.2);
        ctx.quadraticCurveTo(fx + 4.8, fy + 4, fx + 5.4, fy + fh * 0.52);
        ctx.lineTo(fx + 5.2, fy + fh);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Sculpted ivory fingernail & lunula crescent
        ctx.fillStyle = '#f7ece0';
        ctx.strokeStyle = '#6e4b34';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect(fx - 3.3, fy + 2.0, 6.6, 6.0, 2.6);
        ctx.fill();
        ctx.stroke();

        // Double anatomical knuckle creases
        ctx.strokeStyle = 'rgba(68, 38, 20, 0.78)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(fx, fy + 15, 3.6, 0.2, Math.PI - 0.2, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fx, fy + 25, 4.0, 0.15, Math.PI - 0.15, false);
        ctx.stroke();

        // Individual 3D Brass Manacle Ring clamping the middle phalanx
        const ringGrad = ctx.createLinearGradient(fx - 6.2, 0, fx + 6.2, 0);
        ringGrad.addColorStop(0, '#523618');
        ringGrad.addColorStop(0.45, '#ffe394');
        ringGrad.addColorStop(1, '#3d260e');
        ctx.fillStyle = ringGrad;
        ctx.strokeStyle = '#1f1206';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.roundRect(fx - 6.2, fy + 17.5, 12.4, 4.8, 1.5);
        ctx.fill();
        ctx.stroke();
      } else {
        // Severed Finger: dark blood seal & locked crimson cauterizing clamp
        ctx.fillStyle = '#47060d';
        ctx.beginPath();
        ctx.arc(fxBase, 602, 5.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a81222';
        ctx.beginPath();
        ctx.arc(fxBase, 602, 3.4, 0, Math.PI * 2);
        ctx.fill();

        // Locked Crimson Cauterizing Guillotine Clamp over the severed channel
        const clampGrad = ctx.createLinearGradient(fxBase - 6.5, slotTopY + 2, fxBase + 6.5, slotTopY + 28);
        clampGrad.addColorStop(0, '#7a0b16');
        clampGrad.addColorStop(0.5, '#d91e2e');
        clampGrad.addColorStop(1, '#3b0409');
        ctx.fillStyle = clampGrad;
        ctx.strokeStyle = '#ff6b78';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.roundRect(fxBase - 6, slotTopY + 3, 12, 26, 2.5);
        ctx.fill();
        ctx.stroke();

        // Cauterized X brand on the locked clamp
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fxBase - 3.2, slotTopY + 11);
        ctx.lineTo(fxBase + 3.2, slotTopY + 21);
        ctx.moveTo(fxBase + 3.2, slotTopY + 11);
        ctx.lineTo(fxBase - 3.2, slotTopY + 21);
        ctx.stroke();
      }
      void fingerLabels[fingerIndex];
    }

    // 3D Contoured Cast-Iron & Brass Manacle Shackle Bar across all 3 fingers (y = 595..605)
    const barGrad = ctx.createLinearGradient(stockX + 3, 595, stockX + 3, 605);
    barGrad.addColorStop(0, '#6e5236');
    barGrad.addColorStop(0.45, '#2e2218');
    barGrad.addColorStop(1, '#120c08');
    ctx.fillStyle = barGrad;
    ctx.strokeStyle = '#c89648';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(stockX + 3, 595.5, stockW - 6, 9.5, 2.5);
    ctx.fill();
    ctx.stroke();

    // Recessed semicircular shackle arches over each finger along the iron clamp bar
    ctx.strokeStyle = '#ffdf8e';
    ctx.lineWidth = 1.2;
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      ctx.beginPath();
      ctx.arc(slotXs[sIdx], 600.5, 6.2, Math.PI, 0, false);
      ctx.stroke();
    }

    // Brass lock-bolts on the iron clamp bar
    const boltXs = [stockX + 8, 113.5, 138.5, stockX + stockW - 8];
    ctx.fillStyle = '#ffcf70';
    for (let b = 0; b < boltXs.length; b++) {
      ctx.beginPath();
      ctx.arc(boltXs[b], 600.2, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawCollectorPresence(ctx) {
    const cx = this.width * 0.5;
    const gameRef = window.obolGame || window.game;
    const tiltVal = (gameRef && (gameRef.tiltMeter || gameRef.tiltGauge)) || 0;
    const isEnraged =
      tiltVal > 40 ||
      this.overdriveTimer > 0 ||
      (this.guillotine && this.guillotine.active) ||
      this.guillotineTimer > 0;

    ctx.save();

    // Recessed Dark Iron Observation Alcove (y = 2..46)
    const alcoveW = 248;
    const alcoveGrad = ctx.createLinearGradient(0, 2, 0, 48);
    alcoveGrad.addColorStop(0, '#040202');
    alcoveGrad.addColorStop(0.55, '#190f0a');
    alcoveGrad.addColorStop(1, '#2b1b11');
    ctx.fillStyle = alcoveGrad;
    ctx.beginPath();
    ctx.roundRect(cx - alcoveW * 0.5, 2, alcoveW, 44, 6);
    ctx.fill();
    ctx.strokeStyle = isEnraged ? 'rgba(255, 58, 66, 0.88)' : '#8c6236';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Warm internal amber-crimson spotlight glow behind the Collector bust
    const backGlow = ctx.createRadialGradient(cx, 24, 4, cx, 24, 64);
    backGlow.addColorStop(0, isEnraged ? 'rgba(220, 28, 36, 0.42)' : 'rgba(255, 162, 64, 0.28)');
    backGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = backGlow;
    ctx.beginPath();
    ctx.roundRect(cx - alcoveW * 0.5 + 2, 3, alcoveW - 4, 42, 5);
    ctx.fill();

    // The Collector's Hooded Mantle & Tarnished Brass-and-Bone Skull Mask
    const jitterY = isEnraged ? Math.sin(performance.now() * 0.04) * 1.4 : 0;
    const maskY = 22 + jitterY;

    // Composite Pre-Rendered Dark-Occult Collector Bust Key Art inside Alcove if loaded
    if (this.texCollector && this.texCollector.complete && this.texCollector.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx - alcoveW * 0.5 + 2, 3, alcoveW - 4, 42, 5);
      ctx.clip();
      ctx.globalAlpha = 1.0;
      // Draw crisp 92x92 bust centered on the skull visage inside the shadowbox alcove
      ctx.drawImage(this.texCollector, cx - 46, -8 + jitterY, 92, 92);
      ctx.restore();
    } else {
      // Procedural fallback cowled mantle + skull faceplate
      ctx.fillStyle = '#0b0807';
      ctx.beginPath();
      ctx.arc(cx, maskY + 4, 26, Math.PI, 0, false);
      ctx.lineTo(cx + 30, 46);
      ctx.lineTo(cx - 30, 46);
      ctx.closePath();
      ctx.fill();

      const skullGrad = ctx.createRadialGradient(cx, maskY - 4, 2, cx, maskY, 19);
      skullGrad.addColorStop(0, '#efe0c6');
      skullGrad.addColorStop(0.55, '#9c7d58');
      skullGrad.addColorStop(1, '#362619');
      ctx.fillStyle = skullGrad;
      ctx.beginPath();
      ctx.arc(cx, maskY - 2, 15, Math.PI * 0.95, Math.PI * 0.05, false);
      ctx.lineTo(cx + 11, maskY + 13);
      ctx.lineTo(cx - 11, maskY + 13);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffcf70';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.strokeStyle = '#1c130c';
      ctx.lineWidth = 1.4;
      for (let gx = -6; gx <= 6; gx += 3) {
        ctx.beginPath();
        ctx.moveTo(cx + gx, maskY + 5);
        ctx.lineTo(cx + gx, maskY + 12);
        ctx.stroke();
      }
    }

    // Twin Glowing Ocular Lenses tracking this.aimX (aligned directly to the 3D skull's eye sockets at y = 29.5)
    const pupilOffset = Math.max(-3.5, Math.min(3.5, (this.collectorLookX - cx) * 0.022));
    const eyeSockets = [-7.5, 7.5];
    const socketY = this.texCollector && this.texCollector.complete && this.texCollector.naturalWidth > 0 ? 29.5 + jitterY : maskY - 1;
    for (let i = 0; i < eyeSockets.length; i++) {
      const ex = cx + eyeSockets[i];
      const ey = socketY;
      const eyeColor = isEnraged ? '#ff1e27' : '#ffaa2b';
      ctx.fillStyle = eyeColor;
      ctx.shadowColor = eyeColor;
      ctx.shadowBlur = isEnraged ? 14 : 9;
      ctx.beginPath();
      ctx.arc(ex + pupilOffset * 0.5, ey, isEnraged ? 2.8 : 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Twin Articulated 3D Blender Mechanical Claws gripping the brass alcove rail at y = 33..54
    const clawSides = [-64, 64];
    for (let s = 0; s < clawSides.length; s++) {
      const clawX = cx + clawSides[s];
      if (this.texClaw && this.texClaw.complete && this.texClaw.naturalWidth > 0) {
        ctx.drawImage(this.texClaw, clawX - 13, 32, 26, 26);
      } else {
        ctx.fillStyle = '#4a3828';
        ctx.strokeStyle = '#b3823e';
        ctx.lineWidth = 1.2;
        for (let t = -1; t <= 1; t++) {
          ctx.beginPath();
          ctx.roundRect(clawX + t * 5 - 2, 41, 4, 9, 1.5);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  drawPusherShelf(ctx) {
    // Maintained as a convenience wrapper if invoked standalone by external callers
    const shelfTopY = Math.max(134, this.shelfY - 54);
    const shelfH = Math.max(38, this.shelfY - shelfTopY);
    const bedWidth = this.rightWallX - this.leftWallX;
    ctx.save();
    ctx.fillStyle = '#2e2219';
    ctx.fillRect(this.leftWallX + 4, shelfTopY, bedWidth - 8, shelfH);
    ctx.restore();
  }

  drawElectricGuardrails(ctx) {
    const hasWelded = this.callbacks.hasRelic && this.callbacks.hasRelic('welded_guardrails');
    if (!hasWelded && this.overdriveTimer <= 0) return;

    ctx.save();
    if (hasWelded) {
      // Bolted rusted steel guardrail plates covering y=250..395 on both sides
      const railY = 250;
      const railH = 145;
      ctx.fillStyle = '#5c4328';
      ctx.strokeStyle = '#ffbf36';
      ctx.lineWidth = 1.5;
      ctx.fillRect(this.leftWallX - 4, railY, 8, railH);
      ctx.strokeRect(this.leftWallX - 4, railY, 8, railH);
      ctx.fillRect(this.rightWallX - 4, railY, 8, railH);
      ctx.strokeRect(this.rightWallX - 4, railY, 8, railH);
    }

    if (this.overdriveTimer > 0) {
      ctx.strokeStyle = '#ffbf36';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff852b';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(this.leftWallX + 1, this.shelfY);
      ctx.lineTo(this.leftWallX + 1, this.lipY);
      ctx.moveTo(this.rightWallX - 1, this.shelfY);
      ctx.lineTo(this.rightWallX - 1, this.lipY);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSkillGate(ctx) {
    const gx = this.gateX;
    const gy = this.gateY;
    const halfW = this.gateWidth * 0.5;
    const isFlashing = this.gateFlashTimer > 0;

    ctx.save();
    // Glowing energy beam between the brass gate posts
    const beamGrad = ctx.createLinearGradient(gx - halfW, gy, gx + halfW, gy);
    beamGrad.addColorStop(0, 'rgba(57, 255, 90, 0.15)');
    beamGrad.addColorStop(0.5, isFlashing ? 'rgba(255, 234, 133, 0.78)' : 'rgba(57, 255, 90, 0.42)');
    beamGrad.addColorStop(1, 'rgba(57, 255, 90, 0.15)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(gx - halfW + 4, gy - 7, this.gateWidth - 8, 14);

    ctx.strokeStyle = isFlashing ? '#ffea85' : '#39ff5a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(gx - halfW + 4, gy - 7, this.gateWidth - 8, 14);

    // Left & Right Brass Gate Posts
    const posts = [gx - halfW, gx + halfW];
    for (let i = 0; i < posts.length; i++) {
      const px = posts[i];
      ctx.fillStyle = '#b8863e';
      ctx.beginPath();
      ctx.arc(px, gy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff0b3';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Crisp vector label inside the 88px gate posts (Zero OS Emoji)
    ctx.fillStyle = isFlashing ? '#ffffff' : '#eaffef';
    ctx.font = 'bold 8px "JetBrains Mono", "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BONUS GATE x2', gx, gy + 0.5);
    ctx.restore();
  }

  drawBumpers(ctx) {
    for (let i = 0; i < this.bumpers.length; i++) {
      const b = this.bumpers[i];
      const isHit = b.hitTimer > 0;
      const r = b.radius + (isHit ? 2.5 : 0);

      ctx.save();
      ctx.translate(b.x, b.y);

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
      ctx.beginPath();
      ctx.arc(0, 4.5, r + 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(b.angle);
      if (this.texBumper && this.texBumper.complete && this.texBumper.naturalWidth > 0) {
        const d = (r + 2.5) * 2;
        ctx.drawImage(this.texBumper, -d * 0.5, -d * 0.5, d, d);
        if (isHit) {
          ctx.strokeStyle = '#fff3b8';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Outer Brass Capstan Ring fallback
        const grad = ctx.createRadialGradient(-3, -3, 2, 0, 0, r);
        grad.addColorStop(0, isHit ? '#ffffff' : '#ffe699');
        grad.addColorStop(0.6, isHit ? '#ffbf36' : '#b8802e');
        grad.addColorStop(1, '#3b2408');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#291805';
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
          ctx.lineTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2));
          ctx.stroke();
        }

        ctx.fillStyle = '#fff0b8';
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawCoin(ctx, c) {
    this.drawCoin25D(ctx, c, false);
  }

  drawCoin25D(ctx, c, isShadowPass = false) {
    if (!c) return;
    const fallScale = Number.isFinite(c.fallScale) ? c.fallScale : 1.0;
    const r = (c.radius || 17) * fallScale;
    const thickness =
      (c.thickness ||
        (c.typeId === 'silver_drachma' ||
        c.typeId === 'sun_bullion' ||
        c.typeId === 'lodestone' ||
        c.brand === 'heavy'
          ? 8.5
          : 5.8)) * fallScale;

    const rx = Number.isFinite(c.renderX) ? c.renderX : c.x;
    const ry = Number.isFinite(c.renderY) ? c.renderY : c.y;
    const zElev = Math.max(0, Number.isFinite(c.renderZ) ? c.renderZ : c.z || 0);
    const teeterRock = c.isTeetering ? Math.sin((c.pulsePhase || 0) * 2.8) * 0.16 * Math.max(0.35, c.teeterProgress || 0.5) : 0;
    const pitch = Math.max(-1.35, Math.min(1.35, (Number.isFinite(c.renderPitch) ? c.renderPitch : c.pitch || 0) + teeterRock));
    const roll = Math.max(-1.35, Math.min(1.35, Number.isFinite(c.renderRoll) ? c.renderRoll : c.roll || 0));
    const scaleX = Math.max(0.28, Math.cos(roll));
    const scaleY = Math.max(0.28, Math.cos(pitch));

    // 3D cylinder extrusion vector (base bevel + dynamic tilt thickness)
    const edgeExtrudeX = Math.sin(roll) * (thickness * 1.45);
    const edgeExtrudeY = 4.2 * fallScale + Math.abs(Math.sin(pitch)) * (thickness * 1.65);

    ctx.save();
    // 1. Elevation-Aware Soft Contact Drop-Shadow on the bed/coin below
    const shadowOffX = 2.0 + zElev * 0.42;
    const shadowOffY = 4.5 + zElev * 0.78;
    const shadowAlpha = Math.max(0.18, (c.layer === 'drop' ? 0.34 : 0.52) - zElev * 0.01);
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(
      rx + shadowOffX,
      ry + shadowOffY,
      r * scaleX * 1.04,
      r * scaleY * 0.95,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (isShadowPass) {
      ctx.restore();
      return;
    }

    // Translate to coin's 3D elevated screen coordinates
    ctx.translate(rx, ry - zElev * 0.85);

    // 2. Extruded 3D Cylinder Side-Wall Band & 16 Knurled Reed Ridges
    const wallGrad = ctx.createLinearGradient(-r * scaleX, 0, r * scaleX, 0);
    wallGrad.addColorStop(0, c.colorSecondary || '#2a1608');
    wallGrad.addColorStop(0.32, c.colorPrimary || '#a86428');
    wallGrad.addColorStop(0.5, c.colorRim || '#ffd280');
    wallGrad.addColorStop(0.68, c.colorPrimary || '#a86428');
    wallGrad.addColorStop(1, c.colorSecondary || '#1f1005');

    // Bottom cylinder cap + connecting side-wall sweeps
    ctx.fillStyle = wallGrad;
    ctx.beginPath();
    ctx.ellipse(edgeExtrudeX, edgeExtrudeY, r * scaleX, r * scaleY, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 0, r * scaleX, r * scaleY, 0, 0, Math.PI, false);
    ctx.lineTo(-r * scaleX + edgeExtrudeX, edgeExtrudeY);
    ctx.ellipse(edgeExtrudeX, edgeExtrudeY, r * scaleX, r * scaleY, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();

    // 16 Knurled Vertical Reed Grooves across the visible cylinder wall
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1.05;
    for (let k = 0; k < 16; k++) {
      const a = (k / 15) * Math.PI;
      const sx = Math.cos(a) * r * scaleX;
      const sy = Math.sin(a) * r * scaleY;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + edgeExtrudeX, sy + edgeExtrudeY);
      ctx.stroke();
    }

    // 3. Foreshortened 3D Top Mint Face (Scaled by scaleX, scaleY)
    ctx.save();
    ctx.scale(scaleX, scaleY);

    const faceGrad = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.08, 0, 0, r);
    faceGrad.addColorStop(0, c.colorRim || '#ffe8ad');
    faceGrad.addColorStop(0.58, c.colorPrimary || '#c47838');
    faceGrad.addColorStop(1, c.colorSecondary || '#422209');
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = c.gilded ? '#ffea85' : (c.stackLayer || 0) > 0 ? '#ffd875' : c.colorRim || '#f0ab72';
    ctx.lineWidth = c.gilded ? 2.2 : 1.6;
    ctx.stroke();

    // Subtle recessed inner mint dish so the metallic sheen & engraved emblem pop
    ctx.fillStyle = 'rgba(12, 8, 6, 0.24)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.fill();

    // 4. Rotated Milled Serrations & Bespoke Vector Occult Mint Emblem (Zero OS Emoji)
    ctx.save();
    ctx.rotate(c.angle || 0);

    if (this.texCoinPBR && this.texCoinPBR.complete && this.texCoinPBR.naturalWidth > 0) {
      ctx.globalAlpha = 0.34;
      ctx.drawImage(this.texCoinPBR, -r, -r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = c.colorRim || '#ffd280';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.65;
    for (let t = 0; t < 18; t++) {
      const a = (t / 18) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r * 0.76), Math.sin(a) * (r * 0.76));
      ctx.lineTo(Math.cos(a) * (r * 0.88), Math.sin(a) * (r * 0.88));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Dynamic Traveling Anisotropic Specular Sheen across the coin face as it moves or tilts
    const sheenShift = Math.sin((rx + ry) * 0.018 + pitch * 3.2 + roll * 3.2 + (c.angle || 0)) * (r * 0.42);
    const sheenGrad = ctx.createLinearGradient(-r + sheenShift, -r, r + sheenShift, r);
    sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    sheenGrad.addColorStop(0.44, 'rgba(255, 244, 214, 0.03)');
    sheenGrad.addColorStop(0.5, 'rgba(255, 248, 225, 0.24)');
    sheenGrad.addColorStop(0.56, 'rgba(255, 244, 214, 0.03)');
    sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheenGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
    ctx.fill();

    this.drawMintEmblem(ctx, c, r);
    ctx.restore();
    ctx.restore(); // end scale(scaleX, scaleY)

    // 5. Compact Embossed $VALUE Rim Micro-Stamp (ONLY when hovered or in drop preview reticle so playfield coins stay uncluttered)
    const shouldShowValuePill =
      !c.isReserveCoin &&
      Boolean(
        c.isReticlePreview ||
          (this.hoveredCoin && this.hoveredCoin.uid === c.uid) ||
          (c.layer === 'drop' && c.y <= 58)
      );

    if (shouldShowValuePill) {
      const valStr = `$${Math.round(c.value || 10)}`;
      ctx.font = 'bold 8.5px "JetBrains Mono", "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pillW = Math.max(19, ctx.measureText(valStr).width + 6);
      const pillH = 9.5;
      const pillY = r * scaleY * 0.72;

      ctx.fillStyle = 'rgba(10, 6, 4, 0.82)';
      ctx.strokeStyle = c.gilded ? '#ffea85' : c.colorRim || '#d49b4b';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.roundRect(-pillW * 0.5, pillY - pillH * 0.5, pillW, pillH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = c.gilded ? '#ffea85' : '#fff5e4';
      ctx.fillText(valStr, 0, pillY + 0.5);
    } else {
      // Subtle specular metallic rim highlight arc on the lower rim
      ctx.save();
      ctx.scale(scaleX, scaleY);
      ctx.strokeStyle = c.colorRim || '#ffe39e';
      ctx.globalAlpha = 0.58;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.88, Math.PI * 0.18, Math.PI * 0.82, false);
      ctx.stroke();
      ctx.restore();
    }

    // Fuse countdown badge for Blast Cap / Singularity
    if ((c.typeId === 'blast_cap' || c.typeId === 'void_singularity') && c.fuseCount > 0) {
      ctx.fillStyle = '#ff2a38';
      ctx.beginPath();
      ctx.arc(r * scaleX * 0.65, -r * scaleY * 0.65, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
      ctx.fillText(String(c.fuseCount), r * scaleX * 0.65, -r * scaleY * 0.65 + 0.5);
    }

    // Teetering edge warm rim glint (replaces flat green vector circle)
    if (c.isTeetering) {
      const pulse = 0.5 + 0.5 * Math.sin((c.pulsePhase || 0) * 2.6);
      ctx.strokeStyle = `rgba(255, 218, 110, ${0.42 + pulse * 0.45})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * scaleX, r * scaleY, 0, 0, Math.PI, false);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawMintEmblem(ctx, c, r) {
    const id = (c && (c.typeId || c.id || c.rawId)) || 'copper_obol';
    this.drawTokenVectorEmblem(ctx, id, r * 0.62, c.colorRim || '#ffe39e', c.colorSecondary || '#3b1e08');
  }

  drawTokenVectorEmblem(ctx, typeId, s, strokeColor = '#ffe39e', secondaryColor = '#3b1e08') {
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = Math.max(2.4, s * 0.17);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const recessCol = secondaryColor || 'rgba(20, 8, 2, 0.85)';

    switch (typeId) {
      case 'copper_obol':
      case 'obol': {
        // Bold Solid-Relief Crowned Purgatory Skull-Boss, 4 Cardinal Heraldic Rays & Crossed Ferryman Oars
        ctx.beginPath();
        ctx.moveTo(-s * 0.68, -s * 0.68);
        ctx.lineTo(s * 0.68, s * 0.68);
        ctx.moveTo(s * 0.68, -s * 0.68);
        ctx.lineTo(-s * 0.68, s * 0.68);
        ctx.stroke();

        // 4 Flared Solid Oar-Blade Triangles at the 4 diagonal corners
        const diagAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
        for (let i = 0; i < 4; i++) {
          const a = diagAngles[i];
          const tipX = Math.cos(a) * s * 0.78;
          const tipY = Math.sin(a) * s * 0.78;
          const baseDist = s * 0.48;
          const px = -Math.sin(a) * s * 0.16;
          const py = Math.cos(a) * s * 0.16;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(Math.cos(a) * baseDist + px, Math.sin(a) * baseDist + py);
          ctx.lineTo(Math.cos(a) * baseDist - px, Math.sin(a) * baseDist - py);
          ctx.closePath();
          ctx.fill();
        }

        // 4 Cardinal Heraldic Triangular Rays
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          const tipX = Math.cos(a) * s * 0.88;
          const tipY = Math.sin(a) * s * 0.88;
          const px = -Math.sin(a) * s * 0.22;
          const py = Math.cos(a) * s * 0.22;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(px, py);
          ctx.lineTo(-px, -py);
          ctx.closePath();
          ctx.fill();
        }

        // Solid-Filled Octagonal Central Shield Boss (s * 0.46)
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + Math.PI / 8;
          const bx = Math.cos(a) * s * 0.46;
          const by = Math.sin(a) * s * 0.46;
          if (i === 0) ctx.moveTo(bx, by);
          else ctx.lineTo(bx, by);
        }
        ctx.closePath();
        ctx.fill();

        // Inner Cut-Out Eye / Keyhole in secondaryColor for crisp bas-relief contrast
        ctx.fillStyle = recessCol;
        ctx.beginPath();
        ctx.arc(0, -s * 0.05, s * 0.18, 0, Math.PI * 2);
        ctx.moveTo(-s * 0.11, 0);
        ctx.lineTo(s * 0.11, 0);
        ctx.lineTo(s * 0.16, s * 0.24);
        ctx.lineTo(-s * 0.16, s * 0.24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = strokeColor;
        break;
      }

      case 'silver_drachma':
      case 'heavy': {
        // Bold Solid-Filled Twin Crescent & 8-Pointed Starburst Bullion Crest
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8;
          const rad = i % 2 === 0 ? s * 0.86 : s * 0.46;
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // Inner dark recess ring & twin silver crescents
        ctx.fillStyle = recessCol;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'leech_penny':
      case 'blood':
      case 'parasite': {
        // Bold Solid-Filled 2.5D Faceted Blood-Ruby Droplet with Golden Claws
        ctx.beginPath();
        ctx.moveTo(-s * 0.58, -s * 0.52);
        ctx.quadraticCurveTo(-s * 0.82, s * 0.22, -s * 0.24, s * 0.76);
        ctx.quadraticCurveTo(-s * 0.38, -s * 0.05, -s * 0.16, -s * 0.52);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.58, -s * 0.52);
        ctx.quadraticCurveTo(s * 0.82, s * 0.22, s * 0.24, s * 0.76);
        ctx.quadraticCurveTo(s * 0.38, -s * 0.05, s * 0.16, -s * 0.52);
        ctx.closePath();
        ctx.fill();

        // Faceted central blood-ruby heart/droplet
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.68);
        ctx.lineTo(s * 0.38, s * 0.08);
        ctx.lineTo(0, s * 0.58);
        ctx.lineTo(-s * 0.38, s * 0.08);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = recessCol;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.28);
        ctx.lineTo(s * 0.16, s * 0.08);
        ctx.lineTo(0, s * 0.28);
        ctx.lineTo(-s * 0.16, s * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = strokeColor;
        break;
      }

      case 'blast_cap':
      case 'curse': {
        // Heavy Brass Naval Mine / Bomb with Solid Spikes & Sparking Fuse
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const px = -Math.sin(a) * s * 0.16;
          const py = Math.cos(a) * s * 0.16;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * s * 0.88, s * 0.08 + Math.sin(a) * s * 0.88);
          ctx.lineTo(px, s * 0.08 + py);
          ctx.lineTo(-px, s * 0.08 - py);
          ctx.closePath();
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, s * 0.08, s * 0.54, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = recessCol;
        ctx.beginPath();
        ctx.arc(-s * 0.14, -s * 0.04, s * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = strokeColor;

        ctx.strokeStyle = '#ffea85';
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.44);
        ctx.quadraticCurveTo(s * 0.35, -s * 0.82, s * 0.58, -s * 0.68);
        ctx.stroke();
        break;
      }

      case 'lodestone':
      case 'hex': {
        // Bold Chiseled Horseshoe Magnet with Solid Pole Blocks & Lightning Bolt Core
        ctx.lineWidth = Math.max(3.0, s * 0.24);
        ctx.beginPath();
        ctx.arc(0, -s * 0.1, s * 0.54, Math.PI, 0, false);
        ctx.lineTo(s * 0.54, s * 0.58);
        ctx.moveTo(-s * 0.54, -s * 0.1);
        ctx.lineTo(-s * 0.54, s * 0.58);
        ctx.stroke();
        ctx.fillRect(-s * 0.72, s * 0.36, s * 0.36, s * 0.32);
        ctx.fillRect(s * 0.36, s * 0.36, s * 0.36, s * 0.32);
        // Central lightning spark
        ctx.beginPath();
        ctx.moveTo(s * 0.08, -s * 0.32);
        ctx.lineTo(-s * 0.16, s * 0.02);
        ctx.lineTo(s * 0.14, s * 0.02);
        ctx.lineTo(-s * 0.08, s * 0.38);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'mimic_tooth':
      case 'mimic': {
        // Bold Solid-Filled Interlocking Monster Maw Fangs
        ctx.beginPath();
        ctx.moveTo(-s * 0.78, -s * 0.48);
        ctx.lineTo(s * 0.78, -s * 0.48);
        ctx.lineTo(s * 0.52, s * 0.08);
        ctx.lineTo(s * 0.24, -s * 0.28);
        ctx.lineTo(0, s * 0.18);
        ctx.lineTo(-s * 0.24, -s * 0.28);
        ctx.lineTo(-s * 0.52, s * 0.08);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 0.72, s * 0.54);
        ctx.lineTo(s * 0.72, s * 0.54);
        ctx.lineTo(s * 0.36, s * 0.08);
        ctx.lineTo(0, s * 0.42);
        ctx.lineTo(-s * 0.36, s * 0.08);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'glass_sovereign':
      case 'fragile': {
        // Bold Solid-Filled Faceted Diamond Sovereign with Inner Cut-Out Prism
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.88);
        ctx.lineTo(s * 0.78, 0);
        ctx.lineTo(0, s * 0.88);
        ctx.lineTo(-s * 0.78, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = recessCol;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.42);
        ctx.lineTo(s * 0.36, 0);
        ctx.lineTo(0, s * 0.42);
        ctx.lineTo(-s * 0.36, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'soul_chain':
      case 'soul': {
        // Bold Solid-Relief Interlocking Occult Manacle Links & Central Soul Core
        ctx.beginPath();
        ctx.ellipse(-s * 0.26, -s * 0.18, s * 0.44, s * 0.28, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(s * 0.26, s * 0.18, s * 0.44, s * 0.28, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.34);
        ctx.lineTo(s * 0.34, 0);
        ctx.lineTo(0, s * 0.34);
        ctx.lineTo(-s * 0.34, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'oil_cask': {
        // Bold Solid-Filled Industrial Oil Barrel & Viscous Droplet Cut-Out
        ctx.beginPath();
        ctx.roundRect(-s * 0.52, -s * 0.68, s * 1.04, s * 1.36, 4);
        ctx.fill();
        ctx.fillStyle = recessCol;
        ctx.fillRect(-s * 0.52, -s * 0.32, s * 1.04, s * 0.14);
        ctx.fillRect(-s * 0.52, s * 0.22, s * 1.04, s * 0.14);
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.18);
        ctx.quadraticCurveTo(s * 0.24, s * 0.08, 0, s * 0.22);
        ctx.quadraticCurveTo(-s * 0.24, s * 0.08, 0, -s * 0.18);
        ctx.fill();
        ctx.fillStyle = strokeColor;
        break;
      }

      case 'voltaic_coil':
      case 'echo':
      case 'splitter':
      case 'plasma_dynamo': {
        // High-Voltage Lightning Bolt & Resonance Arcs
        ctx.beginPath();
        ctx.moveTo(s * 0.18, -s * 0.85);
        ctx.lineTo(-s * 0.38, -s * 0.05);
        ctx.lineTo(s * 0.08, -s * 0.05);
        ctx.lineTo(-s * 0.22, s * 0.85);
        ctx.lineTo(s * 0.42, s * 0.05);
        ctx.lineTo(-s * 0.05, s * 0.05);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'void_singularity':
      case 'void_coin':
      case 'abyssal_magnetar':
      case 'abyssal_lord': {
        // Swirling Spiral Vortex & All-Seeing Abyssal Eye
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.arc(0, 0, s * 0.72, a, a + 0.65);
          ctx.stroke();
        }
        break;
      }

      case 'necro_die': {
        // Engraved Bone Die Cube with Pips
        ctx.strokeRect(-s * 0.56, -s * 0.56, s * 1.12, s * 1.12);
        const pips = [
          [-0.3, -0.3],
          [0.3, -0.3],
          [0, 0],
          [-0.3, 0.3],
          [0.3, 0.3]
        ];
        for (let i = 0; i < pips.length; i++) {
          ctx.beginPath();
          ctx.arc(pips[i][0] * s, pips[i][1] * s, s * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'cursed_skull':
      case 'doom_coin': {
        // Ornate Ossuary Skull Effigy with Hollow Eye Sockets & Jaw Teeth
        ctx.beginPath();
        ctx.arc(0, -s * 0.16, s * 0.56, Math.PI * 0.88, Math.PI * 0.12, false);
        ctx.lineTo(s * 0.34, s * 0.55);
        ctx.lineTo(-s * 0.34, s * 0.55);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-s * 0.22, -s * 0.15, s * 0.14, 0, Math.PI * 2);
        ctx.arc(s * 0.22, -s * 0.15, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'gold_crown':
      case 'sun_bullion':
      case 'sun_coin':
      case 'crown_coin':
      case 'crimson_sovereign':
      case 'blood_crown': {
        // Bold Solid-Filled 5-Spire Imperial Crown & Radiant Sun-Face
        ctx.beginPath();
        ctx.moveTo(-s * 0.72, s * 0.44);
        ctx.lineTo(-s * 0.78, -s * 0.28);
        ctx.lineTo(-s * 0.44, s * 0.08);
        ctx.lineTo(-s * 0.28, -s * 0.56);
        ctx.lineTo(0, -s * 0.05);
        ctx.lineTo(0, -s * 0.78);
        ctx.lineTo(0, -s * 0.05);
        ctx.lineTo(s * 0.28, -s * 0.56);
        ctx.lineTo(s * 0.44, s * 0.08);
        ctx.lineTo(s * 0.78, -s * 0.28);
        ctx.lineTo(s * 0.72, s * 0.44);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = recessCol;
        ctx.beginPath();
        ctx.arc(0, s * 0.18, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = strokeColor;
        break;
      }

      case 'alchemist_mercury':
      case 'mercury': {
        // Alchemical Caduceus / Horned Mercury Symbol with twin serpents & droplet
        ctx.beginPath();
        ctx.arc(0, -s * 0.16, s * 0.34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -s * 0.48, s * 0.32, Math.PI * 0.15, Math.PI * 0.85, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, s * 0.18);
        ctx.lineTo(0, s * 0.82);
        ctx.moveTo(-s * 0.36, s * 0.46);
        ctx.lineTo(s * 0.36, s * 0.46);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.44, s * 0.68);
        ctx.quadraticCurveTo(s * 0.42, s * 0.35, -s * 0.38, s * 0.08);
        ctx.moveTo(s * 0.44, s * 0.68);
        ctx.quadraticCurveTo(-s * 0.42, s * 0.35, s * 0.38, s * 0.08);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -s * 0.16, s * 0.13, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'hellfire_ducat':
      case 'hellfire': {
        // Three-Tongued Hellfire Flame Crown & Brimstone Cross
        ctx.beginPath();
        ctx.moveTo(-s * 0.62, s * 0.22);
        ctx.quadraticCurveTo(-s * 0.72, -s * 0.32, -s * 0.38, -s * 0.62);
        ctx.quadraticCurveTo(-s * 0.22, -s * 0.18, -s * 0.12, -s * 0.12);
        ctx.quadraticCurveTo(-s * 0.18, -s * 0.58, 0, -s * 0.86);
        ctx.quadraticCurveTo(s * 0.18, -s * 0.58, s * 0.12, -s * 0.12);
        ctx.quadraticCurveTo(s * 0.22, -s * 0.18, s * 0.38, -s * 0.62);
        ctx.quadraticCurveTo(s * 0.72, -s * 0.32, s * 0.62, s * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.25);
        ctx.lineTo(0, s * 0.78);
        ctx.moveTo(-s * 0.38, s * 0.32);
        ctx.lineTo(s * 0.38, s * 0.32);
        ctx.moveTo(-s * 0.48, s * 0.56);
        ctx.lineTo(s * 0.48, s * 0.56);
        ctx.stroke();
        break;
      }

      case 'charon_barge':
      case 'ferry': {
        // Stygian Gondola Prow, Ferryman's Oar & Crescent Lantern
        ctx.beginPath();
        ctx.moveTo(-s * 0.78, s * 0.18);
        ctx.quadraticCurveTo(-s * 0.65, -s * 0.35, -s * 0.42, -s * 0.48);
        ctx.lineTo(-s * 0.35, s * 0.18);
        ctx.lineTo(s * 0.76, s * 0.18);
        ctx.quadraticCurveTo(s * 0.52, s * 0.62, -s * 0.52, s * 0.62);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.28, s * 0.76);
        ctx.lineTo(s * 0.52, -s * 0.64);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-s * 0.42, -s * 0.58, s * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'obsidian_mirror':
      case 'mirror': {
        // Ornate Octagonal Scrying Mirror with Twin Crescent Reflections
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + Math.PI / 8;
          const px = Math.cos(a) * s * 0.82;
          const py = Math.sin(a) * s * 0.82;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.52, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-s * 0.08, -s * 0.06, s * 0.32, Math.PI * 0.85, Math.PI * 1.65, false);
        ctx.moveTo(-s * 0.22, s * 0.24);
        ctx.lineTo(s * 0.28, -s * 0.26);
        ctx.stroke();
        break;
      }

      case 'quicksilver_sovereign':
      case 'leviathan': {
        // Crowned Abyssal Sea-Serpent / Leviathan Coils & Trident
        ctx.beginPath();
        ctx.moveTo(-s * 0.68, s * 0.52);
        ctx.bezierCurveTo(-s * 0.82, -s * 0.12, s * 0.78, s * 0.32, s * 0.52, -s * 0.28);
        ctx.quadraticCurveTo(s * 0.34, -s * 0.64, -s * 0.12, -s * 0.42);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, s * 0.78);
        ctx.lineTo(0, -s * 0.78);
        ctx.moveTo(-s * 0.38, -s * 0.32);
        ctx.lineTo(-s * 0.38, -s * 0.68);
        ctx.moveTo(s * 0.38, -s * 0.32);
        ctx.lineTo(s * 0.38, -s * 0.68);
        ctx.moveTo(-s * 0.38, -s * 0.32);
        ctx.lineTo(s * 0.38, -s * 0.32);
        ctx.stroke();
        break;
      }

      case 'infernal_juggernaut':
      case 'juggernaut': {
        // Horned Demon Behemoth Skull & Molten Iron Ram
        ctx.beginPath();
        ctx.moveTo(-s * 0.32, -s * 0.35);
        ctx.quadraticCurveTo(-s * 0.88, -s * 0.72, -s * 0.76, -s * 0.05);
        ctx.lineTo(-s * 0.38, s * 0.08);
        ctx.lineTo(-s * 0.28, s * 0.68);
        ctx.lineTo(s * 0.28, s * 0.68);
        ctx.lineTo(s * 0.38, s * 0.08);
        ctx.lineTo(s * 0.76, -s * 0.05);
        ctx.quadraticCurveTo(s * 0.88, -s * 0.72, s * 0.32, -s * 0.35);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-s * 0.18, -s * 0.04, s * 0.11, 0, Math.PI * 2);
        ctx.arc(s * 0.18, -s * 0.04, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, s * 0.38);
        ctx.lineTo(s * 0.2, s * 0.38);
        ctx.stroke();
        break;
      }

      case 'reliquary_chest':
      case 'jackpot_orb':
      default: {
        if (typeId === 'reliquary_chest' && this.texChest && this.texChest.complete && this.texChest.naturalWidth > 0) {
          ctx.drawImage(this.texChest, -s * 0.88, -s * 0.88, s * 1.76, s * 1.76);
        } else {
          // Ornate Reliquary Lockbox & Keyhole Sigil
          ctx.strokeRect(-s * 0.68, -s * 0.48, s * 1.36, s * 0.96);
          ctx.beginPath();
          ctx.moveTo(-s * 0.68, -s * 0.08);
          ctx.lineTo(s * 0.68, -s * 0.08);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, -s * 0.08, s * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }

    ctx.restore();
  }

  drawDropReticle(ctx, nextDef) {
    const def = nextDef || (window.TOKEN_CATALOG && window.TOKEN_CATALOG.copper_obol);
    if (!def) return;
    const dropPt = this.project3D(this.aimX, 46, 22);
    const shelfPt = this.project3D(this.aimX, this.shelfY, 15);
    const useFull3D = Boolean(this.engine3d && this.engine3d.active);

    ctx.save();
    if (dropPt && dropPt.visible && dropPt.y >= -20 && dropPt.y <= this.height + 20) {
      const x = dropPt.x;
      const y = dropPt.y;
      const endX = shelfPt && Number.isFinite(shelfPt.x) ? shelfPt.x : x;
      const endY = shelfPt && Number.isFinite(shelfPt.y) ? shelfPt.y : this.shelfY;

      if (!useFull3D) {
        // Vertical laser guide line down through the upper pegboard to the Skill Gate (2D fallback)
        const guideGrad = ctx.createLinearGradient(x, y + 12, endX, endY);
        guideGrad.addColorStop(0, 'rgba(255, 207, 112, 0.55)');
        guideGrad.addColorStop(1, 'rgba(255, 207, 112, 0)');
        ctx.strokeStyle = guideGrad;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y + 12);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Brass mechanical drop claw carriage on the alcove sill (2D fallback)
        ctx.fillStyle = '#5c4126';
        ctx.strokeStyle = '#ffcf70';
        ctx.lineWidth = 1.4;
        ctx.fillRect(x - 14, y - 12, 28, 7);
        ctx.strokeRect(x - 14, y - 12, 28, 7);

        // Ghost preview of the next coin in hand (2D fallback; in 3D mode syncDropCarriage3D renders the 3D held token mesh)
        ctx.globalAlpha = this.dropCooldown > 0 ? 0.45 : 0.88;
        this.drawCoin25D(
          ctx,
          {
            x,
            y,
            z: 0,
            radius: 13 * Math.max(0.85, Math.min(1.2, dropPt.scale || 1)),
            typeId: def.id,
            id: def.id,
            value: def.baseValue,
            colorPrimary: def.colorPrimary,
            colorSecondary: def.colorSecondary,
            colorRim: def.colorRim,
            layer: 'drop',
            isReticlePreview: true,
            angle: 0
          },
          false
        );
      }
    }

    // Subtle Diegetic First-Minute Onboarding Guidance anchored in the lower chute apron (zero pegboard clutter!)
    const dropsMade = Math.max(this.totalDropsMade || 0, (window.obolGame && window.obolGame.dropsMade) || 0);
    if (
      dropsMade < 2 &&
      !this.heraldBanner &&
      !this.achievementBanner &&
      !(this.guillotine && this.guillotine.active)
    ) {
      const cx = this.width * 0.5;
      const promptY = 22;
      const pulse = 0.72 + Math.sin(Date.now() * 0.005) * 0.18;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(10, 8, 8, 0.92)';
      ctx.strokeStyle = '#ffcf70';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(cx - 96, promptY - 10, 192, 20, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffcf70';
      ctx.font = 'bold 9.5px "Cinzel", "Share Tech Mono", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('[CLICK] DROP  •  [SPACE] SLAM', cx, promptY);
    }

    ctx.restore();
  }

  drawHeraldBanner(ctx) {
    if (!this.heraldBanner) return;
    const b = this.heraldBanner;
    const alpha = Math.min(1, b.life / 0.3);
    const cx = this.width * 0.5;
    const cy = 11;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = 'bold 10.5px "Cinzel", "Share Tech Mono", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.min(this.width - 140, Math.max(200, ctx.measureText(b.text).width + 28));

    ctx.fillStyle = 'rgba(14, 9, 7, 0.94)';
    ctx.strokeStyle = b.color || '#ffd86b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(cx - w * 0.5, cy - 9, w, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = b.color || '#ffd86b';
    ctx.fillText(b.text, cx, cy + 0.5);
    ctx.restore();
  }

  drawAchievementBanner(ctx) {
    if (!this.achievementBanner || this.heraldBanner) return;
    const b = this.achievementBanner;
    const alpha = Math.min(1, b.timer / 0.35);
    const cx = this.width * 0.5;
    const cy = 11;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = 'bold 10.5px "JetBrains Mono", "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.min(this.width - 140, Math.max(220, ctx.measureText(b.text).width + 28));

    ctx.fillStyle = 'rgba(8, 20, 11, 0.94)';
    ctx.strokeStyle = '#39ff5a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - w * 0.5, cy - 11, w, 22, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#39ff5a';
    ctx.fillText(b.text, cx, cy + 0.5);
    ctx.restore();
  }

  drawGuillotineOverlay(ctx) {
    const cx = this.width * 0.5;
    const bladeY = (this.guillotine && this.guillotine.bladeY) || 260;
    const fingerName =
      (this.guillotine && this.guillotine.fingerName) || this.guillotineFingerName || 'INDEX FINGER';

    ctx.save();
    // Strictly clip guillotine cutscene below the Collector's booth (y >= 46)
    ctx.beginPath();
    ctx.rect(this.leftWallX, 46, this.rightWallX - this.leftWallX, this.height - 46);
    ctx.clip();

    // Red vignette flash inside playfield
    ctx.fillStyle = 'rgba(140, 8, 18, 0.24)';
    ctx.fillRect(this.leftWallX, 46, this.rightWallX - this.leftWallX, this.height - 46);

    // Vertical iron guide tracks along left and right cabinet walls
    ctx.fillStyle = '#18110e';
    ctx.strokeStyle = '#6e4e32';
    ctx.lineWidth = 1.4;
    ctx.fillRect(this.leftWallX + 2, 46, 8, Math.max(20, bladeY - 12));
    ctx.strokeRect(this.leftWallX + 2, 46, 8, Math.max(20, bladeY - 12));
    ctx.fillRect(this.rightWallX - 10, 46, 8, Math.max(20, bladeY - 12));
    ctx.strokeRect(this.rightWallX - 10, 46, 8, Math.max(20, bladeY - 12));

    // Twin heavy suspension chains descending from the upper cabinet roof to the cast-iron stock beam
    ctx.strokeStyle = '#8c6946';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - 105, 46);
    ctx.lineTo(cx - 105, bladeY - 126);
    ctx.moveTo(cx + 105, 46);
    ctx.lineTo(cx + 105, bladeY - 126);
    ctx.stroke();
    ctx.setLineDash([]);

    // Full-Width 3D Cycles PBR Guillotine Blade clipped strictly to its angled diagonal bevel polygon!
    const bladeW = this.rightWallX - this.leftWallX;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.leftWallX + 6, bladeY - 94);
    ctx.lineTo(this.rightWallX - 6, bladeY - 94);
    ctx.lineTo(this.rightWallX - 6, bladeY + 26);
    ctx.lineTo(this.leftWallX + 6, bladeY - 18);
    ctx.closePath();
    ctx.clip();

    if (this.texGuillotine && this.texGuillotine.complete && this.texGuillotine.naturalWidth > 0) {
      ctx.drawImage(this.texGuillotine, this.leftWallX, bladeY - 96, bladeW, 132);
    } else {
      const bladeGrad = ctx.createLinearGradient(0, bladeY - 96, 0, bladeY + 26);
      bladeGrad.addColorStop(0, '#1a1514');
      bladeGrad.addColorStop(0.68, '#6b605a');
      bladeGrad.addColorStop(1, '#d91822');
      ctx.fillStyle = bladeGrad;
      ctx.fillRect(this.leftWallX + 6, bladeY - 96, bladeW - 12, 126);
    }

    // Subtle dark-crimson vignette gradient clipped inside the angled blade polygon
    const steelVignette = ctx.createLinearGradient(0, bladeY - 96, 0, bladeY + 28);
    steelVignette.addColorStop(0, 'rgba(14, 5, 6, 0.58)');
    steelVignette.addColorStop(0.6, 'rgba(72, 10, 16, 0.24)');
    steelVignette.addColorStop(1, 'rgba(185, 16, 28, 0.38)');
    ctx.fillStyle = steelVignette;
    ctx.fillRect(this.leftWallX + 6, bladeY - 96, bladeW - 12, 126);
    ctx.restore();

    // Razor-sharp diagonal Damascus bevel edge highlight along the lower cutting edge
    ctx.strokeStyle = '#ff6b4a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(this.leftWallX + 6, bladeY - 18);
    ctx.lineTo(this.rightWallX - 6, bladeY + 26);
    ctx.stroke();

    // Heavy Dark Cast-Iron Stock Beam across (this.leftWallX + 6, bladeY - 126, bladeW - 12, 34) with Brass Corner Rivets
    const beamX = this.leftWallX + 6;
    const beamY = bladeY - 126;
    const beamW = bladeW - 12;
    const beamH = 34;
    const stockGrad = ctx.createLinearGradient(0, beamY, 0, beamY + beamH);
    stockGrad.addColorStop(0, '#140e0b');
    stockGrad.addColorStop(0.5, '#2b1e16');
    stockGrad.addColorStop(1, '#0e0907');
    ctx.fillStyle = stockGrad;
    ctx.strokeStyle = '#8c6239';
    ctx.lineWidth = 1.6;
    ctx.fillRect(beamX, beamY, beamW, beamH);
    ctx.strokeRect(beamX, beamY, beamW, beamH);

    // Brass corner & flange rivets along the cast-iron stock beam
    const rivetCoords = [
      [beamX + 10, beamY + 7],
      [beamX + 10, beamY + beamH - 7],
      [beamX + beamW - 10, beamY + 7],
      [beamX + beamW - 10, beamY + beamH - 7],
      [cx - 170, beamY + 17],
      [cx + 170, beamY + 17]
    ];
    ctx.fillStyle = '#e0a958';
    for (let r = 0; r < rivetCoords.length; r++) {
      ctx.beginPath();
      ctx.arc(rivetCoords[r][0], rivetCoords[r][1], 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Warning Plaque mounted cleanly inside the dark iron stock beam (bladeY - 109)
    ctx.fillStyle = 'rgba(10, 4, 4, 0.96)';
    ctx.strokeStyle = '#ff2a38';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(cx - 154, bladeY - 121, 308, 24, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff4d58';
    ctx.font = 'bold 11px "Cinzel", "Share Tech Mono", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`PENALTY ASSESSED: ${fingerName} SEVERED!`, cx, bladeY - 109);
    ctx.restore();
  }
}

window.CoinPusherPhysics = CoinPusherPhysics;
window.PusherPhysics = CoinPusherPhysics;

