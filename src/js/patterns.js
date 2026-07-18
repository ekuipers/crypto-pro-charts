// ============================================================
// PATTERNS GUIDE — overlay reference for chart pattern recognition
// (Roadmap: toggle overlay with technical patterns, bullish/bearish bias,
// and breakout levels to watch — content distilled from skills/crypto-trader)
// ============================================================
import { showModal, closeModal } from './alerts.js';

// bias: 'bullish' | 'bearish' | 'neutral' (direction depends on which way it breaks)
// kind: 'Reversal' | 'Continuation'
//
// chart: a tiny illustrative price-path diagram (Roadmap: "add example
// patterns... gives a better insight than only the explaining text"). Not to
// scale / not real data — a schematic sketch of the shape, in a shared
// 0 0 160 76 viewBox, so a reader can match the description to what the
// pattern actually looks like on a chart at a glance.
//   points   — the zigzag price path (polyline "x,y x,y ...")
//   lines    — reference trendlines/neckline/support/resistance to dash in
//   breakout — {x, y, dir: 'up'|'down'|null} where the confirming close
//              happens; drawn as a small triangle tinted by bias (omitted
//              for patterns with no single confirming line)
const PATTERNS = [
  {
    name: 'Head & Shoulders', bias: 'bearish', kind: 'Reversal',
    desc: 'Three peaks — a higher center peak (head) flanked by two lower, roughly equal peaks (shoulders) — forming after an uptrend. Signals buyers are losing control as each rally fails to make a new meaningful high.',
    breakout: 'Draw the neckline through the two swing lows between the peaks. A close below the neckline confirms the reversal; the measured move target is the neckline minus the head-to-neckline distance. Watch for a throwback retest of the neckline from below before the move continues down.',
    chart: {
      points: '5,60 25,25 40,42 60,12 80,42 100,25 118,55 150,68',
      lines: [{ points: '30,42 108,42', dashed: true }],
      breakout: { x: 118, y: 55, dir: 'down' },
    },
  },
  {
    name: 'Inverse Head & Shoulders', bias: 'bullish', kind: 'Reversal',
    desc: 'The mirror image of Head & Shoulders — three troughs with a lower center trough (head) between two shallower troughs (shoulders) — forming after a downtrend as selling pressure exhausts.',
    breakout: 'Draw the neckline through the two swing highs between the troughs. A close above the neckline confirms the reversal; target the neckline plus the head-to-neckline distance. Rising volume on the breakout adds conviction.',
    chart: {
      points: '5,20 25,55 40,38 60,68 80,38 100,55 118,25 150,12',
      lines: [{ points: '30,38 108,38', dashed: true }],
      breakout: { x: 118, y: 25, dir: 'up' },
    },
  },
  {
    name: 'Double Top', bias: 'bearish', kind: 'Reversal',
    desc: 'Two peaks at roughly the same price level with a moderate pullback between them, after a sustained uptrend — the second attempt to break the high fails, showing demand is drying up.',
    breakout: 'The confirmation level is the swing low between the two peaks. A close below it confirms the pattern; target is that support minus the height of the pattern (peak to trough).',
    chart: {
      points: '5,55 35,18 55,42 85,18 115,50 150,66',
      lines: [{ points: '25,42 125,42', dashed: true }],
      breakout: { x: 115, y: 50, dir: 'down' },
    },
  },
  {
    name: 'Double Bottom', bias: 'bullish', kind: 'Reversal',
    desc: 'Two troughs at roughly the same price level with a moderate bounce between them, after a sustained downtrend — the second test of the low fails to break lower, showing sellers are exhausted.',
    breakout: 'The confirmation level is the swing high between the two troughs. A close above it confirms the pattern; target is that resistance plus the height of the pattern (trough to peak).',
    chart: {
      points: '5,20 35,58 55,34 85,58 115,26 150,10',
      lines: [{ points: '25,34 125,34', dashed: true }],
      breakout: { x: 115, y: 26, dir: 'up' },
    },
  },
  {
    name: 'Triple Top', bias: 'bearish', kind: 'Reversal',
    desc: 'Three peaks at a similar resistance level — an even more emphatic failure to break higher than a double top, indicating strong, repeated supply at that price.',
    breakout: 'Confirmed on a close below the support connecting the two troughs between the peaks. Target is that support minus the pattern height; a low-volume approach to the third peak strengthens the bearish read.',
    chart: {
      points: '5,55 22,20 38,42 55,20 72,42 90,20 108,50 150,66',
      lines: [{ points: '30,42 100,42', dashed: true }],
      breakout: { x: 108, y: 50, dir: 'down' },
    },
  },
  {
    name: 'Triple Bottom', bias: 'bullish', kind: 'Reversal',
    desc: 'Three troughs at a similar support level — repeated, strong demand absorbing sell pressure at the same price, a stronger reversal signal than a single double bottom.',
    breakout: 'Confirmed on a close above the resistance connecting the two peaks between the troughs. Target is that resistance plus the pattern height.',
    chart: {
      points: '5,20 22,55 38,34 55,55 72,34 90,55 108,26 150,10',
      lines: [{ points: '30,34 100,34', dashed: true }],
      breakout: { x: 108, y: 26, dir: 'up' },
    },
  },
  {
    name: 'Ascending Triangle', bias: 'bullish', kind: 'Continuation',
    desc: 'A flat horizontal resistance line capping price, with a rising trendline of higher lows underneath — buyers are stepping in at progressively higher prices while sellers defend one fixed level.',
    breakout: 'Watch the flat top resistance line. A close above it with expanding volume confirms the breakout; target is the resistance level plus the triangle’s vertical height at its widest point.',
    chart: {
      points: '10,60 30,22 45,38 65,22 80,34 100,22 115,28 140,10',
      lines: [{ points: '10,22 128,22', dashed: true }, { points: '10,60 118,30', dashed: true }],
      breakout: { x: 140, y: 10, dir: 'up' },
    },
  },
  {
    name: 'Descending Triangle', bias: 'bearish', kind: 'Continuation',
    desc: 'A flat horizontal support line with a falling trendline of lower highs above it — sellers are pressing in at progressively lower prices while buyers only manage to defend one fixed level.',
    breakout: 'Watch the flat bottom support line. A close below it confirms the breakdown; target is the support level minus the triangle’s vertical height at its widest point.',
    chart: {
      points: '10,20 30,58 45,42 65,58 80,46 100,58 115,52 140,68',
      lines: [{ points: '10,58 128,58', dashed: true }, { points: '10,20 118,50', dashed: true }],
      breakout: { x: 140, y: 68, dir: 'down' },
    },
  },
  {
    name: 'Symmetrical Triangle', bias: 'neutral', kind: 'Continuation',
    desc: 'Converging trendlines — lower highs meeting higher lows — showing indecision as volatility compresses. Direction is NOT implied by the shape alone; it typically resolves in the direction of the trend that preceded it.',
    breakout: 'Watch both trendlines: a close beyond either one, ideally on a volume spike, marks the real breakout. Target is the triangle’s height projected from the breakout point. Avoid guessing the direction before the close.',
    chart: {
      points: '10,40 28,20 45,58 62,26 78,50 95,32 110,42 130,40',
      lines: [{ points: '10,18 130,40', dashed: true }, { points: '10,62 130,40', dashed: true }],
    },
  },
  {
    name: 'Rising Wedge', bias: 'bearish', kind: 'Reversal / Continuation',
    desc: 'Both trendlines slope upward but converge — price is grinding higher on progressively weaker momentum. Bearish whether it appears after an uptrend (reversal) or inside a downtrend bounce (continuation).',
    breakout: 'Watch the lower rising trendline. A close below it confirms the breakdown, often with a fast move as trapped late longs exit; target is the wedge’s height at its widest point.',
    chart: {
      points: '10,60 28,45 42,55 60,38 74,48 92,30 106,40 122,33',
      lines: [{ points: '10,50 130,20', dashed: true }, { points: '10,65 130,35', dashed: true }],
      breakout: { x: 140, y: 58, dir: 'down' },
    },
  },
  {
    name: 'Falling Wedge', bias: 'bullish', kind: 'Reversal / Continuation',
    desc: 'Both trendlines slope downward but converge — selling momentum is fading even as price makes marginal new lows. Bullish whether it appears after a downtrend (reversal) or inside an uptrend pullback (continuation).',
    breakout: 'Watch the upper falling trendline. A close above it confirms the breakout; target is the wedge’s height at its widest point.',
    chart: {
      points: '10,20 28,35 42,25 60,42 74,32 92,50 106,40 122,47',
      lines: [{ points: '10,15 130,45', dashed: true }, { points: '10,30 130,60', dashed: true }],
      breakout: { x: 140, y: 22, dir: 'up' },
    },
  },
  {
    name: 'Bull Flag', bias: 'bullish', kind: 'Continuation',
    desc: 'A sharp, high-volume rally (the pole) followed by a short, shallow, downward-sloping consolidation channel (the flag) on lighter volume — a brief pause before the prior move resumes.',
    breakout: 'Watch the upper edge of the flag channel. A close above it, with volume picking back up, confirms continuation; target is the length of the flagpole projected from the breakout point.',
    chart: {
      points: '10,68 30,15 42,23 54,18 66,29 78,24',
      lines: [{ points: '30,15 78,25', dashed: true }, { points: '30,26 78,36', dashed: true }],
      breakout: { x: 100, y: 10, dir: 'up' },
    },
  },
  {
    name: 'Bear Flag', bias: 'bearish', kind: 'Continuation',
    desc: 'A sharp, high-volume decline (the pole) followed by a short, shallow, upward-sloping consolidation channel (the flag) on lighter volume — a brief pause before the prior decline resumes.',
    breakout: 'Watch the lower edge of the flag channel. A close below it confirms continuation; target is the length of the flagpole projected from the breakdown point.',
    chart: {
      points: '10,10 30,62 42,54 54,59 66,48 78,53',
      lines: [{ points: '30,52 78,44', dashed: true }, { points: '30,63 78,55', dashed: true }],
      breakout: { x: 100, y: 68, dir: 'down' },
    },
  },
  {
    name: 'Pennant', bias: 'neutral', kind: 'Continuation',
    desc: 'Like a flag, but the consolidation converges into a small symmetrical triangle instead of a parallel channel, following a sharp directional move on high volume.',
    breakout: 'Resolves in the direction of the pole that preceded it in most cases. Watch for a close beyond either converging trendline on rising volume; target is the pole’s length projected from the breakout.',
    chart: {
      points: '10,66 30,15 40,32 50,23 60,35 70,29',
      lines: [{ points: '30,17 78,30', dashed: true }, { points: '30,45 78,31', dashed: true }],
      breakout: { x: 95, y: 12, dir: 'up' },
    },
  },
  {
    name: 'Cup & Handle', bias: 'bullish', kind: 'Continuation',
    desc: 'A rounded, U-shaped recovery (the cup) back to the prior high, followed by a small, shallow downward-drifting consolidation (the handle) as late sellers are shaken out before the advance resumes.',
    breakout: 'Watch the resistance formed by the cup’s prior high / the handle’s upper edge. A close above it on rising volume confirms; target is the cup’s depth projected from the breakout point.',
    chart: {
      points: '10,25 25,40 40,55 55,60 70,55 85,40 100,25 112,32 124,30 136,36',
      lines: [{ points: '10,25 136,25', dashed: true }],
      breakout: { x: 136, y: 36, dir: 'up' },
    },
  },
  {
    name: 'Rounding Bottom (Saucer)', bias: 'bullish', kind: 'Reversal',
    desc: 'A slow, gradual U-shaped curve from a downtrend into an uptrend — selling pressure fades gradually rather than snapping, typically over a longer timeframe than a double bottom.',
    breakout: 'Watch the resistance level at the start of the decline (the rim of the saucer). A close above it confirms the reversal; target is the pattern’s depth projected from the breakout point.',
    chart: {
      points: '5,25 22,42 40,55 58,60 76,60 94,55 112,42 130,25',
      lines: [{ points: '5,25 130,25', dashed: true }],
      breakout: { x: 130, y: 25, dir: 'up' },
    },
  },
  {
    name: 'Rectangle (Range)', bias: 'neutral', kind: 'Continuation',
    desc: 'Price oscillates between a well-defined horizontal support and resistance band as buyers and sellers reach a temporary equilibrium. Trade the range until proven otherwise.',
    breakout: 'Watch both the top and bottom of the range. A close beyond either boundary, backed by volume, is the breakout signal; target is the range’s height projected from the breakout point. False breakouts (fakeouts) are common here — wait for a close, not just a wick.',
    chart: {
      points: '10,50 25,22 40,52 55,23 70,50 85,24 100,48 115,25 130,45',
      lines: [{ points: '10,20 140,20', dashed: true }, { points: '10,55 140,55', dashed: true }],
    },
  },
  {
    name: 'Broadening Formation (Megaphone)', bias: 'neutral', kind: 'Reversal',
    desc: 'Diverging trendlines — higher highs AND lower lows — showing expanding volatility and a market losing discipline, often near major tops or bottoms. A warning sign of instability rather than a clean directional setup.',
    breakout: 'No single confirmation line — instead watch for a failed retest of either outer boundary (a lower high after the upper line, or a higher low after the lower line) as the first sign of which way control is shifting. Favor reduced size; this pattern is inherently choppier and less reliable than the others above.',
    chart: {
      points: '10,40 30,25 50,50 70,18 90,58 110,15 130,60',
      lines: [{ points: '10,40 130,15', dashed: true }, { points: '10,40 130,60', dashed: true }],
    },
  },
];

