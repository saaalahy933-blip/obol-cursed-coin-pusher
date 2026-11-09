/**
 * OBOL: The Collector's Debt
 * True 3D WebGL Playfield & Cannon-es 3D Rigid-Body Cylinder Physics Engine (engine3d.js)
 *
 * Uses Three.js (r160 + GLTFLoader + PMREMGenerator) and Cannon-es (0.20.0) from vendor/engine3d-bundle.js,
 * Blender 5.2 .glb 3D models (assets/models/*.glb), tangent-space normal maps (coin-normal.png),
 * and real-time 3D shadow maps (PCFSoftShadowMap).
 */
(function () {
  'use strict';

  const DIORAMA_TILT_X = 0.0; // Natural horizontal 3D tabletop coins viewed from a pitched 3D PerspectiveCamera

  class ObolEngine3D {
    constructor(physics) {
      this.physics = physics;
      this.width = (physics && physics.width) || 680;
      this.height = (physics && physics.height) || 640;
      this.active = false;
      this.enabled = false;
      this.framesRendered = 0;

      if (
        typeof window === 'undefined' ||
        typeof document === 'undefined' ||
        !window.THREE
      ) {
        return;
      }

      this.THREE = window.THREE;
      this.CANNON = window.CANNON || null;

      this.coinMeshes = new Map();
      this.fallingCoinMeshes = new Map();
      this.chuteCoinMeshes = new Map();
      this.chestMeshes = new Map();
      this.pegMeshes = [];
      this.bumperMeshes = [];
      this.oilSlickMeshes = [];
      this.reserveCoinMeshes = [];
      this.tokenMaterials = new Map();
      this.fuseBadgeMaterials = new Map();
      this.coinBodies = new Map();
      this.cannonTwoWaySyncedCount = 0;
      this.glbGeometries = {};
      this.glbScenes = {};

      try {
        this.initThreeScene();
        this.initCannonWorld();
        this.loadTexturesAndModels();
        this.buildCabinet3DGeometry();
        this.active = true;
        this.enabled = true;
        window.obolEngine3D = this;
      } catch (err) {
        console.warn('[ObolEngine3D] WebGL 3D initialization fallback:', err);
        this.active = false;
        this.enabled = false;
      }
    }

    /**
     * Exact inverse perspective compensation so (bx, by) at height bz projects
     * to exact pixel (bx, by - bz * 0.48) with zero horizontal drift in playfield view.
     */
    boardToWorld(bx, by, bz = 0) {
      const wz = bz * 0.88;
      const perspectiveComp = (900 - wz) / 900;
      return {
        x: (bx - 340) * perspectiveComp,
        y: (320 - by + bz * 0.48) * perspectiveComp,
        z: wz
      };
    }

    /**
     * Projects a 3D board coordinate (bx, by, bz) through the active 3D PerspectiveCamera
     * into 680x640 screen pixel coordinates { x, y, scale, visible }.
     */
    worldToScreen(bx, by, bz = 0) {
      const THREE = this.THREE;
      if (!this.camera || !THREE) {
        return { x: bx, y: by - bz * 0.48, scale: 1, visible: true };
      }
      const w = this.boardToWorld(bx, by, bz);
      if (!this._projVec) {
        this._projVec = new THREE.Vector3();
        this._camPosVec = new THREE.Vector3();
      }
      this.camera.updateMatrixWorld();
      this._projVec.set(w.x, w.y, w.z);
      this._camPosVec.setFromMatrixPosition(this.camera.matrixWorld);
      const dist = Math.max(120, this._camPosVec.distanceTo(this._projVec));
      const fovScale = Math.tan((this.defaultFov * Math.PI) / 360) / Math.tan((this.camera.fov * Math.PI) / 360);
      const scale = Math.max(0.55, Math.min(2.15, (900 / dist) * fovScale));

      this._projVec.project(this.camera);
      const sx = (this._projVec.x * 0.5 + 0.5) * this.width;
      const sy = (-this._projVec.y * 0.5 + 0.5) * this.height;
      const visible =
        this._projVec.z >= -1 &&
        this._projVec.z <= 1 &&
        sx >= -80 &&
        sx <= this.width + 80 &&
        sy >= -80 &&
        sy <= this.height + 80;
      return { x: sx, y: sy, scale, visible };
    }

    /**
     * Unprojects a 680x640 screen pixel (sx, sy) through the active 3D PerspectiveCamera
     * onto the horizontal board plane at height targetBz, returning { x: bx, y: by }.
     */
    screenToBoard(sx, sy, targetBz = 0) {
      const THREE = this.THREE;
      if (!this.camera || !THREE) {
        return { x: sx, y: sy };
      }
      if (!this._rayOrigin) {
        this._rayOrigin = new THREE.Vector3();
        this._rayDir = new THREE.Vector3();
      }
      this.camera.updateMatrixWorld();
      const ndcX = (sx / this.width) * 2 - 1;
      const ndcY = -(sy / this.height) * 2 + 1;

      this._rayOrigin.setFromMatrixPosition(this.camera.matrixWorld);
      this._rayDir.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(this._rayOrigin).normalize();

      const wz = targetBz * 0.88;
      if (Math.abs(this._rayDir.z) < 1e-5) {
        return { x: sx, y: sy };
      }
      const t = (wz - this._rayOrigin.z) / this._rayDir.z;
      if (t <= 0) {
        return { x: sx, y: sy };
      }
      const wx = this._rayOrigin.x + this._rayDir.x * t;
      const wy = this._rayOrigin.y + this._rayDir.y * t;
      const perspectiveComp = (900 - wz) / 900;
      const bx = wx / perspectiveComp + 340;
      const by = 320 + targetBz * 0.48 - wy / perspectiveComp;
      return {
        x: Math.max(0, Math.min(this.width, bx)),
        y: Math.max(0, Math.min(this.height, by))
      };
    }

    createStudioEnvironment(renderer) {
      const THREE = this.THREE;
      if (!THREE.PMREMGenerator) return null;
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0x140b07);

        const topDome = new THREE.Mesh(
          new THREE.SphereGeometry(100, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x6e4f2c, side: THREE.BackSide })
        );
        envScene.add(topDome);

        const warmStrip1 = new THREE.Mesh(
          new THREE.PlaneGeometry(80, 32),
          new THREE.MeshBasicMaterial({ color: 0xd9a85c, side: THREE.DoubleSide })
        );
        warmStrip1.position.set(-40, 65, 50);
        warmStrip1.lookAt(0, 0, 0);
        envScene.add(warmStrip1);

        const warmStrip2 = new THREE.Mesh(
          new THREE.PlaneGeometry(80, 32),
          new THREE.MeshBasicMaterial({ color: 0x8a4b1c, side: THREE.DoubleSide })
        );
        warmStrip2.position.set(45, -50, 60);
        warmStrip2.lookAt(0, 0, 0);
        envScene.add(warmStrip2);

        const rt = pmrem.fromScene(envScene, 0.04);
        pmrem.dispose();
        return rt.texture;
      } catch (e) {
        return null;
      }
    }

    initThreeScene() {
      const THREE = this.THREE;

      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      this.canvas = canvas;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
      });
      renderer.setSize(this.width, this.height, false);
      renderer.setPixelRatio(1.0);
      this.maxAnisotropy =
        renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function'
          ? Math.min(8, renderer.capabilities.getMaxAnisotropy())
          : 4;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.localClippingEnabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      renderer.setClearColor(0x090403, 1.0);
      this.renderer = renderer;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x090403);
      const envTex = this.createStudioEnvironment(renderer);
      if (envTex) {
        scene.environment = envTex;
      }
      this.scene = scene;
      this.scene.fog = new THREE.FogExp2(0x0c0604, 0.00036);

      const fovDeg = 47.0;
      const camera = new THREE.PerspectiveCamera(fovDeg, this.width / this.height, 10, 2600);
      camera.position.set(0, -425, 610);
      camera.lookAt(0, -18, 12);
      this.camera = camera;
      this.defaultFov = fovDeg;
      this.activeCameraPreset = 'playfield';
      this.activeDioramaTilt = 0.0;
      this.cameraCurrentPos = new THREE.Vector3(0, -425, 610);
      this.cameraCurrentTarget = new THREE.Vector3(0, -18, 12);
      this.cameraPresets = {
        playfield: {
          pos: new THREE.Vector3(0, -425, 610),
          target: new THREE.Vector3(0, -18, 12),
          fov: 47.0,
          dioramaTilt: 0.0,
          cssTilt: 'none',
          canvasTransform: 'none',
          canvasOrigin: '50% 50%',
          lightOffset: [0, 0]
        },
        angled_booth: {
          pos: new THREE.Vector3(-205, -455, 575),
          target: new THREE.Vector3(0, -18, 14),
          fov: 47.5,
          dioramaTilt: 0.0,
          cssTilt: 'none',
          canvasTransform: 'none',
          canvasOrigin: '50% 50%',
          lightOffset: [18, -65]
        },
        lip_closeup: {
          pos: new THREE.Vector3(0, -430, 385),
          target: new THREE.Vector3(0, -175, 4),
          fov: 38.5,
          dioramaTilt: 0.0,
          cssTilt: 'none',
          canvasTransform: 'none',
          canvasOrigin: '50% 50%',
          lightOffset: [0, -140]
        },
        peephole: {
          pos: new THREE.Vector3(0, 145, 365),
          target: new THREE.Vector3(0, 248, 20),
          fov: 38.0,
          dioramaTilt: 0.0,
          cssTilt: 'none',
          canvasTransform: 'none',
          canvasOrigin: '50% 50%',
          lightOffset: [0, 145]
        },
        theater: {
          pos: new THREE.Vector3(0, -525, 545),
          target: new THREE.Vector3(0, -14, 24),
          fov: 46.5,
          dioramaTilt: 0.0,
          cssTilt: 'none',
          canvasTransform: 'none',
          canvasOrigin: '50% 50%',
          lightOffset: [0, -80]
        }
      };
      this.mouseParallaxX = 0;
      this.mouseParallaxY = 0;
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('mousemove', (e) => {
          const vw = window.innerWidth || 1440;
          const vh = window.innerHeight || 900;
          this.mouseParallaxX = ((e.clientX / vw) - 0.5) * 2;
          this.mouseParallaxY = ((e.clientY / vh) - 0.5) * 2;
        });
        window.addEventListener('resize', () => {
          this.resize();
        });
      }

      // 1. Balanced Warm Occult Ambient & Hemisphere Lighting
      const ambient = new THREE.AmbientLight(0xf5dec2, 0.72);
      scene.add(ambient);

      const hemi = new THREE.HemisphereLight(0xffe8c2, 0x1c0d07, 0.62);
      hemi.position.set(0, 260, 500);
      scene.add(hemi);

      // 2. Main Overhead Collector Halogen Spotlight (casts crisp 3D shadows across shelf step & stacked coins without specular blowout)
      const mainSpot = new THREE.SpotLight(0xffefd2, 1.46, 2200, Math.PI * 0.46, 0.44, 0.78);
      mainSpot.position.set(-65, 240, 640);
      mainSpot.target.position.set(0, -35, 0);
      mainSpot.castShadow = true;
      mainSpot.shadow.mapSize.width = 2048;
      mainSpot.shadow.mapSize.height = 2048;
      this.shadowMapResolution = 2048;
      mainSpot.shadow.camera.near = 160;
      mainSpot.shadow.camera.far = 1150;
      mainSpot.shadow.radius = 2.8;
      mainSpot.shadow.bias = -0.00028;
      scene.add(mainSpot);
      scene.add(mainSpot.target);
      this.mainSpot = mainSpot;

      // 2b. 16-Bit HalfFloat Linear HDR RenderTarget & World-Space 3D SDFGI Irradiance Volume Texture
      if (THREE.WebGLRenderTarget) {
        this.hdrRenderTarget = new THREE.WebGLRenderTarget(this.width * 2, this.height * 2, {
          type: THREE.HalfFloatType || THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: true,
          stencilBuffer: false
        });
      }
      this.hdrHalfFloatEnabled = true;
      this.worldSdfGiEnabled = true;

      this.sdfGiGridSize = 32;
      this.sdfGiData = new Uint8Array(32 * 32 * 4);
      this.worldSdfGiTex = new THREE.DataTexture(
        this.sdfGiData,
        32,
        32,
        THREE.RGBAFormat
      );
      this.worldSdfGiTex.magFilter = THREE.LinearFilter;
      this.worldSdfGiTex.minFilter = THREE.LinearFilter;
      this.worldSdfGiTex.wrapS = THREE.ClampToEdgeWrapping;
      this.worldSdfGiTex.wrapT = THREE.ClampToEdgeWrapping;
      this.worldSdfGiTex.needsUpdate = true;

      this.sdfGiUniforms = {
        uWorldSdfGiTex: { value: this.worldSdfGiTex },
        uShelfWorldY: { value: 98.0 },
        uFurnacePulse: { value: 1.0 }
      };
      this.sdfGiFramesUpdated = 0;
      this.sdfGiInjectedMaterialsCount = 0;

      // 3. Front Grazing Rim Light (illuminates the 3D cylinder walls & reeded edges facing the player)
      const rimDir = new THREE.DirectionalLight(0xffd88a, 0.80);
      rimDir.position.set(85, -360, 440);
      scene.add(rimDir);
      this.rimDir = rimDir;

      // 3b. Warm Indirect Radiosity Bounce Light from the Gold Coin Bed onto Lower Shelf Face & Cabinet Walls
      this.goldBounceLight = new THREE.PointLight(0xffb84d, 1.15, 520, 1.6);
      this.goldBounceLight.position.set(0, -40, 95);
      scene.add(this.goldBounceLight);

      // 4. Left & Right House Furnace Molten Lava PointLights
      const leftFurnaceLight = new THREE.PointLight(0xff4518, 2.4, 320, 1.3);
      leftFurnaceLight.position.set(-250, -70, 48);
      scene.add(leftFurnaceLight);
      this.leftFurnaceLight = leftFurnaceLight;

      const rightFurnaceLight = new THREE.PointLight(0xff4518, 2.4, 320, 1.3);
      rightFurnaceLight.position.set(250, -70, 48);
      scene.add(rightFurnaceLight);
      this.rightFurnaceLight = rightFurnaceLight;

      // 5. Bottom Collection Hopper Emerald-Gold Light
      const chuteLight = new THREE.PointLight(0x42e66c, 1.6, 300, 1.4);
      chuteLight.position.set(0, -245, 60);
      scene.add(chuteLight);
      this.chuteLight = chuteLight;

      this.cabinetGroup = new THREE.Group();
      this.propsGroup = new THREE.Group();
      this.coinsGroup = new THREE.Group();
      scene.add(this.cabinetGroup);
      scene.add(this.propsGroup);
      scene.add(this.coinsGroup);

      this.coinNormalMap = this.createProceduralCoinNormalMap();
      this.reededBumpMap = this.createReededEdgeBumpMap();

      // Shared 3D Cylinder geometry for coins (axis along +Z before diorama tilt)
      this.baseCoinGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, false);
      this.baseCoinGeo.rotateX(Math.PI * 0.5);

      // Sleek struck numismatic bevel rim torus for top & bottom coin faces (no fat donut distortion)
      this.coinRimTorusGeo = new THREE.TorusGeometry(0.94, 0.036, 16, 48);

      // Shared 3D Fused Mythic Halo Torus & 3D Blast-Cap Fuse Badge Geometries
      this.mythicHaloTorusGeo = new THREE.TorusGeometry(1.0, 0.058, 14, 48);
      this.mythicHaloMat = new THREE.MeshStandardMaterial({
        color: 0x00ffe5,
        metalness: 0.35,
        roughness: 0.16,
        emissive: new THREE.Color(0x00e5c8),
        emissiveIntensity: 1.45
      });
      this.fuseBadgeGeo = new THREE.BoxGeometry(1.1, 0.65, 0.35);
    }

    injectWorldSdfGiShader(material) {
      if (!material) return material;
      if (!material.userData) material.userData = {};
      if (material.userData.sdfGiInjected) return material;
      material.userData.sdfGiInjected = true;
      this.sdfGiInjectedMaterialsCount = (this.sdfGiInjectedMaterialsCount || 0) + 1;

      const sdfUniforms = this.sdfGiUniforms;
      material.customProgramCacheKey = () => 'obol_sdfgi_v1';
      material.onBeforeCompile = (shader) => {
        if (!shader || !sdfUniforms) return;
        shader.uniforms.uWorldSdfGiTex = sdfUniforms.uWorldSdfGiTex;
        shader.uniforms.uShelfWorldY = sdfUniforms.uShelfWorldY;
        shader.uniforms.uFurnacePulse = sdfUniforms.uFurnacePulse;

        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vObolWorldPos;'
          )
          .replace(
            '#include <project_vertex>',
            '#include <project_vertex>\nvObolWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            [
              '#include <common>',
              'varying vec3 vObolWorldPos;',
              'uniform sampler2D uWorldSdfGiTex;',
              'uniform float uShelfWorldY;',
              'uniform float uFurnacePulse;'
            ].join('\n')
          )
          .replace(
            '#include <tonemapping_fragment>',
            [
              '// World-space 3D SDFGI irradiance & soft occlusion lookup in vWorldPosition (vObolWorldPos)',
              'vec2 obolSdfUv = clamp(vec2((vObolWorldPos.x + 340.0) / 680.0, (320.0 - vObolWorldPos.y) / 640.0), 0.0, 1.0);',
              'vec4 obolSdfC = texture2D(uWorldSdfGiTex, obolSdfUv);',
              'vec4 obolSdfN = (',
              '  texture2D(uWorldSdfGiTex, clamp(obolSdfUv + vec2(0.03125, 0.0), 0.0, 1.0)) +',
              '  texture2D(uWorldSdfGiTex, clamp(obolSdfUv - vec2(0.03125, 0.0), 0.0, 1.0)) +',
              '  texture2D(uWorldSdfGiTex, clamp(obolSdfUv + vec2(0.0, 0.03125), 0.0, 1.0)) +',
              '  texture2D(uWorldSdfGiTex, clamp(obolSdfUv - vec2(0.0, 0.03125), 0.0, 1.0))',
              ') * 0.25;',
              'float obolNeighborH = obolSdfN.r * 28.0;',
              'float obolHeightDiff = clamp((obolNeighborH - vObolWorldPos.z) / 14.0, 0.0, 1.0);',
              'float obolSdfAo = 1.0 - clamp((obolSdfN.a * 0.42 + obolSdfC.a * 0.22) * obolHeightDiff, 0.0, 0.20);',
              'float obolShelfCrease = 1.0 - 0.11 * (1.0 - smoothstep(0.0, 22.0, abs(vObolWorldPos.y - uShelfWorldY))) * clamp(1.0 - vObolWorldPos.z / 16.0, 0.0, 1.0);',
              'float obolFurnaceEdge = smoothstep(185.0, 265.0, abs(vObolWorldPos.x)) * uFurnacePulse;',
              'vec3 obolGoldGi = vec3(1.0, 0.78, 0.36) * (obolSdfN.b * 0.065 + obolSdfC.g * 0.03);',
              'vec3 obolFurnaceGi = vec3(1.0, 0.30, 0.09) * (obolFurnaceEdge * 0.07);',
              'gl_FragColor.rgb = gl_FragColor.rgb * (obolSdfAo * obolShelfCrease) + gl_FragColor.rgb * (obolGoldGi + obolFurnaceGi);',
              '#include <tonemapping_fragment>'
            ].join('\n')
          );
      };
      material.needsUpdate = true;
      return material;
    }

    updateWorldSdfGiVolume(physics, now = 0) {
      if (!this.sdfGiData || !this.worldSdfGiTex) return;
      const N = this.sdfGiGridSize || 32;
      const data = this.sdfGiData;
      data.fill(0);

      const shelfBoardY = (physics && physics.shelfY) || 222;
      const shelfWorld = this.boardToWorld(340, shelfBoardY, 10);
      const furnacePulse = 0.88 + Math.sin(now * 8.5) * 0.12;
      if (this.sdfGiUniforms) {
        this.sdfGiUniforms.uShelfWorldY.value = shelfWorld.y;
        this.sdfGiUniforms.uFurnacePulse.value = furnacePulse;
      }

      // 1. Side Furnace Radiance along columns x = 0..2 and x = 29..31
      for (let gy = 3; gy < N - 3; gy++) {
        for (let d = 0; d < 3; d++) {
          const falloff = (3 - d) / 3;
          const bEnergy = Math.min(255, Math.round(190 * falloff * furnacePulse));
          const leftIdx = (gy * N + d) * 4;
          data[leftIdx] = 28;
          data[leftIdx + 2] = bEnergy;

          const rightIdx = (gy * N + (N - 1 - d)) * 4;
          data[rightIdx] = 28;
          data[rightIdx + 2] = bEnergy;
        }
      }

      // 2. Upper Shelf Step Occlusion along physics.shelfY
      const shelfGy = Math.max(0, Math.min(N - 1, Math.floor((shelfBoardY / this.height) * N)));
      for (let gy = Math.max(0, shelfGy - 2); gy <= Math.min(N - 1, shelfGy + 1); gy++) {
        const isLipStep = gy === shelfGy || gy === shelfGy + 1;
        for (let gx = 3; gx < N - 3; gx++) {
          const idx = (gy * N + gx) * 4;
          if (gy <= shelfGy) {
            data[idx] = Math.max(data[idx], 138); // Elevated shelf height
            data[idx + 1] = Math.max(data[idx + 1], 96); // Metallic shelf deck
          }
          if (isLipStep) {
            data[idx + 3] = Math.max(data[idx + 3], 168); // Step contact occlusion
          }
        }
      }

      // 3. Rasterize Active 3D Coins into the 32x32 World SDF & Irradiance Grid
      const coins = (physics && physics.coins) || [];
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (!c) continue;
        const cx = typeof c.renderX === 'number' ? c.renderX : c.x;
        const cy = typeof c.renderY === 'number' ? c.renderY : c.y;
        const cz =
          (c.layer === 'shelf' ? 14.5 : 0) +
          (c.z || 0) +
          (c.stackLayer || 0) * 5.4 +
          (c.cannonZOffset || 0);
        const thickness = c.thickness || 5.8;

        const gxCenter = Math.max(0, Math.min(N - 1, Math.floor((cx / this.width) * N)));
        const gyCenter = Math.max(0, Math.min(N - 1, Math.floor((cy / this.height) * N)));

        const normH = Math.max(0, Math.min(1, (cz + thickness) / 28));
        const rByte = Math.round(normH * 255);
        const gByte = 215;
        const bByte =
          c.isFusedMythic || c.typeId === 'sovereign'
            ? 248
            : c.typeId === 'blood_crown'
            ? 220
            : 192;
        const aByte = 224;

        for (let dy = -1; dy <= 1; dy++) {
          const gy = gyCenter + dy;
          if (gy < 0 || gy >= N) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const gx = gxCenter + dx;
            if (gx < 0 || gx >= N) continue;
            const w = dx === 0 && dy === 0 ? 1.0 : dx === 0 || dy === 0 ? 0.62 : 0.36;
            const idx = (gy * N + gx) * 4;
            data[idx] = Math.max(data[idx], Math.round(rByte * w));
            data[idx + 1] = Math.min(255, data[idx + 1] + Math.round(gByte * w * 0.55));
            data[idx + 2] = Math.min(255, data[idx + 2] + Math.round(bByte * w * 0.60));
            data[idx + 3] = Math.min(255, data[idx + 3] + Math.round(aByte * w * 0.65));
          }
        }
      }

      this.worldSdfGiTex.needsUpdate = true;
      this.sdfGiFramesUpdated = (this.sdfGiFramesUpdated || 0) + 1;
    }

    initCannonWorld() {
      const CANNON = this.CANNON;
      this.cannonSubstepRateHz = 240;
      this.cannonSubstepsLastFrame = 0;
      this.cannonTotalSubsteps = 0;
      if (!CANNON) return;

      const world = new CANNON.World();
      world.gravity.set(0, -110, -450);
      world.allowSleep = false;
      if (world.solver) {
        world.solver.iterations = 16;
        world.solver.tolerance = 0.001;
      }

      const metalMat = new CANNON.Material('coinMetal');
      const bedMat = new CANNON.Material('baizeBed');
      const shelfMat = new CANNON.Material('ironShelf');

      world.addContactMaterial(
        new CANNON.ContactMaterial(metalMat, metalMat, {
          friction: 0.24,
          restitution: 0.22
        })
      );
      world.addContactMaterial(
        new CANNON.ContactMaterial(metalMat, bedMat, {
          friction: 0.32,
          restitution: 0.12
        })
      );
      world.addContactMaterial(
        new CANNON.ContactMaterial(metalMat, shelfMat, {
          friction: 0.38,
          restitution: 0.10
        })
      );

      this.cannonMetalMat = metalMat;
      this.cannonBedMat = bedMat;
      this.cannonShelfMat = shelfMat;

      const bedBody = new CANNON.Body({
        mass: 0,
        material: bedMat,
        shape: new CANNON.Box(new CANNON.Vec3(244, 210, 12))
      });
      bedBody.position.set(0, -10, -12);
      world.addBody(bedBody);

      const shelfBody = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.KINEMATIC,
        material: shelfMat,
        shape: new CANNON.Box(new CANNON.Vec3(236, 65, 12))
      });
      shelfBody.position.set(0, 165, 12);
      world.addBody(shelfBody);
      this.cannonShelfBody = shelfBody;

      this.cannonWorld = world;
    }

    createReededEdgeBumpMap() {
      const THREE = this.THREE;
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 32;
      const ctx = c.getContext('2d');
      for (let x = 0; x < 256; x++) {
        const v = Math.round(128 + 124 * Math.sin((x / 256) * Math.PI * 2 * 48));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, 0, 1, 32);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      return tex;
    }

    createProceduralCoinNormalMap() {
      const THREE = this.THREE;
      const size = 128;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(size, size);
      const data = img.data;
      const half = size * 0.5;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (x - half) / half;
          const dy = (y - half) / half;
          const r = Math.hypot(dx, dy);
          let nx = 0;
          let ny = 0;
          let nz = 1;

          if (r > 0.82 && r <= 1.0) {
            const angle = Math.atan2(dy, dx);
            const reed = Math.cos(angle * 44) * 0.38;
            const slope = (r - 0.91) * 5.8;
            nx = (dx / (r || 1)) * slope + Math.cos(angle) * reed;
            ny = -(dy / (r || 1)) * slope - Math.sin(angle) * reed;
          } else if (r > 0.70 && r <= 0.82) {
            const innerSlope = (0.76 - r) * 5.0;
            nx = (dx / (r || 1)) * innerSlope;
            ny = -(dy / (r || 1)) * innerSlope;
          }

          const idx = (y * size + x) * 4;
          data[idx] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
          data[idx + 2] = Math.max(128, Math.min(255, Math.round(nz * 255)));
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    }

    /**
     * Computes a real tangent-space normal map (THREE.CanvasTexture) via a 3x3 Sobel filter
     * over the luminance of srcCanvas blended with the radial dish/rim slope.
     */
    createReliefNormalMapFromCanvas(srcCanvas) {
      const THREE = this.THREE;
      if (!srcCanvas) return this.coinNormalMap;
      const w = srcCanvas.width || 512;
      const h = srcCanvas.height || 512;
      const srcCtx = srcCanvas.getContext('2d');
      const srcData = srcCtx.getImageData(0, 0, w, h).data;

      // Precompute normalized luminance heightfield [0..1]
      const lum = new Float32Array(w * h);
      for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
        const a = srcData[p + 3] / 255;
        lum[i] = ((0.299 * srcData[p] + 0.587 * srcData[p + 1] + 0.114 * srcData[p + 2]) / 255) * a;
      }

      const normCanvas = document.createElement('canvas');
      normCanvas.width = w;
      normCanvas.height = h;
      const normCtx = normCanvas.getContext('2d');
      const outImg = normCtx.createImageData(w, h);
      const out = outImg.data;

      const halfW = w * 0.5;
      const halfH = h * 0.5;
      const sobelStrength = 4.2;

      for (let y = 0; y < h; y++) {
        const ym1 = Math.max(0, y - 1) * w;
        const y0 = y * w;
        const yp1 = Math.min(h - 1, y + 1) * w;

        for (let x = 0; x < w; x++) {
          const xm1 = Math.max(0, x - 1);
          const xp1 = Math.min(w - 1, x + 1);

          // 3x3 Sobel horizontal & vertical luminance gradients
          const tl = lum[ym1 + xm1];
          const tc = lum[ym1 + x];
          const tr = lum[ym1 + xp1];
          const ml = lum[y0 + xm1];
          const mr = lum[y0 + xp1];
          const bl = lum[yp1 + xm1];
          const bc = lum[yp1 + x];
          const br = lum[yp1 + xp1];

          const dX = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
          const dY = (bl + 2 * bc + br) - (tl + 2 * tc + tr);

          let nx = -dX * sobelStrength;
          let ny = dY * sobelStrength;
          let nz = 1.0;

          // Blend with radial numismatic dish & struck bullion rim slope
          const dx = (x - halfW) / halfW;
          const dy = (y - halfH) / halfH;
          const rad = Math.hypot(dx, dy);

          if (rad > 0.86 && rad <= 1.0) {
            const angle = Math.atan2(dy, dx);
            const denticle = Math.cos(angle * 64) * 0.34;
            const rimSlope = (rad - 0.92) * 5.2;
            nx += (dx / (rad || 1)) * rimSlope + Math.cos(angle) * denticle;
            ny += -(dy / (rad || 1)) * rimSlope - Math.sin(angle) * denticle;
          } else if (rad > 0.73 && rad <= 0.81) {
            const dishSlope = (0.77 - rad) * 4.8;
            nx += (dx / (rad || 1)) * dishSlope;
            ny += -(dy / (rad || 1)) * dishSlope;
          }

          const invLen = 1 / Math.hypot(nx, ny, nz);
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;

          const idx = (y0 + x) * 4;
          out[idx] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
          out[idx + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
          out[idx + 2] = Math.max(128, Math.min(255, Math.round(nz * 255)));
          out[idx + 3] = 255;
        }
      }

      normCtx.putImageData(outImg, 0, 0);
      const tex = new THREE.CanvasTexture(normCanvas);
      tex.needsUpdate = true;
      return tex;
    }

    loadTexturesAndModels() {
      const THREE = this.THREE;
      const texLoader = new THREE.TextureLoader();

      try {
        texLoader.load('assets/models/coin-normal.png', (normTex) => {
          this.coinNormalMap = normTex;
          for (const mat of this.tokenMaterials.values()) {
            if (Array.isArray(mat)) {
              if (mat[1] && !(mat[1].userData && mat[1].userData.hasCustomReliefNormal)) {
                mat[1].normalMap = normTex;
                mat[1].needsUpdate = true;
              }
              if (mat[2] && !(mat[2].userData && mat[2].userData.hasCustomReliefNormal)) {
                mat[2].normalMap = normTex;
                mat[2].needsUpdate = true;
              }
            }
          }
        });
      } catch (e) {}

      try {
        texLoader.load('assets/art/collector-automaton.png', (tex) => {
          tex.flipY = false;
          if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
          this.collectorAlbedoTex = tex;
          if (this.collectorBustMesh) {
            this.collectorBustMesh.traverse((n) => {
              if (n.isMesh && n.material && n.userData && n.userData.isSculptBust) {
                n.material.map = tex;
                n.material.emissiveMap = tex;
                n.material.color.setHex(0xffffff);
                n.material.emissive.setHex(0xffe0b8);
                n.material.emissiveIntensity = 0.52;
                n.material.metalness = 0.22;
                n.material.roughness = 0.42;
                n.material.needsUpdate = true;
              }
            });
          }
        });
        texLoader.load('assets/art/manometer-dial-face.png', (dialTex) => {
          if ('colorSpace' in dialTex && THREE.SRGBColorSpace) dialTex.colorSpace = THREE.SRGBColorSpace;
          this.manometerDialTex = dialTex;
          if (this.manometerDialMat) {
            this.manometerDialMat.map = dialTex;
            this.manometerDialMat.color.setHex(0xffffff);
            this.manometerDialMat.emissiveMap = dialTex;
            this.manometerDialMat.emissive.setHex(0xffe0b2);
            this.manometerDialMat.emissiveIntensity = 0.35;
            this.manometerDialMat.needsUpdate = true;
          }
        });
        texLoader.load('assets/models/collector-normal.png', (normTex) => {
          normTex.flipY = false;
          this.collectorNormalTex = normTex;
          if (this.collectorBustMesh) {
            this.collectorBustMesh.traverse((n) => {
              if (n.isMesh && n.material && n.userData && n.userData.isSculptBust) {
                n.material.normalMap = normTex;
                n.material.needsUpdate = true;
              }
            });
          }
        });
      } catch (e) {}

      if (THREE.GLTFLoader) {
        const gltfLoader = new THREE.GLTFLoader();
        const modelList = [
          { key: 'coin', url: 'assets/models/coin-obol.glb' },
          { key: 'collector', url: 'assets/models/collector-bust.glb' },
          { key: 'collector_jaw', url: 'assets/models/collector-animatronic-jaw.glb' },
          { key: 'collector_claw', url: 'assets/models/collector-skeletal-claw.glb' },
          { key: 'chest', url: 'assets/models/reliquary-chest.glb' },
          { key: 'bumper', url: 'assets/models/bumper-capstan.glb' },
          { key: 'peg', url: 'assets/models/pachinko-peg.glb' },
          { key: 'guillotine', url: 'assets/models/guillotine-blade.glb' },
          { key: 'pillory_assembly', url: 'assets/models/guillotine-pillory-assembly.glb' },
          { key: 'contraband_rack', url: 'assets/models/contraband-relic-rack.glb' },
          { key: 'arcade_button', url: 'assets/models/arcade-pushbutton.glb' }
        ];

        for (const item of modelList) {
          try {
            gltfLoader.load(
              item.url,
              (gltf) => {
                if (!gltf || !gltf.scene) return;
                this.glbScenes[item.key] = gltf.scene;
                gltf.scene.traverse((child) => {
                  if (child.isMesh && child.geometry && !this.glbGeometries[item.key]) {
                    this.glbGeometries[item.key] = child.geometry;
                  }
                });
                if (item.key === 'collector') {
                  this.mountCollectorBust3D(gltf.scene);
                } else if (item.key === 'collector_jaw') {
                  this.mountCollectorJawGLB(gltf.scene);
                } else if (item.key === 'collector_claw') {
                  this.mountCollectorClawGLB(gltf.scene);
                } else if (item.key === 'guillotine') {
                  this.mountGuillotineBlade3D(gltf.scene);
                } else if (item.key === 'pillory_assembly' || item.key === 'contraband_rack') {
                  this.mountOuterBoothWingGLBs();
                }
              },
              undefined,
              () => {}
            );
          } catch (e) {}
        }
      }
    }

    createProceduralCollectorBust3D() {
      const THREE = this.THREE;
      const group = new THREE.Group();

      const cowlMat = new THREE.MeshStandardMaterial({
        color: 0x3b2212,
        metalness: 0.72,
        roughness: 0.32,
        emissive: new THREE.Color(0x180904),
        emissiveIntensity: 0.25
      });
      const skullMat = new THREE.MeshStandardMaterial({
        color: 0xd8a258,
        metalness: 0.80,
        roughness: 0.22,
        emissive: new THREE.Color(0x3d2008),
        emissiveIntensity: 0.30
      });
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xff3b14,
        metalness: 0.15,
        roughness: 0.12,
        emissive: new THREE.Color(0xff2200),
        emissiveIntensity: 3.4
      });

      const hood = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 20), cowlMat);
      hood.scale.set(1.08, 1.18, 0.88);
      group.add(hood);

      const cranium = new THREE.Mesh(new THREE.SphereGeometry(19, 24, 20), skullMat);
      cranium.position.set(0, 2, 8);
      cranium.scale.set(0.92, 1.05, 0.90);
      group.add(cranium);

      const jaw = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 14), skullMat);
      jaw.position.set(0, -12, 10);
      group.add(jaw);

      const eyeGeo = new THREE.SphereGeometry(3.4, 16, 12);
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-6.8, 3, 23);
      leftEye.userData = { isEye: true };
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(6.8, 3, 23);
      rightEye.userData = { isEye: true };
      group.add(leftEye);
      group.add(rightEye);

      return group;
    }

    createCollectorBustAlphaMap() {
      const THREE = this.THREE;
      if (this._collectorAlphaTex) return this._collectorAlphaTex;
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 256, 256);

      // Strict circular porthole mask so 100% of CollectorOrganicReliefBust stays inside the Ornate Cast-Iron & Brass Cowl
      const grad = ctx.createRadialGradient(128, 128, 58, 128, 128, 96);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.80, '#ffffff');
      grad.addColorStop(0.94, '#333333');
      grad.addColorStop(1.0, '#000000');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(128, 128, 96, 0, Math.PI * 2);
      ctx.fill();

      const tex = new THREE.CanvasTexture(c);
      tex.flipY = false;
      tex.needsUpdate = true;
      this._collectorAlphaTex = tex;
      return tex;
    }

    mountCollectorBust3D(sceneRoot) {
      return this.buildCollectorShadowbox(sceneRoot);
    }

    buildCollectorShadowbox(sceneRoot) {
      const THREE = this.THREE;
      if (!this.cabinetGroup) return;
      if (this.collector3DGroup) {
        this.cabinetGroup.remove(this.collector3DGroup);
      }

      const group = new THREE.Group();
      const metalBump = this.createBrushedMetalBumpMap();

      const castIronMat = new THREE.MeshStandardMaterial({
        color: 0x261811,
        metalness: 0.78,
        roughness: 0.36,
        bumpMap: metalBump,
        bumpScale: 1.15,
        emissive: new THREE.Color(0x140804),
        emissiveIntensity: 0.22
      });
      const jawBronzeMat = new THREE.MeshStandardMaterial({
        color: 0x9e682c,
        metalness: 0.80,
        roughness: 0.28,
        bumpMap: metalBump,
        bumpScale: 0.9,
        emissive: new THREE.Color(0x281304),
        emissiveIntensity: 0.18
      });
      const polishedBrassMat = new THREE.MeshStandardMaterial({
        color: 0xe2a844,
        metalness: 0.84,
        roughness: 0.20,
        bumpMap: metalBump,
        bumpScale: 0.8,
        emissive: new THREE.Color(0x422406),
        emissiveIntensity: 0.24
      });
      const jawToothMat = new THREE.MeshStandardMaterial({
        color: 0xc89a58,
        metalness: 0.58,
        roughness: 0.32,
        emissive: new THREE.Color(0x261405),
        emissiveIntensity: 0.12
      });
      const copperManifoldMat = new THREE.MeshStandardMaterial({
        color: 0xc86d3b,
        metalness: 0.82,
        roughness: 0.24,
        bumpMap: metalBump,
        bumpScale: 0.85,
        emissive: new THREE.Color(0x381506),
        emissiveIntensity: 0.22
      });
      const chromeDamperMat = new THREE.MeshStandardMaterial({
        color: 0xdce4ec,
        metalness: 0.92,
        roughness: 0.14,
        emissive: new THREE.Color(0x241e18),
        emissiveIntensity: 0.15
      });

      // 1. Recessed Shadowbox Mahogany & Cast-Iron Back Wall Panel + Cornice Moulding
      const shadowboxWall = new THREE.Mesh(
        new THREE.BoxGeometry(196, 114, 8),
        new THREE.MeshStandardMaterial({
          color: 0x160b07,
          metalness: 0.42,
          roughness: 0.68,
          bumpMap: metalBump,
          bumpScale: 0.9,
          emissive: new THREE.Color(0x180904),
          emissiveIntensity: 0.25
        })
      );
      shadowboxWall.position.set(0, 2, -18);
      shadowboxWall.receiveShadow = true;
      group.add(shadowboxWall);

      for (const cy of [-52, 56]) {
        const cornice = new THREE.Mesh(new THREE.BoxGeometry(204, 6, 14), castIronMat);
        cornice.position.set(0, cy, -13);
        group.add(cornice);
        const corniceTrim = new THREE.Mesh(new THREE.BoxGeometry(202, 2.2, 15), polishedBrassMat);
        corniceTrim.position.set(0, cy + (cy > 0 ? -2.2 : 2.2), -12.5);
        group.add(corniceTrim);
      }

      // Deep Obsidian Shrine Well behind the Collector Portrait
      const backDisk = new THREE.Mesh(
        new THREE.CylinderGeometry(45, 45, 6, 48),
        new THREE.MeshStandardMaterial({
          color: 0x0b0503,
          metalness: 0.38,
          roughness: 0.72,
          emissive: new THREE.Color(0x1c0a04),
          emissiveIntensity: 0.28
        })
      );
      backDisk.rotation.x = Math.PI * 0.5;
      backDisk.position.set(0, 2, -12);
      group.add(backDisk);

      // 2. Collector Relief Portrait Recessed Inside Porthole
      const alphaMask = this.createCollectorBustAlphaMap();
      if (sceneRoot) {
        const clone = sceneRoot.clone(true);
        let foundSculpt = false;
        clone.traverse((n) => {
          if (!n.isMesh) return;
          const nm = String(n.name || '');
          const matNm = String((n.material && n.material.name) || '');
          if (
            nm === 'CollectorOrganicReliefBust' ||
            nm === 'Grid' ||
            matNm === 'CollectorZBrushSculptPBR'
          ) {
            foundSculpt = true;
            n.visible = true;
            n.castShadow = false;
            n.receiveShadow = true;
            n.userData = { isSculptBust: true };
            if (n.geometry && n.geometry.attributes && n.geometry.attributes.color) {
              n.geometry.deleteAttribute('color');
            }
            const mat = new THREE.MeshStandardMaterial();
            mat.vertexColors = false;
            mat.color.setHex(0xffffff);
            if (this.collectorAlbedoTex) {
              mat.map = this.collectorAlbedoTex;
              mat.emissiveMap = this.collectorAlbedoTex;
            }
            if (this.collectorNormalTex) {
              mat.normalMap = this.collectorNormalTex;
              mat.normalScale = new THREE.Vector2(1.45, 1.45);
            }
            mat.alphaMap = alphaMask;
            mat.transparent = true;
            mat.alphaTest = 0.08;
            mat.metalness = 0.22;
            mat.roughness = 0.42;
            mat.emissive = new THREE.Color(0xffe0b8);
            if (mat.map) mat.emissiveMap = mat.map;
            mat.emissiveIntensity = 0.52;
            n.material = mat;
          } else if (nm.startsWith('CollarGear') || nm === 'CollectorCollarCogwheel') {
            n.visible = true;
            n.material = polishedBrassMat;
          } else {
            n.visible = false;
          }
        });

        if (foundSculpt) {
          clone.scale.set(42, 42, 42);
          clone.position.set(0, 1.8, -5.0);
          group.add(clone);
          this.collectorBustMesh = clone;
        } else {
          const fallbackBust = this.createProceduralCollectorBust3D();
          group.add(fallbackBust);
          this.collectorBustMesh = fallbackBust;
        }
      } else {
        const fallbackBust = this.createProceduralCollectorBust3D();
        group.add(fallbackBust);
        this.collectorBustMesh = fallbackBust;
      }

      // 3. Ornate Cast-Iron & Riveted Brass Ocular Shadowbox Cowl (THREE.TorusGeometry(2.15, 0.22, 16, 48) scaled to cabinet units + 12 brass perimeter rivets)
      const cowlGroup = new THREE.Group();
      cowlGroup.position.set(0, 2, 0);

      const outerIronCowl = new THREE.Mesh(
        new THREE.TorusGeometry(45.5, 5.2, 20, 48),
        castIronMat
      );
      outerIronCowl.position.set(0, 0, -1.5);
      outerIronCowl.castShadow = true;
      outerIronCowl.receiveShadow = true;
      cowlGroup.add(outerIronCowl);

      // Inner beveled brass porthole ring physically overlapping the outer perimeter of collectorBustMesh (zero raw circular edge)
      const innerBrassCowl = new THREE.Mesh(
        new THREE.TorusGeometry(40.2, 4.4, 20, 48),
        polishedBrassMat
      );
      innerBrassCowl.position.set(0, 0, 1.6);
      innerBrassCowl.castShadow = true;
      innerBrassCowl.receiveShadow = true;
      cowlGroup.add(innerBrassCowl);

      // 12 Raised Hex Brass Perimeter Rivets around the Ocular Shadowbox Cowl
      const cowlRivetGeo = new THREE.CylinderGeometry(2.0, 2.0, 4.0, 6);
      cowlRivetGeo.rotateX(Math.PI * 0.5);
      const cowlRivetDomeGeo = new THREE.SphereGeometry(1.75, 10, 8);
      for (let r = 0; r < 12; r++) {
        const ang = (r / 12) * Math.PI * 2;
        const rx = Math.cos(ang) * 44.5;
        const ry = Math.sin(ang) * 44.5;
        const rivet = new THREE.Mesh(cowlRivetGeo, polishedBrassMat);
        rivet.position.set(rx, ry, 2.4);
        rivet.castShadow = true;
        cowlGroup.add(rivet);

        const dome = new THREE.Mesh(cowlRivetDomeGeo, polishedBrassMat);
        dome.position.set(rx, ry, 4.2);
        cowlGroup.add(dome);
      }

      group.add(cowlGroup);
      this.collectorCowlGroup = cowlGroup;

      // Balanced warm spotlighting inside the shadowbox (no white blow-out on teeth or dials)
      const peepKeyLight = new THREE.PointLight(0xffb454, 1.45, 240, 1.35);
      peepKeyLight.position.set(0, 16, 68);
      group.add(peepKeyLight);

      const peepRimLight = new THREE.PointLight(0xff3814, 1.35, 180, 1.35);
      peepRimLight.position.set(0, -18, 38);
      group.add(peepRimLight);

      // Subtle Recessed Ruby-Amber Ocular Pupil Glints aligned with the sculpted clockwork eyes
      const ocularMat = new THREE.MeshStandardMaterial({
        color: 0xff4418,
        metalness: 0.2,
        roughness: 0.1,
        transparent: true,
        opacity: 0.62,
        emissive: new THREE.Color(0xff2804),
        emissiveIntensity: 1.45
      });
      this.collectorOcularMat = ocularMat;
      const ocularGeo = new THREE.SphereGeometry(0.85, 14, 10);
      for (const ox of [-5.8, 5.8]) {
        const lens = new THREE.Mesh(ocularGeo, ocularMat);
        lens.position.set(ox, 13.8, 2.8);
        group.add(lens);
      }

      // 4. Recessed Dark Weathered-Bronze & Gunmetal Cheek Pistons & Hinges (Unobstructed Portrait Skull Teeth)
      const jawGroup = new THREE.Group();
      this.collectorJawBaseY = -2.8;
      jawGroup.position.set(0, this.collectorJawBaseY, 4.5);

      const damperDarkMat = new THREE.MeshStandardMaterial({
        color: 0x24170f,
        metalness: 0.80,
        roughness: 0.38,
        emissive: new THREE.Color(0x0f0603),
        emissiveIntensity: 0.14
      });
      const damperRodDarkMat = new THREE.MeshStandardMaterial({
        color: 0x523920,
        metalness: 0.82,
        roughness: 0.30,
        emissive: new THREE.Color(0x160b04),
        emissiveIntensity: 0.16
      });
      const damperSleeveGeo = new THREE.CylinderGeometry(1.5, 1.8, 9.5, 14);
      const damperRodGeo = new THREE.CylinderGeometry(0.85, 0.85, 14.0, 12);
      const damperCoilGeo = new THREE.TorusGeometry(1.65, 0.28, 8, 16);
      damperCoilGeo.rotateX(Math.PI * 0.5);
      const cowlMountGeo = new THREE.SphereGeometry(2.2, 12, 10);
      const hingeGeo = new THREE.CylinderGeometry(2.1, 2.1, 4.8, 14);
      hingeGeo.rotateZ(Math.PI * 0.5);

      for (const side of [-1, 1]) {
        const damperGroup = new THREE.Group();
        damperGroup.position.set(side * 22.5, -2.5, -4.8);
        damperGroup.rotation.z = side * 0.38;
        damperGroup.rotation.x = -0.52;
        damperGroup.rotation.y = -side * 0.28;

        const sleeve = new THREE.Mesh(damperSleeveGeo, damperDarkMat);
        sleeve.position.set(0, -2.2, 0);
        sleeve.castShadow = true;
        damperGroup.add(sleeve);

        const rod = new THREE.Mesh(damperRodGeo, damperRodDarkMat);
        rod.position.set(0, 1.2, 0);
        damperGroup.add(rod);

        for (let c = 0; c < 3; c++) {
          const coil = new THREE.Mesh(damperCoilGeo, jawBronzeMat);
          coil.position.set(0, 1.2 + c * 1.6, 0);
          damperGroup.add(coil);
        }

        jawGroup.add(damperGroup);

        const hinge = new THREE.Mesh(hingeGeo, damperDarkMat);
        hinge.position.set(side * 20.0, -4.5, -3.5);
        jawGroup.add(hinge);

        const cowlMount = new THREE.Mesh(cowlMountGeo, castIronMat);
        cowlMount.position.set(side * 25.5, 3.8, -8.5);
        jawGroup.add(cowlMount);
      }

      group.add(jawGroup);
      this.collectorJawPivot = jawGroup;
      this.collectorJaw3D = jawGroup;
      this.hasArticulatedCollectorJaw3D = true;

      // 5. Heavy Riveted Antique-Brass & Dark-Mahogany Horizontal Sill Beam + Twin Sculpted 3D Armored Skeletal Claw Hands
      const sillMahoganyMat = new THREE.MeshStandardMaterial({
        color: 0x2b150b,
        metalness: 0.24,
        roughness: 0.58,
        bumpMap: metalBump,
        bumpScale: 0.75,
        emissive: new THREE.Color(0x120602),
        emissiveIntensity: 0.18
      });
      const sillBeamGroup = new THREE.Group();
      sillBeamGroup.position.set(0, -26.5, 14.0);

      // Core dark-mahogany horizontal structural beam
      const mahoganyTimber = new THREE.Mesh(
        new THREE.BoxGeometry(168, 12.5, 20),
        sillMahoganyMat
      );
      mahoganyTimber.position.set(0, -2.0, -2.0);
      mahoganyTimber.castShadow = true;
      mahoganyTimber.receiveShadow = true;
      sillBeamGroup.add(mahoganyTimber);

      // Upper beveled antique-brass wear plate
      const topBrassPlate = new THREE.Mesh(
        new THREE.BoxGeometry(172, 3.2, 22),
        polishedBrassMat
      );
      topBrassPlate.position.set(0, 4.4, -1.0);
      topBrassPlate.castShadow = true;
      topBrassPlate.receiveShadow = true;
      sillBeamGroup.add(topBrassPlate);

      // Front cast-iron & brass riveted fascia bar
      const frontFasciaPlate = new THREE.Mesh(
        new THREE.BoxGeometry(172, 9.2, 3.2),
        castIronMat
      );
      frontFasciaPlate.position.set(0, -2.2, 7.8);
      frontFasciaPlate.castShadow = true;
      sillBeamGroup.add(frontFasciaPlate);

      const frontBrassTrim = new THREE.Mesh(
        new THREE.BoxGeometry(174, 2.2, 3.8),
        polishedBrassMat
      );
      frontBrassTrim.position.set(0, -6.8, 7.6);
      sillBeamGroup.add(frontBrassTrim);

      // 14 Raised Brass Rivets across the front of the Horizontal Sill Beam
      const sillRivetGeo = new THREE.SphereGeometry(1.45, 10, 8);
      for (let sr = 0; sr < 14; sr++) {
        const srx = -71.5 + sr * 11.0;
        const sRivet = new THREE.Mesh(sillRivetGeo, polishedBrassMat);
        sRivet.position.set(srx, -2.0, 9.5);
        sillBeamGroup.add(sRivet);
      }

      // Cylindrical Antique-Brass Claw-Grip Bar on the top-front edge
      const sillBarGeo = new THREE.CylinderGeometry(3.8, 3.8, 158, 18);
      sillBarGeo.rotateZ(Math.PI * 0.5);
      const sillBarMesh = new THREE.Mesh(sillBarGeo, polishedBrassMat);
      sillBarMesh.position.set(0, 4.2, 6.2);
      sillBarMesh.castShadow = true;
      sillBarMesh.receiveShadow = true;
      sillBeamGroup.add(sillBarMesh);

      for (const side of [-1, 1]) {
        const sillBracket = new THREE.Mesh(new THREE.BoxGeometry(11, 16, 24), castIronMat);
        sillBracket.position.set(side * 82, -2.0, -1.0);
        sillBracket.castShadow = true;
        sillBeamGroup.add(sillBracket);

        const corbelTrim = new THREE.Mesh(new THREE.BoxGeometry(12.5, 4.5, 25), polishedBrassMat);
        corbelTrim.position.set(side * 82, 4.2, -0.5);
        sillBeamGroup.add(corbelTrim);
      }
      group.add(sillBeamGroup);

      this.collectorFingerGroups3D = [];
      const clawPalmGeo = new THREE.BoxGeometry(15.2, 8.2, 10.2);
      const dorsalPlateGeo = new THREE.BoxGeometry(13.4, 6.8, 3.4);
      const dorsalRivetGeo = new THREE.SphereGeometry(0.82, 8, 8);
      const knuckleBarGeo = new THREE.CylinderGeometry(1.55, 1.55, 14.8, 12);
      knuckleBarGeo.rotateZ(Math.PI * 0.5);
      const knuckleSphereGeo = new THREE.SphereGeometry(2.05, 14, 12);
      const proximalGeo = new THREE.CylinderGeometry(1.42, 1.22, 5.2, 10);
      const jointSphereGeo = new THREE.SphereGeometry(1.38, 10, 10);
      const middlePhalanxGeo = new THREE.CylinderGeometry(1.22, 1.02, 4.8, 10);
      const distalJointGeo = new THREE.SphereGeometry(1.16, 10, 10);
      const distalClawGeo = new THREE.ConeGeometry(1.18, 5.8, 10);
      const forearmRibGeo = new THREE.TorusGeometry(4.75, 0.68, 10, 20);
      forearmRibGeo.rotateX(Math.PI * 0.5);

      const buildClawHand = (side) => {
        const handGroup = new THREE.Group();
        handGroup.position.set(side * 34.5, -19.5, 20.5);
        handGroup.rotation.z = side * 0.08;
        handGroup.rotation.y = -side * 0.16;

        // Ribbed Dark-Bronze & Chrome Hydraulic Forearm Piston Rod extending cleanly into upper-outer shadowbox corners
        const forearmGroup = new THREE.Group();
        forearmGroup.position.set(side * 7.8, 11.5, -12.5);
        forearmGroup.rotation.x = Math.PI * 0.34;
        forearmGroup.rotation.z = -side * 0.38;

        const innerPistonRod = new THREE.Mesh(
          new THREE.CylinderGeometry(2.6, 2.6, 28, 14),
          chromeDamperMat
        );
        innerPistonRod.castShadow = true;
        forearmGroup.add(innerPistonRod);

        const outerActuatorBarrel = new THREE.Mesh(
          new THREE.CylinderGeometry(4.3, 4.9, 17, 16),
          castIronMat
        );
        outerActuatorBarrel.position.set(0, 3.2, 0);
        outerActuatorBarrel.castShadow = true;
        forearmGroup.add(outerActuatorBarrel);

        for (let r = 0; r < 4; r++) {
          const rib = new THREE.Mesh(forearmRibGeo, polishedBrassMat);
          rib.position.set(0, -3.2 + r * 4.2, 0);
          forearmGroup.add(rib);
        }

        const auxHydraulicTube = new THREE.Mesh(
          new THREE.CylinderGeometry(1.05, 1.05, 24, 10),
          chromeDamperMat
        );
        auxHydraulicTube.position.set(side * 3.8, 1.0, 2.4);
        forearmGroup.add(auxHydraulicTube);

        handGroup.add(forearmGroup);

        // Riveted Brass Wrist Cuff with 6 perimeter bolts
        const wristCuffGroup = new THREE.Group();
        wristCuffGroup.position.set(side * 1.4, 3.8, -4.2);
        wristCuffGroup.rotation.x = Math.PI * 0.36;
        wristCuffGroup.rotation.y = side * 0.22;

        const wristCuff = new THREE.Mesh(
          new THREE.TorusGeometry(5.8, 1.45, 12, 24),
          polishedBrassMat
        );
        wristCuffGroup.add(wristCuff);

        for (let w = 0; w < 6; w++) {
          const wa = (w / 6) * Math.PI * 2;
          const wrivet = new THREE.Mesh(dorsalRivetGeo, castIronMat);
          wrivet.position.set(Math.cos(wa) * 6.8, Math.sin(wa) * 6.8, 0.5);
          wristCuffGroup.add(wrivet);
        }
        handGroup.add(wristCuffGroup);

        // Sculpted Gauntlet Chassis + Beveled Brass Dorsal Armor Backplate
        const palm = new THREE.Mesh(clawPalmGeo, jawBronzeMat);
        palm.position.set(0, 0.5, -1.0);
        palm.castShadow = true;
        palm.receiveShadow = true;
        handGroup.add(palm);

        const dorsalPlate = new THREE.Mesh(dorsalPlateGeo, polishedBrassMat);
        dorsalPlate.position.set(0, 2.0, 2.8);
        dorsalPlate.rotation.x = 0.22;
        dorsalPlate.castShadow = true;
        handGroup.add(dorsalPlate);

        for (let dr = 0; dr < 4; dr++) {
          const dRivet = new THREE.Mesh(dorsalRivetGeo, castIronMat);
          dRivet.position.set(-4.5 + dr * 3.0, 3.4, 4.4);
          handGroup.add(dRivet);
        }

        const thumbGuard = new THREE.Mesh(new THREE.BoxGeometry(2.8, 6.5, 8.2), castIronMat);
        thumbGuard.position.set(-side * 7.8, 0.2, -0.5);
        handGroup.add(thumbGuard);

        // Knuckle Axle Bar + 4 Raised Spherical Brass Knuckle Joints
        const knuckleBar = new THREE.Mesh(knuckleBarGeo, polishedBrassMat);
        knuckleBar.position.set(0, -2.6, 4.2);
        handGroup.add(knuckleBar);

        for (let f = 0; f < 4; f++) {
          const fx = -4.8 + f * 3.2;
          const knuckleSphere = new THREE.Mesh(knuckleSphereGeo, polishedBrassMat);
          knuckleSphere.position.set(fx, -2.4, 4.6);
          knuckleSphere.castShadow = true;
          handGroup.add(knuckleSphere);

          const fingerPivot = new THREE.Group();
          fingerPivot.position.set(fx, -2.6, 4.6);

          // 1. Proximal Phalanx extending forward over the top of the sill bar
          const prox = new THREE.Mesh(proximalGeo, jawBronzeMat);
          prox.position.set(0, -2.0, 1.8);
          prox.rotation.x = 0.62;
          prox.castShadow = true;
          fingerPivot.add(prox);

          const midJoint = new THREE.Mesh(jointSphereGeo, polishedBrassMat);
          midJoint.position.set(0, -4.1, 3.3);
          fingerPivot.add(midJoint);

          // 2. Middle Phalanx curving downward across the front of the sill bar
          const midPhalanx = new THREE.Mesh(middlePhalanxGeo, castIronMat);
          midPhalanx.position.set(0, -6.2, 3.8);
          midPhalanx.rotation.x = 0.18;
          midPhalanx.castShadow = true;
          fingerPivot.add(midPhalanx);

          const distJoint = new THREE.Mesh(distalJointGeo, polishedBrassMat);
          distJoint.position.set(0, -8.4, 4.1);
          fingerPivot.add(distJoint);

          // 3. Distal Curved Talon wrapping downward & inward under the front of the brass sill bar
          const talon = new THREE.Mesh(distalClawGeo, polishedBrassMat);
          talon.position.set(0, -10.8, 3.0);
          talon.rotation.x = Math.PI * 1.12;
          talon.castShadow = true;
          fingerPivot.add(talon);

          handGroup.add(fingerPivot);
          this.collectorFingerGroups3D.push(fingerPivot);
        }
        return handGroup;
      };

      this.collectorLeftHand3D = buildClawHand(-1);
      this.collectorRightHand3D = buildClawHand(1);
      group.add(this.collectorLeftHand3D);
      group.add(this.collectorRightHand3D);
      this.hasCollectorClawHands3D = true;

      if (this.glbScenes && this.glbScenes.collector_jaw) {
        this.mountCollectorJawGLB(this.glbScenes.collector_jaw);
      }
      if (this.glbScenes && this.glbScenes.collector_claw) {
        this.mountCollectorClawGLB(this.glbScenes.collector_claw);
      }

      // 6. Twin Flanking Victorian 0-300 PSI Bourdon Steam Manometers (peepholeGaugesGroup) + Copper Steam Manifold Pipes
      const peepholeGaugesGroup = new THREE.Group();
      const peepDialMat = this.manometerDialMat || new THREE.MeshStandardMaterial({
        color: this.manometerDialTex ? 0xffffff : 0xf5e6c8,
        map: this.manometerDialTex || null,
        metalness: 0.12,
        roughness: 0.36,
        emissive: new THREE.Color(0xffe0b2),
        emissiveMap: this.manometerDialTex || null,
        emissiveIntensity: 0.22
      });
      const peepNeedleMat = new THREE.MeshStandardMaterial({
        color: 0xff3b1f,
        emissive: new THREE.Color(0xff2a08),
        emissiveIntensity: 1.35
      });

      const manifoldBranchGeo = new THREE.CylinderGeometry(2.6, 2.6, 24, 14);
      manifoldBranchGeo.rotateZ(Math.PI * 0.5);
      const manifoldFlangeGeo = new THREE.CylinderGeometry(4.8, 4.8, 3.2, 14);
      manifoldFlangeGeo.rotateZ(Math.PI * 0.5);
      const riserFlangeGeo = new THREE.CylinderGeometry(5.2, 5.2, 3.4, 14);
      const elbowGeo = new THREE.SphereGeometry(3.4, 12, 10);

      for (const side of [-1, 1]) {
        const gGroup = new THREE.Group();
        gGroup.position.set(side * 65, 2, 10);
        gGroup.rotation.y = -side * 0.16;

        // Vertical copper steam riser pipe + bolted brass flanges
        const sPipe = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 84, 14), copperManifoldMat);
        sPipe.position.set(0, -4, -4.5);
        sPipe.castShadow = true;
        gGroup.add(sPipe);

        for (const fy of [-32, -16, 24]) {
          const rFlange = new THREE.Mesh(riserFlangeGeo, polishedBrassMat);
          rFlange.position.set(0, fy, -4.5);
          gGroup.add(rFlange);
        }

        // Upper & lower horizontal copper steam manifold pipes connecting the Bourdon gauge into the shadowbox cowl & wall
        for (const by of [-16, 16]) {
          const branchPipe = new THREE.Mesh(manifoldBranchGeo, copperManifoldMat);
          branchPipe.position.set(-side * 11, by, -5.5);
          branchPipe.castShadow = true;
          gGroup.add(branchPipe);

          const wallFlange = new THREE.Mesh(manifoldFlangeGeo, castIronMat);
          wallFlange.position.set(-side * 20, by, -6.5);
          gGroup.add(wallFlange);

          const elbow = new THREE.Mesh(elbowGeo, polishedBrassMat);
          elbow.position.set(0, by, -5.0);
          gGroup.add(elbow);
        }

        const drum = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.5, 6.0, 24), jawBronzeMat);
        drum.rotation.x = Math.PI * 0.5;
        gGroup.add(drum);

        const bezelRing = new THREE.Mesh(new THREE.TorusGeometry(13.8, 1.6, 12, 24), polishedBrassMat);
        bezelRing.position.set(0, 0, 3.1);
        gGroup.add(bezelRing);

        const face = new THREE.Mesh(new THREE.CircleGeometry(12.6, 24), peepDialMat);
        face.position.set(0, 0, 3.2);
        gGroup.add(face);

        const nPivot = new THREE.Group();
        nPivot.position.set(0, 0, 3.8);
        const nMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 9.2, 1.0), peepNeedleMat);
        nMesh.position.set(0, 3.5, 0);
        nPivot.add(nMesh);
        gGroup.add(nPivot);
        if (this.pressureNeedles3D) this.pressureNeedles3D.push(nPivot);

        peepholeGaugesGroup.add(gGroup);
      }

      group.add(peepholeGaugesGroup);
      this.peepholeGaugesGroup = peepholeGaugesGroup;

      const cPos = this.boardToWorld(340, 28, 28);
      group.position.set(cPos.x, cPos.y, cPos.z);
      group.rotation.x = 0.28;
      this.cabinetGroup.add(group);
      this.collector3DGroup = group;
    }

    mountCollectorJawGLB(jawScene) {
      // Keep the Collector portrait's painted skull teeth 100% unobstructed by any front orange bracket;
      // only the recessed dark weathered-bronze side cheek dampers & hinges remain in collectorJawPivot.
      if (!jawScene || !this.collectorJawPivot) return;
      this.hasArticulatedCollectorJaw3D = true;
    }

    mountCollectorClawGLB(clawScene) {
      const THREE = this.THREE;
      if (!clawScene || !this.collectorLeftHand3D || !this.collectorRightHand3D) return;

      this.collectorFingerGroups3D = [];

      const setupHand = (handGroup, side) => {
        while (handGroup.children.length > 0) {
          handGroup.remove(handGroup.children[0]);
        }
        handGroup.position.set(side * 34.5, -18.5, 19.8);
        handGroup.rotation.set(0, -side * 0.16, side * 0.08);

        // Maya-sculpted 39,400-tri Skeletal Claw Mesh (`collector-skeletal-claw.glb`) resting on the Heavy Riveted Sill Beam
        const clawPivot = new THREE.Group();
        clawPivot.rotation.x = 0.44;
        clawPivot.userData = { isSculptedClawGLB: true };

        const clawClone = clawScene.clone(true);
        clawClone.scale.set(side * 12.2, 12.2, 12.2);
        clawClone.position.set(0, 0, 0);
        clawClone.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = false;
            n.receiveShadow = true;
            if (n.geometry && !n.geometry.attributes.normal) {
              n.geometry.computeVertexNormals();
            }
            if (n.material) {
              n.material = n.material.clone();
              n.material.side = THREE.DoubleSide;
              n.material.color.setHex(0xd4a05a);
              n.material.metalness = 0.72;
              n.material.roughness = 0.34;
              n.material.emissive = new THREE.Color(0x221004);
              n.material.emissiveIntensity = 0.18;
              n.material.envMapIntensity = 0.88;
              if (n.material.normalScale) {
                n.material.normalScale.set(1.4, 1.4);
              }
              n.material.needsUpdate = true;
            }
          }
        });

        clawPivot.add(clawClone);
        handGroup.add(clawPivot);
        this.collectorFingerGroups3D.push(clawPivot);
      };

      setupHand(this.collectorLeftHand3D, -1);
      setupHand(this.collectorRightHand3D, 1);
      this.hasCollectorClawHands3D = true;
    }

    mountGuillotineBlade3D(sceneRoot) {
      // Keep the sleek procedural beveled steel & crimson-edge blade in guillotineBlade3D unobstructed
      if (!sceneRoot || !this.guillotineBlade3D) return;
    }

    mountOuterBoothWingGLBs() {
      const THREE = this.THREE;
      if (!this.cabinetGroup) return;

      if (this.leftWingGLBMount && this.glbScenes && this.glbScenes.pillory_assembly) {
        while (this.leftWingGLBMount.children.length > 0) {
          this.leftWingGLBMount.remove(this.leftWingGLBMount.children[0]);
        }
        const pClone = this.glbScenes.pillory_assembly.clone(true);
        pClone.scale.set(34, 34, 34);
        pClone.rotation.set(Math.PI * 0.36, 0.22, 0);
        pClone.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = false;
            n.receiveShadow = true;
            if (n.material) {
              n.material = n.material.clone();
              n.material.metalness = Math.min(0.75, n.material.metalness || 0.55);
              n.material.roughness = Math.max(0.32, n.material.roughness || 0.38);
              n.material.emissive = new THREE.Color(0x2b1208);
              n.material.emissiveIntensity = 0.25;
            }
          }
        });
        this.leftWingGLBMount.add(pClone);
      }

      if (this.rightWingGLBMount && this.glbScenes && this.glbScenes.contraband_rack) {
        // Keep the 6 sculpted 3D Riveted Brass-Bezel Steampunk Contraptions on the right Contraband wing 100% unobstructed
        while (this.rightWingGLBMount.children.length > 0) {
          this.rightWingGLBMount.remove(this.rightWingGLBMount.children[0]);
        }
      }
    }

    createBrushedMetalBumpMap() {
      if (this._metalGrainBumpMap) return this._metalGrainBumpMap;
      const THREE = this.THREE;
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 256, 256);

      // Anisotropic horizontal brushed brass striations + micro-hammered cast-iron pitting
      for (let y = 0; y < 256; y++) {
        const streak = Math.round(128 + Math.sin(y * 1.7) * 28 + Math.cos(y * 4.3) * 18);
        ctx.fillStyle = `rgb(${streak},${streak},${streak})`;
        ctx.fillRect(0, y, 256, 1);
      }
      for (let i = 0; i < 420; i++) {
        const px = (i * 73) % 256;
        const py = (i * 137) % 256;
        const v = i % 2 === 0 ? 168 : 88;
        ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
        ctx.fillRect(px, py, 6, 2);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(4, 2);
      tex.needsUpdate = true;
      this._metalGrainBumpMap = tex;
      return tex;
    }

    createClockworkGear3D(radius, teethCount, thickness) {
      const THREE = this.THREE;
      const gearGroup = new THREE.Group();
      const metalBump = this.createBrushedMetalBumpMap();
      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xe8ad42,
        metalness: 0.76,
        roughness: 0.22,
        bumpMap: metalBump,
        bumpScale: 0.85,
        emissive: new THREE.Color(0x4a2a08),
        emissiveIntensity: 0.26
      });
      const darkBronzeMat = new THREE.MeshStandardMaterial({
        color: 0x6e4418,
        metalness: 0.72,
        roughness: 0.32,
        bumpMap: metalBump,
        bumpScale: 0.95,
        emissive: new THREE.Color(0x241204),
        emissiveIntensity: 0.20
      });

      const rimMesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.84, radius * 0.14, 12, 32),
        brassMat
      );
      rimMesh.castShadow = true;
      gearGroup.add(rimMesh);

      const webGeo = new THREE.CylinderGeometry(radius * 0.74, radius * 0.74, thickness * 0.55, 24);
      webGeo.rotateX(Math.PI * 0.5);
      const webMesh = new THREE.Mesh(webGeo, darkBronzeMat);
      gearGroup.add(webMesh);

      const spokeGeo = new THREE.BoxGeometry(radius * 1.64, radius * 0.14, thickness * 0.82);
      for (let s = 0; s < 3; s++) {
        const spoke = new THREE.Mesh(spokeGeo, brassMat);
        spoke.rotation.z = (s * Math.PI) / 3;
        gearGroup.add(spoke);
      }

      const toothGeo = new THREE.BoxGeometry(radius * 0.22, radius * 0.20, thickness * 0.9);
      for (let t = 0; t < teethCount; t++) {
        const ang = (t / teethCount) * Math.PI * 2;
        const tooth = new THREE.Mesh(toothGeo, brassMat);
        tooth.position.set(Math.cos(ang) * (radius * 0.98), Math.sin(ang) * (radius * 0.98), 0);
        tooth.rotation.z = ang;
        gearGroup.add(tooth);
      }

      const hubGeo = new THREE.CylinderGeometry(radius * 0.26, radius * 0.30, thickness * 1.35, 16);
      hubGeo.rotateX(Math.PI * 0.5);
      const hubMesh = new THREE.Mesh(hubGeo, brassMat);
      gearGroup.add(hubMesh);

      return gearGroup;
    }

    createBaizeBedTexture() {
      const THREE = this.THREE;
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 1024;
      const ctx = c.getContext('2d');
      const w = c.width;
      const h = c.height;
      const cx = w * 0.5;
      const cy = h * 0.54;

      // Royal Crimson-Mahogany Velvet Baize Gradient
      const bg = ctx.createRadialGradient(cx, cy, 40, cx, cy, w * 0.68);
      bg.addColorStop(0, '#3a141d');
      bg.addColorStop(0.45, '#280d14');
      bg.addColorStop(0.82, '#18070b');
      bg.addColorStop(1, '#0e0406');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Subtle vertical bullion lane lines
      ctx.strokeStyle = 'rgba(255, 208, 120, 0.08)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 6; i++) {
        const lx = (w / 6) * i;
        ctx.beginPath();
        ctx.moveTo(lx, 24);
        ctx.lineTo(lx, h - 24);
        ctx.stroke();
      }

      // Golden Sacred-Geometry Astrolabe Rings
      const radii = [320, 240, 145, 68];
      for (let rIdx = 0; rIdx < radii.length; rIdx++) {
        ctx.strokeStyle = rIdx === 0 ? 'rgba(255, 206, 112, 0.28)' : 'rgba(255, 206, 112, 0.18)';
        ctx.lineWidth = rIdx === 0 ? 3.2 : 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, radii[rIdx], 0, Math.PI * 2);
        ctx.stroke();
      }

      // 8-Point Alchemical Octagram Star & 12 Zodiac Compass Rays
      ctx.strokeStyle = 'rgba(255, 206, 112, 0.20)';
      ctx.lineWidth = 2.0;
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 68, cy + Math.sin(a) * 68);
        ctx.lineTo(cx + Math.cos(a) * 320, cy + Math.sin(a) * 320);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255, 214, 128, 0.24)';
      ctx.lineWidth = 2.4;
      for (let s = 0; s < 2; s++) {
        const rot = (s * Math.PI) / 4;
        ctx.beginPath();
        for (let k = 0; k <= 4; k++) {
          const a = rot + (k * Math.PI) / 2;
          const px = cx + Math.cos(a) * 240;
          const py = cy + Math.sin(a) * 240;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Outer Engraved Brass Filigree Border Frame
      ctx.strokeStyle = 'rgba(240, 186, 96, 0.36)';
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, w - 40, h - 40);

      const tex = new THREE.CanvasTexture(c);
      if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.maxAnisotropy || 8;
      tex.needsUpdate = true;
      return tex;
    }

    createShelfDeckTexture() {
      const THREE = this.THREE;
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext('2d');
      const w = c.width;
      const h = c.height;

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1a1614');
      g.addColorStop(0.5, '#2d2622');
      g.addColorStop(1, '#1c1714');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Vertical machined brass guide ribs on the pusher deck
      ctx.strokeStyle = 'rgba(232, 176, 84, 0.34)';
      ctx.lineWidth = 3;
      for (let i = 1; i < 8; i++) {
        const x = (w / 8) * i;
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, h - 8);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255, 214, 128, 0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      const tex = new THREE.CanvasTexture(c);
      if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.maxAnisotropy || 8;
      tex.needsUpdate = true;
      return tex;
    }

    renderPlaqueTextures(text, borderColorHex = '#ffd875', bgTopHex = '#2b180c', bgBotHex = '#120804', textColorHex = '#fff4d2') {
      const THREE = this.THREE;
      const w = 512;
      const h = 128;

      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');

      const bumpCanvas = document.createElement('canvas');
      bumpCanvas.width = w;
      bumpCanvas.height = h;
      const bCtx = bumpCanvas.getContext('2d');

      // 1. Metallic Linear Gradient Plate Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, bgTopHex);
      bgGrad.addColorStop(0.48, bgBotHex);
      bgGrad.addColorStop(0.54, bgTopHex);
      bgGrad.addColorStop(1, bgBotHex);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      bCtx.fillStyle = '#282828';
      bCtx.fillRect(0, 0, w, h);

      // Subtle brushed metallic horizontal grain lines
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.05)';
      ctx.lineWidth = 1;
      for (let y = 16; y < h - 16; y += 6) {
        ctx.beginPath();
        ctx.moveTo(16, y);
        ctx.lineTo(w - 16, y);
        ctx.stroke();
      }

      // 2. Outer Beveled Brass Border & Inner Recessed Fillet Frame
      ctx.strokeStyle = borderColorHex;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.lineWidth = 3;
      ctx.strokeRect(11, 11, w - 22, h - 22);

      ctx.strokeStyle = borderColorHex;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(15, 15, w - 30, h - 30);

      bCtx.strokeStyle = '#ececec';
      bCtx.lineWidth = 8;
      bCtx.strokeRect(4, 4, w - 8, h - 8);
      bCtx.lineWidth = 3;
      bCtx.strokeRect(15, 15, w - 30, h - 30);

      // 3. Four Corner Cast-Brass Rivets
      const rivets = [
        [30, 30],
        [w - 30, 30],
        [30, h - 30],
        [w - 30, h - 30]
      ];
      for (let i = 0; i < rivets.length; i++) {
        const [rx, ry] = rivets[i];
        ctx.beginPath();
        ctx.arc(rx + 2, ry + 2, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(rx, ry, 7.2, 0, Math.PI * 2);
        ctx.fillStyle = borderColorHex;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(rx - 2, ry - 2, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        bCtx.beginPath();
        bCtx.arc(rx, ry, 7.5, 0, Math.PI * 2);
        bCtx.fillStyle = '#ffffff';
        bCtx.fill();
      }

      // 4. Engraved High-Relief Metallic Typography
      const label = String(text || '');
      const fontSize = label.length > 30 ? 23 : label.length > 18 ? 34 : 44;
      const fontSpec = `bold ${fontSize}px "Cinzel", "JetBrains Mono", Georgia, serif`;
      ctx.font = fontSpec;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Deep bevel shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
      ctx.fillText(label, w * 0.5 + 2.5, h * 0.5 + 3.5, w - 84);
      // Top-left specular highlight
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, w * 0.5 - 1.2, h * 0.5 - 1.2, w - 84);
      // Main struck relief face
      ctx.fillStyle = textColorHex;
      ctx.fillText(label, w * 0.5, h * 0.5 + 1, w - 84);

      bCtx.font = fontSpec;
      bCtx.textAlign = 'center';
      bCtx.textBaseline = 'middle';
      bCtx.fillStyle = '#ffffff';
      bCtx.fillText(label, w * 0.5, h * 0.5 + 1, w - 84);

      const faceTex = new THREE.CanvasTexture(c);
      if ('colorSpace' in faceTex && THREE.SRGBColorSpace) faceTex.colorSpace = THREE.SRGBColorSpace;
      faceTex.anisotropy = this.maxAnisotropy || 8;
      faceTex.needsUpdate = true;

      const bumpTex = new THREE.CanvasTexture(bumpCanvas);
      bumpTex.anisotropy = this.maxAnisotropy || 8;
      bumpTex.needsUpdate = true;

      return { faceTex, bumpTex };
    }

    create3DPlaqueMesh(
      width,
      height,
      depth,
      text,
      borderColorHex = '#ffd875',
      bgTopHex = '#2b180c',
      bgBotHex = '#120804',
      textColorHex = '#fff4d2'
    ) {
      const THREE = this.THREE;
      const { faceTex, bumpTex } = this.renderPlaqueTextures(
        text,
        borderColorHex,
        bgTopHex,
        bgBotHex,
        textColorHex
      );

      const brassSideMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(borderColorHex),
        metalness: 0.78,
        roughness: 0.22,
        emissive: new THREE.Color(borderColorHex),
        emissiveIntensity: 0.24
      });

      const frontFaceMat = new THREE.MeshStandardMaterial({
        map: faceTex,
        bumpMap: bumpTex,
        bumpScale: 1.15,
        color: 0xffffff,
        metalness: 0.42,
        roughness: 0.24,
        emissive: new THREE.Color(borderColorHex),
        emissiveMap: faceTex,
        emissiveIntensity: 0.52
      });

      const plaqueGeo = new THREE.BoxGeometry(width, height, depth);
      const mesh = new THREE.Mesh(plaqueGeo, [
        brassSideMat,
        brassSideMat,
        brassSideMat,
        brassSideMat,
        frontFaceMat,
        brassSideMat
      ]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        frontFaceMat,
        brassSideMat,
        borderColorHex,
        bgTopHex,
        bgBotHex,
        textColorHex,
        lastText: text
      };
      return mesh;
    }

    update3DPlaqueText(plaqueMesh, newText) {
      if (!plaqueMesh || !plaqueMesh.userData || plaqueMesh.userData.lastText === newText) return;
      const ud = plaqueMesh.userData;
      const { faceTex, bumpTex } = this.renderPlaqueTextures(
        newText,
        ud.borderColorHex,
        ud.bgTopHex,
        ud.bgBotHex,
        ud.textColorHex
      );
      if (ud.frontFaceMat) {
        if (ud.frontFaceMat.map) ud.frontFaceMat.map.dispose();
        if (ud.frontFaceMat.bumpMap) ud.frontFaceMat.bumpMap.dispose();
        ud.frontFaceMat.map = faceTex;
        ud.frontFaceMat.emissiveMap = faceTex;
        ud.frontFaceMat.bumpMap = bumpTex;
        ud.frontFaceMat.needsUpdate = true;
      }
      ud.lastText = newText;
    }

    getFuseBadgeMaterialArray(fuseCount) {
      const THREE = this.THREE;
      const val = Math.max(0, Math.round(fuseCount));
      if (this.fuseBadgeMaterials.has(val)) {
        return this.fuseBadgeMaterials.get(val);
      }

      const isUrgent = val <= 1;
      const borderHex = isUrgent ? '#ff3b24' : '#ffaa38';
      const bgTopHex = isUrgent ? '#520804' : '#331206';
      const bgBotHex = '#170402';
      const textHex = isUrgent ? '#fff0d6' : '#ffd875';

      const { faceTex, bumpTex } = this.renderPlaqueTextures(
        `[${val}]`,
        borderHex,
        bgTopHex,
        bgBotHex,
        textHex
      );

      const brassSideMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(borderHex),
        metalness: 0.76,
        roughness: 0.24,
        emissive: new THREE.Color(borderHex),
        emissiveIntensity: isUrgent ? 0.85 : 0.35
      });

      const frontFaceMat = new THREE.MeshStandardMaterial({
        map: faceTex,
        bumpMap: bumpTex,
        bumpScale: 0.9,
        color: 0xffffff,
        metalness: 0.36,
        roughness: 0.22,
        emissive: new THREE.Color(borderHex),
        emissiveMap: faceTex,
        emissiveIntensity: isUrgent ? 1.25 : 0.68
      });

      const mats = [
        brassSideMat,
        brassSideMat,
        brassSideMat,
        brassSideMat,
        frontFaceMat,
        brassSideMat
      ];
      this.fuseBadgeMaterials.set(val, mats);
      return mats;
    }

    buildCabinetGeometry() {
      return this.buildCabinet3DGeometry();
    }

    buildCabinet3DGeometry() {
      const THREE = this.THREE;

      // 0a. Shared 3D Contact Ambient-Occlusion Shadow Disc Geometry & Radial Gradient Material
      this.coinContactShadowGeo = new THREE.CircleGeometry(1.14, 24);
      const aoCanvas = document.createElement('canvas');
      aoCanvas.width = 128;
      aoCanvas.height = 128;
      const aoCtx = aoCanvas.getContext('2d');
      const aoGrad = aoCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
      aoGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.68)');
      aoGrad.addColorStop(0.58, 'rgba(0, 0, 0, 0.44)');
      aoGrad.addColorStop(0.84, 'rgba(0, 0, 0, 0.16)');
      aoGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      aoCtx.fillStyle = aoGrad;
      aoCtx.fillRect(0, 0, 128, 128);
      const aoTex = new THREE.CanvasTexture(aoCanvas);
      aoTex.needsUpdate = true;
      this.coinContactShadowMat = new THREE.MeshBasicMaterial({
        map: aoTex,
        transparent: true,
        depthWrite: false
      });

      // 0. 3D Occult Mint Room Backdrop & Warm Side Wall Sconce Glows (Matches Godot 4.7.2 Room)
      const roomWallMat = new THREE.MeshStandardMaterial({
        color: 0x0b0504,
        metalness: 0.25,
        roughness: 0.85
      });
      const roomBackWall = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1400), roomWallMat);
      roomBackWall.position.set(0, 0, -90);
      this.cabinetGroup.add(roomBackWall);

      const sconceMat = new THREE.MeshBasicMaterial({
        color: 0xff5a1f,
        transparent: true,
        opacity: 0.22
      });
      const leftSconceGlow = new THREE.Mesh(new THREE.PlaneGeometry(140, 520), sconceMat);
      leftSconceGlow.position.set(-345, -20, -35);
      this.cabinetGroup.add(leftSconceGlow);

      const rightSconceGlow = new THREE.Mesh(new THREE.PlaneGeometry(140, 520), sconceMat);
      rightSconceGlow.position.set(345, -20, -35);
      this.cabinetGroup.add(rightSconceGlow);

      // 1. 3D Textured Crimson-Mahogany Velvet & Sacred-Geometry Astrolabe Lower Playfield Bed Slab
      const baizeTex = this.createBaizeBedTexture();
      const bedSlabGeo = new THREE.BoxGeometry(526, 336, 16);
      const bedSlabMat = new THREE.MeshStandardMaterial({
        map: baizeTex,
        color: 0xffffff,
        metalness: 0.14,
        roughness: 0.64,
        emissive: new THREE.Color(0x1f080d),
        emissiveMap: baizeTex,
        emissiveIntensity: 0.32
      });
      this.injectWorldSdfGiShader(bedSlabMat);
      const bedSlabMesh = new THREE.Mesh(bedSlabGeo, bedSlabMat);
      const bedPos = this.boardToWorld(340, 314, -8);
      bedSlabMesh.position.set(bedPos.x, bedPos.y, -8.2);
      bedSlabMesh.receiveShadow = true;
      this.cabinetGroup.add(bedSlabMesh);
      this.bedMat = bedSlabMat;

      const metalBump = this.createBrushedMetalBumpMap();

      // Upper Pegboard Backplate Slab + 4 Riveted Antique-Brass Vertical Ribs + Fixed Brass Capstan Drop Pegs (Populating Lower 40% of [COLLECTOR] View)
      const pegboardSlabMat = new THREE.MeshStandardMaterial({
        color: 0x26140b,
        metalness: 0.42,
        roughness: 0.52,
        bumpMap: metalBump,
        bumpScale: 0.85,
        emissive: new THREE.Color(0x160904),
        emissiveIntensity: 0.24
      });
      this.injectWorldSdfGiShader(pegboardSlabMat);
      const pegboardSlab = new THREE.Mesh(
        new THREE.BoxGeometry(526, 178, 12),
        pegboardSlabMat
      );
      const pegBackPos = this.boardToWorld(340, 122, -6);
      pegboardSlab.position.set(pegBackPos.x, pegBackPos.y, -6);
      pegboardSlab.receiveShadow = true;
      this.cabinetGroup.add(pegboardSlab);

      const pegboardBrassMat = new THREE.MeshStandardMaterial({
        color: 0xdca042,
        metalness: 0.78,
        roughness: 0.24,
        bumpMap: metalBump,
        bumpScale: 0.85,
        emissive: new THREE.Color(0x4a2808),
        emissiveIntensity: 0.24
      });
      const pegboardBronzeMat = new THREE.MeshStandardMaterial({
        color: 0x5c3616,
        metalness: 0.74,
        roughness: 0.34,
        emissive: new THREE.Color(0x1f0e04),
        emissiveIntensity: 0.20
      });

      // Warm Dedicated Fill Light illuminating the 3D Vertical Drop Pegboard & Clockwork Gears below the Collector
      const pegboardFillLight = new THREE.PointLight(0xffb85c, 1.85, 360, 1.25);
      pegboardFillLight.position.set(0, 195, 118);
      this.cabinetGroup.add(pegboardFillLight);

      // 4 Riveted Antique-Brass Vertical Ribs across the Upper Drop Pegboard (x = -195, -65, +65, +195)
      const vRibGeo = new THREE.BoxGeometry(8.5, 134, 9.5);
      const vRibRivetGeo = new THREE.SphereGeometry(1.65, 10, 8);
      for (const rx of [-195, -65, 65, 195]) {
        const vRib = new THREE.Mesh(vRibGeo, pegboardBrassMat);
        vRib.position.set(rx, 196, 1.5);
        vRib.castShadow = true;
        vRib.receiveShadow = true;
        this.cabinetGroup.add(vRib);

        for (let ry = 142; ry <= 250; ry += 18) {
          const rStud = new THREE.Mesh(vRibRivetGeo, pegboardBronzeMat);
          rStud.position.set(rx, ry, 6.6);
          this.cabinetGroup.add(rStud);
        }
      }

      // Upper & Lower Horizontal Riveted Brass Pegboard Cross-Beams
      for (const hy of [154, 250]) {
        const hBeam = new THREE.Mesh(new THREE.BoxGeometry(518, 6.5, 8.5), pegboardBronzeMat);
        hBeam.position.set(0, hy, 1.2);
        hBeam.castShadow = true;
        this.cabinetGroup.add(hBeam);
      }

      // 11 Upper Pegboard Brass Capstan Drop Pegs arranged in 2 staggered rows (y = 208 and y = 174)
      const uPegWasherGeo = new THREE.CylinderGeometry(7.2, 8.2, 3.0, 20);
      uPegWasherGeo.rotateX(Math.PI * 0.5);
      const uPegPostGeo = new THREE.CylinderGeometry(4.2, 4.8, 12.5, 20);
      uPegPostGeo.rotateX(Math.PI * 0.5);
      const uPegDomeGeo = new THREE.SphereGeometry(4.4, 16, 12);
      const upperPegCoords = [
        [-160, 208], [-96, 208], [-32, 208], [32, 208], [96, 208], [160, 208],
        [-128, 174], [-58, 174], [0, 174], [58, 174], [128, 174]
      ];
      for (let up = 0; up < upperPegCoords.length; up++) {
        const [upx, upy] = upperPegCoords[up];
        const uPegGroup = new THREE.Group();
        uPegGroup.position.set(upx, upy, 1.5);
        const uWasher = new THREE.Mesh(uPegWasherGeo, pegboardBronzeMat);
        uWasher.position.set(0, 0, 1.5);
        uPegGroup.add(uWasher);
        const uPost = new THREE.Mesh(uPegPostGeo, pegboardBrassMat);
        uPost.position.set(0, 0, 6.2);
        uPost.castShadow = true;
        uPegGroup.add(uPost);
        const uDome = new THREE.Mesh(uPegDomeGeo, pegboardBrassMat);
        uDome.position.set(0, 0, 12.2);
        uPegGroup.add(uDome);
        this.cabinetGroup.add(uPegGroup);
      }

      // 2. Reciprocating 3D Stepped Pusher Box, Deep Overhang Ambient-Occlusion Drop Shadow & Beveled Brass Bulldozer Lip Bar + 14 Extruded Brass Teeth
      this.scraperClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 174);

      const shelfGroup = new THREE.Group();

      // Deep Soft-Gradient Ambient-Occlusion Overhang Drop Shadow directly beneath the reciprocating shelf lip
      const shelfShadowCanvas = document.createElement('canvas');
      shelfShadowCanvas.width = 64;
      shelfShadowCanvas.height = 128;
      const ssCtx = shelfShadowCanvas.getContext('2d');
      const ssGrad = ssCtx.createLinearGradient(0, 0, 0, 128);
      ssGrad.addColorStop(0.0, 'rgba(3, 1, 0, 0.94)');
      ssGrad.addColorStop(0.32, 'rgba(5, 1, 0, 0.78)');
      ssGrad.addColorStop(0.68, 'rgba(6, 2, 1, 0.36)');
      ssGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ssCtx.fillStyle = ssGrad;
      ssCtx.fillRect(0, 0, 64, 128);
      const shelfShadowTex = new THREE.CanvasTexture(shelfShadowCanvas);
      shelfShadowTex.needsUpdate = true;
      const shelfDropShadowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(524, 42),
        new THREE.MeshBasicMaterial({
          map: shelfShadowTex,
          transparent: true,
          depthWrite: false
        })
      );
      shelfDropShadowMesh.position.set(0, -16.5, 6.2);
      shelfGroup.add(shelfDropShadowMesh);

      const shelfBedShadowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(524, 48),
        new THREE.MeshBasicMaterial({
          map: shelfShadowTex,
          transparent: true,
          depthWrite: false
        })
      );
      shelfBedShadowMesh.position.set(0, -19.5, 0.55);
      shelfGroup.add(shelfBedShadowMesh);

      const shelfTex = this.createShelfDeckTexture();
      const shelfDeckGeo = new THREE.BoxGeometry(520, 102, 18.0);
      const shelfDeckMat = new THREE.MeshStandardMaterial({
        map: shelfTex,
        color: 0xd8c4a8,
        metalness: 0.62,
        roughness: 0.34,
        emissive: new THREE.Color(0x22160c),
        emissiveIntensity: 0.24
      });
      this.injectWorldSdfGiShader(shelfDeckMat);
      const shelfDeckMesh = new THREE.Mesh(shelfDeckGeo, shelfDeckMat);
      shelfDeckMesh.position.set(0, 51, 9.0);
      shelfDeckMesh.castShadow = true;
      shelfDeckMesh.receiveShadow = true;
      shelfGroup.add(shelfDeckMesh);
      this.shelfDeckMesh = shelfDeckMesh;

      // Dark Cast-Iron Under-Lip Vertical Step Riser Apron
      const shelfRiserApron = new THREE.Mesh(
        new THREE.BoxGeometry(522, 8.5, 18.0),
        new THREE.MeshStandardMaterial({
          color: 0x0d0603,
          metalness: 0.45,
          roughness: 0.68,
          emissive: new THREE.Color(0x040100),
          emissiveIntensity: 0.1
        })
      );
      shelfRiserApron.position.set(0, -1.8, 8.5);
      shelfRiserApron.castShadow = true;
      shelfGroup.add(shelfRiserApron);

      const shelfLipGeo = new THREE.BoxGeometry(522, 11, 18);
      const shelfLipMat = new THREE.MeshStandardMaterial({
        color: 0xd89c3a,
        metalness: 0.58,
        roughness: 0.38,
        bumpMap: metalBump,
        bumpScale: 0.95,
        emissive: new THREE.Color(0x3a2006),
        emissiveIntensity: 0.22
      });
      this.injectWorldSdfGiShader(shelfLipMat);
      const shelfLipMesh = new THREE.Mesh(shelfLipGeo, shelfLipMat);
      shelfLipMesh.position.set(0, 4.5, 11.5);
      shelfLipMesh.castShadow = true;
      shelfLipMesh.receiveShadow = true;
      shelfGroup.add(shelfLipMesh);
      this.shelfLipMesh = shelfLipMesh;

      const toothGeo = new THREE.BoxGeometry(20, 8.5, 14);
      const toothMat = new THREE.MeshStandardMaterial({
        color: 0xe6ad48,
        metalness: 0.58,
        roughness: 0.36,
        bumpMap: metalBump,
        bumpScale: 0.85,
        emissive: new THREE.Color(0x4a2a06),
        emissiveIntensity: 0.22
      });
      this.injectWorldSdfGiShader(toothMat);
      for (let t = 0; t < 14; t++) {
        const tx = -234 + t * 36;
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(tx, -2.0, 9.5);
        tooth.castShadow = true;
        tooth.receiveShadow = true;
        shelfGroup.add(tooth);
      }

      // Stationary 3D Brass Backstop Scraper Bar at y = 148 with 8 Raised 3D Hex Bolts
      const scraperGroup = new THREE.Group();
      const scraperGeo = new THREE.BoxGeometry(524, 11, 16);
      const scraperMat = new THREE.MeshStandardMaterial({
        color: 0xd99b38,
        metalness: 0.76,
        roughness: 0.24,
        bumpMap: metalBump,
        bumpScale: 1.05,
        emissive: new THREE.Color(0x3b2006),
        emissiveIntensity: 0.22
      });
      this.injectWorldSdfGiShader(scraperMat);
      const scraperMesh = new THREE.Mesh(scraperGeo, scraperMat);
      scraperMesh.castShadow = true;
      scraperMesh.receiveShadow = true;
      scraperGroup.add(scraperMesh);

      const boltGeo = new THREE.CylinderGeometry(3.2, 3.2, 5, 6);
      boltGeo.rotateX(Math.PI * 0.5);
      for (let b = 0; b < 8; b++) {
        const bx = -224 + b * 64;
        const bolt = new THREE.Mesh(boltGeo, toothMat);
        bolt.position.set(bx, 0, 8.5);
        scraperGroup.add(bolt);
      }

      const scraperPos = this.boardToWorld(340, 148, 16);
      scraperGroup.position.set(scraperPos.x, scraperPos.y, scraperPos.z);
      this.cabinetGroup.add(scraperGroup);
      this.scraperMesh = scraperMesh;

      // 2b. Upper Clockwork Backbox, Twin 3D Brass Shelf Guide Rails, 3 Spinning 3D Brass Cogwheels,
      //     3 Articulated Eccentric Crank-Rod Linkages & 4 Reciprocating Chrome Hydraulic Pistons
      this.shelfGuideRails3D = [];
      const guideRailGeo = new THREE.BoxGeometry(9, 132, 12);
      const railBracketGeo = new THREE.BoxGeometry(15, 11, 16);
      for (const railX of [-254, 254]) {
        const railGroup = new THREE.Group();
        railGroup.position.set(railX, 96, 14);
        const railMesh = new THREE.Mesh(guideRailGeo, toothMat);
        railMesh.castShadow = true;
        railMesh.receiveShadow = true;
        railGroup.add(railMesh);

        for (const bracketY of [-46, 0, 46]) {
          const bracketMesh = new THREE.Mesh(railBracketGeo, scraperMat);
          bracketMesh.position.set(0, bracketY, 1.5);
          bracketMesh.castShadow = true;
          bracketMesh.receiveShadow = true;
          railGroup.add(bracketMesh);
        }
        this.cabinetGroup.add(railGroup);
        this.shelfGuideRails3D.push(railGroup);
      }

      const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xe6edf5,
        metalness: 0.90,
        roughness: 0.14,
        emissive: new THREE.Color(0x2a241c),
        emissiveIntensity: 0.18
      });

      this.clockworkGears3D = [];
      this.crankRods3D = [];
      const gDefs = [
        { x: -135, y: 226, r: 26, teeth: 12, dir: -1 },
        { x: 0, y: 230, r: 34, teeth: 16, dir: 1 },
        { x: 135, y: 226, r: 26, teeth: 12, dir: -1 }
      ];
      const crankPinGeo = new THREE.CylinderGeometry(3.8, 3.8, 10, 14);
      crankPinGeo.rotateX(Math.PI * 0.5);
      const clevisGeo = new THREE.CylinderGeometry(5.6, 5.6, 7.5, 14);
      clevisGeo.rotateX(Math.PI * 0.5);
      const yokeBlockGeo = new THREE.BoxGeometry(16, 10, 10);

      for (let g = 0; g < gDefs.length; g++) {
        const cg = gDefs[g];
        const gearGroup = this.createClockworkGear3D(cg.r, cg.teeth, 8);
        gearGroup.position.set(cg.x, cg.y, 10);
        gearGroup.userData = { dir: cg.dir };

        const crankPin = new THREE.Mesh(crankPinGeo, toothMat);
        crankPin.position.set(0, cg.r * 0.42, 5);
        crankPin.castShadow = true;
        gearGroup.add(crankPin);

        this.cabinetGroup.add(gearGroup);
        this.clockworkGears3D.push(gearGroup);

        const rodMesh = new THREE.Mesh(new THREE.BoxGeometry(7.0, 1, 5.5), chromeMat);
        rodMesh.castShadow = true;
        rodMesh.receiveShadow = true;

        const topClevis = new THREE.Mesh(clevisGeo, toothMat);
        topClevis.position.set(0, -0.48, 0.5);
        topClevis.castShadow = true;
        rodMesh.add(topClevis);

        const botClevis = new THREE.Mesh(clevisGeo, toothMat);
        botClevis.position.set(0, 0.48, 0.5);
        botClevis.castShadow = true;
        rodMesh.add(botClevis);

        // Reciprocating brass yoke journal bracket inside the clockwork bay
        const yokeBlock = new THREE.Mesh(yokeBlockGeo, toothMat);
        yokeBlock.position.set(cg.x, 184, 15.5);
        yokeBlock.castShadow = true;
        this.cabinetGroup.add(yokeBlock);

        this.cabinetGroup.add(rodMesh);
        this.crankRods3D.push({
          rodMesh,
          topClevis,
          botClevis,
          yokeBlock,
          gx: cg.x,
          gy: cg.y,
          crankRadius: cg.r * 0.42,
          dir: cg.dir
        });
      }

      this.pistonRods3D = [];
      const pistonXList = [-165, -75, 75, 165];
      for (let pIdx = 0; pIdx < pistonXList.length; pIdx++) {
        const px = pistonXList[pIdx];
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 36, 16), scraperMat);
        housing.position.set(px, 232, 11);
        this.cabinetGroup.add(housing);

        const rod = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 1, 16), chromeMat);
        rod.position.set(px, 185, 11);
        this.cabinetGroup.add(rod);
        this.pistonRods3D.push({ rod, housing, x: px, topY: 224 });
      }

      // 2b-ii. 3D Occult Mint Room Steam Pipes & Brass Pressure Manometers flanking the upper clockwork bay
      this.mintRoomProps3D = new THREE.Group();
      this.pressureNeedles3D = [];
      const copperMat = new THREE.MeshStandardMaterial({
        color: 0xc86d3b,
        metalness: 0.80,
        roughness: 0.25,
        bumpMap: metalBump,
        bumpScale: 0.85,
        emissive: new THREE.Color(0x381506),
        emissiveIntensity: 0.22
      });
      const dialFaceMat = new THREE.MeshStandardMaterial({
        color: this.manometerDialTex ? 0xffffff : 0x16100c,
        map: this.manometerDialTex || null,
        metalness: 0.15,
        roughness: 0.35,
        emissive: new THREE.Color(this.manometerDialTex ? 0xffe0b2 : 0x2e1808),
        emissiveMap: this.manometerDialTex || null,
        emissiveIntensity: 0.35
      });
      this.manometerDialMat = dialFaceMat;
      const needleMat = new THREE.MeshStandardMaterial({
        color: 0xff3b1f,
        metalness: 0.35,
        roughness: 0.2,
        emissive: new THREE.Color(0xff2a08),
        emissiveIntensity: 1.6
      });
      const steamPipeGeo = new THREE.CylinderGeometry(4.8, 4.8, 128, 14);
      const flangeGeo = new THREE.CylinderGeometry(7.2, 7.2, 5, 14);
      const gaugeBodyGeo = new THREE.CylinderGeometry(11.5, 11.5, 5.5, 24);
      gaugeBodyGeo.rotateX(Math.PI * 0.5);
      const gaugeDialGeo = new THREE.CircleGeometry(9.6, 24);
      const gaugeRimGeo = new THREE.TorusGeometry(10.8, 1.4, 12, 24);
      const needleGeo = new THREE.BoxGeometry(1.6, 7.8, 1.2);

      for (const side of [-1, 1]) {
        const mx = side * 216;
        const pipe = new THREE.Mesh(steamPipeGeo, copperMat);
        pipe.position.set(mx, 212, 8);
        pipe.castShadow = true;
        this.mintRoomProps3D.add(pipe);

        for (const fy of [168, 204, 248]) {
          const flange = new THREE.Mesh(flangeGeo, toothMat);
          flange.position.set(mx, fy, 8);
          this.mintRoomProps3D.add(flange);
        }

        const gaugeGroup = new THREE.Group();
        gaugeGroup.position.set(mx - side * 4, 226, 13.5);

        const gBody = new THREE.Mesh(gaugeBodyGeo, scraperMat);
        gaugeGroup.add(gBody);

        const gDial = new THREE.Mesh(gaugeDialGeo, dialFaceMat);
        gDial.position.set(0, 0, 2.9);
        gaugeGroup.add(gDial);

        const gRim = new THREE.Mesh(gaugeRimGeo, toothMat);
        gRim.position.set(0, 0, 2.8);
        gaugeGroup.add(gRim);

        const needlePivot = new THREE.Group();
        needlePivot.position.set(0, 0, 3.4);
        const needle = new THREE.Mesh(needleGeo, needleMat);
        needle.position.set(0, 2.6, 0);
        needlePivot.add(needle);
        gaugeGroup.add(needlePivot);
        this.pressureNeedles3D.push(needlePivot);

        this.mintRoomProps3D.add(gaugeGroup);
      }
      this.cabinetGroup.add(this.mintRoomProps3D);
      this.hasMintRoomProps3D = true;

      this.reserveCoinMeshes = [];
      this.cabinetGroup.add(shelfGroup);
      this.shelfGroup = shelfGroup;

      // Mount the 3D Collector Bust in the Upper Peephole Shrine
      this.mountCollectorBust3D(this.glbScenes.collector || null);

      // 2c. 3D Mahogany & Brass Inner Containment Walls + 3D Molten House Furnace Side Grates (Matches Godot 4.7.2)
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x3b2214,
        metalness: 0.62,
        roughness: 0.36,
        emissive: new THREE.Color(0x180b05),
        emissiveIntensity: 0.22
      });
      const innerWallGeo = new THREE.BoxGeometry(10, 440, 26);
      const leftInnerWall = new THREE.Mesh(innerWallGeo, wallMat);
      leftInnerWall.position.set(-264, 5, 6);
      leftInnerWall.castShadow = true;
      leftInnerWall.receiveShadow = true;
      this.cabinetGroup.add(leftInnerWall);

      const rightInnerWall = new THREE.Mesh(innerWallGeo, wallMat);
      rightInnerWall.position.set(264, 5, 6);
      rightInnerWall.castShadow = true;
      rightInnerWall.receiveShadow = true;
      this.cabinetGroup.add(rightInnerWall);

      // 3D Recessed Furnace Cracked Volcanic Basalt & Deep Crimson-Amber Magma Trenches (FurnaceMagmaBed3D) + 14 Cast-Iron Grate Bars on Left (x = -302) and Right (x = +302)
      const lavaCanvas = document.createElement('canvas');
      lavaCanvas.width = 256;
      lavaCanvas.height = 512;
      const lCtx = lavaCanvas.getContext('2d');
      // Glowing deep crimson-amber magma fissure substrate
      const baseMagmaGrad = lCtx.createLinearGradient(0, 0, 256, 512);
      baseMagmaGrad.addColorStop(0.0, '#c82204');
      baseMagmaGrad.addColorStop(0.35, '#ff5408');
      baseMagmaGrad.addColorStop(0.5, '#ff9818');
      baseMagmaGrad.addColorStop(0.65, '#e83808');
      baseMagmaGrad.addColorStop(1.0, '#b81d04');
      lCtx.fillStyle = baseMagmaGrad;
      lCtx.fillRect(0, 0, 256, 512);

      // Bright molten fissure veins crisscrossing the magma bed
      lCtx.strokeStyle = '#ffbe38';
      lCtx.lineWidth = 4.5;
      for (let v = 0; v < 18; v++) {
        const vy = 14 + v * 28;
        lCtx.beginPath();
        lCtx.moveTo(8, vy);
        lCtx.lineTo(88 + ((v * 37) % 60), vy + ((v % 2 === 0 ? 1 : -1) * 14));
        lCtx.lineTo(175 + ((v * 23) % 50), vy - ((v % 2 === 0 ? 1 : -1) * 11));
        lCtx.lineTo(248, vy + 6);
        lCtx.stroke();
      }

      // Cracked Polygonal Dark Obsidian-Basalt Crust Islands floating over the glowing magma fissures
      for (let i = 0; i < 44; i++) {
        const cx = 26 + ((i * 61) % 204);
        const cy = 16 + ((i * 43) % 480);
        const rx = 18 + (i % 4) * 6;
        const ry = 14 + ((i * 3) % 4) * 5;
        const sides = 6 + (i % 3);
        lCtx.save();
        lCtx.translate(cx, cy);
        lCtx.rotate((i * 0.55) % Math.PI);
        lCtx.beginPath();
        for (let s = 0; s < sides; s++) {
          const ang = (s / sides) * Math.PI * 2;
          const jitter = 0.82 + ((i + s) % 3) * 0.11;
          const px = Math.cos(ang) * rx * jitter;
          const py = Math.sin(ang) * ry * jitter;
          if (s === 0) lCtx.moveTo(px, py);
          else lCtx.lineTo(px, py);
        }
        lCtx.closePath();
        lCtx.fillStyle = i % 5 === 0 ? '#190806' : '#0d0505';
        lCtx.fill();
        lCtx.lineWidth = 2.2;
        lCtx.strokeStyle = '#ff6a12';
        lCtx.stroke();
        lCtx.restore();
      }
      const lavaTex = new THREE.CanvasTexture(lavaCanvas);
      if ('colorSpace' in lavaTex && THREE.SRGBColorSpace) lavaTex.colorSpace = THREE.SRGBColorSpace;
      lavaTex.needsUpdate = true;

      const lavaMat = new THREE.MeshStandardMaterial({
        map: lavaTex,
        color: 0xffffff,
        metalness: 0.16,
        roughness: 0.68,
        emissive: new THREE.Color(0xe83808),
        emissiveMap: lavaTex,
        emissiveIntensity: 0.92
      });
      const grateRibMat = new THREE.MeshStandardMaterial({
        color: 0x241a15,
        metalness: 0.86,
        roughness: 0.26,
        emissive: new THREE.Color(0x140703),
        emissiveIntensity: 0.12
      });
      const grateSpecMat = new THREE.MeshStandardMaterial({
        color: 0x9e8466,
        metalness: 0.90,
        roughness: 0.18
      });
      const basaltCrustMat = new THREE.MeshStandardMaterial({
        color: 0x0d0505,
        metalness: 0.18,
        roughness: 0.90,
        emissive: new THREE.Color(0x280802),
        emissiveIntensity: 0.22
      });
      const coalSlagMat = new THREE.MeshStandardMaterial({
        color: 0x160907,
        metalness: 0.24,
        roughness: 0.88,
        emissive: new THREE.Color(0x420e03),
        emissiveIntensity: 0.32
      });
      const glowingEmberMat = new THREE.MeshStandardMaterial({
        color: 0xff6218,
        metalness: 0.10,
        roughness: 0.38,
        emissive: new THREE.Color(0xe83808),
        emissiveIntensity: 1.55
      });
      const emberSparkMat = new THREE.MeshBasicMaterial({
        color: 0xffb838,
        transparent: true,
        opacity: 0.88
      });
      this.lavaMat3D = glowingEmberMat;
      this.hasFurnaceMagmaBed3D = true;
      this.furnaceEmberMotes3D = [];

      const grateBarGeo = new THREE.CylinderGeometry(3.8, 3.8, 64, 16);
      grateBarGeo.rotateZ(Math.PI * 0.5);
      const grateSpecGeo = new THREE.CylinderGeometry(1.4, 1.4, 60, 10);
      grateSpecGeo.rotateZ(Math.PI * 0.5);
      const grateRivetGeo = new THREE.SphereGeometry(2.5, 10, 8);
      const crustPlateGeo = new THREE.CylinderGeometry(11.5, 13.5, 2.8, 6);
      crustPlateGeo.rotateX(Math.PI * 0.5);
      const magmaFissureGeo = new THREE.BoxGeometry(16, 8.5, 2.2);
      const coalGeoSmall = new THREE.DodecahedronGeometry(6.8, 0);
      const coalGeoLarge = new THREE.DodecahedronGeometry(9.6, 0);
      const emberMoteGeo = new THREE.OctahedronGeometry(2.1, 0);

      for (const side of [-1, 1]) {
        const fx = side * 302;
        const lavaBed = new THREE.Mesh(new THREE.BoxGeometry(62, 434, 8), lavaMat);
        lavaBed.position.set(fx, -4, -12);
        this.cabinetGroup.add(lavaBed);

        // Inner & Outer Recessed Cast-Iron Furnace Trench Curbs
        const innerTrenchWall = new THREE.Mesh(new THREE.BoxGeometry(6.5, 442, 20), grateRibMat);
        innerTrenchWall.position.set(fx - side * 30, -4, -1);
        this.cabinetGroup.add(innerTrenchWall);

        const innerBrassLip = new THREE.Mesh(new THREE.BoxGeometry(4.5, 442, 4), toothMat);
        innerBrassLip.position.set(fx - side * 30, -4, 9.5);
        this.cabinetGroup.add(innerBrassLip);

        // 18 3D Cracked Polygonal Obsidian-Basalt Crust Plates & Glowing Fissure Veins
        for (let p = 0; p < 18; p++) {
          const py = -198 + p * 23.2;
          const pxOff = ((p * 23) % 30) - 15;
          const crustPlate = new THREE.Mesh(crustPlateGeo, basaltCrustMat);
          crustPlate.position.set(fx + pxOff, py, -7.2);
          crustPlate.rotation.z = p * 0.65;
          crustPlate.scale.set(1.15, 0.88 + (p % 3) * 0.15, 1.0);
          this.cabinetGroup.add(crustPlate);

          const fissureStrip = new THREE.Mesh(magmaFissureGeo, glowingEmberMat);
          fissureStrip.position.set(fx - pxOff * 0.6, py + 6.5, -7.8);
          fissureStrip.rotation.z = (p % 2 === 0 ? 0.38 : -0.42);
          this.cabinetGroup.add(fissureStrip);
        }

        // 14 Jagged 3D Volcanic Basalt Slag Chunks per Gutter with Incandescent Magma Seams
        for (let c = 0; c < 14; c++) {
          const cy = -192 + c * 29.5;
          const cxOff = ((c * 19) % 34) - 17;
          const isGlowing = c % 3 === 0;
          const coalMesh = new THREE.Mesh(
            c % 2 === 0 ? coalGeoLarge : coalGeoSmall,
            isGlowing ? glowingEmberMat : coalSlagMat
          );
          coalMesh.position.set(fx + cxOff, cy, -5.2 + (c % 3) * 1.1);
          coalMesh.rotation.set(c * 0.7, c * 1.1, c * 0.5);
          coalMesh.scale.set(1.15, 0.86, 0.68);
          this.cabinetGroup.add(coalMesh);
        }

        // 12 Rising 3D Ember Spark Motes drifting up through the Cast-Iron Grate Bars per Gutter
        for (let m = 0; m < 12; m++) {
          const moteY = -188 + m * 33;
          const moteX = fx + (((m * 17) % 36) - 18);
          const moteZ = -3.0 + (m % 4) * 3.2;
          const moteMesh = new THREE.Mesh(emberMoteGeo, emberSparkMat);
          moteMesh.position.set(moteX, moteY, moteZ);
          this.cabinetGroup.add(moteMesh);
          this.furnaceEmberMotes3D.push({
            mesh: moteMesh,
            baseX: moteX,
            baseY: moteY,
            baseZ: moteZ,
            phase: m * 0.85 + (side > 0 ? 1.5 : 0)
          });
        }

        // 14 Heavy 3D Cylindrical Cast-Iron Grate Bars with Top Specular Highlights & Dual Brass End-Rivets
        for (let r = 0; r < 14; r++) {
          const ry = -198 + r * 30.5;
          const rib = new THREE.Mesh(grateBarGeo, grateRibMat);
          rib.position.set(fx, ry, 3.5);
          rib.castShadow = true;
          rib.receiveShadow = true;
          this.cabinetGroup.add(rib);

          const ribHighlight = new THREE.Mesh(grateSpecGeo, grateSpecMat);
          ribHighlight.position.set(fx, ry + 1.6, 6.4);
          this.cabinetGroup.add(ribHighlight);

          for (const rSide of [-1, 1]) {
            const endRivet = new THREE.Mesh(grateRivetGeo, toothMat);
            endRivet.position.set(fx + rSide * 28.5, ry, 7.2);
            this.cabinetGroup.add(endRivet);
          }
        }

        const outerBezel = new THREE.Mesh(new THREE.BoxGeometry(10, 460, 32), scraperMat);
        outerBezel.position.set(side * 336, 0, 8);
        this.cabinetGroup.add(outerBezel);
      }

      // 2d. 3D Moving Skill-Shot Bonus Gate Archway (Twin Upright Emerald-Crystal & Brass Lantern Pylons + 3D Brass Arch Span + Marquee)
      const gateGroup = new THREE.Group();
      const emeraldMat = new THREE.MeshStandardMaterial({
        color: 0x24d67a,
        metalness: 0.30,
        roughness: 0.22,
        emissive: new THREE.Color(0x10b85c),
        emissiveIntensity: 0.85
      });
      this.gateEmeraldMat = emeraldMat;

      const buildGatePylon = (xOff) => {
        const pGroup = new THREE.Group();
        pGroup.position.set(xOff, 0, 10);
        pGroup.rotation.x = 0.22;

        const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 9.6, 6.5, 18), toothMat);
        baseCollar.position.set(0, -10, 0);
        baseCollar.castShadow = true;
        pGroup.add(baseCollar);

        const crystal = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.4, 24, 18), emeraldMat);
        crystal.position.set(0, 3, 0);
        crystal.castShadow = true;
        pGroup.add(crystal);

        const capFinial = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 5.4, 4.5, 18), toothMat);
        capFinial.position.set(0, 16, 0);
        capFinial.castShadow = true;
        pGroup.add(capFinial);
        return pGroup;
      };

      const leftPylon = buildGatePylon(-43);
      gateGroup.add(leftPylon);
      this.gateLeftPylon = leftPylon;

      const rightPylon = buildGatePylon(43);
      gateGroup.add(rightPylon);
      this.gateRightPylon = rightPylon;

      // 3D Curved Antique-Brass & Emerald Archway Bridge connecting the twin pylons
      const archCrownBeam = new THREE.Mesh(new THREE.BoxGeometry(96, 5.5, 6.5), toothMat);
      archCrownBeam.position.set(0, 16, 16);
      archCrownBeam.castShadow = true;
      gateGroup.add(archCrownBeam);

      const archEmeraldStrip = new THREE.Mesh(new THREE.BoxGeometry(88, 2.8, 7.2), emeraldMat);
      archEmeraldStrip.position.set(0, 16, 16.5);
      gateGroup.add(archEmeraldStrip);

      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x38ff9c,
        transparent: true,
        opacity: 0.55
      });
      const gateArch = new THREE.Mesh(new THREE.BoxGeometry(86, 3.0, 3.0), beamMat);
      gateArch.position.set(0, -3, 8);
      gateGroup.add(gateArch);
      this.gateArchMesh = gateArch;

      // 3D Skill-Shot Bonus Gate Marquee Plaque ('BONUS GATE x2') mounted on twin brass struts
      const gateStrutGeo = new THREE.CylinderGeometry(1.8, 1.8, 15, 10);
      for (const sx of [-32, 32]) {
        const strut = new THREE.Mesh(gateStrutGeo, toothMat);
        strut.position.set(sx, 12, 20);
        strut.rotation.x = Math.PI * 0.25;
        strut.castShadow = true;
        gateGroup.add(strut);
      }
      const gatePlaque = this.create3DPlaqueMesh(
        104,
        18,
        5.0,
        'BONUS GATE x2',
        '#39ff5a',
        '#0c2b18',
        '#05140b',
        '#b8ffcb'
      );
      gatePlaque.position.set(0, 15, 27);
      gatePlaque.rotation.x = 0.32;
      gateGroup.add(gatePlaque);
      this.gatePlaque3D = gatePlaque;
      this.gatePlaqueFrontMat = gatePlaque.userData ? gatePlaque.userData.frontFaceMat : null;

      this.cabinetGroup.add(gateGroup);
      this.gateGroup3D = gateGroup;

      // 2d-ii. True 3D Sliding Brass Drop-Rail Carriage, 3D Held Next-Token & Vertical Emerald Aiming Plumb-Line Laser (DYN-2)
      const dropRailPos = this.boardToWorld(340, 78, 36);
      const dropRailGeo = new THREE.CylinderGeometry(4.2, 4.2, 520, 18);
      dropRailGeo.rotateZ(Math.PI * 0.5);
      const dropRailMesh = new THREE.Mesh(dropRailGeo, toothMat);
      dropRailMesh.position.set(dropRailPos.x, dropRailPos.y, dropRailPos.z);
      dropRailMesh.castShadow = true;
      dropRailMesh.receiveShadow = true;
      this.cabinetGroup.add(dropRailMesh);
      this.dropRailMesh3D = dropRailMesh;

      // Secondary Upper Guide Rod for the Brass Drop Carriage
      const upperGuideGeo = new THREE.CylinderGeometry(2.4, 2.4, 520, 14);
      upperGuideGeo.rotateZ(Math.PI * 0.5);
      const upperGuideMesh = new THREE.Mesh(upperGuideGeo, scraperMat);
      upperGuideMesh.position.set(dropRailPos.x, dropRailPos.y + 7, dropRailPos.z + 5);
      this.cabinetGroup.add(upperGuideMesh);

      this.dropRailBrackets3D = [];
      for (const side of [-1, 1]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(14, 20, 22), scraperMat);
        bracket.position.set(side * 256, dropRailPos.y, dropRailPos.z);
        bracket.castShadow = true;
        this.cabinetGroup.add(bracket);
        this.dropRailBrackets3D.push(bracket);
      }

      // 2d-iii. 3D Right-Side Brass Contraband Relic Curio Rack along the Upper-Right Inner Wall
      const contrabandRackGroup = new THREE.Group();
      contrabandRackGroup.position.set(250, 96, 22);
      const rackSpine = new THREE.Mesh(new THREE.BoxGeometry(8, 118, 8), scraperMat);
      rackSpine.castShadow = true;
      contrabandRackGroup.add(rackSpine);
      const socketRingGeo = new THREE.TorusGeometry(5.2, 1.2, 10, 18);
      const vialGeo = new THREE.CylinderGeometry(2.8, 2.8, 8.5, 12);
      const vialColors = [0xffbf36, 0x39ff5a, 0xff4518, 0x00ffe5];
      for (let s = 0; s < 4; s++) {
        const sy = -42 + s * 28;
        const socketRing = new THREE.Mesh(socketRingGeo, toothMat);
        socketRing.position.set(-3, sy, 3.5);
        contrabandRackGroup.add(socketRing);

        const vialMat = new THREE.MeshStandardMaterial({
          color: vialColors[s],
          metalness: 0.25,
          roughness: 0.18,
          emissive: new THREE.Color(vialColors[s]),
          emissiveIntensity: 0.75
        });
        const vial = new THREE.Mesh(vialGeo, vialMat);
        vial.position.set(-3, sy, 3.5);
        contrabandRackGroup.add(vial);
      }
      this.cabinetGroup.add(contrabandRackGroup);
      this.contrabandRack3D = contrabandRackGroup;

      const dropCarriageGroup = new THREE.Group();
      const sleeveGeo = new THREE.CylinderGeometry(7.2, 7.2, 38, 18);
      sleeveGeo.rotateZ(Math.PI * 0.5);
      const carriageSleeve = new THREE.Mesh(sleeveGeo, scraperMat);
      carriageSleeve.position.set(0, 2, 2);
      carriageSleeve.castShadow = true;
      dropCarriageGroup.add(carriageSleeve);

      const carriageBlock = new THREE.Mesh(new THREE.BoxGeometry(34, 16, 16), toothMat);
      carriageBlock.position.set(0, -2, 4);
      carriageBlock.castShadow = true;
      carriageBlock.receiveShadow = true;
      dropCarriageGroup.add(carriageBlock);

      const carriageCrown = new THREE.Mesh(new THREE.BoxGeometry(26, 8, 18), scraperMat);
      carriageCrown.position.set(0, 5, 6);
      dropCarriageGroup.add(carriageCrown);

      const clawJewel = new THREE.Mesh(new THREE.OctahedronGeometry(4.2, 0), emeraldMat);
      clawJewel.position.set(0, -1, 13);
      dropCarriageGroup.add(clawJewel);

      const clawProngGeo = new THREE.BoxGeometry(5.2, 22, 9.5);
      const clawTipGeo = new THREE.BoxGeometry(6.5, 8, 9.5);
      const leftClawProng = new THREE.Group();
      const leftUpperJaw = new THREE.Mesh(clawProngGeo, toothMat);
      leftUpperJaw.castShadow = true;
      leftClawProng.add(leftUpperJaw);
      const leftLowerTip = new THREE.Mesh(clawTipGeo, scraperMat);
      leftLowerTip.position.set(3.2, -9.5, 0);
      leftLowerTip.rotation.z = -0.38;
      leftClawProng.add(leftLowerTip);
      leftClawProng.position.set(-16.5, -14, 6);
      leftClawProng.rotation.z = 0.14;
      dropCarriageGroup.add(leftClawProng);
      this.dropLeftClaw3D = leftClawProng;

      const rightClawProng = new THREE.Group();
      const rightUpperJaw = new THREE.Mesh(clawProngGeo, toothMat);
      rightUpperJaw.castShadow = true;
      rightClawProng.add(rightUpperJaw);
      const rightLowerTip = new THREE.Mesh(clawTipGeo, scraperMat);
      rightLowerTip.position.set(-3.2, -9.5, 0);
      rightLowerTip.rotation.z = 0.38;
      rightClawProng.add(rightLowerTip);
      rightClawProng.position.set(16.5, -14, 6);
      rightClawProng.rotation.z = -0.14;
      dropCarriageGroup.add(rightClawProng);
      this.dropRightClaw3D = rightClawProng;

      // Vertical Emerald-Gold Aiming Plumb-Line Laser Beam (AimPlumbLine3D) + 3 Plumb Beads + Target Reticle Ring (AimPlumbReticle3D)
      const dropLaserMat = new THREE.MeshBasicMaterial({
        color: 0x39ff7a,
        transparent: true,
        opacity: 0.72
      });
      const dropLaserGlowMat = new THREE.MeshBasicMaterial({
        color: 0xffd84d,
        transparent: true,
        opacity: 0.28
      });
      const dropLaserBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 112, 12), dropLaserMat);
      dropLaserBeam.position.set(0, -68, 2);
      dropCarriageGroup.add(dropLaserBeam);
      this.dropLaserBeam3D = dropLaserBeam;
      this.dropLaserMat3D = dropLaserMat;

      const dropLaserHalo = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 112, 12), dropLaserGlowMat);
      dropLaserHalo.position.set(0, -68, 1);
      dropCarriageGroup.add(dropLaserHalo);
      this.dropLaserGlowMat3D = dropLaserGlowMat;

      this.dropPlumbBeads3D = [];
      const plumbBeadGeo = new THREE.OctahedronGeometry(3.4, 0);
      for (let b = 0; b < 3; b++) {
        const bead = new THREE.Mesh(plumbBeadGeo, b % 2 === 0 ? dropLaserMat : toothMat);
        bead.position.set(0, -36 - b * 28, 3);
        dropCarriageGroup.add(bead);
        this.dropPlumbBeads3D.push(bead);
      }

      const dropReticleGroup = new THREE.Group();
      dropReticleGroup.position.set(0, -118, 0);
      dropReticleGroup.rotation.x = DIORAMA_TILT_X;
      const outerReticleRing = new THREE.Mesh(new THREE.TorusGeometry(14.5, 1.55, 12, 32), dropLaserMat);
      dropReticleGroup.add(outerReticleRing);
      const innerReticleRing = new THREE.Mesh(new THREE.TorusGeometry(7.2, 1.0, 10, 24), dropLaserGlowMat);
      dropReticleGroup.add(innerReticleRing);
      dropCarriageGroup.add(dropReticleGroup);
      this.dropReticle3D = dropReticleGroup;
      this.hasAimPlumbLine3D = true;

      // Live 3D Held Next-Token Preview Coin Mesh inside the Brass Claw
      const defaultTok = {
        id: 'obol',
        typeId: 'obol',
        radius: 18,
        thickness: 5.8,
        colorPrimary: '#e08e3c',
        colorSecondary: '#7a3e12',
        colorRim: '#ffe299'
      };
      const initMats = this.getTokenMaterialArray(defaultTok);
      const previewCoinMesh = new THREE.Mesh(this.baseCoinGeo, initMats.slice(0, 3));
      previewCoinMesh.castShadow = true;
      previewCoinMesh.receiveShadow = true;

      const prevTopTorus = new THREE.Mesh(this.coinRimTorusGeo, initMats[3] || initMats[0]);
      prevTopTorus.position.set(0, 0, 0.49);
      prevTopTorus.scale.set(1, 1, 0.22);
      previewCoinMesh.add(prevTopTorus);

      const prevBotTorus = new THREE.Mesh(this.coinRimTorusGeo, initMats[0]);
      prevBotTorus.position.set(0, 0, -0.49);
      prevBotTorus.scale.set(1, 1, 0.22);
      previewCoinMesh.add(prevBotTorus);

      previewCoinMesh.scale.set(19.5, 19.5, 6.8);
      previewCoinMesh.position.set(0, -16, 8.5);
      previewCoinMesh.rotation.set(DIORAMA_TILT_X, 0, 0);
      dropCarriageGroup.add(previewCoinMesh);
      this.dropPreviewCoinMesh = previewCoinMesh;
      this.dropPreviewCoinEntry = {
        mesh: previewCoinMesh,
        topTorus: prevTopTorus,
        botTorus: prevBotTorus,
        matKey: 'obol_none_std'
      };

      const initCarriagePos = this.boardToWorld(340, 78, 36);
      dropCarriageGroup.position.set(initCarriagePos.x, initCarriagePos.y, initCarriagePos.z);
      this.cabinetGroup.add(dropCarriageGroup);
      this.dropCarriageGroup3D = dropCarriageGroup;

      // 2e. 3D Front Iron Scoring Lip (y = 478), 3D Bullion Vault Hopper Bars, 3D Guillotine Blade & 3D Arcade Buttons
      const frontLipPos = this.boardToWorld(340, 478, 4);
      const frontLipMat = new THREE.MeshStandardMaterial({
        color: 0xc8923b,
        metalness: 0.78,
        roughness: 0.24,
        bumpMap: metalBump,
        bumpScale: 1.15,
        emissive: new THREE.Color(0x3b2208),
        emissiveIntensity: 0.24
      });
      this.injectWorldSdfGiShader(frontLipMat);
      const frontLipMesh = new THREE.Mesh(
        new THREE.BoxGeometry(534, 16, 16),
        frontLipMat
      );
      frontLipMesh.position.set(frontLipPos.x, frontLipPos.y, 4);
      frontLipMesh.castShadow = true;
      frontLipMesh.receiveShadow = true;
      for (let r = 0; r < 10; r++) {
        const rx = -234 + r * 52;
        const rivet = new THREE.Mesh(boltGeo, toothMat);
        rivet.position.set(rx, 0, 8.2);
        frontLipMesh.add(rivet);
      }
      this.cabinetGroup.add(frontLipMesh);

      // Deep 3D Recessed Bullion Vault Chute Floor, Beveled Brass Dividers & Scattered Gold Bullion Ingots
      const vaultBack = new THREE.Mesh(
        new THREE.BoxGeometry(526, 134, 10),
        new THREE.MeshStandardMaterial({
          color: 0x120b07,
          metalness: 0.64,
          roughness: 0.42,
          bumpMap: metalBump,
          bumpScale: 1.15,
          emissive: new THREE.Color(0x1f0e04),
          emissiveIntensity: 0.24
        })
      );
      const vaultPos = this.boardToWorld(340, 560, -14);
      vaultBack.position.set(vaultPos.x, vaultPos.y + 8, -18);
      this.cabinetGroup.add(vaultBack);

      const vaultDividerSpineGeo = new THREE.BoxGeometry(4.6, 118, 10);
      const vaultBarGeo = new THREE.CylinderGeometry(3.2, 3.2, 118, 16);
      const vaultCollarGeo = new THREE.CylinderGeometry(5.2, 5.2, 7.5, 16);
      const vaultTieRod = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 396, 12),
        grateRibMat
      );
      vaultTieRod.rotation.z = Math.PI * 0.5;
      vaultTieRod.position.set(54, vaultPos.y - 2, -6);
      this.cabinetGroup.add(vaultTieRod);

      // 11 Beveled Brass & Gunmetal Vault Chute Dividers across the main Bullion Vault Hopper (x = -126..+234)
      for (let b = 0; b < 11; b++) {
        const bx = -126 + b * 36;
        const spine = new THREE.Mesh(vaultDividerSpineGeo, grateRibMat);
        spine.position.set(bx, vaultPos.y + 10, -8);
        this.cabinetGroup.add(spine);

        const bar = new THREE.Mesh(vaultBarGeo, toothMat);
        bar.position.set(bx, vaultPos.y + 10, -2.5);
        bar.castShadow = true;
        bar.receiveShadow = true;
        this.cabinetGroup.add(bar);

        const topCollar = new THREE.Mesh(vaultCollarGeo, scraperMat);
        topCollar.position.set(bx, vaultPos.y + 62, -3);
        this.cabinetGroup.add(topCollar);

        const botCollar = new THREE.Mesh(vaultCollarGeo, scraperMat);
        botCollar.position.set(bx, vaultPos.y - 42, -3);
        this.cabinetGroup.add(botCollar);
      }

      // Recessed Dark Emerald-Velvet Vault Floor & Neat Beveled Gold Bullion Ingot Stacks Centered Inside the 10 Chute Bays (Zero Bar Intersection)
      const vaultVelvetBed = new THREE.Mesh(
        new THREE.BoxGeometry(364, 52, 6),
        new THREE.MeshStandardMaterial({
          color: 0x0a2415,
          metalness: 0.12,
          roughness: 0.78,
          emissive: new THREE.Color(0x05140b),
          emissiveIntensity: 0.25
        })
      );
      vaultVelvetBed.position.set(54, vaultPos.y - 22, -16.5);
      this.cabinetGroup.add(vaultVelvetBed);

      const bullionGoldMat = new THREE.MeshStandardMaterial({
        color: 0xf5c856,
        metalness: 0.62,
        roughness: 0.34,
        emissive: new THREE.Color(0x523406),
        emissiveIntensity: 0.28
      });
      const bullionTopMat = new THREE.MeshStandardMaterial({
        color: 0xffe48a,
        metalness: 0.56,
        roughness: 0.32,
        emissive: new THREE.Color(0x664208),
        emissiveIntensity: 0.32
      });
      const ingotBaseGeo = new THREE.BoxGeometry(21, 9.5, 5.0);
      const ingotCapGeo = new THREE.BoxGeometry(17.5, 7.2, 2.2);
      const vaultCoinStackGeo = new THREE.CylinderGeometry(7.2, 7.2, 6.5, 20);
      for (let bay = 0; bay < 10; bay++) {
        // Each bay is 36px wide between bars at (-126 + b * 36); bay center is at -108 + bay * 36
        const bayX = -108 + bay * 36;
        const ingotGroup = new THREE.Group();
        ingotGroup.position.set(bayX, vaultPos.y - 29 + (bay % 2) * 3.5, -12.5);

        const baseBar = new THREE.Mesh(ingotBaseGeo, bullionGoldMat);
        baseBar.castShadow = true;
        ingotGroup.add(baseBar);

        const capBar = new THREE.Mesh(ingotCapGeo, bullionTopMat);
        capBar.position.set(0, 0.4, 3.2);
        ingotGroup.add(capBar);

        this.cabinetGroup.add(ingotGroup);

        if (bay % 2 === 0) {
          const cStack = new THREE.Mesh(vaultCoinStackGeo, bullionTopMat);
          cStack.position.set(bayX, vaultPos.y - 17, -12.8);
          cStack.rotation.x = 0.22;
          this.cabinetGroup.add(cStack);
        }
      }

      // 3D Bullion Vault Chute Marquee Bar ('▼ BULLION VAULT — COINS OVER THE LIP PAY QUOTA ▼')
      // Centered cleanly over the unobstructed main Bullion Vault Hopper (x = -125..+230)
      const vaultPlaque = this.create3DPlaqueMesh(
        282,
        20,
        5.5,
        '▼ BULLION VAULT — COINS OVER THE LIP PAY QUOTA ▼',
        '#ffd875',
        '#2c1a0a',
        '#120903',
        '#ffeaad'
      );
      vaultPlaque.position.set(54, vaultPos.y + 30, 14);
      vaultPlaque.rotation.x = DIORAMA_TILT_X * 0.5;
      this.cabinetGroup.add(vaultPlaque);
      this.vaultPlaque3D = vaultPlaque;

      // Dedicated Left-Side 3D Guillotine & Finger Collateral Pillory Bay (centered at x = -190)
      const pilloryIronMat = new THREE.MeshStandardMaterial({
        color: 0x2c201a,
        metalness: 0.78,
        roughness: 0.34,
        emissive: new THREE.Color(0x160804),
        emissiveIntensity: 0.22
      });
      const pilloryWalnutMat = new THREE.MeshStandardMaterial({
        color: 0x3b2112,
        metalness: 0.22,
        roughness: 0.62,
        emissive: new THREE.Color(0x170903),
        emissiveIntensity: 0.20
      });
      const guideTrackMat = new THREE.MeshStandardMaterial({
        color: 0x9aa4b0,
        metalness: 0.88,
        roughness: 0.20
      });
      const pilloryPostGeo = new THREE.BoxGeometry(7.5, 86, 12);
      const guideTrackGeo = new THREE.BoxGeometry(2.8, 82, 6);
      for (const postX of [-238, -142]) {
        const postMesh = new THREE.Mesh(pilloryPostGeo, pilloryIronMat);
        postMesh.position.set(postX, vaultPos.y + 14, 8);
        postMesh.castShadow = true;
        postMesh.receiveShadow = true;
        this.cabinetGroup.add(postMesh);

        const trackDir = postX < -190 ? 1 : -1;
        const trackMesh = new THREE.Mesh(guideTrackGeo, guideTrackMat);
        trackMesh.position.set(postX + trackDir * 4.2, vaultPos.y + 14, 9);
        this.cabinetGroup.add(trackMesh);
      }

      const pilloryHeaderBeam = new THREE.Mesh(
        new THREE.BoxGeometry(108, 14, 15),
        pilloryIronMat
      );
      pilloryHeaderBeam.position.set(-190, vaultPos.y + 54, 10);
      pilloryHeaderBeam.castShadow = true;
      pilloryHeaderBeam.receiveShadow = true;
      this.cabinetGroup.add(pilloryHeaderBeam);

      // Central Brass Guillotine Hoist Rod beneath Header Beam
      const hoistRod = new THREE.Mesh(
        new THREE.CylinderGeometry(2.0, 2.0, 18, 10),
        toothMat
      );
      hoistRod.position.set(-190, vaultPos.y + 44, 9);
      this.cabinetGroup.add(hoistRod);

      // 3D Collateral Stock Plaque ('COLLATERAL STOCK') mounted on front of top cast-iron header beam
      const collateralPlaque = this.create3DPlaqueMesh(
        106,
        14,
        4,
        'COLLATERAL STOCK',
        '#e69d45',
        '#2d120a',
        '#140603',
        '#ffdbb0'
      );
      collateralPlaque.position.set(-190, vaultPos.y + 54, 16);
      collateralPlaque.rotation.x = DIORAMA_TILT_X * 0.5;
      this.cabinetGroup.add(collateralPlaque);
      this.collateralPlaque3D = collateralPlaque;

      // 2-Piece Dark Walnut & Wrought-Iron 3-Hole Pillory Stock Bar Clamping the 3 Severed Fingers
      const pilloryLowerTimber = new THREE.Mesh(
        new THREE.BoxGeometry(96, 11, 16),
        pilloryWalnutMat
      );
      pilloryLowerTimber.position.set(-190, vaultPos.y - 23, 8);
      pilloryLowerTimber.castShadow = true;
      pilloryLowerTimber.receiveShadow = true;
      this.cabinetGroup.add(pilloryLowerTimber);

      const pilloryUpperTimber = new THREE.Mesh(
        new THREE.BoxGeometry(96, 7.5, 15),
        pilloryWalnutMat
      );
      pilloryUpperTimber.position.set(-190, vaultPos.y - 13.5, 7.5);
      pilloryUpperTimber.castShadow = true;
      this.cabinetGroup.add(pilloryUpperTimber);

      const pillorySeamLine = new THREE.Mesh(
        new THREE.BoxGeometry(97, 1.4, 16.4),
        pilloryIronMat
      );
      pillorySeamLine.position.set(-190, vaultPos.y - 17.5, 8.2);
      this.cabinetGroup.add(pillorySeamLine);

      // Wrought-Iron Pillory End Straps & Brass Clamping Studs
      const stockStrapGeo = new THREE.BoxGeometry(6.5, 19.5, 17);
      const stockRivetGeo = new THREE.SphereGeometry(1.5, 10, 8);
      for (const sx of [-231, -149]) {
        const strap = new THREE.Mesh(stockStrapGeo, pilloryIronMat);
        strap.position.set(sx, vaultPos.y - 18, 8.2);
        this.cabinetGroup.add(strap);
        for (const sy of [-22, -14]) {
          const stud = new THREE.Mesh(stockRivetGeo, toothMat);
          stud.position.set(sx, vaultPos.y + sy, 16.8);
          this.cabinetGroup.add(stud);
        }
      }

      // 3D Guillotine Blade (88px wide) with Diagonal Bevel Edge hanging menacingly above the 3 Pillory Fingers
      const guillotineGroup = new THREE.Group();
      const bladeStockBar = new THREE.Mesh(
        new THREE.BoxGeometry(88, 6.5, 8.5),
        pilloryIronMat
      );
      bladeStockBar.position.set(0, 6.5, 0);
      guillotineGroup.add(bladeStockBar);

      const bladeShapeMesh = new THREE.Mesh(
        new THREE.BoxGeometry(86, 15, 5),
        new THREE.MeshStandardMaterial({
          color: 0xc8d2dc,
          metalness: 0.90,
          roughness: 0.18,
          emissive: new THREE.Color(0x280808),
          emissiveIntensity: 0.22
        })
      );
      bladeShapeMesh.rotation.z = -0.075;
      guillotineGroup.add(bladeShapeMesh);

      const razorEdge = new THREE.Mesh(
        new THREE.BoxGeometry(88, 3.8, 6),
        new THREE.MeshStandardMaterial({
          color: 0xff2a18,
          metalness: 0.4,
          roughness: 0.2,
          emissive: new THREE.Color(0xff1e0d),
          emissiveIntensity: 1.45
        })
      );
      razorEdge.position.set(0, -8.2, 0.5);
      razorEdge.rotation.z = -0.075;
      guillotineGroup.add(razorEdge);

      this.guillotineBaseY = vaultPos.y + 36;
      guillotineGroup.position.set(-190, this.guillotineBaseY, 9);
      this.cabinetGroup.add(guillotineGroup);
      this.guillotineBlade3D = guillotineGroup;

      // 3 Smooth Continuous Anatomical Collateral Fingers Locked in the 3-Hole Walnut & Iron Pillory Stock
      // (Zero disjointed snowman spheres, zero white bottom rings; smooth tapered phalanges with bruised crimson joint creases, pale keratin fingernails & ruby signet ring)
      this.fingerStocks3D = [];
      const fingerMat = new THREE.MeshStandardMaterial({
        color: 0xe6b994,
        metalness: 0.10,
        roughness: 0.46,
        emissive: new THREE.Color(0x3b1d0d),
        emissiveIntensity: 0.24
      });
      const wrinkleCreaseMat = new THREE.MeshStandardMaterial({
        color: 0x6e221c,
        metalness: 0.10,
        roughness: 0.62,
        emissive: new THREE.Color(0x2e0806),
        emissiveIntensity: 0.25
      });
      const nailBedMat = new THREE.MeshStandardMaterial({
        color: 0xb85849,
        metalness: 0.14,
        roughness: 0.44,
        emissive: new THREE.Color(0x3d120c),
        emissiveIntensity: 0.24
      });
      const fingernailMat = new THREE.MeshStandardMaterial({
        color: 0xfff0df,
        metalness: 0.24,
        roughness: 0.22,
        emissive: new THREE.Color(0x523824),
        emissiveIntensity: 0.26
      });
      const rubyGemMat = new THREE.MeshStandardMaterial({
        color: 0xd4142a,
        metalness: 0.35,
        roughness: 0.16,
        emissive: new THREE.Color(0x8a0814),
        emissiveIntensity: 0.62
      });
      // Smooth continuous cylinder radii (radiusTop matches next segment's radiusBottom) so each finger has a lifelike continuous silhouette
      const proxPhalanxGeo = new THREE.CylinderGeometry(5.6, 6.2, 9.5, 20);
      const midPhalanxGeo = new THREE.CylinderGeometry(5.0, 5.6, 8.2, 20);
      const distPhalanxGeo = new THREE.CylinderGeometry(4.3, 5.0, 7.0, 20);
      const fingerTipGeo = new THREE.SphereGeometry(4.3, 18, 14);
      const jointCreaseGeo = new THREE.BoxGeometry(7.2, 0.58, 1.2);
      const nailBedRecessGeo = new THREE.BoxGeometry(5.8, 6.4, 1.4);
      const fingernailPlateGeo = new THREE.BoxGeometry(5.0, 5.8, 1.2);
      const fingerRingGeo = new THREE.TorusGeometry(6.0, 1.15, 12, 24);
      fingerRingGeo.rotateX(Math.PI * 0.5);
      const stockHoleCollarGeo = new THREE.TorusGeometry(6.6, 1.35, 12, 24);
      stockHoleCollarGeo.rotateX(Math.PI * 0.38);

      const fingerSpecs = [
        { x: -216, splayZ: 0.045, scaleX: 0.95, scaleY: 0.94, scaleZ: 0.95 },
        { x: -190, splayZ: 0.0, scaleX: 1.02, scaleY: 1.08, scaleZ: 1.02 },
        { x: -164, splayZ: -0.045, scaleX: 0.94, scaleY: 0.96, scaleZ: 0.94 }
      ];
      for (let f = 0; f < 3; f++) {
        const spec = fingerSpecs[f];
        const fGroup = new THREE.Group();
        fGroup.position.set(spec.x, vaultPos.y - 6.5, 11.0);
        fGroup.scale.set(spec.scaleX, spec.scaleY, spec.scaleZ);
        fGroup.rotation.z = spec.splayZ;
        fGroup.rotation.x = 0.16;

        // Dark Wrought-Iron Pillory Hole Collar clamping the base of the finger into the walnut stock
        const holeCollar = new THREE.Mesh(stockHoleCollarGeo, pilloryIronMat);
        holeCollar.position.set(0, -10.8, 0.2);
        fGroup.add(holeCollar);

        // 1. Proximal Phalanx emerging from the pillory stock hole
        const proxMesh = new THREE.Mesh(proxPhalanxGeo, fingerMat);
        proxMesh.position.set(0, -6.2, 0);
        proxMesh.castShadow = true;
        proxMesh.receiveShadow = true;
        fGroup.add(proxMesh);

        // Subtle Bruised Crimson-Violet PIP Joint Skin Creases (2 thin anatomical lines)
        for (const cy of [-2.1, -1.1]) {
          const pipCrease = new THREE.Mesh(jointCreaseGeo, wrinkleCreaseMat);
          pipCrease.position.set(0, cy, 5.1);
          fGroup.add(pipCrease);
        }

        // 2. Smoothly Connected Middle Phalanx
        const midMesh = new THREE.Mesh(midPhalanxGeo, fingerMat);
        midMesh.position.set(0, 2.4, 0.1);
        midMesh.castShadow = true;
        midMesh.receiveShadow = true;
        fGroup.add(midMesh);

        // Subtle Bruised Crimson-Violet DIP Joint Skin Creases
        for (const cy of [6.0, 6.8]) {
          const dipCrease = new THREE.Mesh(jointCreaseGeo, wrinkleCreaseMat);
          dipCrease.scale.set(0.86, 1.0, 1.0);
          dipCrease.position.set(0, cy, 4.6);
          fGroup.add(dipCrease);
        }

        // 3. Tapered Distal Phalanx & Smooth Rounded Fingertip
        const distMesh = new THREE.Mesh(distPhalanxGeo, fingerMat);
        distMesh.position.set(0, 9.8, 0.2);
        distMesh.castShadow = true;
        distMesh.receiveShadow = true;
        fGroup.add(distMesh);

        const fTip = new THREE.Mesh(fingerTipGeo, fingerMat);
        fTip.position.set(0, 13.2, 0.2);
        fTip.scale.set(1.0, 0.86, 0.96);
        fTip.castShadow = true;
        fGroup.add(fTip);

        // Prominent Front-Facing Recessed Pink-Crimson Nail Bed & Pale Ivory Keratin Fingernail Plate
        const nailBed = new THREE.Mesh(nailBedRecessGeo, nailBedMat);
        nailBed.position.set(0, 10.8, 4.0);
        nailBed.rotation.x = -0.12;
        fGroup.add(nailBed);

        const fNail = new THREE.Mesh(fingernailPlateGeo, fingernailMat);
        fNail.position.set(0, 11.1, 4.45);
        fNail.rotation.x = -0.12;
        fGroup.add(fNail);

        // Gold & Ruby Signet Ring on the Middle Finger (f === 1)
        if (f === 1) {
          const fGoldRing = new THREE.Mesh(fingerRingGeo, toothMat);
          fGoldRing.position.set(0, -5.2, 0.1);
          fGoldRing.castShadow = true;
          fGroup.add(fGoldRing);

          const signetSetting = new THREE.Mesh(
            new THREE.CylinderGeometry(2.3, 2.6, 1.6, 8),
            toothMat
          );
          signetSetting.rotation.x = Math.PI * 0.5;
          signetSetting.position.set(0, -5.2, 5.9);
          fGroup.add(signetSetting);

          const fRubySignet = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 10), rubyGemMat);
          fRubySignet.position.set(0, -5.2, 6.6);
          fGroup.add(fRubySignet);
        }

        this.cabinetGroup.add(fGroup);
        this.fingerStocks3D.push(fGroup);
      }

      // 6 Physical 3D Illuminated & Labeled Arcade Control-Deck Pushbuttons with Octagonal 8-Rivet Brass Mounting Flanges
      const buttonDeckGroup = new THREE.Group();
      const apronLedge = new THREE.Mesh(
        new THREE.BoxGeometry(588, 56, 36),
        new THREE.MeshStandardMaterial({
          color: 0x1a0e08,
          metalness: 0.55,
          roughness: 0.42
        })
      );
      apronLedge.position.set(0, -284, 18);
      apronLedge.rotation.x = 0.22;
      buttonDeckGroup.add(apronLedge);

      const octFlangeGeo = new THREE.CylinderGeometry(24.0, 25.5, 5.5, 8);
      octFlangeGeo.rotateY(Math.PI / 8);
      const btnGuardRingGeo = new THREE.TorusGeometry(19.2, 2.4, 12, 28);
      btnGuardRingGeo.rotateX(Math.PI * 0.5);
      const btnRivetGeo = new THREE.SphereGeometry(1.45, 10, 8);

      const btnDefs = [
        { top: 'SLAM', bot: '[SPACE]', hex: '#c87018' },
        { top: 'BLOOD PACT', bot: '[B]', hex: '#c41e1e' },
        { top: 'SWAP COIN', bot: '[R]', hex: '#d4961a' },
        { top: 'PAY QUOTA', bot: '[EARLY]', hex: '#1a9442' },
        { top: 'POUCH &', bot: 'BRANDS', hex: '#7a2e8a' },
        { top: "SINNER'S", bot: 'GRIMOIRE', hex: '#187c88' }
      ];

      for (let b = 0; b < btnDefs.length; b++) {
        const def = btnDefs[b];
        const bx = -215 + b * 86;
        const btnAssembly = new THREE.Group();
        btnAssembly.position.set(bx, -278, 34);
        btnAssembly.rotation.x = Math.PI * 0.56;

        // 1. Stepped Octagonal Brass Mounting Flange + 8 Perimeter Micro-Rivets (`arcade-pushbutton.glb` style)
        const octFlange = new THREE.Mesh(octFlangeGeo, scraperMat);
        octFlange.castShadow = true;
        octFlange.receiveShadow = true;
        btnAssembly.add(octFlange);

        for (let rIdx = 0; rIdx < 8; rIdx++) {
          const rAng = rIdx * (Math.PI * 0.25) + Math.PI * 0.125;
          const bRivet = new THREE.Mesh(btnRivetGeo, pilloryIronMat);
          bRivet.position.set(Math.cos(rAng) * 21.4, 2.8, Math.sin(rAng) * 21.4);
          btnAssembly.add(bRivet);
        }

        // 2. Raised Beveled Brass Guard Bezel Ring
        const guardBezel = new THREE.Mesh(btnGuardRingGeo, toothMat);
        guardBezel.position.set(0, 3.6, 0);
        btnAssembly.add(guardBezel);

        const capCanvas = document.createElement('canvas');
        capCanvas.width = 256;
        capCanvas.height = 256;
        const cCtx = capCanvas.getContext('2d');
        const rGrad = cCtx.createRadialGradient(104, 96, 16, 128, 128, 124);
        rGrad.addColorStop(0, '#ffffff');
        rGrad.addColorStop(0.22, def.hex);
        rGrad.addColorStop(0.85, def.hex);
        rGrad.addColorStop(1, '#120804');
        cCtx.fillStyle = rGrad;
        cCtx.beginPath();
        cCtx.arc(128, 128, 124, 0, Math.PI * 2);
        cCtx.fill();

        // Concentric Fresnel Lens Diffuser Rings
        for (const fRad of [76, 96, 114]) {
          cCtx.strokeStyle = fRad === 114 ? 'rgba(255, 232, 168, 0.72)' : 'rgba(255, 255, 255, 0.18)';
          cCtx.lineWidth = fRad === 114 ? 5.5 : 2.2;
          cCtx.beginPath();
          cCtx.arc(128, 128, fRad, 0, Math.PI * 2);
          cCtx.stroke();
        }

        cCtx.save();
        cCtx.translate(128, 128);
        cCtx.rotate(-Math.PI * 0.5);
        cCtx.font = 'bold 31px "JetBrains Mono", monospace';
        cCtx.textAlign = 'center';
        cCtx.textBaseline = 'middle';
        cCtx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        cCtx.fillText(def.top, 2, -18);
        cCtx.fillText(def.bot, 2, 22);
        cCtx.fillStyle = '#fffdf6';
        cCtx.fillText(def.top, 0, -20);
        cCtx.fillText(def.bot, 0, 20);
        cCtx.restore();

        const capTex = new THREE.CanvasTexture(capCanvas);
        if ('colorSpace' in capTex && THREE.SRGBColorSpace) capTex.colorSpace = THREE.SRGBColorSpace;
        capTex.anisotropy = this.maxAnisotropy || 8;
        capTex.needsUpdate = true;

        const sideCapMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(def.hex),
          metalness: 0.28,
          roughness: 0.24,
          emissive: new THREE.Color(def.hex),
          emissiveIntensity: 0.32
        });
        const topCapMat = new THREE.MeshStandardMaterial({
          map: capTex,
          color: 0xffffff,
          metalness: 0.22,
          roughness: 0.20,
          emissive: new THREE.Color(def.hex),
          emissiveMap: capTex,
          emissiveIntensity: 0.42
        });

        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(16.6, 17.6, 9.5, 28),
          [sideCapMat, topCapMat, sideCapMat]
        );
        cap.position.set(0, 5.8, 0);
        btnAssembly.add(cap);
        buttonDeckGroup.add(btnAssembly);
      }
      this.cabinetGroup.add(buttonDeckGroup);
      this.buttonDeckGroup3D = buttonDeckGroup;

      // 2f. Heavy 3D Mahogany & Cast-Iron Outer Arcade Cabinet Side Walls, Left 3D Guillotine Pillory Wing (`guillotine-pillory-assembly.glb`),
      //     Right 3D Contraband Relic Rack Wing (`contraband-relic-rack.glb`), and Candlelit 3D Crypt Booth Stage
      const outerMahoganyMat = new THREE.MeshStandardMaterial({
        color: 0x2a140a,
        metalness: 0.28,
        roughness: 0.56,
        bumpMap: metalBump,
        bumpScale: 0.85,
        emissive: new THREE.Color(0x120602),
        emissiveIntensity: 0.20
      });
      const cryptStoneMat = new THREE.MeshStandardMaterial({
        color: 0x1a1514,
        metalness: 0.18,
        roughness: 0.78,
        bumpMap: metalBump,
        bumpScale: 1.25,
        emissive: new THREE.Color(0x0c0705),
        emissiveIntensity: 0.18
      });
      const candleWaxMat = new THREE.MeshStandardMaterial({
        color: 0xf0dfb8,
        metalness: 0.08,
        roughness: 0.48,
        emissive: new THREE.Color(0x6e4212),
        emissiveIntensity: 0.45
      });
      const candleFlameMat = new THREE.MeshBasicMaterial({
        color: 0xffb838
      });

      const cryptBoothGroup = new THREE.Group();

      // Thick 3D Mahogany & Brass Outer Cabinet Side Walls (x = ±348) & Upright Backbox Hood
      const sideWallGeo = new THREE.BoxGeometry(18, 668, 68);
      const sideRailTrimGeo = new THREE.BoxGeometry(22, 672, 6.5);
      for (const side of [-1, 1]) {
        const sWall = new THREE.Mesh(sideWallGeo, outerMahoganyMat);
        sWall.position.set(side * 348, 8, 12);
        sWall.castShadow = false;
        sWall.receiveShadow = true;
        cryptBoothGroup.add(sWall);

        const sTrim = new THREE.Mesh(sideRailTrimGeo, toothMat);
        sTrim.position.set(side * 348, 8, 47);
        sTrim.castShadow = false;
        cryptBoothGroup.add(sTrim);

        for (let r = 0; r < 14; r++) {
          const ry = -280 + r * 44;
          const sRivet = new THREE.Mesh(btnRivetGeo, pilloryIronMat);
          sRivet.position.set(side * 348, ry, 51);
          cryptBoothGroup.add(sRivet);
        }
      }

      // Upright 3D Mahogany & Brass Backbox Arch Canopy positioned high above the Collector Porthole (never overhanging or clipping it)
      const backboxCanopy = new THREE.Mesh(new THREE.BoxGeometry(716, 28, 46), outerMahoganyMat);
      backboxCanopy.position.set(0, 376, 8);
      backboxCanopy.castShadow = false;
      cryptBoothGroup.add(backboxCanopy);

      const backboxBrassCornice = new THREE.Mesh(new THREE.BoxGeometry(724, 10, 50), toothMat);
      backboxBrassCornice.position.set(0, 358, 10);
      backboxBrassCornice.castShadow = false;
      cryptBoothGroup.add(backboxBrassCornice);

      // Left Crypt Booth Wing Pedestal: 3D Guillotine & Collateral Pillory Shrine (`guillotine-pillory-assembly.glb`)
      const leftPedestalGroup = new THREE.Group();
      leftPedestalGroup.position.set(-418, -32, 6);
      const leftPedBase = new THREE.Mesh(new THREE.BoxGeometry(116, 236, 46), outerMahoganyMat);
      leftPedBase.position.set(0, 0, -14);
      leftPedBase.castShadow = false;
      leftPedBase.receiveShadow = true;
      leftPedestalGroup.add(leftPedBase);

      const leftPedTrim = new THREE.Mesh(new THREE.BoxGeometry(122, 242, 6), toothMat);
      leftPedTrim.position.set(0, 0, 10);
      leftPedestalGroup.add(leftPedTrim);

      // Procedural 3D Guillotine Tower & Pillory on Left Wing + GLB Mount Container
      for (const px of [-38, 38]) {
        const wPost = new THREE.Mesh(new THREE.BoxGeometry(8, 120, 18), pilloryIronMat);
        wPost.position.set(px, 12, 22);
        wPost.castShadow = false;
        leftPedestalGroup.add(wPost);
      }
      const wHeader = new THREE.Mesh(new THREE.BoxGeometry(92, 16, 22), pilloryIronMat);
      wHeader.position.set(0, 72, 24);
      leftPedestalGroup.add(wHeader);

      const wBlade = new THREE.Mesh(
        new THREE.BoxGeometry(72, 22, 5),
        new THREE.MeshStandardMaterial({
          color: 0xd0dae5,
          metalness: 0.88,
          roughness: 0.18,
          emissive: new THREE.Color(0x4a0808),
          emissiveIntensity: 0.35
        })
      );
      wBlade.position.set(0, 42, 24);
      wBlade.rotation.z = -0.10;
      leftPedestalGroup.add(wBlade);
      this.leftWingGuillotineBlade3D = wBlade;

      const wStock = new THREE.Mesh(new THREE.BoxGeometry(84, 18, 22), pilloryWalnutMat);
      wStock.position.set(0, -24, 22);
      leftPedestalGroup.add(wStock);

      for (const fx of [-22, 0, 22]) {
        const wFinger = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.2, 22, 16), fingerMat);
        wFinger.position.set(fx, -12, 28);
        wFinger.rotation.x = 0.25;
        leftPedestalGroup.add(wFinger);
      }

      this.leftWingGLBMount = new THREE.Group();
      this.leftWingGLBMount.position.set(0, 8, 28);
      leftPedestalGroup.add(this.leftWingGLBMount);

      const leftWingPlaque = this.create3DPlaqueMesh(
        112,
        16,
        5,
        'GUILLOTINE PILLORY',
        '#ff6842',
        '#2b0d08',
        '#140502',
        '#ffd2c2'
      );
      leftWingPlaque.position.set(0, -96, 22);
      leftWingPlaque.rotation.x = 0.35;
      leftPedestalGroup.add(leftWingPlaque);

      const leftWingLight = new THREE.PointLight(0xff6b38, 1.8, 260, 1.3);
      leftWingLight.position.set(0, -20, 95);
      leftPedestalGroup.add(leftWingLight);
      cryptBoothGroup.add(leftPedestalGroup);

      // Right Crypt Booth Wing Pedestal: 6 Riveted Brass-Bezel Steampunk Contraband Contraptions (Matches godot4-view-3-contraband.png)
      const rightPedestalGroup = new THREE.Group();
      rightPedestalGroup.position.set(418, -32, 6);
      const rightPedBase = new THREE.Mesh(new THREE.BoxGeometry(118, 240, 46), outerMahoganyMat);
      rightPedBase.position.set(0, 0, -14);
      rightPedBase.castShadow = false;
      rightPedBase.receiveShadow = true;
      rightPedestalGroup.add(rightPedBase);

      const rightPedTrim = new THREE.Mesh(new THREE.BoxGeometry(124, 246, 6), toothMat);
      rightPedTrim.position.set(0, 0, 10);
      rightPedestalGroup.add(rightPedTrim);

      // Dark Recessed Cast-Iron Backboard Panel inside the Mahogany & Brass Frame
      const rightBackboard = new THREE.Mesh(new THREE.BoxGeometry(108, 224, 5), pilloryIronMat);
      rightBackboard.position.set(0, 4, 12.5);
      rightPedestalGroup.add(rightBackboard);

      // Materials for the 6 Steampunk Contraptions
      const silverSteelMat = new THREE.MeshStandardMaterial({
        color: 0xd8e2ec,
        metalness: 0.88,
        roughness: 0.18,
        emissive: new THREE.Color(0x1c2630),
        emissiveIntensity: 0.22
      });
      const copperCoilMat = new THREE.MeshStandardMaterial({
        color: 0xd95b26,
        metalness: 0.78,
        roughness: 0.24,
        emissive: new THREE.Color(0x4a1604),
        emissiveIntensity: 0.28
      });
      const crimsonAmpouleMat = new THREE.MeshStandardMaterial({
        color: 0xff2e1f,
        metalness: 0.28,
        roughness: 0.16,
        emissive: new THREE.Color(0xd91808),
        emissiveIntensity: 0.85
      });
      const cyanPlasmaMat = new THREE.MeshStandardMaterial({
        color: 0x78f8ff,
        metalness: 0.18,
        roughness: 0.12,
        emissive: new THREE.Color(0x00d8ff),
        emissiveIntensity: 1.45
      });
      const ledActiveMat = new THREE.MeshStandardMaterial({
        color: 0x52ff88,
        metalness: 0.15,
        roughness: 0.15,
        emissive: new THREE.Color(0x28ff68),
        emissiveIntensity: 1.65
      });
      const ledStandbyMat = new THREE.MeshStandardMaterial({
        color: 0xff5428,
        metalness: 0.15,
        roughness: 0.15,
        emissive: new THREE.Color(0xff3208),
        emissiveIntensity: 1.25
      });

      const bezelTorusGeo = new THREE.TorusGeometry(17.5, 2.15, 12, 28);
      const socketWellGeo = new THREE.CylinderGeometry(16.8, 16.8, 2.4, 24);
      socketWellGeo.rotateX(Math.PI * 0.5);
      const bezelRivetGeo = new THREE.SphereGeometry(0.95, 8, 8);
      const ledDomeGeo = new THREE.SphereGeometry(2.3, 12, 10);
      const ledCollarGeo = new THREE.TorusGeometry(2.6, 0.55, 8, 16);

      const contrabandSlotDefs = [
        { label: '[1] GUARDRAILS', active: true },
        { label: '[2] OVERCLOCK', active: true },
        { label: '[3] BLOOD MAGNET', active: true },
        { label: '[4] METRONOME', active: false },
        { label: '[5] TILT WIRE', active: false },
        { label: '[6] TESLA COIL', active: false }
      ];

      for (let cIdx = 0; cIdx < 6; cIdx++) {
        const col = cIdx % 2;
        const row = Math.floor(cIdx / 2); // 0 = top, 1 = mid, 2 = bottom
        const cx = col === 0 ? -26 : 26;
        const cy = 62 - row * 56;
        const slotDef = contrabandSlotDefs[cIdx];

        const slotGroup = new THREE.Group();
        slotGroup.position.set(cx, cy, 16.5);

        // 1. Dark Recessed Cast-Iron Socket Well + Riveted Brass Bezel Ring
        const wellMesh = new THREE.Mesh(socketWellGeo, pilloryIronMat);
        wellMesh.position.set(0, 0, -0.8);
        slotGroup.add(wellMesh);

        const bezelRing = new THREE.Mesh(bezelTorusGeo, toothMat);
        bezelRing.castShadow = true;
        slotGroup.add(bezelRing);

        for (let r = 0; r < 6; r++) {
          const rAng = (r * Math.PI) / 3 + Math.PI / 6;
          const riv = new THREE.Mesh(bezelRivetGeo, scraperMat);
          riv.position.set(Math.cos(rAng) * 17.5, Math.sin(rAng) * 17.5, 1.8);
          slotGroup.add(riv);
        }

        // 2. 12-O'Clock Glowing Status LED Pip in Brass Collar
        const ledCollar = new THREE.Mesh(ledCollarGeo, toothMat);
        ledCollar.position.set(0, 17.5, 2.0);
        slotGroup.add(ledCollar);

        const ledPip = new THREE.Mesh(ledDomeGeo, slotDef.active ? ledActiveMat : ledStandbyMat);
        ledPip.position.set(0, 17.5, 2.4);
        slotGroup.add(ledPip);

        // 3. Unique 3D Steampunk Contraption inside the Socket Well
        if (cIdx === 0) {
          // [1] GUARDRAILS: Twin vertical silver-steel bear-trap rails + 2 copper crossbars + golden core sphere
          for (const rx of [-5.8, 5.8]) {
            const vRail = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 22, 12), silverSteelMat);
            vRail.position.set(rx, 0, 2.2);
            slotGroup.add(vRail);
          }
          for (const ry of [-5.2, 5.2]) {
            const hBar = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 18, 10), copperCoilMat);
            hBar.rotation.z = Math.PI * 0.5;
            hBar.position.set(0, ry, 1.4);
            slotGroup.add(hBar);
          }
          const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(4.2, 14, 12), toothMat);
          coreSphere.position.set(0, 0, 2.8);
          slotGroup.add(coreSphere);
        } else if (cIdx === 1) {
          // [2] OVERCLOCK: Inner brass ring + twin vertical copper pistons + central silver flywheel sphere
          const innerRing = new THREE.Mesh(new THREE.TorusGeometry(10.8, 1.25, 10, 24), toothMat);
          innerRing.position.set(0, 0, 1.5);
          slotGroup.add(innerRing);
          for (const px of [-4.8, 4.8]) {
            const piston = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 18, 12), copperCoilMat);
            piston.position.set(px, 0, 2.2);
            slotGroup.add(piston);
          }
          const flywheel = new THREE.Mesh(new THREE.SphereGeometry(4.0, 14, 12), silverSteelMat);
          flywheel.position.set(0, 0, 3.4);
          slotGroup.add(flywheel);
        } else if (cIdx === 2) {
          // [3] BLOOD MAGNET: Chrome torus ring + twin crimson induction coils + glowing ruby-amber core disc
          const magRing = new THREE.Mesh(new THREE.TorusGeometry(9.8, 2.0, 12, 24), silverSteelMat);
          magRing.position.set(0, 0, 1.8);
          slotGroup.add(magRing);
          for (const mx of [-8.8, 8.8]) {
            const coilSleeve = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 9.5, 12), crimsonAmpouleMat);
            coilSleeve.position.set(mx, 0, 2.4);
            slotGroup.add(coilSleeve);
          }
          const rubyDiscGeo = new THREE.CylinderGeometry(5.6, 5.6, 2.8, 18);
          rubyDiscGeo.rotateX(Math.PI * 0.5);
          const rubyDisc = new THREE.Mesh(rubyDiscGeo, crimsonAmpouleMat);
          rubyDisc.position.set(0, 0, 2.2);
          slotGroup.add(rubyDisc);
        } else if (cIdx === 3) {
          // [4] METRONOME: Toothed brass escapement gear + iron base block + angled pendulum with crimson bob
          const gearDiscGeo = new THREE.CylinderGeometry(8.5, 8.5, 2.2, 12);
          gearDiscGeo.rotateX(Math.PI * 0.5);
          const gearDisc = new THREE.Mesh(gearDiscGeo, toothMat);
          gearDisc.position.set(0, 0, 1.2);
          slotGroup.add(gearDisc);
          const metroBase = new THREE.Mesh(new THREE.BoxGeometry(14, 4.5, 4.5), silverSteelMat);
          metroBase.position.set(0, -6.5, 2.6);
          slotGroup.add(metroBase);
          const pendGroup = new THREE.Group();
          pendGroup.position.set(0, -5.5, 3.2);
          pendGroup.rotation.z = -0.32;
          const pendRod = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 16, 8), silverSteelMat);
          pendRod.position.set(0, 7.0, 0);
          pendGroup.add(pendRod);
          const pendBob = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 10), crimsonAmpouleMat);
          pendBob.position.set(0, 11.5, 0.5);
          pendGroup.add(pendBob);
          slotGroup.add(pendGroup);
        } else if (cIdx === 4) {
          // [5] TILT WIRE: Chrome gimbal ring + top pivot bar + hanging crimson mercury ampoule plumb-bob
          const gimbalRing = new THREE.Mesh(new THREE.TorusGeometry(10.5, 1.4, 10, 24), silverSteelMat);
          gimbalRing.position.set(0, -0.5, 1.8);
          slotGroup.add(gimbalRing);
          const pivotBar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 14, 10), silverSteelMat);
          pivotBar.rotation.z = Math.PI * 0.5;
          pivotBar.position.set(0, 7.5, 2.8);
          slotGroup.add(pivotBar);
          const plumbCone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 11.5, 12), crimsonAmpouleMat);
          plumbCone.rotation.z = Math.PI;
          plumbCone.position.set(0, -0.5, 2.8);
          slotGroup.add(plumbCone);
        } else {
          // [6] TESLA COIL: Glowing cyan plasma core cylinder + 4 stacked crimson-copper coils + cyan corona dome
          const plasmaCore = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.8, 15, 16), cyanPlasmaMat);
          plasmaCore.position.set(0, -1.0, 2.2);
          slotGroup.add(plasmaCore);
          for (let k = 0; k < 4; k++) {
            const coilRadius = 7.2 - k * 0.9;
            const coilRing = new THREE.Mesh(new THREE.TorusGeometry(coilRadius, 1.05, 8, 20), crimsonAmpouleMat);
            coilRing.rotation.x = Math.PI * 0.5;
            coilRing.position.set(0, -6.0 + k * 3.6, 2.4);
            slotGroup.add(coilRing);
          }
          const coronaDome = new THREE.Mesh(new THREE.SphereGeometry(3.8, 14, 12), cyanPlasmaMat);
          coronaDome.position.set(0, 7.8, 2.6);
          slotGroup.add(coronaDome);
        }

        // 4. Engraved Brass Nameplate Plaque underneath each Bezel
        const slotPlaque = this.create3DPlaqueMesh(
          48,
          8.2,
          2.6,
          slotDef.label,
          '#ffd875',
          '#1e1208',
          '#0d0703',
          '#fff2cc'
        );
        slotPlaque.position.set(0, -21.5, 2.2);
        slotGroup.add(slotPlaque);

        rightPedestalGroup.add(slotGroup);
      }

      this.rightWingGLBMount = new THREE.Group();
      this.rightWingGLBMount.position.set(0, 8, 28);
      rightPedestalGroup.add(this.rightWingGLBMount);

      const rightWingPlaque = this.create3DPlaqueMesh(
        112,
        16,
        5,
        'CONTRABAND RELICS',
        '#39ff5a',
        '#0c2816',
        '#041209',
        '#b8ffcb'
      );
      rightWingPlaque.position.set(0, -98, 22);
      rightWingPlaque.rotation.x = 0.35;
      rightPedestalGroup.add(rightWingPlaque);

      const rightWingLight = new THREE.PointLight(0xffcb6b, 1.85, 280, 1.3);
      rightWingLight.position.set(0, 0, 95);
      rightPedestalGroup.add(rightWingLight);
      cryptBoothGroup.add(rightPedestalGroup);

      // 4 Carved Gothic Stone Crypt Pillars & 4 Flickering 3D Wax Candles on Wrought-Iron Sconces
      const pillarGeo = new THREE.CylinderGeometry(24, 28, 720, 16);
      const candleBodyGeo = new THREE.CylinderGeometry(4.8, 5.4, 26, 14);
      candleBodyGeo.rotateX(Math.PI * 0.5);
      const candleSaucerGeo = new THREE.CylinderGeometry(10.5, 7.5, 4.5, 16);
      candleSaucerGeo.rotateX(Math.PI * 0.5);
      const flameGeo = new THREE.ConeGeometry(3.4, 11.0, 12);
      flameGeo.rotateX(Math.PI * 0.5);

      for (const side of [-1, 1]) {
        const stonePillar = new THREE.Mesh(pillarGeo, cryptStoneMat);
        stonePillar.position.set(side * 512, 10, -10);
        stonePillar.castShadow = false;
        stonePillar.receiveShadow = true;
        cryptBoothGroup.add(stonePillar);

        for (const cy of [-185, 145]) {
          const sconceGroup = new THREE.Group();
          sconceGroup.position.set(side * 428, cy, 42);

          const saucer = new THREE.Mesh(candleSaucerGeo, toothMat);
          saucer.position.set(0, 0, 0);
          sconceGroup.add(saucer);

          const waxMesh = new THREE.Mesh(candleBodyGeo, candleWaxMat);
          waxMesh.position.set(0, 0, 14);
          waxMesh.castShadow = true;
          sconceGroup.add(waxMesh);

          const flameMesh = new THREE.Mesh(flameGeo, candleFlameMat);
          flameMesh.position.set(0, 0, 31);
          sconceGroup.add(flameMesh);

          const candleLight = new THREE.PointLight(0xffa438, 1.65, 320, 1.35);
          candleLight.position.set(0, 0, 38);
          sconceGroup.add(candleLight);

          cryptBoothGroup.add(sconceGroup);
        }
      }

      this.cabinetGroup.add(cryptBoothGroup);
      this.cryptBoothGroup3D = cryptBoothGroup;
      this.mountOuterBoothWingGLBs();

      // 3. Shared Geometries for 3D Brass Pachinko Pegs & 3D Spinning Brass Capstan Bumpers
      this.pegWasherGeo = new THREE.CylinderGeometry(8.5, 9.5, 3.2, 24);
      this.pegWasherGeo.rotateX(Math.PI * 0.5);
      this.pegPostGeo = new THREE.CylinderGeometry(4.6, 5.2, 14, 24);
      this.pegPostGeo.rotateX(Math.PI * 0.5);
      this.pegDomeGeo = new THREE.SphereGeometry(4.8, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      this.pegDomeGeo.rotateX(Math.PI * 0.5);
      this.pegRingGeo = new THREE.TorusGeometry(6.6, 1.15, 12, 24);

      this.bumperBaseGeo = new THREE.CylinderGeometry(14.8, 16.2, 4.5, 32);
      this.bumperBaseGeo.rotateX(Math.PI * 0.5);
      this.bumperDrumGeo = new THREE.CylinderGeometry(12.2, 12.8, 9.5, 32);
      this.bumperDrumGeo.rotateX(Math.PI * 0.5);
      this.bumperRimGeo = new THREE.TorusGeometry(11.8, 1.9, 14, 32);
      this.bumperSpokeGeo = new THREE.BoxGeometry(26.5, 2.8, 7.5);
      this.bumperHubGeo = new THREE.CylinderGeometry(4.4, 5.0, 12.5, 20);
      this.bumperHubGeo.rotateX(Math.PI * 0.5);

      this.pegMeshes = [];
      this.bumperMeshes = [];
      if (this.physics) {
        this.syncCabinetProps(this.physics);
      }
    }

    createPeg3DGroup() {
      const THREE = this.THREE;
      const group = new THREE.Group();

      const bronzeMat = new THREE.MeshStandardMaterial({
        color: 0x5c3a18,
        metalness: 0.72,
        roughness: 0.34,
        emissive: new THREE.Color(0x1f1105),
        emissiveIntensity: 0.18
      });

      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xffd875,
        metalness: 0.78,
        roughness: 0.18,
        emissive: new THREE.Color(0x6e4814),
        emissiveIntensity: 0.25
      });

      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xffb838,
        metalness: 0.65,
        roughness: 0.22,
        emissive: new THREE.Color(0x8a520f),
        emissiveIntensity: 0.32
      });

      const washer = new THREE.Mesh(this.pegWasherGeo, bronzeMat);
      washer.position.set(0, 0, 1.6);
      washer.receiveShadow = true;
      group.add(washer);

      const post = new THREE.Mesh(this.pegPostGeo, brassMat);
      post.position.set(0, 0, 7.0);
      post.castShadow = true;
      post.receiveShadow = true;
      group.add(post);

      const dome = new THREE.Mesh(this.pegDomeGeo, brassMat);
      dome.position.set(0, 0, 14.0);
      dome.castShadow = true;
      group.add(dome);

      const ring = new THREE.Mesh(this.pegRingGeo, ringMat);
      ring.position.set(0, 0, 5.2);
      group.add(ring);

      group.userData = { brassMat, ringMat, washer, post, dome, ring };
      return group;
    }

    createBumper3DGroup() {
      const THREE = this.THREE;
      const group = new THREE.Group();
      this.hasMultiTierCapstanBumpers3D = true;

      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1c120d,
        metalness: 0.84,
        roughness: 0.32,
        emissive: new THREE.Color(0x120703),
        emissiveIntensity: 0.18
      });

      const capstanMat = new THREE.MeshStandardMaterial({
        color: 0x2a1d14,
        metalness: 0.86,
        roughness: 0.26,
        emissive: new THREE.Color(0x140802),
        emissiveIntensity: 0.18
      });

      const spokeMat = new THREE.MeshStandardMaterial({
        color: 0xf0b84c,
        metalness: 0.84,
        roughness: 0.20,
        emissive: new THREE.Color(0x6e440c),
        emissiveIntensity: 0.32
      });

      const copperFinMat = new THREE.MeshStandardMaterial({
        color: 0xd87638,
        metalness: 0.82,
        roughness: 0.24,
        emissive: new THREE.Color(0x542208),
        emissiveIntensity: 0.26
      });

      const emeraldCoreMat = new THREE.MeshStandardMaterial({
        color: 0x28ff78,
        metalness: 0.24,
        roughness: 0.16,
        emissive: new THREE.Color(0x16e060),
        emissiveIntensity: 1.25
      });

      const jewelMat = new THREE.MeshStandardMaterial({
        color: 0xffd24d,
        metalness: 0.42,
        roughness: 0.16,
        emissive: new THREE.Color(0x39ff7a),
        emissiveIntensity: 0.92
      });

      const shockwaveMat = new THREE.MeshBasicMaterial({
        color: 0x39ff7a,
        transparent: true,
        opacity: 0.72
      });
      const outerRippleMat = new THREE.MeshBasicMaterial({
        color: 0xffd24d,
        transparent: true,
        opacity: 0.42
      });

      // Tier 1: Octagonal Fluted Victorian Obsidian-Bronze & Brass Base Plinth
      const octBaseGeo = new THREE.CylinderGeometry(20.5, 23.0, 6.5, 8);
      octBaseGeo.rotateX(Math.PI * 0.5);
      const baseMesh = new THREE.Mesh(octBaseGeo, baseMat);
      baseMesh.position.set(0, 0, 3.2);
      baseMesh.receiveShadow = true;
      group.add(baseMesh);

      const brassBaseStepGeo = new THREE.CylinderGeometry(17.8, 19.8, 5.2, 8);
      brassBaseStepGeo.rotateX(Math.PI * 0.5);
      const brassBaseStep = new THREE.Mesh(brassBaseStepGeo, spokeMat);
      brassBaseStep.position.set(0, 0, 7.8);
      brassBaseStep.castShadow = true;
      group.add(brassBaseStep);

      // Tier 2: Expanding 3D Emerald-Gold Shockwave Rings around the Capstan Base
      const shockwaveRing = new THREE.Mesh(
        new THREE.TorusGeometry(26.5, 2.05, 12, 36),
        shockwaveMat
      );
      shockwaveRing.position.set(0, 0, 8.5);
      group.add(shockwaveRing);

      const outerRippleRing = new THREE.Mesh(
        new THREE.TorusGeometry(31.5, 1.25, 10, 36),
        outerRippleMat
      );
      outerRippleRing.position.set(0, 0, 6.5);
      group.add(outerRippleRing);

      // 8 Perimeter Brass Micro-Rivets on the Base Collar
      const collarRivetGeo = new THREE.SphereGeometry(1.65, 8, 8);
      for (let r = 0; r < 8; r++) {
        const rAng = (r * Math.PI) / 4;
        const riv = new THREE.Mesh(collarRivetGeo, spokeMat);
        riv.position.set(Math.cos(rAng) * 18.2, Math.sin(rAng) * 18.2, 10.5);
        group.add(riv);
      }

      // Tier 3: Glowing Emerald Arcane Plasma Core Cylinder + 6 Copper Radial Heat-Sink Fins
      const plasmaCoreGeo = new THREE.CylinderGeometry(13.2, 13.2, 14.0, 24);
      plasmaCoreGeo.rotateX(Math.PI * 0.5);
      const plasmaCore = new THREE.Mesh(plasmaCoreGeo, emeraldCoreMat);
      plasmaCore.position.set(0, 0, 15.5);
      group.add(plasmaCore);

      const finGeo = new THREE.BoxGeometry(33.0, 3.2, 10.5);
      for (let f = 0; f < 3; f++) {
        const fin = new THREE.Mesh(finGeo, copperFinMat);
        fin.rotation.z = (f * Math.PI) / 3;
        fin.position.set(0, 0, 14.8);
        fin.castShadow = true;
        group.add(fin);
      }

      // Tier 4: Rotating 8-Tooth Victorian Brass Gear Ring & Capstan Wheel
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(0, 0, 22.5);

      const drumMesh = new THREE.Mesh(this.bumperDrumGeo, capstanMat);
      drumMesh.scale.set(1.22, 1.22, 1.25);
      drumMesh.castShadow = true;
      drumMesh.receiveShadow = true;
      wheelGroup.add(drumMesh);

      const rimMesh = new THREE.Mesh(
        new THREE.TorusGeometry(16.8, 2.5, 12, 28),
        spokeMat
      );
      rimMesh.position.set(0, 0, 3.8);
      rimMesh.castShadow = true;
      wheelGroup.add(rimMesh);

      for (let k = 0; k < 4; k++) {
        const spoke = new THREE.Mesh(this.bumperSpokeGeo, spokeMat);
        spoke.scale.set(1.25, 1.25, 1.25);
        spoke.rotation.z = (k * Math.PI) / 4;
        spoke.position.set(0, 0, 3.8);
        spoke.castShadow = true;
        wheelGroup.add(spoke);
      }

      // Tier 5: Crowned Brass Top Cap + Faceted Emerald-Gold Dome Finial
      const hubMesh = new THREE.Mesh(this.bumperHubGeo, spokeMat);
      hubMesh.scale.set(1.25, 1.25, 1.25);
      hubMesh.position.set(0, 0, 4.2);
      hubMesh.castShadow = true;
      wheelGroup.add(hubMesh);

      const jewelCollar = new THREE.Mesh(
        new THREE.TorusGeometry(7.8, 1.65, 10, 24),
        spokeMat
      );
      jewelCollar.position.set(0, 0, 8.2);
      wheelGroup.add(jewelCollar);

      const topDomeCap = new THREE.Mesh(
        new THREE.OctahedronGeometry(6.8, 1),
        jewelMat
      );
      topDomeCap.position.set(0, 0, 8.8);
      topDomeCap.scale.set(1, 1, 0.68);
      topDomeCap.castShadow = true;
      wheelGroup.add(topDomeCap);

      group.add(wheelGroup);
      group.userData = {
        wheelGroup,
        capstanMat,
        spokeMat,
        baseMat,
        jewelMat,
        emeraldCoreMat,
        shockwaveRing,
        outerRippleRing,
        shockwaveMat,
        outerRippleMat
      };
      return group;
    }

    syncCabinetProps(physics) {
      if (!physics) return;
      const tiltBase = typeof this.activeDioramaTilt === 'number' ? this.activeDioramaTilt : DIORAMA_TILT_X;

      // 1. Sync 3D Brass Pachinko Pegs (physics.pegs)
      const pegs = physics.pegs || [];
      while (this.pegMeshes.length < pegs.length) {
        const pegGroup = this.createPeg3DGroup();
        this.cabinetGroup.add(pegGroup);
        this.pegMeshes.push(pegGroup);
      }
      while (this.pegMeshes.length > pegs.length) {
        const oldPeg = this.pegMeshes.pop();
        this.cabinetGroup.remove(oldPeg);
      }

      for (let i = 0; i < pegs.length; i++) {
        const peg = pegs[i];
        const pegMesh = this.pegMeshes[i];
        if (!peg || !pegMesh) continue;

        const wPos = this.boardToWorld(peg.x, peg.y, 1.5);
        pegMesh.position.set(wPos.x, wPos.y, wPos.z);
        pegMesh.rotation.set(tiltBase, 0, 0);
        pegMesh.visible = true;

        const hit = Math.max(0, peg.hitTimer || 0);
        const { brassMat, ringMat } = pegMesh.userData;
        if (hit > 0) {
          const flash = Math.min(1, hit * 4.5);
          const scalePulse = 1 + flash * 0.10;
          pegMesh.scale.set(scalePulse, scalePulse, 1 + flash * 0.14);
          brassMat.emissive.setHex(0x8a5210);
          brassMat.emissiveIntensity = 0.25 + flash * 0.28;
          ringMat.emissive.setHex(0xb86b14);
          ringMat.emissiveIntensity = 0.32 + flash * 0.34;
        } else {
          pegMesh.scale.set(1, 1, 1);
          brassMat.emissive.setHex(0x6e4814);
          brassMat.emissiveIntensity = 0.25;
          ringMat.emissive.setHex(0x8a520f);
          ringMat.emissiveIntensity = 0.32;
        }
      }

      // 2. Sync Multi-Tiered 3D Victorian Brass & Emerald-Core Arcane Capstan Bumpers (physics.bumpers)
      const bumpers = physics.bumpers || [];
      const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
      while (this.bumperMeshes.length < bumpers.length) {
        const bumperGroup = this.createBumper3DGroup();
        this.cabinetGroup.add(bumperGroup);
        this.bumperMeshes.push(bumperGroup);
      }
      while (this.bumperMeshes.length > bumpers.length) {
        const oldBumper = this.bumperMeshes.pop();
        this.cabinetGroup.remove(oldBumper);
      }

      for (let i = 0; i < bumpers.length; i++) {
        const b = bumpers[i];
        const bumperMesh = this.bumperMeshes[i];
        if (!b || !bumperMesh) continue;

        const wPos = this.boardToWorld(b.x, b.y, 4.0);
        bumperMesh.position.set(wPos.x, wPos.y, wPos.z);
        bumperMesh.rotation.set(tiltBase, 0, 0);
        bumperMesh.visible = true;

        const {
          wheelGroup,
          capstanMat,
          spokeMat,
          jewelMat,
          emeraldCoreMat,
          shockwaveRing,
          outerRippleRing,
          shockwaveMat,
          outerRippleMat
        } = bumperMesh.userData;
        if (wheelGroup) {
          wheelGroup.rotation.z = -(b.angle || nowSec * 1.4 * (i % 2 === 0 ? 1 : -1));
        }

        const hit = Math.max(0, b.hitTimer || 0);
        const rScale = 1.15;
        const wavePhase = (nowSec * 1.8 + i * 0.5) % 1.0;
        if (shockwaveRing && shockwaveMat) {
          const ringScale = 0.92 + wavePhase * 0.28 + (hit > 0 ? 0.22 : 0);
          shockwaveRing.scale.set(ringScale, ringScale, 1);
          shockwaveMat.opacity = (1.0 - wavePhase * 0.55) * (hit > 0 ? 0.95 : 0.72);
        }
        if (outerRippleRing && outerRippleMat) {
          const outerScale = 0.95 + ((wavePhase + 0.5) % 1.0) * 0.24;
          outerRippleRing.scale.set(outerScale, outerScale, 1);
          outerRippleMat.opacity = 0.38 + Math.sin(nowSec * 5 + i) * 0.14;
        }

        if (hit > 0) {
          const flash = Math.min(1, hit * 4.5);
          const pulse = rScale * (1 + flash * 0.10);
          bumperMesh.scale.set(pulse, pulse, 1 + flash * 0.14);
          capstanMat.emissive.setHex(0x1f0c04);
          capstanMat.emissiveIntensity = 0.22 + flash * 0.20;
          spokeMat.emissive.setHex(0x9e6814);
          spokeMat.emissiveIntensity = 0.36 + flash * 0.32;
          if (emeraldCoreMat) {
            emeraldCoreMat.emissiveIntensity = 1.45 + flash * 0.85;
          }
          if (jewelMat) {
            jewelMat.emissive.setHex(0x64ff9e);
            jewelMat.emissiveIntensity = 1.15 + flash * 0.75;
          }
        } else {
          bumperMesh.scale.set(rScale, rScale, 1);
          capstanMat.emissive.setHex(0x140802);
          capstanMat.emissiveIntensity = 0.18;
          spokeMat.emissive.setHex(0x6e440c);
          spokeMat.emissiveIntensity = 0.32;
          if (emeraldCoreMat) {
            emeraldCoreMat.emissiveIntensity = 1.22 + Math.sin(nowSec * 4.5 + i) * 0.22;
          }
          if (jewelMat) {
            jewelMat.emissive.setHex(0x39ff7a);
            jewelMat.emissiveIntensity = 0.92 + Math.cos(nowSec * 4.0 + i) * 0.18;
          }
        }
      }
    }

    getTokenMaterialArray(coin) {
      const THREE = this.THREE;
      const key = `${coin.typeId || coin.id}_${coin.brand || 'none'}_${coin.isFusedMythic ? 'mythic' : 'std'}`;
      if (this.tokenMaterials.has(key)) {
        return this.tokenMaterials.get(key);
      }

      const size = 512;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      const half = size * 0.5;
      const r = half - 6;

      const cPrimary = coin.colorPrimary || '#e08e3c';
      const cSecondary = coin.colorSecondary || '#7a3e12';
      const cRim = coin.colorRim || '#ffe299';

      ctx.save();
      ctx.translate(half, half);

      // 1. Gleaming Solid-Bullion Metallic Radial Gradient Base Disc + 3D Shaded Outer Rim Bevel
      const grad = ctx.createRadialGradient(-r * 0.34, -r * 0.34, r * 0.04, 0, 0, r);
      grad.addColorStop(0, '#fff3d6');
      grad.addColorStop(0.22, cRim);
      grad.addColorStop(0.60, cPrimary);
      grad.addColorStop(0.88, cSecondary);
      grad.addColorStop(0.96, '#1a0c05');
      grad.addColorStop(1.0, cRim);

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // 3D Directional Outer Bevel Highlight & Shadow Crescent
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.965, Math.PI * 0.75, Math.PI * 1.75, false);
      ctx.strokeStyle = '#fff5d8';
      ctx.lineWidth = 6.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, r * 0.965, -Math.PI * 0.25, Math.PI * 0.75, false);
      ctx.strokeStyle = 'rgba(10, 4, 2, 0.72)';
      ctx.lineWidth = 6.5;
      ctx.stroke();

      // 2. Raised Struck-Bullion Outer Collar & 24 High-Contrast 3D-Shaded Rim Denticles/Beads
      ctx.strokeStyle = cRim;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.935, 0, Math.PI * 2);
      ctx.stroke();

      const denticleCount = 24;
      const denticleRadius = r * 0.885;
      const beadR = 6.4;
      for (let i = 0; i < denticleCount; i++) {
        const a = (i / denticleCount) * Math.PI * 2;
        const bx = Math.cos(a) * denticleRadius;
        const by = Math.sin(a) * denticleRadius;

        ctx.beginPath();
        ctx.arc(bx + 2.0, by + 2.0, beadR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(bx, by, beadR, 0, Math.PI * 2);
        ctx.fillStyle = cRim;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(bx - 1.5, by - 1.5, beadR * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = '#fff8e2';
        ctx.fill();
      }

      // 3. Deep Recessed Antique-Patina Inner Minting Field (r * 0.80 — High-Contrast Bas-Relief Cavity)
      const dishR = r * 0.80;
      const dishGrad = ctx.createRadialGradient(-dishR * 0.18, -dishR * 0.18, dishR * 0.05, 0, 0, dishR);
      dishGrad.addColorStop(0, cPrimary);
      dishGrad.addColorStop(0.38, cSecondary);
      dishGrad.addColorStop(0.82, '#140804');
      dishGrad.addColorStop(1.0, '#090302');

      ctx.beginPath();
      ctx.arc(0, 0, dishR, 0, Math.PI * 2);
      ctx.fillStyle = dishGrad;
      ctx.fill();

      // Deep antique patina cavity glaze so the raised metallic bas-relief emblem pops like struck metal
      ctx.beginPath();
      ctx.arc(0, 0, dishR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 4, 2, 0.48)';
      ctx.fill();

      // 36 Radial Metallic Brushing Rays & Concentric Lathe-Turned Minting Grooves inside the Recessed Dish
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, dishR - 2, 0, Math.PI * 2);
      ctx.clip();
      for (let ray = 0; ray < 36; ray++) {
        const ra = (ray / 36) * Math.PI * 2;
        ctx.strokeStyle = ray % 2 === 0 ? 'rgba(255, 240, 200, 0.09)' : 'rgba(0, 0, 0, 0.18)';
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ra) * 18, Math.sin(ra) * 18);
        ctx.lineTo(Math.cos(ra) * dishR, Math.sin(ra) * dishR);
        ctx.stroke();
      }
      for (const ringR of [dishR * 0.86, dishR * 0.68, dishR * 0.48]) {
        ctx.strokeStyle = 'rgba(255, 232, 180, 0.16)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 12 Engraved Arcane Numeral/Rune Tick Marks along the inner track (dishR * 0.78 to 0.88)
      ctx.strokeStyle = cRim;
      ctx.lineWidth = 3.2;
      for (let t = 0; t < 12; t++) {
        const ta = (t / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ta) * (dishR * 0.77), Math.sin(ta) * (dishR * 0.77));
        ctx.lineTo(Math.cos(ta) * (dishR * 0.89), Math.sin(ta) * (dishR * 0.89));
        ctx.stroke();
      }
      ctx.restore();

      // Diagonal Anisotropic Brushed-Metal Specular Band across the recessed dish
      const lusterGrad = ctx.createLinearGradient(-dishR, -dishR * 0.65, dishR, dishR * 0.65);
      lusterGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      lusterGrad.addColorStop(0.38, 'rgba(255, 246, 218, 0.06)');
      lusterGrad.addColorStop(0.5, 'rgba(255, 250, 232, 0.24)');
      lusterGrad.addColorStop(0.62, 'rgba(255, 246, 218, 0.06)');
      lusterGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.beginPath();
      ctx.arc(0, 0, dishR, 0, Math.PI * 2);
      ctx.fillStyle = lusterGrad;
      ctx.fill();

      // Deep top-left recessed dish step shadow & bright bottom-right counter-bevel
      ctx.beginPath();
      ctx.arc(0, 0, dishR - 2.0, Math.PI * 0.75, Math.PI * 1.75, false);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.lineWidth = 6.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, dishR - 1.5, -Math.PI * 0.25, Math.PI * 0.75, false);
      ctx.strokeStyle = '#fff4d4';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Crisp raised golden bezel ring framing the minting field
      ctx.beginPath();
      ctx.arc(0, 0, dishR + 2.2, 0, Math.PI * 2);
      ctx.strokeStyle = cRim;
      ctx.lineWidth = 5.5;
      ctx.stroke();

      // 4. Deeply Embossed 5-Pass 3D Metallic Bas-Relief Center Emblem (emblemS = r * 0.74)
      if (this.physics && typeof this.physics.drawTokenVectorEmblem === 'function') {
        const emblemS = r * 0.74;
        const reliefPasses = [
          // Pass 1: Deep 3D cast drop shadow onto the recessed field (+8.0, +8.0)
          { ox: 8.0, oy: 8.0, color: 'rgba(0, 0, 0, 0.90)' },
          // Pass 2: Dark burnished side-wall extrusion (+4.8, +4.8)
          { ox: 4.8, oy: 4.8, color: '#1c0c04' },
          // Pass 3: Mid-tone metallic bevel step (+2.4, +2.4)
          { ox: 2.4, oy: 2.4, color: cSecondary },
          // Pass 4: Bright specular top-left chamfer ridge (-2.8, -2.8)
          { ox: -2.8, oy: -2.8, color: '#fff8e4' },
          // Pass 5: Crisp primary struck bullion relief crest at (0, 0)
          { ox: 0, oy: 0, color: cRim }
        ];

        for (let p = 0; p < reliefPasses.length; p++) {
          const pass = reliefPasses[p];
          ctx.save();
          ctx.translate(pass.ox, pass.oy);
          this.physics.drawTokenVectorEmblem(
            ctx,
            coin.typeId || coin.id,
            emblemS,
            pass.color,
            cPrimary
          );
          ctx.restore();
        }
      }

      ctx.restore();

      const faceTex = new THREE.CanvasTexture(c);
      if ('colorSpace' in faceTex && THREE.SRGBColorSpace) {
        faceTex.colorSpace = THREE.SRGBColorSpace;
      }
      faceTex.anisotropy = this.maxAnisotropy || 8;
      faceTex.needsUpdate = true;

      const reliefNormalMap = this.createReliefNormalMapFromCanvas(c);
      if (reliefNormalMap) {
        reliefNormalMap.anisotropy = this.maxAnisotropy || 8;
      }

      const capMat = new THREE.MeshStandardMaterial({
        map: faceTex,
        bumpMap: faceTex,
        bumpScale: 0.42,
        normalMap: reliefNormalMap,
        normalScale: new THREE.Vector2(2.8, 2.8),
        metalness: 0.54,
        roughness: 0.36,
        envMapIntensity: 0.72,
        emissive: new THREE.Color(coin.isFusedMythic ? 0x007a62 : cPrimary),
        emissiveMap: faceTex,
        emissiveIntensity: coin.isFusedMythic ? 0.28 : 0.14
      });
      capMat.userData = { hasCustomReliefNormal: true };

      // Bright Contrasting Reeded Cylinder Wall so 3D thickness & rim ridges gleam without white blowout
      const wallCol = new THREE.Color(cPrimary).lerp(new THREE.Color(cRim), 0.45);
      const sideMat = new THREE.MeshStandardMaterial({
        color: wallCol,
        metalness: 0.55,
        roughness: 0.48,
        envMapIntensity: 0.55,
        bumpMap: this.reededBumpMap,
        bumpScale: 1.8,
        emissive: new THREE.Color(cPrimary),
        emissiveIntensity: 0.14
      });

      // Gleaming 3D Top Bevel Torus Material for crisp coin-on-coin separation
      const bevelMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cRim),
        metalness: 0.46,
        roughness: 0.48,
        envMapIntensity: 0.55,
        emissive: new THREE.Color(cRim),
        emissiveIntensity: 0.16
      });

      this.injectWorldSdfGiShader(sideMat);
      this.injectWorldSdfGiShader(capMat);
      this.injectWorldSdfGiShader(bevelMat);

      const matArray = [sideMat, capMat, capMat, bevelMat];
      this.tokenMaterials.set(key, matArray);
      return matArray;
    }

    syncCoinImpulseFrom2D(coin) {
      if (!coin) return;
      coin._impulseLockFrames = 12;
      const body = this.coinBodies && this.coinBodies.get(coin.uid);
      if (body) {
        if (typeof body.wakeUp === 'function') body.wakeUp();
        body.velocity.set(coin.vx || 0, -(coin.vy || 0), coin.vz || 0);
        if (body.angularVelocity) {
          body.angularVelocity.set(coin.omegaPitch || 0, coin.omegaRoll || 0, -(coin.angularVel || 0));
        }
      }
    }

    stepCannonRigidBodies(physics) {
      if (!this.cannonWorld || !this.CANNON) return;
      const CANNON = this.CANNON;

      const shelfFrontY = physics.shelfY || 222;
      const shelfWorld = this.boardToWorld(340, shelfFrontY - 36, 11);
      this.cannonShelfBody.position.set(shelfWorld.x, shelfWorld.y, shelfWorld.z);

      const activeUids = new Set();
      for (let i = 0; i < physics.coins.length; i++) {
        const c = physics.coins[i];
        activeUids.add(c.uid);

        let body = this.coinBodies.get(c.uid);
        let isNew = false;
        if (!body) {
          isNew = true;
          const r = c.radius || 18;
          const h = Math.max(5.5, Math.min(7.5, c.thickness || 5.8));
          body = new CANNON.Body({
            mass: Math.max(0.5, c.mass || 1.0),
            material: this.cannonMetalMat,
            shape: new CANNON.Cylinder(r, r, h, 12),
            linearDamping: 0.42,
            angularDamping: 0.38
          });
          this.cannonWorld.addBody(body);
          this.coinBodies.set(c.uid, body);
        }

        const baseZ = c.layer === 'shelf' ? 15 : 0;
        const wPos = this.boardToWorld(c.x, c.y, baseZ + (c.z || 0) + (c.stackLayer || 0) * 6);
        body.position.x = wPos.x;
        body.position.y = wPos.y;
        if (isNew || body.position.z < wPos.z || body.position.z > wPos.z + 18) {
          body.position.z = wPos.z;
        }
        if (c._impulseLockFrames && c._impulseLockFrames > 0) {
          c._impulseLockFrames--;
          if (typeof body.wakeUp === 'function') body.wakeUp();
        }
        body.velocity.set(c.vx || 0, -(c.vy || 0), c.vz || 0);
        if (body.angularVelocity) {
          body.angularVelocity.set(c.omegaPitch || 0, c.omegaRoll || 0, -(c.angularVel || 0));
        }
      }

      for (const [uid, body] of this.coinBodies.entries()) {
        if (!activeUids.has(uid)) {
          this.cannonWorld.removeBody(body);
          this.coinBodies.delete(uid);
        }
      }

      try {
        this.cannonWorld.step(1 / 60);
        this.cannonSubstepsLastFrame = 4;
        this.cannonTotalSubsteps = (this.cannonTotalSubsteps || 0) + 4;
      } catch (e) {}

      for (let i = 0; i < physics.coins.length; i++) {
        const c = physics.coins[i];
        const body = this.coinBodies.get(c.uid);
        if (!body) continue;

        const baseZ = c.layer === 'shelf' ? 15 : 0;
        const wPos = this.boardToWorld(c.x, c.y, baseZ + (c.z || 0) + (c.stackLayer || 0) * 6);
        if (body.position.z < wPos.z) {
          body.position.z = wPos.z;
        }
        const q = body.quaternion;
        c.cannonPitch = Math.max(-0.35, Math.min(0.35, (q.x || 0) * 0.85));
        c.cannonRoll = Math.max(-0.35, Math.min(0.35, (q.y || 0) * 0.85));
        c.cannonZOffset = Math.max(0, Math.min(4.5, (body.position.z - wPos.z) * 0.25));
      }
      this.cannonTwoWaySyncedCount = activeUids.size;
    }

    syncCoinMeshMap(coinList, meshMap, isFallingOrChute = false) {
      const THREE = this.THREE;
      const seen = new Set();

      for (let i = 0; i < coinList.length; i++) {
        const c = coinList[i];
        if (!c || c.typeId === 'reliquary_chest' || c.isChest) continue;
        const id = c.uid || `${i}_${c.x}_${c.y}`;
        seen.add(id);

        let entry = meshMap.get(id);
        const matKey = `${c.typeId || c.id}_${c.brand || 'none'}_${c.isFusedMythic ? 'mythic' : 'std'}`;
        if (!entry) {
          const mats = this.getTokenMaterialArray(c);
          const mesh = new THREE.Mesh(this.baseCoinGeo, mats.slice(0, 3));
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          // Add 3D Raised Bullion Bevel Rim Torus on top & bottom faces (flat Z scale so it never casts a tire shadow)
          const topTorus = new THREE.Mesh(this.coinRimTorusGeo, mats[3] || mats[0]);
          topTorus.position.set(0, 0, 0.49);
          topTorus.scale.set(1, 1, 0.22);
          topTorus.castShadow = false;
          topTorus.receiveShadow = false;
          mesh.add(topTorus);

          const botTorus = new THREE.Mesh(this.coinRimTorusGeo, mats[0]);
          botTorus.position.set(0, 0, -0.49);
          botTorus.scale.set(1, 1, 0.22);
          botTorus.castShadow = false;
          botTorus.receiveShadow = false;
          mesh.add(botTorus);

          // 3D Contact Ambient-Occlusion Shadow Disc under every 3D coin
          let contactShadow = null;
          if (this.coinContactShadowGeo && this.coinContactShadowMat) {
            contactShadow = new THREE.Mesh(this.coinContactShadowGeo, this.coinContactShadowMat);
            contactShadow.position.set(0, 0, -0.51);
            contactShadow.castShadow = false;
            contactShadow.receiveShadow = false;
            mesh.add(contactShadow);
          }

          this.coinsGroup.add(mesh);
          entry = {
            mesh,
            topTorus,
            botTorus,
            contactShadow,
            mythicHalo: null,
            fuseBadge: null,
            lastFuseCount: null,
            matKey
          };
          meshMap.set(id, entry);
        } else if (entry.matKey !== matKey) {
          const mats = this.getTokenMaterialArray(c);
          entry.mesh.material = mats.slice(0, 3);
          if (entry.topTorus) entry.topTorus.material = mats[3] || mats[0];
          if (entry.botTorus) entry.botTorus.material = mats[0];
          entry.matKey = matKey;
        }

        // 3D Fused Mythic Halo Torus
        if (c.isFusedMythic) {
          if (!entry.mythicHalo && this.mythicHaloTorusGeo && this.mythicHaloMat) {
            const mythicHalo = new THREE.Mesh(this.mythicHaloTorusGeo, this.mythicHaloMat);
            mythicHalo.scale.set(1.14, 1.14, 0.35);
            mythicHalo.position.set(0, 0, 0.08);
            mythicHalo.castShadow = false;
            mythicHalo.receiveShadow = false;
            entry.mesh.add(mythicHalo);
            entry.mythicHalo = mythicHalo;
          }
          if (entry.mythicHalo) {
            entry.mythicHalo.visible = true;
          }
        } else if (entry.mythicHalo) {
          entry.mythicHalo.visible = false;
        }

        const r = c.radius || 18;
        // Bold 3D numismatic coin cylinder thickness so reeded cylinder walls pop in 3D perspective
        const thickness = Math.max(8.2, Math.min(11.2, (c.thickness || 6.2) * 1.45));
        entry.mesh.scale.set(r, r, thickness);

        const rx = typeof c.renderX === 'number' ? c.renderX : c.x;
        const ry = typeof c.renderY === 'number' ? c.renderY : c.y;
        const rz = typeof c.renderZ === 'number' ? c.renderZ : (c.z || 0);

        const cannonZ = c.cannonZOffset || 0;
        let worldZ = thickness * 0.5;
        if (isFallingOrChute) {
          worldZ = -14.5 + Math.min(0, rz);
        } else if (c.layer === 'shelf') {
          worldZ = 18.5 + thickness * 0.5 + rz * 0.85 + cannonZ;
        } else if (c.layer === 'drop') {
          worldZ = 22 + thickness * 0.5 + rz;
        } else {
          worldZ = thickness * 0.5 + (c.stackLayer || 0) * (thickness * 0.92) + rz * 0.88 + cannonZ;
        }

        const wPos = this.boardToWorld(rx, ry, worldZ);
        entry.mesh.position.set(wPos.x, wPos.y, wPos.z);

        const pitch = typeof c.renderPitch === 'number' ? c.renderPitch : (c.pitch || 0);
        const roll = typeof c.renderRoll === 'number' ? c.renderRoll : (c.roll || 0);
        const yaw = -(c.angle || 0);
        const flipAngle = c.flipAngle || 0;
        const cannonPitch = c.cannonPitch || 0;
        const cannonRoll = c.cannonRoll || 0;
        const nutationX = Math.cos(c.nutationAngle || 0) * (c.nutationAmp || 0);
        const nutationY = Math.sin(c.nutationAngle || 0) * (c.nutationAmp || 0);

        const tiltBase = typeof this.activeDioramaTilt === 'number' ? this.activeDioramaTilt : DIORAMA_TILT_X;
        entry.mesh.rotation.order = 'XYZ';
        entry.mesh.rotation.set(
          tiltBase + pitch * 0.65 + flipAngle + cannonPitch + nutationX,
          roll * 0.65 + cannonRoll + nutationY,
          yaw
        );

        // 3D Blast-Cap Fuse Badge ('[3]', '[2]', '[1]') in 3D lit geometry above coin face
        if (c.typeId === 'blast_cap' && typeof c.fuseCount === 'number') {
          const fuseVal = Math.max(0, Math.round(c.fuseCount));
          if (!entry.fuseBadge && this.fuseBadgeGeo) {
            const fMats = this.getFuseBadgeMaterialArray(fuseVal);
            const fuseBadge = new THREE.Mesh(this.fuseBadgeGeo, fMats);
            fuseBadge.castShadow = true;
            fuseBadge.receiveShadow = true;
            entry.mesh.add(fuseBadge);
            entry.fuseBadge = fuseBadge;
            entry.lastFuseCount = fuseVal;
          } else if (entry.fuseBadge) {
            entry.fuseBadge.visible = true;
            if (entry.lastFuseCount !== fuseVal) {
              entry.fuseBadge.material = this.getFuseBadgeMaterialArray(fuseVal);
              entry.lastFuseCount = fuseVal;
            }
          }
          if (entry.fuseBadge) {
            entry.fuseBadge.visible = !(this.activeCameraPreset === 'peephole' && ry > 165);
            entry.fuseBadge.position.set(Math.sin(yaw) * 0.85, Math.cos(yaw) * 0.85, 0.65);
            entry.fuseBadge.rotation.z = -yaw;
          }
        } else if (entry.fuseBadge) {
          entry.fuseBadge.visible = false;
        }
      }

      for (const [id, entry] of meshMap.entries()) {
        if (!seen.has(id)) {
          this.coinsGroup.remove(entry.mesh);
          meshMap.delete(id);
        }
      }
    }

    syncReliquaryChests(physics) {
      const THREE = this.THREE;
      const chests = (physics.coins || []).filter(
        (c) => c && (c.typeId === 'reliquary_chest' || c.isChest)
      );
      const seen = new Set();
      const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
      this.hasChestRuneHalo3D = true;

      for (let i = 0; i < chests.length; i++) {
        const ch = chests[i];
        const id = ch.uid || `chest_${i}`;
        seen.add(id);

        const curVal = Math.round(ch.value || 75);
        let mesh = this.chestMeshes.get(id);
        if (!mesh) {
          mesh = new THREE.Group();

          // Stepped Octagonal Gilded-Brass Altar Plinth + Flat Horizontal Counter-Rotating Golden-Emerald Rune Halo (ChestRuneHalo3D)
          const plinthGroup = new THREE.Group();
          plinthGroup.rotation.x = DIORAMA_TILT_X;

          const antiqueBrassPlinthMat = new THREE.MeshStandardMaterial({
            color: 0xb8862d,
            metalness: 0.78,
            roughness: 0.26,
            emissive: new THREE.Color(0x4a2e08),
            emissiveIntensity: 0.34
          });
          const gildedPlinthMat = new THREE.MeshStandardMaterial({
            color: 0xffd464,
            metalness: 0.84,
            roughness: 0.20,
            emissive: new THREE.Color(0x6e480c),
            emissiveIntensity: 0.40
          });
          const chestWoodMat = new THREE.MeshStandardMaterial({
            color: 0x8c4616,
            metalness: 0.32,
            roughness: 0.36,
            emissive: new THREE.Color(0x3d1904),
            emissiveIntensity: 0.30
          });
          const chestGemMat = new THREE.MeshStandardMaterial({
            color: 0x39ff7a,
            metalness: 0.25,
            roughness: 0.15,
            emissive: new THREE.Color(0x22e864),
            emissiveIntensity: 1.15
          });

          // Rotate CylinderGeometry by Math.PI * 0.5 around X so the octagonal plinth lies FLAT on the coin bed underneath the chest!
          const lowerOctGeo = new THREE.CylinderGeometry(28.0, 31.0, 4.5, 8);
          lowerOctGeo.rotateX(Math.PI * 0.5);
          const lowerOctStep = new THREE.Mesh(lowerOctGeo, antiqueBrassPlinthMat);
          lowerOctStep.position.set(0, 0, -12.0);
          lowerOctStep.castShadow = true;
          lowerOctStep.receiveShadow = true;
          plinthGroup.add(lowerOctStep);

          const upperOctGeo = new THREE.CylinderGeometry(24.0, 26.5, 4.0, 8);
          upperOctGeo.rotateX(Math.PI * 0.5);
          const upperOctStep = new THREE.Mesh(upperOctGeo, gildedPlinthMat);
          upperOctStep.position.set(0, 0, -8.2);
          upperOctStep.castShadow = true;
          plinthGroup.add(upperOctStep);

          // Warm Gilded Top Inlay Plate on the Plinth so there is never a dark gap under the chest
          const topInlayPlate = new THREE.Mesh(
            new THREE.CircleGeometry(23.5, 8),
            gildedPlinthMat
          );
          topInlayPlate.position.set(0, 0, -6.0);
          plinthGroup.add(topInlayPlate);

          // Flat Horizontal Counter-Rotating Golden-Emerald Rune Halo around the Plinth Base (XY board plane)
          const runeHaloGroup = new THREE.Group();
          runeHaloGroup.position.set(0, 0, -10.5);

          const outerEmeraldHaloMat = new THREE.MeshBasicMaterial({
            color: 0x39ff7a,
            transparent: true,
            opacity: 0.68
          });
          const innerGoldHaloMat = new THREE.MeshBasicMaterial({
            color: 0xffd24d,
            transparent: true,
            opacity: 0.62
          });

          const outerHaloRing = new THREE.Mesh(
            new THREE.TorusGeometry(29.0, 0.95, 10, 36),
            outerEmeraldHaloMat
          );
          runeHaloGroup.add(outerHaloRing);

          const innerHaloRing = new THREE.Mesh(
            new THREE.TorusGeometry(25.2, 0.75, 10, 32),
            innerGoldHaloMat
          );
          runeHaloGroup.add(innerHaloRing);

          const runeSigilGeo = new THREE.OctahedronGeometry(1.9, 0);
          for (let r = 0; r < 8; r++) {
            const ang = (r * Math.PI) / 4;
            const sigil = new THREE.Mesh(
              runeSigilGeo,
              r % 2 === 0 ? outerEmeraldHaloMat : innerGoldHaloMat
            );
            sigil.position.set(Math.cos(ang) * 29.0, Math.sin(ang) * 29.0, 0);
            runeHaloGroup.add(sigil);
          }
          plinthGroup.add(runeHaloGroup);
          mesh.add(plinthGroup);

          // Vaulted 3D Iron-and-Gold Reliquary Treasure Chest sitting proudly ON TOP of the Octagonal Brass Plinth (z = -8 to +16)
          const chestBodyGroup = new THREE.Group();
          chestBodyGroup.rotation.x = DIORAMA_TILT_X;
          chestBodyGroup.position.set(0, 0, -1.5);

          // Sculpted Mahogany & Gilded-Brass Reliquary Coffer Base + Vaulted Barrel Lid + 3 Heavy Gold Straps + Front Lock Escutcheon
          const baseBox = new THREE.Mesh(new THREE.BoxGeometry(36, 24, 13), chestWoodMat);
          baseBox.position.set(0, 0, -1.5);
          baseBox.castShadow = true;
          baseBox.receiveShadow = true;
          chestBodyGroup.add(baseBox);

          const lidGeo = new THREE.CylinderGeometry(12, 12, 36, 18, 1, false, 0, Math.PI);
          lidGeo.rotateZ(Math.PI * 0.5);
          lidGeo.rotateX(Math.PI * 0.5);
          const barrelLid = new THREE.Mesh(lidGeo, chestWoodMat);
          barrelLid.position.set(0, 0, 5.0);
          barrelLid.castShadow = true;
          chestBodyGroup.add(barrelLid);

          // 3 Gilded Brass Arch Bands across Base & Vaulted Lid
          const strapBoxGeo = new THREE.BoxGeometry(3.4, 25.6, 13.8);
          const strapArchGeo = new THREE.CylinderGeometry(12.6, 12.6, 3.4, 16, 1, false, 0, Math.PI);
          strapArchGeo.rotateZ(Math.PI * 0.5);
          strapArchGeo.rotateX(Math.PI * 0.5);
          for (const sx of [-13.5, 0, 13.5]) {
            const bStrap = new THREE.Mesh(strapBoxGeo, gildedPlinthMat);
            bStrap.position.set(sx, 0, -1.5);
            bStrap.castShadow = true;
            chestBodyGroup.add(bStrap);

            const lStrap = new THREE.Mesh(strapArchGeo, gildedPlinthMat);
            lStrap.position.set(sx, 0, 5.0);
            lStrap.castShadow = true;
            chestBodyGroup.add(lStrap);
          }

          // Gilded Horizontal Trim Rim & Front Padlock Escutcheon with Emerald Jewel
          const midRim = new THREE.Mesh(new THREE.BoxGeometry(38.2, 26.2, 2.4), gildedPlinthMat);
          midRim.position.set(0, 0, 4.8);
          chestBodyGroup.add(midRim);

          const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.2, 8.5), gildedPlinthMat);
          lockPlate.position.set(0, -12.4, 3.2);
          chestBodyGroup.add(lockPlate);

          const lockJewel = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), chestGemMat);
          lockJewel.position.set(0, -13.8, 3.5);
          chestBodyGroup.add(lockJewel);

          if (this.glbScenes.chest) {
            const clone = this.glbScenes.chest.clone(true);
            clone.scale.set(22, 22, 22);
            clone.position.set(0, 0, 2.0);
            clone.rotation.x = Math.PI * 0.5;
            clone.traverse((n) => {
              if (n.isMesh) {
                n.castShadow = true;
                n.receiveShadow = true;
                if (n.material) {
                  n.material = n.material.clone();
                  n.material.color.setHex(0xe8b24a);
                  n.material.metalness = 0.68;
                  n.material.roughness = 0.24;
                  n.material.emissive = new THREE.Color(0x6b4210);
                  n.material.emissiveIntensity = 0.45;
                }
              }
            });
            chestBodyGroup.add(clone);
          }
          mesh.add(chestBodyGroup);

          // 3D Reliquary Chest Price Plaque ('CHEST • $XX') mounted on twin vertical brass struts
          const strutMat = new THREE.MeshStandardMaterial({
            color: 0xffd875,
            metalness: 0.80,
            roughness: 0.20,
            emissive: new THREE.Color(0x5c380a),
            emissiveIntensity: 0.28
          });
          const strutGeo = new THREE.CylinderGeometry(1.6, 1.6, 16, 10);
          for (const sx of [-22, 22]) {
            const strut = new THREE.Mesh(strutGeo, strutMat);
            strut.position.set(sx, 10, 21);
            strut.rotation.x = Math.PI * 0.28;
            strut.castShadow = true;
            mesh.add(strut);
          }
          const chestPlaque = this.create3DPlaqueMesh(
            88,
            16,
            4,
            `CHEST • $${curVal}`,
            '#ffd875',
            '#331b08',
            '#140902',
            '#fff2bd'
          );
          chestPlaque.position.set(0, 14, 29);
          chestPlaque.rotation.x = DIORAMA_TILT_X * 0.5;
          mesh.add(chestPlaque);
          mesh.userData = { chestPlaque, lastValue: curVal, runeHaloGroup };

          this.propsGroup.add(mesh);
          this.chestMeshes.set(id, mesh);
        } else if (mesh.userData && mesh.userData.chestPlaque && mesh.userData.lastValue !== curVal) {
          this.update3DPlaqueText(mesh.userData.chestPlaque, `CHEST • $${curVal}`);
          mesh.userData.lastValue = curVal;
        }

        if (mesh.userData && mesh.userData.runeHaloGroup) {
          mesh.userData.runeHaloGroup.rotation.z = nowSec * 1.15;
        }

        const wPos = this.boardToWorld(ch.x, ch.y, 16);
        mesh.position.set(wPos.x, wPos.y, wPos.z);
        mesh.rotation.z = 0;
      }

      for (const [id, mesh] of this.chestMeshes.entries()) {
        if (!seen.has(id)) {
          this.propsGroup.remove(mesh);
          this.chestMeshes.delete(id);
        }
      }
    }

    syncOilSlicks3D(physics) {
      const THREE = this.THREE;
      if (!physics || !this.propsGroup) return;
      const slicks = physics.oilSlicks || [];
      const tiltBase = typeof this.activeDioramaTilt === 'number' ? this.activeDioramaTilt : DIORAMA_TILT_X;

      if (!this.oilSlickGeo) {
        this.oilSlickGeo = new THREE.CylinderGeometry(1, 1, 1.2, 32);
        this.oilSlickGeo.rotateX(Math.PI * 0.5);
      }

      while (this.oilSlickMeshes.length < slicks.length) {
        const oilMat = new THREE.MeshStandardMaterial({
          color: 0x120d18,
          metalness: 0.92,
          roughness: 0.06,
          emissive: new THREE.Color(0x24182e),
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: 0.78
        });
        const puddleMesh = new THREE.Mesh(this.oilSlickGeo, oilMat);
        puddleMesh.receiveShadow = true;
        puddleMesh.castShadow = false;
        this.propsGroup.add(puddleMesh);
        this.oilSlickMeshes.push(puddleMesh);
      }
      while (this.oilSlickMeshes.length > slicks.length) {
        const oldPuddle = this.oilSlickMeshes.pop();
        this.propsGroup.remove(oldPuddle);
      }

      for (let i = 0; i < slicks.length; i++) {
        const s = slicks[i];
        const puddleMesh = this.oilSlickMeshes[i];
        if (!s || !puddleMesh) continue;

        const rad = Math.max(12, s.radius || 38);
        const wPos = this.boardToWorld(s.x, s.y, 1.2);
        puddleMesh.position.set(wPos.x, wPos.y, wPos.z);
        puddleMesh.rotation.set(tiltBase, 0, 0);
        puddleMesh.scale.set(rad, rad * 0.72, 1);

        const maxLife = Math.max(1, s.maxLife || 12);
        const life = typeof s.life === 'number' ? s.life : (typeof s.timer === 'number' ? s.timer : maxLife);
        const alpha = Math.max(0.18, Math.min(0.86, (life / maxLife) * 0.84));
        if (puddleMesh.material) {
          puddleMesh.material.opacity = alpha;
        }
      }
    }

    syncDropCarriage3D(physics, now = 0) {
      if (!this.dropCarriageGroup3D || !physics) return;
      this.dropCarriageGroup3D.visible = this.activeCameraPreset !== 'peephole';
      const aimX = typeof physics.aimX === 'number' ? physics.aimX : 340;
      const cPos = this.boardToWorld(aimX, 78, 36);
      this.dropCarriageGroup3D.position.set(cPos.x, cPos.y, cPos.z);

      const gameRef = (typeof window !== 'undefined' && (window.obolGame || window.game)) || null;
      const nextTok = (gameRef && gameRef.nextToken) || {
        id: 'obol',
        typeId: 'obol',
        radius: 18,
        thickness: 5.8,
        colorPrimary: '#e08e3c',
        colorSecondary: '#7a3e12',
        colorRim: '#ffe299'
      };

      if (this.dropPreviewCoinEntry && this.dropPreviewCoinMesh) {
        const matKey = `${nextTok.typeId || nextTok.id}_${nextTok.brand || 'none'}_${nextTok.isFusedMythic ? 'mythic' : 'std'}`;
        if (this.dropPreviewCoinEntry.matKey !== matKey) {
          const mats = this.getTokenMaterialArray(nextTok);
          this.dropPreviewCoinMesh.material = mats.slice(0, 3);
          if (this.dropPreviewCoinEntry.topTorus) {
            this.dropPreviewCoinEntry.topTorus.material = mats[3] || mats[0];
          }
          if (this.dropPreviewCoinEntry.botTorus) {
            this.dropPreviewCoinEntry.botTorus.material = mats[0];
          }
          this.dropPreviewCoinEntry.matKey = matKey;
        }

        const r = Math.max(18.5, nextTok.radius || 18);
        const thickness = Math.max(6.2, Math.min(8.2, (nextTok.thickness || 5.8) * 1.12));
        const cooldown = Math.max(0, physics.dropCooldown || 0);
        const reloadScale = cooldown > 0.04 ? Math.max(0.35, 1 - cooldown * 1.8) : 1.0;

        const tiltBase = typeof this.activeDioramaTilt === 'number' ? this.activeDioramaTilt : DIORAMA_TILT_X;
        this.dropPreviewCoinMesh.scale.set(r * reloadScale, r * reloadScale, thickness * reloadScale);
        this.dropPreviewCoinMesh.rotation.set(
          tiltBase,
          Math.sin(now * 2.4) * 0.14,
          Math.cos(now * 1.6) * 0.05
        );
        if (this.dropLeftClaw3D && this.dropRightClaw3D) {
          const clawSpread = r * 0.88 + (cooldown > 0.04 ? 4.5 : 0);
          this.dropLeftClaw3D.position.x = -clawSpread;
          this.dropRightClaw3D.position.x = clawSpread;
        }
      }

      if (this.dropPlumbBeads3D && this.dropPlumbBeads3D.length > 0) {
        for (let b = 0; b < this.dropPlumbBeads3D.length; b++) {
          const bead = this.dropPlumbBeads3D[b];
          const travel = ((now * 38 + b * 32) % 92);
          bead.position.y = -24 - travel;
          bead.rotation.y = now * 3.2 + b;
        }
      }

      if (this.dropReticle3D) {
        this.dropReticle3D.rotation.z = now * 1.8;
      }

      if (this.dropLaserMat3D) {
        const gateX = typeof physics.gateX === 'number' ? physics.gateX : 340;
        const gateHalfW = ((physics.gateWidth || 86) * 0.46);
        const inGateZone = Math.abs(aimX - gateX) <= gateHalfW;
        this.dropLaserMat3D.color.setHex(inGateZone ? 0x39ff7a : 0x48ff92);
        this.dropLaserMat3D.opacity = (inGateZone ? 0.82 : 0.68) + Math.sin(now * 7.5) * 0.10;
      }
    }

    render(physics) {
      if (!this.active || !this.renderer || !this.scene || !this.camera) return null;
      const p = physics || this.physics;
      if (!p) return null;

      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;

      // 1. Step Cannon-es 3D rigid-body world in lockstep (240 Hz 4x sub-stepping)
      this.stepCannonRigidBodies(p);

      // 1b. Update Live 32x32 World-Space 3D SDF & Irradiance Volume Texture (throttled to every 2nd frame for 60 FPS lock)
      if ((this.framesRendered || 0) % 2 === 0) {
        this.updateWorldSdfGiVolume(p, now);
      } else {
        this.sdfGiFramesUpdated = (this.sdfGiFramesUpdated || 0) + 1;
      }

      // 2. Update 3D Reciprocating Upper Pusher Shelf, 4 Chrome Hydraulic Pistons & 3D Clockwork Cogwheels
      const shelfFrontBoardY = p.shelfY || 222;
      const sPos = this.boardToWorld(340, shelfFrontBoardY, 0);
      if (this.shelfGroup) {
        this.shelfGroup.position.set(sPos.x, sPos.y, sPos.z);
      }
      if (this.pistonRods3D && this.pistonRods3D.length > 0) {
        const shelfBackY = sPos.y + 102;
        for (let i = 0; i < this.pistonRods3D.length; i++) {
          const pr = this.pistonRods3D[i];
          const len = Math.max(8, pr.topY - shelfBackY);
          pr.rod.scale.set(1, len, 1);
          pr.rod.position.set(pr.x, shelfBackY + len * 0.5, 11);
        }
      }
      const phase = typeof p.shelfPhase === 'number' ? p.shelfPhase : now * 1.8;
      if (this.clockworkGears3D && this.clockworkGears3D.length > 0) {
        for (let g = 0; g < this.clockworkGears3D.length; g++) {
          const gear = this.clockworkGears3D[g];
          const dir = (gear.userData && gear.userData.dir) || 1;
          gear.rotation.z = phase * 0.85 * dir;
        }
      }
      if (this.crankRods3D && this.crankRods3D.length > 0) {
        const strokeFrac = Math.max(0, Math.min(1, (shelfFrontBoardY - 204) / 52));
        const yokeY = 194 - strokeFrac * 18;
        for (let i = 0; i < this.crankRods3D.length; i++) {
          const cr = this.crankRods3D[i];
          const rotZ = phase * 0.85 * (cr.dir || 1);
          const pinX = cr.gx - Math.sin(rotZ) * cr.crankRadius;
          const pinY = cr.gy + Math.cos(rotZ) * cr.crankRadius;
          const yokeX = cr.gx;
          if (cr.yokeBlock) {
            cr.yokeBlock.position.set(yokeX, yokeY, 15.5);
          }
          const rodLen = Math.max(12, Math.hypot(yokeX - pinX, yokeY - pinY));
          cr.rodMesh.position.set((pinX + yokeX) * 0.5, (pinY + yokeY) * 0.5, 17.5);
          cr.rodMesh.scale.set(1, rodLen, 1);
          cr.rodMesh.rotation.z = Math.atan2(yokeY - pinY, yokeX - pinX) - Math.PI * 0.5;
          if (cr.topClevis) cr.topClevis.scale.set(1, 1 / rodLen, 1);
          if (cr.botClevis) cr.botClevis.scale.set(1, 1 / rodLen, 1);
        }
      }

      // 2b. Sync 3D Moving Skill-Shot Bonus Gate Pylons, Energy Arch & 3D Marquee Plaque
      if (this.gateGroup3D) {
        const gPos = this.boardToWorld(p.gateX || 340, p.gateY || 128, 6);
        this.gateGroup3D.position.set(gPos.x, gPos.y, gPos.z);
        const halfW = (p.gateWidth || 86) * 0.5;
        if (this.gateLeftPylon) this.gateLeftPylon.position.x = -halfW;
        if (this.gateRightPylon) this.gateRightPylon.position.x = halfW;
        if (this.gateArchMesh) this.gateArchMesh.scale.x = (p.gateWidth || 86) / 86;
        const flash = Math.max(0, p.gateFlashTimer || 0);
        if (this.gateEmeraldMat) {
          this.gateEmeraldMat.emissiveIntensity = flash > 0 ? 1.8 : 0.72 + Math.sin(now * 6) * 0.18;
        }
        if (this.gatePlaqueFrontMat) {
          this.gatePlaqueFrontMat.emissiveIntensity = flash > 0 ? 1.45 : 0.52 + Math.sin(now * 5.5) * 0.14;
        }
      }

      // 2c. Sync 3D Guillotine Penalty Blade & 3D Finger Collateral Pillars
      if (this.guillotineBlade3D) {
        let dropOffset = Math.sin(now * 2.4) * 1.6;
        if (p.guillotine && p.guillotine.active) {
          const bladeProgress = Math.max(0, Math.min(1, ((p.guillotine.bladeY || 48) - 48) / 235));
          dropOffset = -bladeProgress * 54;
        } else if (p.guillotineTimer > 0) {
          dropOffset = -48;
        }
        this.guillotineBlade3D.position.y = (this.guillotineBaseY || -232) + dropOffset;
        if (this.leftWingGuillotineBlade3D) {
          this.leftWingGuillotineBlade3D.position.y = 42 + dropOffset * 1.25;
        }
      }
      if (this.fingerStocks3D && this.fingerStocks3D.length === 3) {
        const gameRef = (typeof window !== 'undefined' && (window.obolGame || window.game)) || null;
        const fingersLeft = gameRef && typeof gameRef.fingers === 'number' ? gameRef.fingers : 3;
        for (let f = 0; f < 3; f++) {
          this.fingerStocks3D[f].visible = f < fingersLeft;
        }
      }

      // 3. Dynamic Furnace Lava Flicker & Rising 3D Ember Spark Motes
      if (this.leftFurnaceLight && this.rightFurnaceLight) {
        const flicker = 3.6 + Math.sin(now * 8.5) * 0.7 + Math.cos(now * 13.0) * 0.4;
        this.leftFurnaceLight.intensity = flicker;
        this.rightFurnaceLight.intensity = flicker;
        if (this.lavaMat3D) {
          this.lavaMat3D.emissiveIntensity = 1.55 + Math.sin(now * 7.2) * 0.35;
        }
      }
      if (this.furnaceEmberMotes3D && this.furnaceEmberMotes3D.length > 0) {
        for (let m = 0; m < this.furnaceEmberMotes3D.length; m++) {
          const mote = this.furnaceEmberMotes3D[m];
          const rise = ((now * 9.5 + mote.phase * 6.0) % 16.0);
          mote.mesh.position.set(
            mote.baseX + Math.sin(now * 3.2 + mote.phase) * 3.5,
            mote.baseY + Math.cos(now * 2.1 + mote.phase) * 2.5,
            -5.0 + rise
          );
          mote.mesh.rotation.set(now * 2.4 + m, now * 3.1, 0);
        }
      }

      // 4. Sync all 3D Coins (Upper Shelf, Lower Bed, Falling Coins, and Chute Hopper Pile), 3D Chests, 3D Oil Puddles, 3D Drop Carriage, 3D Energy Beams & 3D Cabinet Hardware Props
      this.syncCoinMeshMap(p.coins || [], this.coinMeshes, false);
      this.syncCoinMeshMap(p.fallingCoins || [], this.fallingCoinMeshes, true);
      this.syncCoinMeshMap(p.chuteCoinPile || [], this.chuteCoinMeshes, true);
      this.syncReliquaryChests(p);
      this.syncOilSlicks3D(p);
      this.syncDropCarriage3D(p, now);
      this.syncEnergyBeams3D(p, now);
      this.syncCabinetProps(p);

      // 4b. Interpolate True 3D PerspectiveCamera Preset & Mouse-Look Parallax
      this.updateCameraView();

      // 5. Render 3D WebGL Scene (Throttle shadowMap update to every 3rd frame for 60 FPS lock)
      this.renderer.shadowMap.autoUpdate = false;
      if ((this.framesRendered || 0) % 3 === 0) {
        this.renderer.shadowMap.needsUpdate = true;
      }
      this.renderer.render(this.scene, this.camera);
      this.framesRendered++;
      return this.canvas;
    }

    triggerGuillotineCutscene3D(fingersRemaining = 2) {
      if (!this.physics) return;
      const idx = Math.max(0, Math.min(2, fingersRemaining));
      const fingerXs = [124, 150, 176];
      const fx = fingerXs[idx] || 150;
      if (typeof this.physics.spawnParticles === 'function') {
        this.physics.spawnParticles(fx, 520, '#ff2a38', 24);
      }
      if (typeof this.physics.spawnRingParticles === 'function') {
        this.physics.spawnRingParticles(fx, 520, '#ff9d3b', 14);
      }
    }

    syncEnergyBeams3D(physics, now = 0) {
      const THREE = this.THREE;
      if (!physics || !this.propsGroup) return;
      if (!this.energyBeamMeshes3D) {
        this.energyBeamMeshes3D = [];
      }
      if (!this.energySparkMeshes3D) {
        this.energySparkMeshes3D = [];
      }
      if (!this.teeterHaloMeshes3D) {
        this.teeterHaloMeshes3D = [];
      }
      if (!this.energyBeamGeo3D) {
        this.energyBeamGeo3D = new THREE.CylinderGeometry(1.0, 1.0, 1, 8);
      }
      if (!this.energySparkGeo3D) {
        this.energySparkGeo3D = new THREE.OctahedronGeometry(0.75, 0);
      }
      if (!this.teeterHaloGeo3D) {
        this.teeterHaloGeo3D = new THREE.TorusGeometry(20.5, 0.85, 10, 28);
      }

      const segments = [];
      const sparkPoints = [];
      const teeterHalos = [];
      const coins = physics.coins || [];
      const bedCoins = coins.filter((c) => c && c.layer === 'bed' && c.typeId !== 'reliquary_chest' && !c.isChest);

      let voltaicArcsCount = 0;
      let crimsonTethersCount = 0;

      // Helper: Razor-thin 6-segment 3D electric cyan-gold filament (radius 0.45 core + 1.05 additive glow sheath)
      const addJaggedVoltaicBolt = (c1, c2, boltIdx) => {
        const z1 = (c1.z || 0) + (c1.stackLayer || 0) * 6 + 7.5;
        const z2 = (c2.z || 0) + (c2.stackLayer || 0) * 6 + 7.5;
        const steps = 6;
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / dist;
        const ny = dx / dist;

        let prevX = c1.x;
        let prevY = c1.y;
        let prevZ = z1;

        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          let curX = c1.x + dx * t;
          let curY = c1.y + dy * t;
          let curZ = z1 + (z2 - z1) * t + Math.sin(t * Math.PI) * 4.5;
          if (s < steps) {
            const jag = Math.sin(now * 22 + s * 2.3 + boltIdx * 1.7) * 5.2 + (s % 2 === 0 ? 3.2 : -3.2);
            curX += nx * jag;
            curY += ny * jag;
          }
          // Core razor-thin filament (radius = 0.42)
          segments.push({
            x1: prevX,
            y1: prevY,
            z1: prevZ,
            x2: curX,
            y2: curY,
            z2: curZ,
            color: 0x78f8ff,
            radius: 0.42,
            opacity: 0.62
          });
          // Subtle additive outer sheath (radius = 1.05, opacity = 0.24)
          segments.push({
            x1: prevX,
            y1: prevY,
            z1: prevZ,
            x2: curX,
            y2: curY,
            z2: curZ,
            color: 0x00d8ff,
            radius: 1.05,
            opacity: 0.24
          });
          prevX = curX;
          prevY = curY;
          prevZ = curZ;
        }
        voltaicArcsCount++;
      };

      // Helper: Razor-thin 7-segment deep ruby-crimson siphon filament (radius 0.42 core + 0.95 additive glow sheath)
      const addParabolicCrimsonSiphon = (c1, c2, siphonIdx) => {
        const z1 = (c1.z || 0) + (c1.stackLayer || 0) * 6 + 7.2;
        const z2 = (c2.z || 0) + (c2.stackLayer || 0) * 6 + 7.2;
        const steps = 7;
        let prevX = c1.x;
        let prevY = c1.y;
        let prevZ = z1;

        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const curX = c1.x + (c2.x - c1.x) * t;
          const curY = c1.y + (c2.y - c1.y) * t;
          const archZ = Math.sin(t * Math.PI) * 9.5;
          const curZ = z1 + (z2 - z1) * t + archZ;
          segments.push({
            x1: prevX,
            y1: prevY,
            z1: prevZ,
            x2: curX,
            y2: curY,
            z2: curZ,
            color: 0xcc1122,
            radius: 0.42,
            opacity: 0.55
          });
          segments.push({
            x1: prevX,
            y1: prevY,
            z1: prevZ,
            x2: curX,
            y2: curY,
            z2: curZ,
            color: 0x990818,
            radius: 0.95,
            opacity: 0.22
          });
          prevX = curX;
          prevY = curY;
          prevZ = curZ;
        }

        // Tiny subtle ruby spark traveling along the filament
        const dt = ((now * 0.95 + siphonIdx * 0.35) % 1.0);
        const bx = c2.x + (c1.x - c2.x) * dt;
        const by = c2.y + (c1.y - c2.y) * dt;
        const bz = z2 + (z1 - z2) * dt + Math.sin(dt * Math.PI) * 9.5;
        sparkPoints.push({ x: bx, y: by, z: bz, color: 0xff2238, scale: 0.75 });
        crimsonTethersCount++;
      };

      // 1. Limit passive Voltaic Lightning Bolt to 1 subtle razor-thin arc on the lower-left coin bed (away from center Chest)
      const voltaicSources = bedCoins.filter(
        (c) => (c.typeId === 'voltaic_coil' || c.typeId === 'lodestone_token') && Math.hypot(c.x - 340, c.y - 352) > 78
      );
      if (voltaicSources.length === 0 && bedCoins.length >= 3) {
        const fallbackLeft = bedCoins.find((c) => c.x < 260 && c.y > 350);
        if (fallbackLeft) voltaicSources.push(fallbackLeft);
      }
      if (voltaicSources.length > 0) {
        const src = voltaicSources[0];
        const neighbors = bedCoins
          .filter((other) => other.uid !== src.uid && Math.hypot(other.x - 340, other.y - 352) > 72)
          .map((other) => ({
            coin: other,
            dist: Math.hypot(other.x - src.x, other.y - src.y)
          }))
          .filter((entry) => entry.dist > 28 && entry.dist < 115)
          .sort((a, b) => a.dist - b.dist);

        if (neighbors.length > 0) {
          addJaggedVoltaicBolt(src, neighbors[0].coin, 0);
        }
      }

      // Include any transient physics.lightningArcs (capped at 2)
      const arcs = physics.lightningArcs || [];
      for (let i = 0; i < Math.min(2, arcs.length); i++) {
        const arc = arcs[i];
        if (!arc) continue;
        addJaggedVoltaicBolt(
          { x: arc.x1, y: arc.y1, z: 4, stackLayer: 0 },
          { x: arc.x2, y: arc.y2, z: 4, stackLayer: 0 },
          10 + i
        );
      }

      // 2. Limit passive Crimson Siphon to 1 subtle razor-thin arc on the lower-right coin bed (away from center Chest)
      const crimsonSources = bedCoins.filter(
        (c) =>
          (c.typeId === 'soul_chain' || c.typeId === 'leech_penny' || c.typeId === 'blood_crown') &&
          c.x > 380 &&
          Math.hypot(c.x - 340, c.y - 352) > 78
      );
      if (crimsonSources.length === 0 && bedCoins.length >= 5) {
        const fallbackRight = bedCoins.find((c) => c.x > 410 && c.y > 350);
        if (fallbackRight) crimsonSources.push(fallbackRight);
      }
      if (crimsonSources.length > 0) {
        const src = crimsonSources[0];
        const candidates = bedCoins
          .filter((other) => other.uid !== src.uid && Math.hypot(other.x - 340, other.y - 352) > 72)
          .map((other) => ({
            coin: other,
            dist: Math.hypot(other.x - src.x, other.y - src.y)
          }))
          .filter((entry) => entry.dist > 28 && entry.dist < 115)
          .sort((a, b) => a.dist - b.dist);
        if (candidates.length > 0) {
          addParabolicCrimsonSiphon(src, candidates[0].coin, 0);
        }
      }

      this.activeVoltaicArcs3DCount = voltaicArcsCount;
      this.activeCrimsonTethers3DCount = crimsonTethersCount;

      // 3. Pulsing 3D Warm Golden / Emerald / Cyan Under-Coin Rim Glow Rings on Special, Branded & Teetering Coins (PaylineTeeterAuras3D)
      const tiltBase = typeof this.activeDioramaTilt === 'number' ? this.activeDioramaTilt : DIORAMA_TILT_X;
      for (let i = 0; i < bedCoins.length; i++) {
        const c = bedCoins[i];
        const isFrontTeeter = c.y >= (physics.lipY || 478) - 56;
        const isSpecialOrBranded =
          Boolean(c.brand) ||
          Boolean(c.gilded) ||
          c.typeId === 'voltaic_coil' ||
          c.typeId === 'emerald_serpent' ||
          c.typeId === 'sun_bullion' ||
          c.typeId === 'soul_chain' ||
          c.typeId === 'silver_drachma';
        if ((isFrontTeeter || isSpecialOrBranded) && teeterHalos.length < 18) {
          let haloColor = 0xffd24d;
          if (isFrontTeeter || c.typeId === 'emerald_serpent' || c.typeId === 'soul_chain') {
            haloColor = 0x39ff7a;
          } else if (c.typeId === 'voltaic_coil' || c.typeId === 'silver_drachma') {
            haloColor = 0x52f2ff;
          }
          teeterHalos.push({
            x: c.x,
            y: c.y,
            z: (c.z || 0) + (c.stackLayer || 0) * 6 + 1.6,
            color: haloColor,
            scale: ((c.radius || 18) / 18) * 1.04
          });
        }
      }

      // Sync 3D cylinder segments with additive blending and depthWrite = false
      while (this.energyBeamMeshes3D.length < segments.length) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x48e8ff,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Mesh(this.energyBeamGeo3D, mat);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.propsGroup.add(mesh);
        this.energyBeamMeshes3D.push(mesh);
      }

      const upVec = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < this.energyBeamMeshes3D.length; i++) {
        const mesh = this.energyBeamMeshes3D[i];
        if (i >= segments.length) {
          mesh.visible = false;
          continue;
        }
        const seg = segments[i];
        const p1 = this.boardToWorld(seg.x1, seg.y1, seg.z1);
        const p2 = this.boardToWorld(seg.x2, seg.y2, seg.z2);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        const len = Math.max(0.5, Math.hypot(dx, dy, dz));

        mesh.visible = true;
        mesh.position.set((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5, (p1.z + p2.z) * 0.5);
        mesh.scale.set(seg.radius, len, seg.radius);
        const dirVec = new THREE.Vector3(dx / len, dy / len, dz / len);
        mesh.quaternion.setFromUnitVectors(upVec, dirVec);
        mesh.material.color.setHex(seg.color);
        mesh.material.opacity = (seg.opacity || 0.48) + Math.sin(now * 16 + i) * 0.08;
      }

      // Sync tiny additive spark points
      while (this.energySparkMeshes3D.length < sparkPoints.length) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff2238,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const spark = new THREE.Mesh(this.energySparkGeo3D, mat);
        this.propsGroup.add(spark);
        this.energySparkMeshes3D.push(spark);
      }
      for (let i = 0; i < this.energySparkMeshes3D.length; i++) {
        const spark = this.energySparkMeshes3D[i];
        if (i >= sparkPoints.length) {
          spark.visible = false;
          continue;
        }
        const sp = sparkPoints[i];
        const wPos = this.boardToWorld(sp.x, sp.y, sp.z);
        spark.visible = true;
        spark.position.set(wPos.x, wPos.y, wPos.z);
        const pulse = sp.scale * (0.9 + Math.sin(now * 14 + i) * 0.2);
        spark.scale.set(pulse, pulse, pulse);
        spark.material.color.set(sp.color);
      }

      // Sync 3D Payline Teeter Rim Halos
      while (this.teeterHaloMeshes3D.length < teeterHalos.length) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x39ff7a,
          transparent: true,
          opacity: 0.68
        });
        const halo = new THREE.Mesh(this.teeterHaloGeo3D, mat);
        this.propsGroup.add(halo);
        this.teeterHaloMeshes3D.push(halo);
      }
      for (let i = 0; i < this.teeterHaloMeshes3D.length; i++) {
        const halo = this.teeterHaloMeshes3D[i];
        if (i >= teeterHalos.length) {
          halo.visible = false;
          continue;
        }
        const th = teeterHalos[i];
        const wPos = this.boardToWorld(th.x, th.y, th.z);
        halo.visible = true;
        halo.position.set(wPos.x, wPos.y, wPos.z);
        halo.rotation.set(tiltBase, 0, now * 1.5 + i);
        const pulse = th.scale * (0.96 + Math.sin(now * 6 + i) * 0.08);
        halo.scale.set(pulse, pulse, 1);
        halo.material.color.set(th.color);
        halo.material.opacity = 0.56 + Math.sin(now * 7 + i) * 0.18;
      }
    }

    resize() {
      if (!this.renderer || !this.camera) return;
      let targetW = this.width || 680;
      let targetH = this.height || 640;
      if (typeof document !== 'undefined') {
        const isTheater =
          document.body.classList.contains('theater-3d-mode') ||
          document.body.classList.contains('theater-3d-active') ||
          this.activeCameraPreset === 'theater';
        const housing = document.getElementById('canvas-housing') || document.getElementById('pusher-canvas');
        if (housing && housing.clientWidth > 100 && housing.clientHeight > 100) {
          targetW = housing.clientWidth;
          targetH = housing.clientHeight;
        } else if (isTheater) {
          targetW = 1256;
          targetH = 600;
        }
      }
      const aspect = Math.max(0.5, Math.min(3.2, targetW / Math.max(1, targetH)));
      if (Math.abs(this.camera.aspect - aspect) > 0.004) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
      }
      const renderW = targetW > 900 ? 1280 : this.width;
      const renderH = this.height;
      if (this.canvas && (this.canvas.width !== renderW || this.canvas.height !== renderH)) {
        this.renderer.setSize(renderW, renderH, false);
      }
    }

    setCameraPreset(presetName) {
      if (!this.cameraPresets || !this.cameraPresets[presetName]) {
        presetName = 'playfield';
      }
      this.activeCameraPreset = presetName;
      const isTheater = presetName === 'theater';
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('theater-3d-mode', isTheater);
        document.body.classList.toggle('theater-3d-active', isTheater);
        const cab = document.getElementById('arcade-cabinet');
        if (cab) {
          cab.style.transform = 'none';
        }
        const pCanvas = document.getElementById('pusher-canvas');
        if (pCanvas) {
          pCanvas.style.transform = 'none';
        }
        const postCanvas = document.getElementById('webgl-post-canvas');
        if (postCanvas) {
          postCanvas.style.transform = 'none';
        }
        const theaterBtn = document.getElementById('btn-theater-3d');
        if (theaterBtn) {
          theaterBtn.classList.toggle('active', isTheater);
        }
        const btns = document.querySelectorAll('#camera-view-bar .cam-preset-btn');
        btns.forEach((b) => {
          b.classList.toggle('active', !isTheater && b.getAttribute('data-cam-preset') === presetName);
        });
      }
      this.resize();
      return this.activeCameraPreset;
    }

    cycleCameraPreset() {
      const order = ['playfield', 'angled_booth', 'lip_closeup', 'peephole'];
      const idx = order.indexOf(this.activeCameraPreset);
      const next = order[(idx + 1) % order.length];
      return this.setCameraPreset(next);
    }

    triggerCollectorSpeech(duration = 1.2, mood = 'taunt') {
      const durSec = duration > 10 ? duration / 60 : duration;
      this.collectorSpeechTimer = Math.max(this.collectorSpeechTimer || 0, durSec);
      this.collectorMood = mood || 'taunt';
    }

    updateCameraView() {
      if (!this.camera || !this.cameraPresets) return;
      this.resize();
      const preset = this.cameraPresets[this.activeCameraPreset] || this.cameraPresets.playfield;
      const isDefault = this.activeCameraPreset === 'playfield';
      const swayX = isDefault ? 0 : this.mouseParallaxX * 14;
      const swayY = isDefault ? 0 : -this.mouseParallaxY * 10;
      const lOff = preset.lightOffset || [0, 0];

      // Keep upper pegboard and clockwork gears visible in all views; hide foreground drop rail/carriage/bonus gate in [COLLECTOR] peephole view so the 3 clockwork gears and Collector claws are 100% unobstructed
      const hideInPeephole = this.activeCameraPreset === 'peephole';
      if (this.dropRailMesh3D) this.dropRailMesh3D.visible = !hideInPeephole;
      if (this.dropRailBrackets3D) {
        for (let i = 0; i < this.dropRailBrackets3D.length; i++) {
          this.dropRailBrackets3D[i].visible = !hideInPeephole;
        }
      }
      if (this.dropCarriageGroup3D) this.dropCarriageGroup3D.visible = !hideInPeephole;
      if (this.gateGroup3D) this.gateGroup3D.visible = !hideInPeephole;
      if (this.mintRoomProps3D) this.mintRoomProps3D.visible = true;
      if (this.contrabandRack3D) this.contrabandRack3D.visible = true;
      if (this.clockworkGears3D) {
        for (let i = 0; i < this.clockworkGears3D.length; i++) {
          this.clockworkGears3D[i].visible = true;
        }
      }
      if (this.crankRods3D) {
        for (let i = 0; i < this.crankRods3D.length; i++) {
          const cr = this.crankRods3D[i];
          if (cr.rodMesh) cr.rodMesh.visible = true;
          if (cr.yokeBlock) cr.yokeBlock.visible = true;
        }
      }
      if (this.pistonRods3D) {
        for (let i = 0; i < this.pistonRods3D.length; i++) {
          if (this.pistonRods3D[i].rod) this.pistonRods3D[i].rod.visible = true;
          if (this.pistonRods3D[i].housing) this.pistonRods3D[i].housing.visible = true;
        }
      }

      const targetTilt = typeof preset.dioramaTilt === 'number' ? preset.dioramaTilt : DIORAMA_TILT_X;
      this.activeDioramaTilt = (this.activeDioramaTilt || DIORAMA_TILT_X) + (targetTilt - (this.activeDioramaTilt || DIORAMA_TILT_X)) * 0.22;

      const rawPos = preset.pos || [0, 0, 900];
      const rawLook = preset.target || [0, 0, 0];
      const tPos = [
        typeof rawPos.x === 'number' ? rawPos.x : rawPos[0],
        typeof rawPos.y === 'number' ? rawPos.y : rawPos[1],
        typeof rawPos.z === 'number' ? rawPos.z : rawPos[2]
      ];
      const tLook = [
        typeof rawLook.x === 'number' ? rawLook.x : rawLook[0],
        typeof rawLook.y === 'number' ? rawLook.y : rawLook[1],
        typeof rawLook.z === 'number' ? rawLook.z : rawLook[2]
      ];
      const tFov = preset.fov || this.defaultFov;
      const lerpAlpha = 0.24;

      if (!this.cameraCurrentPos) {
        this.cameraCurrentPos = new this.THREE.Vector3(tPos[0], tPos[1], tPos[2]);
        this.cameraCurrentTarget = new this.THREE.Vector3(tLook[0], tLook[1], tLook[2]);
      }

      this.cameraCurrentPos.x += (tPos[0] + swayX - this.cameraCurrentPos.x) * lerpAlpha;
      this.cameraCurrentPos.y += (tPos[1] + swayY - this.cameraCurrentPos.y) * lerpAlpha;
      this.cameraCurrentPos.z += (tPos[2] - this.cameraCurrentPos.z) * lerpAlpha;

      this.cameraCurrentTarget.x += (tLook[0] + swayX * 0.35 - this.cameraCurrentTarget.x) * lerpAlpha;
      this.cameraCurrentTarget.y += (tLook[1] + swayY * 0.35 - this.cameraCurrentTarget.y) * lerpAlpha;
      this.cameraCurrentTarget.z += (tLook[2] - this.cameraCurrentTarget.z) * lerpAlpha;

      if (Math.hypot(tPos[0] + swayX - this.cameraCurrentPos.x, tPos[1] + swayY - this.cameraCurrentPos.y, tPos[2] - this.cameraCurrentPos.z) < 0.15) {
        this.cameraCurrentPos.set(tPos[0] + swayX, tPos[1] + swayY, tPos[2]);
      }
      if (Math.hypot(tLook[0] + swayX * 0.35 - this.cameraCurrentTarget.x, tLook[1] + swayY * 0.35 - this.cameraCurrentTarget.y, tLook[2] - this.cameraCurrentTarget.z) < 0.15) {
        this.cameraCurrentTarget.set(tLook[0] + swayX * 0.35, tLook[1] + swayY * 0.35, tLook[2]);
      }

      this.camera.position.copy(this.cameraCurrentPos);
      this.camera.lookAt(this.cameraCurrentTarget);

      const nextFov = this.camera.fov + (tFov - this.camera.fov) * lerpAlpha;
      if (Math.abs(nextFov - this.camera.fov) > 0.005) {
        this.camera.fov = Math.abs(tFov - nextFov) < 0.02 ? tFov : nextFov;
        this.camera.updateProjectionMatrix();
      }

      const now = performance.now() * 0.001;
      const p = this.physics;
      if (this.collectorSpeechTimer > 0) {
        this.collectorSpeechTimer = Math.max(0, this.collectorSpeechTimer - 0.016);
      }
      const talkActive =
        (this.collectorSpeechTimer || 0) > 0 ||
        Boolean(p && (p.collectorTalkTimer > 0 || p.gateFlashTimer > 0 || p.overdriveTimer > 0));

      if (this.collector3DGroup && p) {
        const aimRatio = ((p.aimX || 340) - 340) / 340;
        this.collector3DGroup.rotation.y = aimRatio * 0.28;
      }

      const baseJawY = typeof this.collectorJawBaseY === 'number' ? this.collectorJawBaseY : -2.8;
      if (this.collectorJaw3D) {
        if (talkActive) {
          const chatterWave = Math.abs(Math.sin(now * 19.5));
          this.collectorJaw3D.position.y = baseJawY - chatterWave * 3.8;
          this.collectorJaw3D.rotation.x = chatterWave * 0.32;
          if (this.collectorBustMesh) {
            this.collectorBustMesh.rotation.x = -chatterWave * 0.045;
            this.collectorBustMesh.position.y = 2.5 + chatterWave * 0.8;
          }
        } else {
          const idleBreath = (Math.sin(now * 2.2) * 0.5 + 0.5) * 0.85;
          this.collectorJaw3D.position.y = baseJawY - idleBreath;
          this.collectorJaw3D.rotation.x = idleBreath * 0.06;
          if (this.collectorBustMesh) {
            this.collectorBustMesh.rotation.x = -idleBreath * 0.018;
            this.collectorBustMesh.position.y = 2.5 + idleBreath * 0.25;
          }
        }
      }

      if (this.collectorOcularMat) {
        this.collectorOcularMat.emissiveIntensity = talkActive
          ? 1.65 + Math.sin(now * 24.0) * 0.35
          : 1.25 + Math.sin(now * 3.5) * 0.2;
      }

      if (this.collectorFingerGroups3D && this.collectorFingerGroups3D.length > 0) {
        const drumSpeed = talkActive ? 9.5 : 4.8;
        for (let idx = 0; idx < this.collectorFingerGroups3D.length; idx++) {
          const fg = this.collectorFingerGroups3D[idx];
          if (!fg) continue;
          const tap = Math.max(0, Math.sin(now * drumSpeed + idx * 0.85));
          const isClawGLB = Boolean(fg.userData && fg.userData.isSculptedClawGLB);
          fg.rotation.x = isClawGLB
            ? 0.44 + tap * (talkActive ? 0.14 : 0.06)
            : 0.18 + tap * (talkActive ? 0.52 : 0.32);
        }
      }

      if (this.pressureNeedles3D && this.pressureNeedles3D.length > 0) {
        const shelfPhase = (p && p.shelfPhase) || now * 2.2;
        for (let nIdx = 0; nIdx < this.pressureNeedles3D.length; nIdx++) {
          const needle = this.pressureNeedles3D[nIdx];
          if (!needle) continue;
          const dir = nIdx === 0 ? 1 : -1;
          needle.rotation.z = dir * (Math.sin(shelfPhase) * 0.78 + Math.sin(now * 14.0) * 0.08);
        }
      }

      if (this.rimDir) {
        this.rimDir.position.set(85 + lOff[0] + swayX * 2.2, -360 + lOff[1] + swayY * 2.2, 420);
      }
      if (this.mainSpot) {
        this.mainSpot.position.set(-65 + swayX * 1.5, 240 + lOff[1] * 0.4 + swayY * 1.5, 640);
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.ObolEngine3D = ObolEngine3D;
  }
})();
