let scoreEl, highscoreEl, livesEls, ghostIndicator, ghostTimerRing;
let levelUpEl, levelUpTextEl;
let titleScreen, titleHighscore, tapToStart;
let gameOverScreen, finalScore, finalHighscore, restartBtn;
let gameContainer, hitFlashEl;
let comboEl, comboCountEl, comboMultEl;
let powerupSlots = {};   // kind -> { slot, ringFg, lastOffset }
let achievementToast, achievementToastName, achievementsSummaryEl;
let achievementsListEl;
let achievementRows = {};   // id -> DOM element
let pauseBtn, pauseOverlay;
let toastHideTimer = null;

// Cached state so the per-frame HUD calls stay no-ops when nothing changed
let scorePulseTimer = null;
let ghostVisible = false;
let lastRingOffset = -1;
let shakeTimer = null;
let flashTimer = null;

export function initHUD() {
    scoreEl = document.getElementById('score-display');
    highscoreEl = document.getElementById('highscore-display');
    livesEls = [
        document.getElementById('life-1'),
        document.getElementById('life-2'),
        document.getElementById('life-3')
    ];
    ghostIndicator = document.getElementById('ghost-indicator');
    ghostTimerRing = document.getElementById('ghost-timer-ring');
    levelUpEl = document.getElementById('level-up');
    levelUpTextEl = document.getElementById('level-up-text');
    titleScreen = document.getElementById('title-screen');
    titleHighscore = document.getElementById('title-highscore');
    tapToStart = document.getElementById('tap-to-start');
    gameOverScreen = document.getElementById('game-over-screen');
    finalScore = document.getElementById('final-score');
    finalHighscore = document.getElementById('final-highscore');
    restartBtn = document.getElementById('restart-btn');
    gameContainer = document.getElementById('game-container');
    hitFlashEl = document.getElementById('hit-flash');
    comboEl = document.getElementById('combo-display');
    comboCountEl = document.getElementById('combo-count');
    comboMultEl = document.getElementById('combo-mult');

    for (const kind of ['magnet', 'slowmo', 'shield']) {
        const slot = document.getElementById(`slot-${kind}`);
        const ringFg = slot ? slot.querySelector('.ring-fg') : null;
        powerupSlots[kind] = { slot, ringFg, lastOffset: -1 };
    }

    achievementToast = document.getElementById('achievement-toast');
    achievementToastName = document.getElementById('achievement-toast-name');
    achievementsSummaryEl = document.getElementById('achievements-summary');

    pauseBtn = document.getElementById('pause-btn');
    pauseOverlay = document.getElementById('pause-overlay');
    achievementsListEl = document.getElementById('achievements-list');
}

export function updateScore(score) {
    scoreEl.textContent = score;
    scoreEl.classList.add('pulse');
    // One shared timer — dots arrive in bursts and used to stack up timeouts
    if (scorePulseTimer) clearTimeout(scorePulseTimer);
    scorePulseTimer = setTimeout(() => {
        scoreEl.classList.remove('pulse');
        scorePulseTimer = null;
    }, 150);
}

export function updateHighScore(highscore) {
    highscoreEl.textContent = `최고: ${highscore}`;
}

export function updateLives(lives) {
    for (let i = 0; i < 3; i++) {
        if (i < lives) {
            livesEls[i].classList.remove('lost');
            livesEls[i].classList.add('active');
        } else {
            livesEls[i].classList.remove('active');
            livesEls[i].classList.add('lost');
        }
    }
}

// Called every frame while ghosting — only touches the DOM when something moves
export function showGhostIndicator(timeRemaining, totalDuration) {
    if (!ghostVisible) {
        ghostIndicator.classList.remove('hidden');
        ghostVisible = true;
    }
    // Update the ring (stroke-dashoffset from 0 to circumference)
    const circumference = 100.53; // 2 * PI * 16
    const offset = circumference * (1 - timeRemaining / totalDuration);
    // Skip sub-pixel writes; each one costs a style recalc
    if (Math.abs(offset - lastRingOffset) < 0.6) return;
    lastRingOffset = offset;
    ghostTimerRing.style.strokeDashoffset = offset;
}

