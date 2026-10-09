'use strict';
/* Шаг 1 — настройки: цель за точку, склад, перевозчики, ставки, окна доставки. */
(function (A) {
  const KEY = 'atlas-settings-v2';
  const defaults = () => ({
    target: 500,
    carriers: Object.fromEntries(A.carriers.map(c => [c.id, true])),
    rates: [42, 58, 71, 86],
    from: '06:00', to: '22:00', wait: 10
  });
  const saved = A.store.get(KEY, {}) || {};
  A.settings = Object.assign(defaults(), saved);
  A.settings.carriers = Object.assign(defaults().carriers, saved.carriers || {});
  if (!A.carriers.some(c => A.settings.carriers[c.id])) A.settings.carriers = defaults().carriers;

  A.saveSettings = () => A.store.set(KEY, A.settings);
  A.enabledCarriers = () => A.carriers.filter(c => A.settings.carriers[c.id]);
  A.penalty = () => A.carriers.reduce((s, c) => s + (A.settings.carriers[c.id] ? 0 : c.penalty), 0);
  A.priceOf = v => v.price + A.penalty();
  A.savingsAt = price => Math.max(0, (A.scenario.baseline - price) * A.scenario.orders);
  A.shares = () => {
    const on = A.enabledCarriers(), total = on.reduce((s, c) => s + c.share, 0);
    return on.map(c => ({ ...c, pct: c.share / total }));
  };
  const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const toTime = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  A.windowHours = () => (toMin(A.settings.to) - toMin(A.settings.from)) / 60;

  const TARGET_MIN = 300, TARGET_MAX = 900;
  const pct = v => ((v - TARGET_MIN) / (TARGET_MAX - TARGET_MIN) * 100).toFixed(2) + '%';

  function truckArt(w) {
    const L = w, H = Math.round(26 + (w - 58) * .2), cab = 19, box = L - cab - 3, base = 44, y0 = base - H;
    const wheels = [10, box - 8, L - 9].concat(w > 80 ? [box - 22] : []).concat(w > 100 ? [24] : []);
    return `<svg class="truck-art" viewBox="0 0 ${L + 6} 54" width="${L + 6}" height="54" aria-hidden="true">
      <rect x="3" y="${y0}" width="${box}" height="${H}" rx="3.5" fill="#FFFFFF" stroke="#9FB6CC" stroke-width="1.5"/>
      <path d="M${box + 6} ${base - H * .78}h${cab - 8}l8 ${H * .34}V${base}h-${cab}z" fill="#406180"/>
      <path d="M${box + 9} ${base - H * .68}h${cab - 12}l4.6 ${H * .22}h-${cab - 7.4}z" fill="#CFE0F0"/>
      <rect x="6" y="${y0 + 5}" width="${Math.max(8, box * .28)}" height="3" rx="1.5" fill="#DCE8F4"/>
      ${wheels.map(x => `<circle cx="${x + 3}" cy="${base + 2}" r="5.2" fill="#1C1F20"/><circle cx="${x + 3}" cy="${base + 2}" r="2" fill="#C9D3DD"/>`).join('')}
    </svg>`;
  }

  function summary() {
    const s = A.settings, on = A.enabledCarriers();
    const wh = A.orders ? A.orders.store.warehouse : { name: 'РЦ Подольск' };
    const delta = Math.round((A.scenario.baseline - s.target) / A.scenario.baseline * 100);
    return `<div class="card summary-card">
      <span class="kicker">Итог настроек</span>
      <div class="sum-compare">
        <div class="sum-row"><span>Сегодня</span><b>${A.fmt(A.scenario.baseline)} ₽</b></div>
        <div class="sum-track"><i style="width:100%"></i></div>
        <div class="sum-row is-target"><span>Цель</span><b><span id="sum-target">${A.fmt(s.target)}</span> ₽</b></div>
        <div class="sum-track is-target"><i id="sum-target-bar" style="width:${Math.min(100, s.target / A.scenario.baseline * 100).toFixed(1)}%"></i></div>
      </div>
      <div class="sum-saving">
        <span>Экономия на пакет до</span>
        <b><span id="sum-saving">${A.mln(A.savingsAt(s.target))}</span> млн ₽</b>
        <small id="sum-delta">${delta > 0 ? '−' + delta + '% к текущей цене' : 'Цель не ниже текущей цены'}</small>
      </div>
      <ul class="sum-list">
        <li>${A.icon('layers', 17)}<span>Каналы</span><b id="sum-carriers">${on.length} из ${A.carriers.length}</b></li>
        <li class="sum-logos" id="sum-logos">${on.map(c => A.logo(c, 24)).join('')}</li>
        <li>${A.icon('clock', 17)}<span>Окно доставки</span><b id="sum-window">${s.from}–${s.to}</b></li>
        <li>${A.icon('refresh', 17)}<span>Ответ перевозчика</span><b id="sum-wait">${s.wait} мин</b></li>
        <li>${A.icon('warehouse', 17)}<span>Склад</span><b id="sum-wh">${A.esc(wh.name || 'Не указан')}</b></li>
      </ul>
      <button class="btn btn-primary btn-lg btn-block" data-go="orders">Далее: заявки</button>
      <p class="sum-note">${A.icon('check', 15)} Сохраняем на этом устройстве</p>
    </div>`;
  }

  A.renderSettings = function () {
    const s = A.settings, wh = A.orders.store.warehouse, whOk = A.orders.warehouseReady();
    const a = toMin(s.from), b = toMin(s.to);
    return `
    <div class="page-head">
      <div>
        <span class="kicker">Шаг 1 из 3</span>
        <h1>Условия доставки</h1>
        <p class="lead">Задайте цель по цене, склад и перевозчиков. Atlas подберёт план под эти условия.</p>
      </div>
    </div>
    <div class="settings">
      <div class="settings-main">

        <section class="card" aria-labelledby="t-target">
          <header class="card-head">
            <span class="card-ico">${A.icon('target', 20)}</span>
            <div><h2 class="card-title" id="t-target">Цель за точку доставки</h2><p class="card-sub">Сколько вы готовы платить в среднем за одну доставку</p></div>
          </header>
          <div class="target">
            <div class="target-value"><span id="target-num">${A.fmt(s.target)}</span><small>₽</small></div>
            <div class="target-ctrl">
              <div class="range" id="target-wrap" style="--p:${pct(s.target)}">
                <input type="range" id="target-range" min="${TARGET_MIN}" max="${TARGET_MAX}" step="10" value="${s.target}" aria-label="Цель за точку, рублей">
                <span class="range-mark" style="left:${pct(A.scenario.baseline)}"><span>Сегодня ${A.scenario.baseline} ₽</span></span>
              </div>
              <div class="range-scale"><span>${TARGET_MIN} ₽</span><span>600 ₽</span><span>${TARGET_MAX} ₽</span></div>
            </div>
          </div>
          <div class="target-foot">
            <div class="chips" role="group" aria-label="Быстрый выбор цели">
              ${[400, 450, 500, 600].map(v => `<button type="button" class="chip-btn ${s.target === v ? 'is-on' : ''}" data-target="${v}">${v} ₽</button>`).join('')}
            </div>
            <p class="target-effect" id="target-effect"></p>
          </div>
        </section>

        <section class="card" aria-labelledby="t-carriers">
          <header class="card-head">
            <span class="card-ico">${A.icon('layers', 20)}</span>
            <div><h2 class="card-title" id="t-carriers">Перевозчики и каналы</h2><p class="card-sub">Atlas разошлёт рейсы по включённым каналам и сравнит ставки</p></div>
            <span class="card-aside" id="carriers-count"><b>${A.enabledCarriers().length}</b> из ${A.carriers.length}</span>
          </header>
          ${A.carrierGroups.map(g => {
            const list = A.carriers.filter(c => c.group === g.id);
            return `<div class="carrier-group">
              <div class="group-head"><div><b>${g.title}</b><span>${g.sub}</span></div>${list.length > 1 ? `<button type="button" class="link-btn" data-group="${g.id}">${list.every(c => s.carriers[c.id]) ? 'Выключить все' : 'Включить все'}</button>` : ''}</div>
              <div class="carrier-grid">
                ${list.map(c => `<label class="carrier ${s.carriers[c.id] ? 'is-on' : ''}">
                  <input type="checkbox" class="sr-only" data-carrier="${c.id}" ${s.carriers[c.id] ? 'checked' : ''}>
                  ${A.logo(c, 42)}
                  <span class="carrier-body"><b>${c.name}</b><small>${c.note}</small></span>
                  <span class="carrier-meta"><span class="carrier-bid">≈ ${c.bid} ₽</span><span class="carrier-api">${c.id === 'fleet' ? 'Парк' : 'API'}</span></span>
                  <span class="switch" aria-hidden="true"><i></i></span>
                </label>`).join('')}
              </div>
            </div>`;
          }).join('')}
        </section>

        <section class="card" aria-labelledby="t-wh">
          <header class="card-head">
            <span class="card-ico">${A.icon('warehouse', 20)}</span>
            <div><h2 class="card-title" id="t-wh">Склад отгрузки</h2><p class="card-sub">Откуда забирают груз. Подставится во все заявки</p></div>
            <span class="status-pill ${whOk ? 'ok' : 'warn'}" id="wh-status">${whOk ? A.icon('check', 14) + 'Заполнено' : 'Нужно для своих заявок'}</span>
          </header>
          <div class="field-grid">
            ${[['name', 'Название', 'РЦ Подольск', 'warehouse'], ['address', 'Адрес забора', 'Город, улица, дом', 'pin'], ['contact', 'Контакт на складе', 'Имя и должность', 'user'], ['phone', 'Телефон', '+7 900 000-00-00', 'phone']]
              .map(([k, label, ph, ic]) => `<label class="field"><span class="field-label">${label}</span><span class="input-wrap">${A.icon(ic, 17)}<input data-wh="${k}" ${k === 'phone' ? 'type="tel" inputmode="tel"' : ''} value="${A.esc(wh[k])}" placeholder="${ph}" autocomplete="off"></span></label>`).join('')}
          </div>
        </section>

        <section class="card" aria-labelledby="t-rates">
          <header class="card-head">
            <span class="card-ico">${A.icon('truck', 20)}</span>
            <div><h2 class="card-title" id="t-rates">Транспорт и ставки</h2><p class="card-sub">Стоимость километра для машин своего парка и наёмных рейсов</p></div>
          </header>
          <div class="trucks">
            ${A.trucks.map((t, i) => `<div class="truck">
              <div class="truck-pic">${truckArt(t.w)}</div>
              <div class="truck-name"><b>${t.t} т</b><span>${t.label} · ${t.note}</span></div>
              <div class="stepper">
                <button type="button" data-rate-step="-1" data-i="${i}" aria-label="Уменьшить ставку ${t.t} т">${A.icon('minus', 16)}</button>
                <input inputmode="numeric" data-rate="${i}" value="${s.rates[i]}" aria-label="Ставка ${t.t} т, рублей за километр">
                <button type="button" data-rate-step="1" data-i="${i}" aria-label="Увеличить ставку ${t.t} т">${A.icon('plus', 16)}</button>
              </div>
              <small class="truck-unit">₽ за км</small>
            </div>`).join('')}
          </div>
        </section>

        <section class="card" aria-labelledby="t-window">
          <header class="card-head">
            <span class="card-ico">${A.icon('clock', 20)}</span>
            <div><h2 class="card-title" id="t-window">Окно доставки и ожидание</h2><p class="card-sub">Когда машины могут быть у получателей</p></div>
          </header>
          <div class="window">
            <div class="window-values">
              <div><span class="mini">Начало</span><b id="win-from">${s.from}</b></div>
              <span class="window-len" id="win-len">${A.windowHours()} ${A.plural(A.windowHours(), 'час', 'часа', 'часов')}</span>
              <div class="is-right"><span class="mini">Окончание</span><b id="win-to">${s.to}</b></div>
            </div>
            <div class="dual" id="win-dual" style="--a:${(a / 1440 * 100).toFixed(2)}%;--b:${(b / 1440 * 100).toFixed(2)}%">
              <div class="dual-track"><span class="dual-fill"></span></div>
              <input type="range" min="0" max="1440" step="30" value="${a}" id="win-a" aria-label="Начало окна доставки">
              <input type="range" min="0" max="1440" step="30" value="${b}" id="win-b" aria-label="Окончание окна доставки">
            </div>
            <div class="dual-scale"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
          </div>
          <div class="wait">
            <div><b>Ожидание ответа перевозчика</b><p>Если перевозчик не принял рейс за это время, рейс уходит следующему каналу</p></div>
            <div class="seg" role="radiogroup" aria-label="Ожидание ответа">
              ${[5, 10, 15, 30].map(m => `<button type="button" role="radio" aria-checked="${s.wait === m}" class="${s.wait === m ? 'is-on' : ''}" data-wait="${m}">${m} мин</button>`).join('')}
            </div>
          </div>
        </section>
      </div>
      <aside class="summary" id="summary">${summary()}</aside>
    </div>
    <div class="action-bar mobile-only"><div class="action-bar-in"><div class="ab-text"><b>Цель ${A.fmt(s.target)} ₽</b><span>${A.enabledCarriers().length} каналов · ${s.from}–${s.to}</span></div><button class="btn btn-primary" data-go="orders">Далее: заявки</button></div></div>`;
  };

  function refresh(root) {
    const s = A.settings;
    const set = (id, v) => { const el = root.querySelector('#' + id); if (el) el.textContent = v; };
    set('target-num', A.fmt(s.target));
    set('sum-target', A.fmt(s.target));
    set('sum-saving', A.mln(A.savingsAt(s.target)));
    const delta = Math.round((A.scenario.baseline - s.target) / A.scenario.baseline * 100);
    set('sum-delta', delta > 0 ? '−' + delta + '% к текущей цене' : 'Цель не ниже текущей цены');
    const bar = root.querySelector('#sum-target-bar'); if (bar) bar.style.width = Math.min(100, s.target / A.scenario.baseline * 100).toFixed(1) + '%';
    const wrap = root.querySelector('#target-wrap'); if (wrap) wrap.style.setProperty('--p', pct(s.target));
    const eff = root.querySelector('#target-effect');
    if (eff) eff.innerHTML = delta > 0
      ? `<span class="pill ok">−${delta}% к сегодня</span><span>Экономия до <b>${A.mln(A.savingsAt(s.target))} млн ₽</b> на пакет из ${A.fmt(A.scenario.orders)} заявок</span>`
      : `<span class="pill warn">Выше текущей цены</span><span>Сейчас точка стоит ${A.scenario.baseline} ₽. Снизьте цель, чтобы искать экономию</span>`;
    root.querySelectorAll('[data-target]').forEach(b => b.classList.toggle('is-on', Number(b.dataset.target) === s.target));
    const on = A.enabledCarriers();
    set('sum-carriers', `${on.length} из ${A.carriers.length}`);
    const cc = root.querySelector('#carriers-count'); if (cc) cc.innerHTML = `<b>${on.length}</b> из ${A.carriers.length}`;
    const logos = root.querySelector('#sum-logos'); if (logos) logos.innerHTML = on.map(c => A.logo(c, 24)).join('');
    root.querySelectorAll('[data-group]').forEach(b => { const list = A.carriers.filter(c => c.group === b.dataset.group); b.textContent = list.every(c => s.carriers[c.id]) ? 'Выключить все' : 'Включить все'; });
    set('sum-window', `${s.from}–${s.to}`); set('win-from', s.from); set('win-to', s.to);
    const h = A.windowHours(); set('win-len', `${A.fmtDec(h, h % 1 ? 1 : 0)} ${A.plural(Math.ceil(h), 'час', 'часа', 'часов')}`);
    set('sum-wait', s.wait + ' мин');
    const wh = A.orders.store.warehouse, ok = A.orders.warehouseReady();
    set('sum-wh', wh.name || 'Не указан');
    const st = root.querySelector('#wh-status');
    if (st) { st.className = 'status-pill ' + (ok ? 'ok' : 'warn'); st.innerHTML = ok ? A.icon('check', 14) + 'Заполнено' : 'Нужно для своих заявок'; }
    const ab = root.querySelector('.ab-text'); if (ab) ab.innerHTML = `<b>Цель ${A.fmt(s.target)} ₽</b><span>${on.length} каналов · ${s.from}–${s.to}</span>`;
    A.saveSettings();
    A.refreshHeader && A.refreshHeader();
  }

  A.bindSettings = function (root) {
    const s = A.settings;
    refresh(root);
    const range = root.querySelector('#target-range');
    range.addEventListener('input', () => { s.target = Number(range.value); refresh(root); });
    root.querySelectorAll('[data-target]').forEach(b => b.addEventListener('click', () => { s.target = Number(b.dataset.target); range.value = s.target; refresh(root); }));

    root.querySelectorAll('[data-carrier]').forEach(inp => inp.addEventListener('change', () => {
      const id = inp.dataset.carrier;
      if (!inp.checked && A.enabledCarriers().length === 1) { inp.checked = true; A.toast('Нужен хотя бы один канал доставки', 'bad'); return; }
      s.carriers[id] = inp.checked;
      inp.closest('.carrier').classList.toggle('is-on', inp.checked);
      refresh(root);
    }));
    root.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => {
      const list = A.carriers.filter(c => c.group === b.dataset.group), allOn = list.every(c => s.carriers[c.id]);
      if (allOn && A.enabledCarriers().length === list.length) { A.toast('Нужен хотя бы один канал доставки', 'bad'); return; }
      list.forEach(c => { s.carriers[c.id] = !allOn; const inp = root.querySelector(`[data-carrier="${c.id}"]`); inp.checked = !allOn; inp.closest('.carrier').classList.toggle('is-on', !allOn); });
      refresh(root);
    }));

    root.querySelectorAll('[data-wh]').forEach(inp => inp.addEventListener('input', () => {
      A.orders.store.warehouse[inp.dataset.wh] = inp.value;
      A.orders.save();
      refresh(root);
    }));

    const clampRate = v => A.clamp(Math.round(Number(String(v).replace(/\D/g, '')) || 1), 1, 999);
    root.querySelectorAll('[data-rate]').forEach(inp => {
      inp.addEventListener('change', () => { const i = Number(inp.dataset.rate); s.rates[i] = clampRate(inp.value); inp.value = s.rates[i]; refresh(root); });
      inp.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const i = Number(inp.dataset.rate); s.rates[i] = clampRate(s.rates[i] + (e.key === 'ArrowUp' ? 1 : -1)); inp.value = s.rates[i]; refresh(root); } });
    });
    root.querySelectorAll('[data-rate-step]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.i); s.rates[i] = clampRate(s.rates[i] + Number(b.dataset.rateStep));
      root.querySelector(`[data-rate="${i}"]`).value = s.rates[i]; refresh(root);
    }));

    const wa = root.querySelector('#win-a'), wb = root.querySelector('#win-b'), dual = root.querySelector('#win-dual');
    const onWin = which => {
      let a = Number(wa.value), b = Number(wb.value);
      if (b - a < 120) { if (which === 'a') { a = b - 120; wa.value = a; } else { b = a + 120; wb.value = b; } }
      s.from = toTime(a); s.to = toTime(b);
      dual.style.setProperty('--a', (a / 1440 * 100).toFixed(2) + '%');
      dual.style.setProperty('--b', (b / 1440 * 100).toFixed(2) + '%');
      refresh(root);
    };
    wa.addEventListener('input', () => onWin('a'));
    wb.addEventListener('input', () => onWin('b'));
    root.querySelectorAll('[data-wait]').forEach(b => b.addEventListener('click', () => {
      s.wait = Number(b.dataset.wait);
      root.querySelectorAll('[data-wait]').forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on); });
      refresh(root);
    }));
  };
})(Atlas);
