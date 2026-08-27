import * as THREE from 'three';

const collectibles = [];

// Shared geometries
const dotGeo = new THREE.SphereGeometry(0.2, 12, 12);
const diamondGeo = new THREE.OctahedronGeometry(0.35, 1);
const hoopGeo = new THREE.TorusGeometry(2.0, 0.15, 12, 24, Math.PI);
const boostGeo = (() => {
    const geo = new THREE.ConeGeometry(0.3, 0.7, 8);
    geo.rotateX(-Math.PI / 2); // Point forward (-Z)
    return geo;
})();
// Power-up geometry. Each shape is recognisable at speed: torus (magnet ring),
// octahedron (shield crystal), and a smaller cone for slow-mo to read as a
// "shrunk" version of the boost cone.
const magnetGeo = new THREE.TorusGeometry(0.32, 0.08, 8, 20);
const shieldGeo = new THREE.OctahedronGeometry(0.38, 0);
const slowMoGeo = (() => {
    const geo = new THREE.ConeGeometry(0.28, 0.55, 6);
    geo.rotateX(-Math.PI / 2);
    return geo;
})();

// Shared materials
const dotMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ccff,
    emissive: 0x0088ff,
    emissiveIntensity: 0.7,
    roughness: 0.3,
    metalness: 0.4
});

const diamondMaterial = new THREE.MeshStandardMaterial({
    color: 0xffdd00,
    emissive: 0xffaa00,
    emissiveIntensity: 0.7,
    roughness: 0.2,
    metalness: 0.6
});

const hoopMaterial = new THREE.MeshStandardMaterial({
    color: 0xffee00,
    emissive: 0xffdd00,
    emissiveIntensity: 1.2,
    roughness: 0.15,
    metalness: 0.6
});

const boostMaterial = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x00ff00,
    emissiveIntensity: 1.0,
    roughness: 0.2,
    metalness: 0.5
});

const magnetMaterial = new THREE.MeshStandardMaterial({
    color: 0xff00aa,
    emissive: 0xff00aa,
    emissiveIntensity: 1.0,
    roughness: 0.2,
    metalness: 0.45
});

const shieldMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ddff,
    emissive: 0x00ddff,
    emissiveIntensity: 1.0,
    roughness: 0.15,
    metalness: 0.55
});

const slowMoMaterial = new THREE.MeshStandardMaterial({
    color: 0x7766ff,
    emissive: 0x6644ff,
    emissiveIntensity: 0.95,
    roughness: 0.2,
    metalness: 0.45
});

export const COLLECTIBLE_TYPES = {
    DOT: 'dot',
    DIAMOND: 'diamond',
    HOOP: 'hoop',
    BOOST: 'boost',
    MAGNET: 'magnet',
    SHIELD: 'shield',
    SLOW_MO: 'slow_mo'
};

function createDot(scene, x, y, z) {
    const mesh = new THREE.Mesh(dotGeo, dotMaterial);
    mesh.position.set(x, y + 0.5, z);
    scene.add(mesh);

    return {
        type: COLLECTIBLE_TYPES.DOT,
        mesh,
        zPos: z,
        baseY: y,
        collected: false,
        collectTime: 0,
        points: 10
    };
}

function createDiamond(scene, x, y, z) {
    const mesh = new THREE.Mesh(diamondGeo, diamondMaterial);
    mesh.position.set(x, y + 0.8, z);
    scene.add(mesh);

    return {
        type: COLLECTIBLE_TYPES.DIAMOND,
        mesh,
        zPos: z,
        baseY: y,
        collected: false,
        collectTime: 0,
        points: 50
    };
}

function createHoop(scene, x, y, z) {
    const mesh = new THREE.Mesh(hoopGeo, hoopMaterial);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    return {
        type: COLLECTIBLE_TYPES.HOOP,
        mesh,
        zPos: z,
        baseY: y,
        collected: false,
        collectTime: 0,
        points: 100,
        innerRadius: 2.0
    };
}

