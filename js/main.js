import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { initScene, getScene, getCamera, getRenderer, warmUpGPU, pulseEffect, updateEffect, renderFrame } from './scene.js';
import { initPhysics, stepPhysics, getWorld, GROUPS } from './physics.js';
import { createMarble, updateMarble, getMarbleMesh, getMarbleBody, getMarbleRadius, enterGhostMode, endGhostMode, isGhostMode, getGhostTimer, getGhostDuration, respawnMarble, getPlayerMaterials } from './player.js';
import { initControls, updateControls, isMarbleAirborne, releaseControls } from './controls.js';
import { initTrack, generateSegment, removeOldSegments, getSegments, getSegmentLength, getLastSegmentZ, resetTrack, getCurrentTrackY, getTrackMaterials } from './track.js';
import { initRails, updateRails, getRailMaterials } from './rails.js';
import { spawnObstacle, updateObstacles, removeOldObstacles, resetObstacles, getObstacleMaterials } from './obstacles.js';
import { spawnCollectiblesForSegment, updateCollectibles, removeOldCollectibles, resetCollectibles, getCollectibleMaterials, pullCollectibles } from './collectibles.js';
import { initHUD, updateScore, updateHighScore, updateLives, showGhostIndicator, hideGhostIndicator, showLevelUp, showHUD, hideHUD, showTitleScreen, hideTitleScreen, showGameOver, hideGameOver, screenShake, hitFlash, getRestartButton, getTitleScreen, updateCombo, hideCombo, updatePowerup, showAchievementToast, hideAchievementToast, updateAchievementsSummary, showPauseButton, hidePauseButton, showPauseOverlay, hidePauseOverlay, getPauseButton, getPauseOverlay, initSettingsToggles, getSettingToggle, applyColorblind, initAchievementsList, markAchievementUnlocked } from './hud.js';
import { getDifficultyForScore, checkLevelUp, getSpeedMultiplier, getCurrentLevel, resetDifficulty } from './difficulty.js';
import { createSkybox, updateSkybox, setSkyLevel } from './skybox.js';
import { createHexBackground, updateHexBackground, getHexMaterial } from './hexbg.js';
import { createShootingStars, updateShootingStars, triggerShootingStars, resetShootingStars, getShootingStarMaterials } from './shootingstars.js';
import { initAudio, resumeAudio, playCollectSound, playDiamondSound, playHoopSound, playHitSound, playGameOverSound, playLevelUpSound, playBoostSound, playComboTierSound, playMagnetSound, playShieldSound, playSlowMoSound, setSoundEnabled } from './audio.js';
import { loadAchievements, checkAchievements, getUnlockedCount, getTotalCount, getAchievementsList } from './achievements.js';
import { loadSettings, getSetting, setSetting, getAllSettings, haptic } from './settings.js';

// Game states
const STATES = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER'
};

let gameState = STATES.MENU;
let score = 0;
let highScore = 0;
let lives = 3;
let lastTime = 0;
let gameTime = 0;
let isFirstGame = true;
const BASE_FORWARD_SPEED = -22;
const SEGMENTS_AHEAD = 25;

// Boost state
let boostActive = false;
let boostTimer = 0;
const BOOST_DURATION = 0.5;
const BOOST_SPEED_MULT = 1.3;

// Combo state — pickups within COMBO_WINDOW seconds stack a point multiplier.
// Tier thresholds are inclusive; tier=0 means no combo display (count < 2).
let comboCount = 0;
let comboTimer = 0;
let comboTier = 0;
const COMBO_WINDOW = 1.5;
const COMBO_TIERS = [
    { count: 3, mult: 2 },
    { count: 5, mult: 3 },
    { count: 8, mult: 5 }
];

// Power-up state. Magnet and slow-mo are timed; shield is binary.
let magnetActive = false;
let magnetTimer = 0;
const MAGNET_DURATION = 3.0;
const MAGNET_RADIUS = 5.0;
const MAGNET_PULL_SPEED = 14;
let shieldActive = false;
let slowMoActive = false;
let slowMoTimer = 0;
const SLOW_MO_DURATION = 1.5;
const SLOW_MO_MULT = 0.5;

