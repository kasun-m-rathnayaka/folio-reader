// Quality and fallback rules (SPEC: rendering and fallback). Pure logic, unit-tested; the stage feeds it frame times.

export const SOFTWARE_RENDERER = /swiftshader|basic render driver|llvmpipe|softpipe|software rasterizer/i;

export function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** Steps for Auto: full pixel ratio (≤ 2), 1.5, 1, then shadows off; past the last step the stage falls back to 2D. */
export function qualitySteps(devicePixelRatio) {
    const top = Math.min(devicePixelRatio || 1, 2);
    const steps = [{ dpr: top, shadows: true }];
    if (top > 1.5) steps.push({ dpr: 1.5, shadows: true });
    if (top > 1) steps.push({ dpr: 1, shadows: true });
    steps.push({ dpr: 1, shadows: false });
    return steps;
}

export function initialQuality(level, devicePixelRatio) {
    const steps = qualitySteps(devicePixelRatio);
    if (level === 'low') return { steps, index: steps.length - 1 };
    return { steps, index: 0 };
}

/**
 * Watches frame times while the stage animates. If the 95th percentile over the last 5 s of rendering exceeds 33 ms,
 * it steps quality down (Auto only); when no step is left it asks for the 2D fallback once.
 */
export class QualityMonitor {
    constructor({ level = 'auto', devicePixelRatio = 1, windowMs = 5000, budgetMs = 33, onStep, onFallback } = {}) {
        Object.assign(this, { level, windowMs, budgetMs, onStep, onFallback });
        Object.assign(this, initialQuality(level, devicePixelRatio));
        this.samples = []; this.elapsed = 0; this.fellBack = false;
    }
    get current() { return this.steps[this.index]; }
    record(frameMs) {
        if (this.level !== 'auto' || this.fellBack) return;
        this.samples.push(frameMs); this.elapsed += frameMs;
        if (this.elapsed < this.windowMs) return;
        const p95 = percentile(this.samples, 0.95);
        this.samples = []; this.elapsed = 0;
        if (p95 <= this.budgetMs) return;
        if (this.index < this.steps.length - 1) { this.index++; this.onStep?.(this.current, p95); }
        else { this.fellBack = true; this.onFallback?.('slow', p95); }
    }
}