function createBoost(scene, x, y, z) {
    const mesh = new THREE.Mesh(boostGeo, boostMaterial);
    mesh.position.set(x, y + 0.6, z);
    scene.add(mesh);

    return {
        type: COLLECTIBLE_TYPES.BOOST,
        mesh,
        zPos: z,
        baseY: y,
        collected: false,
        collectTime: 0,
        points: 25
    };
}

function createMagnet(scene, x, y, z) {
    const mesh = new THREE.Mesh(magnetGeo, magnetMaterial);
    mesh.position.set(x, y + 0.7, z);
    scene.add(mesh);

    return {
        type: COLLECTIBLE_TYPES.MAGNET,
        mesh,
        zPos: z,
        baseY: y,
        collected: false,
        collectTime: 0,
        points: 0   // Powerup — no direct score, the pulls do the work
    };
}

function createShield(scene, x, y, z) {
    const mesh = new THREE.Mesh(shieldGeo, shieldMaterial);
    mesh.position.set(x, y + 0.7, z);
    scene.add(mesh);

    return {
        type: COLLECTIBLE_TYPES.SHIELD,
        mesh,
        zPos: z,
        baseY: y,
        collected: false,
        collectTime: 0,
        points: 0
    };
}

function createSlowMo(scene, x, y, z) {
    const mesh = new THREE.Mesh(slowMoGeo, slowMoMaterial);
    mesh.position.set(x, y + 0.6, z);
    scene.add(mesh);

    return {
        type: COLLECTIBLE_TYPES.SLOW_MO,
        mesh,
        zPos: z,
        baseY: y,
        collected: false,
        collectTime: 0,
        points: 0
    };
}

// Safe x-range the ball can actually reach (track half-width minus rail/margin)
const SAFE_X = 3.0;

// How far past an obstacle an arch is placed so the two never intersect
const HOOP_OBSTACLE_CLEARANCE = 2.6;

function clampX(x) {
    return Math.max(-SAFE_X, Math.min(SAFE_X, x));
}

// Find the safe x-lane to guide the player through/around an obstacle
function getSafeLane(obstacle, trackWidth) {
    if (!obstacle) return 0;

    switch (obstacle.type) {
        case 'static_wall': {
            // Wall sits at xOffset with wallWidth — find the side with more open space
            const wallLeft = obstacle.xOffset - obstacle.wallWidth / 2;
            const wallRight = obstacle.xOffset + obstacle.wallWidth / 2;
            const halfTrack = trackWidth / 2;
            const leftSpace = wallLeft - (-halfTrack);
            const rightSpace = halfTrack - wallRight;

            if (leftSpace > rightSpace) {
                // Open lane on the left
                return clampX((-halfTrack + wallLeft) / 2);
            } else {
                // Open lane on the right
                return clampX((wallRight + halfTrack) / 2);
            }
        }
        case 'low_bar': {
            // Gap is always centered at x=0
            return 0;
        }
        case 'swinging_arm': {
            // Arm swings ±3 around center — safest at far edges
            return (Math.random() < 0.5 ? -1 : 1) * SAFE_X;
        }
        case 'sliding_block': {
            // Block slides across most of the track — pick an edge
            return (Math.random() < 0.5 ? -1 : 1) * SAFE_X;
        }
        default:
            return 0;
    }
}