function resetPowerups() {
    magnetActive = false;
    magnetTimer = 0;
    shieldActive = false;
    slowMoActive = false;
    slowMoTimer = 0;
    updatePowerup('magnet', false);
    updatePowerup('slowmo', false);
    updatePowerup('shield', false);
}

// Difficulty-speed lerp. The level table still gives a step target, but we
// ease the actual rendered speed across SPEED_MULT_LERP_DURATION instead of
// snapping. smoothstep keeps the start and end slopes zero so the camera and
// HUD don't read the change as a hitch.
let currentSpeedMult = 1;
let speedMultLerpFrom = 1;
let speedMultLerpTo = 1;
let speedMultLerpT = 1;
const SPEED_MULT_LERP_DURATION = 1.5;

// Per-run stats — reset every startGame, snapshotted on every event that
// could unlock an achievement. The check is cheap (six ID-keyed comparisons)
// so we run it inline rather than batching.
let runStats = {
    maxScore: 0,
    maxComboTier: 0,
    magnetCount: 0,
    shieldBlocks: 0,
    maxLevel: 0
};

function evaluateAchievements() {
    runStats.maxScore = Math.max(runStats.maxScore, score);
    runStats.maxComboTier = Math.max(runStats.maxComboTier, comboTier);
    runStats.maxLevel = Math.max(runStats.maxLevel, getCurrentLevel());
    const unlocked = checkAchievements(runStats);
    for (const a of unlocked) {
        showAchievementToast(a.name);
        markAchievementUnlocked(a.id);
    }
}

function resetRunStats() {
    runStats.maxScore = 0;
    runStats.maxComboTier = 0;
    runStats.magnetCount = 0;
    runStats.shieldBlocks = 0;
    runStats.maxLevel = 0;
}

// Hit slowdown state — longer recovery at higher levels to balance fast base speeds
let hitSlowActive = false;
let hitSlowTimer = 0;
let hitSlowDuration = 2.0;
const HIT_SLOW_DURATIONS = {
    1: 2.0,
    2: 2.0,
    3: 2.0,
    4: 3.0,
    5: 3.5,
    6: 4.0,
    7: 4.5
};
const HIT_SLOW_MIN = 0.4;   // Drops to 40% speed on hit
// The drop is eased in over a few frames rather than applied on one — snapping
// the forward velocity on impact read as a frame hitch even when nothing dropped.
// Same 40% floor and same recovery duration as before, just no step or kink.
const HIT_SLOW_IN = 0.18;
let speedPenalty = 1;
let hitSlowFrom = 1;   // speed the ease-in starts from, so a second hit doesn't jump

function smoothstep01(p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    return p * p * (3 - 2 * p);
}

// Combo lookup — highest tier whose threshold the current count has crossed.
function getComboTier(count) {
    let mult = 1;
    let tier = 0;
    for (const t of COMBO_TIERS) {
        if (count >= t.count) {
            mult = t.mult;
            tier = t.mult;
        }
    }
    return { mult, tier };
}

function resetCombo() {
    comboCount = 0;
    comboTimer = 0;
    comboTier = 0;
    hideCombo();
}

// Camera follow parameters
const cameraOffset = new THREE.Vector3(0, 5, 8);
const cameraLookAhead = new THREE.Vector3(0, 0, -12);
const cameraLerpSpeed = 3.5;

// Reusable objects to avoid per-frame allocations (reduces GC stutter)
const _cameraTargetPos = new THREE.Vector3();
const _cameraLookTarget = new THREE.Vector3();
const _marblePosVec = new THREE.Vector3();

// Track last segment generated
let segmentsGenerated = 0;

// Physics materials
let trackPhysMaterial;

