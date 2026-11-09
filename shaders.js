/**
 * OBOL: The Cursed Coin Pusher
 * S2 — Real WebGL2 16-Bit HDR Float & World-Space 3D SDFGI Post-Processing Shader Pipeline (shaders.js)
 * Implements True World-Space 3D Signed Distance Field Global Illumination (SDFGI) Cone-Tracing,
 * Analytical 3D Cabinet Architecture SDFs (Reciprocating Shelf Step, Off-Screen Hellfire Furnaces, Skill-Shot Gate),
 * Screen-Space Micro-Horizon Ambient Occlusion (SSAO), Screen-Space Indirect Lighting (SSIL),
 * Volumetric Atmospheric Light Shafts / God-Rays, 5-Tap Contrast-Adaptive Micro-Sharpening (CAS),
 * 5-Tap Wide-Radius Golden Specular HDR Bloom / Halation, Dynamic Radial Chromatic Aberration,
 * Shockwave Ripple, Optional Retro CRT Mode (`toggleCrtMode()`), and Gentle Vignette.
 */

const VERT_SRC = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAG_SRC = `
  precision highp float;
  varying vec2 v_uv;

  uniform sampler2D u_tex;
  uniform sampler2D u_sdfVolumeTex;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_curvature;
  uniform float u_bloom;
  uniform float u_aberration;
  uniform float u_shockwave;
  uniform vec2 u_shockCenter;
  uniform float u_shockAge;
  uniform float u_scanlines;
  uniform float u_vignette;
  uniform float u_tilt;
  uniform float u_trauma;
  uniform float u_crt;
  uniform float u_shelfNormY;
  uniform float u_gateNormX;
  uniform vec2 u_camOffset;
  uniform float u_camZoom;

  float getLuma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  vec2 applyCRTCurvature(vec2 uv, float curvature) {
    if (curvature <= 0.0001) return uv;
    vec2 centered = uv * 2.0 - 1.0;
    vec2 offset = centered.yx * centered.yx * curvature;
    centered = centered + centered * offset;
    return centered * 0.5 + 0.5;
  }

  vec3 extractSpecularHighlight(vec3 sampleCol) {
    float hLum = getLuma(sampleCol);
    float hMask = smoothstep(0.72, 0.98, hLum);
    return sampleCol * hMask;
  }

  // 1. Screen-Space Micro-Horizon Ambient Occlusion (8-tap dual-ring: radius = 1.8px and 4.2px)
  float computeSSAO(vec2 uv, vec2 px, vec3 centerCol) {
    float cLum = getLuma(centerCol);
    vec2 r1 = px * 1.8;
    vec2 r2 = px * (4.2 * 0.70710678);

    float sE = getLuma(texture2D(u_tex, clamp(uv + vec2( r1.x,  0.0), 0.001, 0.999)).rgb);
    float sW = getLuma(texture2D(u_tex, clamp(uv + vec2(-r1.x,  0.0), 0.001, 0.999)).rgb);
    float sN = getLuma(texture2D(u_tex, clamp(uv + vec2( 0.0, -r1.y), 0.001, 0.999)).rgb);
    float sS = getLuma(texture2D(u_tex, clamp(uv + vec2( 0.0,  r1.y), 0.001, 0.999)).rgb);

    float dNE = getLuma(texture2D(u_tex, clamp(uv + vec2( r2.x, -r2.y), 0.001, 0.999)).rgb);
    float dNW = getLuma(texture2D(u_tex, clamp(uv + vec2(-r2.x, -r2.y), 0.001, 0.999)).rgb);
    float dSE = getLuma(texture2D(u_tex, clamp(uv + vec2( r2.x,  r2.y), 0.001, 0.999)).rgb);
    float dSW = getLuma(texture2D(u_tex, clamp(uv + vec2(-r2.x,  r2.y), 0.001, 0.999)).rgb);

    // Local pseudo-normal gradient from luminance elevation
    vec2 grad = vec2(sE - sW, sS - sN);
    float gradMag = length(grad);
    float cDepth = cLum + gradMag * 0.12;

    float innerAvg = (sE + sW + sN + sS) * 0.25;
    float outerAvg = (dNE + dNW + dSE + dSW) * 0.25;

    // Micro-crevice occlusion where center sits lower than surrounding ring geometry
    float diffInner = max(0.0, innerAvg - cDepth);
    float diffOuter = max(0.0, outerAvg - cDepth);

    // Range check prevents darkening across high-contrast HUD text edges
    float rangeInner = 1.0 - smoothstep(0.18, 0.42, diffInner);
    float rangeOuter = 1.0 - smoothstep(0.22, 0.48, diffOuter);

    float creviceOcc = (diffInner * rangeInner * 1.45 + diffOuter * rangeOuter * 0.95);
    // Protect bright specular coin faces and glowing UI typography
    float highlightProtect = 1.0 - smoothstep(0.58, 0.86, cLum);
    float aoFactor = clamp(1.0 - creviceOcc * highlightProtect, 0.78, 1.0);
    return aoFactor;
  }

  // 2. Screen-Space Indirect Lighting / Radiosity Bounce (6-tap ring: radius = 14.0px)
  vec3 computeSSIL(vec2 uv, vec2 px, vec3 centerCol) {
    vec2 r = px * 14.0;
    vec3 bounceSum = vec3(0.0);

    vec3 s0 = texture2D(u_tex, clamp(uv + vec2( r.x,  0.0), 0.001, 0.999)).rgb;
    vec3 s1 = texture2D(u_tex, clamp(uv + vec2(-r.x,  0.0), 0.001, 0.999)).rgb;
    vec3 s2 = texture2D(u_tex, clamp(uv + vec2( r.x * 0.5,  r.y * 0.866), 0.001, 0.999)).rgb;
    vec3 s3 = texture2D(u_tex, clamp(uv + vec2(-r.x * 0.5,  r.y * 0.866), 0.001, 0.999)).rgb;
    vec3 s4 = texture2D(u_tex, clamp(uv + vec2( r.x * 0.5, -r.y * 0.866), 0.001, 0.999)).rgb;
    vec3 s5 = texture2D(u_tex, clamp(uv + vec2(-r.x * 0.5, -r.y * 0.866), 0.001, 0.999)).rgb;

    vec3 avgSample = (s0 + s1 + s2 + s3 + s4 + s5) * 0.166667;
    float maxC = max(avgSample.r, max(avgSample.g, avgSample.b));
    float minC = min(avgSample.r, min(avgSample.g, avgSample.b));
    float sat = (maxC - minC) / (maxC + 0.001);
    float sLum = getLuma(avgSample);

    float emissiveWeight = smoothstep(0.24, 0.82, sLum) * smoothstep(0.14, 0.72, sat);
    bounceSum = avgSample * emissiveWeight * vec3(1.08, 0.96, 0.82);

    float cLum = getLuma(centerCol);
    float receiverMask = (1.0 - smoothstep(0.58, 0.92, cLum)) * smoothstep(0.03, 0.22, cLum);
    return bounceSum * receiverMask;
  }

  // 2b. True World-Space 3D SDF Global Illumination Cone-Tracer (view-independent off-screen bounce & 3D stack AO)
  vec4 evaluateWorldSDFGI(vec2 screenUv, vec3 baseCol) {
    vec2 worldUv = clamp((screenUv - 0.5) / max(0.35, u_camZoom) + 0.5 + u_camOffset, 0.02, 0.98);
    vec4 centerSdf = texture2D(u_sdfVolumeTex, worldUv);
    float centerElev = centerSdf.r;

    // Analytical 3D Cabinet SDFs:
    // (a) Upper reciprocating shelf step edge in world UV space
    float sdShelf = worldUv.y - (1.0 - u_shelfNormY);
    float shelfStepOcc = exp(-pow((sdShelf + 0.026) * 32.0, 2.0)) * step(-0.09, sdShelf) * step(sdShelf, 0.015);

    // (b) Left & Right House Hellfire Furnace columns (x = 0.08 & 0.92, y in [0.18..0.72])
    float furnaceYDist = max(0.0, max(0.18 - worldUv.y, worldUv.y - 0.72));
    float sdFurnaceL = length(vec2(worldUv.x - 0.08, furnaceYDist));
    float sdFurnaceR = length(vec2(worldUv.x - 0.92, furnaceYDist));
    float sdFurnace = min(sdFurnaceL, sdFurnaceR);
    vec3 furnaceIndirect = vec3(1.0, 0.42, 0.14) * exp(-sdFurnace * 5.2) * 0.42;

    // (c) Moving Skill-Shot Bonus Gate (x = u_gateNormX, y = 0.80) emitting emerald radiance
    float sdGate = length((worldUv - vec2(u_gateNormX, 0.80)) * vec2(1.0, 1.35));
    vec3 gateIndirect = vec3(0.22, 1.0, 0.48) * exp(-sdGate * 7.5) * 0.34;

    // 6-tap World-Space SDF Cone Trace (radius = 0.035 and 0.075 in board UV space)
    float rNear = 0.035;
    float rFar = 0.075;
    vec4 c0 = texture2D(u_sdfVolumeTex, clamp(worldUv + vec2( rNear,  0.0), 0.02, 0.98));
    vec4 c1 = texture2D(u_sdfVolumeTex, clamp(worldUv + vec2(-rNear,  0.0), 0.02, 0.98));
    vec4 c2 = texture2D(u_sdfVolumeTex, clamp(worldUv + vec2( rNear * 0.5,  rNear * 0.866), 0.02, 0.98));
    vec4 c3 = texture2D(u_sdfVolumeTex, clamp(worldUv + vec2(-rNear * 0.5, -rNear * 0.866), 0.02, 0.98));
    vec4 c4 = texture2D(u_sdfVolumeTex, clamp(worldUv + vec2( rFar * 0.5,  -rFar * 0.866), 0.02, 0.98));
    vec4 c5 = texture2D(u_sdfVolumeTex, clamp(worldUv + vec2(-rFar * 0.5,  rFar * 0.866), 0.02, 0.98));

    vec4 coneAvg = (c0 + c1 + c2 + c3 + c4 + c5) * 0.166667;

    // World-space 3D SDF horizon/crevice ambient occlusion from taller neighboring 3D coin stacks & shelf step
    float elevDiff = max(0.0, coneAvg.r - centerElev);
    float stackHorizonOcc = elevDiff * (0.45 + coneAvg.g * 0.35) + shelfStepOcc * 0.12;
    float cLum = getLuma(baseCol);
    float hiProtect = 1.0 - smoothstep(0.60, 0.88, cLum);
    float sdfAo = clamp(1.0 - stackHorizonOcc * hiProtect, 0.80, 1.0);

    // Multi-bounce indirect warm gold + off-screen furnace + emerald gate radiosity
    vec3 goldVolumeBounce = vec3(1.0, 0.82, 0.42) * (coneAvg.b * 0.68 + centerSdf.b * 0.32);
    vec3 hazardVolumeBounce = vec3(1.0, 0.48, 0.18) * coneAvg.a * 0.45;
    float receiverWeight = (1.0 - smoothstep(0.65, 0.95, cLum)) * smoothstep(0.02, 0.18, cLum);
    vec3 sdfBounce = (goldVolumeBounce + hazardVolumeBounce + furnaceIndirect + gateIndirect) * receiverWeight;

    return vec4(sdfBounce, sdfAo);
  }

  // 3. Volumetric Atmospheric Light Shafts / God-Rays (Collector Shrine + Left/Right House Furnaces)
  vec3 computeVolumetricFog(vec2 uv) {
    float dust = sin(uv.x * 18.0 + u_time * 0.7) * cos(uv.y * 14.0 - u_time * 0.5);
    float dustMod = 0.78 + 0.22 * dust;

    // Upper Collector Shrine god-rays emanating from vec2(0.5, 0.88)
    vec2 dShrine = uv - vec2(0.5, 0.88);
    float distShrine = length(dShrine * vec2(1.15, 0.85));
    float angleShrine = atan(dShrine.y, dShrine.x);
    float raysShrine = 0.65 + 0.35 * sin(angleShrine * 9.0 + u_time * 0.35);
    float coneShrine = exp(-distShrine * 3.1) * raysShrine;

    // Left & Right House Furnaces warm radial scatter from vec2(0.06, 0.48) and vec2(0.94, 0.48)
    float distLeft = length((uv - vec2(0.06, 0.48)) * vec2(1.35, 0.95));
    float distRight = length((uv - vec2(0.94, 0.48)) * vec2(1.35, 0.95));
    float furnaceGlow = exp(-distLeft * 4.2) + exp(-distRight * 4.2);

    vec3 shrineScatter = vec3(1.0, 0.84, 0.52) * coneShrine;
    vec3 furnaceScatter = vec3(1.0, 0.48, 0.18) * furnaceGlow * 0.75;
    return (shrineScatter + furnaceScatter) * dustMod;
  }

  void main() {
    // Retro CRT barrel curvature ONLY when u_crt > 0.5
    vec2 uv = u_crt > 0.5 ? applyCRTCurvature(v_uv, max(0.008, u_curvature)) : v_uv;

    // Dark bezel mask outside curved CRT bounds (only when u_crt > 0.5)
    if (u_crt > 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) {
      gl_FragColor = vec4(0.02, 0.015, 0.01, 1.0);
      return;
    }

    vec2 centerOffset = uv - vec2(0.5, 0.5);
    float edgeDist = length(centerOffset);
    float edgeMask = smoothstep(0.22, 0.74, edgeDist);

    // Subtle edge heat shimmer proportional to u_tilt when u_tilt > 0.35
    float tiltExcess = u_tilt > 0.35 ? clamp((u_tilt - 0.35) / 0.65, 0.0, 1.0) : 0.0;
    if (tiltExcess > 0.001) {
      vec2 heatShimmer = vec2(
        sin(uv.y * 42.0 + u_time * 14.0),
        cos(uv.x * 34.0 - u_time * 11.0)
      ) * (0.0020 * tiltExcess * edgeMask);
      uv = clamp(uv + heatShimmer, 0.001, 0.999);
    }

    // Dynamic refractive shockwave ripple + golden specular ring wave from cabinet slams / blast detonations / mythic fusions
    vec2 centerVec = uv - u_shockCenter;
    float dist = length(centerVec);
    float shockSpecularRing = 0.0;
    if (u_shockAge >= 0.0 && u_shockAge < 0.85) {
      float ringRadius = u_shockAge * 0.92;
      float ringBand = exp(-pow((dist - ringRadius) * 18.0, 2.0));
      float env = (1.0 - u_shockAge / 0.85);
      vec2 dir = normalize(centerVec + vec2(0.0001));
      uv = clamp(uv + dir * ringBand * env * 0.014, 0.001, 0.999);
      shockSpecularRing = ringBand * env;
    } else if (u_shockwave > 0.001) {
      float wave = sin(dist * 38.0 - u_time * 16.0) * u_shockwave * 0.0055 / (1.0 + dist * 4.0);
      uv = clamp(uv + normalize(centerVec + vec2(0.0001)) * wave, 0.001, 0.999);
      shockSpecularRing = clamp(abs(wave) * 95.0, 0.0, 0.65);
    }

    // Radial edge chromatic aberration (zero in normal state; active on shockwave or u_tilt > 0.35)
    float totalAberration = u_aberration + tiltExcess * edgeMask * 0.0032;
    vec2 abDir = (uv - vec2(0.5, 0.5)) * totalAberration;
    vec4 baseSample = texture2D(u_tex, uv);
    float r = texture2D(u_tex, clamp(uv + abDir, 0.001, 0.999)).r;
    float g = baseSample.g;
    float b = texture2D(u_tex, clamp(uv - abDir, 0.001, 0.999)).b;
    vec3 col = mix(baseSample.rgb, vec3(r, g, b), clamp(totalAberration * 180.0, 0.0, 1.0));

    // 5-Tap Contrast-Adaptive Micro-Sharpening (CAS) for razor-sharp 3D coin reliefs & typography
    vec2 px = 1.0 / max(u_resolution, vec2(1.0));
    vec3 nN = texture2D(u_tex, clamp(uv + vec2(0.0, -px.y), 0.001, 0.999)).rgb;
    vec3 nS = texture2D(u_tex, clamp(uv + vec2(0.0,  px.y), 0.001, 0.999)).rgb;
    vec3 nW = texture2D(u_tex, clamp(uv + vec2(-px.x, 0.0), 0.001, 0.999)).rgb;
    vec3 nE = texture2D(u_tex, clamp(uv + vec2( px.x, 0.0), 0.001, 0.999)).rgb;

    vec3 minRGB = min(col, min(min(nN, nS), min(nW, nE)));
    vec3 maxRGB = max(col, max(max(nN, nS), max(nW, nE)));
    float localContrast = dot(maxRGB - minRGB, vec3(0.299, 0.587, 0.114));
    float casWeight = mix(0.10, 0.04, smoothstep(0.35, 0.85, localContrast));

    vec3 laplacian = col * 4.0 - (nN + nS + nW + nE);
    // Preserve 100% of 3D AgX/ACES base shadow brightness (never crush or darken below baseSample.rgb in normal state)
    col = clamp(max(baseSample.rgb, col + laplacian * casWeight), 0.0, 1.0);

    // Evaluate SSAO, SSIL, World-Space 3D SDFGI & Volumetric Fog without darkening 3D PBR shadows
    float aoFactor = computeSSAO(uv, px, col);
    vec4 worldSdfGi = evaluateWorldSDFGI(uv, col);
    float combinedAo = clamp(min(aoFactor, worldSdfGi.a) * 0.55 + (aoFactor * worldSdfGi.a) * 0.45, 0.78, 1.0);
    vec3 ssilBounce = computeSSIL(uv, px, col);
    vec3 volumetricScatter = computeVolumetricFog(uv);

    // Modulate subtle additive indirect bounce by combinedAo so crevices stay crisp without crushing base 3D shadows
    col += (ssilBounce * 0.025 + worldSdfGi.rgb * 0.028 + volumetricScatter * 0.008) * combinedAo;

    // 5-Tap Wide-Radius Golden Specular HDR Bloom Pass (±3.5px + center)
    vec2 bloomOff = vec2(3.5) / max(u_resolution, vec2(1.0));
    vec3 b0 = extractSpecularHighlight(col);
    vec3 b1 = extractSpecularHighlight(texture2D(u_tex, clamp(uv + vec2(-bloomOff.x, -bloomOff.y), 0.001, 0.999)).rgb);
    vec3 b2 = extractSpecularHighlight(texture2D(u_tex, clamp(uv + vec2( bloomOff.x, -bloomOff.y), 0.001, 0.999)).rgb);
    vec3 b3 = extractSpecularHighlight(texture2D(u_tex, clamp(uv + vec2(-bloomOff.x,  bloomOff.y), 0.001, 0.999)).rgb);
    vec3 b4 = extractSpecularHighlight(texture2D(u_tex, clamp(uv + vec2( bloomOff.x,  bloomOff.y), 0.001, 0.999)).rgb);

    vec3 nearHighlight = extractSpecularHighlight((nN + nS + nW + nE) * 0.25);
    vec3 bloomSum = b0 * 0.28 + (b1 + b2 + b3 + b4) * 0.13 + nearHighlight * 0.20;
    vec3 bloomGlow = bloomSum * (1.0 + u_bloom * 1.1);

    // Warm golden-amber specular halation + active shockwave golden specular ring wave
    col += bloomGlow * vec3(1.0, 0.88, 0.62) * 0.08;
    if (shockSpecularRing > 0.001) {
      col += vec3(1.0, 0.86, 0.46) * shockSpecularRing * 0.28;
    }

    // Crimson edge pulse proportional to u_trauma when a finger is severed or a curse triggers
    if (u_trauma > 0.001) {
      float traumaEdge = smoothstep(0.28, 0.86, edgeDist);
      float traumaPulse = 0.74 + 0.26 * sin(u_time * 18.0);
      float traumaMask = clamp(u_trauma * traumaEdge * traumaPulse, 0.0, 0.82);
      col = mix(col, vec3(0.86, 0.05, 0.09), traumaMask * 0.55) + vec3(0.48, 0.03, 0.05) * traumaMask * 0.35;
    }

    // Optional retro CRT phosphor scanlines & corner bezel vignette ONLY when u_crt > 0.5
    if (u_crt > 0.5) {
      float scanStr = max(0.045, u_scanlines);
      float scanline = sin(uv.y * u_resolution.y * 3.14159265) * 0.5 + 0.5;
      col *= 1.0 - (scanStr * (1.0 - scanline));

      float vig = smoothstep(0.58, 1.04, edgeDist * 1.08);
      col *= 1.0 - vig * min(0.12, max(0.06, u_vignette));
    }

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

class CabinetShaderPipeline {
  constructor(sourceCanvas) {
    this.sourceCanvas = sourceCanvas || (typeof document !== 'undefined' ? document.getElementById('pusher-canvas') : null);
    this.canvas3d = typeof document !== 'undefined' ? document.getElementById('pusher-canvas-3d') : null;
    this.framesRendered = 0;
    this.active = false;
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.sdfVolumeTexture = null;
    this.quadBuffer = null;
    this.uniforms = {};
    this.startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.shockwaveCenter = [0.5, 0.52];
    this.shockwaveStart = -10.0;
    this.shockwaves = [];

    // WebGL 2 SSAO, SSIL Indirect Bounce, World-Space 3D SDFGI & 16-Bit HDR Float Pipeline Telemetry Flags
    this.ssaoEnabled = true;
    this.ssilEnabled = true;
    this.volumetricFogEnabled = true;
    this.worldSdfGiEnabled = true;
    this.hdrFloatPipelineEnabled = true;
    this.sdfVolumeGridSize = 32;
    this.sdfVolumeUpdatedFrames = 0;
    this.sdfVolumeData = new Uint8Array(32 * 32 * 4);
    this.physicsRef = null;
    this.shelfNormY = 0.35;
    this.gateNormX = 0.50;
    this.camOffset = [0.0, 0.0];
    this.camZoom = 1.0;

    // Default CRT scanlines and barrel curvature to 0.0 for razor-sharp 3D WebGL clarity
    this._crtEnabled = false;
    this.scanlineIntensity = 0.0;
    this.curvature = 0.0;
    this._tiltIntensity = 0.0;
    this._manualTilt = 0.0;
    this._manualTiltUntil = -1.0;
    this._traumaIntensity = 0.0;
    this._manualTrauma = 0.0;
    this._manualTraumaUntil = -1.0;
    this.traumaStart = -10.0;
    this.traumaDuration = 1.8;
    this.traumaPeak = 0.0;

    if (!this.sourceCanvas || typeof document === 'undefined') {
      return;
    }

    this.initWebGLOverlay();
    window.cabinetShader = this;
  }

  get crtEnabled() {
    return Boolean(this._crtEnabled);
  }

  set crtEnabled(val) {
    const next = Boolean(val);
    this._crtEnabled = next;
    this.scanlineIntensity = next ? 0.05 : 0.0;
    this.curvature = next ? 0.008 : 0.0;
    if (typeof document !== 'undefined') {
      const crtEl = document.getElementById('crt-overlay');
      if (crtEl && crtEl.classList.contains('crt-enabled') !== next) {
        crtEl.classList.toggle('crt-enabled', next);
      }
    }
  }

  get crtModeEnabled() {
    return Boolean(this._crtEnabled);
  }

  set crtModeEnabled(val) {
    this.crtEnabled = Boolean(val);
  }

  get enabled() {
    return Boolean(this._crtEnabled);
  }

  set enabled(val) {
    this.crtEnabled = Boolean(val);
  }

  get tiltIntensity() {
    return this._tiltIntensity;
  }

  set tiltIntensity(val) {
    const clamped = Math.max(0.0, Math.min(1.0, Number(val) || 0.0));
    this._tiltIntensity = clamped;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const nowSec = (now - this.startTime) * 0.001;
    this._manualTilt = clamped;
    this._manualTiltUntil = clamped > 0 ? nowSec + 3.0 : -1.0;
  }

  get traumaIntensity() {
    return this._traumaIntensity;
  }

  set traumaIntensity(val) {
    const clamped = Math.max(0.0, Math.min(1.0, Number(val) || 0.0));
    this._traumaIntensity = clamped;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const nowSec = (now - this.startTime) * 0.001;
    this._manualTrauma = clamped;
    this._manualTraumaUntil = clamped > 0 ? nowSec + 3.0 : -1.0;
  }

  init() {
    if (!this.active) {
      this.initWebGLOverlay();
    }
    return this.active;
  }

  toggleCrtMode(forceState) {
    const nextState = typeof forceState === 'boolean' ? forceState : !this._crtEnabled;
    this.crtEnabled = nextState;
    return nextState;
  }

  triggerShockwave(nx = 0.5, ny = 0.52) {
    const clampedX = Math.max(0.05, Math.min(0.95, Number(nx) || 0.5));
    const clampedY = Math.max(0.05, Math.min(0.95, Number(ny) || 0.52));
    this.shockwaveCenter = [clampedX, clampedY];
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const nowSec = (now - this.startTime) * 0.001;
    this.shockwaveStart = nowSec;
    this.shockwaves = this.shockwaves.filter((s) => nowSec - s.startTime >= 0 && nowSec - s.startTime < 0.85);
    this.shockwaves.push({ nx: clampedX, ny: clampedY, startTime: nowSec });
  }

  triggerTrauma(intensity = 1.0, duration = 1.8) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.traumaStart = (now - this.startTime) * 0.001;
    this.traumaDuration = Math.max(0.2, Number(duration) || 1.8);
    this.traumaPeak = Math.max(0.0, Math.min(1.0, Number(intensity) || 1.0));
    this._traumaIntensity = this.traumaPeak;
  }

  setTilt(tiltRatio = 0.0) {
    this.tiltIntensity = tiltRatio;
    return this._tiltIntensity;
  }

  setTrauma(traumaRatio = 0.0) {
    this.traumaIntensity = traumaRatio;
    return this._traumaIntensity;
  }

  getActiveShockwaveCount(nowSecOverride) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const nowSec = typeof nowSecOverride === 'number' ? nowSecOverride : (now - this.startTime) * 0.001;
    this.shockwaves = (this.shockwaves || []).filter((s) => nowSec - s.startTime >= 0 && nowSec - s.startTime < 0.85);
    if (this.shockwaves.length > 0) {
      return this.shockwaves.length;
    }
    if (this.shockwaveStart >= 0 && nowSec - this.shockwaveStart >= 0 && nowSec - this.shockwaveStart < 0.85) {
      return 1;
    }
    const phys =
      this.physicsRef ||
      (typeof window !== 'undefined' &&
        ((window.obolGame && window.obolGame.physics) || (window.game && window.game.physics))) ||
      null;
    if (phys && Number(phys.shakeTime) > 0.05) {
      return 1;
    }
    return 0;
  }

  _syncLiveTelemetry(physics, tiltRatio, crtEnabled, traumaRatio) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const nowSec = (now - this.startTime) * 0.001;
    const gameRef = (typeof window !== 'undefined' && (window.obolGame || window.game)) || null;
    const phys = physics || this.physicsRef || (gameRef && gameRef.physics) || null;
    if (phys) {
      this.physicsRef = phys;
    }

    // 1. Sync CRT state with #crt-overlay
    const crtEl = typeof document !== 'undefined' ? document.getElementById('crt-overlay') : null;
    if (crtEl) {
      this._crtEnabled = crtEl.classList.contains('crt-enabled');
    } else if (typeof crtEnabled === 'boolean') {
      this._crtEnabled = crtEnabled;
    }

    // 2. Sync Tilt intensity in [0, 1]
    const liveGameTilt = gameRef
      ? (Number(gameRef.tiltGauge) || Number(gameRef.tiltMeter) || 0) / 100
      : 0;
    const livePhysTilt = phys ? Number(phys.collectorTilt) || Number(phys.tiltRatio) || 0 : 0;
    const argTilt = typeof tiltRatio === 'number' && !Number.isNaN(tiltRatio) ? tiltRatio : 0;
    const manualTilt = nowSec < this._manualTiltUntil ? this._manualTilt : 0;
    this._tiltIntensity = Math.max(0, Math.min(1, Math.max(argTilt, liveGameTilt, livePhysTilt, manualTilt)));

    // 3. Sync Trauma intensity in [0, 1] (guillotine sever / blood curse / explicit trauma pulse)
    let pulseTrauma = 0;
    if (this.traumaStart >= 0 && nowSec - this.traumaStart >= 0 && nowSec - this.traumaStart < this.traumaDuration) {
      pulseTrauma = this.traumaPeak * (1.0 - (nowSec - this.traumaStart) / this.traumaDuration);
    }
    const guillotineTimer = phys
      ? Math.max(Number(phys.guillotineTimer) || 0, (phys.guillotine && Number(phys.guillotine.timer)) || 0)
      : 0;
    const liveGuillotineTrauma = guillotineTimer > 0 ? Math.min(1.0, guillotineTimer / 1.6) : 0;
    const liveGameTrauma = gameRef ? Math.min(1.0, Number(gameRef.traumaTimer || gameRef.bloodTraumaTimer || 0)) : 0;
    const argTrauma = typeof traumaRatio === 'number' && !Number.isNaN(traumaRatio) ? traumaRatio : 0;
    const manualTrauma = nowSec < this._manualTraumaUntil ? this._manualTrauma : 0;
    this._traumaIntensity = Math.max(
      0,
      Math.min(1, Math.max(argTrauma, pulseTrauma, liveGuillotineTrauma, liveGameTrauma, manualTrauma))
    );

    return { nowSec, phys, gameRef };
  }

  getShaderTelemetry() {
    this._syncLiveTelemetry();
    return {
      compiled: Boolean(this.active && this.program && this.gl),
      activeShockwaves: this.getActiveShockwaveCount(),
      crtEnabled: Boolean(this.crtEnabled),
      tiltIntensity: Number((this.tiltIntensity || 0).toFixed(4)),
      traumaIntensity: Number((this.traumaIntensity || 0).toFixed(4))
    };
  }

  getTargetResolution() {
    const dpr = Math.min(2.0, Math.max(1.0, (typeof window !== 'undefined' && window.devicePixelRatio) || 2.0));
    const srcW = (this.sourceCanvas && this.sourceCanvas.width) || 680;
    const srcH = (this.sourceCanvas && this.sourceCanvas.height) || 640;
    if (!this.canvas3d && typeof document !== 'undefined') {
      this.canvas3d = document.getElementById('pusher-canvas-3d');
    }
    const c3dW = (this.canvas3d && this.canvas3d.width) || 0;
    const c3dH = (this.canvas3d && this.canvas3d.height) || 0;
    const w = Math.max(srcW, c3dW, Math.round(680 * dpr));
    const h = Math.max(srcH, c3dH, Math.round(640 * dpr));
    return { w, h };
  }

  initWebGLOverlay() {
    try {
      const parent = this.sourceCanvas.parentElement;
      if (!parent) return;

      let glCanvas = parent.querySelector('#webgl-post-canvas');
      if (!glCanvas) {
        glCanvas = document.createElement('canvas');
        glCanvas.id = 'webgl-post-canvas';
        parent.appendChild(glCanvas);
      }

      const { w, h } = this.getTargetResolution();
      glCanvas.width = w;
      glCanvas.height = h;
      glCanvas.style.cssText =
        'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 6; border-radius: inherit; image-rendering: auto;';
      this.glCanvas = glCanvas;

      const ctxAttrs = {
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      };

      const gl =
        glCanvas.getContext('webgl2', ctxAttrs) ||
        glCanvas.getContext('webgl', ctxAttrs) ||
        glCanvas.getContext('experimental-webgl', ctxAttrs);

      if (!gl) {
        glCanvas.style.display = 'none';
        return;
      }
      this.gl = gl;

      // Enable 16-bit HDR half-float / float color buffer & linear filtering extensions when available
      this.extColorBufferFloat = gl.getExtension('EXT_color_buffer_float') || null;
      this.extColorBufferHalfFloat = gl.getExtension('EXT_color_buffer_half_float') || null;
      this.extTextureHalfFloatLinear = gl.getExtension('OES_texture_half_float_linear') || null;

      const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      if (!vs || !fs) return;

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        return;
      }

      this.program = prog;
      gl.useProgram(prog);

      // Full-screen triangle-pair quad
      const quadVerts = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ]);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
      this.quadBuffer = buf;

      const posLoc = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      // High-DPI source canvas texture on TEXTURE0 with anisotropic filtering support when available
      gl.activeTexture(gl.TEXTURE0);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const anisoExt =
        gl.getExtension('EXT_texture_filter_anisotropic') ||
        gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
        gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
      if (anisoExt) {
        const maxAniso = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 4;
        gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, maxAniso));
      }

      this.texture = tex;

      // Live 32x32 RGBA World-Space 3D SDF & Irradiance Volume Texture on TEXTURE1
      gl.activeTexture(gl.TEXTURE1);
      const sdfTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, sdfTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.sdfVolumeGridSize,
        this.sdfVolumeGridSize,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.sdfVolumeData
      );
      this.sdfVolumeTexture = sdfTex;
      gl.activeTexture(gl.TEXTURE0);

      this.uniforms = {
        u_tex: gl.getUniformLocation(prog, 'u_tex'),
        u_sdfVolumeTex: gl.getUniformLocation(prog, 'u_sdfVolumeTex'),
        u_resolution: gl.getUniformLocation(prog, 'u_resolution'),
        u_time: gl.getUniformLocation(prog, 'u_time'),
        u_curvature: gl.getUniformLocation(prog, 'u_curvature'),
        u_bloom: gl.getUniformLocation(prog, 'u_bloom'),
        u_aberration: gl.getUniformLocation(prog, 'u_aberration'),
        u_shockwave: gl.getUniformLocation(prog, 'u_shockwave'),
        u_shockCenter: gl.getUniformLocation(prog, 'u_shockCenter'),
        u_shockAge: gl.getUniformLocation(prog, 'u_shockAge'),
        u_scanlines: gl.getUniformLocation(prog, 'u_scanlines'),
        u_vignette: gl.getUniformLocation(prog, 'u_vignette'),
        u_tilt: gl.getUniformLocation(prog, 'u_tilt'),
        u_trauma: gl.getUniformLocation(prog, 'u_trauma'),
        u_crt: gl.getUniformLocation(prog, 'u_crt'),
        u_shelfNormY: gl.getUniformLocation(prog, 'u_shelfNormY'),
        u_gateNormX: gl.getUniformLocation(prog, 'u_gateNormX'),
        u_camOffset: gl.getUniformLocation(prog, 'u_camOffset'),
        u_camZoom: gl.getUniformLocation(prog, 'u_camZoom')
      };

      this.active = true;
    } catch (err) {
      this.active = false;
    }
  }

  updateWorldSdfVolume(physics, engine3d) {
    const phys =
      physics ||
      this.physicsRef ||
      (typeof window !== 'undefined' && window.obolGame && window.obolGame.physics) ||
      null;
    if (phys) {
      this.physicsRef = phys;
    }
    const eng3d =
      engine3d ||
      (typeof window !== 'undefined' &&
        ((window.obolGame && window.obolGame.engine3d) || window.obolEngine3D)) ||
      null;

    const boardW = (phys && phys.width) || 680;
    const boardH = (phys && phys.height) || 640;
    this.shelfNormY =
      phys && typeof phys.shelfY === 'number'
        ? Math.max(0.15, Math.min(0.65, phys.shelfY / boardH))
        : 0.35;
    this.gateNormX =
      phys && typeof phys.gateX === 'number'
        ? Math.max(0.10, Math.min(0.90, phys.gateX / boardW))
        : 0.50;

    const preset = (eng3d && eng3d.activeCameraPreset) || 'playfield';
    if (preset === 'angled_booth') {
      this.camOffset[0] = 0.0;
      this.camOffset[1] = -0.04;
      this.camZoom = 1.12;
    } else if (preset === 'lip_closeup') {
      this.camOffset[0] = 0.0;
      this.camOffset[1] = -0.22;
      this.camZoom = 1.55;
    } else if (preset === 'peephole') {
      this.camOffset[0] = 0.0;
      this.camOffset[1] = 0.28;
      this.camZoom = 1.75;
    } else {
      this.camOffset[0] = 0.0;
      this.camOffset[1] = 0.0;
      this.camZoom = 1.0;
    }

    const G = this.sdfVolumeGridSize;
    const data = this.sdfVolumeData;
    const shelfRow = Math.floor(this.shelfNormY * G);
    const gateCol = Math.floor(this.gateNormX * G);

    // 1. Initialize analytical cabinet step & off-screen furnace / bonus gate radiance field
    for (let gy = 0; gy < G; gy++) {
      const normY = (gy + 0.5) / G;
      const onUpperShelf = gy <= shelfRow;
      const baseElev = onUpperShelf ? 88 : 0;
      const baseMass = onUpperShelf ? 42 : 0;
      const inFurnaceY = normY >= 0.28 && normY <= 0.82;

      for (let gx = 0; gx < G; gx++) {
        const idx = (gy * G + gx) * 4;
        data[idx] = baseElev;
        data[idx + 1] = baseMass;
        data[idx + 2] = 0;

        let emissive = 0;
        if (inFurnaceY && (gx <= 3 || gx >= G - 4)) {
          emissive = 190;
        }
        const dGate = Math.hypot(gx - gateCol, gy - 6);
        if (dGate < 3.2) {
          emissive = Math.max(emissive, Math.round((1.0 - dGate / 3.2) * 175));
        }
        data[idx + 3] = emissive;
      }
    }

    // 2. Splat active 3D coins (stack elevation R, metallic occlusion G, gold radiosity B, hazard radiance A)
    const coins = (phys && phys.coins) || [];
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c) continue;
      const gx = Math.max(0, Math.min(G - 1, Math.floor((c.x / boardW) * G)));
      const gy = Math.max(0, Math.min(G - 1, Math.floor((c.y / boardH) * G)));
      const z = Math.max(0, Number(c.z) || 0);
      const thickness = Math.max(4, Number(c.thickness) || 5);
      const elevByte = Math.max(0, Math.min(255, Math.round(((z + thickness) / 28.0) * 255)));

      const t = c.type || 'gold';
      const isWarmGold =
        t === 'gold' ||
        t === 'bullion' ||
        t === 'crown' ||
        t === 'diamond' ||
        t === 'key' ||
        (c.fuseTier && c.fuseTier > 1);
      const isHazard =
        t === 'skull' || t === 'bomb' || t === 'blood' || t === 'soul' || t === 'magnet';

      const goldEnergy = isWarmGold ? (c.fuseTier && c.fuseTier > 1 ? 115 : 78) : 32;
      const hazardEnergy = isHazard ? 130 : 0;

      for (let oy = -1; oy <= 1; oy++) {
        const ny = gy + oy;
        if (ny < 0 || ny >= G) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = gx + ox;
          if (nx < 0 || nx >= G) continue;
          const falloff = ox === 0 && oy === 0 ? 1.0 : 0.45;
          const cIdx = (ny * G + nx) * 4;
          const cellElev = Math.round(elevByte * falloff);
          if (cellElev > data[cIdx]) {
            data[cIdx] = cellElev;
          }
          data[cIdx + 1] = Math.min(255, data[cIdx + 1] + Math.round(64 * falloff));
          data[cIdx + 2] = Math.min(255, data[cIdx + 2] + Math.round(goldEnergy * falloff));
          if (hazardEnergy > 0) {
            data[cIdx + 3] = Math.min(255, data[cIdx + 3] + Math.round(hazardEnergy * falloff));
          }
        }
      }
    }

    if (this.gl && this.sdfVolumeTexture) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.sdfVolumeTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        G,
        G,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
      );
      gl.activeTexture(gl.TEXTURE0);
      this.sdfVolumeUpdatedFrames++;
    }
  }

  compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  render(arg1, tiltRatio, crtEnabled, traumaRatio) {
    let physics = null;
    if (arg1 && typeof arg1.getContext === 'function') {
      this.sourceCanvas = arg1;
      physics =
        this.physicsRef ||
        (typeof window !== 'undefined' &&
          ((window.obolGame && window.obolGame.physics) || (window.game && window.game.physics))) ||
        null;
    } else if (arg1 && typeof arg1 === 'object') {
      physics = arg1;
      this.physicsRef = physics;
      if (physics.canvas && typeof physics.canvas.getContext === 'function') {
        this.sourceCanvas = physics.canvas;
      }
    } else {
      physics =
        this.physicsRef ||
        (typeof window !== 'undefined' &&
          ((window.obolGame && window.obolGame.physics) || (window.game && window.game.physics))) ||
        null;
    }

    if (!this.active && this.sourceCanvas) {
      this.initWebGLOverlay();
    }
    if (!this.active || !this.gl || !this.program || !this.sourceCanvas) return;
    if (!this.sourceCanvas.width || !this.sourceCanvas.height) return;
    const gl = this.gl;

    const { w, h } = this.getTargetResolution();
    if (this.glCanvas.width !== w || this.glCanvas.height !== h) {
      this.glCanvas.width = w;
      this.glCanvas.height = h;
    }
    if (this.sourceCanvas && this.sourceCanvas.clientWidth > 0 && this.sourceCanvas.clientHeight > 0) {
      const targetCssW = `${this.sourceCanvas.clientWidth}px`;
      const targetCssH = `${this.sourceCanvas.clientHeight}px`;
      const targetLeft = `${this.sourceCanvas.offsetLeft}px`;
      const targetTop = `${this.sourceCanvas.offsetTop}px`;
      if (this.glCanvas.style.width !== targetCssW) this.glCanvas.style.width = targetCssW;
      if (this.glCanvas.style.height !== targetCssH) this.glCanvas.style.height = targetCssH;
      if (this.glCanvas.style.left !== targetLeft) this.glCanvas.style.left = targetLeft;
      if (this.glCanvas.style.top !== targetTop) this.glCanvas.style.top = targetTop;
    }

    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    const { nowSec, phys } = this._syncLiveTelemetry(physics, tiltRatio, crtEnabled, traumaRatio);

    // Update live 32x32 World-Space 3D SDF & Irradiance Volume Texture on TEXTURE1
    this.updateWorldSdfVolume(phys);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);

    const overdriveActive = phys && phys.overdriveTimer > 0;
    const shakeTime = (phys && phys.shakeTime) || 0;
    const clampedTilt = this.tiltIntensity;
    const clampedTrauma = this.traumaIntensity;
    const useCrt = Boolean(this.crtEnabled);

    const curvature = useCrt ? Math.max(0.008, this.curvature) : 0.0;
    const scanlines = useCrt ? Math.max(0.045, this.scanlineIntensity) : 0.0;

    const bloom = 0.16 + (overdriveActive ? 0.12 : 0.0);
    const aberration =
      shakeTime > 0.05 || clampedTilt > 0.35
        ? shakeTime * 0.0038 + (clampedTilt > 0.35 ? (clampedTilt - 0.35) * 0.0024 : 0.0)
        : 0.0;
    const shockwave = Math.min(1.0, shakeTime * 2.2);
    const shockAge = this.shockwaveStart >= 0 ? nowSec - this.shockwaveStart : -1.0;
    const vignette = useCrt ? Math.min(0.12, 0.06 + clampedTilt * 0.04) : 0.0;

    gl.uniform1i(this.uniforms.u_tex, 0);
    gl.uniform1i(this.uniforms.u_sdfVolumeTex, 1);
    gl.uniform2f(this.uniforms.u_resolution, w, h);
    gl.uniform1f(this.uniforms.u_time, nowSec);
    gl.uniform1f(this.uniforms.u_curvature, curvature);
    gl.uniform1f(this.uniforms.u_bloom, bloom);
    gl.uniform1f(this.uniforms.u_aberration, aberration);
    gl.uniform1f(this.uniforms.u_shockwave, shockwave);
    gl.uniform2f(this.uniforms.u_shockCenter, this.shockwaveCenter[0], this.shockwaveCenter[1]);
    gl.uniform1f(this.uniforms.u_shockAge, shockAge);
    gl.uniform1f(this.uniforms.u_scanlines, scanlines);
    gl.uniform1f(this.uniforms.u_vignette, vignette);
    gl.uniform1f(this.uniforms.u_tilt, clampedTilt);
    gl.uniform1f(this.uniforms.u_trauma, clampedTrauma);
    gl.uniform1f(this.uniforms.u_crt, useCrt ? 1.0 : 0.0);
    gl.uniform1f(this.uniforms.u_shelfNormY, this.shelfNormY);
    gl.uniform1f(this.uniforms.u_gateNormX, this.gateNormX);
    gl.uniform2f(this.uniforms.u_camOffset, this.camOffset[0], this.camOffset[1]);
    gl.uniform1f(this.uniforms.u_camZoom, this.camZoom);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.framesRendered++;
  }
}

window.CabinetShaderPipeline = CabinetShaderPipeline;