export function spawnCollectiblesForSegment(scene, segmentZ, trackWidth, difficultyLevel, trackY, obstacle) {
    const density = getCollectibleDensity(difficultyLevel);
    const spawned = [];
    const y = trackY || 0;

    // Decide if we spawn dots this segment
    if (Math.random() < density) {
        const safeX = getSafeLane(obstacle, trackWidth);
        const numDots = 4 + Math.floor(Math.random() * 3); // 4–6 dots

        if (obstacle) {
            // Obstacle-aware trail — straight line through safe lane
            for (let i = 0; i < numDots; i++) {
                const z = segmentZ + (i - numDots / 2) * 2.5;
                const c = createDot(scene, safeX, y, z);
                collectibles.push(c);
                spawned.push(c);
            }
        } else {
            // No obstacle — clean trail with slight variation
            const pattern = Math.random();
            if (pattern < 0.5) {
                // Straight line with a small random offset from center
                const xBase = clampX((Math.random() - 0.5) * 3);
                for (let i = 0; i < numDots; i++) {
                    const z = segmentZ + (i - numDots / 2) * 2.5;
                    const c = createDot(scene, xBase, y, z);
                    collectibles.push(c);
                    spawned.push(c);
                }
            } else {
                // Gentle wave trail
                const xCenter = clampX((Math.random() - 0.5) * 2);
                for (let i = 0; i < numDots; i++) {
                    const x = clampX(xCenter + Math.sin(i * 0.8) * 1.5);
                    const z = segmentZ + (i - numDots / 2) * 2.5;
                    const c = createDot(scene, x, y, z);
                    collectibles.push(c);
                    spawned.push(c);
                }
            }
        }
    }

    // Diamond — rarer, placed on safe lane
    if (Math.random() < density * 0.3) {
        const safeX = obstacle ? getSafeLane(obstacle, trackWidth) : clampX((Math.random() - 0.5) * 3);
        const c = createDiamond(scene, safeX, y, segmentZ);
        collectibles.push(c);
        spawned.push(c);
    }

    // Hoop — rarest, placed on safe lane
    if (Math.random() < density * 0.15) {
        const safeX = obstacle ? getSafeLane(obstacle, trackWidth) : 0;
        // Sit the arch clear of the obstacle rather than sharing its plane. The
        // arch is 2 units across, so at the same Z it draws straight through a
        // barrier and reads as a rendering glitch. Pushing it further down the
        // track puts it behind the obstacle: you thread the gap, then pass
        // through the arch.
        const z = obstacle ? segmentZ - HOOP_OBSTACLE_CLEARANCE : segmentZ;
        const c = createHoop(scene, safeX, y, z);
        collectibles.push(c);
        spawned.push(c);
    }

    // Boost — introduced at level 3, rarer than dots, similar to diamonds
    if (difficultyLevel >= 3 && Math.random() < density * 0.2) {
        const safeX = obstacle ? getSafeLane(obstacle, trackWidth) : clampX((Math.random() - 0.5) * 3);
        const c = createBoost(scene, safeX, y, segmentZ);
        collectibles.push(c);
        spawned.push(c);
    }

    // Magnet — pulls score items for 3s. Introduced at level 2.
    if (difficultyLevel >= 2 && Math.random() < density * 0.15) {
        const safeX = obstacle ? getSafeLane(obstacle, trackWidth) : clampX((Math.random() - 0.5) * 3);
        const c = createMagnet(scene, safeX, y, segmentZ);
        collectibles.push(c);
        spawned.push(c);
    }

    // Shield — blocks the next hit. Rarest; level 3+.
    if (difficultyLevel >= 3 && Math.random() < density * 0.1) {
        const safeX = obstacle ? getSafeLane(obstacle, trackWidth) : clampX((Math.random() - 0.5) * 3);
        const c = createShield(scene, safeX, y, segmentZ);
        collectibles.push(c);
        spawned.push(c);
    }

    // Slow-mo — halves forward speed for 1.5s. Level 4+ (when speeds bite).
    if (difficultyLevel >= 4 && Math.random() < density * 0.15) {
        const safeX = obstacle ? getSafeLane(obstacle, trackWidth) : clampX((Math.random() - 0.5) * 3);
        const c = createSlowMo(scene, safeX, y, segmentZ);
        collectibles.push(c);
        spawned.push(c);
    }

    return spawned;
}