function init() {
    highScore = parseInt(localStorage.getItem('swerve_highScore') || '0', 10);
    loadAchievements();
    loadSettings();

    const container = document.getElementById('game-container');
    const { scene, camera, renderer } = initScene(container);

    const { world, trackMaterial, marbleMaterial } = initPhysics();
    trackPhysMaterial = trackMaterial;

    createSkybox(scene, renderer);
    createHexBackground(scene);
    createShootingStars(scene);

    const { mesh: marbleMesh, body: marbleBody } = createMarble(scene, world, marbleMaterial);

    initControls(marbleMesh, marbleBody, camera, renderer);

    initTrack();
    initRails(scene);

    initHUD();
    initSettingsToggles(getAllSettings());
    applyColorblind(getSetting('colorblind'));
    initAchievementsList(getAchievementsList());

    // Settings toggles — touchstart only with preventDefault so a tap doesn't
    // fire both touchstart and the synthetic click (which would double-toggle).
    // stopPropagation keeps the overlay from also resuming the game.
    for (const key of ['sound', 'haptic', 'colorblind']) {
        const btn = getSettingToggle(key);
        if (!btn) continue;
        const handler = (e) => {
            e.stopPropagation();
            const newValue = !getSetting(key);
            setSetting(key, newValue);
            btn.classList.toggle('on', newValue);
            btn.setAttribute('aria-pressed', newValue ? 'true' : 'false');
            if (key === 'sound') setSoundEnabled(newValue);
            else if (key === 'colorblind') applyColorblind(newValue);
        };
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handler(e);
        });
        btn.addEventListener('click', (e) => {
            // Some browsers fire click without a preceding touchstart; guard
            // against double-fire with a short suppression window.
            if (btn._suppressClick) return;
            handler(e);
        });
        btn.addEventListener('touchend', () => {
            btn._suppressClick = true;
            setTimeout(() => { btn._suppressClick = false; }, 400);
        });
    }

    initAudio();
    setSoundEnabled(getSetting('sound'));

    // Pre-compile every shader program up front. Anything that first appears
    // mid-game — the ghost marble, the level-up streaks — has to be in here, or
    // the driver compiles it on the frame it shows up and the game hitches.
    warmUpGPU([
        ...getObstacleMaterials(),
        ...getCollectibleMaterials(),
        ...getPlayerMaterials(),
        ...getTrackMaterials(),
        ...getRailMaterials(),
        ...getShootingStarMaterials(),
        getHexMaterial()
    ]);
    // Sky materials (stars/nebulae) are already in the scene and visible,
    // so renderer.compile() inside warmUpGPU covers them. The star shader is a
    // Points material with custom attributes and must not go on a temp Mesh.

    showTitleScreen(highScore);

    getTitleScreen().addEventListener('click', startGame);
    getTitleScreen().addEventListener('touchstart', (e) => {
        e.preventDefault();
        startGame();
    });

    getRestartButton().addEventListener('click', () => {
        if (gameState === STATES.GAME_OVER) startGame();
    });
    getRestartButton().addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (gameState === STATES.GAME_OVER) startGame();
    });

    // Pause button → pause. Overlay tap → resume. Both routes go through
    // pauseGame/resumeGame so the state transitions stay in one place.
    getPauseButton().addEventListener('click', (e) => {
        e.stopPropagation();
        if (gameState === STATES.PLAYING) pauseGame();
    });
    getPauseButton().addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gameState === STATES.PLAYING) pauseGame();
    });
    const resumeFromOverlay = () => {
        if (gameState === STATES.PAUSED) resumeGame();
    };
    getPauseOverlay().addEventListener('click', resumeFromOverlay);
    getPauseOverlay().addEventListener('touchstart', (e) => {
        e.preventDefault();
        resumeFromOverlay();
    });

    marbleBody.addEventListener('collide', onMarbleCollide);

    requestAnimationFrame(gameLoop);
}

function pauseGame() {
    if (gameState !== STATES.PLAYING) return;
    gameState = STATES.PAUSED;
    releaseControls();
    showPauseOverlay();
}

function resumeGame() {
    if (gameState !== STATES.PAUSED) return;
    hidePauseOverlay();
    // Reset lastTime so the next dt doesn't cover the entire pause and jolt
    // the physics solver on the first frame back.
    lastTime = performance.now();
    gameState = STATES.PLAYING;
}

