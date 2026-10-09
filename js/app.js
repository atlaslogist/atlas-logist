'use strict';
/* Каркас: шапка со степпером, переходы между тремя шагами, адрес в hash. */
(function (A) {
  const STEPS = [
    { id: 'settings', n: 1, label: 'Настройки' },
    { id: 'orders', n: 2, label: 'Заявки' },
    { id: 'analysis', n: 3, label: 'Анализ и решение' }
  ];
  const progress = Object.assign({ settings: false, orders: false }, A.store.get('atlas-progress-v2', {}));
  const legacy = { branches: 'analysis', monitoring: 'analysis' };
  const parse = h => { const id = String(h || '').replace('#', ''); return STEPS.some(s => s.id === id) ? id : legacy[id] || null; };
  A.current = parse(location.hash) || 'settings';

  const meta = id => {
    if (id === 'settings') return `Цель ${A.fmt(A.settings.target)} ₽ · ${A.enabledCarriers().length} ${A.plural(A.enabledCarriers().length, 'канал', 'канала', 'каналов')}`;
    if (id === 'orders') return `${A.fmt(A.scenario.orders)} заявок`;
    return A.stageMeta();
  };
  const isDone = id => id === 'analysis' ? ['dispatch', 'live'].includes(A.stage.phase) : progress[id];

  A.refreshHeader = function () {
    const nav = document.getElementById('steps');
    if (!nav) return;
    nav.innerHTML = STEPS.map((s, i) => {
      const active = s.id === A.current, done = isDone(s.id) && !active;
      return `${i ? `<span class="step-line ${isDone(STEPS[i - 1].id) ? 'is-done' : ''}" aria-hidden="true"></span>` : ''}
        <button class="step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}" data-step="${s.id}" ${active ? 'aria-current="step"' : ''}>
          <span class="step-num">${done ? A.icon('check', 15) : s.n}</span>
          <span class="step-text"><b>${s.label}</b><small>${meta(s.id)}</small></span>
        </button>`;
    }).join('');
  };

  A.closeOverlays = () => { document.getElementById('overlay-root').innerHTML = ''; document.body.classList.remove('no-scroll'); };

  A.rerender = function () {
    const app = document.getElementById('app');
    if (A.current === 'settings') { app.innerHTML = A.renderSettings(); A.bindSettings(app); }
    if (A.current === 'orders') { app.innerHTML = A.renderOrders(); A.bindOrders(app); }
    A.refreshHeader();
  };

  A.go = function (id, opts = {}) {
    if (A.current === 'settings' && id !== 'settings') progress.settings = true;
    if (id === 'analysis' && opts.autostart) progress.orders = true;
    A.store.set('atlas-progress-v2', progress);
    const changed = id !== A.current;
    A.current = id;
    if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
    show(opts.autostart, changed);
  };

  function show(autostart, changed = true) {
    const app = document.getElementById('app'), stage = document.getElementById('stage');
    const onStage = A.current === 'analysis';
    if (changed) A.closeOverlays();
    document.body.classList.toggle('is-stage', onStage);
    app.hidden = onStage;
    /* Карта живёт за экраном, пока открыты другие шаги: анализ стартует без ожидания тайлов. */
    const parked = !onStage && !!stage.dataset.ready;
    stage.hidden = !onStage && !parked;
    stage.classList.toggle('is-offscreen', parked);
    stage.inert = parked;
    if (!onStage && !stage.dataset.ready) setTimeout(prewarm, 700);
    document.title = (onStage ? 'Анализ и решение' : A.current === 'orders' ? 'Заявки' : 'Настройки') + ' — Atlas Logist';
    if (onStage) { A.enterStage(autostart); }
    else { A.rerender(); if (changed) window.scrollTo({ top: 0 }); }
    A.refreshHeader();
  }

  function prewarm() {
    const stage = document.getElementById('stage');
    if (stage.dataset.ready || A.current === 'analysis') return;
    stage.hidden = false; stage.classList.add('is-offscreen'); stage.inert = true;
    A.renderStage();
  }

  document.addEventListener('click', e => {
    const s = e.target.closest('[data-step]');
    if (s) { e.preventDefault(); A.go(s.dataset.step); return; }
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); A.go(g.dataset.go, { autostart: !!g.dataset.autostart }); }
  });
  window.addEventListener('popstate', () => { A.current = parse(location.hash) || 'settings'; show(false); });

  const boot = () => {
    if (legacy[location.hash.slice(1)]) history.replaceState(null, '', '#analysis');
    show(false);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(Atlas);