function getCollectibleDensity(level) {
    switch (level) {
        case 1: return 0.8;
        case 2: return 0.65;
        case 3: return 0.55;
        case 4: return 0.7;
        case 5: return 0.75;
        case 6: return 0.85;
        case 7: return 0.9;
        default: return 0.7;
    }
}

export function updateCollectibles(time, marblePos, marbleRadius, canCollect = true) {
    let pointsEarned = 0;
    let boostCollected = false;
    let magnetCollected = false;
    let shieldCollected = false;
    let slowMoCollected = false;
    let itemsCollected = 0;
    let bestPoints = 0;
    const now = performance.now();

    // Squared pickup radii — comparing squares avoids a sqrt per item per frame
    const dotR2 = (marbleRadius + 0.4) ** 2;
    const diamondR2 = (marbleRadius + 0.5) ** 2;
    const boostR2 = (marbleRadius + 0.45) ** 2;
    // Power-ups use a single forgiving radius since precise collision doesn't matter
    const powerupR2 = (marbleRadius + 0.45) ** 2;
    const hoopDz = marbleRadius + 0.5;
    // Anything further than this in Z can't be reachable this frame
    const NEAR_Z = 4;

    for (const c of collectibles) {
        // Handle fade-out animation for collected items (in main loop, no separate RAF)
        if (c.collected) {
            if (c.mesh.visible) {
                const elapsed = now - c.collectTime;
                const t = Math.min(elapsed / 200, 1);
                if (t < 1) {
                    c.mesh.scale.setScalar(1 - t);
                } else {
                    c.mesh.visible = false;
                }
            }
            continue;
        }

        // Animate
        if (c.type === COLLECTIBLE_TYPES.DIAMOND) {
            c.mesh.rotation.y = time * 2;
            c.mesh.rotation.z = Math.sin(time * 1.5) * 0.3;
        } else if (c.type === COLLECTIBLE_TYPES.DOT) {
            c.mesh.position.y = c.baseY + 0.5 + Math.sin(time * 3 + c.zPos) * 0.1;
        } else if (c.type === COLLECTIBLE_TYPES.HOOP) {
            c.mesh.material.emissiveIntensity = 1.0 + Math.sin(time * 3 + c.zPos) * 0.3;
        } else if (c.type === COLLECTIBLE_TYPES.BOOST) {
            c.mesh.rotation.y = time * 3;
            c.mesh.position.y = c.baseY + 0.6 + Math.sin(time * 2.5 + c.zPos) * 0.15;
        } else if (c.type === COLLECTIBLE_TYPES.MAGNET) {
            // Spinning torus — reads as a rotating field
            c.mesh.rotation.x = time * 1.5;
            c.mesh.rotation.y = time * 2.2;
            c.mesh.position.y = c.baseY + 0.7 + Math.sin(time * 2 + c.zPos) * 0.12;
        } else if (c.type === COLLECTIBLE_TYPES.SHIELD) {
            c.mesh.rotation.y = time * 1.8;
            c.mesh.rotation.x = Math.sin(time * 1.2) * 0.4;
            c.mesh.position.y = c.baseY + 0.7 + Math.sin(time * 1.7 + c.zPos) * 0.1;
        } else if (c.type === COLLECTIBLE_TYPES.SLOW_MO) {
            c.mesh.rotation.y = time * 2.5;
            c.mesh.position.y = c.baseY + 0.6 + Math.sin(time * 2.2 + c.zPos) * 0.12;
        }

        // Skip collection during ghost mode
        if (!canCollect) continue;

        // Cheap Z reject first — most of the list is far up or down the track
        const pos = c.mesh.position;
        const dz = marblePos.z - pos.z;
        if (dz > NEAR_Z || dz < -NEAR_Z) continue;

        const dx = marblePos.x - pos.x;

        if (c.type === COLLECTIBLE_TYPES.HOOP) {
            // Ball passes through the arch opening: close in Z, within the arch width
            if (Math.abs(dz) < hoopDz && Math.abs(dx) < c.innerRadius) {
                collectItem(c);
                pointsEarned += c.points;
                itemsCollected++;
                if (c.points > bestPoints) bestPoints = c.points;
            }
            continue;
        }

        const dy = marblePos.y - pos.y;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (c.type === COLLECTIBLE_TYPES.DOT && distSq < dotR2) {
            collectItem(c);
            pointsEarned += c.points;
            itemsCollected++;
            if (c.points > bestPoints) bestPoints = c.points;
        } else if (c.type === COLLECTIBLE_TYPES.DIAMOND && distSq < diamondR2) {
            collectItem(c);
            pointsEarned += c.points;
            itemsCollected++;
            if (c.points > bestPoints) bestPoints = c.points;
        } else if (c.type === COLLECTIBLE_TYPES.BOOST && distSq < boostR2) {
            collectItem(c);
            pointsEarned += c.points;
            itemsCollected++;
            if (c.points > bestPoints) bestPoints = c.points;
            boostCollected = true;
        } else if ((c.type === COLLECTIBLE_TYPES.MAGNET ||
                    c.type === COLLECTIBLE_TYPES.SHIELD ||
                    c.type === COLLECTIBLE_TYPES.SLOW_MO) && distSq < powerupR2) {
            collectItem(c);
            itemsCollected++;
            if (c.type === COLLECTIBLE_TYPES.MAGNET) magnetCollected = true;
            else if (c.type === COLLECTIBLE_TYPES.SHIELD) shieldCollected = true;
            else slowMoCollected = true;
        }
    }

    return {
        points: pointsEarned,
        boost: boostCollected,
        magnet: magnetCollected,
        shield: shieldCollected,
        slowMo: slowMoCollected,
        count: itemsCollected,
        bestPoints
    };
}