export function hideGhostIndicator() {
    if (!ghostVisible) return;
    ghostIndicator.classList.add('hidden');
    ghostVisible = false;
    lastRingOffset = -1;
}

export function showLevelUp(level) {
    levelUpTextEl.innerHTML = `레벨<br>${level}`;
    levelUpEl.classList.remove('hidden');

    // Re-trigger animation
    levelUpTextEl.style.animation = 'none';
    levelUpTextEl.offsetHeight; // Force reflow
    levelUpTextEl.style.animation = '';

    setTimeout(() => {
        levelUpEl.classList.add('hidden');
    }, 3000);
}

export function showHUD() {
    document.getElementById('hud').classList.remove('hidden');
}

export function hideHUD() {
    document.getElementById('hud').classList.add('hidden');
}

export function showTitleScreen(highscore) {
    titleScreen.classList.remove('hidden');
    titleHighscore.textContent = `최고 기록: ${highscore}`;
}

export function hideTitleScreen() {
    titleScreen.classList.add('hidden');
}

export function showGameOver(score, highscore) {
    gameOverScreen.classList.remove('hidden');
    finalScore.textContent = score;
    finalHighscore.textContent = `최고: ${highscore}`;
}

export function hideGameOver() {
    gameOverScreen.classList.add('hidden');
}

export function screenShake() {
    if (shakeTimer) {
        clearTimeout(shakeTimer);
        gameContainer.classList.remove('screen-shake');
        void gameContainer.offsetWidth;   // restart the animation on a rapid second hit
    }
    gameContainer.classList.add('screen-shake');
    shakeTimer = setTimeout(() => {
        gameContainer.classList.remove('screen-shake');
        shakeTimer = null;
    }, 300);
}

// The flash overlay lives in the DOM permanently and is toggled by class.
// Creating/destroying a full-screen layer on every hit forced a fresh layout,
// paint and layer allocation at exactly the worst moment.
export function hitFlash() {
    if (flashTimer) {
        clearTimeout(flashTimer);
        hitFlashEl.classList.remove('active');
        void hitFlashEl.offsetWidth;
    }
    hitFlashEl.classList.add('active');
    flashTimer = setTimeout(() => {
        hitFlashEl.classList.remove('active');
        flashTimer = null;
    }, 300);
}

export function getRestartButton() { return gameOverScreen; }
export function getTitleScreen() { return titleScreen; }

// Combo — count + multiplier tier. Tier drives both the colour and the pulse.
export function updateCombo(count, mult, tier) {
    if (comboEl.classList.contains('hidden')) {
        comboEl.classList.remove('hidden');
    }
    comboCountEl.textContent = count;
    comboMultEl.textContent = `×${mult}`;
    const tierStr = tier > 0 ? String(tier) : '1';
    if (comboEl.dataset.tier !== tierStr) {
        comboEl.dataset.tier = tierStr;
        // Restart the pulse by toggling the animation off/on
        comboEl.style.animation = 'none';
        void comboEl.offsetWidth;
        comboEl.style.animation = '';
    }
}

export function hideCombo() {
    if (comboEl.classList.contains('hidden')) return;
    comboEl.classList.add('hidden');
    delete comboEl.dataset.tier;
}

// Power-ups: active=true reveals the slot, active=false hides it. Ringed
// kinds (magnet, slow_mo) get a countdown arc; shield has no duration and
// shows a full ring as long as it's held.
const RING_CIRCUMFERENCE = 100.53;
export function updatePowerup(kind, active, timeRemaining, totalDuration) {
    const entry = powerupSlots[kind];
    if (!entry || !entry.slot) return;
    if (!active) {
        if (!entry.slot.classList.contains('hidden')) {
            entry.slot.classList.add('hidden');
        }
        entry.lastOffset = -1;
        return;
    }
    entry.slot.classList.remove('hidden');

    // Shield has no timeRemaining — the ring stays full as a binary "have" indicator.
    if (entry.ringFg) {
        let offset;
        if (timeRemaining === undefined || !totalDuration) {
            offset = 0;
        } else {
            offset = RING_CIRCUMFERENCE * (1 - timeRemaining / totalDuration);
        }
        if (Math.abs(offset - entry.lastOffset) >= 0.6) {
            entry.lastOffset = offset;
            entry.ringFg.style.strokeDashoffset = offset;
        }
    }
}

