// Motion primitives (SPEC: motion). Every moving value eases toward its target with exponential damping, which is
// frame-rate independent: after t seconds the remaining distance is e^(-λt) of the start.

export const LAMBDA = { camera: 4, pullOut: 10, pointer: 6, details: 5 };
export const EPSILON = 1e-4;

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

/** Seconds for a damped value to cover all but `fraction` of the distance (≈ settle time). */
export const settleTime = (lambda, fraction = 0.06) => Math.log(1 / fraction) / lambda;

/** Hero idle turn: ±12° over a 16 s cycle, fading out over the second after it stops (no snap). */
export function idleTurn(seconds, amplitudeDeg = 12, periodS = 16) {
    return (amplitudeDeg * Math.PI / 180) * Math.sin((2 * Math.PI * seconds) / periodS);
}

export const MOTION_LEVELS = ['full', 'reduced', 'off'];
export function motionSettings(level) {
    switch (level) {
        case 'off': return { level, idle: false, tilt: false, travel: false, crossfadeMs: 0 };
        case 'reduced': return { level, idle: false, tilt: false, travel: false, crossfadeMs: 150 };
        default: return { level: 'full', idle: true, tilt: true, travel: true, crossfadeMs: 120 };
    }
}