function startGame() {
    resumeAudio();

    const scene = getScene();
    const world = getWorld();

    resetTrack(scene, world);
    resetObstacles(scene, world);
    resetCollectibles(scene);
    resetShootingStars();
    setSkyLevel(1, true);
    resetDifficulty();

    score = 0;
    lives = 3;
    segmentsGenerated = 0;
    gameTime = 0;
    boostActive = false;
    boostTimer = 0;
    hitSlowActive = false;
    hitSlowTimer = 0;
    speedPenalty = 1;
    hitSlowFrom = 1;
    currentSpeedMult = 1;
    speedMultLerpFrom = 1;
    speedMultLerpTo = 1;
    speedMultLerpT = SPEED_MULT_LERP_DURATION;  // already settled
    resetCombo();
    resetPowerups();
    resetRunStats();

    // Generate initial track first, so we know the Y
    for (let i = 0; i < SEGMENTS_AHEAD; i++) {
        const level = getDifficultyForScore(score).level;
        const seg = generateSegment(scene, world, trackPhysMaterial, level);
        segmentsGenerated++;

        // Spawn obstacle first so collectibles can be placed around it
        let obstacle = null;
        if (i > 5) {
            obstacle = spawnObstacle(scene, world, seg.zPos, seg.width || 8, level, seg.endY);
        }
        if (i > 2) {
            spawnCollectiblesForSegment(scene, seg.zPos, seg.width || 8, level, seg.endY, obstacle);
        }
    }

    // Place ball on the first segment — push it slightly into the surface
    // so the physics solver detects contact immediately (no free-fall frame)
    const firstSeg = getSegments()[0];
    const marbleBody = getMarbleBody();
    const spawnY = firstSeg.endY + getMarbleRadius() - 0.05;
    marbleBody.position.set(0, spawnY, firstSeg.zPos);
    marbleBody.previousPosition.set(0, spawnY, firstSeg.zPos);
    marbleBody.interpolatedPosition.set(0, spawnY, firstSeg.zPos);
    marbleBody.velocity.set(0, 0, 0);
    marbleBody.angularVelocity.set(0, 0, 0);
    marbleBody.force.set(0, 0, 0);
    marbleBody.torque.set(0, 0, 0);

    // Let physics settle — ball finds the surface before gameplay begins
    for (let i = 0; i < 15; i++) {
        world.step(1 / 60);
    }
    // After settling, freeze the ball in place on the ground
    marbleBody.velocity.set(0, 0, 0);
    marbleBody.angularVelocity.set(0, 0, 0);
    marbleBody.force.set(0, 0, 0);
    marbleBody.torque.set(0, 0, 0);
    // Sync previous position to prevent interpolation jump
    marbleBody.previousPosition.copy(marbleBody.position);
    marbleBody.interpolatedPosition.copy(marbleBody.position);

    // Snap camera to correct position — prevents lerp-from-stale-position jitter
    const camera = getCamera();
    camera.position.set(
        0,
        marbleBody.position.y + cameraOffset.y,
        marbleBody.position.z + cameraOffset.z
    );
    const lookTarget = new THREE.Vector3(0, marbleBody.position.y + 0.5, marbleBody.position.z + cameraLookAhead.z);
    camera.lookAt(lookTarget);

    updateScore(score);
    updateHighScore(highScore);
    updateLives(lives);
    hideGhostIndicator();

    hideTitleScreen();
    hideGameOver();
    showHUD();
    showPauseButton();
    hidePauseOverlay();
    showLevelUp(1);
    lastTime = performance.now();
    gameState = STATES.PLAYING;

    if (isFirstGame) {
        isFirstGame = false;
        showTutorial();
    }
}

function onMarbleCollide(event) {
    if (gameState !== STATES.PLAYING) return;
    if (isGhostMode()) return;

    const otherBody = event.body;
    if (otherBody.collisionFilterGroup === GROUPS.OBSTACLE) {
        takeDamage();
    }
}

