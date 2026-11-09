/**
 * OBOL: The Collector's Debt — Commercial Anti-Theft, DRM & Memory Vault Shield
 * =============================================================================
 * Multi-layered protection architecture for commercial paid HTML5 / Web builds:
 *   - Layer 1: XOR-Encrypted Domain Lock & Cross-Origin Anti-Iframe Jacking
 *   - Layer 2: Salted 64-Bit FNV-1a / SipHash-Style Memory Anti-Tamper Vault
 *   - Layer 3: Anti-Ripping DOM, Keyboard Shortcut & Canvas Scraping Protection
 *
 * Compatibility Guarantee:
 *   - Automatically detects authorized local development/test harnesses
 *     (`localhost`, `127.0.0.1`, `file:`) and Node VM (`verify-runtime.js`)
 *     so automated E2E tests (`e2e-driver.js`) and Finger Flick (`#pusher-canvas`
 *     right-click `contextmenu`) work with zero interference.
 */

(function (globalScope) {
  'use strict';

  const XOR_DOMAIN_KEY = [0x9e, 0x37, 0x79, 0xb9, 0x7f, 0x4a, 0x7c, 0x15];

  /**
   * Encode an ASCII hostname into an XOR-obfuscated byte array using XOR_DOMAIN_KEY
   * plus position-dependent rolling avalanche.
   */
  function encodeDomainBytes(str, key = XOR_DOMAIN_KEY) {
    const clean = String(str || '').trim().toLowerCase();
    const out = [];
    for (let i = 0; i < clean.length; i++) {
      const k = key[i % key.length] ^ ((i * 0x1f) & 0xff);
      out.push((clean.charCodeAt(i) ^ k) & 0xff);
    }
    return out;
  }

  /**
   * Decode an XOR-obfuscated byte array back into a plaintext hostname string.
   */
  function decodeDomainBytes(bytes, key = XOR_DOMAIN_KEY) {
    if (!Array.isArray(bytes)) return '';
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const k = key[i % key.length] ^ ((i * 0x1f) & 0xff);
      out += String.fromCharCode((bytes[i] ^ k) & 0xff);
    }
    return out;
  }

  /**
   * Layer 1: Pre-computed XOR-encoded byte table of licensed/authorized hostnames.
   * Encoded with XOR_DOMAIN_KEY = [0x9e, 0x37, 0x79, 0xb9, 0x7f, 0x4a, 0x7c, 0x15]
   * and position rolling mask ((i * 0x1f) & 0xff).
   *
   * Decodes to:
   *   - "localhost"
   *   - "127.0.0.1"
   *   - "::1"
   *   - "itch.io"
   *   - "itch.zone"
   *   - "html-classic.itch.zone"
   *   - "v6p9d9t4.ssl.hwcdn.net"
   *   - "poki.com"
   *   - "poki-gdn.com"
   *   - "crazygames.com"
   *   - "newgrounds.com"
   *   - "ungrounded.net"
   *   - "armorgames.com"
   *   - "armor.ag"
   *   - "steampowered.com"
   *   - "steamcommunity.com"
   *   - "obol.purgatory.arcade"
   */
  const ENCRYPTED_DOMAIN_TABLE = [
    // "localhost"
    [242, 71, 36, 133, 111, 185, 169, 191, 18],
    // "127.0.0.1"
    [175, 26, 112, 202, 51, 255, 246, 226, 87],
    // "::1"
    [164, 18, 118],
    // "itch.io"
    [247, 92, 36, 140, 45, 184, 169],
    // "itch.zone"
    [247, 92, 36, 140, 45, 171, 169, 162, 3],
    // "html-classic.itch.zone"
    [246, 92, 42, 136, 46, 178, 170, 173, 21, 83, 38, 143, 37, 176, 186, 167, 6, 22, 45, 155, 125, 164],
    // "v6p9d9t4.ssl.hwcdn.net"
    [232, 30, 55, 221, 103, 232, 178, 248, 72, 83, 60, 128, 37, 177, 185, 167, 10, 86, 121, 154, 118, 181],
    // "poki.com"
    [238, 71, 44, 141, 45, 178, 169, 161],
    // "poki-gdn.com"
    [238, 71, 44, 141, 46, 182, 162, 162, 72, 67, 32, 129],
    // "crazygames.com"
    [253, 90, 38, 158, 122, 182, 167, 161, 3, 83, 97, 143, 100, 180],
    // "newgrounds.com"
    [240, 77, 48, 131, 113, 190, 179, 162, 2, 83, 97, 143, 100, 180],
    // "ungrounded.net"
    [235, 70, 32, 150, 108, 164, 168, 168, 3, 68, 97, 130, 110, 173],
    // "armorgames.com"
    [255, 90, 42, 139, 113, 182, 167, 161, 3, 83, 97, 143, 100, 180],
    // "armor.ag"
    [255, 90, 42, 139, 113, 255, 167, 171],
    // "steampowered.com"
    [237, 92, 34, 133, 110, 161, 169, 187, 3, 82, 42, 136, 37, 186, 161, 169],
    // "steamcommunity.com"
    [237, 92, 34, 133, 110, 178, 169, 161, 11, 85, 33, 133, 127, 160, 224, 167, 1, 85],
    // "obol.purgatory.arcade"
    [241, 74, 40, 136, 45, 161, 179, 190, 1, 65, 59, 131, 121, 160, 224, 165, 28, 91, 54, 144, 118]
  ];

  const DECODED_DOMAINS = ENCRYPTED_DOMAIN_TABLE.map((row) => decodeDomainBytes(row));

  // Private per-session cryptographic state inside closure (inaccessible to DevTools console)
  const SESSION_SALT_HI = (Math.floor(Math.random() * 0xffffffff) ^ 0x811c9dc5) >>> 0;
  const SESSION_SALT_LO = (Math.floor(Math.random() * 0xffffffff) ^ 0x9e3779b9) >>> 0;
  const ECONOMY_KEYS = ['wallet', 'chuteBank', 'quotaTarget', 'ante', 'quotaLevel', 'fingers', 'totalEarnedRun'];

  let _sealedSnapshot = null;
  let _sealedSignature = null;
  let _tamperDetections = 0;
  let _isCabinetLocked = false;
  let _lockReason = null;
  let _internalCanvasCallDepth = 0;

  /**
   * Detect if current environment is an authorized local test/dev origin
   * (`localhost`, `127.0.0.1`, `::1`, `file:`, or Node VM without hostname).
   */
  function isLocalOrTestEnvironment() {
    if (typeof window === 'undefined' || !window.location) return true;
    if (window.__OBOL_DEV_AUTHORIZED__ === true) return true;
    const proto = String(window.location.protocol || '').toLowerCase();
    const host = String(window.location.hostname || '').toLowerCase().trim();
    if (proto === 'file:' || proto === 'about:' || proto === 'blob:' || proto === 'data:') {
      return true;
    }
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
      return true;
    }
    return false;
  }

  /**
   * Check whether a given hostname and protocol match our licensed domain table.
   */
  function isAuthorizedOrigin(hostname, protocol, customList) {
    const proto = String(
      protocol !== undefined ? protocol : (typeof window !== 'undefined' && window.location ? window.location.protocol : '')
    ).toLowerCase();
    const host = String(
      hostname !== undefined ? hostname : (typeof window !== 'undefined' && window.location ? window.location.hostname : '')
    )
      .toLowerCase()
      .trim()
      .replace(/^\[|\]$/g, '');

    if (proto === 'file:' || proto === 'about:' || proto === 'blob:' || proto === 'data:') {
      if (!host || host === 'localhost' || host === '127.0.0.1') return true;
    }
    if (!host && (!proto || proto === 'file:' || proto === 'about:')) {
      return true;
    }

    const domainList = Array.isArray(customList) && customList.length > 0 ? customList : DECODED_DOMAINS;
    for (let i = 0; i < domainList.length; i++) {
      const allowed = String(domainList[i] || '').toLowerCase().trim();
      if (!allowed) continue;
      if (host === allowed || host.endsWith('.' + allowed)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check whether iframe embedding is authorized.
   * Blocks untrusted cross-origin `<iframe>` wrappers while allowing licensed portals
   * (`itch.io`, `itch.zone`, `poki.com`, `crazygames.com`, `localhost`, etc.).
   */
  function isAuthorizedIframe(mockReferrer, forceFramed) {
    if (typeof window === 'undefined') return true;
    const isFramed = forceFramed !== undefined ? Boolean(forceFramed) : (function () {
      try {
        return window.self !== window.top;
      } catch (e) {
        return true;
      }
    })();

    if (!isFramed) return true;

    // Always allow local E2E / localhost frames unless a mock untrusted referrer is explicitly being tested
    if (mockReferrer === undefined && isLocalOrTestEnvironment()) {
      return true;
    }

    const refStr = mockReferrer !== undefined
      ? String(mockReferrer || '')
      : (typeof document !== 'undefined' && document.referrer ? String(document.referrer) : '');

    if (!refStr) {
      // Check ancestorOrigins if available in Chromium
      if (
        mockReferrer === undefined &&
        window.location &&
        window.location.ancestorOrigins &&
        window.location.ancestorOrigins.length > 0
      ) {
        for (let i = 0; i < window.location.ancestorOrigins.length; i++) {
          try {
            const u = new URL(window.location.ancestorOrigins[i]);
            if (!isAuthorizedOrigin(u.hostname, u.protocol)) {
              return false;
            }
          } catch (e) {
            return false;
          }
        }
        return true;
      }
      // If framed with empty referrer on a non-local origin, check if same-origin top is accessible
      if (mockReferrer === undefined) {
        try {
          const topHost = window.top.location.hostname;
          if (topHost && isAuthorizedOrigin(topHost, window.top.location.protocol)) {
            return true;
          }
        } catch (e) {
          // Cross-origin frame with hidden referrer
          return false;
        }
      }
      return false;
    }

    try {
      const refUrl = new URL(refStr);
      return isAuthorizedOrigin(refUrl.hostname, refUrl.protocol);
    } catch (e) {
      return false;
    }
  }

  /**
   * Layer 1 Lockout Screen: Replaces/overlays the playfield with a diegetic
   * Iron Booth Collector Lockout Screen when piracy or unauthorized embedding is detected.
   */
  function lockCabinet(reason = 'UNAUTHORIZED DOMAIN OR IFRAME PIRACY DETECTED') {
    _isCabinetLocked = true;
    _lockReason = String(reason || 'UNAUTHORIZED DOMAIN OR IFRAME PIRACY DETECTED');

    // Pause active game instance if present
    if (typeof window !== 'undefined') {
      const g = window.obolGame || window.game;
      if (g) {
        g.isPaused = true;
        g.isAttractMode = false;
      }
    }

    if (typeof document === 'undefined' || !document.body) {
      return { locked: true, reason: _lockReason };
    }

    let overlay = document.getElementById('obol-drm-lockout-screen');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'obol-drm-lockout-screen';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483647',
        'background:radial-gradient(circle at 50% 40%, #1c080a 0%, #090304 65%, #020101 100%)',
        'color:#f4e6d2',
        'font-family:"Cinzel", "Share Tech Mono", "Courier New", monospace',
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'justify-content:center',
        'padding:32px',
        'text-align:center',
        'user-select:none',
        'border:8px solid #3a1814',
        'box-shadow:inset 0 0 120px rgba(255, 24, 44, 0.35)'
      ].join(';');

      overlay.innerHTML = `
        <div style="max-width:640px;width:100%;background:linear-gradient(180deg,#1a110e 0%,#0d0706 100%);border:3px solid #c9303e;border-radius:8px;padding:32px 28px;box-shadow:0 20px 60px rgba(0,0,0,0.95), inset 0 0 32px rgba(201,48,62,0.22);position:relative;">
          <div style="font-size:11px;letter-spacing:3px;color:#ff5c6c;margin-bottom:10px;font-weight:bold;">
            IRON BOOTH #08 &bull; PURGATORY MINT SECURITY PROTOCOL
          </div>
          <div style="width:68px;height:68px;margin:0 auto 16px;border-radius:50%;background:#26080c;border:2px solid #ff3b4e;display:flex;align-items:center;justify-content:center;box-shadow:0 0 24px rgba(255,59,78,0.45);">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 10.5C6 6 9 3.5 12 3.5C15 3.5 18 6 18 10.5C18 13 16.8 14.5 16 15.8V19.5H8V15.8C7.2 14.5 6 13 6 10.5Z" fill="#3a2320" stroke="#ffd86b" stroke-width="1.6"/>
              <circle cx="9.6" cy="10.5" r="1.8" fill="#ff3b4e"/>
              <circle cx="14.4" cy="10.5" r="1.8" fill="#ff3b4e"/>
              <path d="M10 16.5V19.5M12 16.5V19.5M14 16.5V19.5" stroke="#ffd86b" stroke-width="1.4"/>
            </svg>
          </div>
          <h1 style="font-size:24px;letter-spacing:2px;color:#ff3b4e;margin:0 0 12px;text-shadow:0 0 14px rgba(255,59,78,0.6);">
            CABINET SHUTTER LOCKED BY THE COLLECTOR
          </h1>
          <p style="font-size:14px;line-height:1.6;color:#e0d0b8;margin:0 0 18px;">
            "THIEVES AND COUNTERFEITERS LOSE MORE THAN THREE FINGERS IN THIS BOOTH."
          </p>
          <div id="obol-drm-reason-box" style="background:#080304;border:1px solid #7a1c24;padding:12px 16px;border-radius:4px;font-family:monospace;font-size:12px;color:#ff8a96;letter-spacing:1px;margin-bottom:20px;">
          </div>
          <div style="font-size:12px;color:#a89582;line-height:1.5;">
            This copy of <strong style="color:#ffd86b;">OBOL: The Collector's Debt</strong> is bound to its official licensed distribution domains. Play or purchase the authentic release on our official store page.
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const reasonBox = overlay.querySelector('#obol-drm-reason-box');
    if (reasonBox) {
      reasonBox.textContent = `FAULT CODE [0xDEAD-OBOL]: ${_lockReason}`;
    }

    return { locked: true, reason: _lockReason };
  }

  /**
   * Restores the cabinet if locked (used for automated security verification tests).
   */
  function unlockCabinet() {
    _isCabinetLocked = false;
    _lockReason = null;
    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('obol-drm-lockout-screen');
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
    return { locked: false };
  }

  /**
   * Verify both domain origin and iframe hierarchy.
   */
  function verifyDomainAndFrame(options = {}) {
    const host = options.hostname !== undefined
      ? options.hostname
      : (typeof window !== 'undefined' && window.location ? window.location.hostname : 'localhost');
    const proto = options.protocol !== undefined
      ? options.protocol
      : (typeof window !== 'undefined' && window.location ? window.location.protocol : 'http:');

    const domainOk = isAuthorizedOrigin(host, proto, options.authorizedDomains);
    const iframeOk = isAuthorizedIframe(options.referrer, options.isFramed);

    if (!domainOk || !iframeOk) {
      const why = !domainOk
        ? `UNAUTHORIZED DOMAIN ORIGIN (${host || 'UNKNOWN'})`
        : 'UNAUTHORIZED CROSS-ORIGIN IFRAME EMBEDDING DETECTED';
      if (options.autoLock !== false) {
        lockCabinet(why);
      }
      return { authorized: false, domainOk, iframeOk, reason: why };
    }
    return { authorized: true, domainOk: true, iframeOk: true, reason: null };
  }

  /**
   * Layer 2: Salted 64-bit FNV-1a + SipHash-style mixing signature over critical economy state:
   * (`wallet`, `chuteBank`, `quotaTarget`, `ante` / `quotaLevel`, `fingers`, `totalEarnedRun`).
   */
  function extractEconomyState(game) {
    if (!game || typeof game !== 'object') {
      return {
        wallet: 0,
        chuteBank: 0,
        quotaTarget: 150,
        ante: 1,
        quotaLevel: 1,
        fingers: 3,
        totalEarnedRun: 0
      };
    }
    const anteVal = Number(game.ante !== undefined ? game.ante : (game.quotaLevel !== undefined ? game.quotaLevel : 1)) || 1;
    const quotaLevelVal = Number(game.quotaLevel !== undefined ? game.quotaLevel : anteVal) || 1;
    return {
      wallet: Number(game.wallet) || 0,
      chuteBank: Number(game.chuteBank) || 0,
      quotaTarget: Number(game.quotaTarget) || 150,
      ante: anteVal,
      quotaLevel: quotaLevelVal,
      fingers: Number(game.fingers !== undefined ? game.fingers : 3),
      totalEarnedRun: Number(game.totalEarnedRun) || 0
    };
  }

  function computeSignature(stateObj) {
    const s = extractEconomyState(stateObj);
    const payload = [
      `w:${Math.round(s.wallet * 100)}`,
      `c:${Math.round(s.chuteBank * 100)}`,
      `q:${Math.round(s.quotaTarget * 100)}`,
      `a:${Math.round(s.ante)}`,
      `l:${Math.round(s.quotaLevel)}`,
      `f:${Math.round(s.fingers)}`,
      `t:${Math.round(s.totalEarnedRun * 100)}`
    ].join('|');

    let h1 = (0x811c9dc5 ^ SESSION_SALT_HI) >>> 0;
    let h2 = (0xcbf29ce4 ^ SESSION_SALT_LO) >>> 0;

    for (let i = 0; i < payload.length; i++) {
      const ch = payload.charCodeAt(i) & 0xff;
      // Low 32-bit FNV-1a + Sip-style ARX mix
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h1 = ((h1 << 13) | (h1 >>> 19)) >>> 0;
      h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;

      // High 32-bit cross-coupled lane
      h2 ^= ch ^ (i * 0x9e);
      h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
      h2 = ((h2 << 17) | (h2 >>> 15)) >>> 0;
      h2 = (h2 ^ h1) >>> 0;
    }

    // Finalize avalanche
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b) >>> 0;
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35) >>> 0;
    h1 = (h1 ^ (h1 >>> 16)) >>> 0;

    h2 ^= h2 >>> 16;
    h2 = Math.imul(h2, 0xc2b2ae35) >>> 0;
    h2 ^= h2 >>> 13;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 16)) >>> 0;

    return h2.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0');
  }

  /**
   * Seals the current economy variables of `game` into the private closure vault.
   */
  function sealState(game) {
    if (!game || typeof game !== 'object') return null;
    const snap = extractEconomyState(game);
    const sig = computeSignature(snap);
    _sealedSnapshot = snap;
    _sealedSignature = sig;
    return sig;
  }

  /**
   * Verifies whether `game`'s current economy variables match the sealed 64-bit signature.
   */
  function verifyState(game) {
    if (!game || typeof game !== 'object') return true;
    if (!_sealedSnapshot || !_sealedSignature) {
      sealState(game);
      return true;
    }
    const currentSig = computeSignature(game);
    return currentSig === _sealedSignature;
  }

  /**
   * Synchronizes or enforces the cryptographic memory anti-tamper vault.
   * - When `shield.strictMemoryGuard` is `true` (or `enforce === true`), any unsealed
   *   modification to `wallet`, `chuteBank`, `quotaTarget`, `ante`, `fingers`, or
   *   `totalEarnedRun` (e.g., `game.wallet = 999999` in DevTools) is detected,
   *   restored to the sealed snapshot, and logged as a tamper event.
   * - When running on `localhost` / `127.0.0.1` E2E test harness with `strictMemoryGuard === false`,
   *   programmatic E2E driver mutations re-seal cleanly without breaking test scenarios.
   */
  function syncAndVerify(game, enforce) {
    if (!game || typeof game !== 'object') {
      return { valid: true, restored: false, tamperCount: _tamperDetections };
    }
    if (!_sealedSnapshot || !_sealedSignature) {
      sealState(game);
      return { valid: true, restored: false, tamperCount: _tamperDetections };
    }

    const isStrict = enforce !== undefined ? Boolean(enforce) : Boolean(ObolSecurityShield.strictMemoryGuard);
    const isValid = verifyState(game);

    if (isValid) {
      return { valid: true, restored: false, tamperCount: _tamperDetections };
    }

    if (!isStrict) {
      // In authorized local dev / E2E driver mode when strictMemoryGuard is not forced, re-seal cleanly
      sealState(game);
      return { valid: true, restored: false, tamperCount: _tamperDetections };
    }

    // Strict Anti-Tamper Enforcement: restore sealed values from private closure vault
    _tamperDetections++;
    game.wallet = _sealedSnapshot.wallet;
    game.chuteBank = _sealedSnapshot.chuteBank;
    game.quotaTarget = _sealedSnapshot.quotaTarget;
    if ('ante' in game) {
      game.ante = _sealedSnapshot.ante;
    }
    if ('quotaLevel' in game) {
      game.quotaLevel = _sealedSnapshot.quotaLevel;
    }
    game.fingers = _sealedSnapshot.fingers;
    game.totalEarnedRun = _sealedSnapshot.totalEarnedRun;

    if (typeof game.updateHUD === 'function') {
      try {
        game.updateHUD();
      } catch (e) {
        // Ignore HUD update error in headless mocks
      }
    }

    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(
        `[OBOL SECURITY] MEMORY TAMPER DETECTED (#${_tamperDetections})! Unsealed economy mutation reverted to cryptographic vault snapshot.`
      );
    }

    return {
      valid: false,
      restored: true,
      tamperCount: _tamperDetections,
      restoredState: Object.assign({}, _sealedSnapshot)
    };
  }

  /**
   * Wraps legitimate ObolGame prototype/instance methods so every legitimate game
   * economy transition automatically updates the cryptographic seal.
   */
  function attachToGame(game) {
    if (!game || typeof game !== 'object' || game.__obolSecurityAttached) return game;
    Object.defineProperty(game, '__obolSecurityAttached', {
      value: true,
      enumerable: false,
      configurable: true
    });

    sealState(game);

    const legitimateMethods = [
      'initAttractState',
      'applyStarterLoadout',
      'startNewRun',
      'onCoinScored',
      'handleCoinScored',
      'openReliquaryChest',
      'handleCoinBurned',
      'handleSkillGateHit',
      'handleTokenFused',
      'completeQuota',
      'advanceToNextQuota',
      'triggerBloodPact',
      'smeltCopperObol',
      'brandTokenClass',
      'punishTiltOverload',
      'triggerPenalty',
      'triggerGameOver',
      'rollBlackMarket',
      'renderShop',
      'unlockAchievement',
      'triggerViralShowcase',
      'clampBoardCoinValues',
      'setTormentTier',
      'tryDropCurrentToken'
    ];

    let callDepth = 0;
    legitimateMethods.forEach((methodName) => {
      const orig = game[methodName];
      if (typeof orig === 'function') {
        game[methodName] = function (...args) {
          // Verify state only on outer entry so nested legitimate calls don't revert outer mutations
          if (callDepth === 0 && ObolSecurityShield.strictMemoryGuard && _sealedSnapshot) {
            syncAndVerify(this, true);
          }
          callDepth++;
          try {
            return orig.apply(this, args);
          } finally {
            callDepth = Math.max(0, callDepth - 1);
            sealState(this);
          }
        };
      }
    });

    return game;
  }

  /**
   * Layer 3: Anti-Ripping & Source/Canvas Scraping Protection
   * - Blocks `dragstart` and `selectstart` on images/canvases.
   * - Blocks source-ripping shortcuts (`Ctrl+S`, `Ctrl+U`, `Ctrl+Shift+I`, `F12` in production mode).
   * - Blocks default browser contextmenu on non-canvas elements while preserving
   *   `#pusher-canvas` right-click `contextmenu` for the Finger Flick mechanic (`M6`).
   * - Protects `HTMLCanvasElement.prototype.toDataURL` and `toBlob` in production mode.
   */
  let _guardsInstalled = false;
  function installAntiRippingGuards() {
    if (_guardsInstalled || typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    _guardsInstalled = true;

    // 1. Prevent image/canvas dragging & text selection ripping
    if (typeof document.addEventListener === 'function') {
      document.addEventListener(
        'dragstart',
        (e) => {
          const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
          if (tag === 'IMG' || tag === 'CANVAS' || tag === 'SVG' || tag === 'A') {
            e.preventDefault();
          }
        },
        { passive: false }
      );

      document.addEventListener(
        'selectstart',
        (e) => {
          const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
          if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
            e.preventDefault();
          }
        },
        { passive: false }
      );

      // 2. Context menu protection:
      // CRITICAL COMPATIBILITY: NEVER stop propagation or interfere with `#pusher-canvas`,
      // because `game.js` uses right-click (`contextmenu`) on `#pusher-canvas` for Finger Flick (M6)!
      document.addEventListener(
        'contextmenu',
        (e) => {
          if (
            e.target &&
            (e.target.id === 'pusher-canvas' ||
              (typeof e.target.closest === 'function' && e.target.closest('#pusher-canvas')))
          ) {
            // Let `#pusher-canvas` handle its own right-click Finger Flick listener!
            return;
          }
          e.preventDefault();
        },
        false // Bubble phase, never capture, never stopPropagation!
      );
    }

    // 3. Keyboard shortcut blocker for source-saving / ripping (`Ctrl+S`, `Ctrl+U`, and DevTools in dist mode)
    if (typeof window.addEventListener === 'function') {
      window.addEventListener(
        'keydown',
        (e) => {
          const key = String(e.key || '').toUpperCase();
          const ctrlOrMeta = Boolean(e.ctrlKey || e.metaKey);

          // Always block Ctrl+S (Save Page As) and Ctrl+U (View Source)
          if (ctrlOrMeta && (key === 'S' || key === 'U')) {
            e.preventDefault();
            return;
          }

          // In production dist mode (or when strictDevToolsGuard is enabled), block F12 & Ctrl+Shift+I/J/C
          if (ObolSecurityShield.productionMode || ObolSecurityShield.strictDevToolsGuard) {
            if (
              key === 'F12' ||
              (ctrlOrMeta && e.shiftKey && (key === 'I' || key === 'J' || key === 'C'))
            ) {
              e.preventDefault();
              e.stopPropagation();
            }
          }
        },
        true
      );
    }

    // 4. Canvas scraping protection (`toDataURL` / `toBlob`) in production mode
    if (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype) {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const origToBlob = HTMLCanvasElement.prototype.toBlob;

      if (typeof origToDataURL === 'function' && ! origToDataURL.__obolProtected) {
        const wrappedToDataURL = function (...args) {
          const enforceCanvasGuard =
            ObolSecurityShield.strictCanvasGuard ||
            (ObolSecurityShield.productionMode && !isLocalOrTestEnvironment());

          if (enforceCanvasGuard && _internalCanvasCallDepth <= 0 && this.id === 'pusher-canvas') {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
              console.warn('[OBOL SECURITY] Blocked unauthorized external Canvas.toDataURL() rip attempt.');
            }
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          }
          return origToDataURL.apply(this, args);
        };
        wrappedToDataURL.__obolProtected = true;
        HTMLCanvasElement.prototype.toDataURL = wrappedToDataURL;
      }

      if (typeof origToBlob === 'function' && !origToBlob.__obolProtected) {
        const wrappedToBlob = function (callback, ... rest) {
          const enforceCanvasGuard =
            ObolSecurityShield.strictCanvasGuard ||
            (ObolSecurityShield.productionMode && !isLocalOrTestEnvironment());

          if (enforceCanvasGuard && _internalCanvasCallDepth <= 0 && this.id === 'pusher-canvas') {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
              console.warn('[OBOL SECURITY] Blocked unauthorized external Canvas.toBlob() rip attempt.');
            }
            if (typeof callback === 'function') callback(null);
            return;
          }
          return origToBlob.call(this, callback, ...rest);
        };
        wrappedToBlob.__obolProtected = true;
        HTMLCanvasElement.prototype.toBlob = wrappedToBlob;
      }
    }
  }

  const isLocalEnv = isLocalOrTestEnvironment();
  const isDistBuild = typeof window !== 'undefined' && Boolean(window.__OBOL_DIST_BUILD__);

  const ObolSecurityShield = {
    version: '1.0.0-commercial-drm',
    encryptedDomainTable: ENCRYPTED_DOMAIN_TABLE,
    authorizedDomains: DECODED_DOMAINS.slice(),
    productionMode: isDistBuild || !isLocalEnv,
    strictMemoryGuard: isDistBuild || !isLocalEnv,
    strictCanvasGuard: false,
    strictDevToolsGuard: isDistBuild,

    get isCabinetLocked() {
      return _isCabinetLocked;
    },

    get lockReason() {
      return _lockReason;
    },

    get tamperDetections() {
      return _tamperDetections;
    },

    encodeDomainBytes,
    decodeDomainBytes,
    isLocalOrTestEnvironment,
    isAuthorizedOrigin,
    isAuthorizedIframe,
    verifyDomainAndFrame,
    lockCabinet,
    unlockCabinet,

    computeSignature,
    sealState,
    verifyState,
    syncAndVerify,
    attachToGame,

    setStrictMemoryGuard(enabled) {
      this.strictMemoryGuard = Boolean(enabled);
      return this.strictMemoryGuard;
    },

    getSealedSnapshot() {
      return _sealedSnapshot
        ? Object.assign({}, _sealedSnapshot, { signature: _sealedSignature })
        : null;
    },

    withAuthorizedCanvasAccess(fn) {
      _internalCanvasCallDepth++;
      try {
        return fn();
      } finally {
        _internalCanvasCallDepth = Math.max(0, _internalCanvasCallDepth - 1);
      }
    },

    installAntiRippingGuards,

    getStatus() {
      return {
        version: this.version,
        authorizedOrigin: isAuthorizedOrigin(),
        authorizedIframe: isAuthorizedIframe(),
        isCabinetLocked: _isCabinetLocked,
        strictMemoryGuard: this.strictMemoryGuard,
        productionMode: this.productionMode,
        sealedSignature: _sealedSignature,
        tamperDetections: _tamperDetections,
        authorizedDomainCount: this.authorizedDomains.length,
        assetVaultActive: typeof window !== 'undefined' && Boolean(window.__OBOL_VAULT__)
      };
    }
  };

  if (typeof window !== 'undefined') {
    window.ObolSecurityShield = ObolSecurityShield;

    // Install anti-ripping DOM & Canvas guards immediately
    installAntiRippingGuards();

    // Perform Layer 1 Domain & Iframe verification and attach to game once DOM is ready
    const bootSecurity = () => {
      verifyDomainAndFrame({ autoLock: true });
      const g = window.obolGame || window.game;
      if (g) {
        attachToGame(g);
      }
    };

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(bootSecurity, 0);
        });
      } else {
        setTimeout(bootSecurity, 0);
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ObolSecurityShield;
  }
})(typeof window !== 'undefined' ? window : globalThis);
