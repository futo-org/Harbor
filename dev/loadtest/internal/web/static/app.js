// ---------------------------------------------------------------------------
// Small DOM helpers. Text always goes in via textContent (labels come from
// server data and error messages).
// ---------------------------------------------------------------------------
const $ = (sel, el = document) => el.querySelector(sel);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const svgNS = 'http://www.w3.org/2000/svg';
function icon(kind) {
  const paths = {
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    warning:
      '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    critical: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    good: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  };
  const s = document.createElementNS(svgNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('class', 'icon');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = paths[kind] || paths.info;
  return s;
}
function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status', text: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
}
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
function fmtNum(v, d = 0) {
  if (v == null || !Number.isFinite(v)) return '–';
  return v.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function fmtBytes(b) {
  if (b == null || !Number.isFinite(b)) return '–';
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  while (Math.abs(b) >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return (
    (Math.abs(b) >= 100 || i === 0 ? b.toFixed(0) : b.toFixed(1)) + ' ' + u[i]
  );
}
function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '–';
  if (ms >= 10000) return (ms / 1000).toFixed(1) + ' s';
  if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s';
  return ms.toFixed(ms < 10 ? 1 : 0) + ' ms';
}
function fmtRate(v) {
  if (v == null || !Number.isFinite(v)) return '–';
  return (
    (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + '/s'
  );
}
function fmtUnit(v, unit) {
  if (v == null || !Number.isFinite(v)) return '–';
  switch (unit) {
    case 'cores':
      return v.toFixed(v < 1 ? 2 : 1);
    case 'bytes':
      return fmtBytes(v);
    case 'bytes/s':
      return fmtBytes(v) + '/s';
    case 'ratio':
      return (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
    case 's':
      return fmtMs(v * 1000);
    case 'ms':
      return fmtMs(v);
    case 'ops/s':
      return fmtRate(v);
    case 's/s':
      return v.toFixed(2);
    case 'pct':
      return v.toFixed(v < 10 ? 1 : 0) + '%';
    default:
      return fmtNum(v, v < 10 && v % 1 ? 1 : 0);
  }
}
function fmtAxis(v, unit) {
  switch (unit) {
    case 'bytes':
    case 'bytes/s':
      return fmtBytes(v).replace(' ', '');
    case 'ratio':
      return Math.round(v * 100) + '%';
    case 's':
      return v < 1 ? Math.round(v * 1000) + 'ms' : v.toFixed(1) + 's';
    case 'ms':
      return v >= 1000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms';
    case 'pct':
      return v.toFixed(0) + '%';
    default:
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
      if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
      return String(+v.toFixed(2));
  }
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const hh = Math.floor(sec / 3600),
    mm = Math.floor((sec % 3600) / 60),
    ss = sec % 60;
  return (
    (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) +
    ':' +
    String(ss).padStart(2, '0')
  );
}

// ---------------------------------------------------------------------------
// Palette (fixed order; validated in light and dark). Read from CSS so the
// OS theme switch recolours everything.
// ---------------------------------------------------------------------------
let palette = [],
  otherColor = '#898781',
  chrome = {};
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  palette = [1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
    cs.getPropertyValue('--s' + i).trim(),
  );
  otherColor = cs.getPropertyValue('--other').trim();
  chrome = {
    muted: cs.getPropertyValue('--muted').trim(),
    grid: cs.getPropertyValue('--grid').trim(),
    axis: cs.getPropertyValue('--axis').trim(),
    ink2: cs.getPropertyValue('--ink-2').trim(),
    critical: cs.getPropertyValue('--critical').trim(),
  };
}
readTheme();

// ---------------------------------------------------------------------------
// Time-series chart on uPlot. At most 7 named series + "Other" (summed for
// additive units); colour follows the series name for the chart's lifetime.
// ---------------------------------------------------------------------------
const ADDITIVE = new Set([
  'ops/s',
  'cores',
  'bytes',
  'bytes/s',
  'count',
  's/s',
]);
const charts = [];
class TimeChart {
  constructor(parent, opts) {
    this.opts = opts;
    this.card = h(
      'div',
      { class: 'card chart-card' },
      h(
        'div',
        { class: 'card-head' },
        h('h3', { text: opts.title }),
        opts.unitLabel
          ? h('span', { class: 'unit', text: opts.unitLabel })
          : null,
      ),
      opts.help ? h('div', { class: 'help', text: opts.help }) : null,
    );
    this.box = h('div', { class: 'chart' });
    this.foot = h('div', { class: 'chart-foot' });
    this.card.append(this.box, this.foot);
    parent.append(this.card);
    this.colors = new Map();
    this.members = null;
    this.u = null;
    this.names = [];
    this.xs = [];
    this.data = new Map();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.box);
    // Outside hover, the legend reads out the latest values.
    this.hover = false;
    this.box.addEventListener('mouseenter', () => {
      this.hover = true;
    });
    this.box.addEventListener('mouseleave', () => {
      this.hover = false;
      this.showLatest();
    });
    charts.push(this);
  }
  resetMembership() {
    this.members = null;
    this.colors.clear();
  }
  setEmpty(msg) {
    this.destroy();
    this.box.replaceChildren(h('div', { class: 'empty', text: msg }));
    this.box.style.height = '200px';
    this.foot.textContent = '';
  }
  destroy() {
    if (this.u) {
      this.u.destroy();
      this.u = null;
    }
  }
  showLatest() {
    if (!this.u || this.hover || !this.xs.length) return;
    // Latest index where any series has a value.
    let idx = this.xs.length - 1;
    const cols = this.u.data.slice(1);
    while (idx > 0 && cols.every((c) => c[idx] == null)) idx--;
    this.u.setLegend({ idx });
  }
  resize() {
    if (this.u) this.u.setSize({ width: this.box.clientWidth, height: 200 });
  }
  // xs: seconds; data: Map(name -> array aligned with xs)
  set(xs, data) {
    this.xs = xs;
    this.data = data;
    this.render();
  }
  render() {
    const { xs, data, opts } = this;
    const names = [...data.keys()].filter((n) =>
      data.get(n).some((v) => v != null),
    );
    if (!xs.length || !names.length) {
      this.setEmpty(opts.empty || 'No data yet');
      return;
    }
    // Decide the (sticky) set of named series; the rest fold into Other.
    const peak = (n) =>
      data.get(n).reduce((m, v) => (v != null && v > m ? v : m), -Infinity);
    if (!this.members) this.members = [];
    const known = new Set(this.members);
    const candidates = names.filter((n) => !known.has(n));
    if (opts.priority) {
      const pr = (n) => {
        const i = opts.priority.indexOf(n);
        return i < 0 ? 1e9 : i;
      };
      candidates.sort((a, b) => pr(a) - pr(b) || peak(b) - peak(a));
    } else if (opts.order) {
      candidates.sort(opts.order);
    } else {
      candidates.sort((a, b) => peak(b) - peak(a));
    }
    for (const n of candidates)
      if (
        this.members.length < 7 ||
        (names.length <= 8 && this.members.length < 8)
      )
        this.members.push(n);
    const shown = this.members.filter((n) => data.has(n));
    for (const n of shown)
      if (!this.colors.has(n))
        this.colors.set(n, palette[this.colors.size % 8]);
    const rest = names.filter((n) => !shown.includes(n));
    const additive = ADDITIVE.has(opts.unit);
    const series = shown.map((n) => ({
      name: n,
      values: data.get(n),
      color: this.colors.get(n),
    }));
    if (rest.length && additive) {
      const sum = xs.map((_, i) => {
        let s = null;
        for (const n of rest) {
          const v = data.get(n)[i];
          if (v != null) s = (s || 0) + v;
        }
        return s;
      });
      series.push({
        name: `Other (${rest.length})`,
        values: sum,
        color: otherColor,
      });
    }
    this.foot.textContent =
      rest.length && !additive
        ? `${rest.length} more series not shown: ${rest.slice(0, 6).join(', ')}${rest.length > 6 ? '…' : ''}`
        : '';

    const key = series.map((s) => s.name + s.color).join('|');
    const aligned = [xs, ...series.map((s) => s.values)];
    if (this.u && this.key === key) {
      this.u.setData(aligned);
      this.showLatest();
      return;
    }
    this.key = key;
    this.destroy();
    this.box.replaceChildren();
    this.box.style.height = '';
    const unit = opts.unit;
    const font = '11px system-ui, -apple-system, sans-serif';
    this.u = new uPlot(
      {
        width: this.box.clientWidth || 460,
        height: 200,
        cursor: {
          y: false,
          sync: opts.sync ? { key: opts.sync } : undefined,
          points: { size: 7, width: 2 },
        },
        legend: { live: true },
        scales: {
          x: { time: true },
          y: { range: (_u, _min, max) => [0, max > 0 ? max * 1.12 : 1] },
        },
        axes: [
          {
            stroke: chrome.muted,
            font,
            grid: { stroke: chrome.grid, width: 1 },
            ticks: { stroke: chrome.grid, width: 1, size: 4 },
          },
          {
            stroke: chrome.muted,
            font,
            size: 58,
            grid: { stroke: chrome.grid, width: 1 },
            ticks: { show: false },
            values: (_u, vals) => vals.map((v) => fmtAxis(v, unit)),
          },
        ],
        series: [
          {
            value: (_u, v) =>
              v == null ? '' : new Date(v * 1000).toLocaleTimeString(),
          },
          ...series.map((s) => ({
            label: s.name,
            stroke: s.color,
            fill: opts.dots ? s.color : undefined,
            width: 2,
            // Sparse series (e.g. whole-flow durations) read better as dots.
            paths: opts.dots ? () => null : undefined,
            points: opts.dots
              ? {
                  show: true,
                  size: 6,
                  width: 2,
                  stroke: s.color,
                  fill: s.color,
                }
              : { show: false },
            spanGaps: false,
            value: (_u, v) => (v == null ? '–' : fmtUnit(v, unit)),
          })),
        ],
        hooks: {
          draw: [(u) => this.drawMarkers(u)],
        },
      },
      aligned,
      this.box,
    );
    this.showLatest();
  }
  drawMarkers(u) {
    const marks = (this.opts.markers && this.opts.markers()) || [];
    const ctx = u.ctx;
    for (const m of marks) {
      if (m.t == null) continue;
      const x = u.valToPos(m.t, 'x', true);
      if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
      ctx.save();
      ctx.strokeStyle = chrome.ink2;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1 * devicePixelRatio;
      ctx.beginPath();
      ctx.moveTo(x, u.bbox.top);
      ctx.lineTo(x, u.bbox.top + u.bbox.height);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = chrome.ink2;
      ctx.font = `${11 * devicePixelRatio}px system-ui, sans-serif`;
      ctx.fillText(
        m.label,
        x + 4 * devicePixelRatio,
        u.bbox.top + 12 * devicePixelRatio,
      );
      ctx.restore();
    }
  }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  readTheme();
  for (const c of charts) {
    c.resetMembership();
    c.destroy();
    c.key = null;
    c.render();
  }
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const S = {
  status: null,
  scenarioInfo: [],
  cfg: null, // draft config for the next run (mirrors the server)
  history: [],
  metrics: null,
  metricsEnabled: true,
  notes: [],
  errors: [],
  window: 0,
  smooth: 5,
  opsMode: 'recent',
  totals: null,
  selectedOp: null,
  sort: { key: 'count', dir: -1 },
  openParams: new Set(),
  disconnected: false,
};
const running = () =>
  S.status && (S.status.state === 'running' || S.status.state === 'stopping');
// Mirrors harbor.Labels in Go: short labels, full host on collision.
const serverLabels = () => {
  if (!S.cfg) return [];
  const urls = S.cfg.target.servers;
  const short = urls.map(shortLabel);
  return short.map((l, i) =>
    short.filter((x) => x === l).length > 1 ? hostOf(urls[i]) : l,
  );
};
function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}
function shortLabel(u) {
  try {
    const url = new URL(u);
    const host = url.hostname;
    if (/^[\d.]+$/.test(host) || host.includes(':') || !host.includes('.'))
      return url.host;
    return host.split('.').slice(-2).join('.');
  } catch {
    return u;
  }
}
function splitOp(name) {
  const i = name.lastIndexOf('@');
  return i < 0 ? [name, ''] : [name.slice(0, i), name.slice(i + 1)];
}

// ---------------------------------------------------------------------------
// Client-side series, built incrementally from ticks.
// ---------------------------------------------------------------------------
// Count-like series read a missing second as 0; latency series as a gap.
const ZERO_FILL = new Set(['rps', 'errs', 'arrivals', 'inflight']);
function put(map, name, i, v) {
  let arr = map.get(name);
  const fill = map.zero ? 0 : null;
  if (!arr) {
    arr = new Array(i).fill(fill);
    map.set(name, arr);
  }
  while (arr.length < i) arr.push(fill);
  arr[i] = v;
}
function pad(map, n) {
  const fill = map.zero ? 0 : null;
  for (const arr of map.values()) while (arr.length < n) arr.push(fill);
}
function newSeriesMap(k) {
  const m = new Map();
  m.zero = ZERO_FILL.has(k);
  return m;
}
const C = {
  xs: [],
  rps: newSeriesMap('rps'),
  p95: newSeriesMap('p95'),
  errs: newSeriesMap('errs'),
  arrivals: newSeriesMap('arrivals'),
  inflight: newSeriesMap('inflight'),
  flows: newSeriesMap('flows'),
  op: newSeriesMap('op'),
};
function resetClient() {
  C.xs = [];
  for (const k of ['rps', 'p95', 'errs', 'arrivals', 'inflight', 'flows', 'op'])
    C[k] = newSeriesMap(k);
  for (const c of clientCharts) c.resetMembership();
}
function ingest(t, prev) {
  const i = C.xs.length;
  C.xs.push(t.t / 1000);
  const errs = {};
  for (const [name, op] of Object.entries(t.ops || {})) {
    if (name.startsWith('ALL@')) {
      const label = name.slice(4);
      put(C.rps, label, i, op.count);
      put(C.p95, label, i, op.p95Ms);
    } else if (name === 'GET web /') {
      put(C.rps, 'web app', i, op.count);
    } else if (name.startsWith('session:') || name.startsWith('flow:')) {
      put(C.flows, name.replace(/^(session|flow):/, ''), i, op.p95Ms);
    } else if (name !== 'skipped') {
      for (const [cls, n] of Object.entries(op.errorsBy || {}))
        errs[cls] = (errs[cls] || 0) + n;
    }
  }
  for (const [cls, n] of Object.entries(errs)) put(C.errs, cls, i, n);
  const prevBy = {};
  for (const s of (prev && prev.scenarios) || []) prevBy[s.name] = s;
  for (const s of t.scenarios || []) {
    const p = prevBy[s.name];
    if (s.arrivals > 0 || s.enabled)
      put(C.arrivals, s.name, i, p ? Math.max(0, s.arrivals - p.arrivals) : 0);
    if (s.started > 0) put(C.inflight, s.name, i, s.inFlight);
  }
  const sel = S.selectedOp;
  if (sel && t.ops && t.ops[sel]) {
    const o = t.ops[sel];
    put(C.op, 'p50', i, o.p50Ms);
    put(C.op, 'p95', i, o.p95Ms);
    put(C.op, 'p99', i, o.p99Ms);
  }
  for (const k of ['rps', 'p95', 'errs', 'arrivals', 'inflight', 'flows', 'op'])
    pad(C[k], i + 1);
}
function rebuildOpSeries() {
  C.op = newSeriesMap('op');
  S.history.forEach((t, i) => {
    const o = t.ops && t.ops[S.selectedOp];
    put(C.op, 'p50', i, o ? o.p50Ms : null);
    put(C.op, 'p95', i, o ? o.p95Ms : null);
    put(C.op, 'p99', i, o ? o.p99Ms : null);
  });
  pad(C.op, S.history.length);
}

let clientCharts = [];
let chartRps, chartP95, chartOp, chartErrs, chartArr, chartInflight, chartFlows;
function runMarkers() {
  const st = S.status;
  if (!st || !st.startedAt || st.state === 'idle') return [];
  const m = [{ t: Date.parse(st.startedAt) / 1000, label: 'run start' }];
  if (st.endedAt && !st.endedAt.startsWith('0001'))
    m.push({ t: Date.parse(st.endedAt) / 1000, label: 'run end' });
  return m;
}
function buildClientCharts() {
  const root = $('#client-charts');
  root.replaceChildren();
  const labelsOrder = (a, b) => {
    const order = [...serverLabels(), 'web app'];
    return order.indexOf(a) - order.indexOf(b);
  };
  const empty = 'Start a run to see client-side results';
  chartRps = new TimeChart(root, {
    title: 'Requests per second by server',
    unit: 'ops/s',
    sync: 'client',
    order: labelsOrder,
    empty,
  });
  chartP95 = new TimeChart(root, {
    title: 'Latency p95 by server',
    unit: 'ms',
    sync: 'client',
    order: labelsOrder,
    empty,
    help: 'Every call to that server, per 1s window. The web app gives up on a server after 5s.',
  });
  chartOp = new TimeChart(root, {
    title: 'Latency percentiles',
    unit: 'ms',
    sync: 'client',
    priority: ['p50', 'p95', 'p99'],
    empty,
  });
  chartErrs = new TimeChart(root, {
    title: 'Errors per second by class',
    unit: 'ops/s',
    sync: 'client',
    empty: 'No errors',
    help: 'grpc:* = gRPC status, http:* = HTTP status (403/429 are usually the Cloudflare edge), rejected:* = PutEvents accepted the call but refused an event.',
  });
  chartArr = new TimeChart(root, {
    title: 'Arrivals per second by scenario',
    unit: 'ops/s',
    sync: 'client',
    priority: S.scenarioInfo.map((s) => s.name),
    empty,
  });
  chartInflight = new TimeChart(root, {
    title: 'Iterations in flight by scenario',
    unit: 'count',
    sync: 'client',
    priority: S.scenarioInfo.map((s) => s.name),
    empty,
    help: 'Open model: if the platform slows down, concurrency grows instead of load dropping.',
  });
  chartFlows = new TimeChart(root, {
    title: 'User-perceived duration p95',
    unit: 'ms',
    sync: 'client',
    empty,
    dots: true,
    help: 'Whole flows: a browse session includes think time; register/post include every server round trip.',
  });
  clientCharts = [
    chartRps,
    chartP95,
    chartOp,
    chartErrs,
    chartArr,
    chartInflight,
    chartFlows,
  ];
  for (const c of clientCharts) c.opts.markers = runMarkers;
}
function windowed(map) {
  let start = 0;
  if (S.window > 0 && C.xs.length) {
    const min = C.xs[C.xs.length - 1] - S.window;
    while (start < C.xs.length && C.xs[start] < min) start++;
  }
  const xs = C.xs.slice(start);
  const out = new Map();
  const k = map.zero ? Math.max(1, S.smooth) : 1;
  for (const [name, v] of map) {
    // Trailing moving average for count-like series (rates are spiky at
    // low volume); latency series stay raw.
    let arr = v;
    if (k > 1) {
      arr = new Array(v.length);
      let sum = 0;
      for (let i = 0; i < v.length; i++) {
        sum += v[i] || 0;
        if (i >= k) sum -= v[i - k] || 0;
        arr[i] = sum / Math.min(i + 1, k);
      }
    }
    out.set(name, arr.slice(start));
  }
  out.zero = map.zero;
  return [xs, out];
}
function renderClientCharts() {
  const opName = S.selectedOp || '';
  const [op, srv] = splitOp(opName);
  chartOp.card.querySelector('h3').textContent = opName
    ? 'Latency percentiles — ' +
      (op === 'ALL' ? 'all calls' : op) +
      (srv ? ' @ ' + srv : '')
    : 'Latency percentiles';
  chartRps.set(...windowed(C.rps));
  chartP95.set(...windowed(C.p95));
  chartOp.set(...windowed(C.op));
  chartErrs.set(...windowed(C.errs));
  chartArr.set(...windowed(C.arrivals));
  chartInflight.set(...windowed(C.inflight));
  chartFlows.set(...windowed(C.flows));
}

// ---------------------------------------------------------------------------
// Header, banners, KPI tiles
// ---------------------------------------------------------------------------
function renderHeader() {
  const st = S.status;
  const target = $('#target');
  let web = '';
  try {
    web = S.cfg ? new URL(S.cfg.target.webURL).hostname : '';
  } catch {}
  target.replaceChildren(
    ...(S.cfg ? [web, ...serverLabels()] : []).filter(Boolean).map((t, i) =>
      h('span', {
        class: 'chip',
        title: i === 0 && web ? 'Web app' : 'Server',
        text: t,
      }),
    ),
  );
  const badge = $('#state-badge');
  const state = st ? st.state : 'idle';
  const paused = st && st.paused && running();
  badge.className = 'badge ' + (paused ? 'paused' : state);
  $('#state-text').textContent = paused
    ? 'Paused'
    : {
        idle: 'Idle',
        running: 'Running',
        stopping: 'Stopping',
        finished: 'Finished',
      }[state] || state;
  const started = st && st.startedAt ? Date.parse(st.startedAt) : 0;
  const ended =
    st && st.endedAt && !st.endedAt.startsWith('0001')
      ? Date.parse(st.endedAt)
      : 0;
  const el = started ? ((ended || Date.now()) - started) / 1000 : 0;
  const planned = st ? st.duration : 0;
  $('#elapsed').textContent = started
    ? fmtDur(el) + (planned ? ' / ' + fmtDur(planned) : '')
    : '';
  $('#progress').hidden = !(planned && running());
  $('#progress-bar').style.width = planned
    ? Math.min(100, (100 * el) / planned) + '%'
    : '0';
  $('#btn-start').disabled = running();
  $('#btn-stop').disabled = !running() || state === 'stopping';
  const pb = $('#btn-pause');
  pb.disabled = !running() || state === 'stopping';
  pb.textContent = paused ? 'Resume' : 'Pause';
}

function renderBanners() {
  const root = $('#banners');
  root.replaceChildren();
  const st = S.status;
  if (S.disconnected) {
    root.append(
      banner(
        'critical',
        'Lost connection to the load-test process',
        'Reconnecting… (is harbor-loadtest still running?)',
      ),
    );
  }
  if (st && st.paused && st.message && running()) {
    root.append(
      banner(
        'critical',
        'Run paused',
        st.message,
        h('button', {
          class: 'small',
          onclick: () =>
            api('POST', '/api/pause', { paused: false }).catch((e) =>
              toast(e.message),
            ),
          text: 'Resume',
        }),
      ),
    );
  }
  if (S.metricsEnabled && S.metrics && S.metrics.error) {
    root.append(
      banner(
        'warning',
        "Can't reach VictoriaMetrics",
        S.metrics.error + ' — platform charts need the netbird network.',
      ),
    );
  }
  if (S.cfg && S.cfg.content.uniquePosts) {
    root.append(
      banner(
        'warning',
        'Unique posts are on',
        'Every post gets a unique content digest, so moderation sends each one to Azure Content Safety (a paid call). Turn it off to draw posts from a fixed corpus.',
      ),
    );
  }
  let dismissed = false;
  try {
    dismissed = localStorage.getItem('lt-info-dismissed') === '1';
  } catch {}
  if (!dismissed) {
    const b = banner(
      'info',
      'Before you push hard',
      'Staging shares the harbor.social Cloudflare zone with production: if the edge starts refusing this machine (403/429), the run pauses itself so the IP is not banned for prod too. ' +
        'Both staging servers share the same nodes, Postgres primary and Kafka, and CI runs e2e tests against srv.staging.harbor.social. ' +
        'New post and profile contents go to Azure moderation; replies and quotes are always unique.',
      h('button', {
        class: 'small ghost',
        onclick: () => {
          try {
            localStorage.setItem('lt-info-dismissed', '1');
          } catch {}
          renderBanners();
        },
        text: 'Dismiss',
      }),
    );
    root.append(b);
  }
}
function banner(kind, title, body, action) {
  return h(
    'div',
    { class: 'banner ' + kind, role: kind === 'critical' ? 'alert' : 'status' },
    icon(kind),
    h(
      'div',
      { class: 'body' },
      h('div', { class: 'title', text: title }),
      h('div', { class: 'ink2', text: body }),
    ),
    action || null,
  );
}

function recentTicks(n = 10) {
  return S.history.slice(-n);
}
function sumAll(ticks, pred, f) {
  let s = 0;
  for (const t of ticks)
    for (const [name, op] of Object.entries(t.ops || {}))
      if (pred(name)) s += f(op);
  return s;
}
function weighted(ticks, name, field) {
  let w = 0,
    s = 0;
  for (const t of ticks) {
    const o = t.ops && t.ops[name];
    if (o && o.count) {
      w += o.count;
      s += o[field] * o.count;
    }
  }
  return w ? s / w : null;
}
function lastPanelValue(id, pick) {
  const p =
    S.metrics && S.metrics.panels && S.metrics.panels.find((x) => x.id === id);
  if (!p || !p.series) return null;
  let total = null;
  for (const s of p.series) {
    if (pick && !pick(s)) continue;
    for (let i = s.v.length - 1; i >= 0; i--)
      if (s.v[i] != null) {
        total = (total || 0) + s.v[i];
        break;
      }
  }
  return total;
}
function renderKpis() {
  const ticks = recentTicks(10);
  const secs = Math.max(1, ticks.length);
  const isAll = (n) => n.startsWith('ALL@');
  const reqs = sumAll(ticks, isAll, (o) => o.count);
  const errs = sumAll(ticks, isAll, (o) => o.errors);
  const errPct = reqs ? (100 * errs) / reqs : null;
  const primary = serverLabels()[0];
  const p95 = primary ? weighted(ticks, 'ALL@' + primary, 'p95Ms') : null;
  const last = S.history[S.history.length - 1];
  const inflight = last
    ? last.scenarios.reduce((a, s) => a + s.inFlight, 0)
    : null;
  const first = ticks[0],
    lastT = ticks[ticks.length - 1];
  let arrivals = null;
  if (first && lastT && ticks.length > 1) {
    arrivals = 0;
    for (const s of lastT.scenarios) {
      const p = first.scenarios.find((x) => x.name === s.name);
      if (p) arrivals += s.arrivals - p.arrivals;
    }
    arrivals /= ticks.length - 1;
  }
  const target = last
    ? last.scenarios.reduce((a, s) => a + (s.enabled ? s.targetRate : 0), 0)
    : null;
  const errStatus =
    errPct == null
      ? null
      : errPct < 1
        ? ['good', 'Healthy']
        : errPct < 5
          ? ['warning', 'Elevated']
          : ['critical', 'High'];
  const srvCpu = lastPanelValue('cpu', (s) => /server|workers/.test(s.name));
  const pgTps = lastPanelValue('pg_tps');
  const lag = lastPanelValue('kafka_lag');
  const tiles = [
    {
      label: 'Request rate',
      value: reqs ? fmtNum(reqs / secs, reqs / secs < 10 ? 1 : 0) : '–',
      unit: 'req/s',
      sub: 'all servers, last 10s',
    },
    {
      label: 'Error rate',
      value: errPct == null ? '–' : errPct.toFixed(errPct < 10 ? 2 : 1),
      unit: '%',
      status: errStatus,
      sub: errs ? fmtNum(errs) + ' failed calls' : '',
    },
    {
      label: 'Latency p95',
      value:
        p95 == null ? '–' : p95 >= 1000 ? (p95 / 1000).toFixed(2) : fmtNum(p95),
      unit: p95 != null && p95 >= 1000 ? 's' : 'ms',
      sub: primary ? primary + ', ≈ last 10s' : '',
    },
    {
      label: 'Arrivals',
      value: arrivals == null ? '–' : fmtNum(arrivals, arrivals < 10 ? 1 : 0),
      unit: '/s',
      sub:
        target != null
          ? 'target ' + fmtNum(target, target < 10 ? 1 : 0) + '/s'
          : '',
    },
    {
      label: 'In flight',
      value: inflight == null ? '–' : fmtNum(inflight),
      sub: 'sessions and actions',
    },
    {
      label: 'Accounts',
      value: last
        ? fmtNum(last.accounts[1])
        : fmtNum(S.accounts ? S.accounts[1] : null),
      sub: last ? fmtNum(last.posts) + ' posts known' : 'published identities',
    },
    {
      label: 'Server CPU',
      value: srvCpu == null ? '–' : srvCpu.toFixed(2),
      unit: 'cores',
      sub: 'servers + workers (VM)',
    },
    {
      label: 'Postgres',
      value: pgTps == null ? '–' : fmtNum(pgTps),
      unit: 'tx/s',
      sub: lag == null ? '' : 'Kafka lag ' + fmtNum(lag),
    },
  ];
  $('#kpis').replaceChildren(
    ...tiles.map((t) =>
      h(
        'div',
        { class: 'tile' },
        h('div', { class: 'label', text: t.label }),
        h(
          'div',
          { class: 'value' },
          t.value,
          t.unit ? h('span', { class: 'unit', text: t.unit }) : null,
        ),
        h(
          'div',
          { class: 'sub' },
          t.status
            ? h(
                'span',
                { class: 'status ' + t.status[0] },
                icon(t.status[0] === 'good' ? 'good' : t.status[0]),
                t.status[1],
              )
            : null,
          t.status && t.sub ? ' · ' : '',
          t.sub,
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Scenario controls
// ---------------------------------------------------------------------------
const PARAM_HELP = {
  scrollSteps:
    'Scroll steps per session (each fetches the next page from every server)',
  thinkTime: 'Pause between actions',
  sortTopShare: 'Share of visitors on Explore/Top (rest: Latest)',
  threadProb: 'Chance a session opens a thread',
  profileProb: 'Chance a session opens a profile',
  notificationProb: 'Chance a session opens notifications',
  loadWebApp: 'Fetch the web app HTML (harbor-web)',
  loadStaticAssets: 'Also fetch JS bundles (CDN)',
  images: 'Load avatars and post images (/blob)',
  imageProxy:
    'Load link-preview thumbnails via /image_proxy (the scraper fetches third-party URLs)',
  cacheBust: 'Bypass Cloudflare cache for blobs',
  preflightProb:
    'Share of sessions that are fresh browsers (send CORS preflights)',
  rowsFirstRender: 'Rows mounted on landing',
  rowsPerScroll: 'Rows mounted per scroll step',
  landingFollowing: 'Land on Following (Latest)',
  landingForYou: 'Land on For you',
  suggestFollow: 'Chance of SuggestFollow (wide screens)',
  authReads: 'Send the JWT on reads, as the app does',
  followOnSignup: 'Load-test accounts to follow at signup',
  browseAfterSignup: 'Load the feed after signing up',
  imageProb:
    'Chance a post has an image (uploaded in every variant to every server)',
  quoteProb: 'Chance a post quotes another',
  mentionProb: 'Chance a post mentions a load-test account',
  textWords: 'Words per text',
  targetSkew: 'Favour recent posts (0 = uniform, higher = hotter)',
  negativeProb: 'Share of downvotes',
  usersShare: 'Share of user searches (rest: posts)',
};
// The table is rebuilt only on structural changes (status, settings toggle);
// every tick just refreshes the stat cells so inputs keep focus.
const scRefs = new Map();
function renderScenarios() {
  const tbody = $('#scenarios tbody');
  const live = running();
  const rows = [];
  scRefs.clear();
  for (const info of S.scenarioInfo) {
    const sc = S.cfg.scenarios[info.name];
    if (!sc) continue;
    const hasStages = sc.stages && sc.stages.length;
    const input = h('input', {
      type: 'number',
      min: '0',
      step: 'any',
      value: +(+sc.rate).toFixed(3),
      'aria-label': info.title + ' rate',
    });
    const commit = () => setRate(info.name, parseFloat(input.value) || 0);
    input.addEventListener('change', commit);
    const step = (f) => () => {
      input.value =
        +Math.max(0, (parseFloat(input.value) || 0) * f).toFixed(3) ||
        (f > 1 ? 0.1 : 0);
      commit();
    };
    const toggle = h(
      'label',
      { class: 'switch', title: sc.enabled ? 'Disable' : 'Enable' },
      h('input', {
        type: 'checkbox',
        checked: sc.enabled,
        'aria-label': 'Enable ' + info.title,
        onchange: (e) => setEnabled(info.name, e.target.checked),
      }),
      h('span'),
    );
    const open = S.openParams.has(info.name);
    const ref = {
      input,
      hasStages,
      ramp: h('span', {
        class: 'tag',
        title: hasStages ? stagesText(sc) : null,
        text: 'ramp',
        hidden: !hasStages,
      }),
      back: h('button', {
        class: 'small ghost',
        title: 'Return to the configured ramp',
        hidden: true,
        onclick: () =>
          api('POST', '/api/scenarios/' + info.name, { clearRate: true }).catch(
            (e) => toast(e.message),
          ),
        text: '↺ ramp',
      }),
      achieved: h('td', { class: 'r', text: '–' }),
      inflight: h('td', { class: 'r', text: '–' }),
      done: h('td', { class: 'r', text: '–' }),
      failed: h('td', { class: 'r', text: '–' }),
      dropped: h('td', { class: 'r', text: '–' }),
    };
    scRefs.set(info.name, ref);
    rows.push(
      h(
        'tr',
        { class: 'sc-row' },
        h('td', {}, toggle),
        h(
          'td',
          {},
          h(
            'div',
            { class: 'sc-name' },
            h('span', { class: 't', text: info.title }),
            h('span', { class: 'u', text: info.unit }),
          ),
        ),
        h(
          'td',
          {},
          h(
            'span',
            { class: 'rate' },
            h('button', {
              type: 'button',
              onclick: step(0.5),
              title: 'Halve',
              'aria-label': 'Halve rate',
              text: '×½',
            }),
            input,
            h('button', {
              type: 'button',
              onclick: step(2),
              title: 'Double',
              'aria-label': 'Double rate',
              text: '×2',
            }),
          ),
          ' ',
          ref.ramp,
          ref.back,
        ),
        ref.achieved,
        ref.inflight,
        ref.done,
        ref.failed,
        ref.dropped,
        h(
          'td',
          {},
          h('button', {
            class: 'small ghost',
            'aria-expanded': open ? 'true' : 'false',
            onclick: () => {
              open
                ? S.openParams.delete(info.name)
                : S.openParams.add(info.name);
              renderScenarios();
            },
            text: open ? 'Hide' : 'Settings',
          }),
        ),
      ),
    );
    if (open)
      rows.push(
        h(
          'tr',
          { class: 'params' },
          h('td', { colspan: 9 }, paramsEditor(info.name, sc, live)),
        ),
      );
  }
  tbody.replaceChildren(...rows);
  updateScenarioStats();
}
function updateScenarioStats() {
  const live = S.status && S.status.state !== 'idle' && S.history.length > 0;
  const last = S.history[S.history.length - 1];
  const first = S.history[Math.max(0, S.history.length - 11)];
  const span = last && first ? (last.t - first.t) / 1000 : 0;
  const skipped = {};
  for (const t of recentTicks(60)) {
    const sk = t.ops && t.ops.skipped;
    if (sk)
      for (const [k, n] of Object.entries(sk.errorsBy || {}))
        skipped[k] = (skipped[k] || 0) + n;
  }
  for (const [name, ref] of scRefs) {
    const ex =
      live && last ? last.scenarios.find((s) => s.name === name) : null;
    const exPrev =
      ex && first ? first.scenarios.find((s) => s.name === name) : null;
    const achieved =
      ex && exPrev && span > 0 ? (ex.arrivals - exPrev.arrivals) / span : null;
    ref.achieved.textContent = achieved == null ? '–' : fmtRate(achieved);
    ref.inflight.textContent = ex
      ? `${fmtNum(ex.inFlight)}${ex.maxInFlight ? ' / ' + fmtNum(ex.maxInFlight) : ''}`
      : '–';
    ref.done.textContent = ex ? fmtNum(ex.completed) : '–';
    ref.failed.textContent = ex ? fmtNum(ex.failed) : '–';
    ref.failed.classList.toggle('err', !!(ex && ex.failed));
    ref.dropped.textContent = ex ? fmtNum(ex.dropped) : '–';
    const prefix =
      name === 'browse_user' ? 'session:browse_user' : 'flow:' + name;
    const skip = Object.entries(skipped).filter(([k]) =>
      k.startsWith(prefix + ' '),
    );
    ref.failed.title = skip.length
      ? 'Skipped in the last minute: ' +
        skip.map(([k, n]) => `${k.split(' ')[1]} ×${n}`).join(', ')
      : '';
    // While a ramp is driving the rate, show the rate in effect.
    const manual = ex && ex.manual;
    ref.ramp.hidden = !ref.hasStages || manual;
    ref.back.hidden = !(manual && ref.hasStages);
    if (ex && ref.hasStages && !manual && document.activeElement !== ref.input)
      ref.input.value = +ex.targetRate.toFixed(3);
  }
}
function stagesText(sc) {
  return (
    'Ramp: ' +
    sc.stages.map((s) => `${s.target}/s over ${s.duration}`).join(' → ')
  );
}
async function setRate(name, rate) {
  try {
    const st = await api('POST', '/api/scenarios/' + name, { rate });
    onStatus(st);
  } catch (e) {
    toast(e.message);
  }
}
async function setEnabled(name, enabled) {
  try {
    const st = await api('POST', '/api/scenarios/' + name, { enabled });
    onStatus(st);
  } catch (e) {
    toast(e.message);
  }
}
const pushConfig = debounce(async () => {
  try {
    onStatus(await api('PUT', '/api/config', S.cfg));
  } catch (e) {
    toast(e.message);
  }
}, 500);

function paramsEditor(name, sc, live) {
  const params = sc.params || {};
  const fields = [];
  const mif = h('input', { type: 'number', min: '0', value: sc.maxInFlight });
  mif.addEventListener('change', async () => {
    try {
      onStatus(
        await api('POST', '/api/scenarios/' + name, {
          maxInFlight: parseInt(mif.value, 10) || 0,
        }),
      );
    } catch (e) {
      toast(e.message);
    }
  });
  fields.push(
    h(
      'label',
      { class: 'field' },
      'Max in flight (live)',
      mif,
      h('span', { class: 'note', text: 'Arrivals beyond this are dropped' }),
    ),
  );
  const fs = h('fieldset', { disabled: live });
  const grid = h('div', { class: 'pgrid' });
  for (const [k, v] of Object.entries(params)) {
    const set = (nv) => {
      S.cfg.scenarios[name].params[k] = nv;
      pushConfig();
    };
    let control;
    if (typeof v === 'boolean') {
      control = h(
        'label',
        { class: 'field check' },
        h('input', {
          type: 'checkbox',
          checked: v,
          onchange: (e) => set(e.target.checked),
        }),
        k,
      );
    } else if (typeof v === 'number') {
      const inp = h('input', {
        type: 'number',
        step: 'any',
        value: v,
        onchange: (e) => set(parseFloat(e.target.value) || 0),
      });
      control = h('label', { class: 'field' }, k, inp);
    } else if (v && typeof v === 'object' && 'min' in v) {
      const num = typeof v.min === 'number';
      const mk = (which) =>
        h('input', {
          type: num ? 'number' : 'text',
          step: 'any',
          value: v[which],
          'aria-label': k + ' ' + which,
          onchange: (e) =>
            set({
              ...S.cfg.scenarios[name].params[k],
              [which]: num ? parseFloat(e.target.value) || 0 : e.target.value,
            }),
        });
      control = h(
        'div',
        { class: 'field' },
        k,
        h(
          'div',
          { class: 'pair' },
          mk('min'),
          h('span', { class: 'muted', text: 'to' }),
          mk('max'),
        ),
      );
    } else {
      control = h(
        'label',
        { class: 'field' },
        k,
        h('input', {
          type: 'text',
          value: v,
          onchange: (e) => set(e.target.value),
        }),
      );
    }
    if (PARAM_HELP[k])
      control.append(h('span', { class: 'note', text: PARAM_HELP[k] }));
    grid.append(control);
  }
  fs.append(grid);
  return h(
    'div',
    {},
    h('div', { class: 'pgrid', style: 'margin-bottom:10px' }, ...fields),
    Object.keys(params).length ? fs : null,
    live && Object.keys(params).length
      ? h('div', {
          class: 'note muted',
          style: 'margin-top:8px;font-size:12px',
          text: 'Behaviour settings apply from the next run; rate, on/off and max in flight change live.',
        })
      : null,
  );
}

// ---------------------------------------------------------------------------
// Run settings
// ---------------------------------------------------------------------------
function renderSettings() {
  const form = $('#settings');
  const c = S.cfg;
  const live = running();
  $('#settings-hint').textContent = live
    ? 'Locked while a run is in progress'
    : 'Applied when you start the next run';
  const fs = h('fieldset', { disabled: live, class: 'settings' });
  const update = (fn) => (e) => {
    fn(e.target);
    pushConfig();
    renderBanners();
  };
  const text = (label, val, fn, note) =>
    h(
      'label',
      { class: 'field' },
      label,
      h('input', {
        type: 'text',
        value: val,
        onchange: update((t) => fn(t.value)),
      }),
      note ? h('span', { class: 'note', text: note }) : null,
    );
  const num = (label, val, fn, attrs = {}, note) =>
    h(
      'label',
      { class: 'field' },
      label,
      h('input', {
        type: 'number',
        step: 'any',
        value: val,
        ...attrs,
        onchange: update((t) => fn(parseFloat(t.value) || 0)),
      }),
      note ? h('span', { class: 'note', text: note }) : null,
    );
  const check = (label, val, fn, note) =>
    h(
      'label',
      { class: 'field check', title: note || null },
      h('input', {
        type: 'checkbox',
        checked: val,
        onchange: update((t) => fn(t.checked)),
      }),
      label,
    );
  fs.append(
    h(
      'div',
      {},
      h('h3', { text: 'Run' }),
      h(
        'div',
        { class: 'sgrid' },
        text(
          'Duration',
          c.run.duration,
          (v) => (c.run.duration = v),
          '0 = until stopped',
        ),
        text(
          'Graceful stop',
          c.run.gracefulStop,
          (v) => (c.run.gracefulStop = v),
        ),
        text(
          'Request timeout',
          c.target.timeout,
          (v) => (c.target.timeout = v),
        ),
        h(
          'label',
          { class: 'field' },
          'Fan-out',
          h(
            'select',
            { onchange: update((t) => (c.target.fanout = t.value)) },
            h('option', {
              value: 'all',
              selected: c.target.fanout === 'all',
              text: 'All (like the app)',
            }),
            h('option', {
              value: 'first',
              selected: c.target.fanout === 'first',
              text: 'First only',
            }),
          ),
        ),
      ),
    ),
    h(
      'div',
      {},
      h('h3', { text: 'Target' }),
      h(
        'div',
        { class: 'sgrid', style: 'grid-template-columns:1fr' },
        text('Web app', c.target.webURL, (v) => (c.target.webURL = v)),
        h(
          'label',
          { class: 'field' },
          'Servers (one per line, app order)',
          h(
            'textarea',
            {
              rows: 2,
              onchange: update(
                (t) =>
                  (c.target.servers = t.value.split(/\s+/).filter(Boolean)),
              ),
            },
            c.target.servers.join('\n'),
          ),
        ),
      ),
    ),
    h(
      'div',
      {},
      h('h3', { text: 'Content' }),
      h(
        'div',
        { class: 'sgrid' },
        check(
          'Unique posts',
          c.content.uniquePosts,
          (v) => (c.content.uniquePosts = v),
          'Each post a new digest → one Azure moderation call per post',
        ),
        check(
          'Interact with real users',
          c.content.interactWithReal,
          (v) => (c.content.interactWithReal = v),
          'Allow replies/reactions/reposts on non-load-test posts (their authors get notifications)',
        ),
        check(
          'Label posts "loadtest"',
          c.content.loadtestLabel,
          (v) => (c.content.loadtestLabel = v),
        ),
        num(
          'Corpus size',
          c.content.corpusSize,
          (v) => (c.content.corpusSize = Math.max(1, Math.round(v))),
          { min: 1 },
        ),
        text(
          'Name prefix',
          c.content.namePrefix,
          (v) => (c.content.namePrefix = v),
        ),
      ),
    ),
    h(
      'div',
      {},
      h('h3', { text: 'Safety' }),
      h(
        'div',
        { class: 'sgrid' },
        check(
          'Pause when the edge blocks us',
          c.safety.pauseOnBlock,
          (v) => (c.safety.pauseOnBlock = v),
        ),
        num(
          'Block threshold',
          c.safety.blockThreshold,
          (v) => (c.safety.blockThreshold = v),
          { min: 0, max: 1 },
          'Share of 403/429 over 10s',
        ),
        num(
          'Max error rate',
          c.safety.maxErrorRate,
          (v) => (c.safety.maxErrorRate = v),
          { min: 0, max: 1 },
          '0 = never pause on errors',
        ),
      ),
    ),
  );
  form.replaceChildren(fs);
}

// ---------------------------------------------------------------------------
// Operations table
// ---------------------------------------------------------------------------
function opsRows() {
  const rows = new Map();
  if (S.opsMode === 'total') {
    for (const [name, o] of Object.entries(
      (S.totals && S.totals.totals) || {},
    )) {
      const secs = S.totals
        ? Math.max(
            1,
            (Date.parse(
              S.totals.ended.startsWith('0001')
                ? new Date().toISOString()
                : S.totals.ended,
            ) -
              Date.parse(S.totals.started)) /
              1000,
          )
        : 1;
      rows.set(name, { ...o, rate: o.count / secs });
    }
  } else {
    const ticks = recentTicks(10);
    const secs = Math.max(1, ticks.length);
    for (const t of ticks)
      for (const [name, o] of Object.entries(t.ops || {})) {
        const r = rows.get(name) || {
          count: 0,
          errors: 0,
          bytesIn: 0,
          w50: 0,
          w95: 0,
          w99: 0,
          maxMs: 0,
        };
        r.count += o.count;
        r.errors += o.errors;
        r.bytesIn += o.bytesIn;
        r.w50 += o.p50Ms * o.count;
        r.w95 += o.p95Ms * o.count;
        r.w99 += o.p99Ms * o.count;
        r.maxMs = Math.max(r.maxMs, o.maxMs);
        rows.set(name, r);
      }
    for (const r of rows.values()) {
      r.rate = r.count / secs;
      r.p50Ms = r.count ? r.w50 / r.count : null;
      r.p95Ms = r.count ? r.w95 / r.count : null;
      r.p99Ms = r.count ? r.w99 / r.count : null;
    }
  }
  rows.delete('skipped');
  return rows;
}
const OPS_COLS = [
  ['name', 'Operation', false],
  ['rate', 'Rate', true],
  ['count', 'Calls', true],
  ['errors', 'Errors', true],
  ['errPct', 'Err %', true],
  ['p50Ms', 'p50', true],
  ['p95Ms', 'p95', true],
  ['p99Ms', 'p99', true],
  ['maxMs', 'Max', true],
  ['avgKB', 'Avg response', true],
];
function renderOps() {
  const rows = opsRows();
  const table = $('#ops');
  const sortKey = S.sort.key,
    dir = S.sort.dir;
  const head = h(
    'tr',
    {},
    ...OPS_COLS.map(([k, label, r]) =>
      h('th', {
        class: 'sortable' + (r ? ' r' : ''),
        'aria-sort':
          sortKey === k ? (dir < 0 ? 'descending' : 'ascending') : null,
        onclick: () => {
          S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : -1 };
          renderOps();
        },
        text:
          label +
          (sortKey === k ? (dir < 0 ? ' ↓' : ' ↑') : '') +
          (S.opsMode === 'recent' && /^p\d/.test(k) ? ' ≈' : ''),
      }),
    ),
  );
  const groups = new Map();
  for (const [name, r] of rows) {
    const [op, server] = splitOp(name);
    const group =
      name.startsWith('session:') || name.startsWith('flow:')
        ? 'User flows'
        : server || 'Web app';
    r.name = name;
    r.op = op;
    r.errPct = r.count ? (100 * r.errors) / r.count : 0;
    r.avgKB = r.count ? r.bytesIn / r.count : 0;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(r);
  }
  const order = ['User flows', ...serverLabels(), 'Web app'];
  const body = [];
  for (const g of [...groups.keys()].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  )) {
    body.push(
      h(
        'tr',
        { class: 'group' },
        h('td', { colspan: OPS_COLS.length, text: g }),
      ),
    );
    const list = groups.get(g).sort((a, b) => {
      if (a.op === 'ALL') return -1;
      if (b.op === 'ALL') return 1;
      const av = a[sortKey],
        bv = b[sortKey];
      return (
        (typeof av === 'string'
          ? av.localeCompare(bv)
          : (av || 0) - (bv || 0)) * dir
      );
    });
    for (const r of list) {
      const label =
        r.op === 'ALL' ? 'All calls' : r.op.replace(/^(session|flow):/, '');
      body.push(
        h(
          'tr',
          {
            class: 'clickable' + (S.selectedOp === r.name ? ' selected' : ''),
            onclick: () => selectOp(r.name),
          },
          h('td', {
            style: r.op === 'ALL' ? 'font-weight:600' : null,
            text: label,
          }),
          h('td', { class: 'r', text: fmtRate(r.rate) }),
          h('td', { class: 'r', text: fmtNum(r.count) }),
          h('td', {
            class: 'r' + (r.errors ? ' err' : ''),
            text: fmtNum(r.errors),
          }),
          h('td', {
            class: 'r' + (r.errPct >= 1 ? ' err' : ''),
            text: r.count
              ? r.errPct.toFixed(r.errPct && r.errPct < 10 ? 2 : 1) + '%'
              : '–',
          }),
          h('td', { class: 'r', text: fmtMs(r.p50Ms) }),
          h('td', { class: 'r', text: fmtMs(r.p95Ms) }),
          h('td', { class: 'r', text: fmtMs(r.p99Ms) }),
          h('td', { class: 'r', text: fmtMs(r.maxMs) }),
          h('td', {
            class: 'r',
            text:
              r.name.startsWith('session:') || r.name.startsWith('flow:')
                ? ''
                : fmtBytes(r.avgKB),
          }),
        ),
      );
    }
  }
  if (!body.length)
    body.push(
      h(
        'tr',
        {},
        h('td', {
          colspan: OPS_COLS.length,
          class: 'muted',
          text: 'No calls yet',
        }),
      ),
    );
  table.replaceChildren(h('thead', {}, head), h('tbody', {}, ...body));
  $('#ops-hint').textContent =
    S.opsMode === 'recent'
      ? 'Last 10 seconds (percentiles ≈ count-weighted). Click a row to chart its latency.'
      : 'Whole run (exact percentiles). Click a row to chart its latency.';
}
function selectOp(name) {
  S.selectedOp = name;
  chartOp.resetMembership();
  rebuildOpSeries();
  renderOps();
  renderClientCharts();
}

// ---------------------------------------------------------------------------
// Platform (VictoriaMetrics)
// ---------------------------------------------------------------------------
const COMPONENTS = [
  'server',
  'workers',
  'alt server',
  'alt workers',
  'postgres',
  'kafka',
  'envoy',
  'web',
  'moderation',
  'alt moderation',
  'push',
  'scraper',
  'verifier',
  'kafka ops',
  'envoy ctl',
];
let platformCharts = new Map();
function renderPlatform() {
  const root = $('#platform');
  const snap = S.metrics;
  if (!S.metricsEnabled) {
    root.replaceChildren(
      h('div', {
        class: 'card muted',
        text: 'Metrics are disabled in the configuration (metrics.enabled).',
      }),
    );
    $('#components').replaceChildren();
    return;
  }
  if (!snap) {
    if (!root.childElementCount)
      root.replaceChildren(
        h('div', {
          class: 'card muted',
          text: 'Waiting for the first metrics poll…',
        }),
      );
    return;
  }
  const hint = $('#platform-hint');
  hint.textContent = `From VictoriaMetrics · ${snap.step}s resolution · fetched ${new Date(snap.fetched).toLocaleTimeString()} · scraped every 30s, so expect ~1 minute of lag`;
  if (!platformCharts.size || root.querySelector('.card.muted')) {
    root.replaceChildren();
    platformCharts = new Map();
    const groups = new Map();
    for (const p of snap.panels) {
      if (!groups.has(p.group)) groups.set(p.group, []);
      groups.get(p.group).push(p);
    }
    for (const [g, panels] of groups) {
      root.append(h('div', { class: 'group-title', text: g }));
      const grid = h('div', { class: 'charts' });
      root.append(grid);
      for (const p of panels) {
        platformCharts.set(
          p.id,
          new TimeChart(grid, {
            title: p.title,
            unit: p.unit,
            help: p.help,
            sync: 'platform',
            markers: runMarkers,
            priority:
              p.id.startsWith('cpu') || p.id.startsWith('mem')
                ? COMPONENTS
                : null,
            empty: 'No data in this window',
          }),
        );
      }
    }
  }
  for (const p of snap.panels) {
    const chart = platformCharts.get(p.id);
    if (!chart) continue;
    if (p.error) {
      chart.setEmpty('Query failed: ' + p.error);
      continue;
    }
    // A regular grid over the window, so missing samples break the line
    // instead of being bridged.
    const xsSet = new Set();
    for (const s of p.series || []) for (const t of s.t) xsSet.add(t);
    const step = snap.step || 30;
    const anchor = xsSet.size ? Math.min(...xsSet) : snap.from;
    for (let t = anchor; t >= snap.from; t -= step) xsSet.add(t);
    for (let t = anchor; t <= snap.to; t += step) xsSet.add(t);
    const xs = [...xsSet].sort((a, b) => a - b);
    const idx = new Map(xs.map((t, i) => [t, i]));
    const data = new Map();
    for (const s of p.series || []) {
      const arr = new Array(xs.length).fill(null);
      s.t.forEach((t, i) => {
        arr[idx.get(t)] = s.v[i];
      });
      data.set(s.name || '(value)', arr);
    }
    chart.set(xs, data);
  }
  renderComponents();
}
function renderComponents() {
  const snap = S.metrics;
  const table = $('#components');
  if (!snap) return;
  const panel = (id) => snap.panels.find((p) => p.id === id);
  const start =
    S.status && S.status.startedAt && S.status.state !== 'idle'
      ? Date.parse(S.status.startedAt) / 1000
      : 0;
  const stats = new Map();
  const collect = (id, key) => {
    const p = panel(id);
    for (const s of (p && p.series) || []) {
      const e = stats.get(s.name) || {};
      let lastV = null,
        peak = null;
      s.t.forEach((t, i) => {
        const v = s.v[i];
        if (v == null) return;
        lastV = v;
        if (t >= start) peak = peak == null ? v : Math.max(peak, v);
      });
      e[key] = lastV;
      e[key + 'Peak'] = peak;
      stats.set(s.name, e);
    }
  };
  collect('cpu', 'cpu');
  collect('mem', 'mem');
  collect('mem_limit', 'memLimit');
  collect('cpu_pressure', 'psi');
  const names = [...stats.keys()].sort((a, b) => {
    const ia = COMPONENTS.indexOf(a),
      ib = COMPONENTS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const head = h(
    'tr',
    {},
    ...[
      'Component',
      'CPU (cores)',
      'CPU peak',
      'Memory',
      'Memory peak',
      'Memory vs limit',
      'CPU wait',
    ].map((t, i) => h('th', { class: i && i !== 5 ? 'r' : '', text: t })),
  );
  const rows = names.map((n) => {
    const e = stats.get(n);
    const ratio = e.memLimit;
    const meter =
      ratio == null
        ? h('span', { class: 'muted', text: 'no limit' })
        : h(
            'div',
            { style: 'display:flex;align-items:center;gap:8px' },
            h(
              'div',
              {
                class:
                  'meter' +
                  (ratio > 0.9 ? ' crit' : ratio > 0.75 ? ' hot' : ''),
                style: 'flex:1',
                role: 'meter',
                'aria-valuenow': Math.round(ratio * 100),
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-label': n + ' memory vs limit',
              },
              h('div', { style: `width:${Math.min(100, ratio * 100)}%` }),
            ),
            h('span', { class: 'num', text: fmtUnit(ratio, 'ratio') }),
          );
    return h(
      'tr',
      {},
      h('td', { text: n }),
      h('td', { class: 'r', text: fmtUnit(e.cpu, 'cores') }),
      h('td', { class: 'r', text: fmtUnit(e.cpuPeak, 'cores') }),
      h('td', { class: 'r', text: fmtBytes(e.mem) }),
      h('td', { class: 'r', text: fmtBytes(e.memPeak) }),
      h('td', { class: 'bar' }, meter),
      h('td', {
        class: 'r',
        title: 'Seconds per second spent runnable but waiting for CPU (PSI)',
        text: fmtUnit(e.psi, 's/s'),
      }),
    );
  });
  table.replaceChildren(
    h('thead', {}, head),
    h(
      'tbody',
      {},
      ...(rows.length
        ? rows
        : [
            h(
              'tr',
              {},
              h('td', { colspan: 7, class: 'muted', text: 'No data' }),
            ),
          ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Errors & log
// ---------------------------------------------------------------------------
function renderErrors() {
  const table = $('#errors');
  const rows = (S.errors || []).map(([key, msg]) => {
    const [op, cls] = key.split(' ');
    return h(
      'tr',
      {},
      h('td', { text: op }),
      h('td', { class: 'err', text: cls }),
      h('td', { text: msg }),
    );
  });
  table.replaceChildren(
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { text: 'Operation' }),
        h('th', { text: 'Class' }),
        h('th', { text: 'Latest message' }),
      ),
    ),
    h(
      'tbody',
      {},
      ...(rows.length
        ? rows
        : [
            h(
              'tr',
              {},
              h('td', { colspan: 3, class: 'muted', text: 'No errors' }),
            ),
          ]),
    ),
  );
}
function renderLog() {
  const log = $('#log');
  log.replaceChildren(
    ...S.notes
      .slice()
      .reverse()
      .map((n) =>
        h(
          'div',
          { class: 'row' },
          h('span', { class: 't', text: new Date(n.t).toLocaleTimeString() }),
          h('span', { class: n.level, text: n.text }),
        ),
      ),
  );
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function onStatus(st) {
  const prevRun = S.status && S.status.runId;
  const prevState = S.status && S.status.state;
  S.status = st;
  if (!running() || !S.cfg) S.cfg = st.config;
  else S.cfg.scenarios = st.config.scenarios;
  if (st.runId && st.runId !== prevRun && st.state === 'running') {
    S.history = [];
    S.totals = null;
    resetClient();
    for (const c of platformCharts.values()) c.resetMembership();
  }
  renderHeader();
  renderBanners();
  renderScenarios();
  if (prevState !== st.state || !$('#settings').childElementCount)
    renderSettings();
  renderClientCharts();
}
function onTick(t) {
  const prev = S.history[S.history.length - 1];
  S.history.push(t);
  if (S.history.length > 7200) {
    S.history.shift();
    for (const k of [
      'rps',
      'p95',
      'errs',
      'arrivals',
      'inflight',
      'flows',
      'op',
    ])
      for (const arr of C[k].values()) arr.shift();
    C.xs.shift();
  }
  if (!S.selectedOp) {
    const primary = serverLabels()[0];
    if (primary && t.ops && t.ops['ALL@' + primary]) {
      S.selectedOp = 'ALL@' + primary;
      rebuildOpSeries();
    }
  }
  ingest(t, prev);
}
let frame = 0;
function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderHeader();
    renderKpis();
    updateScenarioStats();
    renderClientCharts();
    renderOps();
  });
}

async function bootstrap() {
  const b = await api('GET', '/api/bootstrap');
  S.scenarioInfo = b.scenarios;
  S.metricsEnabled = b.metricsEnabled;
  S.metrics = b.metrics;
  S.notes = b.notes || [];
  S.errors = b.errors || [];
  S.accounts = b.accounts;
  S.status = null;
  S.cfg = null;
  S.history = [];
  resetClient();
  buildClientCharts();
  onStatus(b.status);
  for (const t of b.history || []) onTick(t);
  if (S.status.state === 'finished') refreshTotals();
  updateScenarioStats();
  renderKpis();
  renderClientCharts();
  renderOps();
  renderPlatform();
  renderErrors();
  renderLog();
}
async function refreshTotals() {
  try {
    S.totals = await api('GET', '/api/summary');
    if (S.opsMode === 'total') renderOps();
  } catch {}
}
async function refreshErrors() {
  try {
    S.errors = await api('GET', '/api/errors');
    renderErrors();
  } catch {}
}

function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('open', () => {
    if (S.disconnected) {
      S.disconnected = false;
      bootstrap().catch((e) => toast(e.message));
    }
  });
  es.addEventListener('error', () => {
    if (!S.disconnected) {
      S.disconnected = true;
      renderBanners();
    }
  });
  es.addEventListener('tick', (e) => {
    onTick(JSON.parse(e.data));
    scheduleRender();
  });
  es.addEventListener('status', (e) => onStatus(JSON.parse(e.data)));
  es.addEventListener('metrics', (e) => {
    S.metrics = JSON.parse(e.data);
    renderPlatform();
    renderKpis();
    renderBanners();
  });
  es.addEventListener('note', (e) => {
    S.notes.push(JSON.parse(e.data));
    if (S.notes.length > 200) S.notes.shift();
    renderLog();
  });
}

$('#btn-start').addEventListener('click', async () => {
  try {
    onStatus(await api('POST', '/api/start', S.cfg));
  } catch (e) {
    toast(e.message);
  }
});
$('#btn-stop').addEventListener('click', () =>
  api('POST', '/api/stop').catch((e) => toast(e.message)),
);
$('#btn-pause').addEventListener('click', () =>
  api('POST', '/api/pause', { paused: !(S.status && S.status.paused) }).catch(
    (e) => toast(e.message),
  ),
);
for (const b of document.querySelectorAll('#window-seg button')) {
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('#window-seg button'))
      x.classList.toggle('on', x === b);
    S.window = +b.dataset.w;
    renderClientCharts();
  });
}
for (const b of document.querySelectorAll('#smooth-seg button')) {
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('#smooth-seg button'))
      x.classList.toggle('on', x === b);
    S.smooth = +b.dataset.s;
    renderClientCharts();
  });
}
for (const b of document.querySelectorAll('#ops-seg button')) {
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('#ops-seg button'))
      x.classList.toggle('on', x === b);
    S.opsMode = b.dataset.m;
    if (S.opsMode === 'total') refreshTotals();
    renderOps();
  });
}
setInterval(() => {
  if (running()) {
    refreshErrors();
    if (S.opsMode === 'total') refreshTotals();
  }
  renderHeader();
}, 5000);

bootstrap()
  .then(connect)
  .catch((e) => {
    toast('Failed to load: ' + e.message);
    connect();
  });