function takeDamage() {
    if (isGhostMode()) return;

    // Shield absorbs the hit outright — no life lost, no ghost, no slowdown.
    // Just a brief flash + effect pulse so the player knows what saved them.
    if (shieldActive) {
        shieldActive = false;
        updatePowerup('shield', false);
        runStats.shieldBlocks++;
        playShieldSound();
        pulseEffect(0.5);
        hitFlash();
        haptic(20);
        evaluateAchievements();
        return;
    }

    lives--;
    updateLives(lives);
    playHitSound();
    screenShake();
    hitFlash();
    pulseEffect(0.7);
    haptic([30, 25, 70]);
    resetCombo();

    if (lives <= 0) {
        gameOver();
        return;
    }

    enterGhostMode();
    hitSlowActive = true;
    hitSlowDuration = HIT_SLOW_DURATIONS[getCurrentLevel()] || 2.0;
    hitSlowTimer = hitSlowDuration;
    hitSlowFrom = speedPenalty;
}

function gameOver() {
    gameState = STATES.GAME_OVER;
    playGameOverSound();
    haptic(120);

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('swerve_highScore', highScore.toString());
    }

    // Final snapshot — score may have crossed an achievement threshold on
    // the very last pickup before death.
    evaluateAchievements();
    updateAchievementsSummary(getUnlockedCount(), getTotalCount());

    hideHUD();
    hideGhostIndicator();
    hidePauseButton();
    hidePauseOverlay();
    showGameOver(score, highScore);
}

function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    const time = timestamp / 1000;
    lastTime = timestamp;

    const scene = getScene();
    const camera = getCamera();

    // Everything that ticks lives inside this guard — sky, hex, shooting
    // stars, post-effect decay. The render call stays outside so a paused
    // frame still draws the last state.
    if (gameState === STATES.PLAYING) {
        gameTime += dt;
        updatePlaying(dt, time);
        updateSkybox(time, camera.position);
        updateHexBackground(time, camera.position);
        updateShootingStars(time, camera.position);
        updateEffect(dt);
    }

    renderFrame();
}

