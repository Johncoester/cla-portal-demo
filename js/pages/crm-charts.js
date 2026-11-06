/* crm-charts.js : plain SVG charts for CRM dashboards (video 9). No libraries. Function only (no styling work): default colors, native hover tooltips (<title>).
 * Every bar / slice / point / row carries data-key (and data-key2 for a stacked part) so a click opens the drill-down. */
import { esc } from '../ui.js?v=202611062325';

const COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
export const color = (i) => COLORS[i % COLORS.length];
export const fmtNum = (v, currency = false) => { if (v == null || v === '') return '-'; const n = Number(v); if (!isFinite(n)) return '-';
  return (currency ? '$' : '') + n.toLocaleString('en-US', { maximumFractionDigits: 2 }); };
const tip = (label, value, count, cur, measureLabel) => `<title>${esc(label)}: ${esc(fmtNum(value, cur))}${measureLabel === 'Record Count' ? '' : ` (${count} record${count === 1 ? '' : 's'})`}</title>`;
const short = (s, n = 14) => { const t = String(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

function axes(max) { const step = niceStep(max / 4); const ticks = []; for (let v = 0; v <= max + step / 2; v += step) ticks.push(v); return ticks; }
function niceStep(raw) { if (!(raw > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

// chartSvg(data from the adapter, chartType, { currency, height })
export function chartSvg(data, type, { currency = false, height = 260 } = {}) {
  const groups = (data && data.groups) || []; const ml = data.measureLabel || '';
  if (!groups.length) return '<p class="muted" data-chart-empty>No records match.</p>';
  if (type === 'table') return `<table class="table" data-chart="table"><thead><tr><th>${esc(data.groupLabel || '')}</th>${(data.series || []).length ? data.series.map((s) => `<th>${esc(s.label)}</th>`).join('') : ''}<th>${esc(ml)}</th></tr></thead><tbody>${
    groups.map((g) => `<tr data-key="${esc(g.key)}" style="cursor:pointer"><td>${esc(g.label)}</td>${(g.parts || []).map((p) => `<td>${esc(fmtNum(p.value, currency))}</td>`).join('')}<td>${esc(fmtNum(g.value, currency))}</td></tr>`).join('')
  }</tbody><tfoot><tr><th>Total</th>${(data.series || []).map(() => '<th></th>').join('')}<th>${esc(fmtNum(data.total, currency))}</th></tr></tfoot></table>`;
  if (type === 'pie' || type === 'doughnut') return pie(groups, type === 'doughnut', currency, ml, height);
  if (type === 'bar') return bars(groups, currency, ml, height);
  return columns(groups, data.series || [], type, currency, ml, height, data.groupLabel);
}
function columns(groups, series, type, cur, ml, H, groupLabel) {
  const W = Math.max(360, groups.length * 46 + 70); const top = 14, left = 56, bottom = 58; const ph = H - top - bottom; const pw = W - left - 12;
  const stacked = type === 'stacked' && series.length; const vals = groups.map((g) => (stacked ? (g.parts || []).reduce((s, p) => s + Math.max(0, Number(p.value) || 0), 0) : Math.max(0, Number(g.value) || 0)));
  const max = Math.max(1, ...vals); const ticks = axes(max); const top0 = ticks[ticks.length - 1] || 1; const y = (v) => top + ph - (v / top0) * ph; const bw = pw / groups.length;
  let s = `<svg data-chart="${esc(type)}" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${esc(ml)} by ${esc(groupLabel || '')}">`;
  ticks.forEach((t) => { s += `<line x1="${left}" x2="${W - 12}" y1="${y(t)}" y2="${y(t)}" stroke="#ddd"/><text x="${left - 4}" y="${y(t) + 4}" font-size="10" text-anchor="end">${esc(fmtNum(t, cur))}</text>`; });
  if (type === 'line' || type === 'area') {
    const pts = groups.map((g, i) => [left + bw * i + bw / 2, y(Math.max(0, Number(g.value) || 0))]);
    if (type === 'area') s += `<path d="M${pts[0][0]},${y(0)} ${pts.map(([a, b]) => `L${a},${b}`).join(' ')} L${pts[pts.length - 1][0]},${y(0)} Z" fill="${color(0)}" fill-opacity="0.3"/>`;
    s += `<polyline points="${pts.map(([a, b]) => `${a},${b}`).join(' ')}" fill="none" stroke="${color(0)}" stroke-width="2"/>`;
    groups.forEach((g, i) => { s += `<circle data-key="${esc(g.key)}" cx="${pts[i][0]}" cy="${pts[i][1]}" r="5" fill="${color(0)}" style="cursor:pointer">${tip(g.label, g.value, g.count, cur, ml)}</circle>`; });
  } else groups.forEach((g, i) => { const x = left + bw * i + bw * 0.15; const w = bw * 0.7;
    if (stacked) { let acc = 0; (g.parts || []).forEach((p, j) => { const v = Math.max(0, Number(p.value) || 0); if (!v) return; s += `<rect data-key="${esc(g.key)}" data-key2="${esc(p.key)}" x="${x}" y="${y(acc + v)}" width="${w}" height="${y(acc) - y(acc + v)}" fill="${color(j)}" style="cursor:pointer">${tip(`${g.label} / ${p.label}`, p.value, p.count, cur, ml)}</rect>`; acc += v; }); }
    else { const v = Math.max(0, Number(g.value) || 0); s += `<rect data-key="${esc(g.key)}" x="${x}" y="${y(v)}" width="${w}" height="${Math.max(0, y(0) - y(v))}" fill="${color(0)}" style="cursor:pointer">${tip(g.label, g.value, g.count, cur, ml)}</rect>`; } });
  groups.forEach((g, i) => { const cx = left + bw * i + bw / 2; s += `<text x="${cx}" y="${H - bottom + 14}" font-size="10" text-anchor="end" transform="rotate(-35 ${cx} ${H - bottom + 14})">${esc(short(g.label))}</text>`; });
  s += '</svg>';
  if (stacked) s += legend(series);
  return s;
}
function bars(groups, cur, ml, H0) {
  const H = Math.max(H0, groups.length * 26 + 30); const W = 520, left = 130, top = 8; const pw = W - left - 60; const bh = (H - top - 20) / groups.length;
  const max = Math.max(1, ...groups.map((g) => Math.max(0, Number(g.value) || 0)));
  let s = `<svg data-chart="bar" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img">`;
  groups.forEach((g, i) => { const v = Math.max(0, Number(g.value) || 0); const w = (v / max) * pw; const yy = top + bh * i;
    s += `<text x="${left - 6}" y="${yy + bh / 2 + 4}" font-size="11" text-anchor="end">${esc(short(g.label, 20))}</text><rect data-key="${esc(g.key)}" x="${left}" y="${yy + bh * 0.15}" width="${w}" height="${bh * 0.7}" fill="${color(0)}" style="cursor:pointer">${tip(g.label, g.value, g.count, cur, ml)}</rect><text x="${left + w + 4}" y="${yy + bh / 2 + 4}" font-size="10">${esc(fmtNum(g.value, cur))}</text>`; });
  return s + '</svg>';
}
function pie(groups, hole, cur, ml, H) {
  const R = Math.min(110, H / 2 - 10); const cx = R + 10, cy = R + 10; const vals = groups.map((g) => Math.max(0, Number(g.value) || 0)); const sum = vals.reduce((a, b) => a + b, 0) || 1;
  let a0 = -Math.PI / 2; let s = `<svg data-chart="${hole ? 'doughnut' : 'pie'}" viewBox="0 0 ${2 * R + 20} ${2 * R + 20}" width="${2 * R + 20}" role="img">`;
  groups.forEach((g, i) => { const v = vals[i]; if (!v) return; const a1 = a0 + (v / sum) * Math.PI * 2; const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a) => `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`;
    const d = v === sum ? `M${cx - R},${cy} A${R},${R} 0 1 1 ${cx + R},${cy} A${R},${R} 0 1 1 ${cx - R},${cy} Z` : `M${cx},${cy} L${p(a0)} A${R},${R} 0 ${large} 1 ${p(a1)} Z`;
    s += `<path data-key="${esc(g.key)}" d="${d}" fill="${color(i)}" stroke="#fff" style="cursor:pointer">${tip(g.label, g.value, g.count, cur, ml)}</path>`; a0 = a1; });
  if (hole) s += `<circle cx="${cx}" cy="${cy}" r="${R * 0.55}" fill="#fff"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14">${esc(fmtNum(sum, cur))}</text>`;
  return s + '</svg>' + legend(groups.map((g) => ({ key: g.key, label: `${g.label} (${fmtNum(g.value, cur)})` })));
}
const legend = (items) => `<div data-legend>${items.map((it, i) => `<span style="margin-right:10px;white-space:nowrap"><span style="display:inline-block;width:10px;height:10px;background:${color(i)}"></span> ${esc(it.label)}</span>`).join(' ')}</div>`;

export function kpiHtml(data, currency) { return `<div data-kpi style="font-size:2em;cursor:pointer" title="${esc(data.measureLabel)}: ${esc(fmtNum(data.value, currency))}" data-key="">${esc(fmtNum(data.value == null ? 0 : data.value, currency))}</div><div class="muted">${esc(data.measureLabel)} · ${data.count} record${data.count === 1 ? '' : 's'}</div>`; }
// Target Meter (basic): a half-circle gauge with the value against the target
export function targetHtml(data, currency) {
  const pct = Math.max(0, Math.min(1, (Number(data.value) || 0) / data.target)); const R = 80, cx = 100, cy = 95; const a = Math.PI * (1 - pct);
  const end = `${cx + R * Math.cos(a)},${cy - R * Math.sin(a)}`;
  return `<svg data-chart="target" viewBox="0 0 200 110" width="220" role="img" data-key="" style="cursor:pointer"><title>${esc(fmtNum(data.value, currency))} of ${esc(fmtNum(data.target, currency))} (${data.pct}%)</title>`
    + `<path d="M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}" fill="none" stroke="#ddd" stroke-width="16"/>`
    + (pct > 0 ? `<path d="M${cx - R},${cy} A${R},${R} 0 0 1 ${end}" fill="none" stroke="${color(4)}" stroke-width="16"/>` : '')
    + `<text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="18">${esc(fmtNum(data.value, currency))}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10">Target ${esc(fmtNum(data.target, currency))} (${data.pct}%)</text></svg>`;
}
// Funnel (basic): one bar per group, widest first in the grouping's order
export function funnelHtml(data, currency) {
  const groups = data.groups || []; if (!groups.length) return '<p class="muted" data-chart-empty>No records match.</p>';
  const max = Math.max(1, ...groups.map((g) => Number(g.value) || 0)); const W = 360, bh = 30; let s = `<svg data-chart="funnel" viewBox="0 0 ${W} ${groups.length * (bh + 4)}" width="100%" style="max-width:${W}px" role="img">`;
  groups.forEach((g, i) => { const w = Math.max(30, ((Number(g.value) || 0) / max) * (W - 20)); const x = (W - w) / 2; const y = i * (bh + 4);
    s += `<rect data-key="${esc(g.key)}" x="${x}" y="${y}" width="${w}" height="${bh}" fill="${color(i)}" style="cursor:pointer">${tip(g.label, g.value, g.count, currency, data.measureLabel)}</rect><text x="${W / 2}" y="${y + bh / 2 + 4}" text-anchor="middle" font-size="11" fill="#fff" pointer-events="none">${esc(short(g.label, 18))}: ${esc(fmtNum(g.value, currency))}</text>`; });
  return s + '</svg>';
}
