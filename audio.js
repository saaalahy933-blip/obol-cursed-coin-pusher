/**
 * OBOL: Hybrid Sample + Procedural Web Audio Engine (Steam Commercial Edition - S3)
 * - Multi-Bus Industrial WebAudio Architecture (`sfxBus`, `ambienceBus`, `musicBus`, `uiBus` -> `masterGain`)
 * - 13-Asset Physical-Modeling WAV Foley & Multi-Stem Sample Pool (`assets/audio/`)
 * - Metallic Cabinet Impulse Response Convolution Reverb (`ConvolverNode` via `assets/audio/ir-iron-booth.wav`)
 * - 3-Stem Sample-Aligned 110 BPM Adaptive Industrial Music Mixer (`stem-base-drone`, `stem-rhythm-machinery`, `stem-tension-overdrive`)
 * - Full Procedural Synthesis Layer & Headless Fallback
 */

const OBOL_AUDIO_MANIFEST = {
  'ir-iron-booth': 'assets/audio/ir-iron-booth.wav',
  'coin-clink-1': 'assets/audio/foley/coin-clink-1.wav',
  'coin-clink-2': 'assets/audio/foley/coin-clink-2.wav',
  'coin-clink-3': 'assets/audio/foley/coin-clink-3.wav',
  'coin-clink-heavy': 'assets/audio/foley/coin-clink-heavy.wav',
  'coin-chute-drop': 'assets/audio/foley/coin-chute-drop.wav',
  'piston-stroke': 'assets/audio/foley/piston-stroke.wav',
  'piston-retract': 'assets/audio/foley/piston-retract.wav',
  'guillotine-shear': 'assets/audio/foley/guillotine-shear.wav',
  'jackpot-bell': 'assets/audio/foley/jackpot-bell.wav',
  'stem-base-drone': 'assets/audio/stems/stem-base-drone.wav',
  'stem-rhythm-machinery': 'assets/audio/stems/stem-rhythm-machinery.wav',
  'stem-tension-overdrive': 'assets/audio/stems/stem-tension-overdrive.wav'
};

class ObolAudioEngine {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.muted = false;
    this.lastClinkTime = 0;
    this.lastPegTime = 0;
    this.lastHeartbeatTime = 0;
    this.pegDensity = 0;
    this.clinkDensity = 0;
    this.ambienceStarted = false;

    // Multi-bus architecture
    this.masterGain = null;
    this.masterCompressor = null;
    this.sfxBus = null;
    this.ambienceBus = null;
    this.musicBus = null;
    this.uiBus = null;

    // Convolution reverb nodes (S3)
    this.reverbSend = null;
    this.reverbConvolver = null;
    this.reverbWetGain = null;
    this.reverbActive = false;

    // Sample & Adaptive Stem state (S3)
    this.sampleManifest = OBOL_AUDIO_MANIFEST;
    this.rawSampleData = new Map();
    this.sampleBuffers = new Map();
    this.preloadStarted = false;
    this.preloadPromise = null;
    this.stems = {};
    this.arrangementStems = {};
    this.stemsStarted = false;
    this.activeStemCount = 0;
    this.totalAdaptiveLayers = 0;

    // Ambience nodes
    this.ambienceOscSaw = null;
    this.ambienceOscSub = null;
    this.ambienceFilter = null;
    this.ambienceGain = null;

    // Persistent Piston Servo Loop state
    this.pistonStarted = false;
    this.pistonOsc = null;
    this.pistonGain = null;
    this.pistonNoise = null;
    this.pistonNoiseFilter = null;
    this.pistonNoiseGain = null;
    this.lastPistonExtreme = 0;
    this.lastValveClankTime = 0;

    // 240Hz Gyroscopic Euler Nutation & Multi-Coin Avalanche Telemetry Counters
    this.wobbleSettlePlayedCount = 0;
    this.avalanchePlayedCount = 0;
    this.lastWobbleSettleTime = 0;
    this.lastAvalancheTime = 0;

    // 19th-Century Animatronic Collector Jaw-Chatter & Mechanical Finger-Tap Telemetry Counters
    this.collectorChatterPlayedCount = 0;
    this.collectorFingerTapPlayedCount = 0;
    this._lastChatterTime = 0;
    this._lastFingerTapTime = 0;

    // Live E2E Acoustic Telemetry Counter
    this.telemetry = {
      totalEventsTriggered: 0,
      byCategory: {}
    };

