'use strict';
/* Карта анализа на MapLibre GL: векторные тайлы OpenFreeMap, слои сценария и анимации. */
(function (A) {
  const M = A.map = { map: null, ready: false, failed: false, markers: {}, trucks: [], truckTimer: 0, hexK: 0, hexAnim: 0 };
  const KX = A.KX;
  const BOUNDS = [[36.62, 54.84], [38.36, 55.99]];
  const HEX_H = 30000;

  const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };

  /* ---- геометрия маршрутов ---- */
  const prep = path => {
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot((path[i][0] - path[i - 1][0]) * KX, path[i][1] - path[i - 1][1]));
    return { path, cum, len: cum[cum.length - 1] };
  };
  const at = (r, f) => {
    const d = A.clamp(f, 0, 1) * r.len, c = r.cum;
    let lo = 0, hi = c.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (c[mid] <= d) lo = mid; else hi = mid; }
    const seg = c[hi] - c[lo] || 1e-9, t = (d - c[lo]) / seg, p = r.path[lo], q = r.path[hi];
    return { lng: p[0] + (q[0] - p[0]) * t, lat: p[1] + (q[1] - p[1]) * t, idx: lo, bearing: Math.atan2((q[0] - p[0]) * KX, q[1] - p[1]) * 180 / Math.PI };
  };
  const slice = (r, f) => {
    if (f >= 1) return r.path;
    const p = at(r, f);
    return r.path.slice(0, p.idx + 1).concat([[p.lng, p.lat]]);
  };

  let routes = null;
  const getRoutes = () => {
    if (routes) return routes;
    const rnd = A.rng(45), ranks = A.roadRoutes.map((_, i) => i).sort(() => rnd() - .5);
    routes = A.roadRoutes.map((r, i) => ({ ...prep(r.path), z: r.z, km: r.km, min: r.min, stops: r.stops, rank: ranks.indexOf(i), color: A.zones[r.z].color }));
    return routes;
  };
  M.routes = getRoutes;

  const fc = features => ({ type: 'FeatureCollection', features });
  const routeFeatures = f => getRoutes().map(r => ({ type: 'Feature', properties: { z: r.z, rank: r.rank, color: r.color }, geometry: { type: 'LineString', coordinates: slice(r, f) } }));

  /* Перебор вариантов: дуги от РЦ к случайным точкам. */
  let arcs = null;
  const getArcs = () => {
    if (arcs) return arcs;
    const P = A.points(), rnd = A.rng(99), hub = A.scenario.hub;
    arcs = Array.from({ length: 160 }, () => {
      const i = Math.floor(rnd() * P.n), x = P.lng[i], y = P.lat[i];
      const mx = (hub.lng + x) / 2, my = (hub.lat + y) / 2, dx = (x - hub.lng) * KX, dy = y - hub.lat, k = (rnd() - .5) * .5;
      const cx = mx - dy * k / KX, cy = my + dx * k;
      const coords = [];
      for (let t = 0; t <= 1.0001; t += 1 / 24) coords.push([(1 - t) * (1 - t) * hub.lng + 2 * (1 - t) * t * cx + t * t * x, (1 - t) * (1 - t) * hub.lat + 2 * (1 - t) * t * cy + t * t * y]);
      return { type: 'Feature', properties: { z: P.zone[i] }, geometry: { type: 'LineString', coordinates: coords } };
    });
    return arcs;
  };

  /* ---- картинки для символьных слоёв ---- */
  const canvasImage = (w, h, draw) => {
    const s = 2, c = document.createElement('canvas');
    c.width = w * s; c.height = h * s;
    const g = c.getContext('2d'); g.scale(s, s); draw(g);
    return { width: w * s, height: h * s, data: g.getImageData(0, 0, w * s, h * s).data };
  };
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const truckImage = () => canvasImage(46, 22, g => {
    g.shadowColor = 'rgba(16,24,40,.35)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
    g.fillStyle = '#FFFFFF'; rr(g, 3, 3, 28, 16, 3); g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = '#9FB6CC'; g.lineWidth = 1.2; rr(g, 3, 3, 28, 16, 3); g.stroke();
    g.fillStyle = '#1C2D3C'; rr(g, 32, 4, 11, 14, 3.5); g.fill();
    g.fillStyle = '#B8CFE6'; rr(g, 38.5, 6, 3, 10, 1.2); g.fill();
    g.fillStyle = '#5880A6'; rr(g, 6, 7, 22, 2.4, 1.2); g.fill(); rr(g, 6, 12.6, 14, 2.4, 1.2); g.fill();
  });
  const dotImage = color => canvasImage(14, 14, g => {
    g.fillStyle = '#FFFFFF'; rr(g, 0, 0, 14, 14, 4.5); g.fill();
    g.fillStyle = color; rr(g, 2, 2, 10, 10, 3); g.fill();
  });

  /* Маркер: внешний элемент двигает MapLibre, внутренний оформляем сами. */
  function marker(html, lngLat, cls, anchor = 'center') {
    const el = document.createElement('div'), inner = document.createElement('div');
    inner.className = cls; inner.innerHTML = html; el.appendChild(inner);
    new maplibregl.Marker({ element: el, anchor }).setLngLat(lngLat).addTo(M.map);
    return inner;
  }

  M.init = function (container) {
    if (M.initPromise) return M.initPromise;
    M.initPromise = new Promise(resolve => {
      if (typeof maplibregl === 'undefined' || !webgl()) { M.failed = true; return resolve(false); }
      let done = false;
      const finish = ok => { if (!done) { done = true; resolve(ok); } };
      try {
        M.map = new maplibregl.Map({
          container, style: 'assets/map/atlas-light.json', bounds: BOUNDS,
          fitBoundsOptions: { padding: M.padding() }, attributionControl: false,
          maxPitch: 65, fadeDuration: 150, canvasContextAttributes: { antialias: true }
        });
      } catch (e) { M.failed = true; return finish(false); }
      M.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Маршруты: OSRM' }), 'bottom-right');
      M.map.on('error', e => {
        (M.errors = M.errors || []).push(String(e?.error?.message || e?.error || e));
        console.warn('Карта:', e?.error?.message || e);
        if (!M.styleOk && !M.ready) { M.failed = true; finish(false); }
      });
      /* Слои добавляем сразу после стиля: тайлы подгружаются следом и не задерживают анализ. */
      M.map.once('style.load', () => {
        M.styleOk = true;
        try { setup(); } catch (e) { console.error(e); M.failed = true; return finish(false); }
        M.ready = true;
        if (M.failed) { M.failed = false; M.onLate && M.onLate(); }
        finish(true);
      });
      setTimeout(() => { if (!M.ready) { (M.errors = M.errors || []).push('timeout'); M.failed = true; finish(false); } }, 15000);
    });
    return M.initPromise;
  };

  M.padding = () => {
    const w = window.innerWidth;
    if (w < 860) return { top: 30, bottom: 30, left: 20, right: 20 };
    return { top: 60, bottom: 80, left: Math.min(450, w * .34), right: 70 };
  };

  function setup() {
    const map = M.map, P = A.points(), hub = A.scenario.hub;
    const before = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
    map.addImage('truck', truckImage(), { pixelRatio: 2 });
    A.zones.forEach(z => map.addImage('zdot-' + z.id, dotImage(z.color), { pixelRatio: 2 }));

    const pts = new Array(P.n);
    for (let i = 0; i < P.n; i++) pts[i] = { type: 'Feature', properties: { z: P.zone[i], w: Math.round(P.dist[i] * 1000) / 1000 }, geometry: { type: 'Point', coordinates: [P.lng[i], P.lat[i]] } };
    map.addSource('points', { type: 'geojson', data: fc(pts), buffer: 0, tolerance: 0, maxzoom: 13 });
    map.addLayer({ id: 'pts', type: 'circle', source: 'points', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, .9, 9, 1.7, 11, 2.8, 14, 4.6],
      'circle-color': '#5880A6', 'circle-opacity': 0, 'circle-pitch-alignment': 'map'
    } }, before);

    map.addSource('hex', { type: 'geojson', data: A.hexbins() });
    map.addLayer({ id: 'hex-flat', type: 'fill', source: 'hex', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0, 'fill-opacity-transition': { duration: 600 } } }, 'pts');
    map.addLayer({ id: 'hex', type: 'fill-extrusion', source: 'hex', paint: {
      'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': 0, 'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0, 'fill-extrusion-opacity-transition': { duration: 450 }, 'fill-extrusion-vertical-gradient': true
    } }, before);

    map.addSource('search', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'search', type: 'line', source: 'search', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#33506B', 'line-width': 1.1, 'line-opacity': .32 } }, before);

    map.addSource('routes', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4.6, 12, 8.5], 'line-opacity': .95 } }, before);
    map.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['interpolate', ['linear'], ['zoom'], 10, '#1F3347', 12, ['get', 'color']], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.9, 12, 4.5] } }, before);

    map.addSource('trucks', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'trucks', type: 'symbol', source: 'trucks', layout: {
      'icon-image': 'truck', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, .82, 11, 1, 14, 1.25],
      'icon-rotate': ['get', 'b'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true
    } });

    map.addSource('zone-labels', { type: 'geojson', data: fc(A.zones.map(z => ({ type: 'Feature', properties: { z: z.id, name: z.name, count: A.fmt(P.zoneCount[z.id]) + ' заявок', rank: -P.zoneCount[z.id] }, geometry: { type: 'Point', coordinates: z.label } }))) });
    map.addLayer({ id: 'zone-labels', type: 'symbol', source: 'zone-labels', layout: {
      'text-field': ['format', ['get', 'name'], {}, '\n', {}, ['get', 'count'], { 'font-scale': .82, 'text-font': ['literal', ['Noto Sans Regular']], 'text-color': '#6B737D' }],
      'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12.5, 11, 14.5],
      'text-anchor': 'left', 'text-justify': 'left', 'text-offset': [.95, 0], 'text-line-height': 1.25, 'text-padding': 6,
      'icon-image': ['concat', 'zdot-', ['to-string', ['get', 'z']]], 'icon-anchor': 'center',
      'symbol-sort-key': ['get', 'rank']
    }, paint: {
      'text-color': '#1C1F20', 'text-halo-color': 'rgba(255,255,255,.96)', 'text-halo-width': 1.8, 'text-halo-blur': .3,
      'text-opacity': 0, 'icon-opacity': 0, 'text-opacity-transition': { duration: 500 }, 'icon-opacity-transition': { duration: 500 }
    } });

    M.markers.hub = marker(`<span class="hub-pulse"></span><span class="hub-pulse d2"></span><span class="hub-core">${A.icon('warehouse', 18)}</span><span class="hub-label"><b>${hub.name}</b><small>${A.fmt(A.scenario.orders)} заявок</small></span>`, [hub.lng, hub.lat], 'hub-marker');
    M.markers.weather = marker(`<span class="wx-ico">${A.icon('snow', 15)}</span><span><b>Снег у Домодедово</b><small>+12% ко времени в пути</small></span>`, [37.97, 55.35], 'wx-marker', 'left');
  }

  M.resize = () => { if (M.map) M.map.resize(); };

  /* ---- состояния слоёв ---- */
  const has = () => M.ready && M.map;
  const paint = (layer, prop, value) => { if (has()) M.map.setPaintProperty(layer, prop, value); };
  M.reset = () => {
    if (!has()) return;
    cancelAnimationFrame(M.hexAnim); M.hexK = 0;
    paint('pts', 'circle-opacity', 0);
    paint('pts', 'circle-color', '#5880A6');
    paint('hex', 'fill-extrusion-height', 0);
    paint('hex', 'fill-extrusion-opacity', 0);
    paint('hex-flat', 'fill-opacity', 0);
    M.map.getSource('search').setData(fc([]));
    M.map.getSource('routes').setData(fc([]));
    M.map.setFilter('routes', null); M.map.setFilter('routes-casing', null);
    M.stopTrucks();
    M.zoneLabels(false);
    M.markers.weather.classList.remove('is-on');
    M.markers.hub.classList.remove('is-active', 'is-quiet');
  };
  /* Итоговая картина анализа без анимаций — для карты, которая догрузилась позже. */
  M.finalState = v => {
    if (!has()) return;
    M.revealPoints(1); M.colorPoints(); M.pointsOpacity(.35); M.hexTo(0, 0, 0); M.carpet(true);
    M.drawRoutes(1); M.showVariant(v); M.zoneLabels(true); M.hubQuiet(true);
  };
  M.revealPoints = t => paint('pts', 'circle-opacity', t >= 1 ? .8 : ['case', ['<', ['get', 'w'], t], .8, 0]);
  M.pointsOpacity = v => paint('pts', 'circle-opacity', v);
  M.colorPoints = () => paint('pts', 'circle-color', ['match', ['get', 'z'], ...A.zones.flatMap(z => [z.id, z.color]), '#5880A6']);
  M.zoneLabels = on => { paint('zone-labels', 'text-opacity', on ? 1 : 0); paint('zone-labels', 'icon-opacity', on ? 1 : 0); };
  M.hubActive = on => { if (has()) M.markers.hub.classList.toggle('is-active', on); };
  M.hubQuiet = on => { if (has()) M.markers.hub.classList.toggle('is-quiet', on); };
  M.weather = on => { if (has()) M.markers.weather.classList.toggle('is-on', on); };

  /* Высота столбиков плотности: k — доля от полной высоты, анимируется покадрово. */
  M.carpet = on => paint('hex-flat', 'fill-opacity', on ? ['interpolate', ['linear'], ['get', 'k'], 0, .22, 1, .62] : 0);
  M.hexTo = (k, ms = 700, opacity = .9) => {
    if (!has()) return;
    paint('hex', 'fill-extrusion-opacity', opacity);
    cancelAnimationFrame(M.hexAnim);
    const from = M.hexK, t0 = performance.now();
    const step = now => {
      const f = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
      M.hexK = from + (k - from) * A.ease.out(f);
      paint('hex', 'fill-extrusion-height', ['*', ['get', 'k'], HEX_H * M.hexK]);
      if (f < 1) M.hexAnim = requestAnimationFrame(step);
    };
    M.hexAnim = requestAnimationFrame(step);
  };

  M.search = on => {
    if (!has()) return;
    const src = M.map.getSource('search'), all = getArcs();
    if (!on) { src.setData(fc([])); return; }
    const k = Math.floor(Math.random() * all.length);
    src.setData(fc(all.filter((_, i) => (i + k) % 3 === 0).slice(0, 60)));
  };
  M.drawRoutes = f => { if (has()) M.map.getSource('routes').setData(fc(routeFeatures(f))); };
  M.showVariant = v => {
    if (!has()) return;
    const n = Math.round(getRoutes().length * v.routeShare), filter = ['<', ['get', 'rank'], n];
    M.map.setFilter('routes', filter); M.map.setFilter('routes-casing', filter);
    M.visibleRoutes = n;
  };

  /* ---- камера ---- */
  M.fit = (duration = 1200) => { if (has()) M.map.fitBounds(BOUNDS, { padding: M.padding(), duration, pitch: M.map.getPitch(), bearing: M.map.getBearing() }); };
  M.cinematic = ms => {
    if (!has() || A.reducedMotion()) return;
    const cam = M.map.cameraForBounds(BOUNDS, { padding: M.padding() });
    M.map.easeTo({ center: cam.center, zoom: cam.zoom + .3, pitch: 54, bearing: -16, duration: ms, easing: t => A.ease.inOut(t) });
  };
  M.settle = () => {
    if (!has()) return;
    const cam = M.map.cameraForBounds(BOUNDS, { padding: M.padding() });
    M.map.easeTo({ center: cam.center, zoom: cam.zoom, pitch: 35, bearing: -10, duration: 1200 });
  };
  M.toggle3d = () => { if (!has()) return false; const flat = M.map.getPitch() < 10; M.map.easeTo({ pitch: flat ? 50 : 0, bearing: flat ? -16 : 0, duration: 700 }); return flat; };
  M.isPitched = () => has() && M.map.getPitch() >= 10;
  M.zoom = d => { if (has()) M.map.easeTo({ zoom: M.map.getZoom() + d, duration: 300 }); };

  /* ---- машины в пути ---- */
  M.startTrucks = (count = 90) => {
    if (!has()) return;
    const rs = getRoutes().filter(r => r.rank < (M.visibleRoutes || 45)), rnd = A.rng(7);
    M.trucks = Array.from({ length: count }, (_, i) => ({ r: rs[i % rs.length], p: rnd(), s: .018 + rnd() * .014 }));
    M.truckLimit = 0;
    cancelAnimationFrame(M.truckTimer);
    let last = 0;
    const tick = now => {
      M.truckTimer = requestAnimationFrame(tick);
      if (now - last < 50) return;
      last = now;
      const t = now / 1000, feats = [];
      for (let i = 0; i < Math.min(M.trucks.length, M.truckLimit); i++) {
        const k = M.trucks[i], ph = (k.p + t * k.s) % 2, out = ph < 1, f = out ? ph : 2 - ph;
        const pos = at(k.r, A.ease.inOut(f));
        feats.push({ type: 'Feature', properties: { b: (out ? pos.bearing : pos.bearing + 180) - 90 }, geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] } });
      }
      const src = M.map.getSource('trucks'); if (src) src.setData(fc(feats));
    };
    M.truckTimer = requestAnimationFrame(tick);
  };
  M.setTruckLimit = n => { M.truckLimit = n; };
  M.stopTrucks = () => { cancelAnimationFrame(M.truckTimer); M.trucks = []; if (has()) M.map.getSource('trucks').setData(fc([])); };
})(Atlas);
