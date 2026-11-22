// Line: one continuous generated line drawing in foil, wandering across the board like a single pen stroke.
import { rng } from './noise.js';

export function paint(g, area, design, { k }) {
    const rand = rng(design.seed), n = 16;
    const points = Array.from({ length: n }, (_, i) => ({
        x: area.x + area.w * (0.12 + 0.76 * (0.5 + 0.5 * Math.sin(i * 1.7 + rand() * 3))) ,
        y: area.y + area.h * (0.08 + 0.84 * (i / (n - 1)) + (rand() - 0.5) * 0.1),
    }));
    g.save();
    g.beginPath(); g.rect(area.x, area.y, area.w, area.h); g.clip();
    g.strokeStyle = design.foil; g.lineWidth = Math.max(2, 5 * k); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < n - 1; i++) { const m = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }; g.quadraticCurveTo(points[i].x, points[i].y, m.x, m.y); }
    g.lineTo(points[n - 1].x, points[n - 1].y);
    g.stroke();
    // a looping flourish at the end, as if the pen lingered
    const e = points[n - 1];
    g.beginPath(); g.arc(e.x, e.y - 18 * k, 14 * k, 0, Math.PI * 1.7); g.stroke();
    g.restore();
}