function updatePlaying(dt, time) {
    const scene = getScene();
    const world = getWorld();
    const marbleBody = getMarbleBody();
    const marbleMesh = getMarbleMesh();
    const camera = getCamera();

    // Reusable position vector — refreshed once per frame so magnet pull and
    // pickup tests both see the same point without re-reading marbleBody twice.
    _marblePosVec.copy(marbleBody.position);

    // Constant speed — only changes on level-up, then eased in over
    // SPEED_MULT_LERP_DURATION so the jump from 1.0× to 1.15× doesn't snap.
    const targetSpeedMult = getSpeedMultiplier(score);
    if (targetSpeedMult !== speedMultLerpTo) {
        speedMultLerpFrom = currentSpeedMult;
        speedMultLerpTo = targetSpeedMult;
        speedMultLerpT = 0;
    }
    if (speedMultLerpT < SPEED_MULT_LERP_DURATION) {
        speedMultLerpT += dt;
        const p = Math.min(speedMultLerpT / SPEED_MULT_LERP_DURATION, 1);
        currentSpeedMult = speedMultLerpFrom +
            (speedMultLerpTo - speedMultLerpFrom) * smoothstep01(p);
    } else {
        currentSpeedMult = speedMultLerpTo;
    }

    // Boost timer countdown
    if (boostActive) {
        boostTimer -= dt;
        if (boostTimer <= 0) {
            boostActive = false;
        }
    }

    // Hit slowdown — ease down to HIT_SLOW_MIN, hold the floor, ease back to 1.0.
    // Both ends of both curves have zero slope, so there is no velocity step on
    // impact and no kink when the recovery finishes.
    if (hitSlowActive) {
        hitSlowTimer -= dt;
        if (hitSlowTimer <= 0) {
            hitSlowActive = false;
            speedPenalty = 1;
        } else {
            const elapsed = hitSlowDuration - hitSlowTimer;
            if (elapsed < HIT_SLOW_IN) {
                speedPenalty = hitSlowFrom -
                    (hitSlowFrom - HIT_SLOW_MIN) * smoothstep01(elapsed / HIT_SLOW_IN);
            } else {
                const progress = (elapsed - HIT_SLOW_IN) / (hitSlowDuration - HIT_SLOW_IN);
                speedPenalty = HIT_SLOW_MIN + (1 - HIT_SLOW_MIN) * smoothstep01(progress);
            }
        }
    }

    // Power-up timers — magnet and slow-mo expire on their own.
    if (magnetActive) {
        magnetTimer -= dt;
        if (magnetTimer <= 0) {
            magnetActive = false;
            updatePowerup('magnet', false);
        }
    }
    if (slowMoActive) {
        slowMoTimer -= dt;
        if (slowMoTimer <= 0) {
            slowMoActive = false;
            updatePowerup('slowmo', false);
        }
    }

    // Magnet pulls score-only collectibles toward the marble each frame.
    // Score items get pulled into the marble's pickup radius naturally.
    if (magnetActive) {
        pullCollectibles(_marblePosVec, MAGNET_RADIUS, MAGNET_PULL_SPEED, dt);
    }

    const forwardSpeed = BASE_FORWARD_SPEED * currentSpeedMult *
        (boostActive ? BOOST_SPEED_MULT : 1) *
        speedPenalty *
        (slowMoActive ? SLOW_MO_MULT : 1);

    // Set forward velocity directly for constant, predictable speed
    marbleBody.velocity.z = forwardSpeed;

    // Touch / trackpad / keyboard controls
    updateControls(dt);

    // Step physics
    stepPhysics(dt);

    // Hard-clamp ball X inside the rails (prevents tunneling at any speed)
    const TRACK_MAX_X = 3.35;   // halfW(4.5) - railHalfX(0.5) - marbleR(0.65)
    if (marbleBody.position.x > TRACK_MAX_X) {
        marbleBody.position.x = TRACK_MAX_X;
        if (marbleBody.velocity.x > 0) marbleBody.velocity.x = 0;
    } else if (marbleBody.position.x < -TRACK_MAX_X) {
        marbleBody.position.x = -TRACK_MAX_X;
        if (marbleBody.velocity.x < 0) marbleBody.velocity.x = 0;
    }

    // Ball must stay on the ground — dampen upward velocity so the solver can
    // settle without an oscillation loop. Skip while airborne: the jump gives
    // upward velocity on purpose, and killing it would silently disable jump.
    if (!isMarbleAirborne()) {
        if (marbleBody.velocity.y > 0.3) {
            marbleBody.velocity.y = 0;
        } else if (marbleBody.velocity.y > 0) {
            marbleBody.velocity.y *= 0.5;
        }
    }

    // Update marble visual
    updateMarble(dt);

    // Camera follow
    updateCamera(camera, marbleMesh, dt);

    // Check if marble fell off track
    const trackY = getCurrentTrackY();
    if (marbleBody.position.y < trackY - 20) {
        respawnMarble(marbleBody.position.z, trackY + getMarbleRadius());
        takeDamage();
        if (gameState !== STATES.PLAYING) return;
    }

    // Generate more track ahead
    const marbleZ = marbleBody.position.z;
    const lastZ = getLastSegmentZ();
    const segLen = getSegmentLength();

    while (marbleZ - lastZ < SEGMENTS_AHEAD * segLen) {
        const level = getDifficultyForScore(score).level;
        const seg = generateSegment(scene, world, trackPhysMaterial, level);
        segmentsGenerated++;

        const obstacle = spawnObstacle(scene, world, seg.zPos, seg.width || 8, level, seg.endY);
        spawnCollectiblesForSegment(scene, seg.zPos, seg.width || 8, level, seg.endY, obstacle);

        if (marbleZ - getLastSegmentZ() >= SEGMENTS_AHEAD * segLen) break;
    }

    // Cleanup old segments and objects
    removeOldSegments(scene, world, marbleZ);
    removeOldObstacles(scene, world, marbleZ);
    removeOldCollectibles(scene, marbleZ);

    // Update rail visuals
    updateRails();

    // Update obstacles (animations)
    updateObstacles(time);

    // Update collectibles and check collections (skip during ghost mode)
    const collectResult = updateCollectibles(time, _marblePosVec, getMarbleRadius(), !isGhostMode());

    if (collectResult.boost) {
        boostActive = true;
        boostTimer = BOOST_DURATION;
        playBoostSound();
        pulseEffect(0.4);
        haptic(15);
    }

    if (collectResult.magnet) {
        magnetActive = true;
        magnetTimer = MAGNET_DURATION;
        runStats.magnetCount++;
        playMagnetSound();
        haptic(25);
        updatePowerup('magnet', true, magnetTimer, MAGNET_DURATION);
    } else if (magnetActive) {
        // Ring ticks down even when no new pickup — keeps the HUD honest.
        updatePowerup('magnet', true, magnetTimer, MAGNET_DURATION);
    }

    if (collectResult.shield) {
        shieldActive = true;
        playShieldSound();
        haptic(15);
        updatePowerup('shield', true);
    }

    if (collectResult.slowMo) {
        slowMoActive = true;
        slowMoTimer = SLOW_MO_DURATION;
        playSlowMoSound();
        haptic(20);
        updatePowerup('slowmo', true, slowMoTimer, SLOW_MO_DURATION);
    } else if (slowMoActive) {
        updatePowerup('slowmo', true, slowMoTimer, SLOW_MO_DURATION);
    }

    if (collectResult.count > 0) {
        // Combo — every pickup restarts the window and bumps the count.
        // Multiplier is applied to the whole batch this frame so a single
        // frame that catches 3 dots already scores at ×2 once you've built one.
        const oldTier = comboTier;
        comboCount += collectResult.count;
        comboTimer = COMBO_WINDOW;
        const { mult, tier } = getComboTier(comboCount);
        comboTier = tier;
        const earned = collectResult.points * mult;
        score += earned;
        updateScore(score);

        if (collectResult.bestPoints >= 100) playHoopSound();
        else if (collectResult.bestPoints >= 50) playDiamondSound();
        else playCollectSound();

        // Visible feedback only once the chain actually means something
        if (comboCount >= 2) {
            updateCombo(comboCount, mult, tier);
            if (tier > oldTier) playComboTierSound(tier);
        }

        const levelUp = checkLevelUp(score);
        if (levelUp) {
            showLevelUp(levelUp.level);
            // Celebration is for levels actually earned — level 1 is just the start
            triggerShootingStars(time, levelUp.level);
            setSkyLevel(levelUp.level);
            playLevelUpSound();
            haptic([10, 20, 10, 20, 50]);
        }

        if (score > highScore) {
            highScore = score;
            updateHighScore(highScore);
            localStorage.setItem('swerve_highScore', highScore.toString());
        }

        evaluateAchievements();
    }

    // Combo decay — silent reset; the HUD hides itself.
    if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) resetCombo();
    }

    // Ghost mode HUD
    if (isGhostMode()) {
        showGhostIndicator(getGhostTimer(), getGhostDuration());
    } else {
        hideGhostIndicator();
    }
}