const BIAS_LABEL = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
const BIAS_VAR = { bullish: 'var(--green)', bearish: 'var(--red)', neutral: 'var(--muted)' };

// Small triangular chevron marking where the pattern confirms — tinted by
// bias so the arrow itself reinforces bullish (green/up) vs bearish (red/
// down) vs neutral (grey — direction shown is illustrative only, not implied).
function breakoutMarker(b, bias) {
  if (!b) return '';
  const color = BIAS_VAR[bias];
  const d = b.dir === 'up'
    ? `M ${b.x - 5},${b.y + 7} L ${b.x},${b.y - 3} L ${b.x + 5},${b.y + 7} Z`
    : `M ${b.x - 5},${b.y - 7} L ${b.x},${b.y + 3} L ${b.x + 5},${b.y - 7} Z`;
  return `<path d="${d}" fill="${color}"/>`;
}

function patternChartSvg(p) {
  const c = p.chart;
  if (!c) return '';
  const lines = (c.lines || [])
    .map(l => `<polyline points="${l.points}" class="pat-chart-line"${l.dashed ? '' : ' style="stroke-dasharray:none"'}/>`)
    .join('');
  return `
    <svg class="pat-chart" viewBox="0 0 160 76" preserveAspectRatio="none">
      ${lines}
      <polyline points="${c.points}" class="pat-chart-price"/>
      ${breakoutMarker(c.breakout, p.bias)}
    </svg>`;
}

