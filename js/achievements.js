// Achievement system. Each entry has a condition function that takes the
// per-run stats snapshot and returns true when the requirement is met.
// Unlocked IDs live in localStorage so they survive across sessions.

export const ACHIEVEMENTS = [
    {
        id: 'first_score',
        name: '첫 발걸음',
        desc: '100점 달성'
    },
    {
        id: 'combo_master',
        name: '콤보 마스터',
        desc: '×5 콤보 달성'
    },
    {
        id: 'ten_thousand',
        name: '만점 돌파',
        desc: '10,000점 달성'
    },
    {
        id: 'magnet_user',
        name: '자석 덕후',
        desc: '자석 5회 사용'
    },
    {
        id: 'shield_blocker',
        name: '방패 기사',
        desc: '방패로 피격 1회 무효화'
    },
    {
        id: 'nightmare',
        name: '악몽 정복',
        desc: '레벨 7 도달'
    }
];

const STORAGE_KEY = 'swerve_achievements';
let unlocked = new Set();
let lastShown = 0;
const NOTIFY_COOLDOWN_MS = 600;

function load() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        unlocked = new Set(data.unlocked || []);
    } catch (e) {
        unlocked = new Set();
    }
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked: [...unlocked] }));
    } catch (e) {
        // Storage may be unavailable (private mode, quota); silently no-op
    }
}

export function loadAchievements() {
    load();
}

export function getAchievements() {
    return ACHIEVEMENTS;
}

export function getUnlockedCount() {
    return unlocked.size;
}

export function getTotalCount() {
    return ACHIEVEMENTS.length;
}

export function getUnlockedIds() {
    return [...unlocked];
}

export function isUnlocked(id) {
    return unlocked.has(id);
}

// Evaluate all achievements against the current run stats. Returns any newly
// unlocked ones in definition order, with a per-run cooldown so unlocking
// several at once still produces a readable cascade rather than a strobe.
export function checkAchievements(stats) {
    const newlyUnlocked = [];
    const now = performance.now();
    for (const a of ACHIEVEMENTS) {
        if (unlocked.has(a.id)) continue;
        if (!achievementUnlocked(a, stats)) continue;
        unlocked.add(a.id);
        if (now - lastShown >= NOTIFY_COOLDOWN_MS) {
            newlyUnlocked.push(a);
            lastShown = now;
        }
    }
    if (newlyUnlocked.length > 0) save();
    return newlyUnlocked;
}

function achievementUnlocked(a, s) {
    switch (a.id) {
        case 'first_score': return s.maxScore >= 100;
        case 'combo_master': return s.maxComboTier >= 5;
        case 'ten_thousand': return s.maxScore >= 10000;
        case 'magnet_user': return s.magnetCount >= 5;
        case 'shield_blocker': return s.shieldBlocks >= 1;
        case 'nightmare': return s.maxLevel >= 7;
        default: return false;
    }
}

export function resetAchievements() {
    unlocked.clear();
    save();
}

// Snapshot for the pause-overlay gallery. The caller already has the unlock
// state in `unlocked`, so we just merge it onto the static definitions.
export function getAchievementsList() {
    return ACHIEVEMENTS.map(a => ({
        id: a.id,
        name: a.name,
        desc: a.desc,
        unlocked: unlocked.has(a.id)
    }));
}