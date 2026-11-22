// Horizontal browsing along a row (WP3): position and velocity live in the stage. Dragging or wheel-panning moves the row
// directly, a release with speed keeps gliding (friction λ = 4 /s), and past either end the row resists like a rubber
// band (up to 20 cm) and springs back (λ = 8 /s). "Recentre" eases to a book when one is presented (λ = 6 /s).
// Pure and framework-free: unit-tested.
import { damp } from './motion.js';

export const PAN = { friction: 4, spring: 8, band: 20, recenter: 6, stop: 0.05 };

export class Pan {
    constructor() { this.x = 0; this.v = 0; this.min = 0; this.max = 0; this.target = null; this.dragging = false; this.sampleV = 0; }

    /** Allowed camera x range of the current row. */
    setBounds(min, max) { this.min = min; this.max = Math.max(min, max); }

    clamp(x) { return Math.min(this.max, Math.max(this.min, x)); }

    /** Overshoot beyond the ends in cm (0 inside the row). */
    get over() { return this.x > this.max ? this.x - this.max : this.x < this.min ? this.min - this.x : 0; }

    /** Moves by `dx` cm under the user's hand. Past an end the movement is resisted more and more. */
    dragBy(dx, dt = 0) {
        this.target = null; this.v = 0;
        const outward = (this.x >= this.max && dx > 0) || (this.x <= this.min && dx < 0);
        if (outward) dx *= Math.max(0.04, 1 - this.over / PAN.band) * 0.5;
        this.x += dx;
        this.x = Math.min(this.max + PAN.band, Math.max(this.min - PAN.band, this.x));
        if (dt > 0) this.sampleV = this.sampleV * 0.6 + (dx / dt) * 0.4;   // smoothed velocity for a flick on release
    }

    beginDrag() { this.dragging = true; this.sampleV = 0; this.target = null; }

    /** Release: keep gliding at the hand's last speed (a pause before release means no glide). */
    endDrag(idleMs = 0) { this.dragging = false; this.v = idleMs > 80 ? 0 : this.sampleV; this.sampleV = 0; }

    /** Easing to a book that was presented (never on a plain hover). */
    recenter(x) { this.target = this.clamp(x); this.v = 0; }

    get active() { return this.dragging || this.target != null || Math.abs(this.v) > PAN.stop || this.over > 0.01; }

    /** Advances `dt` seconds; returns true while anything is still moving. */
    step(dt) {
        if (this.dragging) return true;
        if (this.target != null) {
            this.x = damp(this.x, this.target, PAN.recenter, dt);
            if (Math.abs(this.x - this.target) < 0.01) { this.x = this.target; this.target = null; }
            return this.target != null;
        }
        if (Math.abs(this.v) > PAN.stop) {
            this.x += this.v * dt;
            this.v *= Math.exp(-PAN.friction * dt);
            if (this.over > 0) this.v *= Math.exp(-10 * dt);              // the band absorbs the speed
            this.x = Math.min(this.max + PAN.band, Math.max(this.min - PAN.band, this.x));
        } else this.v = 0;
        if (this.over > 0) {
            this.x = damp(this.x, this.clamp(this.x), PAN.spring, dt);
            if (this.over < 0.01) this.x = this.clamp(this.x);
        }
        return this.active;
    }
}

/** Camera x range for a row: narrow rows sit centred; wide ones pan until the first or last book is near the view edge. */
export function panBounds(rowWidth, halfView) {
    if (rowWidth <= halfView * 2) return [rowWidth / 2, rowWidth / 2];
    return [halfView * 0.6, rowWidth - halfView * 0.6];
}
