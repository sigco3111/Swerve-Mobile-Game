import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

let scene, camera, renderer;
let composer;
let effectPass;
let effectPulse = 0;
let effectCurrent = 0;
const EFFECT_LERP_SPEED = 8;
const EFFECT_DECAY = 1.8;

// Single shader for both effects — chromatic aberration radially offsets R/B
// channels (stronger near the edges, zero at the centre), and a vignette
// darkens the corners. Both are gated by uIntensity so the same code renders
// the at-rest frame at zero cost beyond the single texture sample.
const effectShader = {
    uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 center = uv - 0.5;
            float r2 = dot(center, center);

            // Aberration weighted by distance from centre so the lens-fringe
            // effect is concentrated at the edges where the eye expects it.
            vec2 dir = center * (0.018 * uIntensity * r2);
            float r = texture2D(tDiffuse, uv + dir).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - dir).b;
            vec3 color = vec3(r, g, b);

            // Vignette: smoothstep from 0.4 (full brightness) to 0.95 (most
            // darkened). Mixed in proportional to intensity so the corners
            // stay bright when nothing is happening.
            float vig = 1.0 - smoothstep(0.4, 0.95, sqrt(r2)) * 0.7;
            color *= mix(1.0, vig, uIntensity);

            gl_FragColor = vec4(color, 1.0);
        }
    `
};

export function initScene(container) {
    // Scene
    scene = new THREE.Scene();
    // Lighter fog with a neon blue tint — not too dark
    scene.fog = new THREE.FogExp2(0x061828, 0.008);

    // Renderer — balanced quality: antialias on, pixel ratio capped at 2
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Camera — reduced far plane (fog hides anything beyond ~150 anyway)
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 0, 0);

    // Brighter lighting with neon green/blue tones
    const ambientLight = new THREE.AmbientLight(0x446688, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xccffee, 1.2);
    dirLight.position.set(5, 15, 10);
    scene.add(dirLight);

    // Hemisphere: neon green sky, blue ground
    const hemiLight = new THREE.HemisphereLight(0x44ffaa, 0x2244aa, 0.6);
    scene.add(hemiLight);

    // Post-processing — chromatic aberration + vignette driven by a single
    // intensity uniform. Both effects scale to zero at rest, so the pass costs
    // very little when nothing is happening, and we don't pay for a permanent
    // shader-rewrite to "off".
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    effectPass = new ShaderPass(effectShader);
    composer.addPass(effectPass);

    // Handle resize
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer };
}

function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}

// Pre-compile all shader programs so the first gameplay frame doesn't stall.
// The temp meshes sit off-screen with frustum culling disabled — culled meshes
// are never submitted, and an unsubmitted material never gets its program built,
// which is what let the ghost-mode swap stall on the first hit.
export function warmUpGPU(materials) {
    const tempGeo = new THREE.PlaneGeometry(1, 1);
    const tempMeshes = [];

    for (const mat of materials) {
        if (!mat) continue;
        const m = new THREE.Mesh(tempGeo, mat);
        m.position.set(0, -100, 0);
        m.frustumCulled = false;
        scene.add(m);
        tempMeshes.push(m);
    }

    // compile() builds every program up front; the render pass forces the
    // driver to finish linking and upload the geometry before gameplay starts.
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    // Pre-compile the post-processing pipeline too — the ShaderPass compiles
    // its program on first use, and doing it here means the first chromatic
    // aberration on a real hit doesn't stall while the driver links the shader.
    if (composer) composer.render();

    for (const m of tempMeshes) scene.remove(m);
    tempGeo.dispose();
}

// Effect API — a single intensity knob drives both chromatic aberration and
// vignette. pulseEffect() spikes it (used on hit/boost); updateEffect() ticks
// the spike down toward zero and eases the rendered value toward the target.
export function pulseEffect(intensity) {
    if (intensity > effectPulse) effectPulse = intensity;
}

export function updateEffect(dt) {
    if (effectPulse > 0) {
        effectPulse -= dt * EFFECT_DECAY;
        if (effectPulse < 0) effectPulse = 0;
    }
    const blend = 1 - Math.exp(-EFFECT_LERP_SPEED * dt);
    effectCurrent += (effectPulse - effectCurrent) * blend;
    if (effectPass) effectPass.uniforms.uIntensity.value = effectCurrent;
}

export function renderFrame() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