// Achievement toast — slide in, hold, slide out. Multiple calls just refresh
// the title; the most recent achievement wins so the user always sees what
// they just earned instead of the one they unlocked seconds earlier.
export function showAchievementToast(name) {
    if (!achievementToast) return;
    achievementToastName.textContent = name;
    achievementToast.classList.add('show');
    if (toastHideTimer) clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => {
        achievementToast.classList.remove('show');
        toastHideTimer = null;
    }, 3000);
}

export function hideAchievementToast() {
    if (!achievementToast) return;
    achievementToast.classList.remove('show');
    if (toastHideTimer) {
        clearTimeout(toastHideTimer);
        toastHideTimer = null;
    }
}

export function updateAchievementsSummary(unlocked, total) {
    if (achievementsSummaryEl) {
        achievementsSummaryEl.textContent = `업적 ${unlocked}/${total}`;
    }
}

// Pause button — visible only during gameplay. The handler is bound by the
// caller; we just expose the element so main.js can attach the listener.
export function showPauseButton() {
    if (pauseBtn && pauseBtn.classList.contains('hidden')) {
        pauseBtn.classList.remove('hidden');
    }
}

export function hidePauseButton() {
    if (pauseBtn && !pauseBtn.classList.contains('hidden')) {
        pauseBtn.classList.add('hidden');
    }
}

export function showPauseOverlay() {
    if (pauseOverlay) pauseOverlay.classList.remove('hidden');
}

export function hidePauseOverlay() {
    if (pauseOverlay) pauseOverlay.classList.add('hidden');
}

export function getPauseButton() { return pauseBtn; }
export function getPauseOverlay() { return pauseOverlay; }

// Settings — sync the toggle visuals to the saved state, then attach a
// change handler. Returns the toggle elements so main.js can wire the
// runtime effect (master gain, haptic gate, colorblind filter class).
const toggleEls = {};
export function initSettingsToggles(initialValues) {
    const toggles = pauseOverlay ? pauseOverlay.querySelectorAll('.toggle') : [];
    toggles.forEach((btn) => {
        const key = btn.dataset.setting;
        toggleEls[key] = btn;
        const on = !!initialValues[key];
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    return toggleEls;
}

export function getSettingToggle(key) {
    return toggleEls[key];
}

export function applyColorblind(on) {
    if (gameContainer) {
        gameContainer.classList.toggle('colorblind', on);
    }
}

// Achievements gallery — built once from the snapshot, individual rows
// flipped to "unlocked" as the player earns them. Re-rendering the whole
// list on every unlock would churn the DOM; class toggle is enough.
export function initAchievementsList(achievements) {
    if (!achievementsListEl) return;
    achievementRows = {};
    achievementsListEl.innerHTML = '';
    for (const a of achievements) {
        const row = document.createElement('div');
        row.className = 'achievement-row ' + (a.unlocked ? 'unlocked' : 'locked');
        row.dataset.achievementId = a.id;

        const icon = document.createElement('span');
        icon.className = 'achievement-icon';
        icon.textContent = a.unlocked ? '★' : '☆';

        const text = document.createElement('div');
        text.className = 'achievement-text';
        const name = document.createElement('div');
        name.className = 'achievement-name';
        name.textContent = a.name;
        const desc = document.createElement('div');
        desc.className = 'achievement-desc';
        desc.textContent = a.desc;
        text.appendChild(name);
        text.appendChild(desc);

        row.appendChild(icon);
        row.appendChild(text);
        achievementsListEl.appendChild(row);
        achievementRows[a.id] = { row, icon };
    }
}

export function markAchievementUnlocked(id) {
    const entry = achievementRows[id];
    if (!entry) return;
    if (entry.row.classList.contains('unlocked')) return;
    entry.row.classList.remove('locked');
    entry.row.classList.add('unlocked');
    entry.icon.textContent = '★';
}