function updateCamera(camera, marbleMesh, dt) {
    _cameraTargetPos.set(
        marbleMesh.position.x * 0.4,
        marbleMesh.position.y + cameraOffset.y,
        marbleMesh.position.z + cameraOffset.z
    );

    // Frame-rate-independent exponential decay — eliminates jitter from dt variation
    const smoothFactor = 1 - Math.exp(-cameraLerpSpeed * dt);
    // Much smoother Y tracking to absorb staircase slope transitions
    const ySmoothFactor = 1 - Math.exp(-1.2 * dt);

    camera.position.x += (_cameraTargetPos.x - camera.position.x) * smoothFactor;
    camera.position.y += (_cameraTargetPos.y - camera.position.y) * ySmoothFactor;
    camera.position.z += (_cameraTargetPos.z - camera.position.z) * smoothFactor;

    _cameraLookTarget.set(
        marbleMesh.position.x * 0.3,
        marbleMesh.position.y + 0.5,
        marbleMesh.position.z + cameraLookAhead.z
    );
    camera.lookAt(_cameraLookTarget);
}

function showTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('active');

    const dismiss = () => {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
        document.removeEventListener('touchstart', dismiss);
        document.removeEventListener('click', dismiss);
    };

    // Remove when animation ends naturally
    overlay.addEventListener('animationend', dismiss, { once: true });

    // Also dismiss on touch — defer so the starting tap doesn't trigger it
    requestAnimationFrame(() => {
        document.addEventListener('touchstart', dismiss);
        document.addEventListener('click', dismiss);
    });
}

// Start the game
init();
