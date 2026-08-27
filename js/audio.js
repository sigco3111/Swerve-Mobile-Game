// Audio module — optional sound effects using Web Audio API

let audioCtx;
let masterGain;
let initialized = false;
let soundEnabled = true;
const SOUND_VOLUME = 0.3;

export function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = soundEnabled ? SOUND_VOLUME : 0;
        masterGain.connect(audioCtx.destination);
        initialized = true;
    } catch (e) {
        console.warn('Web Audio API를 사용할 수 없습니다');
    }
}

export function setSoundEnabled(enabled) {
    soundEnabled = enabled;
    if (masterGain) masterGain.gain.value = enabled ? SOUND_VOLUME : 0;
}

export function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, duration, type = 'sine', volume = 0.2) {
    if (!initialized) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
}

export function playCollectSound() {
    playTone(880, 0.1, 'sine', 0.15);
    setTimeout(() => playTone(1100, 0.1, 'sine', 0.1), 50);
}

export function playDiamondSound() {
    playTone(660, 0.15, 'sine', 0.2);
    setTimeout(() => playTone(880, 0.15, 'sine', 0.15), 80);
    setTimeout(() => playTone(1320, 0.2, 'sine', 0.1), 160);
}

export function playHoopSound() {
    playTone(440, 0.2, 'triangle', 0.2);
    setTimeout(() => playTone(660, 0.2, 'triangle', 0.15), 100);
    setTimeout(() => playTone(880, 0.3, 'triangle', 0.1), 200);
}

export function playHitSound() {
    playTone(150, 0.3, 'sawtooth', 0.3);
    playTone(100, 0.4, 'square', 0.1);
}

export function playGameOverSound() {
    playTone(440, 0.3, 'sawtooth', 0.2);
    setTimeout(() => playTone(330, 0.3, 'sawtooth', 0.2), 200);
    setTimeout(() => playTone(220, 0.5, 'sawtooth', 0.15), 400);
}

export function playLevelUpSound() {
    playTone(523, 0.15, 'sine', 0.2);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.2), 100);
    setTimeout(() => playTone(784, 0.15, 'sine', 0.2), 200);
    setTimeout(() => playTone(1047, 0.3, 'sine', 0.15), 300);
}

export function playBoostSound() {
    if (!initialized) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
}

// Combo tier escalation — short ascending arpeggio whose pitch climbs with tier.
// ×2: low/mid; ×3: mid/high; ×5: top-of-range with a fifth on top for emphasis.
export function playComboTierSound(tier) {
    if (!initialized) return;
    const seq = tier >= 5 ? [523, 659, 784, 1047, 1319] :
                tier >= 3 ? [440, 554, 659, 880] :
                tier >= 2 ? [392, 494, 587] : null;
    if (!seq) return;
    seq.forEach((f, i) => {
        setTimeout(() => playTone(f, 0.12, 'triangle', 0.13), i * 60);
    });
}

// Magnet — rising sweep, like a vacuum spooling up.
export function playMagnetSound() {
    if (!initialized) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
}

// Shield — bright "ding" with a soft decay. Reads as an aegis locking on.
export function playShieldSound() {
    if (!initialized) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.35);
}

// Slow-mo — descending pitch sweep with a detuned partner for thickness.
export function playSlowMoSound() {
    if (!initialized) return;
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.4);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880 * 1.01, audioCtx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(220 * 1.01, audioCtx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(masterGain);
    osc.start(audioCtx.currentTime);
    osc2.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.45);
    osc2.stop(audioCtx.currentTime + 0.45);
}
