// Settings — three toggles persisted in localStorage. Sound and haptic gate
// runtime effects (master gain, navigator.vibrate), colorblind applies a CSS
// hue-rotate filter on the game canvas. Defaults are intentionally generous:
// sound and haptic on, colorblind off.

const STORAGE_KEY = 'swerve_settings';
const DEFAULTS = {
    sound: true,
    haptic: true,
    colorblind: false
};

let settings = { ...DEFAULTS };

export function loadSettings() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        // Merge over defaults so a stale saved value can't disable unknown keys.
        settings = { ...DEFAULTS, ...data };
    } catch (e) {
        settings = { ...DEFAULTS };
    }
    return settings;
}

export function getSetting(key) {
    return settings[key];
}

export function setSetting(key, value) {
    settings[key] = value;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        // Storage may be unavailable; keep the in-memory change anyway
    }
    return settings;
}

export function getAllSettings() {
    return { ...settings };
}

// Haptic helper — gated through the setting so call sites stay readable.
// navigator.vibrate is silently no-op on iOS Safari and on devices that
// don't expose the API, so no platform check is needed.
export function haptic(pattern) {
    if (!settings.haptic) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(pattern); } catch (e) {}
    }
}