function patternCard(p) {
  return `
    <div class="pat-card">
      <div class="pat-card-head">
        <span class="pat-name">${p.name}</span>
        <span class="pat-badge pat-${p.bias}">${BIAS_LABEL[p.bias]}</span>
        <span class="pat-kind">${p.kind}</span>
      </div>
      ${patternChartSvg(p)}
      <p class="pat-desc">${p.desc}</p>
      <div class="pat-breakout"><b>Breakout levels to watch:</b> ${p.breakout}</div>
    </div>`;
}

function renderList(filter) {
  const filtered = filter === 'all' ? PATTERNS : PATTERNS.filter(p => p.bias === filter);
  return filtered.map(patternCard).join('') || '<p class="muted">No patterns in this category.</p>';
}

export function initPatternsGuide() {
  document.getElementById('patternsBtn')?.addEventListener('click', openPatternsGuide);
}

function openPatternsGuide() {
  const filters = [
    ['all', 'All'], ['bullish', 'Bullish'], ['bearish', 'Bearish'], ['neutral', 'Neutral'],
  ];
  const tabs = filters.map(([key, label], i) =>
    `<button class="pat-filter${i === 0 ? ' active' : ''}" data-filter="${key}">${label}</button>`).join('');

  showModal(`
    <h3>Technical Chart Patterns</h3>
    <p class="muted pat-intro">A quick-reference guide to common price patterns — what they look like, whether they lean bullish or bearish, and the specific breakout level that confirms each one.</p>
    <div class="pat-filters">${tabs}</div>
    <div class="pat-list" id="patList">${renderList('all')}</div>
    <div class="modal-actions"><button id="patClose">Close</button></div>`, m => {
    m.classList.add('modal-settings', 'modal-patterns');
    m.querySelector('#patClose').addEventListener('click', closeModal);
    m.querySelectorAll('.pat-filter').forEach(btn => btn.addEventListener('click', () => {
      m.querySelectorAll('.pat-filter').forEach(b => b.classList.toggle('active', b === btn));
      m.querySelector('#patList').innerHTML = renderList(btn.dataset.filter);
    }));
  });
}