// Magnet pull — sweep every uncollected, score-only collectible inside `radius`
// and slide it toward the marble at `pullSpeed` m/s. Score items = DOT/DIAMOND/
// HOOP. Power-ups stay where they are: another MAGNET on the field shouldn't
// vacuum into the first one, and stacking SLOW_MOs would just be noise.
export function pullCollectibles(marblePos, radius, pullSpeed, dt) {
    const r2 = radius * radius;
    const maxStep = pullSpeed * dt;
    for (const c of collectibles) {
        if (c.collected) continue;
        if (c.type !== COLLECTIBLE_TYPES.DOT &&
            c.type !== COLLECTIBLE_TYPES.DIAMOND &&
            c.type !== COLLECTIBLE_TYPES.HOOP) continue;

        const p = c.mesh.position;
        const dx = marblePos.x - p.x;
        const dy = marblePos.y - p.y;
        const dz = marblePos.z - p.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > r2 || distSq < 1e-4) continue;

        const dist = Math.sqrt(distSq);
        // Cap the step so a collectible right next to the marble can't teleport
        // past it in a single frame.
        const step = Math.min(maxStep, dist);
        const k = step / dist;
        p.x += dx * k;
        p.y += dy * k;
        p.z += dz * k;
    }
}

function collectItem(c) {
    c.collected = true;
    c.collectTime = performance.now();
}

export function removeOldCollectibles(scene, marbleZ) {
    const removeThreshold = marbleZ + 60;

    for (let i = collectibles.length - 1; i >= 0; i--) {
        if (collectibles[i].zPos > removeThreshold) {
            scene.remove(collectibles[i].mesh);
            collectibles.splice(i, 1);
        }
    }
}

export function getCollectibles() { return collectibles; }

export function resetCollectibles(scene) {
    for (const c of collectibles) {
        scene.remove(c.mesh);
    }
    collectibles.length = 0;
}

export function getCollectibleMaterials() {
    return [
        dotMaterial, diamondMaterial, hoopMaterial, boostMaterial,
        magnetMaterial, shieldMaterial, slowMoMaterial
    ];
}
