// Motion primitives (SPEC: motion). Every moving value eases toward its target with exponential damping, which is
// frame-rate independent: after t seconds the remaining distance is e^(-λt) of the start.

export const LAMBDA = { camera: 4, pullOut: 10, pointer: 6, details: 5, opening: 10 };
// Snap threshold: 2e-3 world units is under 0.05 px at shelf distance, and 2e-3 rad is about 0.1°. Small enough to be
// invisible, large enough that long moves stop drawing promptly (SPEC: zero frames after 2 s idle).
export const EPSILON = 2e-3;

/**
 * Damping rate for a camera move of `distance` cm so it arrives (within `tolerance` cm, about 5 px) in `seconds`:
 * single-row steps keep a calm ease, and long jumps (keys 1–9, the sidebar) speed up so they still land within 700 ms.
 */
export function travelLambda(distance, seconds = 0.7, tolerance = 0.5) {
    if (!(distance > tolerance)) return LAMBDA.camera;
    return Math.min(12, Math.max(LAMBDA.camera, Math.log(distance / tolerance) / seconds));
}

export function damp(value, target, lambda, dt) {
    if (!(dt > 0)) return value;
    return target + (value - target) * Math.exp(-lambda * dt);
}

/** Damps every numeric key of `state` toward `target` in place; returns the largest remaining distance. */
export function dampObject(state, target, lambda, dt) {
    let remaining = 0;
    for (const key in target) {
        const next = damp(state[key] ?? target[key], target[key], lambda, dt);
        state[key] = Math.abs(next - target[key]) < EPSILON ? target[key] : next;
        remaining = Math.max(remaining, Math.abs(state[key] - target[key]));
    }
    return remaining;
}

/** Like `dampObject`, but each key has its own rate (`rates[key]`, else `fallback`). */
export function dampKeys(state, target, rates, dt, fallback = LAMBDA.camera) {
    let remaining = 0;
    for (const key in target) {
        const next = damp(state[key] ?? target[key], target[key], rates[key] ?? fallback, dt);
        state[key] = Math.abs(next - target[key]) < EPSILON ? target[key] : next;
        remaining = Math.max(remaining, Math.abs(state[key] - target[key]));
    }
    return remaining;
}

/** Seconds for a damped value to cover all but `fraction` of the distance (≈ settle time). */
export const settleTime = (lambda, fraction = 0.06) => Math.log(1 / fraction) / lambda;

/** Hero idle turn: ±12° over a 16 s cycle, fading out over the second after it stops (no snap). */
export function idleTurn(seconds, amplitudeDeg = 12, periodS = 16) {
    return (amplitudeDeg * Math.PI / 180) * Math.sin((2 * Math.PI * seconds) / periodS);
}

export const MOTION_LEVELS = ['full', 'reduced', 'off'];
export function motionSettings(level) {
    switch (level) {
        case 'off': return { level, idle: false, tilt: false, travel: false, lift: false, crossfadeMs: 0 };
        case 'reduced': return { level, idle: false, tilt: false, travel: false, lift: false, crossfadeMs: 150 };
        default: return { level: 'full', idle: true, tilt: true, travel: true, lift: true, crossfadeMs: 120 };
    }
}