    // Kick off non-blocking WAV asset preloading if running in browser
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      this.preloadSamples();
    }
  }

  recordTelemetry(category = 'sfx') {
    try {
      if (!this.telemetry) {
        this.telemetry = { totalEventsTriggered: 0, byCategory: {} };
      }
      this.telemetry.totalEventsTriggered = (this.telemetry.totalEventsTriggered || 0) + 1;
      this.telemetry.byCategory[category] = (this.telemetry.byCategory[category] || 0) + 1;
    } catch (e) {}
  }

  get loadedSampleCount() {
    return this.sampleBuffers.size;
  }

  /**
   * Fast, deterministic 16-bit RIFF WAV decoder into WebAudio AudioBuffer.
   * Works synchronously once ArrayBuffer is fetched, avoiding headless browser codec hangs.
   */
  decodeWavPCM(arrayBuffer) {
    if (!this.ctx || !arrayBuffer || arrayBuffer.byteLength < 44) return null;
    try {
      const view = new DataView(arrayBuffer);
      const numChannels = Math.max(1, view.getUint16(22, true) || 1);
      const sampleRate = Math.max(8000, view.getUint32(24, true) || 44100);
      const bitsPerSample = view.getUint16(34, true) || 16;
      let offset = 12;
      let dataOffset = 44;
      let dataByteLength = arrayBuffer.byteLength - 44;

      while (offset + 8 <= arrayBuffer.byteLength) {
        const chunkId =
          String.fromCharCode(view.getUint8(offset)) +
          String.fromCharCode(view.getUint8(offset + 1)) +
          String.fromCharCode(view.getUint8(offset + 2)) +
          String.fromCharCode(view.getUint8(offset + 3));
        const chunkSize = view.getUint32(offset + 4, true);
        if (chunkId === 'data') {
          dataOffset = offset + 8;
          dataByteLength = Math.min(chunkSize, arrayBuffer.byteLength - dataOffset);
          break;
        }
        offset += 8 + chunkSize + (chunkSize % 2);
      }

      const bytesPerSample = Math.max(2, bitsPerSample >> 3);
      const srcFrameCount = Math.max(1, Math.floor(dataByteLength / (numChannels * bytesPerSample)));
      const ctxRate = this.ctx.sampleRate || sampleRate;
      const ratio = sampleRate / ctxRate;
      const dstFrameCount = Math.max(1, Math.floor(srcFrameCount / ratio));
      const audioBuf = this.ctx.createBuffer(numChannels, dstFrameCount, ctxRate);

      for (let ch = 0; ch < numChannels; ch++) {
        const channelData = audioBuf.getChannelData(ch);
        if (!channelData) continue;
        for (let i = 0; i < dstFrameCount; i++) {
          const srcIdx = Math.min(srcFrameCount - 1, Math.floor(i * ratio));
          const bytePos = dataOffset + (srcIdx * numChannels + ch) * bytesPerSample;
          if (bytePos + 1 < arrayBuffer.byteLength) {
            channelData[i] = view.getInt16(bytePos, true) / 32768.0;
          }
        }
      }
      return audioBuf;
    } catch (e) {
      return null;
    }
  }

  hydrateDecodedSamples() {
    if (!this.ctx) return;
    for (const [key, ab] of this.rawSampleData.entries()) {
      if (!this.sampleBuffers.has(key)) {
        const buf = this.decodeWavPCM(ab);
        if (buf) {
          this.sampleBuffers.set(key, buf);
        }
      }
    }

    // Wire impulse response into ConvolverNode if decoded
    if (!this.reverbActive && this.sampleBuffers.has('ir-iron-booth')) {
      try {
        if (!this.reverbSend) {
          this.reverbSend = this.ctx.createGain();
          this.reverbSend.gain.setValueAtTime(0.28, this.ctx.currentTime);
        }
        if (!this.reverbWetGain) {
          this.reverbWetGain = this.ctx.createGain();
          this.reverbWetGain.gain.setValueAtTime(0.32, this.ctx.currentTime);
          this.reverbWetGain.connect(this.masterGain || this.ctx.destination);
        }
        if (typeof this.ctx.createConvolver === 'function') {
          this.reverbConvolver = this.ctx.createConvolver();
          this.reverbConvolver.buffer = this.sampleBuffers.get('ir-iron-booth');
          this.reverbSend.connect(this.reverbConvolver);
          this.reverbConvolver.connect(this.reverbWetGain);
          this.reverbActive = true;
        } else {
          this.reverbSend.connect(this.reverbWetGain);
          this.reverbActive = true;
        }
      } catch (e) {
        // Ignore convolver fallback error
      }
    }

    // Start 3-stem adaptive loop once all 3 stems are decoded
    if (
      !this.stemsStarted &&
      this.sampleBuffers.has('stem-base-drone') &&
      this.sampleBuffers.has('stem-rhythm-machinery') &&
      this.sampleBuffers.has('stem-tension-overdrive')
    ) {
      this.startAdaptiveStems();
    }
  }

  preloadSamples() {
    if (this.preloadPromise) return this.preloadPromise;
    this.preloadStarted = true;
    const entries = Object.entries(this.sampleManifest);
    this.preloadPromise = Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const res = await window.fetch(url);
          if (!res || !res.ok) return;
          const ab = await res.arrayBuffer();
          if (ab && ab.byteLength >= 44) {
            this.rawSampleData.set(key, ab);
          }
        } catch (e) {
          // Ignore individual fetch errors in offline/node environments
        }
      })
    ).then(() => {
      if (this.ctx) {
        this.hydrateDecodedSamples();
      }
      return this.loadedSampleCount;
    });
    return this.preloadPromise;
  }

  startAdaptiveStems() {
    if (!this.ctx || this.stemsStarted) return;
    const stemKeys = ['stem-base-drone', 'stem-rhythm-machinery', 'stem-tension-overdrive'];
    const defaultGains = {
      'stem-base-drone': 0.22,
      'stem-rhythm-machinery': 0.09,
      'stem-tension-overdrive': 0.02
    };
    try {
      const now = this.ctx.currentTime;
      const dest = this.musicBus || this.ambienceBus || this.masterGain || this.ctx.destination;
      let count = 0;
      for (const key of stemKeys) {
        const buf = this.sampleBuffers.get(key);
        if (!buf) continue;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(this.muted ? 0 : defaultGains[key], now);

        src.connect(gainNode);
        gainNode.connect(dest);
        src.start(now);

        this.stems[key] = { source: src, gain: gainNode, baseGain: defaultGains[key] };
        count++;
      }
      if (count > 0) {
        this.stemsStarted = true;
        this.activeStemCount = count;
        this.initArrangementLayers(now, dest);
        this.totalAdaptiveLayers = count + Object.keys(this.arrangementStems).length;
      }
    } catch (e) {
      // Ignore stem start errors
    }
  }

  /**
   * S7: Synchronized 5-layer dark-occult harmonic arrangement co-stems
   * (combined with the 3 WAV stems = 8-layer adaptive arrangement).
   */
  initArrangementLayers(now, dest) {
    if (!this.ctx || Object.keys(this.arrangementStems).length > 0) return;
    const layerDefs = [
      { key: 'ritualChimes', type: 'sine', freq: 440.0, filterType: 'bandpass', cutoff: 880, q: 4.5, baseGain: 0.008 },
      { key: 'brassSwell', type: 'sawtooth', freq: 110.0, filterType: 'lowpass', cutoff: 310, q: 2.2, baseGain: 0.012 },
      { key: 'feverLead', type: 'triangle', freq: 329.63, filterType: 'bandpass', cutoff: 660, q: 3.0, baseGain: 0.0 },
      { key: 'tiltPulse', type: 'square', freq: 73.42, filterType: 'lowpass', cutoff: 195, q: 3.5, baseGain: 0.0 },
      { key: 'inquisitorChoir', type: 'sawtooth', freq: 164.81, filterType: 'bandpass', cutoff: 490, q: 2.8, baseGain: 0.005 }
    ];
    for (const def of layerDefs) {
      try {
        const osc = this.ctx.createOscillator();
        const filt = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = def.type;
        osc.frequency.setValueAtTime(def.freq, now);
        filt.type = def.filterType;
        filt.frequency.setValueAtTime(def.cutoff, now);
        filt.Q.setValueAtTime(def.q, now);
        gain.gain.setValueAtTime(this.muted ? 0 : def.baseGain, now);
        osc.connect(filt);
        filt.connect(gain);
        gain.connect(dest);
        osc.start(now);
        this.arrangementStems[def.key] = { osc, filter: filt, gain, baseGain: def.baseGain };
      } catch (e) {
        // Ignore individual arrangement synth error
      }
    }
  }

  updateAdaptiveMusic(comboMult = 1.0, overdriveActive = false, tiltRatio = 0, isBossQuota = false) {
    if (!this.initialized || !this.ctx || !this.stemsStarted) return;
    try {
      const now = this.ctx.currentTime;
      const comboFactor = Math.max(0, Math.min(1, ((Number(comboMult) || 1.0) - 1.0) / 2.5));
      const tiltFactor = Math.max(0, Math.min(1, Number(tiltRatio) || 0));

      const baseGain = this.muted ? 0 : 0.20 + (isBossQuota ? 0.05 : 0);
      const rhythmGain = this.muted ? 0 : 0.08 + comboFactor * 0.16 + (overdriveActive ? 0.08 : 0);
      const tensionGain = this.muted
        ? 0
        : 0.015 +
          (overdriveActive ? 0.20 : 0) +
          (isBossQuota ? 0.12 : 0) +
          Math.max(0, comboFactor - 0.35) * 0.15 +
          Math.max(0, tiltFactor - 0.4) * 0.18;

      if (this.stems['stem-base-drone']?.gain) {
        this.stems['stem-base-drone'].gain.gain.setTargetAtTime(baseGain, now, 0.12);
      }
      if (this.stems['stem-rhythm-machinery']?.gain) {
        this.stems['stem-rhythm-machinery'].gain.gain.setTargetAtTime(rhythmGain, now, 0.12);
      }
      if (this.stems['stem-tension-overdrive']?.gain) {
        this.stems['stem-tension-overdrive'].gain.gain.setTargetAtTime(tensionGain, now, 0.12);
      }

      // S7: Modulate the 5 harmonic arrangement layers in lockstep with game state
      if (this.arrangementStems) {
        const chimesGain = this.muted ? 0 : 0.006 + comboFactor * 0.025;
        const brassGain = this.muted ? 0 : 0.010 + (isBossQuota ? 0.028 : 0) + comboFactor * 0.015;
        const feverGain = this.muted ? 0 : overdriveActive ? 0.032 : Math.max(0, comboFactor - 0.6) * 0.024;
        const tiltGain = this.muted ? 0 : Math.max(0, tiltFactor - 0.35) * 0.04;
        const choirGain = this.muted ? 0 : 0.004 + (isBossQuota ? 0.03 : 0) + (overdriveActive ? 0.018 : 0);

        this.arrangementStems.ritualChimes?.gain?.gain?.setTargetAtTime(chimesGain, now, 0.15);
        this.arrangementStems.brassSwell?.gain?.gain?.setTargetAtTime(brassGain, now, 0.15);
        this.arrangementStems.feverLead?.gain?.gain?.setTargetAtTime(feverGain, now, 0.12);
        this.arrangementStems.tiltPulse?.gain?.gain?.setTargetAtTime(tiltGain, now, 0.1);
        this.arrangementStems.inquisitorChoir?.gain?.gain?.setTargetAtTime(choirGain, now, 0.18);
      }
    } catch (e) {}
  }

  playSample(key, { volume = 0.22, gain, playbackRate = 1.0, rate, bus = null, reverbSend = 0.25, delay = 0, pan = null } = {}) {
    if (this.muted || !this.ctx) return false;
    if (!this.sampleBuffers.has(key) && this.rawSampleData.has(key)) {
      this.hydrateDecodedSamples();
    }
    const buf = this.sampleBuffers.get(key);
    if (!buf) return false;
    try {
      const startTime = this.ctx.currentTime + Math.max(0, Number(delay) || 0);
      const effectiveRate = rate !== undefined ? rate : playbackRate;
      const effectiveVol = gain !== undefined ? gain : volume;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      if (src.playbackRate && typeof src.playbackRate.setValueAtTime === 'function') {
        src.playbackRate.setValueAtTime(Math.max(0.35, Math.min(2.6, effectiveRate)), startTime);
      }

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(Math.max(0.001, Math.min(0.85, effectiveVol)), startTime);

      const targetBus =
        bus === 'ui' ? this.uiBus : bus === 'music' ? this.musicBus : bus === 'ambience' ? this.ambienceBus : bus;
      const outBus = targetBus || this.sfxBus || this.masterGain || this.ctx.destination;

      src.connect(gainNode);
      if (pan !== null && typeof this.ctx.createStereoPanner === 'function') {
        try {
          const panner = this.ctx.createStereoPanner();
          panner.pan.setValueAtTime(Math.max(-1, Math.min(1, Number(pan) || 0)), startTime);
          gainNode.connect(panner);
          panner.connect(outBus);
        } catch (panErr) {
          gainNode.connect(outBus);
        }
      } else {
        gainNode.connect(outBus);
      }

      if (this.reverbActive && this.reverbSend && reverbSend > 0) {
        const revGain = this.ctx.createGain();
        revGain.gain.setValueAtTime(effectiveVol * reverbSend, startTime);
        src.connect(revGain);
        revGain.connect(this.reverbSend);
      }

      src.start(startTime);
      return true;
    } catch (e) {
      return false;
    }
  }

  init() {
    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (!this.ctx) return;

      if (!this.masterGain) {
        const now = this.ctx.currentTime;
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1.0, now);

        // Soft-knee dynamics compressor / anti-clip limiter on master output
        if (typeof this.ctx.createDynamicsCompressor === 'function') {
          try {
            this.masterCompressor = this.ctx.createDynamicsCompressor();
            this.masterCompressor.threshold.setValueAtTime(-9.0, now);
            this.masterCompressor.knee.setValueAtTime(12.0, now);
            this.masterCompressor.ratio.setValueAtTime(6.0, now);
            this.masterCompressor.attack.setValueAtTime(0.003, now);
            this.masterCompressor.release.setValueAtTime(0.14, now);
            this.masterGain.connect(this.masterCompressor);
            this.masterCompressor.connect(this.ctx.destination);
          } catch (compErr) {
            this.masterGain.connect(this.ctx.destination);
          }
        } else {
          this.masterGain.connect(this.ctx.destination);
        }

        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.setValueAtTime(0.9, now);
        this.sfxBus.connect(this.masterGain);

        this.ambienceBus = this.ctx.createGain();
        this.ambienceBus.gain.setValueAtTime(0.85, now);
        this.ambienceBus.connect(this.masterGain);

        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.setValueAtTime(0.82, now);
        this.musicBus.connect(this.masterGain);

        this.uiBus = this.ctx.createGain();
        this.uiBus.gain.setValueAtTime(0.85, now);
        this.uiBus.connect(this.masterGain);
      }

      this.initialized = true;

      if (!this.preloadStarted && typeof window !== 'undefined' && typeof window.fetch === 'function') {
        this.preloadSamples();
      }
      this.hydrateDecodedSamples();

      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume().catch(() => {});
      }
      if (!this.ambienceStarted && !this.muted) {
        this.startAmbience();
      }
    } catch (e) {
      // Safe no-op in headless/restricted environments
    }
  }

  /**
   * Atmospheric dark-industrial bass drone (55Hz sawtooth + 110Hz sub-triangle
   * through a 160Hz lowpass filter at gain 0.075) routed to ambienceBus.
   */
  startAmbience() {
    if (!this.ctx || this.ambienceStarted) return;
    this.ambienceStarted = true;

    try {
      const now = this.ctx.currentTime;
      const oscSaw = this.ctx.createOscillator();
      const oscSub = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      this.ambienceGain = this.ctx.createGain();

      oscSaw.type = 'sawtooth';
      oscSaw.frequency.setValueAtTime(55.0, now); // Deep A1 industrial bass drone

      oscSub.type = 'triangle';
      oscSub.frequency.setValueAtTime(110.0, now); // A2 harmonic body

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160.0, now);
      filter.Q.setValueAtTime(1.8, now);

      this.ambienceGain.gain.setValueAtTime(this.muted ? 0 : 0.075, now);

      oscSaw.connect(filter);
      oscSub.connect(filter);
      filter.connect(this.ambienceGain);
      this.ambienceGain.connect(this.ambienceBus || this.masterGain || this.ctx.destination);

      oscSaw.start(now);
      oscSub.start(now);

      this.ambienceOscSaw = oscSaw;
      this.ambienceOscSub = oscSub;
      this.ambienceFilter = filter;
    } catch (e) {
      // Ignore if blocked before user gesture
    }
  }

  startRoomAmbience() {
    this.startAmbience();
  }

  /**
   * Initializes persistent nodes for the reciprocating shelf piston servo hum & ratchet noise.
   */
  initPistonLoop() {
    if (!this.ctx || this.pistonStarted) return;
    this.pistonStarted = true;

    try {
      const now = this.ctx.currentTime;

      // Servo motor oscillator
      this.pistonOsc = this.ctx.createOscillator();
      this.pistonOsc.type = 'sawtooth';
      this.pistonOsc.frequency.setValueAtTime(42.0, now);

      const servoFilter = this.ctx.createBiquadFilter();
      servoFilter.type = 'lowpass';
      servoFilter.frequency.setValueAtTime(145.0, now);

      this.pistonGain = this.ctx.createGain();
      this.pistonGain.gain.setValueAtTime(0.001, now);

      this.pistonOsc.connect(servoFilter);
      servoFilter.connect(this.pistonGain);
      this.pistonGain.connect(this.ambienceBus || this.masterGain || this.ctx.destination);
      this.pistonOsc.start(now);

      // Filtered mechanical friction/ratchet loop
      const bufLen = this.ctx.sampleRate * 1.5;
      const noiseBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        const click = i % 1100 < 35 ? 1.0 : 0.28;
        data[i] = (Math.random() * 2 - 1) * click;
      }

      this.pistonNoise = this.ctx.createBufferSource();
      this.pistonNoise.buffer = noiseBuf;
      this.pistonNoise.loop = true;

      this.pistonNoiseFilter = this.ctx.createBiquadFilter();
      this.pistonNoiseFilter.type = 'bandpass';
      this.pistonNoiseFilter.frequency.setValueAtTime(420.0, now);
      this.pistonNoiseFilter.Q.setValueAtTime(2.4, now);

      this.pistonNoiseGain = this.ctx.createGain();
      this.pistonNoiseGain.gain.setValueAtTime(0.0005, now);

      this.pistonNoise.connect(this.pistonNoiseFilter);
      this.pistonNoiseFilter.connect(this.pistonNoiseGain);
      this.pistonNoiseGain.connect(this.ambienceBus || this.masterGain || this.ctx.destination);
      this.pistonNoise.start(now);
    } catch (e) {
      // Ignore audio errors
    }
  }

  /**
   * Continuously modulates mechanical servo hum synced to Math.abs(shelfVelY)
   * and triggers a soft pneumatic valve release/clank at front/back reversal points
   * when Math.sin(shelfPhase) crosses +0.98 or -0.98.
   */
  updatePistonAudio(shelfPhase, shelfVelY, overdriveActive = false, tiltRatio = 0) {
    if (!this.initialized || !this.ctx || this.muted) return;
    try {
      if (!this.pistonStarted) {
        this.initPistonLoop();
      }
      if (!this.pistonOsc || !this.pistonGain) return;

      const now = this.ctx.currentTime;
      const speed = Math.abs(Number(shelfVelY) || 0);
      const normSpeed = Math.min(1.0, speed / 95.0);
      const odMult = overdriveActive ? 1.35 : 1.0;
      const tiltMod = Math.max(0, Math.min(1, Number(tiltRatio) || 0)) * 12.0;

      const targetFreq = (38.0 + normSpeed * 28.0) * odMult + tiltMod;
      const targetServoGain = 0.006 + normSpeed * (overdriveActive ? 0.028 : 0.018);
      const targetNoiseGain = 0.002 + normSpeed * (overdriveActive ? 0.016 : 0.01);

      this.pistonOsc.frequency.setTargetAtTime(targetFreq, now, 0.04);
      this.pistonGain.gain.setTargetAtTime(targetServoGain, now, 0.04);

      if (this.pistonNoiseFilter && this.pistonNoiseGain) {
        this.pistonNoiseFilter.frequency.setTargetAtTime(340 + normSpeed * 320 * odMult, now, 0.04);
        this.pistonNoiseGain.gain.setTargetAtTime(targetNoiseGain, now, 0.04);
      }

      const sinPhase = Math.sin(Number(shelfPhase) || 0);
      if (sinPhase >= 0.98 && this.lastPistonExtreme !== 1) {
        this.lastPistonExtreme = 1;
        this.triggerPistonValveClank(overdriveActive, 1);
      } else if (sinPhase <= -0.98 && this.lastPistonExtreme !== -1) {
        this.lastPistonExtreme = -1;
        this.triggerPistonValveClank(overdriveActive, -1);
      } else if (Math.abs(sinPhase) < 0.75) {
        this.lastPistonExtreme = 0;
      }

      this.updateAdaptiveMusic(1.0, overdriveActive, tiltRatio, false);
    } catch (e) {}
  }

  /**
   * Soft pneumatic valve release + iron latch clank at shelf reversal points.
   */
  triggerPistonValveClank(overdriveActive = false, side = 1) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      if (now - this.lastValveClankTime < 0.18) return;
      this.lastValveClankTime = now;

      this.playSample(side > 0 ? 'piston-stroke' : 'piston-retract', {
        rate: overdriveActive ? 1.18 : 0.96,
        gain: overdriveActive ? 0.18 : 0.12
      });

      const dest = this.sfxBus || this.masterGain || this.ctx.destination;

      // Low mechanical clank
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const startFreq = side > 0 ? (overdriveActive ? 92 : 74) : (overdriveActive ? 78 : 62);
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.075);

      gain.gain.setValueAtTime(overdriveActive ? 0.055 : 0.036, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.085);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.09);

      // Subtle pneumatic steam hiss
      const bufLen = Math.floor(this.ctx.sampleRate * 0.065);
      const buffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.35));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1650, now);
      filter.Q.setValueAtTime(1.5, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.022, now);
      nGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.065);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(dest);
      noise.start(now);
    } catch (e) {}
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      if (this.ctx) {
        const now = this.ctx.currentTime;
        if (this.masterGain) {
          this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1.0, now, 0.02);
        }
        if (this.ambienceGain) {
          this.ambienceGain.gain.setTargetAtTime(this.muted ? 0 : 0.055, now, 0.02);
        }
        if (this.musicBus) {
          this.musicBus.gain.setTargetAtTime(this.muted ? 0 : 0.34, now, 0.02);
        }
      }
    } catch (e) {}
    return this.muted;
  }

  /**
   * Mechanical Brass Peg & Capstan Bumper Foley:
   * Crisp bronze bell-pin strike transient + warm harmonic resonance scaling in
   * D Dorian mode intervals with `combo`, with polyphonic energy normalization
   * to prevent clipping when multiple coins strike pegs rapidly.
   */
  playPegHit(combo = 1, isBlessedPeg = false) {
    this.recordTelemetry('pegHit');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dt = Math.max(0, now - this.lastPegTime);
      if (dt < 0.022) return;
      this.lastPegTime = now;

      // Rolling polyphonic voice-density tracker so rapid peg cascades never clip
      this.pegDensity = Math.min(6.5, (this.pegDensity || 0) * Math.exp(-dt / 0.14) + 1.0);
      const polyHeadroom = 1.0 / Math.sqrt(Math.max(1.0, this.pegDensity * 0.85));

      // D Dorian mode intervals (in semitones from D5 = 587.33Hz):
      // 1 (0), 2 (2), b3 (3), 4 (5), 5 (7), 6 (9), b7 (10), 8 (12), 9 (14), b10 (15), 11 (17), 12 (19)
      const dorianSemitones = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19];
      const stepIndex = Math.max(0, Math.floor((Number(combo) || 1) - 1));
      const semitoneOffset =
        dorianSemitones[stepIndex % dorianSemitones.length] +
        Math.min(1, Math.floor(stepIndex / dorianSemitones.length)) * 12;
      const pitchJitter = 1.0 + (Math.random() * 0.016 - 0.008);
      const rootFreq = 587.33 * Math.pow(2, semitoneOffset / 12) * (isBlessedPeg ? 1.25 : 1.0) * pitchJitter;

      const dest = this.sfxBus || this.masterGain || this.ctx.destination;
      let targetOut = dest;
      if (typeof this.ctx.createStereoPanner === 'function') {
        try {
          const panner = this.ctx.createStereoPanner();
          const panPos = Math.sin(stepIndex * 1.37) * 0.48;
          panner.pan.setValueAtTime(panPos, now);
          panner.connect(dest);
          targetOut = panner;
        } catch (panErr) {}
      }

      const baseAmp = (isBlessedPeg ? 0.16 : 0.115) * polyHeadroom;

      // 1. Crisp Bronze Bell-Pin Strike Transient (high-passed metallic pin click + FM bell tine chirp)
      const clickLen = Math.max(16, Math.floor(this.ctx.sampleRate * 0.004));
      const clickBuf = this.ctx.createBuffer(1, clickLen, this.ctx.sampleRate);
      const clickData = clickBuf.getChannelData(0);
      for (let i = 0; i < clickLen; i++) {
        clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickLen * 0.3));
      }
      const clickSrc = this.ctx.createBufferSource();
      clickSrc.buffer = clickBuf;

      const clickFilter = this.ctx.createBiquadFilter();
      clickFilter.type = 'bandpass';
      clickFilter.frequency.setValueAtTime(Math.min(7200, rootFreq * 3.6), now);
      clickFilter.Q.setValueAtTime(2.6, now);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(baseAmp * 0.85, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.0045);

      clickSrc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(targetOut);
      clickSrc.start(now);

      // Metallic strike tine transient (inharmonic 2.76x bell partial)
      const tineOsc = this.ctx.createOscillator();
      const tineGain = this.ctx.createGain();
      tineOsc.type = 'sine';
      tineOsc.frequency.setValueAtTime(Math.min(9500, rootFreq * 2.756), now);
      tineOsc.frequency.exponentialRampToValueAtTime(Math.min(9000, rootFreq * 2.68), now + 0.024);
      tineGain.gain.setValueAtTime(baseAmp * 0.52, now);
      tineGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.028);
      tineOsc.connect(tineGain);
      tineGain.connect(targetOut);
      tineOsc.start(now);
      tineOsc.stop(now + 0.032);

      // 2. Warm Harmonic Bronze Resonance (Fundamental + Octave/Fifth + Bell Shimmer Partial)
      const partials = [
        { mult: 1.0, type: 'triangle', weight: 1.0, decay: 0.165 },
        { mult: 1.498, type: 'sine', weight: isBlessedPeg ? 0.46 : 0.32, decay: 0.13 },
        { mult: 2.0, type: 'sine', weight: 0.38, decay: 0.105 }
      ];

      partials.forEach((p) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = p.type;
        const pFreq = Math.min(10000, rootFreq * p.mult);
        osc.frequency.setValueAtTime(pFreq * 1.008, now);
        osc.frequency.exponentialRampToValueAtTime(pFreq, now + 0.018);

        gain.gain.setValueAtTime(Math.max(0.001, baseAmp * p.weight), now);
        gain.gain.exponentialRampToValueAtTime(0.0007, now + p.decay);

        osc.connect(gain);
        gain.connect(targetOut);

        if (this.reverbActive && this.reverbSend && p.mult === 1.0) {
          const revTap = this.ctx.createGain();
          revTap.gain.setValueAtTime(baseAmp * 0.22, now);
          gain.connect(revTap);
          revTap.connect(this.reverbSend);
        }

        osc.start(now);
        osc.stop(now + p.decay + 0.01);
      });
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  /**
   * Multi-Modal Struck Bullion Coin Clink:
   * Combines loaded WAV sample playback with a 4-mode circular metal plate modal
   * resonator (`f0`, `2.14 * f0`, `3.41 * f0`, `4.92 * f0` with ±6% natural coin-to-coin
   * pitch variation and stereo panning) plus a 4ms high-passed metallic contact transient.
   */
  playCoinClink(intensity = 0.5, massRatio = 1.0, pan = null) {
    this.recordTelemetry('coinClink');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dt = Math.max(0, now - this.lastClinkTime);
      if (dt < 0.022) return;
      this.lastClinkTime = now;

      const safeIntensity = Math.max(0.05, Math.min(1.5, Number(intensity) || 0.5));
      const safeMass = Math.max(0.35, Math.min(4.0, Number(massRatio) || 1.0));

      // Rolling clink density headroom to keep dense coin cascades crisp and unclipped
      this.clinkDensity = Math.min(6.0, (this.clinkDensity || 0) * Math.exp(-dt / 0.11) + 1.0);
      const cascadeHeadroom = 1.0 / Math.sqrt(Math.max(1.0, this.clinkDensity * 0.75));

      // ±6% natural coin-to-coin pitch variation
      const pitchVariation = 1.0 + (Math.random() * 0.12 - 0.06);
      const stereoPan =
        pan !== null
          ? Math.max(-0.88, Math.min(0.88, Number(pan) || 0))
          : Math.max(-0.78, Math.min(0.78, (Math.random() * 2 - 1) * 0.65));

      // 1. Layer physical-modeling metallic coin clink WAV sample
      const sampleKeys =
        safeMass >= 1.6
          ? ['coin-clink-heavy', 'coin-clink-1']
          : safeMass <= 0.75
            ? ['coin-clink-3', 'coin-clink-2']
            : ['coin-clink-1', 'coin-clink-2', 'coin-clink-3', 'coin-clink-heavy'];
      const sampleKey = sampleKeys[Math.floor(Math.random() * sampleKeys.length)];
      const playbackRate = Math.max(0.62, Math.min(1.62, (1.0 / Math.sqrt(safeMass)) * pitchVariation));
      this.playSample(sampleKey, {
        rate: playbackRate,
        gain: Math.min(0.42, Math.max(0.07, safeIntensity * 0.34 * cascadeHeadroom)),
        pan: stereoPan,
        reverbSend: 0.24
      });

      const dest = this.sfxBus || this.masterGain || this.ctx.destination;
      let targetOut = dest;
      if (typeof this.ctx.createStereoPanner === 'function') {
        try {
          const panner = this.ctx.createStereoPanner();
          panner.pan.setValueAtTime(stereoPan, now);
          panner.connect(dest);
          targetOut = panner;
        } catch (panErr) {}
      }

      const vol = Math.min(0.22, Math.max(0.025, safeIntensity * 0.155)) * cascadeHeadroom;

      // 2. 4ms High-Passed Metallic Contact Transient (coin rim edge strike)
      const transientFrames = Math.max(16, Math.floor(this.ctx.sampleRate * 0.004));
      const transientBuf = this.ctx.createBuffer(1, transientFrames, this.ctx.sampleRate);
      const tData = transientBuf.getChannelData(0);
      for (let i = 0; i < transientFrames; i++) {
        tData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (transientFrames * 0.32));
      }
      const transientSrc = this.ctx.createBufferSource();
      transientSrc.buffer = transientBuf;

      const hpFilter = this.ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(3400, now);
      hpFilter.Q.setValueAtTime(1.35, now);

      const transientGain = this.ctx.createGain();
      transientGain.gain.setValueAtTime(vol * 0.92, now);
      transientGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.0042);

      transientSrc.connect(hpFilter);
      hpFilter.connect(transientGain);
      transientGain.connect(targetOut);
      transientSrc.start(now);

      // 3. 4-Mode Circular Metal Plate Modal Resonator (f0, 2.14 * f0, 3.41 * f0, 4.92 * f0)
      const f0 = (1460 / Math.sqrt(safeMass)) * pitchVariation;
      const modalRatios = [1.0, 2.14, 3.41, 4.92];
      const modalWeights = [1.0, 0.62, 0.36, 0.21];
      const modalDecays = [0.095, 0.074, 0.054, 0.038];

      modalRatios.forEach((ratio, idx) => {
        const modeFreq = Math.min(11500, f0 * ratio);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(modeFreq, now);

        const modeAmp = Math.max(0.0009, vol * modalWeights[idx]);
        const decayDur = modalDecays[idx];
        gain.gain.setValueAtTime(modeAmp, now);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + decayDur);

        osc.connect(gain);
        gain.connect(targetOut);
        osc.start(now);
        osc.stop(now + decayDur + 0.008);
      });
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  /**
   * 240Hz Rigid-Body Gyroscopic Coin-Settle Chirp (Euler's Disk Frequency-Acceleration Foley):
   * Synthesizes a heavy metal coin wobbling to a flat rest on a brushed brass/steel deck.
   * Schedules 7 exponentially compressing micro-impacts (k = 0..6) at
   * tOffset = [0.00, 0.048, 0.088, 0.120, 0.145, 0.164, 0.178] seconds,
   * exciting dual inharmonic numismatic modes that pitch upward from 1,240 Hz -> 2,480 Hz
   * while amplitude tapers cleanly to a final crisp metallic settle click.
   */
  playCoinWobbleSettle(intensity = 0.65, pan = 0) {
    this.wobbleSettlePlayedCount = (this.wobbleSettlePlayedCount || 0) + 1;
    this.recordTelemetry('coinSettle');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      if (now - (this.lastWobbleSettleTime || 0) < 0.024) return;
      this.lastWobbleSettleTime = now;

      const safeIntensity = Math.max(0.1, Math.min(1.5, Number(intensity) || 0.65));
      const stereoPan = Math.max(-0.88, Math.min(0.88, Number(pan) || 0));

      // Subtle physical foley sample anchor for the final flat lock
      this.playSample('coin-clink-3', {
        delay: 0.178,
        rate: 1.42,
        gain: Math.min(0.22, Math.max(0.04, safeIntensity * 0.16)),
        pan: stereoPan,
        reverbSend: 0.18
      });

      const dest = this.sfxBus || this.masterGain || this.ctx.destination;
      let targetOut = dest;
      if (typeof this.ctx.createStereoPanner === 'function') {
        try {
          const panner = this.ctx.createStereoPanner();
          panner.pan.setValueAtTime(stereoPan, now);
          panner.connect(dest);
          targetOut = panner;
        } catch (panErr) {}
      }

      const tOffsets = [0.00, 0.048, 0.088, 0.120, 0.145, 0.164, 0.178];
      const baseVol = Math.min(0.19, Math.max(0.03, safeIntensity * 0.14));

      for (let k = 0; k < tOffsets.length; k++) {
        const progress = k / (tOffsets.length - 1);
        const t0 = now + tOffsets[k];
        const isFinalSettle = k === tOffsets.length - 1;

        // Primary numismatic mode pitches upward from 1,240 Hz -> 2,480 Hz as tilt angle collapses
        const fPrimary = 1240 + (2480 - 1240) * progress;
        // Secondary inharmonic circular plate mode (2.14x radial overtone)
        const fSecondary = Math.min(11500, fPrimary * 2.14);

        // Amplitude tapers across the wobble decay, with a crisp accent on the final flat settle click
        const stepAmp = baseVol * (1.0 - progress * 0.56) * (isFinalSettle ? 1.22 : 1.0);
        const decayDur = Math.max(0.015, 0.042 - k * 0.0042);

        // Mode 1: Fundamental rim-nutation mode
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(fPrimary, t0);
        osc1.frequency.exponentialRampToValueAtTime(fPrimary * 1.035, t0 + decayDur);
        gain1.gain.setValueAtTime(Math.max(0.0008, stepAmp), t0);
        gain1.gain.exponentialRampToValueAtTime(0.0005, t0 + decayDur);
        osc1.connect(gain1);
        gain1.connect(targetOut);
        osc1.start(t0);
        osc1.stop(t0 + decayDur + 0.006);

        // Mode 2: Inharmonic numismatic overtone mode
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(fSecondary, t0);
        gain2.gain.setValueAtTime(Math.max(0.0006, stepAmp * 0.54), t0);
        gain2.gain.exponentialRampToValueAtTime(0.0004, t0 + decayDur * 0.78);
        osc2.connect(gain2);
        gain2.connect(targetOut);
        osc2.start(t0);
        osc2.stop(t0 + decayDur * 0.78 + 0.006);

        // Final crisp metallic settle click + brushed brass deck resonance when coin locks flat (k = 6)
        if (isFinalSettle) {
          const clickFrames = Math.max(16, Math.floor(this.ctx.sampleRate * 0.0038));
          const clickBuf = this.ctx.createBuffer(1, clickFrames, this.ctx.sampleRate);
          const cData = clickBuf.getChannelData(0);
          for (let i = 0; i < clickFrames; i++) {
            cData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickFrames * 0.28));
          }
          const clickSrc = this.ctx.createBufferSource();
          clickSrc.buffer = clickBuf;

          const clickHp = this.ctx.createBiquadFilter();
          clickHp.type = 'bandpass';
          clickHp.frequency.setValueAtTime(4200, t0);
          clickHp.Q.setValueAtTime(2.1, t0);

          const clickGain = this.ctx.createGain();
          clickGain.gain.setValueAtTime(baseVol * 0.95, t0);
          clickGain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.0045);

          clickSrc.connect(clickHp);
          clickHp.connect(clickGain);
          clickGain.connect(targetOut);
          clickSrc.start(t0);
        }
      }
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  /**
   * Staggered Multi-Coin Metallic Avalanche Foley:
   * Triggered when 3+ coins tumble off the upper shelf cliff or front scoring lip together.
   * Schedules staggered metallic rim-clinks with stereo pan spread, polyphonic anti-clipping
   * headroom (safe up to 15+ coin avalanches), and warm brass tray cavity resonance.
   */
  playMultiCoinAvalanche(coinCount = 4, pan = 0) {
    this.avalanchePlayedCount = (this.avalanchePlayedCount || 0) + 1;
    this.recordTelemetry('avalanche');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      if (now - (this.lastAvalancheTime || 0) < 0.032) return;
      this.lastAvalancheTime = now;

      const clampedCount = Math.min(10, Math.max(3, Math.floor(Number(coinCount) || 4)));
      const centerPan = Math.max(-0.78, Math.min(0.78, Number(pan) || 0));
      const dest = this.sfxBus || this.masterGain || this.ctx.destination;

      // 1. Sympathetic Brass Tray & Iron Chute Cavity Resonance under the multi-coin cascade
      const trayOsc = this.ctx.createOscillator();
      const trayFilter = this.ctx.createBiquadFilter();
      const trayGain = this.ctx.createGain();
      const cascadeDuration = 0.16 + clampedCount * 0.034;

      trayOsc.type = 'triangle';
      trayOsc.frequency.setValueAtTime(235.0, now);
      trayOsc.frequency.exponentialRampToValueAtTime(142.0, now + cascadeDuration);

      trayFilter.type = 'bandpass';
      trayFilter.frequency.setValueAtTime(480.0, now);
      trayFilter.Q.setValueAtTime(3.2, now);

      const trayAmp = Math.min(0.18, 0.075 + clampedCount * 0.011);
      trayGain.gain.setValueAtTime(0.001, now);
      trayGain.gain.linearRampToValueAtTime(trayAmp, now + 0.025);
      trayGain.gain.exponentialRampToValueAtTime(0.0008, now + cascadeDuration + 0.06);

      trayOsc.connect(trayFilter);
      trayFilter.connect(trayGain);
      trayGain.connect(dest);
      if (this.reverbActive && this.reverbSend) {
        const revTap = this.ctx.createGain();
        revTap.gain.setValueAtTime(trayAmp * 0.35, now);
        trayGain.connect(revTap);
        revTap.connect(this.reverbSend);
      }
      trayOsc.start(now);
      trayOsc.stop(now + cascadeDuration + 0.07);

      // 2. Schedule staggered metallic rim-clinks with stereo pan spread & polyphonic headroom
      const samplePool = ['coin-clink-heavy', 'coin-clink-1', 'coin-clink-2', 'coin-clink-3', 'coin-chute-drop'];
      const polyScale = 1.0 / Math.sqrt(clampedCount * 0.72);

      for (let i = 0; i < clampedCount; i++) {
        const delaySec = i * 0.030 + (i % 2) * 0.007;
        const t0 = now + delaySec;
        const spreadOffset = (i % 2 === 0 ? 1 : -1) * (0.12 + (i / clampedCount) * 0.36);
        const coinPan = Math.max(-0.92, Math.min(0.92, centerPan + spreadOffset));
        const pitchStep = 1.0 + (i - (clampedCount - 1) * 0.5) * 0.045;

        const sampleKey = samplePool[i % samplePool.length];
        this.playSample(sampleKey, {
          delay: delaySec,
          rate: Math.max(0.76, Math.min(1.52, pitchStep)),
          gain: Math.min(0.28, 0.24 * polyScale),
          pan: coinPan,
          reverbSend: 0.26
        });

        let voiceOut = dest;
        if (typeof this.ctx.createStereoPanner === 'function') {
          try {
            const p = this.ctx.createStereoPanner();
            p.pan.setValueAtTime(coinPan, t0);
            p.connect(dest);
            voiceOut = p;
          } catch (panErr) {}
        }

        const f0 = (1360 + i * 95) * pitchStep;
        const voiceAmp = 0.135 * polyScale;
        [1.0, 2.14, 3.41].forEach((modeRatio, mIdx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = mIdx === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(Math.min(11500, f0 * modeRatio), t0);

          const mDur = 0.072 - mIdx * 0.016;
          gain.gain.setValueAtTime(Math.max(0.0007, voiceAmp / (mIdx * 0.85 + 1)), t0);
          gain.gain.exponentialRampToValueAtTime(0.0005, t0 + mDur);

          osc.connect(gain);
          gain.connect(voiceOut);
          osc.start(t0);
          osc.stop(t0 + mDur + 0.006);
        });
      }
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  /**
   * Coin Drop Carriage Release & Bullion Drop from top rail:
   * Synthesizes mechanical brass carriage release latch click + solenoid spring snap +
   * heavy bullion drop swoop.
   */
  playDropCoin(mass = 1.0) {
    this.recordTelemetry('coinDrop');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const safeMass = Math.max(0.4, Number(mass) || 1.0);
      this.playSample('coin-clink-heavy', {
        rate: Math.max(0.68, Math.min(1.38, 1.04 / Math.sqrt(safeMass))),
        gain: 0.32
      });

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.masterGain || this.ctx.destination;

      // 1. Mechanical Brass Carriage Release Latch Click
      const latchFrames = Math.max(16, Math.floor(this.ctx.sampleRate * 0.0045));
      const latchBuf = this.ctx.createBuffer(1, latchFrames, this.ctx.sampleRate);
      const lData = latchBuf.getChannelData(0);
      for (let i = 0; i < latchFrames; i++) {
        lData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (latchFrames * 0.28));
      }
      const latchSrc = this.ctx.createBufferSource();
      latchSrc.buffer = latchBuf;

      const latchBp = this.ctx.createBiquadFilter();
      latchBp.type = 'bandpass';
      latchBp.frequency.setValueAtTime(2950, now);
      latchBp.Q.setValueAtTime(3.2, now);

      const latchGain = this.ctx.createGain();
      latchGain.gain.setValueAtTime(0.16, now);
      latchGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.005);

      latchSrc.connect(latchBp);
      latchBp.connect(latchGain);
      latchGain.connect(dest);
      latchSrc.start(now);

      // 2. Bullion Drop Swoop & Rim Ring
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      const startFreq = 760 / Math.sqrt(safeMass);
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 1.48, now + 0.065);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.085);
    } catch (e) {}
  }

  /**
   * Escalating Pitch-Shifted Payout Chute Score:
   * Heavy bullion drop into velvet-lined tray thud + mechanical register bell tine +
   * escalating pitch-shifted harmonic triad.
   */
  playScoreCoin(comboStreak = 1, multiplier = 1) {
    this.recordTelemetry('scoreCoin');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const semitones = Math.min(26, (comboStreak - 1) * 1.4 + Math.log2(Math.max(1, multiplier)) * 2.2);
      const rootFreq = 523.25 * Math.pow(2, semitones / 12);
      const dest = this.sfxBus || this.masterGain || this.ctx.destination;

      this.playSample('coin-chute-drop', {
        rate: Math.min(1.65, Math.pow(2, (semitones * 0.35) / 12)),
        gain: 0.28
      });

      // 1. Heavy Bullion Velvet-Tray Thud (114Hz -> 46Hz damped wood/baize impact)
      const trayThud = this.ctx.createOscillator();
      const trayGain = this.ctx.createGain();
      trayThud.type = 'sine';
      trayThud.frequency.setValueAtTime(114, now);
      trayThud.frequency.exponentialRampToValueAtTime(46, now + 0.085);
      trayGain.gain.setValueAtTime(0.21, now);
      trayGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.095);
      trayThud.connect(trayGain);
      trayGain.connect(dest);
      trayThud.start(now);
      trayThud.stop(now + 0.1);

      // 2. Mechanical Register Chime Bell Tine (2.756x inharmonic partial)
      const bellTine = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bellTine.type = 'sine';
      bellTine.frequency.setValueAtTime(Math.min(10500, rootFreq * 2.756), now + 0.012);
      bellGain.gain.setValueAtTime(0.09, now + 0.012);
      bellGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.14);
      bellTine.connect(bellGain);
      bellGain.connect(dest);
      bellTine.start(now + 0.012);
      bellTine.stop(now + 0.15);

      // 3. Escalating Harmonic Triad
      [1, 1.5, 2.0].forEach((interval, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(rootFreq * interval, now + i * 0.02);

        const amp = i === 0 ? 0.22 : 0.11;
        gain.gain.setValueAtTime(amp, now + i * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28 + i * 0.045);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + i * 0.02);
        osc.stop(now + 0.34 + i * 0.045);
      });
    } catch (e) {}
  }

  /**
   * Moving Skill-Shot Gate (`BONUS GATE +$10 x2`) Emerald Bell Resonance:
   * Synthesizes a crystalline emerald tubular bell strike + mechanical gate spinner ratchet click.
   */
  playSkillGate(multiplier = 2) {
    this.recordTelemetry('skillGate');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.uiBus || this.masterGain || this.ctx.destination;
      const safeMult = Math.max(1, Math.min(8, Number(multiplier) || 2));
      const pitchShift = Math.pow(2, Math.min(12, (safeMult - 1) * 2) / 12);

      this.playSample('jackpot-bell', {
        rate: 1.18 * pitchShift,
        gain: 0.28,
        reverbSend: 0.38
      });

      // 1. Gate Spinner Ratchet Click
      const clickLen = Math.max(16, Math.floor(this.ctx.sampleRate * 0.005));
      const clickBuf = this.ctx.createBuffer(1, clickLen, this.ctx.sampleRate);
      const clickData = clickBuf.getChannelData(0);
      for (let i = 0; i < clickLen; i++) {
        clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickLen * 0.3));
      }
      const clickSrc = this.ctx.createBufferSource();
      clickSrc.buffer = clickBuf;
      const clickBp = this.ctx.createBiquadFilter();
      clickBp.type = 'bandpass';
      clickBp.frequency.setValueAtTime(3400, now);
      clickBp.Q.setValueAtTime(3.0, now);
      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.18, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.006);
      clickSrc.connect(clickBp);
      clickBp.connect(clickGain);
      clickGain.connect(dest);
      clickSrc.start(now);

      // 2. Emerald Tubular Bell Harmonic Arpeggio (G5 - D6 - G6 - B6 + 2.41x crystal partial)
      const bellNotes = [783.99, 1174.66, 1567.98, 1975.53];
      bellNotes.forEach((baseF, idx) => {
        const t0 = now + idx * 0.024;
        const freq = Math.min(10000, baseF * pitchShift);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t0);

        const dur = 0.32 + idx * 0.04;
        gain.gain.setValueAtTime(0.16 / Math.sqrt(idx + 1), t0);
        gain.gain.exponentialRampToValueAtTime(0.0007, t0 + dur);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t0);
        osc.stop(t0 + dur + 0.01);
      });
    } catch (e) {}
  }

  /**
   * Relic Trigger Chirp (Balatro Joker-style proc sound)
   */
  playRelicProc() {
    this.recordTelemetry('relicProc');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.075);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.uiBus || this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    } catch (e) {}
  }

  /**
   * Coin lost in Left/Right Furnace Gutter
   */
  playFurnaceBurn() {
    this.recordTelemetry('furnaceBurn');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.15);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(920, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxBus || this.ctx.destination);
      noise.start(now);
    } catch (e) {}
  }

  /**
   * Hellfire Blast / Blast Cap Detonation (Synergy #2):
   * Deep sub-bass concussion + filtered combustion roar + cast-iron shrapnel ring partials.
   */
  playExplosion() {
    this.recordTelemetry('synergy');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;

      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(26, now + 0.44);
      subGain.gain.setValueAtTime(0.4, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
      sub.connect(subGain);
      subGain.connect(dest);
      sub.start(now);
      sub.stop(now + 0.47);

      const bufferSize = Math.floor(this.ctx.sampleRate * 0.36);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1350, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 0.35);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.32, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(dest);
      noise.start(now);

      // Cast-iron shrapnel & coin scatter metallic ring partials
      [620, 1340, 2190, 3120].forEach((freq, idx) => {
        const shrapOsc = this.ctx.createOscillator();
        const shrapGain = this.ctx.createGain();
        const t0 = now + 0.012 + idx * 0.018;
        shrapOsc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        shrapOsc.frequency.setValueAtTime(freq, t0);
        shrapOsc.frequency.exponentialRampToValueAtTime(freq * 0.74, t0 + 0.16);
        shrapGain.gain.setValueAtTime(0.085 / (idx * 0.5 + 1), t0);
        shrapGain.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.17);
        shrapOsc.connect(shrapGain);
        shrapGain.connect(dest);
        shrapOsc.start(t0);
        shrapOsc.stop(t0 + 0.18);
      });
    } catch (e) {}
  }

  /**
   * Blood Leech Siphon (Synergy #3):
   * Wet organic vacuum slurp + resonant dual-bandpass siphon sweep + crimson chime.
   */
  playLeechEat() {
    this.recordTelemetry('synergy');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;

      const osc = this.ctx.createOscillator();
      const bp = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(195, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.16);

      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(340, now);
      bp.frequency.exponentialRampToValueAtTime(1480, now + 0.15);
      bp.Q.setValueAtTime(4.8, now);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(bp);
      bp.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.19);

      // Secondary wet siphon suction harmonic
      const subSiphon = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subSiphon.type = 'triangle';
      subSiphon.frequency.setValueAtTime(110, now + 0.02);
      subSiphon.frequency.exponentialRampToValueAtTime(310, now + 0.17);
      subGain.gain.setValueAtTime(0.14, now + 0.02);
      subGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
      subSiphon.connect(subGain);
      subGain.connect(dest);
      subSiphon.start(now + 0.02);
      subSiphon.stop(now + 0.19);
    } catch (e) {}
  }

  playMimicBite() {
    this.recordTelemetry('hazard');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;
      [380, 760].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + i * 0.042);
        gain.gain.setValueAtTime(0.14, now + i * 0.042);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.042 + 0.07);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + i * 0.042);
        osc.stop(now + i * 0.042 + 0.08);
      });
    } catch (e) {}
  }

  playGlassShatter() {
    this.recordTelemetry('hazard');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;
      [2200, 2850, 3500, 1920].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.016);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.68, now + idx * 0.016 + 0.12);
        gain.gain.setValueAtTime(0.15, now + idx * 0.016);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.016 + 0.14);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + idx * 0.016);
        osc.stop(now + idx * 0.016 + 0.15);
      });
    } catch (e) {}
  }

  /**
   * Heavy Physical Cabinet Slam Foley:
   * - Deep wooden cabinet sub-bass thump (58Hz -> 28Hz) + hardwood cavity resonance
   * - Spring-reverb metallic coil rattle
   * - Brief burst of 4 staggered micro-clinks simulating the coin pile shifting on the baize bed
   */
  playCabinetSlam() {
    this.recordTelemetry('slam');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.masterGain || this.ctx.destination;

      // 1. Deep Wooden Cabinet Sub-Bass Thump (58Hz -> 28Hz)
      const woodSubOsc = this.ctx.createOscillator();
      const woodSubGain = this.ctx.createGain();
      woodSubOsc.type = 'sine';
      woodSubOsc.frequency.setValueAtTime(58.0, now);
      woodSubOsc.frequency.exponentialRampToValueAtTime(28.0, now + 0.36);

      woodSubGain.gain.setValueAtTime(0.68, now);
      woodSubGain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
      woodSubOsc.connect(woodSubGain);
      woodSubGain.connect(dest);
      woodSubOsc.start(now);
      woodSubOsc.stop(now + 0.42);

      // 2. Hardwood & Cast-Iron Cabinet Cavity Resonance (116Hz -> 42Hz lowpass thud)
      const cavityOsc = this.ctx.createOscillator();
      const cavityFilter = this.ctx.createBiquadFilter();
      const cavityGain = this.ctx.createGain();
      cavityOsc.type = 'triangle';
      cavityOsc.frequency.setValueAtTime(116.0, now);
      cavityOsc.frequency.exponentialRampToValueAtTime(42.0, now + 0.24);
      cavityFilter.type = 'lowpass';
      cavityFilter.frequency.setValueAtTime(210.0, now);
      cavityFilter.Q.setValueAtTime(2.2, now);

      cavityGain.gain.setValueAtTime(0.46, now);
      cavityGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      cavityOsc.connect(cavityFilter);
      cavityFilter.connect(cavityGain);
      cavityGain.connect(dest);
      cavityOsc.start(now);
      cavityOsc.stop(now + 0.3);

      // 3. Wood & Iron Mechanical Frame Impact Crack
      const crackLen = Math.max(32, Math.floor(this.ctx.sampleRate * 0.075));
      const crackBuf = this.ctx.createBuffer(1, crackLen, this.ctx.sampleRate);
      const crackOut = crackBuf.getChannelData(0);
      for (let i = 0; i < crackLen; i++) {
        crackOut[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackLen * 0.24));
      }
      const crackSrc = this.ctx.createBufferSource();
      crackSrc.buffer = crackBuf;

      const crackFilter = this.ctx.createBiquadFilter();
      crackFilter.type = 'bandpass';
      crackFilter.frequency.setValueAtTime(185, now);
      crackFilter.Q.setValueAtTime(1.8, now);

      const crackGain = this.ctx.createGain();
      crackGain.gain.setValueAtTime(0.54, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(dest);
      crackSrc.start(now);

      // 4. Spring-Reverb Metallic Coil Rattle (cabinet tilt-bob & spring tank)
      const springLen = Math.max(64, Math.floor(this.ctx.sampleRate * 0.26));
      const springBuf = this.ctx.createBuffer(1, springLen, this.ctx.sampleRate);
      const springData = springBuf.getChannelData(0);
      for (let i = 0; i < springLen; i++) {
        const flutter = 0.55 + 0.45 * Math.sin(i * 0.085) * Math.cos(i * 0.023);
        springData[i] = (Math.random() * 2 - 1) * flutter * Math.exp(-i / (springLen * 0.38));
      }
      const springNoise = this.ctx.createBufferSource();
      springNoise.buffer = springBuf;

      const springBp = this.ctx.createBiquadFilter();
      springBp.type = 'bandpass';
      springBp.frequency.setValueAtTime(840, now);
      springBp.frequency.exponentialRampToValueAtTime(410, now + 0.24);
      springBp.Q.setValueAtTime(5.2, now);

      const springGain = this.ctx.createGain();
      springGain.gain.setValueAtTime(0.24, now + 0.006);
      springGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.26);

      springNoise.connect(springBp);
      springBp.connect(springGain);
      springGain.connect(dest);
      if (this.reverbActive && this.reverbSend) {
        const springRev = this.ctx.createGain();
        springRev.gain.setValueAtTime(0.45, now);
        springGain.connect(springRev);
        springRev.connect(this.reverbSend);
      }
      springNoise.start(now + 0.006);

      // Metallic coil resonant modes
      [318, 482, 714, 1160].forEach((freq, idx) => {
        const sOsc = this.ctx.createOscillator();
        const sGain = this.ctx.createGain();
        sOsc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        const tStart = now + 0.008 + idx * 0.007;
        sOsc.frequency.setValueAtTime(freq, tStart);
        sOsc.frequency.exponentialRampToValueAtTime(freq * 0.93, tStart + 0.21);
        sGain.gain.setValueAtTime(0.065 / (idx * 0.45 + 1), tStart);
        sGain.gain.exponentialRampToValueAtTime(0.0006, tStart + 0.22);
        sOsc.connect(sGain);
        sGain.connect(dest);
        sOsc.start(tStart);
        sOsc.stop(tStart + 0.23);
      });

      // 5. Brief Burst of 4 Staggered Micro-Clinks (simulating coin pile shifting on the baize bed)
      const microClinkConfigs = [
        { delay: 0.016, sample: 'coin-clink-heavy', rate: 0.88, f0: 1320, pan: -0.45, amp: 0.22 },
        { delay: 0.044, sample: 'coin-clink-1', rate: 1.06, f0: 1540, pan: 0.38, amp: 0.18 },
        { delay: 0.078, sample: 'coin-clink-2', rate: 1.14, f0: 1680, pan: -0.22, amp: 0.15 },
        { delay: 0.118, sample: 'coin-clink-3', rate: 0.96, f0: 1440, pan: 0.52, amp: 0.13 }
      ];

      microClinkConfigs.forEach((mc) => {
        const pitchJitter = 1.0 + (Math.random() * 0.10 - 0.05);
        this.playSample(mc.sample, {
          delay: mc.delay,
          rate: mc.rate * pitchJitter,
          gain: mc.amp,
          pan: mc.pan,
          reverbSend: 0.22
        });

        const t0 = now + mc.delay;
        let clinkOut = dest;
        if (typeof this.ctx.createStereoPanner === 'function') {
          try {
            const p = this.ctx.createStereoPanner();
            p.pan.setValueAtTime(mc.pan, t0);
            p.connect(dest);
            clinkOut = p;
          } catch (panErr) {}
        }

        const baseF = mc.f0 * pitchJitter;
        [1.0, 2.14, 3.41].forEach((modeRatio, mIdx) => {
          const mOsc = this.ctx.createOscillator();
          const mGain = this.ctx.createGain();
          mOsc.type = mIdx === 0 ? 'triangle' : 'sine';
          mOsc.frequency.setValueAtTime(Math.min(11000, baseF * modeRatio), t0);
          const mDur = 0.062 - mIdx * 0.014;
          mGain.gain.setValueAtTime((mc.amp * 0.38) / (mIdx + 1), t0);
          mGain.gain.exponentialRampToValueAtTime(0.0005, t0 + mDur);
          mOsc.connect(mGain);
          mGain.connect(clinkOut);
          mOsc.start(t0);
          mOsc.stop(t0 + mDur + 0.006);
        });
      });
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  /**
   * Guillotine Pillory Dread Foley:
   * High-velocity steel blade runner slide + metallic sever crunch +
   * heavy iron block chop impact + dissonant steel blade ring + Inquisitor dread chord.
   */
  playGuillotine() {
    this.recordTelemetry('guillotine');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.masterGain || this.ctx.destination;

      this.playSample('guillotine-shear', {
        rate: 0.98 + Math.random() * 0.05,
        gain: 0.62,
        reverbSend: 0.42
      });

      // 1. Metallic Runner Blade Slide Swoop
      const slideLen = Math.max(32, Math.floor(this.ctx.sampleRate * 0.095));
      const slideBuf = this.ctx.createBuffer(1, slideLen, this.ctx.sampleRate);
      const slideData = slideBuf.getChannelData(0);
      for (let i = 0; i < slideLen; i++) {
        slideData[i] = (Math.random() * 2 - 1) * Math.sin((i / slideLen) * Math.PI);
      }
      const slideSrc = this.ctx.createBufferSource();
      slideSrc.buffer = slideBuf;

      const slideFilter = this.ctx.createBiquadFilter();
      slideFilter.type = 'bandpass';
      slideFilter.frequency.setValueAtTime(2600, now);
      slideFilter.frequency.exponentialRampToValueAtTime(680, now + 0.09);
      slideFilter.Q.setValueAtTime(3.6, now);

      const slideGain = this.ctx.createGain();
      slideGain.gain.setValueAtTime(0.28, now);
      slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

      slideSrc.connect(slideFilter);
      slideFilter.connect(slideGain);
      slideGain.connect(dest);
      slideSrc.start(now);

      // 2. Heavy Iron Block Chop Impact & Metallic Sever Crunch
      const chopTime = now + 0.055;
      const chopSub = this.ctx.createOscillator();
      const chopSubGain = this.ctx.createGain();
      chopSub.type = 'sine';
      chopSub.frequency.setValueAtTime(86, chopTime);
      chopSub.frequency.exponentialRampToValueAtTime(24, chopTime + 0.28);
      chopSubGain.gain.setValueAtTime(0.58, chopTime);
      chopSubGain.gain.exponentialRampToValueAtTime(0.001, chopTime + 0.32);
      chopSub.connect(chopSubGain);
      chopSubGain.connect(dest);
      chopSub.start(chopTime);
      chopSub.stop(chopTime + 0.34);

      // Metallic Sever Crunch Burst (pillory iron shear + knuckle crunch transient)
      const crunchLen = Math.max(32, Math.floor(this.ctx.sampleRate * 0.065));
      const crunchBuf = this.ctx.createBuffer(1, crunchLen, this.ctx.sampleRate);
      const crunchData = crunchBuf.getChannelData(0);
      for (let i = 0; i < crunchLen; i++) {
        const jag = (i % 7 < 3) ? 1.0 : -0.6;
        crunchData[i] = ((Math.random() * 2 - 1) * 0.75 + jag * 0.25) * Math.exp(-i / (crunchLen * 0.28));
      }
      const crunchSrc = this.ctx.createBufferSource();
      crunchSrc.buffer = crunchBuf;
      const crunchBp = this.ctx.createBiquadFilter();
      crunchBp.type = 'bandpass';
      crunchBp.frequency.setValueAtTime(980, chopTime);
      crunchBp.frequency.exponentialRampToValueAtTime(320, chopTime + 0.06);
      crunchBp.Q.setValueAtTime(2.8, chopTime);
      const crunchGain = this.ctx.createGain();
      crunchGain.gain.setValueAtTime(0.42, chopTime);
      crunchGain.gain.exponentialRampToValueAtTime(0.0008, chopTime + 0.065);
      crunchSrc.connect(crunchBp);
      crunchBp.connect(crunchGain);
      crunchGain.connect(dest);
      crunchSrc.start(chopTime);

      [540, 1185, 1910, 2780].forEach((freq, idx) => {
        const ringOsc = this.ctx.createOscillator();
        const ringGain = this.ctx.createGain();
        ringOsc.type = idx === 0 ? 'triangle' : 'sine';
        ringOsc.frequency.setValueAtTime(freq, chopTime);
        ringOsc.frequency.exponentialRampToValueAtTime(freq * 0.97, chopTime + 0.36);
        ringGain.gain.setValueAtTime(0.14 / (idx * 0.65 + 1), chopTime);
        ringGain.gain.exponentialRampToValueAtTime(0.0007, chopTime + 0.38 - idx * 0.05);
        ringOsc.connect(ringGain);
        ringGain.connect(dest);
        ringOsc.start(chopTime);
        ringOsc.stop(chopTime + 0.4);
      });

      this.playCollectorPunish();
    } catch (e) {}
  }

  /**
   * 3-of-a-Kind Ascended Alchemical Mythic Fusion Foley:
   * Resonant alchemical harmonic chord + Ascended Choir dual-formant vocal shimmer +
   * high-voltage electric arc crackle + sub-transmutation pulse.
   */
  playFusion(tier = 1) {
    this.recordTelemetry('fusion');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.masterGain || this.ctx.destination;
      const safeTier = Math.max(1, Math.min(6, Number(tier) || 1));
      const tierPitch = Math.pow(2, (safeTier - 1) * 1.5 / 12);

      // Layer heavy bullion strike + harmonic bell
      this.playSample('coin-clink-heavy', {
        rate: 0.86 * tierPitch,
        gain: 0.36,
        reverbSend: 0.42
      });
      this.playSample('jackpot-bell', {
        delay: 0.035,
        rate: 0.92 * tierPitch,
        gain: 0.24,
        reverbSend: 0.48
      });

      // 1. Sub-Transmutation Implosion Pulse (118Hz -> 44Hz -> 73.42Hz)
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(118.0, now);
      subOsc.frequency.exponentialRampToValueAtTime(44.0, now + 0.14);
      subOsc.frequency.exponentialRampToValueAtTime(73.42 * tierPitch, now + 0.42);
      subGain.gain.setValueAtTime(0.34, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
      subOsc.connect(subGain);
      subGain.connect(dest);
      subOsc.start(now);
      subOsc.stop(now + 0.48);

      // 2. Resonant Alchemical Chord (D Lydian-Mystic Harmonic Voicing) + Ascended Choir Formants
      const chordBusFilter = this.ctx.createBiquadFilter();
      chordBusFilter.type = 'lowpass';
      chordBusFilter.frequency.setValueAtTime(480, now);
      chordBusFilter.frequency.exponentialRampToValueAtTime(3400, now + 0.18);
      chordBusFilter.frequency.exponentialRampToValueAtTime(1250, now + 0.58);
      chordBusFilter.Q.setValueAtTime(2.4, now);
      chordBusFilter.connect(dest);

      // Dual Choir Vocal Formant Resonators ("AH-OH" Ascended Choir)
      const choirF1 = this.ctx.createBiquadFilter();
      choirF1.type = 'bandpass';
      choirF1.frequency.setValueAtTime(730, now);
      choirF1.Q.setValueAtTime(4.5, now);
      const choirF2 = this.ctx.createBiquadFilter();
      choirF2.type = 'bandpass';
      choirF2.frequency.setValueAtTime(1090, now);
      choirF2.Q.setValueAtTime(5.2, now);
      const choirGain = this.ctx.createGain();
      choirGain.gain.setValueAtTime(0.38, now);
      choirF1.connect(choirGain);
      choirF2.connect(choirGain);
      choirGain.connect(dest);

      if (this.reverbActive && this.reverbSend) {
        const chordRev = this.ctx.createGain();
        chordRev.gain.setValueAtTime(0.48, now);
        chordBusFilter.connect(chordRev);
        choirGain.connect(chordRev);
        chordRev.connect(this.reverbSend);
      }

      const chordFreqs = [293.66, 369.99, 440.0, 587.33, 659.25, 880.0];
      chordFreqs.forEach((baseF, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const tStart = now + idx * 0.018;
        const dur = 0.48 + idx * 0.035;
        osc.type = idx < 3 ? 'sawtooth' : 'triangle';
        const freq = baseF * tierPitch;
        osc.frequency.setValueAtTime(freq * 0.992, tStart);
        osc.frequency.exponentialRampToValueAtTime(freq, tStart + 0.05);

        const voiceAmp = idx === 0 ? 0.14 : 0.11 / Math.sqrt(idx + 1);
        gain.gain.setValueAtTime(0.001, tStart);
        gain.gain.linearRampToValueAtTime(voiceAmp, tStart + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0008, tStart + dur);

        osc.connect(gain);
        gain.connect(chordBusFilter);
        gain.connect(choirF1);
        gain.connect(choirF2);
        osc.start(tStart);
        osc.stop(tStart + dur + 0.015);
      });

      // 3. Electric Arc Crackle (sparse high-voltage plasma impulse discharge + FM zap chirps)
      const arcLen = Math.max(64, Math.floor(this.ctx.sampleRate * 0.22));
      const arcBuf = this.ctx.createBuffer(1, arcLen, this.ctx.sampleRate);
      const arcData = arcBuf.getChannelData(0);
      for (let i = 0; i < arcLen; i++) {
        const sparkGate = Math.random() > 0.82 ? 1.0 : 0.08;
        arcData[i] = (Math.random() * 2 - 1) * sparkGate * Math.exp(-i / (arcLen * 0.55));
      }
      const arcNoise = this.ctx.createBufferSource();
      arcNoise.buffer = arcBuf;

      const arcFilter = this.ctx.createBiquadFilter();
      arcFilter.type = 'bandpass';
      arcFilter.frequency.setValueAtTime(1650, now);
      arcFilter.frequency.exponentialRampToValueAtTime(4400, now + 0.09);
      arcFilter.frequency.exponentialRampToValueAtTime(1950, now + 0.22);
      arcFilter.Q.setValueAtTime(3.8, now);

      const arcGain = this.ctx.createGain();
      arcGain.gain.setValueAtTime(0.24, now);
      arcGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);

      arcNoise.connect(arcFilter);
      arcFilter.connect(arcGain);
      arcGain.connect(dest);
      arcNoise.start(now);

      // Staggered plasma arc micro-zaps
      [
        { offset: 0.005, fStart: 2150, fEnd: 640, dur: 0.055 },
        { offset: 0.048, fStart: 2840, fEnd: 920, dur: 0.048 },
        { offset: 0.105, fStart: 1860, fEnd: 520, dur: 0.062 }
      ].forEach((zap) => {
        const zOsc = this.ctx.createOscillator();
        const zGain = this.ctx.createGain();
        const tZ = now + zap.offset;
        zOsc.type = 'sawtooth';
        zOsc.frequency.setValueAtTime(zap.fStart * tierPitch, tZ);
        zOsc.frequency.exponentialRampToValueAtTime(zap.fEnd * tierPitch, tZ + zap.dur);
        zGain.gain.setValueAtTime(0.085, tZ);
        zGain.gain.exponentialRampToValueAtTime(0.0007, tZ + zap.dur);
        zOsc.connect(zGain);
        zGain.connect(dest);
        zOsc.start(tZ);
        zOsc.stop(tZ + zap.dur + 0.008);
      });
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  /**
   * Tilt / Guillotine Dread Heartbeat Foley ("Lub-Dub" double cardiac pulse):
   * Scales rate, sub-bass weight, and cabinet sympathetic tension with `tiltRatio` (0..1).
   */
  playHeartbeat(tiltRatio = 0.5) {
    this.recordTelemetry('heartbeat');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const safeTilt = Math.max(0.05, Math.min(1.0, Number(tiltRatio) || 0.5));
      const minInterval = 0.82 - safeTilt * 0.46; // 0.82s at low tilt down to 0.36s at critical tilt
      if (now - this.lastHeartbeatTime < minInterval) return;
      this.lastHeartbeatTime = now;

      const dest = this.sfxBus || this.ambienceBus || this.masterGain || this.ctx.destination;
      const baseVol = 0.18 + safeTilt * 0.32;
      const pitchShift = 1.0 + safeTilt * 0.18;

      // Helper for Lub (t=0) and Dub (t=+0.145s) cardiac pulses
      const triggerPulse = (offsetSec, startFreq, endFreq, durSec, ampScale) => {
        const t0 = now + offsetSec;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq * pitchShift, t0);
        osc.frequency.exponentialRampToValueAtTime(endFreq * pitchShift, t0 + durSec);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(145 + safeTilt * 90, t0);
        filter.Q.setValueAtTime(2.4, t0);

        const peakAmp = Math.max(0.002, baseVol * ampScale);
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(peakAmp, t0 + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0008, t0 + durSec);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        osc.start(t0);
        osc.stop(t0 + durSec + 0.01);
      };

      // "LUB" (deep ventricular thump)
      triggerPulse(0, 64.0, 29.0, 0.14, 1.0);
      // "DUB" (tighter aortic valve snap)
      triggerPulse(0.14 - safeTilt * 0.025, 78.0, 34.0, 0.115, 0.78);
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  playCollectorPunish() {
    this.recordTelemetry('collector');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;
      [90, 96, 135].forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 0.8, now + 0.68);

        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.74);
      });
    } catch (e) {}
  }

  /**
   * 19th-Century Animatronic Collector Mandible Jaw-Chatter & Brass-Horn Vocal Formant Foley:
   * - Throttled so it plays at most once every 350ms (`this._lastChatterTime`) to prevent overlapping audio spam.
   * - Schedules `Math.min(6, Math.max(2, syllables))` mechanical jaw-clack & brass-throat formant pulses
   *   (`k = 0..syllables-1`, spaced by `0.068s`):
   *   1. Brass Mandible Click: short high-Q bandpass impulse at 1,380 Hz (Q = 5.5) simulating brass teeth clicking together.
   *   2. Occult Automaton Throat Formant: low sawtooth/triangle oscillator (`92 Hz -> 68 Hz` for `'taunt'`/`'rage'`,
   *      or `128 Hz -> 164 Hz` for `'laugh'`) routed through a dual-formant vocal filter (`f1 = 420 Hz`, `f2 = 1,150 Hz`)
   *      at subtle, atmospheric gain (`0.11`).
   */
  playCollectorChatter(syllables = 4, mood = 'taunt') {
    this.recordTelemetry('collectorVoice');
    const nowMs =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    if (this._lastChatterTime > 0 && nowMs - this._lastChatterTime < 350) return;
    this._lastChatterTime = nowMs;
    this.collectorChatterPlayedCount = (this.collectorChatterPlayedCount || 0) + 1;

    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const pulseCount = Math.min(6, Math.max(2, Math.floor(Number(syllables) || 4)));
      const normalizedMood = String(mood || 'taunt').toLowerCase();
      const isLaugh = normalizedMood === 'laugh';
      const isRage = normalizedMood === 'rage';
      const dest = this.sfxBus || this.masterGain || this.ctx.destination;

      for (let k = 0; k < pulseCount; k++) {
        const t0 = now + k * 0.068;
        const syllableAccent = k === 0 || k === pulseCount - 1 ? 1.0 : 0.88;
        const pitchMicroVar = 1.0 + ((k % 2 === 0 ? 1 : -1) * 0.025);

        // 1. Brass Mandible Click: short high-Q bandpass impulse at 1,380 Hz (Q = 5.5)
        const clickLen = Math.max(24, Math.floor(this.ctx.sampleRate * 0.014));
        const clickBuf = this.ctx.createBuffer(1, clickLen, this.ctx.sampleRate);
        const clickData = clickBuf.getChannelData(0);
        for (let i = 0; i < clickLen; i++) {
          clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickLen * 0.26));
        }
        const clickSrc = this.ctx.createBufferSource();
        clickSrc.buffer = clickBuf;

        const mandibleBp = this.ctx.createBiquadFilter();
        mandibleBp.type = 'bandpass';
        mandibleBp.frequency.setValueAtTime(1380 * pitchMicroVar, t0);
        mandibleBp.Q.setValueAtTime(5.5, t0);

        const clickGain = this.ctx.createGain();
        clickGain.gain.setValueAtTime(0.095 * syllableAccent, t0);
        clickGain.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.016);

        clickSrc.connect(mandibleBp);
        mandibleBp.connect(clickGain);
        clickGain.connect(dest);
        clickSrc.start(t0);

        // Crisp brass teeth clack transient partial at 1,380 Hz -> 1,090 Hz
        const toothOsc = this.ctx.createOscillator();
        const toothGain = this.ctx.createGain();
        toothOsc.type = 'triangle';
        toothOsc.frequency.setValueAtTime(1380 * pitchMicroVar, t0);
        toothOsc.frequency.exponentialRampToValueAtTime(1090 * pitchMicroVar, t0 + 0.018);
        toothGain.gain.setValueAtTime(0.068 * syllableAccent, t0);
        toothGain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.02);
        toothOsc.connect(toothGain);
        toothGain.connect(dest);
        toothOsc.start(t0);
        toothOsc.stop(t0 + 0.024);

        // 2. Occult Automaton Throat Formant:
        // Low sawtooth/triangle oscillator (92 Hz -> 68 Hz for 'taunt'/'rage', or 128 Hz -> 164 Hz for 'laugh')
        // routed through a dual-formant vocal filter (f1 = 420 Hz, f2 = 1,150 Hz) at atmospheric gain (0.11).
        const throatOscSaw = this.ctx.createOscillator();
        const throatOscTri = this.ctx.createOscillator();
        throatOscSaw.type = 'sawtooth';
        throatOscTri.type = 'triangle';

        const fStart = (isLaugh ? 128 : 92) * pitchMicroVar;
        const fEnd = (isLaugh ? 164 : 68) * pitchMicroVar;
        const pulseDur = 0.058;

        throatOscSaw.frequency.setValueAtTime(fStart, t0);
        throatOscSaw.frequency.exponentialRampToValueAtTime(fEnd, t0 + pulseDur);
        throatOscTri.frequency.setValueAtTime(fStart, t0);
        throatOscTri.frequency.exponentialRampToValueAtTime(fEnd, t0 + pulseDur);

        const sawMix = this.ctx.createGain();
        const triMix = this.ctx.createGain();
        sawMix.gain.setValueAtTime(isRage ? 0.72 : 0.58, t0);
        triMix.gain.setValueAtTime(isRage ? 0.38 : 0.52, t0);

        // Dual-formant vocal filter (f1 = 420 Hz, f2 = 1,150 Hz)
        const formantF1 = this.ctx.createBiquadFilter();
        formantF1.type = 'bandpass';
        formantF1.frequency.setValueAtTime(420, t0);
        formantF1.Q.setValueAtTime(4.2, t0);

        const formantF2 = this.ctx.createBiquadFilter();
        formantF2.type = 'bandpass';
        formantF2.frequency.setValueAtTime(1150, t0);
        formantF2.Q.setValueAtTime(5.0, t0);

        const throatGain = this.ctx.createGain();
        const peakGain = 0.11 * syllableAccent;
        throatGain.gain.setValueAtTime(0.001, t0);
        throatGain.gain.linearRampToValueAtTime(peakGain, t0 + 0.008);
        throatGain.gain.exponentialRampToValueAtTime(0.0007, t0 + pulseDur);

        throatOscSaw.connect(sawMix);
        throatOscTri.connect(triMix);
        sawMix.connect(formantF1);
        sawMix.connect(formantF2);
        triMix.connect(formantF1);
        triMix.connect(formantF2);
        formantF1.connect(throatGain);
        formantF2.connect(throatGain);
        throatGain.connect(dest);

        if (this.reverbActive && this.reverbSend && k === pulseCount - 1) {
          const revTap = this.ctx.createGain();
          revTap.gain.setValueAtTime(peakGain * 0.34, t0);
          throatGain.connect(revTap);
          revTap.connect(this.reverbSend);
        }

        throatOscSaw.start(t0);
        throatOscTri.start(t0);
        throatOscSaw.stop(t0 + pulseDur + 0.006);
        throatOscTri.stop(t0 + pulseDur + 0.006);
      }
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  /**
   * 19th-Century Animatronic Collector 3-Finger Skeletal Brass Talon Drum-Roll Foley:
   * Synthesizes a subtle, sinister 3-finger skeletal brass talon drum-roll (`tOffsets = [0.0, 0.042, 0.084]`)
   * tapping impatiently against the cabinet's brass rail (`1,850 Hz -> 2,420 Hz` metallic ping).
   */
  playCollectorFingerTap(pan = 0) {
    this.recordTelemetry('collectorFingerTap');
    this.collectorFingerTapPlayedCount = (this.collectorFingerTapPlayedCount || 0) + 1;
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      if (now - (this._lastFingerTapTime || 0) < 0.035) return;
      this._lastFingerTapTime = now;

      const stereoPan = Math.max(-0.88, Math.min(0.88, Number(pan) || 0));
      const dest = this.sfxBus || this.masterGain || this.ctx.destination;
      const tOffsets = [0.0, 0.042, 0.084];

      for (let i = 0; i < tOffsets.length; i++) {
        const t0 = now + tOffsets[i];
        const progress = i / (tOffsets.length - 1);
        const startFreq = 1850 + (2420 - 1850) * progress;
        const endFreq = Math.min(2420, startFreq * 1.12);
        const tapAmp = 0.072 * (0.85 + progress * 0.25);

        let voiceOut = dest;
        if (typeof this.ctx.createStereoPanner === 'function') {
          try {
            const panner = this.ctx.createStereoPanner();
            const fingerPan = Math.max(-0.92, Math.min(0.92, stereoPan + (i - 1) * 0.08));
            panner.pan.setValueAtTime(fingerPan, t0);
            panner.connect(dest);
            voiceOut = panner;
          } catch (panErr) {}
        }

        // 1. Skeletal Brass Talon Metallic Rail Ping (1,850 Hz -> 2,420 Hz)
        const pingOsc = this.ctx.createOscillator();
        const pingFilter = this.ctx.createBiquadFilter();
        const pingGain = this.ctx.createGain();

        pingOsc.type = 'triangle';
        pingOsc.frequency.setValueAtTime(startFreq, t0);
        pingOsc.frequency.exponentialRampToValueAtTime(endFreq, t0 + 0.032);

        pingFilter.type = 'bandpass';
        pingFilter.frequency.setValueAtTime(startFreq, t0);
        pingFilter.Q.setValueAtTime(6.0, t0);

        pingGain.gain.setValueAtTime(tapAmp, t0);
        pingGain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.038);

        pingOsc.connect(pingFilter);
        pingFilter.connect(pingGain);
        pingGain.connect(voiceOut);
        pingOsc.start(t0);
        pingOsc.stop(t0 + 0.044);

        // 2. Crisp Brass Rail Contact Click + Harmonic Over-Ring
        const overtoneOsc = this.ctx.createOscillator();
        const overtoneGain = this.ctx.createGain();
        overtoneOsc.type = 'sine';
        overtoneOsc.frequency.setValueAtTime(startFreq * 1.58, t0);
        overtoneGain.gain.setValueAtTime(tapAmp * 0.42, t0);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.022);
        overtoneOsc.connect(overtoneGain);
        overtoneGain.connect(voiceOut);
        overtoneOsc.start(t0);
        overtoneOsc.stop(t0 + 0.026);
      }
    } catch (e) {
      // Safe fallback in headless environments
    }
  }

  playPistonPush() {
    this.recordTelemetry('piston');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(66, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.11);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.sfxBus || this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {}
  }

  playBuyItem() {
    this.recordTelemetry('ui');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.uiBus || this.ctx.destination;
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.045);
        gain.gain.setValueAtTime(0.16, now + i * 0.045);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.14);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + i * 0.045);
        osc.stop(now + i * 0.045 + 0.15);
      });
    } catch (e) {}
  }

  playQuotaCleared() {
    this.recordTelemetry('jackpot');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      this.playSample('jackpot-bell', { rate: 1.0, gain: 0.42, bus: 'ui', reverbSend: 0.35 });

      const now = this.ctx.currentTime;
      const dest = this.uiBus || this.ctx.destination;
      [440, 554.37, 659.25, 880, 1108.73].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = i < 3 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.072);
        gain.gain.setValueAtTime(0.2, now + i * 0.072);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.072 + 0.38);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + i * 0.072);
        osc.stop(now + i * 0.072 + 0.4);
      });
    } catch (e) {}
  }

  /**
   * Front Payout Chute Jackpot / Big Payout Fanfare:
   * Heavy bullion cascade into velvet tray + multi-chime mechanical register bell fanfare.
   */
  playJackpot(tier = 1) {
    this.recordTelemetry('jackpot');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const safeTier = Math.max(1, Math.min(5, Number(tier) || 1));
      const pitchMul = Math.pow(2, (safeTier - 1) / 12);
      this.playSample('jackpot-bell', { rate: 1.0 * pitchMul, gain: 0.45, bus: 'ui', reverbSend: 0.4 });
      this.playSample('coin-clink-heavy', { delay: 0.04, rate: 0.92 * pitchMul, gain: 0.36, reverbSend: 0.3 });

      const now = this.ctx.currentTime;
      const dest = this.uiBus || this.sfxBus || this.ctx.destination;

      // Velvet tray bullion thud
      const traySub = this.ctx.createOscillator();
      const trayGain = this.ctx.createGain();
      traySub.type = 'sine';
      traySub.frequency.setValueAtTime(118, now);
      traySub.frequency.exponentialRampToValueAtTime(42, now + 0.14);
      trayGain.gain.setValueAtTime(0.32, now);
      trayGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      traySub.connect(trayGain);
      trayGain.connect(dest);
      traySub.start(now);
      traySub.stop(now + 0.17);

      // Register chime arpeggio
      [587.33, 739.99, 880.0, 1174.66, 1479.98].forEach((freq, idx) => {
        const t0 = now + idx * 0.055;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq * pitchMul, t0);
        gain.gain.setValueAtTime(0.18 / (idx * 0.25 + 1), t0);
        gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.34);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t0);
        osc.stop(t0 + 0.36);
      });
    } catch (e) {}
  }

  /**
   * Cabinet Tilt Bob Warning Klaxon & Metallic Pendulum Contact Buzz
   */
  playTiltWarning(tiltRatio = 0.75) {
    this.recordTelemetry('tiltWarning');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.uiBus || this.ctx.destination;
      const ratio = Math.max(0.2, Math.min(1.0, Number(tiltRatio) || 0.75));

      // Brass tilt-bob plumb ring contact buzz + warning horn
      [220, 311.13, 440].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t0 = now + idx * 0.032;
        osc.type = idx === 2 ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(freq * (0.95 + ratio * 0.12), t0);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.86, t0 + 0.22);
        gain.gain.setValueAtTime(0.16 * ratio, t0);
        gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.24);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t0);
        osc.stop(t0 + 0.25);
      });
    } catch (e) {}
  }

  playTiltAlarm() {
    this.playTiltWarning(1.0);
    this.playCollectorPunish();
  }

  playFingerSever() {
    this.playGuillotine();
  }

  playGameOver() {
    this.recordTelemetry('gameOver');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.uiBus || this.ctx.destination;
      [196, 185, 164.81, 130.81].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.18);
        gain.gain.setValueAtTime(0.18, now + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.32);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.34);
      });
    } catch (e) {}
  }

  /**
   * Voltaic Arc Zap (Synergy #1):
   * High-voltage Jacob's ladder arc snap + 120Hz transformer hum + multi-arc plasma chirps.
   */
  playElectricZap() {
    this.recordTelemetry('synergy');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;

      // 120Hz transformer buzz
      const humOsc = this.ctx.createOscillator();
      const humGain = this.ctx.createGain();
      humOsc.type = 'sawtooth';
      humOsc.frequency.setValueAtTime(120, now);
      humGain.gain.setValueAtTime(0.14, now);
      humGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      humOsc.connect(humGain);
      humGain.connect(dest);
      humOsc.start(now);
      humOsc.stop(now + 0.16);

      // Multi-arc plasma chirps
      [1180, 1740, 920, 2480].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.022);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.42, now + i * 0.022 + 0.08);
        gain.gain.setValueAtTime(0.14, now + i * 0.022);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.022 + 0.09);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + i * 0.022);
        osc.stop(now + i * 0.022 + 0.095);
      });
    } catch (e) {}
  }

  /**
   * Void Gravity Singularity (Synergy #5):
   * Sub-gravitational horizon dive + inverted Doppler whistle + dark matter implosion thump.
   */
  playVortexImplode() {
    this.recordTelemetry('synergy');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(75, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.22);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.42);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.45);

      // Event-horizon Doppler harmonic shimmer
      const dopplerOsc = this.ctx.createOscillator();
      const dopplerGain = this.ctx.createGain();
      dopplerOsc.type = 'triangle';
      dopplerOsc.frequency.setValueAtTime(920, now);
      dopplerOsc.frequency.exponentialRampToValueAtTime(180, now + 0.38);
      dopplerGain.gain.setValueAtTime(0.11, now);
      dopplerGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.4);
      dopplerOsc.connect(dopplerGain);
      dopplerGain.connect(dest);
      dopplerOsc.start(now);
      dopplerOsc.stop(now + 0.42);
    } catch (e) {}
  }

  /**
   * Soul Magnet Hum (Synergy #4):
   * Lodestone electromagnetic flux hum + metallic coin-pull harmonic attraction sweep.
   */
  playSoulMagnet() {
    this.recordTelemetry('synergy');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;

      [110, 165, 220, 330].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq * 0.92, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + 0.24);
        gain.gain.setValueAtTime(0.12 / (idx * 0.4 + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.26);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.28);
      });
    } catch (e) {}
  }

  /**
   * Plague Spore Hiss (Synergy #6):
   * Pressurized toxic spore aerosol hiss + bubbling organic resonant filter.
   */
  playPlagueSpore() {
    this.recordTelemetry('synergy');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;

      const hissLen = Math.max(64, Math.floor(this.ctx.sampleRate * 0.24));
      const hissBuf = this.ctx.createBuffer(1, hissLen, this.ctx.sampleRate);
      const hissData = hissBuf.getChannelData(0);
      for (let i = 0; i < hissLen; i++) {
        hissData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (hissLen * 0.45));
      }
      const hissSrc = this.ctx.createBufferSource();
      hissSrc.buffer = hissBuf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2800, now);
      bp.frequency.exponentialRampToValueAtTime(940, now + 0.22);
      bp.Q.setValueAtTime(3.6, now);

      const hissGain = this.ctx.createGain();
      hissGain.gain.setValueAtTime(0.2, now);
      hissGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);

      hissSrc.connect(bp);
      bp.connect(hissGain);
      hissGain.connect(dest);
      hissSrc.start(now);
    } catch (e) {}
  }

  /**
   * Midas Touch Gilded Chime (Synergy #7):
   * Crystalline 24k gold transmutation shimmer + high bullion harmonic ring.
   */
  playMidasTouch() {
    this.recordTelemetry('synergy');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;

      [1174.66, 1479.98, 1760.0, 2349.32, 2959.96].forEach((freq, idx) => {
        const t0 = now + idx * 0.024;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0.14 / (idx * 0.35 + 1), t0);
        gain.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.28);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t0);
        osc.stop(t0 + 0.3);
      });
    } catch (e) {}
  }

  /**
   * Boss Quota #3 ("THE IRON INQUISITOR") Industrial Organ & Brass Dread Drone:
   * Deep cathedral reed pipe organ fifths + cast-iron furnace brass growl.
   */
  playBossDrone(intensity = 1.0) {
    this.recordTelemetry('bossDrone');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.ambienceBus || this.sfxBus || this.ctx.destination;
      const scale = Math.max(0.25, Math.min(1.5, Number(intensity) || 1.0));

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(420 * scale, now);
      lp.frequency.exponentialRampToValueAtTime(180, now + 0.92);
      lp.Q.setValueAtTime(3.2, now);
      lp.connect(dest);

      // D1 - A1 - D2 - Eb2 Phrygian Inquisitor Brass/Organ Voicing
      [36.71, 55.0, 73.42, 77.78, 110.0].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.985, now + 0.9);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime((0.15 * scale) / (idx * 0.4 + 1), now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.95);
        osc.connect(gain);
        gain.connect(lp);
        osc.start(now);
        osc.stop(now + 0.98);
      });
    } catch (e) {}
  }

  playDiceRoll() {
    this.recordTelemetry('dice');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;
      [820, 1080, 1340].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.03);
        gain.gain.setValueAtTime(0.11, now + i * 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.06);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + i * 0.03);
        osc.stop(now + i * 0.03 + 0.065);
      });
    } catch (e) {}
  }

  /**
   * Mechanical Capstan Bumper Kick + Brass Bell Ring
   */
  playBumperHit(combo = 1) {
    this.recordTelemetry('bumper');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;
      const dorianSemitones = [0, 2, 3, 5, 7, 9, 10, 12];
      const idx = Math.max(0, Math.floor((Number(combo) || 1) - 1)) % dorianSemitones.length;
      const bellFreq = 880.0 * Math.pow(2, dorianSemitones[idx] / 12);

      // Solenoid coil kick thud
      const kickOsc = this.ctx.createOscillator();
      const kickGain = this.ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(148, now);
      kickOsc.frequency.exponentialRampToValueAtTime(46, now + 0.075);
      kickGain.gain.setValueAtTime(0.22, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      kickOsc.connect(kickGain);
      kickGain.connect(dest);
      kickOsc.start(now);
      kickOsc.stop(now + 0.09);

      // Brass capstan bell ring
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bellFreq, now);
      osc.frequency.exponentialRampToValueAtTime(bellFreq * 1.42, now + 0.11);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {}
  }

  /**
   * Right-Click Coin Flick Snap Foley:
   * Crisp fingernail-on-brass-rim snap impulse + coin spin ring ping + low-mid kinetic impulse.
   */
  playFingerFlick() {
    this.recordTelemetry('flick');
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const dest = this.sfxBus || this.ctx.destination;

      // 1. Kinetic finger snap impulse (480Hz -> 190Hz)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.09);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.11);

      // 2. Fingernail-on-coin-rim metallic snap & spin ping
      const pingOsc = this.ctx.createOscillator();
      const pingGain = this.ctx.createGain();
      pingOsc.type = 'sine';
      pingOsc.frequency.setValueAtTime(2180, now);
      pingOsc.frequency.exponentialRampToValueAtTime(1640, now + 0.065);
      pingGain.gain.setValueAtTime(0.14, now);
      pingGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.07);
      pingOsc.connect(pingGain);
      pingGain.connect(dest);
      pingOsc.start(now);
      pingOsc.stop(now + 0.075);
    } catch (e) {}
  }

  // --- E2E Convenience Alias Methods (Safe & Telemetry-Tracked) ---

  playClink(intensity = 1.0, pan = 0) {
    this.playCoinClink(intensity, pan);
  }

  playCoinSettle(pan = 0, radiusNorm = 1.0) {
    this.playCoinWobbleSettle(pan, radiusNorm);
  }

  playAvalanche(coinCount = 3) {
    this.playMultiCoinAvalanche(coinCount);
  }

  playScore(combo = 1) {
    this.playScoreCoin(combo);
  }

  playBonusGate(multiplier = 2) {
    this.playSkillGate(multiplier);
  }

  playFlick() {
    this.playFingerFlick();
  }

  playSlam() {
    this.playCabinetSlam();
  }

  playBurnCoin() {
    this.playFurnaceBurn();
  }

  playVoltaicArc() {
    this.playElectricZap();
  }

  playHellfireBlast() {
    this.playExplosion();
  }

  playBloodLeech() {
    this.playLeechEat();
  }

  playMagnetPull() {
    this.playSoulMagnet();
  }

  playVoidGravity() {
    this.playVortexImplode();
  }

  playSporeCloud() {
    this.playPlagueSpore();
  }

  playGildedChime() {
    this.playMidasTouch();
  }

  playCollectorVoice(syllables = 4, mood = 'taunt') {
    this.playCollectorChatter(syllables, mood);
  }

  playCollectorLaugh(syllables = 5) {
    this.playCollectorChatter(syllables, 'laugh');
  }

  playInquisitorDrone(intensity = 1.0) {
    this.playBossDrone(intensity);
  }
}

const SoundEngine = ObolAudioEngine;

if (typeof window !== 'undefined') {
  window.SoundEngine = ObolAudioEngine;
  window.ObolAudioEngine = ObolAudioEngine;
  window.obolAudio = new ObolAudioEngine();
  window.ObolAudio = window.obolAudio;
  window.soundEngine = window.obolAudio;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ObolAudioEngine, SoundEngine };
}
