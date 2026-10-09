'use strict';
/* Шаг 3 — анализ пакета за ~5 секунд, развилка из трёх вариантов, рассылка и мониторинг дня. */
(function (A) {
  const S = A.stage = { phase: 'idle', variant: 'B', elapsed: 0, raf: 0, timers: [], duration: 0, accepted: 0, simMin: 0 };
  const TOTAL = 5000;
  const PH = [
    { name: 'Читаем пакет', detail: 'Вес, места и окна приёмки', t0: 0, t1: 650, value: () => A.fmt(A.scenario.orders) },
    { name: 'Наносим точки на карту', detail: 'Адреса вокруг РЦ Подольск', t0: 650, t1: 1500, value: () => A.fmt(A.scenario.orders) },
    { name: 'Делим на зоны', detail: 'По плотности заявок', t0: 1500, t1: 2250, value: () => A.zones.length + ' зон' },
    { name: 'Перебираем маршруты', detail: 'М2, М4, ЦКАД · снег у Домодедово', t0: 2250, t1: 3250, value: () => '1,8 млн' },
    { name: 'Собираем рейсы', detail: 'Вместимость машин и окна', t0: 3250, t1: 4100, value: () => A.fmt(variant().routes) },
    { name: 'Сравниваем ставки', detail: 'Перевозчики и свой парк', t0: 4100, t1: 4700, value: () => A.enabledCarriers().length + ' ставок' },
    { name: 'Готовим три варианта', detail: 'Цена, рейсы и сроки', t0: 4700, t1: 5000, value: () => '3 плана' }
  ];
  const variant = id => A.scenario.variants.find(v => v.id === (id || S.variant));
  const panel = () => document.getElementById('panel');
  const $ = id => document.getElementById(id);
  /* Часы анимации: стартуют с первого показанного кадра и не идут, пока вкладка скрыта.
     Медленные кадры паузой не считаются — только событие visibilitychange. */
  const clock = () => {
    let t0 = null, hiddenAt = 0, shift = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt) { shift += performance.now() - hiddenAt; hiddenAt = 0; }
    };
    document.addEventListener('visibilitychange', onVis);
    S.clockStop = () => document.removeEventListener('visibilitychange', onVis);
    return now => { if (t0 === null) t0 = now; return now - t0 - shift; };
  };
  const clearTimers = () => { S.timers.forEach(clearTimeout); S.timers = []; cancelAnimationFrame(S.raf); clearInterval(S.liveTimer); S.clockStop && S.clockStop(); };

  /* ---------- оболочка шага ---------- */
  A.renderStage = function () {
    const el = document.getElementById('stage');
    if (el.dataset.ready) return;
    el.dataset.ready = '1';
    el.innerHTML = `
      <div class="stage-map" id="map"></div>
      <div class="map-fallback" id="map-fallback" hidden><div>${A.icon('globe', 28)}<b>Карта не загрузилась</b><span>Для карты нужен интернет и браузер с 3D-графикой. Анализ и варианты работают и без неё</span></div></div>
      <div class="map-shade"></div>
      <aside class="panel" id="panel" aria-live="polite"></aside>
      <div class="map-tools" role="group" aria-label="Управление картой">
        <button class="tool" data-tool="in" aria-label="Приблизить">${A.icon('plus', 18)}</button>
        <button class="tool" data-tool="out" aria-label="Отдалить">${A.icon('minus', 18)}</button>
        <button class="tool tool-text" data-tool="3d" aria-label="Наклон карты">3D</button>
        <button class="tool" data-tool="fit" aria-label="Показать весь пакет">${A.icon('target', 18)}</button>
      </div>
      <div class="map-legend" id="legend"></div>
      <div class="day-hud" id="day-hud" hidden></div>`;
    el.querySelector('.map-tools').addEventListener('click', e => {
      const b = e.target.closest('[data-tool]'); if (!b) return;
      const t = b.dataset.tool;
      if (t === 'in') A.map.zoom(.7);
      if (t === 'out') A.map.zoom(-.7);
      if (t === 'fit') A.map.fit(900);
      if (t === '3d') b.classList.toggle('is-on', A.map.toggle3d());
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || !el.contains(b)) return;
      const act = b.dataset.act;
      if (act === 'start') start();
      if (act === 'fork') openFork();
      if (act === 'restart') { clearTimers(); A.map.reset(); hideHud(); S.phase = 'idle'; start(); }
      if (act === 'export') exportPlan();
    });
    renderPanel();
    A.map.onLate = () => {
      $('map-fallback').hidden = true; el.classList.remove('no-map');
      if (['done', 'dispatch', 'live'].includes(S.phase)) A.map.finalState(variant());
      if (['dispatch', 'live'].includes(S.phase)) { A.map.startTrucks(96); A.map.setTruckLimit(96); }
    };
    A.map.init($('map')).then(ok => {
      if (!ok) $('map-fallback').hidden = false;
      el.classList.toggle('no-map', !ok);
      if (S.pendingStart) start();
    });
  };

  A.enterStage = function (autostart) {
    A.renderStage();
    requestAnimationFrame(() => A.map.resize());
    if (autostart && (S.phase === 'idle' || S.phase === 'done')) {
      if (S.phase === 'done') { A.map.reset(); }
      start();
    } else if (S.phase === 'idle' || S.phase === 'done') {
      renderPanel();
      if (S.forkPending && S.phase === 'done') { S.forkPending = false; openFork(); }
    }
    A.refreshHeader();
  };

  function legend() {
    const tool = document.querySelector('[data-tool="3d"]'); if (tool) tool.classList.toggle('is-on', S.phase !== 'idle');
    const L = $('legend'); if (!L) return;
    L.innerHTML = S.phase === 'idle' ? '' : `<span><i class="lg-dot"></i>Заявки</span><span><i class="lg-hub"></i>РЦ</span>${S.phase !== 'running' || S.elapsed > 3250 ? '<span><i class="lg-line"></i>Рейсы по дорогам</span>' : ''}${['dispatch', 'live'].includes(S.phase) ? '<span><i class="lg-truck"></i>Машины</span>' : ''}`;
  }

  /* ---------- панель ---------- */
  function renderPanel() {
    const p = panel(); if (!p) return;
    const s = A.settings, v = variant();
    if (S.phase === 'idle') {
      p.innerHTML = `<div class="panel-in">
        <span class="kicker">Шаг 3 из 3</span>
        <h2 class="panel-title">Анализ и выбор плана</h2>
        <p class="panel-lead">Atlas разложит заявки по зонам, соберёт рейсы по реальным дорогам и сравнит ставки перевозчиков.</p>
        <ul class="ready-list">
          <li>${A.icon('list', 18)}<span><b>${A.fmt(A.scenario.orders)}</b> заявок · пакет № ${A.scenario.packageNo}</span></li>
          <li>${A.icon('target', 18)}<span>Цель <b>${A.fmt(s.target)} ₽</b> за точку</span></li>
          <li>${A.icon('layers', 18)}<span><b>${A.enabledCarriers().length}</b> ${A.plural(A.enabledCarriers().length, 'канал', 'канала', 'каналов')} доставки</span></li>
          <li class="ready-logos">${A.enabledCarriers().map(c => A.logo(c, 26)).join('')}</li>
          <li>${A.icon('clock', 18)}<span>Окно <b>${s.from}–${s.to}</b></span></li>
        </ul>
        ${S.pendingStart ? `<button class="btn btn-primary btn-xl btn-block" disabled><span class="btn-spin"></span>Загружаем карту…</button>` : `<button class="btn btn-primary btn-xl btn-block" data-act="start">${A.icon('play', 18)}Запустить анализ</button>`}
        <p class="panel-note">Около 5 секунд. Перевозчикам ничего не отправляется — это демонстрация</p>
      </div>`;
    } else if (S.phase === 'running') {
      p.innerHTML = `<div class="panel-in">
        <div class="an-head"><span class="live-dot"></span><span class="kicker">Идёт анализ</span><span class="an-time" id="an-time">0,0 с</span></div>
        <div class="an-big"><b id="an-num">0</b><span id="an-unit">заявок прочитано</span></div>
        <div class="an-progress"><i id="an-bar"></i></div>
        <ol class="phases" id="phases">${PH.map((ph, i) => `<li class="phase" data-i="${i}"><span class="ph-state"><span class="ph-spin"></span>${A.icon('check', 13)}</span><span class="ph-text"><b>${ph.name}</b><small>${ph.detail}</small></span><span class="ph-val"></span></li>`).join('')}</ol>
        <div class="bids-head"><span class="kicker">Ставки перевозчиков</span><span id="bids-best"></span></div>
        <div class="bids" id="bids">${A.enabledCarriers().map(c => `<div class="bid" data-c="${c.id}" title="${c.name}">${A.logo(c, 24)}<b class="bid-val">—</b></div>`).join('')}</div>
      </div>`;
    } else if (S.phase === 'done') {
      const price = A.priceOf(v), sav = A.savingsAt(price);
      p.innerHTML = `<div class="panel-in">
        <div class="done-badge">${A.icon('check', 15)}Анализ завершён за ${A.fmtDec(S.duration / 1000, 1)} с</div>
        <h2 class="panel-title">Выбран вариант ${v.id}</h2>
        <div class="vmini">
          <span class="v-letter">${v.id}</span>
          <div><b>${v.name}</b><small>${v.description}</small></div>
        </div>
        <div class="mini-kpis">
          <div><span>За точку</span><b>${price} ₽</b></div>
          <div><span>Рейсов</span><b>${A.fmt(v.routes)}</b></div>
          <div><span>В срок</span><b>${A.fmtDec(v.onTime, 1)}%</b></div>
          <div><span>Экономия</span><b>${A.mln(sav)} млн ₽</b></div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" data-act="fork">${A.icon('layers', 17)}Сравнить варианты</button>
        <button class="btn btn-ghost btn-block" data-act="restart">${A.icon('refresh', 16)}Пересчитать</button>
      </div>`;
    } else if (S.phase === 'dispatch') {
      p.innerHTML = `<div class="panel-in">
        <div class="an-head"><span class="live-dot"></span><span class="kicker">Рассылка перевозчикам</span></div>
        <div class="an-big"><b id="dp-num">0</b><span>из ${A.fmt(v.routes)} рейсов принято</span></div>
        <div class="an-progress"><i id="dp-bar"></i></div>
        <ul class="dp-list">${dispatchPlan(v).map(c => `<li data-c="${c.id}">${A.logo(c, 30)}<div class="dp-body"><div class="dp-row"><b>${c.name}</b><span class="dp-count"><span class="dp-acc">0</span> / ${A.fmt(c.routes)}</span></div><div class="dp-track"><i style="--c:${c.bg === '#FFCC00' ? '#E5B800' : c.bg}"></i></div></div></li>`).join('')}</ul>
        <p class="panel-note">${A.icon('clock', 15)}Ждём ответ ${s.wait} мин, затем рейс уходит следующему каналу</p>
      </div>`;
    } else if (S.phase === 'live') {
      p.innerHTML = `<div class="panel-in">
        <div class="an-head"><span class="live-dot is-ok"></span><span class="kicker" id="lv-state">День доставки</span><span class="an-time" id="lv-clock">${s.from}</span></div>
        <h2 class="panel-title">Вариант ${v.id} в работе</h2>
        <div class="lv-grid">
          <div class="lv-tile is-wide"><span>Доставлено</span><b><span id="lv-del">0</span><small> / ${A.fmt(A.scenario.orders)}</small></b><div class="lv-track"><i id="lv-del-bar"></i></div></div>
          <div class="lv-tile"><span>Машин на линии</span><b id="lv-trucks">0</b></div>
          <div class="lv-tile"><span>Цена за точку</span><b>${A.priceOf(v) - 5} ₽</b><em class="up-good">−5 ₽ к плану</em></div>
          <div class="lv-tile"><span>Рейсов принято</span><b>${A.fmt(v.routes)}</b></div>
          <div class="lv-tile"><span>В срок</span><b id="lv-ontime">${A.fmtDec(v.onTime + .1, 1)}%</b></div>
        </div>
        <h3 class="panel-sub">Требуют внимания <span class="count" id="att-count">0</span></h3>
        <ul class="attention" id="attention"><li class="att-empty">Пока всё по плану</li></ul>
        <div class="panel-actions">
          <button class="btn btn-primary btn-block" data-act="export">${A.icon('download', 17)}Выгрузить план CSV</button>
          <button class="btn btn-ghost btn-block" data-act="restart">${A.icon('refresh', 16)}Новый расчёт</button>
        </div>
      </div>`;
    }
    legend();
  }

  /* ---------- анализ ---------- */
  function start() {
    if (!A.map.ready && !A.map.failed) { S.pendingStart = true; S.phase = 'idle'; renderPanel(); return; }
    S.pendingStart = false;
    clearTimers();
    closeFork(true);
    hideHud();
    A.map.reset();
    S.phase = 'running'; S.elapsed = 0; S.last = { phase: -1, reveal: 0, search: 0, routes: 0, bids: 0 };
    renderPanel();
    A.refreshHeader();
    A.map.hubActive(true);
    A.map.cinematic(TOTAL + 600);
    const time = clock();
    const frame = now => {
      S.elapsed = Math.min(TOTAL, time(now));
      tick(S.elapsed, now);
      if (S.elapsed < TOTAL) S.raf = requestAnimationFrame(frame);
      else { S.clockStop(); finish(); }
    };
    S.raf = requestAnimationFrame(frame);
  }

  function tick(e, now) {
    const L = S.last, idx = PH.findIndex(p => e < p.t1), cur = idx < 0 ? PH.length - 1 : idx;
    const bar = $('an-bar'); if (bar) bar.style.width = (e / TOTAL * 100).toFixed(1) + '%';
    const time = $('an-time'); if (time) time.textContent = A.fmtDec(e / 1000, 1) + ' с';
    const num = $('an-num'), unit = $('an-unit'), v = variant();
    if (num) {
      if (e < 1500) { num.textContent = A.fmt(A.scenario.orders * A.ease.out(Math.min(1, e / 1100))); unit.textContent = 'заявок прочитано'; }
      else if (e < 3250) { num.textContent = A.fmt(1800000 * A.ease.inOut((e - 1500) / 1750)); unit.textContent = 'комбинаций проверено'; }
      else { num.textContent = A.fmt(v.routes * A.ease.out(Math.min(1, (e - 3250) / 1450))); unit.textContent = 'рейсов собрано'; }
    }
    if (cur !== L.phase) {
      document.querySelectorAll('#phases .phase').forEach((li, i) => {
        li.classList.toggle('is-done', i < cur); li.classList.toggle('is-active', i === cur);
        if (i < cur) li.querySelector('.ph-val').textContent = PH[i].value();
      });
      onPhase(cur);
      L.phase = cur;
      legend();
    }
    if (cur === 1 && now - L.reveal > 55) { A.map.revealPoints((e - 650) / 850); L.reveal = now; }
    if (cur === 3 && now - L.search > 120) { A.map.search(true); L.search = now; }
    if (cur === 4 && now - L.routes > 45) { A.map.drawRoutes(A.ease.inOut((e - 3250) / 850)); L.routes = now; }
    if (cur === 5) {
      const on = A.enabledCarriers(), n = Math.min(on.length, Math.floor((e - 4100) / 600 * on.length) + 1);
      if (n !== L.bids) { on.slice(0, n).forEach(c => { const b = document.querySelector(`.bid[data-c="${c.id}"]`); if (b && !b.classList.contains('is-on')) { b.classList.add('is-on'); A.countTo(b.querySelector('.bid-val'), c.bid, { ms: 380, from: c.bid + 140, format: x => A.fmt(x) + ' ₽' }); } }); L.bids = n; }
    }
  }

  function onPhase(i) {
    if (i === 2) { A.map.revealPoints(1); A.map.colorPoints(); A.map.hexTo(1, 750); A.map.zoneLabels(true); A.map.hubQuiet(true); }
    if (i === 3) { A.map.weather(true); S.timers.push(setTimeout(() => { if (S.phase === 'running') { A.map.hexTo(0, 750, 0); A.map.carpet(true); A.map.pointsOpacity(.35); } }, 380)); }
    if (i === 4) A.map.search(false);
    if (i === 5) { A.map.drawRoutes(1); A.map.showVariant(variant()); }
  }

  function finish() {
    S.duration = TOTAL - 120 + Math.round(Math.random() * 60);
    document.querySelectorAll('#phases .phase').forEach((li, i) => { li.classList.add('is-done'); li.classList.remove('is-active'); li.querySelector('.ph-val').textContent = PH[i].value(); });
    A.enabledCarriers().forEach(c => { const b = document.querySelector(`.bid[data-c="${c.id}"]`); if (b) { b.classList.add('is-on'); b.querySelector('.bid-val').textContent = c.bid + ' ₽'; } });
    const best = A.enabledCarriers().slice().sort((a, b) => a.bid - b.bid)[0];
    const bb = $('bids-best'); if (bb && best) bb.innerHTML = `Лучшая: <b>${best.name} · ${best.bid} ₽</b>`;
    const best2 = document.querySelector(`.bid[data-c="${best?.id}"]`); if (best2) best2.classList.add('is-best');
    const time = $('an-time'); if (time) time.textContent = A.fmtDec(S.duration / 1000, 1) + ' с';
    A.map.search(false); A.map.drawRoutes(1); A.map.showVariant(variant()); A.map.colorPoints(); A.map.pointsOpacity(.35); A.map.zoneLabels(true); A.map.hubQuiet(true);
    if (A.map.hexK > 0) A.map.hexTo(0, 500, 0);
    A.map.carpet(true);
    S.phase = 'done';
    A.refreshHeader();
    S.timers.push(setTimeout(() => {
      if (S.phase !== 'done') return;
      renderPanel();
      if (A.current === 'analysis') openFork(); else S.forkPending = true;
    }, 450));
  }

  /* ---------- развилка ---------- */
  function waterfall(v) {
    const pen = A.penalty(), price = A.priceOf(v);
    const steps = [
      { label: ['Сегодня'], value: A.scenario.baseline, kind: 'base' },
      { label: ['Консоли-', 'дация'], value: -v.parts[0] },
      { label: ['Подбор', 'транспорта'], value: -v.parts[1] },
      { label: ['Выбор', 'каналов'], value: -(v.parts[2] - pen) },
      { label: ['Вариант ' + v.id], value: price, kind: 'total' }
    ];
    const W = 560, H = 236, top = 30, bottom = 44, max = 820, n = steps.length, gap = 22, bw = (W - gap * (n - 1)) / n;
    const y = val => top + (1 - val / max) * (H - top - bottom);
    let run = 0, svg = '';
    steps.forEach((s, i) => {
      const x = i * (bw + gap);
      let y1, y2, cls;
      if (s.kind) { y1 = y(s.value); y2 = y(0); run = s.value; cls = s.kind; }
      else { const a = run, b = run + s.value; y1 = y(Math.max(a, b)); y2 = y(Math.min(a, b)); run = b; cls = s.value <= 0 ? 'down' : 'up'; }
      svg += `<rect class="wf-bar wf-${cls}" style="animation-delay:${i * 110}ms" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, y2 - y1).toFixed(1)}" rx="6"/>`;
      const val = s.kind ? `${s.value} ₽` : (s.value <= 0 ? '−' : '+') + Math.abs(s.value);
      svg += `<text class="wf-val wf-v-${cls}" x="${(x + bw / 2).toFixed(1)}" y="${(y1 - 9).toFixed(1)}" style="animation-delay:${i * 110 + 250}ms">${val}</text>`;
      svg += `<text class="wf-label" x="${(x + bw / 2).toFixed(1)}" y="${H - bottom + 20}">${s.label.map((t, j) => `<tspan x="${(x + bw / 2).toFixed(1)}" dy="${j ? 14 : 0}">${t}</tspan>`).join('')}</text>`;
      if (i < n - 1) { const ny = y(run); svg += `<line class="wf-link" x1="${(x + bw).toFixed(1)}" x2="${(x + bw + gap).toFixed(1)}" y1="${ny.toFixed(1)}" y2="${ny.toFixed(1)}"/>`; }
    });
    const ty = y(A.settings.target);
    svg += `<line class="wf-target" x1="0" x2="${W}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}"/><text class="wf-target-t" x="4" y="${(ty + 15).toFixed(1)}">цель ${A.settings.target} ₽</text>`;
    return `<svg class="wf" viewBox="0 -4 ${W} ${H + 4}" role="img" aria-label="Из чего складывается экономия варианта ${v.id}: с ${A.scenario.baseline} до ${price} рублей за точку">${svg}</svg>`;
  }

  function splitBlock(v) {
    const sh = A.shares();
    return `<div class="split-bar">${sh.map(c => `<i style="flex:${c.pct};--c:${c.bg}" title="${c.name} · ${Math.round(c.pct * 100)}%"></i>`).join('')}</div>
      <ul class="split-list">${sh.slice().sort((a, b) => b.pct - a.pct).map(c => `<li>${A.logo(c, 26)}<span class="sl-name">${c.name}</span><span class="sl-routes">${A.fmt(v.routes * c.pct)} рейсов</span><b>${Math.round(c.pct * 100)}%</b></li>`).join('')}</ul>`;
  }

  function variantsHTML() {
    const vs = A.scenario.variants, prices = vs.map(A.priceOf), maxPack = Math.max(...prices) * A.scenario.orders, maxRoutes = Math.max(...vs.map(v => v.routes));
    return vs.map(v => {
      const p = A.priceOf(v), diff = p - A.settings.target, on = v.id === S.variant;
      return `<button type="button" class="variant ${on ? 'is-on' : ''}" role="radio" aria-checked="${on}" data-variant="${v.id}">
        <span class="v-top"><span class="v-letter">${v.id}</span><span class="v-name">${v.name}</span>${v.recommended ? `<span class="v-rec">${A.icon('star', 12)}Рекомендуем</span>` : ''}<span class="v-radio"></span></span>
        <span class="v-price"><b>${p}</b><span>₽ за точку</span></span>
        <span class="status-pill ${diff <= 0 ? 'ok' : 'warn'}">${diff <= 0 ? A.icon('check', 13) + 'В цели' + (diff < 0 ? ' · −' + Math.abs(diff) + ' ₽' : '') : 'Выше цели на ' + diff + ' ₽'}</span>
        <span class="v-desc">${v.description}</span>
        <span class="v-metrics">
          <span class="vm"><span>Весь пакет</span><b>${A.mln(p * A.scenario.orders)} млн ₽</b><i style="--w:${(p * A.scenario.orders / maxPack * 100).toFixed(0)}%"></i></span>
          <span class="vm"><span>Рейсов</span><b>${A.fmt(v.routes)}</b><i style="--w:${(v.routes / maxRoutes * 100).toFixed(0)}%"></i></span>
          <span class="vm"><span>В срок</span><b>${A.fmtDec(v.onTime, 1)}%</b><i style="--w:${((v.onTime - 94) / 6 * 100).toFixed(0)}%"></i></span>
          <span class="vm"><span>Загрузка машин</span><b>${v.load}%</b><i style="--w:${v.load}%"></i></span>
        </span>
      </button>`;
    }).join('');
  }

  function detailHTML() {
    const v = variant(), price = A.priceOf(v), sav = A.savingsAt(price), budget = A.scenario.baseline * A.scenario.orders;
    return `<section class="fork-card fork-wf"><header><h3>Откуда экономия</h3><span>${A.scenario.baseline} → ${price} ₽ за точку</span></header>${waterfall(v)}</section>
      <section class="fork-card fork-sav">
        <span class="kicker">Экономия на пакете</span>
        <div class="sav-big"><b>${A.mln(sav)}</b><span>млн ₽</span></div>
        <p class="sav-sub"><span class="pill ok">−${Math.round(sav / budget * 100)}%</span>к сегодняшним ${A.mln(budget)} млн ₽</p>
        <div class="sav-compare">
          <div><span>Сейчас</span><i style="width:100%"></i><b>${A.mln(budget)}</b></div>
          <div class="is-plan"><span>План ${v.id}</span><i style="width:${(price / A.scenario.baseline * 100).toFixed(1)}%"></i><b>${A.mln(price * A.scenario.orders)}</b></div>
        </div>
        <h4>Кто повезёт</h4>
        ${splitBlock(v)}
      </section>`;
  }

  function footHTML() {
    const v = variant();
    return `<div class="fork-sum"><span class="v-letter sm">${v.id}</span><div><b>${v.name} · ${A.priceOf(v)} ₽ за точку</b><span>${A.fmt(v.routes)} рейсов · ${A.enabledCarriers().length} ${A.plural(A.enabledCarriers().length, 'канал', 'канала', 'каналов')} · ${A.settings.from}–${A.settings.to}</span></div></div>
      <div class="fork-btns"><button class="btn btn-ghost" data-fork="map">${A.icon('eye', 17)}Посмотреть на карте</button><button class="btn btn-primary btn-lg" data-fork="send">${A.icon('send', 17)}Отправить перевозчикам</button></div>`;
  }

  function openFork() {
    const root = document.getElementById('overlay-root');
    const targets = [...new Set([450, 500, 550, A.settings.target])].sort((a, b) => a - b);
    root.innerHTML = `<div class="modal-backdrop fork-backdrop">
      <div class="modal fork" role="dialog" aria-modal="true" aria-labelledby="fork-title">
        <header class="fork-head">
          <div class="fork-done">${A.icon('check', 16)}Анализ завершён за ${A.fmtDec((S.duration || TOTAL) / 1000, 1)} с · ${A.fmt(A.scenario.orders)} заявок · ${A.zones.length} зон</div>
          <div class="fork-title-row">
            <div><h2 id="fork-title">Выберите план доставки</h2><p>Три варианта на один пакет: сравните цену, число рейсов и сроки</p></div>
            <div class="fork-target"><span>Цель за точку</span><div class="seg" role="radiogroup" aria-label="Цель за точку">${targets.map(t => `<button type="button" role="radio" aria-checked="${t === A.settings.target}" class="${t === A.settings.target ? 'is-on' : ''}" data-ftarget="${t}">${t} ₽</button>`).join('')}</div></div>
          </div>
          <button class="icon-btn fork-close" data-fork="close" aria-label="Закрыть">${A.icon('x', 20)}</button>
        </header>
        <div class="variants" id="fork-variants" role="radiogroup" aria-label="Варианты плана">${variantsHTML()}</div>
        <div class="fork-detail" id="fork-detail">${detailHTML()}</div>
        <footer class="fork-foot" id="fork-foot">${footHTML()}</footer>
      </div></div>`;
    document.body.classList.add('no-scroll');
    const modal = root.querySelector('.fork');
    const backdrop = root.querySelector('.fork-backdrop');
    let downOnBackdrop = false;
    backdrop.addEventListener('pointerdown', e => { downOnBackdrop = e.target === backdrop; });
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) { if (downOnBackdrop) closeFork(); return; }
      const t = e.target.closest('[data-fork],[data-variant],[data-ftarget]'); if (!t) return;
      if (t.dataset.variant) {
        S.variant = t.dataset.variant;
        $('fork-variants').innerHTML = variantsHTML(); $('fork-detail').innerHTML = detailHTML(); $('fork-foot').innerHTML = footHTML();
        modal.querySelector(`[data-variant="${S.variant}"]`).focus();
        A.map.showVariant(variant()); renderPanel(); A.refreshHeader();
      } else if (t.dataset.ftarget) {
        A.settings.target = Number(t.dataset.ftarget); A.saveSettings();
        modal.querySelectorAll('[data-ftarget]').forEach(b => { const on = b === t; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
        $('fork-variants').innerHTML = variantsHTML(); $('fork-detail').innerHTML = detailHTML();
      } else if (t.dataset.fork === 'close' || t.dataset.fork === 'map') closeFork();
      else if (t.dataset.fork === 'send') { closeFork(); dispatch(); }
    });
    S.forkKey = e => { if (e.key === 'Escape') closeFork(); };
    document.addEventListener('keydown', S.forkKey);
    setTimeout(() => modal.querySelector('.variant.is-on')?.focus({ preventScroll: true }), 60);
  }

  function closeFork(silent) {
    const root = document.getElementById('overlay-root'), bd = root.querySelector('.fork-backdrop');
    document.removeEventListener('keydown', S.forkKey);
    if (!bd) return;
    if (silent) { root.innerHTML = ''; document.body.classList.remove('no-scroll'); return; }
    bd.classList.add('is-leaving');
    setTimeout(() => { if (root.contains(bd)) root.innerHTML = ''; document.body.classList.remove('no-scroll'); }, 240);
    renderPanel();
  }

  /* ---------- рассылка и мониторинг ---------- */
  function dispatchPlan(v) {
    const sh = A.shares();
    let left = v.routes;
    return sh.map((c, i) => { const routes = i === sh.length - 1 ? left : Math.round(v.routes * c.pct); left -= routes; return { ...c, routes }; });
  }

  function dispatch() {
    clearTimers();
    const v = variant(), plan = dispatchPlan(v), D = 6200;
    S.phase = 'dispatch'; renderPanel(); A.refreshHeader();
    A.map.settle(); A.map.weather(false); A.map.startTrucks(96); A.map.setTruckLimit(0);
    const speeds = plan.map((c, i) => .55 + A.hash(i, 5) * .45);
    const time = clock();
    const frame = now => {
      const k = Math.min(1, time(now) / D);
      let total = 0;
      plan.forEach((c, i) => {
        const f = Math.min(1, A.ease.out(Math.min(1, k / speeds[i]))), acc = Math.round(c.routes * f);
        total += acc;
        const li = document.querySelector(`.dp-list li[data-c="${c.id}"]`);
        if (li) { li.querySelector('.dp-acc').textContent = A.fmt(acc); li.querySelector('.dp-track i').style.width = (f * 100).toFixed(1) + '%'; li.classList.toggle('is-full', f >= 1); }
      });
      const num = $('dp-num'); if (num) num.textContent = A.fmt(total);
      const bar = $('dp-bar'); if (bar) bar.style.width = (total / v.routes * 100).toFixed(1) + '%';
      A.map.setTruckLimit(Math.round(40 * total / v.routes));
      if (k < 1) S.raf = requestAnimationFrame(frame);
      else { S.clockStop(); S.timers.push(setTimeout(live, 700)); }
    };
    S.raf = requestAnimationFrame(frame);
  }

  const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const toTime = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
  const EVENTS = [
    { at: 85, icon: 'warehouse', tone: 'info', title: 'Очередь на РЦ', text: '7 машин, загрузку сдвинули на 15 минут' },
    { at: 190, icon: 'snow', tone: 'warn', title: 'Снег у Домодедово', text: '18 рейсов, время в пути +12%' },
    { at: 330, icon: 'refresh', tone: 'info', title: 'Замена перевозчика', text: '3 рейса переданы следующему каналу' },
    { at: 520, icon: 'user', tone: 'warn', title: 'Получатель не на месте', text: '12 заявок перенесены на вечернее окно' }
  ];

  function live() {
    const v = variant(), a = toMin(A.settings.from), b = toMin(A.settings.to), span = b - a;
    S.phase = 'live'; S.simMin = 0; renderPanel(); A.refreshHeader();
    A.map.setTruckLimit(40);
    showHud();
    const shown = new Set();
    const step = () => {
      S.simMin = Math.min(span, S.simMin + span / 900);
      const f = S.simMin / span, del = Math.round(A.scenario.orders * (1 / (1 + Math.exp(-9 * (f - .5))) - 1 / (1 + Math.exp(4.5))) / (1 / (1 + Math.exp(-4.5)) - 1 / (1 + Math.exp(4.5))));
      const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      set('lv-clock', toTime(a + S.simMin));
      set('lv-del', A.fmt(del));
      const bar = $('lv-del-bar'); if (bar) bar.style.width = (del / A.scenario.orders * 100).toFixed(1) + '%';
      const onLine = f >= 1 ? 0 : Math.round(v.routes * Math.sin(Math.PI * Math.min(1, f * 1.1)) * .42 + 40);
      set('lv-trucks', A.fmt(onLine));
      A.map.setTruckLimit(f >= 1 ? 0 : Math.round((f > .9 ? 40 * (1 - f) / .1 : 40) + 56 * Math.sin(Math.PI * Math.min(1, f * 1.1))));
      updateHud(f, toTime(a + S.simMin), del);
      EVENTS.forEach((ev, i) => {
        if (S.simMin >= ev.at && !shown.has(i) && ev.at < span) {
          shown.add(i);
          const ul = $('attention'); if (!ul) return;
          ul.querySelector('.att-empty')?.remove();
          ul.insertAdjacentHTML('afterbegin', `<li class="att att-${ev.tone}"><span class="att-ico">${A.icon(ev.icon, 16)}</span><div><b>${ev.title}</b><span>${ev.text}</span></div><time>${toTime(a + ev.at)}</time></li>`);
          set('att-count', shown.size);
          if (ev.icon === 'snow') A.map.weather(true);
        }
      });
      if (f >= 1) {
        clearInterval(S.liveTimer);
        set('lv-state', 'День завершён');
        const dot = document.querySelector('.panel .live-dot'); if (dot) dot.classList.add('is-still');
        A.toast(`День закрыт: доставлено ${A.fmt(A.scenario.orders)} заявок`);
      }
    };
    S.liveTimer = setInterval(step, 90);
    step();
  }

  function showHud() {
    const h = $('day-hud'); if (!h) return;
    h.hidden = false;
    h.innerHTML = `<div class="hud-row"><span class="hud-time" id="hud-time">${A.settings.from}</span><div class="hud-track"><i id="hud-fill"></i><span class="hud-knob" id="hud-knob"></span></div><span class="hud-end">${A.settings.to}</span></div><div class="hud-meta"><span>Доставлено <b id="hud-del">0</b></span><span id="hud-pct">0%</span></div>`;
  }
  function updateHud(f, time, del) {
    const fill = $('hud-fill'), knob = $('hud-knob');
    if (fill) fill.style.width = (f * 100).toFixed(2) + '%';
    if (knob) knob.style.left = (f * 100).toFixed(2) + '%';
    const t = $('hud-time'); if (t) t.textContent = time;
    const d = $('hud-del'); if (d) d.textContent = A.fmt(del);
    const p = $('hud-pct'); if (p) p.textContent = Math.round(del / A.scenario.orders * 100) + '%';
  }
  function hideHud() { const h = $('day-hud'); if (h) { h.hidden = true; h.innerHTML = ''; } }

  function exportPlan() {
    const v = variant(), plan = dispatchPlan(v), price = A.priceOf(v);
    const rows = ['trip;variant;zone;orders;carrier;window;price_per_point'];
    const carriersByTrip = []; plan.forEach(c => { for (let i = 0; i < c.routes; i++) carriersByTrip.push(c.name); });
    const P = A.points(), zoneShares = P.zoneCount.map(c => c / P.n);
    let zi = 0, acc = zoneShares[0];
    for (let i = 0; i < v.routes; i++) {
      while ((i + .5) / v.routes > acc && zi < A.zones.length - 1) { zi++; acc += zoneShares[zi]; }
      rows.push([i + 1, v.id, A.zones[zi].name, Math.floor(A.scenario.orders / v.routes) + (i < A.scenario.orders % v.routes ? 1 : 0), carriersByTrip[(i * 7919) % carriersByTrip.length], A.settings.from + '-' + A.settings.to, price].join(';'));
    }
    A.downloadText(`Atlas-plan-${v.id}.csv`, '﻿' + rows.join('\r\n'));
    A.toast(`План выгружен: ${A.fmt(v.routes)} рейсов`);
  }

  A.stageMeta = () => ({ idle: 'Готов к запуску', running: 'Идёт анализ', done: 'Вариант ' + S.variant, dispatch: 'Рассылка', live: 'В работе' }[S.phase]);
})(Atlas);
