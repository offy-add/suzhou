/* ===========================================================
 *  倷好，苏州 · 地铁时光地图   —— 逻辑层
 * =========================================================== */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s) => document.querySelector(s);

  /* ---------- 工具 ---------- */
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function roundedPath(pts, r) {
    if (pts.length < 2) return '';
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
    const len = (v) => Math.hypot(v[0], v[1]) || 1;
    const unit = (v) => { const l = len(v); return [v[0] / l, v[1] / l]; };
    let d = 'M ' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const u1 = unit(sub(p0, p1)), u2 = unit(sub(p2, p1));
      const rr = Math.min(r, len(sub(p0, p1)) / 2, len(sub(p2, p1)) / 2);
      const a = [p1[0] + u1[0] * rr, p1[1] + u1[1] * rr];
      const b = [p1[0] + u2[0] * rr, p1[1] + u2[1] * rr];
      d += ` L ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${p1[0]} ${p1[1]} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L ${last[0]} ${last[1]}`;
  }

  const lineById = {};
  LINES.forEach((l) => { lineById[l.id] = l; });

  const roadById = {};
  EXPRESSWAYS.forEach((r) => { roadById[r.id] = r; });
  BIKE_ZONES.forEach((z, i) => { z.id = 'bz' + i; });

  /* 共享单车点 */
  const bikes = BIKE_STATIONS.map((b, i) => ({
    id: 'bk' + i, name: b[0], x: b[1], y: b[2], year: b[3], cap: b[4], kind: b[5]
  }));

  /* 距离（示意图单位 → 米 / 公里） */
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function mText(d) {
    const m = Math.round(d * KM_PER_UNIT * 1000);
    return m >= 1000 ? (m / 1000).toFixed(1) + ' 公里' : m + ' 米';
  }
  function distToPolyline(x, y, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const x1 = pts[i - 1][0], y1 = pts[i - 1][1], x2 = pts[i][0], y2 = pts[i][1];
      const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
      let t = ((x - x1) * dx + (y - y1) * dy) / L;
      t = Math.max(0, Math.min(1, t));
      const dd = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      if (dd < best) best = dd;
    }
    return best;
  }

  /* ---------- 站点聚合：同名即换乘 ---------- */
  const stations = [];
  const stationIndex = {};
  LINES.forEach((line, li) => {
    line.stations.forEach((raw, si) => {
      const name = raw[0], x = raw[1], y = raw[2], lp = raw[3];
      let st = stationIndex[name];
      if (!st) {
        st = { name, x, y, lp: lp || 'e', lines: [], order: 9999, spots: [] };
        stationIndex[name] = st;
        stations.push(st);
      }
      if (!st.lines.includes(line.id)) st.lines.push(line.id);
      st.order = Math.min(st.order, li * 40 + si);
    });
  });

  SPOTS.forEach((sp, i) => {
    sp.id = 'sp' + i;
    sp.stationRef = stationIndex[sp.station] || null;
    if (sp.stationRef) sp.stationRef.spots.push(sp);
  });

  /* ---------- 开场标题 ---------- */
  const heroTitle = $('#heroTitle');
  '倷好，苏州'.split('').forEach((c, i) => {
    const s = document.createElement('span');
    s.textContent = c;
    s.style.animationDelay = (0.4 + i * 0.16) + 's';
    if (c === '，') s.className = 'dot';
    heroTitle.appendChild(s);
  });

  /* ---------- 绘制地图 ---------- */
  const svg = $('#map');
  const gZones = el('g', { class: 'layer-zones' }, svg);
  const gRoads = el('g', { class: 'layer-roads' }, svg);
  const gLines = el('g', { class: 'layer-lines' }, svg);
  const gBike = el('g', { class: 'layer-bike' }, svg);
  const gStations = el('g', { class: 'layer-stations' }, svg);
  const gSpots = el('g', { class: 'layer-spots' }, svg);

  LINES.forEach((line, li) => {
    const g = el('g', { class: 'line-g', 'data-line': line.id }, gLines);
    const pts = line.stations.map((s) => [s[1], s[2]]);
    const path = el('path', {
      class: 'line-path',
      d: roundedPath(pts, 14),
      stroke: line.color
    }, g);
    const len = path.getTotalLength();
    g.style.setProperty('--len', len);
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    line._g = g;
    line._path = path;
    line._len = len;
    line._li = li;
  });

  /* ---------- 高速公路 ---------- */
  const allExits = [];

  EXPRESSWAYS.forEach((rd, ri) => {
    const g = el('g', { class: 'road-g', 'data-road': rd.id }, gRoads);
    const d = roundedPath(rd.pts, 24);
    const casing = el('path', { class: 'road-casing', d }, g);
    const p = el('path', { class: 'road-line', d, stroke: rd.color }, g);
    const inner = el('path', { class: 'road-inner', d }, g);
    const len = p.getTotalLength();
    g.style.setProperty('--len', len);
    [casing, p, inner].forEach((n) => {
      n.style.strokeDasharray = len;
      n.style.strokeDashoffset = len;
    });
    rd._g = g;
    rd._paths = [casing, p, inner];
    rd._len = len;
    rd._ri = ri;

    /* 编号盾牌（随缩放保持屏幕尺寸） */
    rd._shields = [];
    [0.14, 0.5, 0.85].forEach((t) => {
      const pt = p.getPointAtLength(len * t);
      const w = Math.max(30, rd.code.length * 7.4 + 10);
      const sg = el('g', { class: 'road-shield-g' }, g);
      el('rect', {
        class: 'road-shield', x: -w / 2, y: -8.5,
        width: w, height: 17, rx: 4.5, stroke: rd.color
      }, sg);
      const tx = el('text', { class: 'road-code', x: 0, y: 1, fill: rd.color }, sg);
      tx.textContent = rd.code;
      sg._base = 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')';
      sg.setAttribute('transform', sg._base);
      rd._shields.push(sg);
    });

    /* 出口（与景点联动） */
    rd.exits.forEach((ex) => {
      const nm = ex[0], x = ex[1], y = ex[2];
      const eg = el('g', { class: 'road-exit' }, g);
      const halo = el('circle', { class: 'halo', cx: x, cy: y }, eg);
      halo.style.r = 'calc(11px * var(--ms, 1))';
      const dg = el('g', { class: 'exit-glyph' }, eg);
      el('path', {
        class: 'dia', fill: rd.color,
        d: 'M 0 -6.6 L 6.6 0 L 0 6.6 L -6.6 0 Z'
      }, dg);
      const hit = el('circle', { class: 'hit', cx: x, cy: y, fill: 'transparent' }, eg);
      hit.style.r = 'calc(14px * var(--ms, 1))';
      const lb = el('text', { class: 'exit-label', y: y + 4 }, eg);
      lb.style.x = 'calc(' + x + 'px + 11px * var(--ms, 1))';
      lb.style.y = 'calc(' + y + 'px + 4px * var(--ms, 1))';
      lb.textContent = nm;
      const e = { name: nm, x, y, road: rd, _g: eg };
      allExits.push(e);
      eg.addEventListener('click', (ev) => { ev.stopPropagation(); pickExit(e); });
      eg.addEventListener('mouseenter', (ev) => showTip(ev, `<b>${nm}</b>　<i>${rd.name} · ${rd.code}</i>`));
      eg.addEventListener('mousemove', moveTip);
      eg.addEventListener('mouseleave', hideTip);
    });

    g.addEventListener('click', (e) => {
      if (justDragged) return;
      if (e.target.closest && e.target.closest('.road-exit')) return;
      e.stopPropagation();
      pickedRoad = (pickedRoad === rd.id) ? null : rd.id;
      applyPickRoad();
      if (pickedRoad) renderDetailRoad(rd); else renderOverview();
    });
  });

  /* ---------- 共享单车：运营范围 + 单车点 ---------- */
  function bikeGlyph(parent, x, y) {
    const g = el('g', { class: 'bk-glyph', transform: 'translate(' + x + ',' + y + ')' }, parent);
    x = 0; y = 0;
    el('circle', { class: 'bk-ico', cx: x - 3.7, cy: y + 1.8, r: 3.1, fill: 'none' }, g);
    el('circle', { class: 'bk-ico', cx: x + 3.7, cy: y + 1.8, r: 3.1, fill: 'none' }, g);
    el('path', {
      class: 'bk-ico', fill: 'none',
      d: `M ${x - 3.7} ${y + 1.8} L ${x - 0.4} ${y - 3.2} L ${x + 3.7} ${y + 1.8} M ${x - 0.8} ${y - 3.2} h 4.6`
    }, g);
  }

  BIKE_ZONES.forEach((z) => {
    const g = el('g', { class: 'zone-g' }, gZones);
    const zc = el('circle', { class: 'zone-circle', cx: z.x, cy: z.y }, g);
    zc.style.r = 'calc(' + z.r + 'px * var(--ms, 1))';
    const t = el('text', { class: 'zone-label', x: z.x }, g);
    t.style.y = 'calc(' + (z.y - z.r) + 'px + 17px * var(--ms, 1))';
    t.textContent = z.name + ' · 运营范围';
    z._g = g;
  });

  let focusG = null;
  function drawFocusRange(sp) {
    if (!focusG) focusG = el('g', { class: 'focus-g' }, gZones);
    while (focusG.firstChild) focusG.removeChild(focusG.firstChild);
    const R = 320;
    const fc = el('circle', { class: 'focus-range', cx: sp._x, cy: sp._y }, focusG);
    fc.style.r = 'calc(' + R + 'px * var(--ms, 1))';
    const t = el('text', { class: 'focus-range-label', x: sp._x }, focusG);
    t.style.y = 'calc(' + (sp._y - R) + 'px + 19px * var(--ms, 1))';
    t.textContent = sp.name + ' · 周边单车运营范围（示意）';
  }
  function clearFocusRange() {
    if (focusG) while (focusG.firstChild) focusG.removeChild(focusG.firstChild);
  }

  bikes.forEach((bk) => {
    const g = el('g', { class: 'bike-st ' + bk.kind, 'data-bike': bk.id }, gBike);
    el('circle', { class: 'bk-bg', cx: bk.x, cy: bk.y, r: 9.5 }, g);
    bikeGlyph(g, bk.x, bk.y);
    const t = el('text', { class: 'bk-name', x: bk.x }, g);
    t.style.y = 'calc(' + bk.y + 'px + 23px * var(--ms, 1))';
    t.textContent = bk.name;
    bk._g = g;
    g.addEventListener('click', (e) => { e.stopPropagation(); pickBike(bk); });
    g.addEventListener('mouseenter', (e) => {
      showTip(e, `<b>${bk.name}</b>　<i>${BIKE_KIND[bk.kind]} · ${bk.cap} 个车位</i>`);
    });
    g.addEventListener('mousemove', moveTip);
    g.addEventListener('mouseleave', hideTip);
  });

  function labelPos(st, gap) {
    if (gap === undefined) gap = (st.lines.length > 1 ? 12 : 10);
    switch (st.lp) {
      case 'w': return { x: st.x - gap, y: st.y + 4.5, a: 'end' };
      case 'n': return { x: st.x, y: st.y - gap - 2, a: 'middle' };
      case 's': return { x: st.x, y: st.y + gap + 8, a: 'middle' };
      default: return { x: st.x + gap, y: st.y + 4.5, a: 'start' };
    }
  }

  stations.sort((a, b) => a.order - b.order);

  stations.forEach((st) => {
    const g = el('g', { class: 'station-g' }, gStations);
    const s = el('g', { class: 'station' }, g);
    const hub = st.lines.length > 1;
    const color = lineById[st.lines[0]].color;

    el('circle', { class: 'ring', cx: st.x, cy: st.y, r: 15 }, s);
    if (hub) {
      el('circle', { class: 'dot hub', cx: st.x, cy: st.y, r: 7 }, s);
    } else {
      el('circle', { class: 'dot', cx: st.x, cy: st.y, r: 5, fill: color }, s);
    }
    const lp = labelPos(st);
    const t = el('text', {
      class: 'st-label' + (hub ? ' hub' : ''),
      x: lp.x, y: lp.y, 'text-anchor': lp.a
    }, s);
    t.textContent = st.name;
    st._label = t;
    el('circle', { class: 'hit', cx: st.x, cy: st.y, r: hub ? 15 : 13 }, s);

    st._g = g;
    st._s = s;

    s.addEventListener('mouseenter', (e) => {
      showTip(e, `<b>${st.name}</b>　<i>${st.lines.map((id) => lineById[id].name).join(' · ')}</i>`);
    });
    s.addEventListener('mousemove', moveTip);
    s.addEventListener('mouseleave', hideTip);
    s.addEventListener('click', (e) => { e.stopPropagation(); pickStation(st); });
  });

  SPOTS.forEach((sp) => {
    if (!sp.stationRef) return;
    const st = sp.stationRef;
    const cat = CATEGORY[sp.cat] || { color: '#7C8791', label: sp.cat };
    const x = st.x + sp.dx, y = st.y + sp.dy;

    const g = el('g', { class: 'spot-g', 'data-spot': sp.id }, gSpots);
    el('line', {
      class: 'spot-link', x1: st.x, y1: st.y, x2: x, y2: y, stroke: cat.color
    }, g);
    el('circle', { class: 'pulse', cx: st.x, cy: st.y, r: 12, stroke: cat.color }, g);
    const bg = el('circle', { class: 'spot-bg', cx: x, cy: y, r: 13, stroke: cat.color }, g);
    const ico = el('text', { class: 'spot-ico', x: x, y: y + 1 }, g);
    ico.textContent = sp.icon;
    const tip = el('text', { class: 'spot-tip', x: x, y: y + 27 }, g);
    tip.textContent = sp.name;
    sp._tip = tip;

    sp._g = g;
    sp._x = x;
    sp._y = y;

    /* 单击 = 弹出景点介绍卡片；双击 = 放大看周边共享单车。
       单击后延迟 240ms 再执行，避免第一次点击的飞行动画把图标
       从光标下移走、导致第二次点击落空。 */
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      if (justDragged) { justDragged = false; return; }
      spotClick(sp);
    });
    g.addEventListener('dblclick', (e) => { e.stopPropagation(); e.preventDefault(); });
    g.addEventListener('mouseenter', (e) => {
      showTip(e, `<b>${sp.name}</b>　<i>${cat.label} · ${sp.station}站 · 单击看介绍 / 双击看单车</i>`);
    });
    g.addEventListener('mousemove', moveTip);
    g.addEventListener('mouseleave', hideTip);
  });

  /* ---------- 缩放 / 平移 / 定位 ---------- */
  const MIN_Z = 1, MAX_Z = 8;
  const view = { x: 0, y: 0, w: VIEWBOX.w, h: VIEWBOX.h };
  let zoom = 1, flyRaf = 0, justDragged = false, drag = null, pinch = null;
  const mapHint = $('.map-hint');

  function clampView() {
    view.x = view.w >= VIEWBOX.w ? (VIEWBOX.w - view.w) / 2
      : Math.max(0, Math.min(VIEWBOX.w - view.w, view.x));
    view.y = view.h >= VIEWBOX.h ? (VIEWBOX.h - view.h) / 2
      : Math.max(0, Math.min(VIEWBOX.h - view.h, view.y));
  }

  function applyView() {
    svg.setAttribute('viewBox',
      view.x.toFixed(1) + ' ' + view.y.toFixed(1) + ' ' + view.w.toFixed(1) + ' ' + view.h.toFixed(1));
    $('#zVal').textContent = Math.round(zoom * 100) + '%';
    svg.classList.toggle('far', zoom < 0.95);
    svg.classList.toggle('near', zoom >= 2);
    /* 地图缩放：几何放大，标记与文字保持屏幕尺寸 */
    const ms = Math.max(0.16, 1 / zoom);
    svg.style.setProperty('--ms', ms.toFixed(4));
    svg.style.setProperty('--ts', ms.toFixed(4));
    EXPRESSWAYS.forEach((r) => {
      if (!r._shields) return;
      r._shields.forEach((sh) => sh.setAttribute('transform', sh._base + ' scale(' + ms.toFixed(4) + ')'));
    });
    layoutLabels(ms);
    if (typeof applyBike === 'function') applyBike(false);
    if (typeof placePop === 'function') placePop();
  }

  function setZoom(nz, cx, cy) {
    nz = Math.max(MIN_Z, Math.min(MAX_Z, nz));
    if (cx === undefined) { cx = view.x + view.w / 2; cy = view.y + view.h / 2; }
    const nw = VIEWBOX.w / nz, nh = VIEWBOX.h / nz;
    view.x = cx - (cx - view.x) * (nw / view.w);
    view.y = cy - (cy - view.y) * (nh / view.h);
    view.w = nw; view.h = nh; zoom = nz;
    clampView();
    applyView();
  }

  function flyTo(x, y, nz, ms) {
    ms = ms || 620;
    nz = Math.max(MIN_Z, Math.min(MAX_Z, nz));
    const nw = VIEWBOX.w / nz, nh = VIEWBOX.h / nz;
    const tx = Math.max(0, Math.min(VIEWBOX.w - nw, x - nw / 2));
    const ty = Math.max(0, Math.min(VIEWBOX.h - nh, y - nh / 2));
    const f = { x: view.x, y: view.y, w: view.w, h: view.h };
    const t0 = performance.now();
    cancelAnimationFrame(flyRaf);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      view.x = f.x + (tx - f.x) * e;
      view.y = f.y + (ty - f.y) * e;
      view.w = f.w + (nw - f.w) * e;
      view.h = f.h + (nh - f.h) * e;
      zoom = VIEWBOX.w / view.w;
      clampView();
      applyView();
      if (p < 1) flyRaf = requestAnimationFrame(step);
    };
    flyRaf = requestAnimationFrame(step);
  }

  function resetView() {
    cancelAnimationFrame(flyRaf);
    zoom = 1;
    view.x = 0; view.y = 0; view.w = VIEWBOX.w; view.h = VIEWBOX.h;
    bikeFocus = null;
    clearFocusRange();
    applyView();
    applyBike(false);
  }

  function svgPoint(cx, cy) {
    const m = svg.getScreenCTM();
    if (!m) return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    return { x: (cx - m.e) / m.a, y: (cy - m.f) / m.d };
  }

  function hideHint() { if (mapHint) mapHint.classList.add('gone'); }

  let hintTimer = 0;
  function flashHint(text, ms) {
    if (!mapHint) return;
    mapHint.textContent = text;
    mapHint.classList.remove('gone');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => mapHint.classList.add('gone'), ms || 3800);
  }

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopPlay();
    const p = svgPoint(e.clientX, e.clientY);
    setZoom(zoom * Math.pow(1.0018, -e.deltaY), p.x, p.y);
    hideHint();
  }, { passive: false });

  svg.addEventListener('dblclick', (e) => {
    const p = svgPoint(e.clientX, e.clientY);
    setZoom(zoom * 1.9, p.x, p.y);
    hideHint();
  });

  /* 注意：这里不能用 setPointerCapture —— 指针捕获会把后续的
     mouseup / click 等兼容鼠标事件重定向到 <svg> 本身，
     导致站点、景点、单车点、高速出口自身的 click 处理器全部失效。
     改为在 window 上监听 move / up，拖动移出地图也能继续。 */
  svg.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    const m = svg.getScreenCTM();
    drag = {
      sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y,
      k: m ? 1 / m.a : 1, moved: false
    };
    svg.classList.add('grab');
  });

  function onDragMove(e) {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) * drag.k;
    const dy = (e.clientY - drag.sy) * drag.k;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      drag.moved = true;
      svg.parentNode.classList.add('grabbing');
      hideHint();
    }
    if (!drag.moved) return;
    cancelAnimationFrame(flyRaf);
    view.x = drag.vx - dx;
    view.y = drag.vy - dy;
    clampView();
    applyView();
  }
  svg.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointermove', onDragMove);

  function endDrag() {
    if (drag && drag.moved) justDragged = true;
    drag = null;
    svg.classList.remove('grab');
    if (svg.parentNode) svg.parentNode.classList.remove('grabbing');
  }
  svg.addEventListener('pointerup', endDrag);
  window.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointercancel', endDrag);

  /* 双指捏合（触屏） */
  function tDist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  svg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      drag = null;
      pinch = { d: tDist(e.touches), z: zoom };
    }
  }, { passive: true });
  svg.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const d = tDist(e.touches);
      const p = svgPoint((e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2);
      setZoom(pinch.z * (d / pinch.d), p.x, p.y);
      hideHint();
    }
  }, { passive: false });
  svg.addEventListener('touchend', () => { pinch = null; });

  $('#zIn').addEventListener('click', () => setZoom(zoom * 1.6));
  $('#zOut').addEventListener('click', () => setZoom(zoom / 1.6));
  $('#zReset').addEventListener('click', resetView);
  $('#zVal').textContent = '100%';

  /* ---------- 图层显隐 ---------- */
  const LAYERS = { metro: true, bike: true, road: true };
  const legendEl = $('.legend');
  let bikeFocus = null;
  let pickedRoad = null;

  function setLayer(k, on) {
    LAYERS[k] = on;
    document.querySelectorAll('#layerToggle .lt-btn').forEach((b) => {
      b.classList.toggle('on', !!LAYERS[b.getAttribute('data-layer')]);
    });
    svg.classList.toggle('hide-metro', !LAYERS.metro);
    svg.classList.toggle('hide-bike', !LAYERS.bike);
    svg.classList.toggle('hide-road', !LAYERS.road);
    if (legendEl) {
      legendEl.classList.toggle('hide-road', !LAYERS.road);
      legendEl.classList.toggle('show-bike', LAYERS.bike);
    }
    if (k === 'bike' && !on) { bikeFocus = null; clearFocusRange(); }
    if (k === 'road' && !on && pickedRoad) { pickedRoad = null; applyPickRoad(); }
    if (k === 'metro' && !on && pickedLine) { pickedLine = null; applyPickLine(); }
    applyYear(false);
    applyBike(false);
    if (on) {
      if (k === 'bike' && zoom < 1.5) flashHint('继续放大地图，或双击景点图标查看单车点与运营范围');
      if (k === 'road' && year < 1996) flashHint('1996 年沪宁高速通车 —— 把时间滑块往右拖');
      if (k === 'metro' && year < 2012) flashHint('2012 年 1 号线通车 —— 把时间滑块往右拖');
    }
  }

  function applyPickRoad() {
    EXPRESSWAYS.forEach((r) => {
      r._g.classList.toggle('dim', pickedRoad && pickedRoad !== r.id);
      r._g.classList.toggle('focus', pickedRoad === r.id);
      if (r._row) r._row.classList.toggle('pick', pickedRoad === r.id);
    });
  }

  function applyBike(animate) {
    const zNear = zoom >= 1.7;
    const sNear = zoom >= 2.1;
    BIKE_ZONES.forEach((z) => {
      const near = bikeFocus
        ? dist(z.x, z.y, bikeFocus._x, bikeFocus._y) < z.r + 330
        : zNear;
      z._g.classList.toggle('on', !!(LAYERS.bike && year >= z.year && near));
    });
    bikes.forEach((b, i) => {
      const near = bikeFocus
        ? dist(b.x, b.y, bikeFocus._x, bikeFocus._y) <= 320
        : sNear;
      const on = LAYERS.bike && year >= b.year && near;
      b._g.classList.toggle('is-on', !!on);
      b._g.style.transitionDelay = (on && animate) ? (0.06 + i * 0.008).toFixed(3) + 's' : '0s';
    });
  }

  document.querySelectorAll('#layerToggle .lt-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-layer');
      setLayer(k, !LAYERS[k]);
    });
  });

  /* ---------- 浮动弹窗（可拖动） ---------- */
  const pop = $('#spotPop');
  const mapWrap = $('.map-wrap');
  const popHead = $('#popHead');
  let popAnchor = null;
  let popOffset = { x: 26, y: -28 };
  let popDrag = null;
  let popCtx = null;

  function layoutLabels(ms) {
    if (ms === undefined) ms = Math.max(0.16, 1 / zoom);
    stations.forEach((st) => {
      if (!st._label) return;
      const lp = labelPos(st, (st.lines.length > 1 ? 12 : 10) * ms);
      st._label.setAttribute('x', lp.x.toFixed(1));
      st._label.setAttribute('y', lp.y.toFixed(1));
    });
    SPOTS.forEach((sp) => {
      if (!sp._tip) return;
      sp._tip.setAttribute('y', (sp._y + 27 * ms).toFixed(1));
    });
  }

  function placePop() {
    if (!popAnchor || pop.hidden) return;
    const r = mapWrap.getBoundingClientRect();
    const m = svg.getScreenCTM();
    if (!m) return;
    const cx = (m.a * popAnchor.x + m.c * popAnchor.y + m.e) - r.left;
    const cy = (m.b * popAnchor.x + m.d * popAnchor.y + m.f) - r.top;
    const w = pop.offsetWidth || 306, h = pop.offsetHeight || 320;
    let px = cx + popOffset.x, py = cy + popOffset.y;
    px = Math.max(10, Math.min(Math.max(10, r.width - w - 10), px));
    py = Math.max(10, Math.min(Math.max(10, r.height - h - 10), py));
    pop.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px)';
  }

  function popOpen(head, html, ctx) {
    $('#popIco').textContent = head.ico || '';
    $('#popName').textContent = head.name;
    $('#popCat').textContent = head.cat || '';
    $('#popBody').innerHTML = html;
    $('#popBody').scrollTop = 0;      // 每次打开都从「介绍」开头看起
    popCtx = ctx || null;
    popAnchor = { x: head.x, y: head.y };
    pop.hidden = false;
    pop.classList.remove('on');

    const r = mapWrap.getBoundingClientRect();
    const m = svg.getScreenCTM();
    let ox = 26;
    if (m) {
      const cx = (m.a * head.x + m.c * head.y + m.e) - r.left;
      if (cx > r.width * 0.56) ox = -(pop.offsetWidth || 306) - 26;
    }
    popOffset = { x: ox, y: -28 };
    requestAnimationFrame(() => { pop.classList.add('on'); placePop(); });
    wirePop();
  }

  function popClose() {
    pop.classList.remove('on');
    pop.hidden = true;
    popAnchor = null;
    popCtx = null;
  }

  function wirePop() {
    $('#popBody').querySelectorAll('[data-act]').forEach((n) => {
      n.addEventListener('click', () => {
        const a = n.getAttribute('data-act');
        const id = n.getAttribute('data-id');
        if (a === 'spot') {
          const sp = SPOTS.find((s) => s.id === id);
          if (sp) pickSpot(sp);
        } else if (a === 'station') {
          const st = stationIndex[id];
          if (st) pickStation(st);
        } else if (a === 'bike') {
          const bk = bikes.find((b) => b.id === id);
          if (bk) pickBike(bk);
        } else if (a === 'exit') {
          const e = allExits.find((x) => x.name === id &&
            (!n.getAttribute('data-road') || x.road.id === n.getAttribute('data-road')));
          if (e) pickExit(e);
        } else if (a === 'bikefocus') {
          if (popCtx && popCtx.sp) focusBikes(popCtx.sp);
        } else if (a === 'reset') {
          resetView();
        } else if (a === 'road') {
          const rd = roadById[id];
          if (rd) { pickedRoad = rd.id; applyPickRoad(); renderDetailRoad(rd); }
        }
      });
    });
  }

  popHead.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    popDrag = { sx: e.clientX, sy: e.clientY, ox: popOffset.x, oy: popOffset.y };
    try { popHead.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    e.preventDefault();
  });
  popHead.addEventListener('pointermove', (e) => {
    if (!popDrag) return;
    popOffset.x = popDrag.ox + (e.clientX - popDrag.sx);
    popOffset.y = popDrag.oy + (e.clientY - popDrag.sy);
    placePop();
  });
  ['pointerup', 'pointercancel'].forEach((ev) => {
    popHead.addEventListener(ev, () => { popDrag = null; });
  });
  $('#popClose').addEventListener('click', popClose);

  /* ---------- 最近的高速出口 / 单车点 ---------- */
  function nearestExitOf(x, y) {
    let best = null, bd = Infinity;
    allExits.forEach((e) => {
      if (year < e.road.year) return;
      const d = dist(e.x, e.y, x, y);
      if (d < bd) { bd = d; best = e; }
    });
    return best ? { e: best, d: bd } : null;
  }

  function nearestBikesOf(x, y, n) {
    return bikes.filter((b) => year >= b.year)
      .map((b) => ({ b: b, d: dist(b.x, b.y, x, y) }))
      .sort((p, q) => p.d - q.d).slice(0, n || 3);
  }

  function nearestStationOf(x, y) {
    let best = null, bd = Infinity;
    stations.forEach((s) => {
      const d = dist(s.x, s.y, x, y);
      if (d < bd) { bd = d; best = s; }
    });
    return best ? { s: best, d: bd } : null;
  }

  function nearestSpotOf(x, y) {
    let best = null, bd = Infinity;
    SPOTS.forEach((s) => {
      if (s._x === undefined) return;
      const d = dist(s._x, s._y, x, y);
      if (d < bd) { bd = d; best = s; }
    });
    return best ? { s: best, d: bd } : null;
  }

  function highlightRoadFor(sp) {
    allExits.forEach((e) => e._g.classList.remove('hi'));
    EXPRESSWAYS.forEach((r) => r._g.classList.remove('link'));
    if (!sp || !LAYERS.road) return;
    const ne = nearestExitOf(sp._x, sp._y);
    if (ne) {
      ne.e._g.classList.add('hi');
      ne.e.road._g.classList.add('link');
    }
  }

  function focusBikes(sp) {
    if (!LAYERS.bike) setLayer('bike', true);
    bikeFocus = sp;
    drawFocusRange(sp);
    applyBike(false);
    flyTo(sp._x, sp._y, Math.max(4.2, zoom));
    popOpen({
      ico: sp.icon, name: sp.name,
      cat: (CATEGORY[sp.cat] || {}).label || sp.cat,
      x: sp._x, y: sp._y
    }, spotPopHTML(sp), { sp: sp });
  }

  /* ---------- 图例 ---------- */
  const legendRows = $('#legendRows');
  LINES.slice().sort((a, b) => a.year - b.year).forEach((line) => {
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML = `<i style="background:${line.color}"></i>${line.name}<em>${line.year}</em>`;
    row.addEventListener('click', () => {
      pickedLine = (pickedLine === line.id) ? null : line.id;
      applyPickLine();
      if (pickedLine) renderDetailLine(line);
      else renderOverview();
    });
    legendRows.appendChild(row);
    line._row = row;
  });

  const legendRoads = $('#legendRoads');
  EXPRESSWAYS.slice().sort((a, b) => a.year - b.year).forEach((rd) => {
    const row = document.createElement('div');
    row.className = 'legend-row road';
    row.style.setProperty('--c', rd.color);
    row.innerHTML = `<i></i>${rd.name}<em>${rd.year}</em>`;
    row.addEventListener('click', () => {
      pickedRoad = (pickedRoad === rd.id) ? null : rd.id;
      applyPickRoad();
      if (pickedRoad) renderDetailRoad(rd);
      else renderOverview();
    });
    legendRoads.appendChild(row);
    rd._row = row;
  });
  if (legendEl) legendEl.classList.add('show-bike');

  let pickedLine = null;
  function applyPickLine() {
    LINES.forEach((l) => {
      l._g.classList.toggle('dim', pickedLine && pickedLine !== l.id);
      l._g.classList.toggle('focus', pickedLine === l.id);
      l._row.classList.toggle('pick', pickedLine === l.id);
    });
  }

  /* ---------- 年份 ---------- */
  const yearRange = $('#yearRange');
  let year = YEAR_START;
  let showLabels = true;
  let showSpots = true;

  const ticksBox = $('#ticks');
  YEAR_TICKS.forEach((y) => {
    const pct = (y - YEAR_START) / (YEAR_END - YEAR_START) * 100;
    const t = document.createElement('div');
    t.className = 'tick major';
    t.textContent = y;
    t.style.left = `calc(10px + ${pct}% - ${(pct * 0.2).toFixed(2)}px)`;
    t.addEventListener('click', () => setYear(y));
    ticksBox.appendChild(t);
    if (y === YEAR_END) t.classList.add('now');
  });

  function setYear(y, animate) {
    year = Math.max(YEAR_START, Math.min(YEAR_END, y));
    yearRange.value = year;
    const pct = (year - YEAR_START) / (YEAR_END - YEAR_START) * 100;
    yearRange.style.setProperty('--p', pct + '%');
    applyYear(animate !== false);
    renderStats();
    if (!selectedStation && !selectedSpot) renderOverview();
  }

  function stationOn(st) {
    return st.lines.some((id) => year >= lineById[id].year);
  }

  function applyYear(animate) {
    EXPRESSWAYS.forEach((rd, ri) => {
      const on = LAYERS.road && year >= rd.year;
      rd._g.classList.toggle('is-off', !on);
      rd._paths.forEach((n) => {
        n.style.strokeDashoffset = on ? 0 : rd._len;
        n.style.transitionDelay = (on && animate) ? (0.08 + ri * 0.07).toFixed(3) + 's' : '0s';
      });
      if (rd._row) rd._row.classList.toggle('live', on);
    });

    LINES.forEach((line, li) => {
      const on = year >= line.year;
      line._g.classList.toggle('is-off', !on);
      line._path.style.strokeDashoffset = on ? 0 : line._len;
      line._path.style.transitionDelay = (on && animate) ? (li * 0.05) + 's' : '0s';
      line._row.classList.toggle('live', on);
    });

    const keep = selectedStation || (selectedSpot ? selectedSpot.stationRef : null);
    stations.forEach((st, i) => {
      const on = stationOn(st);
      st._g.classList.toggle('is-on', on);
      st._g.classList.toggle('is-off', !on);
      st._s.classList.toggle('on', st === keep && on);
      st._g.style.transitionDelay = (on && animate)
        ? (0.2 + st.order * 0.006).toFixed(3) + 's' : '0s';
    });

    SPOTS.forEach((sp, i) => {
      if (!sp._g) return;
      const on = showSpots && sp.stationRef && sp.stationRef.lines.some((id) => year >= lineById[id].year);
      sp._g.classList.toggle('is-on', on);
      sp._g.classList.toggle('is-off', !on);
      sp._g.style.transitionDelay = (on && animate) ? (0.5 + i * 0.012).toFixed(3) + 's' : '0s';
    });

    if (selectedStation && !stationOn(selectedStation)) selectedStation = null;
    if (selectedSpot && selectedSpot.stationRef && !stationOn(selectedSpot.stationRef)) {
      selectedSpot = null;
      popClose();
    }

    applyBike(animate);
    if (popCtx && popCtx.sp && popCtx.sp.stationRef && !stationOn(popCtx.sp.stationRef)) popClose();
    if (bikeFocus && bikeFocus.stationRef && !stationOn(bikeFocus.stationRef)) {
      bikeFocus = null;
      clearFocusRange();
    }
  }

  function renderStats() {
    let n = 0, km = 0, stops = 0;
    LINES.forEach((l) => { if (year >= l.year) { n++; km += l.mileage; } });
    stations.forEach((st) => { if (st.lines.some((id) => year >= lineById[id].year)) stops++; });
    $('#statLines').textContent = n;
    $('#statKm').textContent = km.toFixed(1);
    $('#statStops').textContent = stops;
    let rn = 0, bn = 0;
    EXPRESSWAYS.forEach((r) => { if (year >= r.year) rn++; });
    bikes.forEach((b) => { if (year >= b.year) bn++; });

    $('#pLines').textContent = n;
    $('#pKm').textContent = km.toFixed(1);
    $('#pStops').textContent = stops;
    $('#pRoads').textContent = rn;
    $('#bikeCount').textContent = bn;
    $('#pYear').textContent = year;
    $('#tlYear').textContent = year;

    const ev = YEAR_EVENTS[year];
    if (ev) {
      $('#pEventT').textContent = ev.title;
      $('#pEventX').textContent = ev.text;
      $('#tlNote').textContent = n > 0
        ? n + ' 条地铁 · ' + rn + ' 条高速'
        : rn + ' 条高速 · ' + bn + ' 处单车点';
    } else if (year < 2012) {
      $('#pEventT').textContent = year < 1996 ? '纸上蓝图' : '路网先行';
      $('#pEventX').textContent = year + ' 年，苏州已有 ' + rn + ' 条高速公路、' + bn +
        ' 处自行车网点；地铁还要等到 2012 年。';
      $('#tlNote').textContent = rn + ' 条高速 · ' + bn + ' 处单车点';
    } else {
      const last = Object.keys(YEAR_EVENTS).map(Number).filter((y) => y <= year).sort((a, b) => b - a)[0];
      $('#pEventT').textContent = '稳步织网';
      $('#pEventX').textContent = '承接 ' + last + ' 年的' + YEAR_EVENTS[last].title.split(' · ')[0] +
        '，地铁与高速在此间延伸加密，单车网点也铺进各区。';
      $('#tlNote').textContent = n + ' 条地铁 · ' + rn + ' 条高速';
    }
  }

  /* ---------- 详情面板 ---------- */
  let selectedStation = null;
  let selectedSpot = null;

  function chipsHTML(ids) {
    return ids.map((id) => {
      const l = lineById[id];
      return `<span class="chip" style="background:${l.color}">${l.name}</span>`;
    }).join('');
  }

  function renderOverview() {
    $('#detailCap').textContent = '线网概览';
    const live = LINES.filter((l) => year >= l.year);
    if (!live.length) {
      $('#detailBody').innerHTML =
        `<div class="empty">${year} 年的苏州还没有地铁。<br>把时间滑块往右拖，看看第一条线路何时出现。</div>`;
      return;
    }
    const rows = live.map((l) =>
      `<div class="spot-row" data-line="${l.id}" style="cursor:pointer">
        <span class="ico" style="width:8px;height:8px;border-radius:4px;background:${l.color};display:inline-block"></span>
        <span class="nm">${l.name} · ${l.desc.split('：')[1] || ''}</span>
        <span class="wk">${l.mileage}km · ${l.date}</span>
      </div>`).join('');
    $('#detailBody').innerHTML =
      `<p class="detail-name">${live.length} 条线路</p>
       <div class="detail-meta">截至 ${year} 年 · 共 ${live.length} 线成网</div>
       <div class="spot-list">${rows}</div>`;
    $('#detailBody').querySelectorAll('.spot-row').forEach((r) => {
      r.addEventListener('click', () => {
        const id = r.getAttribute('data-line');
        pickedLine = (pickedLine === id) ? null : id;
        applyPickLine();
        if (pickedLine) renderDetailLine(lineById[id]);
      });
    });
  }

  function renderDetailLine(line) {
    $('#detailCap').textContent = '线路';
    const stops = line.stations.length;
    const hubs = line.stations.filter((s) => stationIndex[s[0]].lines.length > 1);
    $('#detailBody').innerHTML =
      `<p class="detail-name">${line.name}</p>
       <div class="detail-meta">${line.date} 开通 · ${line.mileage} 公里 · ${stops} 座车站</div>
       <div class="chips"><span class="chip" style="background:${line.color}">${line.name}</span>
         <span class="chip ghost">${line.desc}</span></div>
       <div class="detail-text">换乘站：${hubs.map((h) => h[0]).join('、')}</div>`;
  }

  function pickStation(st, noFly) {
    selectedStation = st;
    selectedSpot = null;
    stations.forEach((s) => s._s.classList.toggle('on', s === st));
    SPOTS.forEach((s) => s._g && s._g.classList.remove('pick'));
    bikes.forEach((b) => b._g.classList.remove('pick'));
    popClose();
    if (!noFly) flyTo(st.x, st.y, Math.max(zoom, 2.2));
    $('#detailCap').textContent = '车站';

    const live = st.lines.filter((id) => year >= lineById[id].year);
    const all = st.lines;
    let spotHTML = '';
    if (st.spots.length) {
      spotHTML = '<div class="spot-list">' + st.spots.map((s) => {
        const c = CATEGORY[s.cat] || { color: '#7C8791' };
        return `<div class="spot-row" data-spot="${s.id}">
            <span class="ico">${s.icon}</span>
            <span class="nm" style="border-left:3px solid ${c.color};padding-left:7px">${s.name}</span>
            <span class="wk">${s.walk}</span>
          </div>`;
      }).join('') + '</div>';
    } else {
      spotHTML = '<div class="hint-line" style="margin-top:10px">该站暂无收录的知名景点 · 街区。</div>';
    }

    $('#detailBody').innerHTML =
      `<p class="detail-name">${st.name}</p>
       <div class="detail-meta">${all.length > 1 ? '换乘站 · ' : ''}${year >= Math.min.apply(null, all.map((id) => lineById[id].year)) ? '运营中' : '尚未开通'}</div>
       <div class="chips">${chipsHTML(all)}${live.length < all.length ? '<span class="chip ghost">部分线路未开通</span>' : ''}</div>
       <div class="detail-text">${all.map((id) => lineById[id].desc).join('<br>')}</div>
       <h3 style="margin-top:16px">周边景点 · 街区</h3>
       ${spotHTML}
       <button class="goto-btn" id="btnFlyStation">在地图上放大定位</button>`;

    $('#detailBody').querySelectorAll('.spot-row').forEach((r) => {
      r.addEventListener('click', () => {
        const sp = SPOTS.find((s) => s.id === r.getAttribute('data-spot'));
        if (sp) pickSpot(sp);
      });
    });
    const fb = $('#btnFlyStation');
    if (fb) fb.addEventListener('click', () => flyTo(st.x, st.y, Math.max(zoom, 2.6)));
  }

  function pickSpot(sp, noFly) {
    selectedSpot = sp;
    selectedStation = null;
    SPOTS.forEach((s) => s._g && s._g.classList.toggle('pick', s === sp));
    stations.forEach((s) => s._s.classList.toggle('on', s === sp.stationRef));
    bikes.forEach((b) => b._g.classList.remove('pick'));
    if (!noFly) flyTo(sp._x, sp._y, Math.max(zoom, 2.4));
    highlightRoadFor(sp);
    popOpen({
      ico: sp.icon, name: sp.name,
      cat: (CATEGORY[sp.cat] || {}).label || sp.cat,
      x: sp._x, y: sp._y
    }, spotPopHTML(sp), { sp: sp });
    if (bikeFocus && bikeFocus !== sp) {
      bikeFocus = null;
      clearFocusRange();
      applyBike(false);
    }
  }

  let spotTimer = 0, spotPending = null;
  function spotClick(sp) {
    if (spotTimer) {                       // 已经在等第二次点击
      clearTimeout(spotTimer); spotTimer = 0;
      const same = spotPending === sp;
      spotPending = null;
      if (same) { focusBikes(sp); return; } // 双击同一图标 → 看周边单车
      pickSpot(sp);                         // 连点不同图标 → 直接选中新的
      return;
    }
    spotPending = sp;
    spotTimer = setTimeout(() => {
      spotTimer = 0; spotPending = null;
      pickSpot(sp);                         // 单击 → 显示景点介绍
    }, 240);
  }

  /* ---------- 弹窗内容 ---------- */
  function spotPopHTML(sp) {
    const st = sp.stationRef;
    const c = CATEGORY[sp.cat] || { color: '#7C8791', label: sp.cat };
    const opened = st.lines.some((id) => year >= lineById[id].year);
    const openYear = Math.min.apply(null, st.lines.map((id) => lineById[id].year));

    const facts = [];
    if (sp.ticket) facts.push(['门票', sp.ticket]);
    if (sp.hours) facts.push(['开放', sp.hours]);
    if (sp.duration) facts.push(['时长', sp.duration]);
    if (sp.season) facts.push(['最佳', sp.season]);
    facts.push(['到达', st.name + '站 · ' + sp.walk + (opened ? '' : '（' + openYear + ' 年通车）')]);

    const ne = LAYERS.road ? nearestExitOf(sp._x, sp._y) : null;
    const bks = LAYERS.bike ? nearestBikesOf(sp._x, sp._y, 3) : [];
    const hl = (sp.highlights || []).map((h) => `<span>${h}</span>`).join('');

    return `
      <p class="pop-lead" style="border-color:${c.color}">${sp.intro}</p>
      <div class="pop-sec">景点介绍</div>
      <div class="pop-text">${sp.detail || ''}</div>
      ${hl ? '<div class="pop-sec">看 点</div><div class="pop-hl">' + hl + '</div>' : ''}
      <div class="pop-sec">实用信息</div>
      <dl class="pop-facts">${facts.map((f) => `<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join('')}</dl>
      <div class="pop-row" data-act="station" data-id="${st.name}">
        <span>🚇</span><span class="nm">${st.name}站</span>
        <span class="wk">${opened ? '已开通' : openYear + ' 年开通'}</span>
      </div>
      ${ne ? `<div class="pop-sec">最近高速出口</div>
        <div class="pop-row road" data-act="exit" data-id="${ne.e.name}" data-road="${ne.e.road.id}">
          <span>🛣</span><span class="nm">${ne.e.name}</span>
          <span class="wk">${ne.e.road.name} · ${mText(ne.d)}</span>
        </div>` : ''}
      ${bks.length ? `<div class="pop-sec">周边单车点${bikeFocus === sp ? ' · 运营范围内' : ''}</div>` +
        bks.map((p) => `<div class="pop-row bike" data-act="bike" data-id="${p.b.id}">
            <span>🚲</span><span class="nm">${p.b.name}</span>
            <span class="wk">${BIKE_KIND[p.b.kind]} · ${p.b.cap} 位 · ${mText(p.d)}</span>
          </div>`).join('') : ''}
      <div class="pop-btns">
        <button class="pop-btn tinted" data-act="bikefocus">${bikeFocus === sp ? '重新聚焦单车' : '放大看周边单车'}</button>
        <button class="pop-btn" data-act="reset">回到全景</button>
      </div>`;
  }

  function bikePopHTML(bk) {
    const ns = nearestStationOf(bk.x, bk.y);
    const np = nearestSpotOf(bk.x, bk.y);
    const ne = LAYERS.road ? nearestExitOf(bk.x, bk.y) : null;
    return `
      <p class="pop-lead" style="border-color:#2F7C6E">${BIKE_KIND[bk.kind]} · 约 ${bk.cap} 个车位</p>
      <div class="pop-text">${bk.year} 年投用。${bk.kind === 'public'
        ? '有桩网点，刷卡或扫码租还，适合通勤接驳。'
        : '电子围栏内随取随还，骑车进景区、串老街最方便。'}</div>
      <div class="pop-sec">网点信息</div>
      <dl class="pop-facts">
        <dt>投用</dt><dd>${bk.year} 年</dd>
        <dt>类型</dt><dd>${BIKE_KIND[bk.kind]}</dd>
        <dt>车位</dt><dd>约 ${bk.cap} 个</dd>
        ${ns ? `<dt>最近地铁</dt><dd>${ns.s.name}站 · ${mText(ns.d)}</dd>` : ''}
      </dl>
      ${np ? `<div class="pop-sec">最近景点</div>
        <div class="pop-row" data-act="spot" data-id="${np.s.id}">
          <span>${np.s.icon}</span><span class="nm">${np.s.name}</span>
          <span class="wk">${mText(np.d)}</span>
        </div>` : ''}
      ${ne ? `<div class="pop-sec">最近高速出口</div>
        <div class="pop-row road" data-act="exit" data-id="${ne.e.name}" data-road="${ne.e.road.id}">
          <span>🛣</span><span class="nm">${ne.e.name}</span>
          <span class="wk">${ne.e.road.name} · ${mText(ne.d)}</span>
        </div>` : ''}
      <div class="pop-btns">
        <button class="pop-btn" data-act="reset">回到全景</button>
      </div>`;
  }

  function exitPopHTML(e) {
    const rd = e.road;
    const live = year >= rd.year;
    const near = SPOTS.filter((s) => s._x !== undefined && distToPolyline(s._x, s._y, rd.pts) < 170)
      .map((s) => ({ s: s, d: dist(s._x, s._y, e.x, e.y) }))
      .sort((a, b) => a.d - b.d).slice(0, 4);
    const bks = LAYERS.bike ? nearestBikesOf(e.x, e.y, 2) : [];
    return `
      <p class="pop-lead" style="border-color:${rd.color}">${rd.full}</p>
      <div class="pop-text">${rd.desc}</div>
      <div class="pop-sec">出口信息</div>
      <dl class="pop-facts">
        <dt>编号</dt><dd>${rd.code}</dd>
        <dt>通车</dt><dd>${rd.date}${live ? '　已通车' : '　（' + rd.year + ' 年通车）'}</dd>
        <dt>里程</dt><dd>境内约 ${rd.mileage} 公里</dd>
      </dl>
      ${near.length ? '<div class="pop-sec">沿线景点 · 街区</div>' + near.map((p) =>
        `<div class="pop-row" data-act="spot" data-id="${p.s.id}">
            <span>${p.s.icon}</span><span class="nm">${p.s.name}</span>
            <span class="wk">${mText(p.d)}</span>
          </div>`).join('') : ''}
      ${bks.length ? '<div class="pop-sec">出口附近单车点</div>' + bks.map((p) =>
        `<div class="pop-row bike" data-act="bike" data-id="${p.b.id}">
            <span>🚲</span><span class="nm">${p.b.name}</span>
            <span class="wk">${mText(p.d)}</span>
          </div>`).join('') : ''}
      <div class="pop-btns">
        <button class="pop-btn tinted" data-act="road" data-id="${rd.id}">高亮这条高速</button>
        <button class="pop-btn" data-act="reset">回到全景</button>
      </div>`;
  }

  function pickBike(bk) {
    bikes.forEach((b) => b._g.classList.toggle('pick', b === bk));
    if (zoom < 2.1) flyTo(bk.x, bk.y, 2.8);
    popOpen({
      ico: '🚲', name: bk.name, cat: BIKE_KIND[bk.kind], x: bk.x, y: bk.y
    }, bikePopHTML(bk), { bike: bk });
  }

  function pickExit(e) {
    allExits.forEach((x) => x._g.classList.toggle('hi', x === e));
    if (zoom < 2.4) flyTo(e.x, e.y, 2.8);
    popOpen({
      ico: '🛣', name: e.name, cat: e.road.name + ' · ' + e.road.code, x: e.x, y: e.y
    }, exitPopHTML(e), { exit: e });
  }

  function renderDetailRoad(rd) {
    $('#detailCap').textContent = '高速公路';
    const live = year >= rd.year;
    const near = SPOTS.filter((s) => s._x !== undefined && distToPolyline(s._x, s._y, rd.pts) < 180)
      .map((s) => ({ s: s, d: distToPolyline(s._x, s._y, rd.pts) }))
      .sort((a, b) => a.d - b.d).slice(0, 8);
    const rows = near.length
      ? '<div class="spot-list">' + near.map((p) => {
        const c = CATEGORY[p.s.cat] || { color: '#7C8791' };
        return `<div class="spot-row" data-spot="${p.s.id}">
            <span class="ico">${p.s.icon}</span>
            <span class="nm" style="border-left:3px solid ${c.color};padding-left:7px">${p.s.name}</span>
            <span class="wk">距线路 ${mText(p.d)}</span>
          </div>`;
      }).join('') + '</div>'
      : '<div class="hint-line" style="margin-top:10px">该高速沿线暂无收录的景点 · 街区。</div>';

    $('#detailBody').innerHTML =
      `<p class="detail-name">${rd.code} ${rd.name}</p>
       <div class="detail-meta" style="color:${rd.color}">${rd.full}</div>
       <div class="chips"><span class="chip" style="background:${rd.color}">${rd.year} 年通车</span>
         <span class="chip ghost">${live ? '已通车' : rd.year + ' 年通车'}</span>
         <span class="chip ghost">境内约 ${rd.mileage} 公里</span></div>
       <div class="detail-text">${rd.desc}</div>
       <h3 style="margin-top:16px">沿线景点 · 街区</h3>
       ${rows}
       <div class="detail-text" style="margin-top:14px">出口：${rd.exits.map((x) => x[0]).join('、')}</div>`;
    $('#detailBody').querySelectorAll('.spot-row').forEach((r) => {
      r.addEventListener('click', () => {
        const sp = SPOTS.find((s) => s.id === r.getAttribute('data-spot'));
        if (sp) pickSpot(sp);
      });
    });
  }

  /* ---------- tooltip ---------- */
  const tip = $('#tip');
  function showTip(e, html) { tip.innerHTML = html; tip.classList.add('on'); moveTip(e); }
  function moveTip(e) { tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY - 12 + 'px'; }
  function hideTip() { tip.classList.remove('on'); }

  /* ---------- 开关 ---------- */
  $('#btnLabels').addEventListener('click', (e) => {
    showLabels = !showLabels;
    e.currentTarget.classList.toggle('on', showLabels);
    svg.classList.toggle('no-labels', !showLabels);
    document.querySelectorAll('.st-label').forEach((t) => {
      t.style.display = showLabels ? '' : 'none';
    });
  });

  $('#btnSpots').addEventListener('click', (e) => {
    showSpots = !showSpots;
    e.currentTarget.classList.toggle('on', showSpots);
    applyYear(false);
  });

  $('#btnBack').addEventListener('click', backToHero);

  /* ---------- 时间滑块 ---------- */
  yearRange.addEventListener('input', () => { stopPlay(); setYear(+yearRange.value); });

  let timer = null;
  const btnPlay = $('#btnPlay');
  function stopPlay() {
    if (timer) { clearInterval(timer); timer = null; btnPlay.textContent = '▶'; }
  }
  btnPlay.addEventListener('click', () => {
    if (timer) { stopPlay(); return; }
    if (year >= YEAR_END) setYear(YEAR_START);
    btnPlay.textContent = '❚❚';
    timer = setInterval(() => {
      if (year >= YEAR_END) { stopPlay(); return; }
      setYear(year + 1);
    }, 620);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#spotPop').hidden) { popClose(); return; }
    if (stage.classList.contains('is-on')) {
      if (e.key === 'ArrowRight') { stopPlay(); setYear(year + 1); }
      else if (e.key === 'ArrowLeft') { stopPlay(); setYear(year - 1); }
      else if (e.key === ' ') { e.preventDefault(); btnPlay.click(); }
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      enterMap();
    }
  });

  /* ---------- 进入 / 返回 ---------- */
  const hero = $('#hero');
  const stage = $('#stage');
  let entered = false;
  let lastWheel = 0;

  function enterMap() {
    if (entered) return;
    entered = true;
    hero.classList.add('is-out');
    stage.classList.add('is-on');
    setYear(YEAR_START, true);
    setTimeout(() => setYear(2012, true), 400);
    setTimeout(() => { hero.style.display = 'none'; }, 1100);
    setTimeout(hideHint, 7000);
  }

  function backToHero() {
    entered = false;
    stopPlay();
    popClose();
    resetView();
    hero.style.display = '';
    requestAnimationFrame(() => { hero.classList.remove('is-out'); });
    stage.classList.remove('is-on');
    setYear(YEAR_START, false);
  }

  hero.addEventListener('click', enterMap);
  window.addEventListener('wheel', (e) => {
    if (!entered) { if (Math.abs(e.deltaY) > 6) enterMap(); return; }
    if (Math.abs(e.deltaY) < 4) return;
    const t = e.target;
    const inMap = t.closest && t.closest('#map');
    const inTL = t.closest && t.closest('#timeline');
    if (inMap || !inTL) return;          // 地图内滚轮交给缩放处理
    const now = Date.now();
    if (now - lastWheel < 140) return;
    lastWheel = now;
    stopPlay();
    setYear(year + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });

  svg.addEventListener('click', (e) => {
    if (justDragged) {                    // 刚拖动过，不触发选中
      justDragged = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (e.target === svg) {
      selectedStation = null;
      selectedSpot = null;
      stations.forEach((s) => s._s.classList.remove('on'));
      SPOTS.forEach((s) => s._g && s._g.classList.remove('pick'));
      bikes.forEach((b) => b._g.classList.remove('pick'));
      allExits.forEach((x) => x._g.classList.remove('hi'));
      EXPRESSWAYS.forEach((r) => r._g.classList.remove('link'));
      bikeFocus = null;
      clearFocusRange();
      applyBike(false);
      popClose();
      pickedLine = null;
      applyPickLine();
      renderOverview();
    }
  }, true);

  /* ---------- 初始 ---------- */
  setYear(YEAR_START, false);
  applyPickLine();
  applyPickRoad();
  applyView();
})();
