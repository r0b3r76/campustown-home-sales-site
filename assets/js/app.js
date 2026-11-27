/* Near Campus: every number on the page is computed here, in the browser, from data/site_data.json.
   Rules (see the Data & methods section): price scope $10,000 to $5,000,000 inclusive unless a
   question says otherwise; days on market = contract date minus list date, only where both exist;
   medians unless a question asks for a mean; listing_id is the key, nothing deduplicated. */
(function () {
  'use strict';

  var LOW = 10000, HIGH = 5000000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var YEARS = [2023, 2024, 2025, 2026];
  var AREA_MAX = 10000, MILES_MAX = 15.5;

  var D, C, N, UNIS, PLACES, ALL = [], VALID = [];
  var map, mapLayers = {}, tileLayer;

  /* ---------------- helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim(); }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function median(arr) {
    var n = arr.length;
    if (!n) return null;
    var s = Float64Array.from(arr).sort();
    var h = n >> 1;
    return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  }
  function quantile(sorted, q) {
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function mean(arr) { var t = 0; for (var i = 0; i < arr.length; i++) t += arr[i]; return arr.length ? t / arr.length : null; }
  function sum(arr) { var t = 0; for (var i = 0; i < arr.length; i++) t += arr[i]; return t; }

  // Group the values valFn(i) of the given rows by a key column. Null values are skipped.
  function groupVals(rows, keyCol, K, valFn) {
    var g = [];
    for (var k = 0; k < K; k++) g.push([]);
    for (var j = 0; j < rows.length; j++) {
      var i = rows[j], v = valFn(i);
      if (v !== null && v !== undefined) g[keyCol[i]].push(v);
    }
    return g;
  }

  // All items tied for the best value (ties are reported, never broken).
  function best(items, val, highest) {
    var b = null;
    items.forEach(function (it) {
      var v = val(it);
      if (v === null) return;
      if (b === null || (highest ? v > b : v < b)) b = v;
    });
    return items.filter(function (it) { return val(it) === b; });
  }

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  var nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(v) { return v === null ? '—' : '$' + nf0.format(Math.round(v)); }
  function int(v) { return v === null ? '—' : nf0.format(v); }
  function one(v) { return v === null ? '—' : nf1.format(v); }
  function pct1(v, signed) { return v === null ? '—' : (signed && v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v)) + '%'; }
  function pct2(v) { return v === null ? '—' : nf2.format(v) + '%'; }
  function days(v) { return v === null ? '—' : nf1.format(v) + (v === 1 ? ' day' : ' days'); }
  function miles(v) { return v === null ? '—' : nf1.format(v) + (v === 1 ? ' mile' : ' miles'); }
  function moneyShort(v) {
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + v;
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function plural(n, word) { return int(n) + ' ' + word + (n === 1 ? '' : 's'); }
  function isNarrow() { return window.innerWidth < 600; }

  function table(head, rows, numCols) {
    numCols = numCols || [];
    var h = '<div class="table-wrap"><table class="data-table"><thead><tr>' + head.map(function (t, i) {
      return '<th scope="col"' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + t + '</th>';
    }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>' + r.map(function (c, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  /* ---------------- charts ---------------- */
  var charts = {};
  function theme() {
    return {
      ink: cssVar('ink'), muted: cssVar('muted'), line: cssVar('line'), grid: cssVar('grid'),
      surface: cssVar('surface'), quiet: cssVar('quiet'), accent: cssVar('accent'), blue: cssVar('blue'),
      font: cssVar('font-sans') || 'system-ui, sans-serif'
    };
  }
  function tip(T) {
    return {
      backgroundColor: T.surface, borderColor: T.line, borderWidth: 1, padding: [8, 12],
      textStyle: { color: T.ink, fontFamily: T.font, fontSize: 13 },
      extraCssText: 'border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.18);'
    };
  }
  function titleOpt(T, text, sub) {
    return {
      text: text, subtext: sub || '', left: 0, top: 0, itemGap: 6,
      textStyle: { color: T.ink, fontSize: 14, fontWeight: 600, fontFamily: T.font },
      subtextStyle: { color: T.muted, fontSize: 12, fontFamily: T.font }
    };
  }
  function axisStyle(T) {
    return {
      axisLine: { lineStyle: { color: T.line } }, axisTick: { show: false },
      axisLabel: { color: T.muted, fontFamily: T.font, fontSize: 12 },
      splitLine: { lineStyle: { color: T.grid } },
      nameTextStyle: { color: T.muted, fontFamily: T.font, fontSize: 12 }
    };
  }
  function drawChart(id, build, height) {
    var c = charts[id];
    var el = $(id);
    if (height) el.style.height = height + 'px';
    if (!c) {
      c = charts[id] = { inst: echarts.init(el, null, { renderer: 'svg' }) };
    } else {
      c.inst.resize();
    }
    c.build = build;
    c.inst.setOption(build(theme()), true);
  }
  function redrawAll() {
    Object.keys(charts).forEach(function (id) {
      var c = charts[id];
      c.inst.resize();
      c.inst.setOption(c.build(theme()), true);
    });
  }
  function emptyChart(T, title, msg) {
    return {
      title: titleOpt(T, title),
      graphic: { type: 'text', left: 'center', top: 'middle', style: { text: msg, fill: T.muted, fontSize: 14, fontFamily: T.font } }
    };
  }

  // Horizontal bars, one per category, top to bottom in the order given.
  function hbar(T, o) {
    var ax = axisStyle(T);
    return {
      textStyle: { fontFamily: T.font },
      title: titleOpt(T, o.title, o.sub),
      grid: { left: 4, right: o.right || 96, top: o.sub ? 58 : 38, bottom: 44, containLabel: true },
      tooltip: Object.assign(tip(T), { trigger: 'item', formatter: function (p) { return o.tip(p.dataIndex); } }),
      xAxis: Object.assign({}, ax, {
        type: 'value', name: o.xName, nameLocation: 'middle', nameGap: 28, min: o.xMin, max: o.xMax,
        axisLabel: Object.assign({}, ax.axisLabel, { formatter: o.xFmt })
      }),
      yAxis: Object.assign({}, ax, {
        type: 'category', inverse: true, data: o.cats, splitLine: { show: false },
        axisLabel: Object.assign({}, ax.axisLabel, { color: T.ink })
      }),
      series: [{
        type: 'bar', barWidth: '64%', cursor: 'default',
        data: o.values.map(function (v, i) {
          var neg = v < 0;
          return {
            value: v,
            itemStyle: { color: o.colors[i], borderRadius: neg ? [4, 0, 0, 4] : [0, 4, 4, 0] },
            label: { position: neg ? 'left' : 'right' }
          };
        }),
        label: { show: true, color: T.ink, fontFamily: T.font, fontSize: 12, formatter: function (p) { return o.label(p.dataIndex); } }
      }]
    };
  }

  // Lollipop: a thin stem from zero and a dot at the value.
  function lollipop(T, o) {
    var opt = hbar(T, o);
    opt.series = [
      { type: 'bar', barWidth: 2, silent: true, data: o.values.map(function (v, i) { return { value: v, itemStyle: { color: o.colors[i] } }; }) },
      {
        type: 'scatter', symbolSize: 12, cursor: 'default',
        data: o.values.map(function (v, i) {
          return { value: [v, i], itemStyle: { color: o.colors[i], borderColor: T.surface, borderWidth: 2 } };
        }),
        label: { show: true, position: 'right', distance: 8, color: T.ink, fontFamily: T.font, fontSize: 12, formatter: function (p) { return o.label(p.dataIndex); } }
      }
    ];
    opt.tooltip.formatter = function (p) { return o.tip(p.dataIndex); };
    return opt;
  }

  function barHeight(n) { return Math.max(220, n * 28 + 110); }

  /* ---------------- data ---------------- */
  function valid(i) { var p = C.p[i]; return p >= LOW && p <= HIGH; }
  function placeName(k) { return PLACES[k].name; }
  function uniName(k) { return UNIS[k].name; }
  function uniShort(k) { return UNIS[k].short; }

  /* ---------------- state & URL ---------------- */
  var DEFAULTS = {
    uni: -1, city: -1, year: 0, beds: 0,
    pmin: LOW, pmax: HIGH, amin: 0, amax: AREA_MAX, mmin: 0, mmax: MILES_MAX,
    g: 'any', bs: 'any', fp: 'any',
    cmpA: '', cmpB: '',
    q7b: 3, q8min: 200000, q8max: 400000, q9c: -1, q9y: 2025, q10u: -1, q10max: 300000, q10b: 3
  };
  var S = {};
  var sortState = { key: 'n', dir: 'desc' };

  function uniFromSlug(s) { for (var k = 0; k < UNIS.length; k++) if (slug(UNIS[k].short) === s) return k; return -1; }
  function placeFromSlug(s) { for (var k = 0; k < PLACES.length; k++) if (slug(PLACES[k].name) === s) return k; return -1; }
  function locToSlug(v) { if (!v) return ''; var p = v.split(':'); return p[0] === 'u' ? 'campus-' + slug(UNIS[+p[1]].short) : slug(PLACES[+p[1]].name); }
  function locFromSlug(s) {
    if (!s) return '';
    if (s.indexOf('campus-') === 0) { var u = uniFromSlug(s.slice(7)); return u >= 0 ? 'u:' + u : ''; }
    var c = placeFromSlug(s); return c >= 0 ? 'c:' + c : '';
  }

  function readURL() {
    var q = new URLSearchParams(location.search);
    function num(key, lo, hi) {
      if (!q.has(key)) return null;
      var v = Number(q.get(key));
      return isFinite(v) && v >= lo && v <= hi ? v : null;
    }
    function set(key, v) { if (v !== null && v !== undefined) S[key] = v; }
    if (q.has('campus')) { var u = uniFromSlug(q.get('campus')); if (u >= 0) S.uni = u; }
    if (q.has('city')) { var c = placeFromSlug(q.get('city')); if (c >= 0) S.city = c; }
    var y = num('year', 2023, 2026); if (y) S.year = y;
    var b = num('beds', 1, 6); if (b) S.beds = b;
    set('pmin', num('pmin', LOW, HIGH)); set('pmax', num('pmax', LOW, HIGH));
    set('amin', num('amin', 0, AREA_MAX)); set('amax', num('amax', 0, AREA_MAX));
    set('mmin', num('mmin', 0, MILES_MAX)); set('mmax', num('mmax', 0, MILES_MAX));
    ['g', 'bs', 'fp'].forEach(function (k) { var v = q.get(k); if (['yes', 'no', 'unknown'].indexOf(v) >= 0) S[k] = v; });
    if (q.has('a')) S.cmpA = locFromSlug(q.get('a')) || S.cmpA;
    if (q.has('b')) S.cmpB = locFromSlug(q.get('b')) || S.cmpB;
    set('q7b', num('q7beds', 0, 99));
    set('q8min', num('q8min', 0, 1e9)); set('q8max', num('q8max', 0, 1e9));
    if (q.has('q9city')) { var c9 = placeFromSlug(q.get('q9city')); if (c9 >= 0) S.q9c = c9; }
    set('q9y', num('q9year', 2023, 2026));
    if (q.has('q10campus')) { var u10 = uniFromSlug(q.get('q10campus')); if (u10 >= 0) S.q10u = u10; }
    set('q10max', num('q10max', 0, 1e9)); set('q10b', num('q10beds', 0, 99));
    if (S.pmin > S.pmax) { var t = S.pmin; S.pmin = S.pmax; S.pmax = t; }
    if (S.amin > S.amax) { var t2 = S.amin; S.amin = S.amax; S.amax = t2; }
    if (S.mmin > S.mmax) { var t3 = S.mmin; S.mmin = S.mmax; S.mmax = t3; }
    if (S.city >= 0 && S.uni >= 0 && PLACES[S.city].uni !== S.uni) S.city = -1;
  }

  var urlTimer = null;
  function writeURL() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      var q = new URLSearchParams();
      if (S.uni >= 0) q.set('campus', slug(UNIS[S.uni].short));
      if (S.city >= 0) q.set('city', slug(PLACES[S.city].name));
      if (S.year) q.set('year', S.year);
      if (S.beds) q.set('beds', S.beds);
      ['pmin', 'pmax', 'amin', 'amax', 'mmin', 'mmax'].forEach(function (k) { if (S[k] !== DEFAULTS[k]) q.set(k, S[k]); });
      ['g', 'bs', 'fp'].forEach(function (k) { if (S[k] !== 'any') q.set(k, S[k]); });
      if (S.cmpA !== DEFAULTS.cmpA) q.set('a', locToSlug(S.cmpA));
      if (S.cmpB !== DEFAULTS.cmpB) q.set('b', locToSlug(S.cmpB));
      if (S.q7b !== DEFAULTS.q7b) q.set('q7beds', S.q7b);
      if (S.q8min !== DEFAULTS.q8min) q.set('q8min', S.q8min);
      if (S.q8max !== DEFAULTS.q8max) q.set('q8max', S.q8max);
      if (S.q9c !== DEFAULTS.q9c) q.set('q9city', slug(PLACES[S.q9c].name));
      if (S.q9y !== DEFAULTS.q9y) q.set('q9year', S.q9y);
      if (S.q10u !== DEFAULTS.q10u) q.set('q10campus', slug(UNIS[S.q10u].short));
      if (S.q10max !== DEFAULTS.q10max) q.set('q10max', S.q10max);
      if (S.q10b !== DEFAULTS.q10b) q.set('q10beds', S.q10b);
      var qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }, 150);
  }

  /* ---------------- hero ---------------- */
  function renderHero() {
    var prices = VALID.map(function (i) { return C.p[i]; });
    var dom = [];
    VALID.forEach(function (i) { if (C.dom[i] !== null) dom.push(C.dom[i]); });
    var stats = [
      [int(N), 'home sales'],
      [money(median(prices)), 'median sale price'],
      [days(median(dom)), 'median days on market'],
      ['11 · 18', 'campus areas · cities']
    ];
    $('hero-stats').innerHTML = stats.map(function (s) {
      return '<div class="hero-stat"><span class="hero-value">' + s[0] + '</span><span class="hero-label">' + s[1] + '</span></div>';
    }).join('');
  }

  /* ================= QUESTIONS 1–6 (full dataset) ================= */
  function q1() {
    var g = groupVals(VALID, C.c, PLACES.length, function (i) { return C.p[i]; });
    var items = PLACES.map(function (p, k) { return { k: k, name: p.name, med: median(g[k]), n: g[k].length }; })
      .sort(function (a, b) { return b.med - a.med; });
    var top = best(items, function (it) { return it.med; }, true);
    var low = best(items, function (it) { return it.med; }, false);
    var topK = top.map(function (t) { return t.k; });
    $('a1').innerHTML = '<strong>' + joinNames(top.map(function (t) { return t.name; })) + '</strong> ' + (top.length > 1 ? 'tie for' : 'has') +
      ' the highest median sale price, <strong>' + money(top[0].med) + '</strong>, from ' + plural(top[0].n, 'sale') + '. ' +
      items[1].name + ' is next at ' + money(items[1].med) + '. The lowest is ' + joinNames(low.map(function (t) { return t.name; })) + ' at ' + money(low[0].med) + '.';
    drawChart('chart-q1', function (T) {
      return hbar(T, {
        title: 'Median sale price by city', sub: 'Sales from $10,000 to $5,000,000',
        cats: items.map(function (it) { return it.name; }), values: items.map(function (it) { return it.med; }),
        colors: items.map(function (it) { return topK.indexOf(it.k) >= 0 ? T.accent : T.quiet; }),
        xName: 'Median sale price', xFmt: moneyShort,
        label: function (i) { return money(items[i].med); },
        tip: function (i) { return '<b>' + items[i].name + '</b><br>Median ' + money(items[i].med) + '<br>' + plural(items[i].n, 'sale'); }
      });
    }, barHeight(items.length));
    $('t1').innerHTML = table(['City', 'Median sale price', 'Sales'], items.map(function (it) { return [it.name, money(it.med), int(it.n)]; }), [1, 2]);
    return items;
  }

  function q2() {
    var g = groupVals(ALL, C.c, PLACES.length, function (i) { return C.p[i]; });
    var items = PLACES.map(function (p, k) {
      var me = mean(g[k]), md = median(g[k]);
      return { k: k, name: p.name, mean: me, med: md, gap: (me - md) / md * 100, n: g[k].length };
    }).sort(function (a, b) { return b.gap - a.gap; });
    var top = best(items, function (it) { return it.gap; }, true);
    var t = top[0];
    // What causes the gap: the city's single largest sale, and the gap without it.
    var rows = ALL.filter(function (i) { return C.c[i] === t.k; });
    var maxI = rows.reduce(function (a, i) { return C.p[i] > C.p[a] ? i : a; }, rows[0]);
    var rest = rows.filter(function (i) { return i !== maxI; }).map(function (i) { return C.p[i]; });
    var gapWithout = (mean(rest) - median(rest)) / median(rest) * 100;
    var rankWithout = items.filter(function (it) { return it.k !== t.k && it.gap > gapWithout; }).length + 1;
    var topK = top.map(function (x) { return x.k; });
    $('a2').innerHTML = '<strong>' + joinNames(top.map(function (x) { return x.name; })) + '</strong>: the mean of all ' + int(t.n) + ' sales is <strong>' + money(t.mean) +
      '</strong>, <strong>' + pct1(t.gap) + '</strong> above the median of <strong>' + money(t.med) + '</strong>. ' +
      'The gap comes from a long upper tail. One sale of <strong>' + money(C.p[maxI]) + '</strong>, recorded with ' + int(C.a[maxI]) +
      ' sq ft of living area (far beyond any house, so most likely a large multi-unit property), adds about ' + money(t.mean - mean(rest)) +
      ' to the mean on its own. A median ignores it. Without that one sale, the gap would be ' + pct1(gapWithout) + ', ' + ordinal(rankWithout) + ' highest.';
    drawChart('chart-q2', function (T) {
      var opt = hbar(T, {
        title: 'Mean and median sale price by city, all rows', sub: 'Labels show how far the mean is above the median',
        cats: items.map(function (it) { return it.name; }), values: items.map(function (it) { return it.med; }),
        colors: items.map(function () { return 'transparent'; }), right: 70,
        xName: 'Sale price', xFmt: moneyShort, label: function () { return ''; },
        tip: function (i) { var it = items[i]; return '<b>' + it.name + '</b><br>Mean ' + money(it.mean) + '<br>Median ' + money(it.med) + '<br>Gap ' + pct1(it.gap) + ' of the median'; }
      });
      opt.legend = { top: 0, right: 0, textStyle: { color: T.muted, fontFamily: T.font }, itemWidth: 10, itemHeight: 10, data: ['Median', 'Mean'] };
      opt.series = [
        { type: 'bar', stack: 'd', silent: true, barWidth: 2, data: items.map(function (it) { return it.med; }), itemStyle: { color: 'transparent' } },
        { type: 'bar', stack: 'd', silent: true, barWidth: 2, data: items.map(function (it) { return it.mean - it.med; }), itemStyle: { color: T.quiet } },
        { name: 'Median', type: 'scatter', symbolSize: 11, data: items.map(function (it, i) { return [it.med, i]; }), itemStyle: { color: T.muted, borderColor: T.surface, borderWidth: 2 } },
        {
          name: 'Mean', type: 'scatter', symbolSize: 11,
          data: items.map(function (it, i) { return { value: [it.mean, i], itemStyle: { color: topK.indexOf(it.k) >= 0 ? T.accent : T.blue } }; }),
          itemStyle: { color: T.blue, borderColor: T.surface, borderWidth: 2 },
          label: { show: true, position: 'right', distance: 8, color: T.ink, fontSize: 12, fontFamily: T.font, formatter: function (p) { return pct1(items[p.dataIndex].gap, true); } }
        }
      ];
      opt.tooltip.formatter = function (p) { var it = items[p.dataIndex]; return '<b>' + it.name + '</b><br>Mean ' + money(it.mean) + '<br>Median ' + money(it.med) + '<br>Gap ' + pct1(it.gap) + ' of the median'; };
      opt.xAxis.min = 0;
      return opt;
    }, barHeight(items.length));
    $('t2').innerHTML = table(['City', 'Mean', 'Median', 'Gap (% of median)', 'Sales'],
      items.map(function (it) { return [it.name, money(it.mean), money(it.med), pct1(it.gap), int(it.n)]; }), [1, 2, 3, 4]);
    return items;
  }

  function rankDesc(items, key) {
    items.forEach(function (it) {
      it[key + 'Rank'] = 1 + items.filter(function (o) { return o[key] > it[key]; }).length;
    });
  }

  function q3() {
    var gAll = groupVals(ALL, C.c, PLACES.length, function (i) { return C.p[i]; });
    var gVal = groupVals(VALID, C.c, PLACES.length, function (i) { return C.p[i]; });
    var items = PLACES.map(function (p, k) { return { k: k, name: p.name, all: mean(gAll[k]), val: mean(gVal[k]) }; });
    rankDesc(items, 'all'); rankDesc(items, 'val');
    items.forEach(function (it) { it.move = it.allRank - it.valRank; }); // positive = moved up
    items.sort(function (a, b) { return a.valRank - b.valRank; });
    var moved = items.filter(function (it) { return it.move !== 0; }).sort(function (a, b) { return Math.abs(b.move) - Math.abs(a.move) || a.valRank - b.valRank; });
    var parts = moved.map(function (it) {
      return '<strong>' + it.name + '</strong> ' + (it.move > 0 ? 'rises ' : 'falls ') + plural(Math.abs(it.move), 'place') +
        ' (' + ordinal(it.allRank) + ' to ' + ordinal(it.valRank) + ')';
    });
    var down = moved.filter(function (m) { return m.move < 0; });
    var why = down.length ? ' ' + joinNames(down.map(function (m) { return m.name; })) + (down.length > 1 ? ' fall' : ' falls') +
      ' because the rule removes very large sales above $5,000,000 that had lifted ' + (down.length > 1 ? 'their' : 'its') + ' all-rows mean; the cities around ' +
      (down.length > 1 ? 'them' : 'it') + ' move up without their own means changing much.' : '';
    $('a3').innerHTML = moved.length
      ? '<strong>' + moved.length + ' ' + (moved.length === 1 ? 'city changes' : 'cities change') + ' rank</strong> when the price rule is applied: ' + joinNames(parts) +
        '. The other ' + (items.length - moved.length) + ' keep their rank.' + why
      : 'No city changes rank when the price rule is applied.';
    drawChart('chart-q3', function (T) {
      var narrow = isNarrow();
      var series = items.map(function (it) {
        var col = it.move > 0 ? T.blue : it.move < 0 ? T.accent : T.quiet;
        var w = it.move ? 3 : 1.5;
        return {
          type: 'line', name: it.name, data: [it.allRank, it.valRank], symbol: 'circle', symbolSize: it.move ? 9 : 6,
          lineStyle: { color: col, width: w }, itemStyle: { color: col, borderColor: T.surface, borderWidth: 1.5 },
          z: it.move ? 3 : 2, emphasis: { focus: 'series' },
          label: {
            show: true, fontFamily: T.font, fontSize: 12, color: it.move ? T.ink : T.muted, fontWeight: it.move ? 600 : 400,
            formatter: function (p) {
              if (p.dataIndex === 0) return (narrow ? '' : it.name + '  ') + it.allRank;
              return it.valRank + (narrow ? '' : '  ' + it.name) + (it.move ? (it.move > 0 ? '  ▲' : '  ▼') + Math.abs(it.move) : '');
            },
            position: [0, 0]
          },
          labelLayout: function (p) { return { x: p.dataIndex === 0 ? p.rect.x - 8 : p.rect.x + p.rect.width + 8, align: p.dataIndex === 0 ? 'right' : 'left' }; }
        };
      });
      series.forEach(function (s) { s.label.position = 'inside'; });
      var ax = axisStyle(T);
      return {
        textStyle: { fontFamily: T.font },
        title: titleOpt(T, 'Rank by mean sale price, all rows vs. price rule', 'Rank 1 is the highest mean. Blue moved up, coral moved down.'),
        grid: { left: narrow ? 36 : 170, right: narrow ? 56 : 190, top: 92, bottom: 16 },
        tooltip: Object.assign(tip(T), {
          trigger: 'item', formatter: function (p) {
            var it = items.filter(function (x) { return x.name === p.seriesName; })[0];
            return '<b>' + it.name + '</b><br>All rows: ' + ordinal(it.allRank) + ', mean ' + money(it.all) + '<br>Price rule: ' + ordinal(it.valRank) + ', mean ' + money(it.val);
          }
        }),
        xAxis: Object.assign({}, ax, { type: 'category', position: 'top', boundaryGap: false, data: ['All rows', '$10K–$5M only'], axisLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { color: T.ink, fontWeight: 600, margin: 14 }) }),
        yAxis: { type: 'value', inverse: true, min: 1, max: items.length, show: false },
        series: series
      };
    }, Math.max(420, items.length * 26 + 120));
    $('t3').innerHTML = table(['City', 'Mean, all rows', 'Rank', 'Mean, price rule', 'Rank', 'Change'],
      items.map(function (it) { return [it.name, money(it.all), it.allRank, money(it.val), it.valRank, it.move ? (it.move > 0 ? 'Up ' : 'Down ') + Math.abs(it.move) : 'No change']; }), [1, 2, 3, 4]);
    return items;
  }

  function q4() {
    var y24 = VALID.filter(function (i) { return C.ym[i] !== null && Math.floor(C.ym[i] / 100) === 2024; });
    var y25 = VALID.filter(function (i) { return C.ym[i] !== null && Math.floor(C.ym[i] / 100) === 2025; });
    var g24 = groupVals(y24, C.u, UNIS.length, function (i) { return C.p[i]; });
    var g25 = groupVals(y25, C.u, UNIS.length, function (i) { return C.p[i]; });
    var items = UNIS.map(function (u, k) {
      var a = median(g24[k]), b = median(g25[k]);
      return { k: k, name: u.name, short: u.short, m24: a, m25: b, chg: (b - a) / a * 100, n24: g24[k].length, n25: g25[k].length };
    }).sort(function (a, b) { return b.chg - a.chg; });
    var top = best(items, function (it) { return it.chg; }, true);
    var dec = items.filter(function (it) { return it.chg < 0; }).sort(function (a, b) { return a.chg - b.chg; });
    var topK = top.map(function (t) { return t.k; });
    $('a4').innerHTML = '<strong>' + joinNames(top.map(function (t) { return t.name; })) + '</strong> had the largest increase, <strong>' + pct1(top[0].chg, true) +
      '</strong> (median ' + money(top[0].m24) + ' in 2024 to ' + money(top[0].m25) + ' in 2025). ' +
      (dec.length ? '<strong>' + dec.length + (dec.length === 1 ? ' campus area' : ' campus areas') + ' had a decrease</strong>: ' + joinNames(dec.map(function (d) {
        return '<strong>' + d.name + '</strong> (' + pct1(d.chg, true) + ', ' + money(d.m24) + ' to ' + money(d.m25) + ')';
      })) + '. The other ' + (items.length - dec.length) + ' rose.' : 'No campus area had a decrease.');
    drawChart('chart-q4', function (T) {
      return hbar(T, {
        title: 'Change in median sale price, 2024 to 2025', sub: 'By campus area, sales from $10,000 to $5,000,000',
        cats: items.map(function (it) { return it.short; }), values: items.map(function (it) { return +it.chg.toFixed(4); }),
        colors: items.map(function (it) { return it.chg < 0 ? T.accent : topK.indexOf(it.k) >= 0 ? T.blue : T.quiet; }), right: 60,
        xName: 'Percent change in median sale price', xFmt: function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%'; },
        label: function (i) { return pct1(items[i].chg, true); },
        tip: function (i) { var it = items[i]; return '<b>' + it.name + '</b><br>2024 median ' + money(it.m24) + ' (' + int(it.n24) + ' sales)<br>2025 median ' + money(it.m25) + ' (' + int(it.n25) + ' sales)<br>Change ' + pct1(it.chg, true); }
      });
    }, barHeight(items.length));
    $('t4').innerHTML = table(['Campus area', '2024 median', '2025 median', 'Change'],
      items.map(function (it) { return [it.name, money(it.m24), money(it.m25), pct1(it.chg, true)]; }), [1, 2, 3]);
    return items;
  }

  function q5() {
    var g = groupVals(VALID, C.u, UNIS.length, function (i) { return C.dom[i]; });
    var items = UNIS.map(function (u, k) {
      var s = Float64Array.from(g[k]).sort();
      return {
        k: k, name: u.name, short: u.short, n: s.length, med: median(g[k]),
        p10: quantile(s, 0.1), q1: quantile(s, 0.25), q3: quantile(s, 0.75), p90: quantile(s, 0.9)
      };
    }).sort(function (a, b) { return a.med - b.med || a.short.localeCompare(b.short); });
    var slow = best(items, function (it) { return it.med; }, true);
    var fast = best(items, function (it) { return it.med; }, false);
    var slowK = slow.map(function (t) { return t.k; }), fastK = fast.map(function (t) { return t.k; });
    $('a5').innerHTML = 'Slowest: <strong>' + joinNames(slow.map(function (t) { return t.name; })) + '</strong>, with a median of <strong>' + days(slow[0].med) + '</strong> on market. ' +
      'Fastest: ' + (fast.length > 1 ? 'a ' + fast.length + '-way tie between ' : '') + '<strong>' + joinNames(fast.map(function (t) { return t.name; })) + '</strong>, at <strong>' + days(fast[0].med) + '</strong>' +
      (fast.length > 1 ? ' each' : '') + '. Medians use the ' + int(sum(items.map(function (it) { return it.n; }))) + ' sales with both a list date and a contract date.';
    drawChart('chart-q5', function (T) {
      var ax = axisStyle(T);
      var col = function (it) { return slowK.indexOf(it.k) >= 0 ? T.accent : fastK.indexOf(it.k) >= 0 ? T.blue : T.muted; };
      return {
        textStyle: { fontFamily: T.font },
        title: titleOpt(T, 'Days on market by campus area', 'Box = middle half of sales, whiskers = 10th to 90th percentile, line = median'),
        grid: { left: 4, right: 70, top: 58, bottom: 44, containLabel: true },
        tooltip: Object.assign(tip(T), {
          trigger: 'item', formatter: function (p) {
            var it = items[p.dataIndex];
            return '<b>' + it.name + '</b><br>Median ' + days(it.med) + '<br>Middle half ' + one(it.q1) + ' to ' + one(it.q3) + ' days<br>10th–90th percentile ' + one(it.p10) + ' to ' + one(it.p90) + ' days<br>' + plural(it.n, 'sale');
          }
        }),
        xAxis: Object.assign({}, ax, { type: 'value', name: 'Days from listing to contract', nameLocation: 'middle', nameGap: 28, min: 0 }),
        yAxis: Object.assign({}, ax, { type: 'category', inverse: true, data: items.map(function (it) { return it.short; }), splitLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { color: T.ink }) }),
        series: [
          {
            type: 'boxplot', boxWidth: [8, 16],
            data: items.map(function (it) {
              var c = col(it);
              return { value: [it.p10, it.q1, it.med, it.q3, it.p90], itemStyle: { color: T.surface, borderColor: c, borderWidth: 2 } };
            })
          },
          {
            type: 'scatter', symbolSize: 1, silent: true, data: items.map(function (it, i) { return [it.p90, i]; }),
            itemStyle: { color: 'transparent' },
            label: { show: true, position: 'right', distance: 8, color: T.ink, fontSize: 12, fontFamily: T.font, formatter: function (p) { return one(items[p.dataIndex].med) + ' days'; } }
          }
        ]
      };
    }, barHeight(items.length));
    $('t5').innerHTML = table(['Campus area', 'Median days on market', 'Sales used'], items.map(function (it) { return [it.name, one(it.med), int(it.n)]; }), [1, 2]);
    return items;
  }

  function q6() {
    var rows = VALID.filter(function (i) { var t = C.tx[i]; return t !== null && t > 0 && t < 0.1 * C.p[i]; });
    var gt = groupVals(rows, C.u, UNIS.length, function (i) { return C.tx[i]; });
    var gp = groupVals(rows, C.u, UNIS.length, function (i) { return C.p[i]; });
    var items = UNIS.map(function (u, k) {
      var t = sum(gt[k]), p = sum(gp[k]);
      return { k: k, name: u.name, short: u.short, tax: t, price: p, rate: t / p * 100, n: gt[k].length };
    }).sort(function (a, b) { return b.rate - a.rate; });
    var hi = best(items, function (it) { return it.rate; }, true), lo = best(items, function (it) { return it.rate; }, false);
    var hiK = hi.map(function (t) { return t.k; }), loK = lo.map(function (t) { return t.k; });
    $('a6').innerHTML = 'Highest tax burden: <strong>' + joinNames(hi.map(function (t) { return t.name; })) + '</strong>, where annual property tax totals <strong>' + pct2(hi[0].rate) +
      '</strong> of total sale prices. Lowest: <strong>' + joinNames(lo.map(function (t) { return t.name; })) + '</strong>, at <strong>' + pct2(lo[0].rate) + '</strong>. ' +
      'On a ' + money(300000) + ' home, that is roughly ' + money(3000 * hi[0].rate) + ' a year against ' + money(3000 * lo[0].rate) + '. Uses ' + int(rows.length) +
      ' sales with a tax amount above $0 and below 10% of the sale price.';
    drawChart('chart-q6', function (T) {
      return lollipop(T, {
        title: 'Annual property tax as a percent of sale price', sub: 'Total tax ÷ total sale price, by campus area',
        cats: items.map(function (it) { return it.short; }), values: items.map(function (it) { return it.rate; }),
        colors: items.map(function (it) { return hiK.indexOf(it.k) >= 0 ? T.accent : loK.indexOf(it.k) >= 0 ? T.blue : T.muted; }), right: 64,
        xName: 'Tax as % of sale price', xFmt: function (v) { return v + '%'; }, xMin: 0,
        label: function (i) { return pct2(items[i].rate); },
        tip: function (i) { var it = items[i]; return '<b>' + it.name + '</b><br>Total tax ' + money(it.tax) + '<br>Total sale price ' + money(it.price) + '<br>Rate ' + pct2(it.rate) + '<br>' + plural(it.n, 'sale'); }
      });
    }, barHeight(items.length));
    $('t6').innerHTML = table(['Campus area', 'Total annual tax', 'Total sale price', 'Tax as % of price', 'Sales'],
      items.map(function (it) { return [it.name, money(it.tax), money(it.price), pct2(it.rate), int(it.n)]; }), [1, 2, 3, 4]);
    return items;
  }

  /* ================= QUESTIONS 7–10 (visitor settings) ================= */
  function noSalesNote(list) {
    return list.length ? ' No sales for ' + joinNames(list) + '.' : '';
  }

  function q7() {
    var b = S.q7b;
    if (!(b >= 1) || Math.floor(b) !== b) {
      $('a7').innerHTML = '<span class="warn">Enter a whole number of bedrooms, 1 or more.</span>';
      drawChart('chart-q7', function (T) { return emptyChart(T, 'Median sale price by city', 'Enter a number of bedrooms'); }, 240);
      $('t7').innerHTML = ''; return null;
    }
    var rows = VALID.filter(function (i) { return C.b[i] === b; });
    var g = groupVals(rows, C.c, PLACES.length, function (i) { return C.p[i]; });
    var items = PLACES.map(function (p, k) { return { k: k, name: p.name, med: median(g[k]), n: g[k].length }; });
    var none = items.filter(function (it) { return !it.n; }).map(function (it) { return it.name; });
    items = items.filter(function (it) { return it.n; }).sort(function (a, b2) { return a.med - b2.med || a.name.localeCompare(b2.name); });
    if (!items.length) {
      $('a7').innerHTML = '<span class="warn">No sales have exactly ' + plural(b, 'bedroom') + '. Try a number from 1 to 6.</span>';
      drawChart('chart-q7', function (T) { return emptyChart(T, 'Median sale price by city', 'No sales match'); }, 240);
      $('t7').innerHTML = ''; return [];
    }
    var low = best(items, function (it) { return it.med; }, false), lowK = low.map(function (t) { return t.k; });
    $('a7').innerHTML = 'For homes with exactly <strong>' + plural(b, 'bedroom') + '</strong>, <strong>' + joinNames(low.map(function (t) { return t.name; })) + '</strong> ' +
      (low.length > 1 ? 'tie for' : 'has') + ' the lowest median sale price, <strong>' + money(low[0].med) + '</strong> (' +
      low.map(function (t) { return plural(t.n, 'sale'); }).join(', ') + '). ' + int(items.length) + (items.length === 1 ? ' city' : ' cities') + ' had sales at this size.' + noSalesNote(none);
    drawChart('chart-q7', function (T) {
      return hbar(T, {
        title: 'Median sale price by city, ' + b + '-bedroom homes', sub: 'Label: median price · number of sales',
        cats: items.map(function (it) { return it.name; }), values: items.map(function (it) { return it.med; }),
        colors: items.map(function (it) { return lowK.indexOf(it.k) >= 0 ? T.accent : T.quiet; }), right: 150,
        xName: 'Median sale price', xFmt: moneyShort,
        label: function (i) { return money(items[i].med) + ' · ' + int(items[i].n); },
        tip: function (i) { return '<b>' + items[i].name + '</b><br>Median ' + money(items[i].med) + '<br>' + plural(items[i].n, 'sale'); }
      });
    }, barHeight(items.length));
    $('t7').innerHTML = table(['City', 'Median sale price', 'Sales'], items.map(function (it) { return [it.name, money(it.med), int(it.n)]; }), [1, 2]);
    return items;
  }

  function q8() {
    var lo = S.q8min, hi = S.q8max;
    if (lo === null || hi === null || !isFinite(lo) || !isFinite(hi) || lo < 0 || hi < 0) {
      $('a8').innerHTML = '<span class="warn">Enter a minimum and a maximum price.</span>';
      drawChart('chart-q8', function (T) { return emptyChart(T, 'Median days on market by city', 'Enter a price range'); }, 240);
      $('t8').innerHTML = ''; return null;
    }
    if (lo > hi) {
      $('a8').innerHTML = '<span class="warn">The minimum is above the maximum. Swap them or change one.</span>';
      drawChart('chart-q8', function (T) { return emptyChart(T, 'Median days on market by city', 'Minimum is above maximum'); }, 240);
      $('t8').innerHTML = ''; return null;
    }
    var eLo = Math.max(lo, LOW), eHi = Math.min(hi, HIGH);
    var rows = VALID.filter(function (i) { return C.dom[i] !== null && C.p[i] >= eLo && C.p[i] <= eHi; });
    var g = groupVals(rows, C.c, PLACES.length, function (i) { return C.dom[i]; });
    var items = PLACES.map(function (p, k) { return { k: k, name: p.name, med: median(g[k]), n: g[k].length }; });
    var none = items.filter(function (it) { return !it.n; }).map(function (it) { return it.name; });
    items = items.filter(function (it) { return it.n; }).sort(function (a, b) { return a.med - b.med || a.name.localeCompare(b.name); });
    var scopeNote = (lo < LOW || hi > HIGH) ? ' The price scope still applies, so only sales from ' + money(eLo) + ' to ' + money(eHi) + ' count.' : '';
    if (!items.length) {
      $('a8').innerHTML = '<span class="warn">No sales with days on market fall between ' + money(lo) + ' and ' + money(hi) + '.</span>' + scopeNote;
      drawChart('chart-q8', function (T) { return emptyChart(T, 'Median days on market by city', 'No sales match'); }, 240);
      $('t8').innerHTML = ''; return [];
    }
    var fast = best(items, function (it) { return it.med; }, false), fastK = fast.map(function (t) { return t.k; });
    $('a8').innerHTML = 'From <strong>' + money(lo) + '</strong> to <strong>' + money(hi) + '</strong>, ' + (fast.length > 1 ? 'a ' + fast.length + '-way tie: ' : '') +
      '<strong>' + joinNames(fast.map(function (t) { return t.name; })) + '</strong> ' + (fast.length > 1 ? 'share' : 'has') + ' the shortest median days on market, <strong>' + days(fast[0].med) + '</strong> (' +
      fast.map(function (t) { return (fast.length > 1 ? t.name + ': ' : '') + plural(t.n, 'sale'); }).join('; ') + ').' + scopeNote + noSalesNote(none) +
      ' Based on ' + plural(rows.length, 'sale') + ' with both a list and a contract date.';
    drawChart('chart-q8', function (T) {
      return lollipop(T, {
        title: 'Median days on market by city, ' + moneyShort(lo) + ' to ' + moneyShort(hi), sub: 'Label: median days · number of sales',
        cats: items.map(function (it) { return it.name; }), values: items.map(function (it) { return it.med; }),
        colors: items.map(function (it) { return fastK.indexOf(it.k) >= 0 ? T.accent : T.muted; }), right: 120, xMin: 0,
        xName: 'Median days from listing to contract', xFmt: function (v) { return v; },
        label: function (i) { return one(items[i].med) + ' · ' + int(items[i].n); },
        tip: function (i) { return '<b>' + items[i].name + '</b><br>Median ' + days(items[i].med) + '<br>' + plural(items[i].n, 'sale'); }
      });
    }, barHeight(items.length));
    $('t8').innerHTML = table(['City', 'Median days on market', 'Sales used'], items.map(function (it) { return [it.name, one(it.med), int(it.n)]; }), [1, 2]);
    return items;
  }

  function q9() {
    var c = S.q9c, y = S.q9y;
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    ALL.forEach(function (i) {
      var ym = C.ym[i];
      if (ym !== null && C.c[i] === c && Math.floor(ym / 100) === y) counts[ym % 100 - 1]++;
    });
    var total = sum(counts);
    var name = PLACES[c].name;
    var partial = y === 2023 ? ' Sales in the dataset begin on March 27, 2023, so January and February have none.' : y === 2026 ? ' Sales in the dataset end on March 25, 2026, so April to December have none.' : '';
    if (!total) {
      $('a9').innerHTML = '<span class="warn">No sales were recorded in ' + name + ' in ' + y + '.</span>' + partial;
    } else {
      var mx = Math.max.apply(null, counts);
      var top = counts.map(function (v, m) { return v === mx ? MONTHS_LONG[m] : null; }).filter(Boolean);
      $('a9').innerHTML = name + ' recorded <strong>' + plural(total, 'sale') + '</strong> in ' + y + '. The busiest month was <strong>' + joinNames(top) + '</strong>, with <strong>' +
        plural(mx, 'sale') + '</strong>' + (top.length > 1 ? ' each' : '') + '. Counts use every row with a sale date, with no price rule.' + partial;
    }
    var mx2 = Math.max.apply(null, counts);
    drawChart('chart-q9', function (T) {
      var ax = axisStyle(T);
      return {
        textStyle: { fontFamily: T.font },
        title: titleOpt(T, 'Sales by month, ' + name + ', ' + y, 'All rows with a sale date'),
        grid: { left: 16, right: 8, top: 62, bottom: 36, containLabel: true },
        tooltip: Object.assign(tip(T), { trigger: 'item', formatter: function (p) { return '<b>' + MONTHS_LONG[p.dataIndex] + ' ' + y + '</b><br>' + plural(counts[p.dataIndex], 'sale'); } }),
        xAxis: Object.assign({}, ax, { type: 'category', data: MONTHS, name: 'Month of sale', nameLocation: 'middle', nameGap: 26, axisLabel: Object.assign({}, ax.axisLabel, { interval: 0 }) }),
        yAxis: Object.assign({}, ax, { type: 'value', name: 'Sales', nameLocation: 'middle', nameGap: 40, minInterval: 1 }),
        series: [{
          type: 'bar', barWidth: '62%', cursor: 'default',
          data: counts.map(function (v) { return { value: v, itemStyle: { color: v === mx2 && v > 0 ? T.accent : T.quiet, borderRadius: [4, 4, 0, 0] } }; }),
          label: { show: true, position: 'top', color: T.ink, fontSize: 12, fontFamily: T.font }
        }]
      };
    });
    $('t9').innerHTML = table(['Month', 'Sales'], counts.map(function (v, m) { return [MONTHS_LONG[m], int(v)]; }), [1]);
    return counts;
  }

  function q10() {
    var u = S.q10u, budget = S.q10max, minB = S.q10b;
    var title = 'Distance to campus of qualifying sales';
    if (budget === null || !isFinite(budget) || minB === null || !isFinite(minB)) {
      $('a10').innerHTML = '<span class="warn">Enter a maximum budget and a minimum number of bedrooms.</span>';
      drawChart('chart-q10', function (T) { return emptyChart(T, title, 'Enter your settings'); });
      return null;
    }
    var cap = Math.min(budget, HIGH);
    var rows = VALID.filter(function (i) { return C.u[i] === u && C.p[i] <= cap && C.b[i] >= minB; });
    var mi = rows.map(function (i) { return C.mi[i]; });
    var med = median(mi);
    var name = UNIS[u].name;
    var scopeNote = budget > HIGH ? ' The price scope still applies, so sales above $5,000,000 are not counted.' : '';
    if (!rows.length) {
      $('a10').innerHTML = '<span class="warn">No sales near ' + name + ' match a budget of ' + money(budget) + ' with at least ' + plural(minB, 'bedroom') + '.</span> Try a higher budget or fewer bedrooms.';
      drawChart('chart-q10', function (T) { return emptyChart(T, title, 'No sales match'); });
      return { med: null, n: 0 };
    }
    $('a10').innerHTML = 'Near <strong>' + name + '</strong>, <strong>' + plural(rows.length, 'sale') + '</strong> sold for ' + money(budget) + ' or less with at least ' +
      plural(minB, 'bedroom') + '. Their median distance to campus is <strong>' + miles(med) + '</strong>.' + scopeNote;
    var width = 0.5, maxMi = Math.max.apply(null, mi);
    var nb = Math.floor(maxMi / width) + 1;
    var bins = [];
    for (var k = 0; k < nb; k++) bins.push(0);
    mi.forEach(function (v) { bins[Math.min(nb - 1, Math.floor(v / width + 1e-9))]++; });
    drawChart('chart-q10', function (T) {
      var ax = axisStyle(T);
      return {
        textStyle: { fontFamily: T.font },
        title: titleOpt(T, title, UNIS[u].short + ', up to ' + money(budget) + ', ' + minB + '+ bedrooms. Bars are half-mile bands.'),
        grid: { left: 16, right: 16, top: 70, bottom: 40, containLabel: true },
        tooltip: Object.assign(tip(T), {
          trigger: 'item', formatter: function (p) {
            if (p.componentType === 'markLine') return 'Median ' + miles(med);
            var a = p.dataIndex * width; return '<b>' + one(a) + ' to ' + one(a + width) + ' miles</b><br>' + plural(bins[p.dataIndex], 'sale');
          }
        }),
        xAxis: Object.assign({}, ax, { type: 'value', min: 0, max: nb * width, name: 'Miles to campus (straight line)', nameLocation: 'middle', nameGap: 26, splitLine: { show: false } }),
        yAxis: Object.assign({}, ax, { type: 'value', name: 'Sales', nameLocation: 'middle', nameGap: 40, minInterval: 1 }),
        series: [{
          type: 'bar', barWidth: '92%', cursor: 'default',
          data: bins.map(function (v, k) { return [k * width + width / 2, v]; }),
          itemStyle: { color: T.quiet, borderRadius: [3, 3, 0, 0] },
          markLine: {
            symbol: 'none', silent: false,
            lineStyle: { color: T.accent, width: 2, type: 'solid' },
            label: { formatter: 'Median ' + one(med) + ' mi', color: T.ink, fontFamily: T.font, fontSize: 12, fontWeight: 600, position: 'end' },
            data: [{ xAxis: med }]
          }
        }]
      };
    });
    return { med: med, n: rows.length };
  }

  /* ================= EXPLORE (global filters) ================= */
  function featOK(v, want) {
    if (want === 'any') return true;
    if (want === 'unknown') return v === null;
    return v === (want === 'yes' ? 1 : 0);
  }
  // Rows passing every filter except location (used by the map and comparison).
  function baseRows() {
    var areaActive = S.amin > 0 || S.amax < AREA_MAX;
    return VALID.filter(function (i) {
      var p = C.p[i];
      if (p < S.pmin || p > S.pmax) return false;
      if (S.year && (C.ym[i] === null || Math.floor(C.ym[i] / 100) !== S.year)) return false;
      if (S.beds && (S.beds === 6 ? C.b[i] < 6 : C.b[i] !== S.beds)) return false;
      if (areaActive) {
        var a = C.a[i];
        if (a === null || a <= 0 || a < S.amin || (S.amax < AREA_MAX && a > S.amax)) return false;
      }
      var m = C.mi[i];
      if (m < S.mmin || (S.mmax < MILES_MAX && m > S.mmax)) return false;
      return featOK(C.g[i], S.g) && featOK(C.bs[i], S.bs) && featOK(C.fp[i], S.fp);
    });
  }
  function summarize(rows) {
    var prices = [], dom = [], ppsf = [], mi = [];
    rows.forEach(function (i) {
      prices.push(C.p[i]); mi.push(C.mi[i]);
      if (C.dom[i] !== null) dom.push(C.dom[i]);
      if (C.a[i] > 0) ppsf.push(C.p[i] / C.a[i]);
    });
    return { n: rows.length, med: median(prices), dom: median(dom), nDom: dom.length, ppsf: median(ppsf), mi: median(mi) };
  }

  function renderExplore() {
    var base = baseRows();
    var rows = base.filter(function (i) { return (S.uni < 0 || C.u[i] === S.uni) && (S.city < 0 || C.c[i] === S.city); });
    var s = summarize(rows);
    var where = S.city >= 0 ? PLACES[S.city].name : S.uni >= 0 ? UNIS[S.uni].name : 'All campus areas';
    $('kpis').innerHTML = [
      [int(s.n), 'Sales', 'of ' + int(VALID.length) + ' in the price scope'],
      [money(s.med), 'Median sale price', where],
      [days(s.dom), 'Median days on market', s.nDom ? plural(s.nDom, 'sale') + ' with both dates' : 'No dated sales'],
      [s.ppsf === null ? '—' : money(s.ppsf), 'Median price per sq ft', 'Where living area is known'],
      [miles(s.mi), 'Median distance to campus', 'Straight line']
    ].map(function (k) {
      return '<div class="kpi"><span class="kpi-label">' + k[1] + '</span><span class="kpi-value">' + k[0] + '</span><span class="kpi-note">' + k[2] + '</span></div>';
    }).join('');
    $('explore-empty').hidden = s.n > 0;
    var active = countActive();
    $('filter-count').hidden = !active;
    $('filter-count').textContent = active + (active === 1 ? ' active' : ' active');

    renderHist(rows, s, where);
    renderMap(base);
    renderCompare(base);
    renderCityTable(rows);
    writeURL();
  }

  function countActive() {
    var n = 0;
    if (S.uni >= 0) n++; if (S.city >= 0) n++; if (S.year) n++; if (S.beds) n++;
    if (S.pmin !== LOW || S.pmax !== HIGH) n++;
    if (S.amin > 0 || S.amax < AREA_MAX) n++;
    if (S.mmin > 0 || S.mmax < MILES_MAX) n++;
    ['g', 'bs', 'fp'].forEach(function (k) { if (S[k] !== 'any') n++; });
    return n;
  }

  function renderHist(rows, s, where) {
    var width = 50000, top = 2000000, nb = top / width + 1;
    var bins = [];
    for (var k = 0; k < nb; k++) bins.push(0);
    rows.forEach(function (i) { bins[Math.min(nb - 1, Math.floor(C.p[i] / width))]++; });
    var labels = bins.map(function (v, k) { return k === nb - 1 ? moneyShort(top) + '+' : moneyShort(k * width); });
    $('hist-sub').textContent = s.n ? where + ': ' + plural(s.n, 'sale') + ', median ' + money(s.med) + '. Bars are $50,000 bands.' : 'No sales match the filters.';
    drawChart('chart-hist', function (T) {
      if (!s.n) return emptyChart(T, 'Sale price distribution', 'No sales match these filters');
      var ax = axisStyle(T);
      var medBin = Math.min(nb - 1, Math.floor(s.med / width));
      return {
        textStyle: { fontFamily: T.font },
        title: titleOpt(T, 'Sale price distribution'),
        grid: { left: 16, right: 12, top: 40, bottom: 40, containLabel: true },
        tooltip: Object.assign(tip(T), {
          trigger: 'item', formatter: function (p) {
            var k = p.dataIndex;
            return '<b>' + (k === nb - 1 ? money(top) + ' and up' : money(k * width) + ' to ' + money(k * width + width - 1)) + '</b><br>' + plural(bins[k], 'sale');
          }
        }),
        xAxis: Object.assign({}, ax, { type: 'category', data: labels, name: 'Sale price', nameLocation: 'middle', nameGap: 26, axisLabel: Object.assign({}, ax.axisLabel, { interval: isNarrow() ? 9 : 3 }) }),
        yAxis: Object.assign({}, ax, { type: 'value', name: 'Sales', nameLocation: 'middle', nameGap: 40, minInterval: 1 }),
        series: [{
          type: 'bar', barCategoryGap: '8%', cursor: 'default',
          data: bins.map(function (v, k) { return { value: v, itemStyle: { color: k === medBin ? T.accent : T.quiet, borderRadius: [2, 2, 0, 0] } }; })
        }]
      };
    });
  }

  /* ---------- map ---------- */
  function initMap() {
    map = L.map('map', { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true });
    setTiles();
    mapLayers.unis = L.layerGroup().addTo(map);
    mapLayers.cities = L.layerGroup().addTo(map);
    fitAll();
  }
  function setTiles() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (dark ? 'dark_all' : 'light_all') + '/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd', maxZoom: 18
    }).addTo(map);
  }
  function fitAll() {
    map.fitBounds(L.latLngBounds(UNIS.map(function (u) { return [u.lat, u.lon]; })), { padding: [30, 30] });
  }
  var lastMapFocus = null;
  function renderMap(base) {
    if (!map) return;
    var T = theme();
    var byUni = groupVals(base, C.u, UNIS.length, function (i) { return C.p[i]; });
    var byCity = groupVals(base, C.c, PLACES.length, function (i) { return C.p[i]; });
    var maxN = Math.max.apply(null, byUni.map(function (g) { return g.length; })) || 1;
    mapLayers.unis.clearLayers();
    mapLayers.cities.clearLayers();
    UNIS.forEach(function (u, k) {
      var n = byUni[k].length, sel = S.uni === k;
      var m = L.circleMarker([u.lat, u.lon], {
        radius: 7 + 15 * Math.sqrt(n / maxN), color: T.surface, weight: 2,
        fillColor: sel ? T.accent : T.blue, fillOpacity: S.uni >= 0 && !sel ? 0.35 : 0.85
      });
      m.bindTooltip('<b>' + u.short + '</b><br>' + plural(n, 'sale') + (n ? '<br>Median ' + money(median(byUni[k])) : ''), { direction: 'top', className: 'map-tip' });
      m.on('click', function () { setUni(S.uni === k ? -1 : k); });
      mapLayers.unis.addLayer(m);
    });
    if (S.uni >= 0) {
      PLACES.forEach(function (p, k) {
        if (p.uni !== S.uni) return;
        var n = byCity[k].length, sel = S.city === k;
        var m = L.circleMarker([p.lat, p.lon], { radius: 6, color: T.surface, weight: 2, fillColor: sel ? T.accent : T.ink, fillOpacity: 0.9 });
        m.bindTooltip('<b>' + p.name + '</b><br>' + plural(n, 'sale') + (n ? '<br>Median ' + money(median(byCity[k])) : ''), { direction: 'top', className: 'map-tip' });
        m.on('click', function () { S.city = S.city === k ? -1 : k; syncFilterInputs(); renderExplore(); });
        mapLayers.cities.addLayer(m);
      });
    }
    var focus = S.uni;
    if (focus !== lastMapFocus) {
      lastMapFocus = focus;
      if (focus >= 0) {
        var pts = PLACES.filter(function (p) { return p.uni === focus; }).map(function (p) { return [p.lat, p.lon]; });
        pts.push([UNIS[focus].lat, UNIS[focus].lon]);
        map.flyToBounds(L.latLngBounds(pts).pad(0.6), { maxZoom: 11, duration: 0.6 });
      } else {
        fitAll();
      }
    }
    $('map-sub').textContent = S.uni >= 0
      ? 'Showing ' + UNIS[S.uni].short + '. Select a city dot to filter to one city, or the campus circle again to clear.'
      : 'Circle size shows the number of sales. Select a campus area to filter; select it again to clear.';
  }

  /* ---------- comparison ---------- */
  function renderCompare(base) {
    function pick(v) {
      if (!v) return null;
      var p = v.split(':'), k = +p[1];
      var rows = base.filter(function (i) { return p[0] === 'u' ? C.u[i] === k : C.c[i] === k; });
      return { name: p[0] === 'u' ? UNIS[k].name : PLACES[k].name, s: summarize(rows) };
    }
    var A = pick(S.cmpA), B = pick(S.cmpB);
    var metrics = [
      ['Median sale price', 'med', money, true],
      ['Sales', 'n', int, true],
      ['Median days on market', 'dom', days, false],
      ['Median price per sq ft', 'ppsf', money, true],
      ['Median miles to campus', 'mi', miles, false]
    ];
    var html = '<div class="compare-cols">';
    [A, B].forEach(function (X, idx) {
      var O = idx ? A : B;
      html += '<div class="compare-col"><h4>' + X.name + '</h4><dl>';
      metrics.forEach(function (m) {
        var v = X.s[m[1]], o = O.s[m[1]];
        var w = v !== null && o !== null && Math.max(v, o) > 0 ? v / Math.max(v, o) * 100 : 0;
        html += '<div class="cmp-row"><dt>' + m[0] + '</dt><dd>' + m[2](v) + '</dd><div class="cmp-bar"><span style="width:' + w.toFixed(1) + '%"></span></div></div>';
      });
      html += '</dl></div>';
    });
    html += '</div>';
    if (A.s.med !== null && B.s.med !== null) {
      var diff = (A.s.med - B.s.med) / B.s.med * 100;
      html += '<p class="compare-sum">' + A.name + '\'s median price is <strong>' + money(Math.abs(A.s.med - B.s.med)) + ' ' + (diff >= 0 ? 'higher' : 'lower') + '</strong> than ' +
        B.name + '\'s (' + pct1(diff, true) + '), on ' + int(A.s.n) + ' and ' + int(B.s.n) + ' sales.</p>';
    }
    $('compare').innerHTML = html;
  }

  /* ---------- sortable table ---------- */
  function renderCityTable(rows) {
    var g = {};
    rows.forEach(function (i) { (g[C.c[i]] = g[C.c[i]] || []).push(i); });
    var items = Object.keys(g).map(function (k) {
      var s = summarize(g[k]);
      return { name: PLACES[k].name, uni: UNIS[PLACES[k].uni].short, n: s.n, med: s.med, ppsf: s.ppsf, dom: s.dom, mi: s.mi };
    });
    var key = sortState.key, dir = sortState.dir === 'asc' ? 1 : -1;
    items.sort(function (a, b) {
      var x = a[key], y = b[key];
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || a.name.localeCompare(b.name);
    });
    var tb = $('city-table').tBodies[0];
    tb.innerHTML = items.length ? items.map(function (it) {
      return '<tr><th scope="row">' + it.name + '</th><td class="hide-sm">' + it.uni + '</td><td class="num">' + int(it.n) + '</td><td class="num">' + money(it.med) +
        '</td><td class="num hide-sm">' + money(it.ppsf) + '</td><td class="num">' + one(it.dom) + '</td><td class="num hide-md">' + one(it.mi) + '</td></tr>';
    }).join('') : '<tr><td colspan="7" class="empty-cell">No sales match these filters.</td></tr>';
    Array.prototype.forEach.call($('city-table').tHead.rows[0].cells, function (th) {
      var on = th.dataset.key === sortState.key;
      th.setAttribute('aria-sort', on ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }
  function initTable() {
    var icon = '<svg class="sort-icon" viewBox="0 0 12 16" aria-hidden="true"><path class="up" d="M6 1l4.5 5h-9z"/><path class="down" d="M6 15l-4.5-5h9z"/></svg>';
    Array.prototype.forEach.call($('city-table').tHead.rows[0].cells, function (th) {
      var btn = th.querySelector('button');
      btn.insertAdjacentHTML('beforeend', icon);
      btn.addEventListener('click', function () {
        var k = th.dataset.key;
        if (sortState.key === k) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        else { sortState.key = k; sortState.dir = th.dataset.type === 'text' ? 'asc' : 'desc'; }
        renderExplore();
      });
    });
  }

  /* ---------- filter controls ---------- */
  function opt(v, t, sel) { return '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + t + '</option>'; }

  function fillCitySelect() {
    var h = opt(-1, S.uni >= 0 ? 'All cities near ' + UNIS[S.uni].short : 'All cities', S.city < 0);
    PLACES.forEach(function (p, k) { if (S.uni < 0 || p.uni === S.uni) h += opt(k, p.name, S.city === k); });
    $('f-city').innerHTML = h;
  }
  function setUni(k) {
    S.uni = k;
    if (S.city >= 0 && (k < 0 || PLACES[S.city].uni !== k)) S.city = -1;
    syncFilterInputs();
    renderExplore();
  }

  var ranges = {};
  function makeRange(id, cfg) {
    var el = $(id), label = el.dataset.label;
    var lid = id + '-lbl';
    el.innerHTML =
      '<div class="range-head"><span class="range-label" id="' + lid + '">' + label + '</span><span class="range-val" aria-hidden="true"></span></div>' +
      '<div class="dual"><div class="track"><div class="fill"></div></div>' +
      '<input type="range" class="lo" min="0" max="1000" step="1" aria-label="' + label + ' minimum">' +
      '<input type="range" class="hi" min="0" max="1000" step="1" aria-label="' + label + ' maximum"></div>' +
      '<div class="range-inputs"><label><span class="sr-only">' + label + ' minimum</span><span class="pre">' + (cfg.prefix || '') + '</span><input type="number" class="nlo" inputmode="decimal" step="' + cfg.step + '" min="' + cfg.min + '" max="' + cfg.max + '"></label>' +
      '<span class="to">to</span><label><span class="sr-only">' + label + ' maximum</span><span class="pre">' + (cfg.prefix || '') + '</span><input type="number" class="nhi" inputmode="decimal" step="' + cfg.step + '" min="' + cfg.min + '" max="' + cfg.max + '"></label></div>';
    var lo = el.querySelector('.lo'), hi = el.querySelector('.hi'), nlo = el.querySelector('.nlo'), nhi = el.querySelector('.nhi');
    var fill = el.querySelector('.fill'), val = el.querySelector('.range-val');
    function toVal(t) {
      var v = cfg.min + (cfg.max - cfg.min) * Math.pow(t / 1000, cfg.power || 1);
      v = Math.round(v / cfg.step) * cfg.step;
      return +Math.min(cfg.max, Math.max(cfg.min, v)).toFixed(cfg.decimals || 0);
    }
    function toPos(v) { return Math.round(1000 * Math.pow((v - cfg.min) / (cfg.max - cfg.min), 1 / (cfg.power || 1))); }
    function paint() {
      var a = S[cfg.lo], b = S[cfg.hi];
      lo.value = toPos(a); hi.value = toPos(b);
      nlo.value = a; nhi.value = b;
      fill.style.left = (lo.value / 10) + '%'; fill.style.right = (100 - hi.value / 10) + '%';
      val.textContent = cfg.fmt(a) + ' – ' + cfg.fmt(b) + (cfg.openTop && b >= cfg.max ? '+' : '');
      lo.setAttribute('aria-valuetext', cfg.fmt(a)); hi.setAttribute('aria-valuetext', cfg.fmt(b) + (cfg.openTop && b >= cfg.max ? ' or more' : ''));
    }
    var timer;
    function commit() { clearTimeout(timer); timer = setTimeout(renderExplore, 60); }
    lo.addEventListener('input', function () {
      var v = toVal(+lo.value); if (v > S[cfg.hi]) v = S[cfg.hi]; S[cfg.lo] = v; paint(); commit();
    });
    hi.addEventListener('input', function () {
      var v = toVal(+hi.value); if (v < S[cfg.lo]) v = S[cfg.lo]; S[cfg.hi] = v; paint(); commit();
    });
    function fromNum() {
      var a = parseFloat(nlo.value), b = parseFloat(nhi.value);
      if (!isFinite(a)) a = cfg.min; if (!isFinite(b)) b = cfg.max;
      a = Math.min(cfg.max, Math.max(cfg.min, a)); b = Math.min(cfg.max, Math.max(cfg.min, b));
      if (a > b) { var t = a; a = b; b = t; }
      S[cfg.lo] = a; S[cfg.hi] = b; paint(); commit();
    }
    nlo.addEventListener('change', fromNum); nhi.addEventListener('change', fromNum);
    // Keep the handle that was grabbed on top when both sit at the same end.
    lo.addEventListener('pointerdown', function () { lo.style.zIndex = 3; hi.style.zIndex = 2; });
    hi.addEventListener('pointerdown', function () { hi.style.zIndex = 3; lo.style.zIndex = 2; });
    ranges[id] = { paint: paint };
    paint();
  }

  function makeSeg(feature) {
    var wrap = document.querySelector('.seg-group[data-feature="' + feature + '"]');
    var h = '<div class="seg" role="radiogroup" aria-labelledby="seg-' + feature + '">';
    [['any', 'Any'], ['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']].forEach(function (o) {
      var id = 'f-' + feature + '-' + o[0];
      h += '<input type="radio" name="f-' + feature + '" id="' + id + '" value="' + o[0] + '"><label for="' + id + '">' + o[1] + '</label>';
    });
    wrap.insertAdjacentHTML('beforeend', h + '</div>');
    wrap.addEventListener('change', function (e) { S[feature] = e.target.value; renderExplore(); });
  }

  function syncFilterInputs() {
    $('f-uni').value = S.uni;
    fillCitySelect();
    $('f-year').value = S.year;
    $('f-beds').value = S.beds;
    Object.keys(ranges).forEach(function (k) { ranges[k].paint(); });
    ['g', 'bs', 'fp'].forEach(function (f) { $('f-' + f + '-' + S[f]).checked = true; });
    $('cmp-a').value = S.cmpA; $('cmp-b').value = S.cmpB;
  }

  function initControls() {
    var h = opt(-1, 'All campus areas', true);
    UNIS.forEach(function (u, k) { h += opt(k, u.name); });
    $('f-uni').innerHTML = h;
    $('f-uni').addEventListener('change', function () { setUni(+this.value); });
    $('f-city').addEventListener('change', function () { S.city = +this.value; renderExplore(); });
    $('f-year').innerHTML = opt(0, 'All years', true) + YEARS.map(function (y) { return opt(y, y + (y === 2023 ? ' (from Mar 27)' : y === 2026 ? ' (to Mar 25)' : '')); }).join('');
    $('f-year').addEventListener('change', function () { S.year = +this.value; renderExplore(); });
    $('f-beds').innerHTML = opt(0, 'Any', true) + [1, 2, 3, 4, 5].map(function (b) { return opt(b, b); }).join('') + opt(6, '6 or more');
    $('f-beds').addEventListener('change', function () { S.beds = +this.value; renderExplore(); });

    makeRange('r-price', { lo: 'pmin', hi: 'pmax', min: LOW, max: HIGH, step: 1000, power: 2.6, prefix: '$', fmt: function (v) { return moneyShort(v); } });
    makeRange('r-area', { lo: 'amin', hi: 'amax', min: 0, max: AREA_MAX, step: 50, power: 1.4, openTop: true, fmt: function (v) { return int(v) + ' sq ft'; } });
    makeRange('r-miles', { lo: 'mmin', hi: 'mmax', min: 0, max: MILES_MAX, step: 0.1, decimals: 1, openTop: false, fmt: function (v) { return one(v) + ' mi'; } });
    ['g', 'bs', 'fp'].forEach(makeSeg);

    var ch = '<optgroup label="Campus areas">' + UNIS.map(function (u, k) { return opt('u:' + k, u.short + ' (campus area)'); }).join('') + '</optgroup>' +
      '<optgroup label="Cities">' + PLACES.map(function (p, k) { return opt('c:' + k, p.name); }).join('') + '</optgroup>';
    $('cmp-a').innerHTML = ch; $('cmp-b').innerHTML = ch;
    $('cmp-a').addEventListener('change', function () { S.cmpA = this.value; renderExplore(); });
    $('cmp-b').addEventListener('change', function () { S.cmpB = this.value; renderExplore(); });

    $('reset-filters').addEventListener('click', function () {
      ['uni', 'city', 'year', 'beds', 'pmin', 'pmax', 'amin', 'amax', 'mmin', 'mmax', 'g', 'bs', 'fp'].forEach(function (k) { S[k] = DEFAULTS[k]; });
      syncFilterInputs(); renderExplore();
    });
    $('copy-link').addEventListener('click', function () {
      writeURL();
      setTimeout(function () {
        var url = location.href, st = $('copy-status');
        var done = function () { st.textContent = 'Link copied. It opens this exact view.'; setTimeout(function () { st.textContent = ''; }, 3500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { st.textContent = 'Copy this address: ' + url; });
        else st.textContent = 'Copy this address: ' + url;
      }, 200);
    });

    // Question controls
    $('q7-beds').value = S.q7b;
    $('q8-min').value = S.q8min; $('q8-max').value = S.q8max;
    $('q9-city').innerHTML = PLACES.map(function (p, k) { return opt(k, p.name, k === S.q9c); }).join('');
    $('q9-year').innerHTML = YEARS.map(function (y) { return opt(y, y, y === S.q9y); }).join('');
    $('q10-uni').innerHTML = UNIS.map(function (u, k) { return opt(k, u.name, k === S.q10u); }).join('');
    $('q10-max').value = S.q10max; $('q10-beds').value = S.q10b;
    function numVal(el) { var v = el.value.trim(); return v === '' ? null : Number(v); }
    function bind(id, key, fn, parse) {
      var t;
      $(id).addEventListener('input', function () {
        var el = this; clearTimeout(t);
        t = setTimeout(function () { S[key] = parse ? parse(el) : numVal(el); fn(); writeURL(); }, 250);
      });
      $(id).addEventListener('change', function () { S[key] = parse ? parse(this) : numVal(this); fn(); writeURL(); });
    }
    bind('q7-beds', 'q7b', q7);
    bind('q8-min', 'q8min', q8); bind('q8-max', 'q8max', q8);
    bind('q9-city', 'q9c', q9, function (el) { return +el.value; });
    bind('q9-year', 'q9y', q9, function (el) { return +el.value; });
    bind('q10-uni', 'q10u', q10, function (el) { return +el.value; });
    bind('q10-max', 'q10max', q10); bind('q10-beds', 'q10b', q10);
  }

  /* ================= INSIGHTS: P1 ================= */
  function p1() {
    var items = UNIS.map(function (u, k) {
      var rows = VALID.filter(function (i) { return C.u[i] === k; });
      var dated = [], zeroed = [];
      rows.forEach(function (i) { var d = C.dom[i]; if (d !== null) dated.push(d); zeroed.push(d === null ? 0 : d); });
      return { k: k, name: u.name, short: u.short, proper: median(dated), zero: median(zeroed), missing: (rows.length - dated.length) / rows.length * 100, n: rows.length, nd: dated.length };
    });
    function ranks(key) {
      items.forEach(function (it) { it[key + 'R'] = 1 + items.filter(function (o) { return o[key] < it[key]; }).length; });
    }
    ranks('proper'); ranks('zero');
    items.sort(function (a, b) { return b.proper - a.proper; });
    var allDated = [], allZero = [];
    VALID.forEach(function (i) { var d = C.dom[i]; if (d !== null) allDated.push(d); allZero.push(d === null ? 0 : d); });
    var iowa = items.filter(function (it) { return it.short === 'Iowa'; })[0];
    var biggest = items.slice().sort(function (a, b) { return (b.proper - b.zero) - (a.proper - a.zero); })[0];
    var nBlank = VALID.length - allDated.length;
    var zSlow = items.slice().sort(function (a, b) { return b.zero - a.zero; })[0];
    var zFast = Math.min.apply(null, items.map(function (it) { return it.zero; }));
    var pFast = Math.min.apply(null, items.map(function (it) { return it.proper; }));
    var meanD = mean(allDated);
    $('p1-text').innerHTML =
      '<p>The problem I chose is the first one in the data sheet: days on market needs both a list date and a contract date, and a blank is not zero. Of the ' + int(VALID.length) +
      ' sales in the price scope, <strong>' + int(nBlank) + '</strong> (' + pct1(nBlank / VALID.length * 100) + ') are missing at least one of the two dates, usually because the home sold without a public listing. ' +
      'My rule was to compute days on market only on the ' + int(allDated.length) + ' sales that have both dates, and to report how many sales each median uses.</p>' +
      '<p>The rule matters. Filling the blanks with zero would cut the overall median from <strong>' + days(median(allDated)) + '</strong> to <strong>' + days(median(allZero)) + '</strong>, and it hits campus areas unevenly because the blanks are not random. ' +
      'The clearest case is <strong>' + biggest.name + '</strong>, where ' + pct1(biggest.missing) + ' of sales lack a date: its median would drop from <strong>' + days(biggest.proper) + '</strong> to <strong>' + days(biggest.zero) + '</strong>, moving it from the ' +
      ordinal(biggest.properR) + ' fastest campus area to ' + (biggest.zeroR === 1 ? 'the fastest' : 'the ' + ordinal(biggest.zeroR) + ' fastest') + '. ' + (zSlow.k === items[0].k ? 'The slowest area stays ' + items[0].short + ', but its gap over the fastest narrows' : 'The slowest area would change from ' + items[0].short + ' to ' + zSlow.short + ', and the gap from slowest to fastest would narrow') + ' from ' + days(items[0].proper - pFast) + ' to ' + days(zSlow.zero - zFast) + '.</p>' +
      '<p>I also kept medians rather than means here. The days-on-market distribution has a long upper tail: the mean of the dated sales is ' + days(meanD) + ', three times the median, and ' +
      int(allDated.filter(function (d) { return d > 365; }).length) + ' homes took more than a year to go under contract.</p>';
    drawChart('chart-p1', function (T) {
      var ax = axisStyle(T);
      return {
        textStyle: { fontFamily: T.font },
        legend: { top: 0, left: 0, textStyle: { color: T.muted, fontFamily: T.font }, itemWidth: 12, itemHeight: 10, data: ['Both dates required (my rule)', 'Blank counted as 0 days'] },
        grid: { left: 4, right: 44, top: 36, bottom: 44, containLabel: true },
        tooltip: Object.assign(tip(T), {
          trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) {
            var it = items[ps[0].dataIndex];
            return '<b>' + it.name + '</b><br>Both dates: ' + days(it.proper) + ' (' + int(it.nd) + ' sales)<br>Blank as 0: ' + days(it.zero) + ' (' + int(it.n) + ' sales)<br>Missing a date: ' + pct1(it.missing);
          }
        }),
        xAxis: Object.assign({}, ax, { type: 'value', name: 'Median days on market', nameLocation: 'middle', nameGap: 28, min: 0 }),
        yAxis: Object.assign({}, ax, { type: 'category', inverse: true, data: items.map(function (it) { return it.short; }), splitLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { color: T.ink }) }),
        series: [
          { name: 'Both dates required (my rule)', type: 'bar', barGap: '15%', barWidth: '34%', data: items.map(function (it) { return it.proper; }), itemStyle: { color: T.blue, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: T.ink, fontSize: 11, fontFamily: T.font, formatter: function (p) { return one(p.value); } } },
          { name: 'Blank counted as 0 days', type: 'bar', barWidth: '34%', data: items.map(function (it) { return it.zero; }), itemStyle: { color: T.accent, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: T.ink, fontSize: 11, fontFamily: T.font, formatter: function (p) { return one(p.value); } } }
        ]
      };
    });
    $('tp1').innerHTML = table(['Campus area', 'Missing a date', 'Median, both dates', 'Median, blank as 0', 'Speed rank, both dates', 'Speed rank, blank as 0'],
      items.map(function (it) { return [it.name, pct1(it.missing), one(it.proper), one(it.zero), it.properR, it.zeroR]; }), [1, 2, 3, 4, 5]);
    return items;
  }

  /* ================= theme ================= */
  function initTheme() {
    var btn = $('theme-toggle');
    function label() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = dark ? 'Light mode' : 'Dark mode';
    }
    label();
    btn.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      label();
      redrawAll();
      if (map) { setTiles(); renderMap(baseRows()); }
    });
  }

  /* ================= boot ================= */
  var resizeTimer, lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var narrowChanged = (lastW < 600) !== (window.innerWidth < 600);
      lastW = window.innerWidth;
      if (narrowChanged) redrawAll(); else Object.keys(charts).forEach(function (id) { charts[id].inst.resize(); });
      if (map) map.invalidateSize();
    }, 120);
  });

  function boot(data) {
    D = data; C = data.cols; N = data.rows; UNIS = data.unis; PLACES = data.places;
    for (var i = 0; i < N; i++) { ALL.push(i); if (valid(i)) VALID.push(i); }
    Object.keys(DEFAULTS).forEach(function (k) { S[k] = DEFAULTS[k]; });
    var ui = uniFromSlug('illinois'), champ = placeFromSlug('champaign-il');
    DEFAULTS.q9c = S.q9c = champ; DEFAULTS.q10u = S.q10u = ui;
    DEFAULTS.cmpA = S.cmpA = 'c:' + champ; DEFAULTS.cmpB = S.cmpB = 'c:' + placeFromSlug('urbana-il');
    readURL();

    initTheme();
    initControls();
    initTable();
    syncFilterInputs();
    renderHero();
    try { initMap(); } catch (e) { $('map').innerHTML = '<p class="empty-msg">The map could not load.</p>'; }

    window.__answers = { q1: q1(), q2: q2(), q3: q3(), q4: q4(), q5: q5(), q6: q6(), p1: p1() };
    q7(); q8(); q9(); q10();
    renderExplore();
    window.__site = { S: S, q7: q7, q8: q8, q9: q9, q10: q10, summarize: summarize, baseRows: baseRows };
    $('loading').classList.add('done');
    setTimeout(function () { $('loading').hidden = true; }, 400);
  }

  fetch('data/site_data.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(boot)
    .catch(function (e) {
      console.error(e);
      $('loading-text').textContent = 'The data could not be loaded. Please refresh the page.';
      $('loading').classList.add('error');
    });
})();
