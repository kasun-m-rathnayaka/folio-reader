// Wheel gesture gate (WP2). One trackpad swipe or one burst of mouse-wheel notches is one gesture, and a gesture moves
// exactly one shelf. A trackpad keeps sending momentum events for 1–2 s after the fingers lift, so a gesture ends only
// after a quiet period with no wheel events at all, never on a fixed timer. Horizontal-dominant gestures are pans.
// Pure and framework-free so it is unit-tested with recorded streams.

export const GESTURE = { threshold: 40, quietMs: 180, panLock: 2 };
const LINE_PX = 16, PAGE_PX = 800;

const toPixels = (delta, mode) => mode === 1 ? delta * LINE_PX : mode === 2 ? delta * PAGE_PX : delta;

export class GestureGate {
    constructor({ threshold = GESTURE.threshold, quietMs = GESTURE.quietMs } = {}) {
        this.threshold = threshold; this.quietMs = quietMs;
        this.reset(); this.last = -Infinity;
    }

    reset() { this.sum = 0; this.fired = false; this.axis = null; }

    /**
     * Feeds one wheel event. Returns `{ intent, pan }`: `intent` is 'down' or 'up' once per gesture (a shelf step), `pan`
     * is the horizontal distance in pixels this event contributes to panning the row (0 for vertical gestures).
     */
    wheel(event, now) {
        if (now - this.last > this.quietMs) this.reset();          // a new gesture begins after the quiet period
        this.last = now;
        const dx = toPixels(event.deltaX || 0, event.deltaMode), dy = toPixels(event.deltaY || 0, event.deltaMode);
        // Shift + wheel pans: some platforms report it as deltaY with shiftKey, others already as deltaX.
        const horizontal = event.shiftKey || Math.abs(dx) > Math.abs(dy);
        if (horizontal && (event.shiftKey || Math.abs(dx) >= GESTURE.panLock)) this.axis = 'x';
        if (this.axis === 'x') return { intent: null, pan: event.shiftKey && !dx ? dy : dx };
        if (horizontal) return { intent: null, pan: 0 };           // tiny sideways drift on a vertical swipe
        this.axis = 'y';
        if (this.fired) return { intent: null, pan: 0 };           // momentum of a gesture that already moved a shelf
        this.sum += dy;
        if (Math.abs(this.sum) < this.threshold) return { intent: null, pan: 0 };
        this.fired = true;
        return { intent: this.sum > 0 ? 'down' : 'up', pan: 0 };
    }
}
