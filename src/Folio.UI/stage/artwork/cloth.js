// Cloth: plain book cloth with a fine weave; the title is blind-debossed (the composer drives a normal map from the title),
// so the board carries no artwork of its own.
export function paint(g, area, design, { k }) {
    g.save();
    g.beginPath(); g.rect(area.x, area.y, area.w, area.h); g.clip();
    g.globalAlpha = 0.07;
    g.fillStyle = '#000';
    const step = Math.max(2, Math.round(3 * k));
    for (let y = area.y; y < area.y + area.h; y += step * 2) g.fillRect(area.x, y, area.w, step);
    g.fillStyle = '#fff';
    for (let x = area.x; x < area.x + area.w; x += step * 2) g.fillRect(x, area.y, step, area.h);
    g.restore();
}
