'use strict';
/* Шаг 2 — заявки: демо-пакет дня и собственные заявки склада (хранятся в браузере). */
(function (A) {
  const esc = A.esc;
  const fields = [['number', 'Номер заказа'], ['type', 'Тип получателя'], ['company', 'Магазин / компания'], ['address', 'Адрес доставки'], ['name', 'Контакт получателя'], ['phone', 'Телефон'], ['cargo', 'Содержимое'], ['places', 'Количество мест'], ['weight', 'Общий вес, кг'], ['length', 'Длина места, см'], ['width', 'Ширина места, см'], ['height', 'Высота места, см'], ['ready', 'Готовность к забору'], ['deadline', 'Доставить до'], ['windowFrom', 'Приёмка с'], ['windowTo', 'Приёмка до'], ['comment', 'Инструкции']];
  const label = k => fields.find(f => f[0] === k)[1];
  const required = ['number', 'address', 'name', 'phone', 'cargo', 'places', 'weight', 'length', 'width', 'height', 'ready', 'deadline'];
  const PHONE = /^\+?\d[\d\s()\-]{8,18}$/;
  const STORE_KEY = 'atlas-orders-v1';

  const store = { orders: [], warehouse: { name: 'РЦ Подольск', address: '', contact: '', phone: '' } };
  let loadError = '';
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && Array.isArray(saved.orders) && saved.warehouse) { store.orders = saved.orders; store.warehouse = { ...store.warehouse, ...saved.warehouse }; }
  } catch (e) { loadError = 'Не удалось прочитать сохранённые заявки.'; }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
    catch (e) { A.toast('Браузер не сохранил данные. Выгрузите заявки в CSV перед закрытием', 'bad'); return false; }
  }

  const num = v => Number(String(v).replace(',', '.'));
  /* Проверка заявки: [поле, сообщение]. Тексты сообщений совпадают с прежней версией. */
  function validate(o) {
    const e = [];
    for (const k of required) if (!String(o[k] ?? '').trim()) e.push([k, label(k) + ': заполните поле']);
    if (o.phone && !PHONE.test(o.phone)) e.push(['phone', 'Телефон: проверьте номер']);
    for (const k of ['weight', 'length', 'width', 'height', 'places']) if (o[k] && (!Number.isFinite(num(o[k])) || num(o[k]) <= 0)) e.push([k, label(k) + ': нужно положительное число']);
    if (o.places && Number(o.places) % 1) e.push(['places', 'Количество мест: нужно целое число']);
    if (o.type === 'business') {
      if (!o.company) e.push(['company', 'Укажите магазин / компанию']);
      if (!o.windowFrom || !o.windowTo) e.push(['windowFrom', 'Укажите окно приёмки']);
      else if (o.windowFrom >= o.windowTo) e.push(['windowTo', 'Окно приёмки: окончание должно быть позже начала']);
    }
    if (o.ready && Number.isNaN(Date.parse(o.ready))) e.push(['ready', 'Неверная дата готовности']);
    if (o.deadline && Number.isNaN(Date.parse(o.deadline))) e.push(['deadline', 'Неверный срок доставки']);
    if (o.ready && o.deadline && Date.parse(o.deadline) <= Date.parse(o.ready)) e.push(['deadline', 'Срок доставки должен быть позже готовности']);
    if (store.orders.some(x => x.uid !== o.uid && x.number === o.number)) e.push(['number', 'Номер заказа уже существует']);
    if (!['person', 'business'].includes(o.type)) e.push(['type', 'Тип получателя: физлицо или компания']);
    return e;
  }
  const errors = o => validate(o).map(x => x[1]);
  const warehouseReady = () => ['name', 'address', 'contact', 'phone'].every(k => String(store.warehouse[k] || '').trim()) && PHONE.test(store.warehouse.phone);
  const status = o => errors(o).length ? 'Исправить' : warehouseReady() ? 'Готов к расчёту' : 'Заполнить склад';

  /* ---------- Импорт Excel / CSV с сопоставлением колонок ---------- */
  const aliases = { number: ['номерзаказа', 'номер', 'id', 'number', 'orderid'], type: ['типполучателя', 'тип', 'type'], company: ['компания', 'магазин', 'company', 'store'], address: ['адрес', 'адресдоставки', 'address', 'deliveryaddress'], name: ['получатель', 'контакт', 'имя', 'name', 'recipient'], phone: ['телефон', 'phone'], cargo: ['содержимое', 'товар', 'груз', 'cargo', 'description'], places: ['места', 'количествомест', 'places', 'boxes'], weight: ['вес', 'вескг', 'weight', 'weightkg'], length: ['длина', 'длинасм', 'length'], width: ['ширина', 'ширинасм', 'width'], height: ['высота', 'высотасм', 'height'], ready: ['готовность', 'готовностькзабору', 'ready'], deadline: ['доставитьдо', 'deadline'], windowFrom: ['приемкас', 'приёмкас', 'windowfrom'], windowTo: ['приемкадо', 'приёмкадо', 'windowto'], comment: ['комментарий', 'инструкции', 'comment'] };
  const normalize = s => String(s).toLowerCase().replace(/[\s_\-.,/]/g, '');
  let importState = null;

  function selectSheet(index) {
    const sheet = importState.book.Sheets[importState.book.SheetNames[index]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd hh:mm' }).filter(r => r.some(c => String(c).trim()));
    if (rows.length < 2) throw Error('В листе нужны заголовки и хотя бы одна заявка.');
    if (rows.length > 5001) throw Error('Для первой версии максимум 5 000 заявок в одном файле.');
    importState.sheet = index;
    importState.headers = rows[0].map(String);
    importState.rows = rows.slice(1);
    importState.mapping = Object.fromEntries(fields.map(([k, lab]) => [k, importState.headers.findIndex(h => normalize(h) === normalize(lab) || (aliases[k] || []).includes(normalize(h)))]));
    importState.auto = { ...importState.mapping };
  }
  function mapped() {
    return importState.rows.map(row => {
      const o = { uid: crypto.randomUUID(), type: 'person' };
      for (const [k] of fields) {
        const j = Number(importState.mapping[k]);
        if (j >= 0) o[k] = String(row[j] ?? '').trim();
        if (k === 'phone' && o[k]?.startsWith("'+")) o[k] = o[k].slice(1);
      }
      const t = (o.type || '').toLowerCase();
      o.type = ['business', 'компания', 'магазин', 'юридическое лицо'].includes(t) ? 'business' : (o.type === 'person' || !o.type || ['физлицо', 'физическое лицо'].includes(t)) ? 'person' : o.type;
      return o;
    });
  }
  function exportCSV() {
    const safe = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = '﻿' + [fields.map(x => x[1]), ...store.orders.map(o => fields.map(([k]) => o[k] ?? ''))].map(r => r.map(safe).join(';')).join('\r\n');
    A.downloadText('Atlas-orders.csv', csv);
  }

  A.orders = {
    fields, store, save, validate, errors, status, warehouseReady, aliases, normalize, mapped, selectSheet, exportCSV,
    get importState() { return importState; }, set importState(v) { importState = v; }
  };

  /* ---------- Интерфейс ---------- */
  const PAGE = 50;
  const ui = Object.assign({ source: 'pack', page: 0, search: '', filter: 'all' }, A.store.get('atlas-orders-ui', {}), { page: 0 });
  const saveUi = () => A.store.set('atlas-orders-ui', { source: ui.source, filter: ui.filter });
  let drawer = null; // редактируемая заявка

  const kpi = (icon, labelText, value, note, tone = '') => `<div class="kpi ${tone}"><span class="kpi-ico">${A.icon(icon, 18)}</span><span class="kpi-label">${labelText}</span><b class="kpi-value">${value}</b>${note ? `<span class="kpi-note">${note}</span>` : ''}</div>`;

  function zoneBars(stats) {
    const total = stats.n, rows = A.zones.map(z => ({ z, c: stats.zones[z.id] })).sort((a, b) => b.c - a.c), max = rows[0].c;
    return `<div class="zbars">${rows.map(({ z, c }) => `<div class="zbar"><span class="zdot" style="--c:${z.color}"></span><span class="zname">${z.name}</span><span class="ztrack"><i style="width:${(c / max * 100).toFixed(1)}%;--c:${z.color}"></i></span><b>${A.fmt(c)}</b><span class="zpct">${Math.round(c / total * 100)}%</span></div>`).join('')}</div>`;
  }

  function hourChart(stats) {
    const from = 6, to = 23, hours = [];
    for (let h = from; h < to; h++) hours.push(h);
    const max = Math.max(...hours.map(h => stats.load[h]));
    const peak = hours.reduce((p, h) => stats.load[h] > stats.load[p] ? h : p, from);
    const wa = Number(A.settings.from.slice(0, 2)) + Number(A.settings.from.slice(3)) / 60, wb = Number(A.settings.to.slice(0, 2)) + Number(A.settings.to.slice(3)) / 60;
    const W = 520, H = 170, pad = 6, bw = (W - pad * 2) / hours.length;
    const x = h => pad + (h - from) * bw;
    const bars = hours.map(h => {
      const v = stats.load[h], bh = Math.max(2, v / max * (H - 46)), inWin = h >= wa && h + 1 <= wb;
      return `<rect class="hbar ${inWin ? '' : 'out'} ${h === peak ? 'peak' : ''}" x="${(x(h) + 3).toFixed(1)}" y="${(H - 22 - bh).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${bh.toFixed(1)}" rx="4"><title>${String(h).padStart(2, '0')}:00 · ${A.fmt(v)} заявок в работе</title></rect>`;
    }).join('');
    const band = `<rect class="hband" x="${x(A.clamp(wa, from, to)).toFixed(1)}" y="4" width="${Math.max(0, x(A.clamp(wb, from, to)) - x(A.clamp(wa, from, to))).toFixed(1)}" height="${H - 26}" rx="8"/>`;
    const labels = hours.filter(h => h % 2 === 0).map(h => `<text x="${(x(h) + bw / 2).toFixed(1)}" y="${H - 6}" class="hlabel">${String(h).padStart(2, '0')}</text>`).join('');
    const px = x(peak) + bw / 2, py = H - 22 - stats.load[peak] / max * (H - 46) - 8;
    return `<svg class="hchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Нагрузка по часам, пик в ${peak}:00">${band}${bars}${labels}<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" class="hpeak">пик ${A.fmt(stats.load[peak])}</text></svg>`;
  }

  function packRows() {
    const stats = A.packageStats(), q = ui.search.trim().toLowerCase();
    let list = stats.rows;
    if (ui.filter === 'ready') list = list.filter(o => !o.issue);
    if (ui.filter === 'check') list = list.filter(o => o.issue);
    if (q) list = list.filter(o => (o.number + ' ' + o.recipient + ' ' + o.address).toLowerCase().includes(q));
    return list;
  }

  function packTable() {
    const list = packRows(), pages = Math.max(1, Math.ceil(list.length / PAGE)), page = Math.min(ui.page, pages - 1), rows = list.slice(page * PAGE, page * PAGE + PAGE);
    const body = rows.length ? rows.map(o => `<tr>
        <td><span class="cell-num"><span class="zdot" style="--c:${A.zones[o.zone].color}" title="${A.zones[o.zone].name}"></span>${o.number}</span></td>
        <td><span class="cell-main">${esc(o.recipient)}</span><span class="cell-sub">${o.business ? 'Компания' : 'Физлицо'}</span></td>
        <td class="cell-addr">${esc(o.address)}</td>
        <td><span class="cell-main">${o.cargo}</span><span class="cell-sub">${o.places} ${A.plural(o.places, 'место', 'места', 'мест')}</span></td>
        <td class="num">${A.fmtDec(o.weight, 1)} кг</td>
        <td class="mono-cell">${o.from}–${o.to}</td>
        <td>${o.issue ? `<span class="badge warn" title="${esc(o.issue)}">${A.icon('alert', 13)}${esc(o.issue)}</span>` : `<span class="badge ok">${A.icon('check', 13)}Готова</span>`}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="empty-row">Ничего не нашлось. Попробуйте другой номер или адрес</td></tr>`;
    return tableShell(['Заявка', 'Получатель', 'Адрес', 'Груз', 'Вес', 'Окно', 'Статус'], body, list.length, page, pages);
  }

  function tableShell(head, body, total, page, pages) {
    return `<div class="table-scroll"><table class="table"><thead><tr>${head.map((h, i) => `<th class="${h === 'Вес' ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="pager"><span>${total ? `${A.fmt(page * PAGE + 1)}–${A.fmt(Math.min(total, page * PAGE + PAGE))} из ${A.fmt(total)}` : '0 заявок'}</span>
      <div class="pager-btns"><button class="btn btn-ghost btn-sm" data-act="page" data-dir="-1" ${page <= 0 ? 'disabled' : ''}>Назад</button><span class="pager-page">${page + 1} / ${A.fmt(pages)}</span><button class="btn btn-ghost btn-sm" data-act="page" data-dir="1" ${page >= pages - 1 ? 'disabled' : ''}>Вперёд</button></div></div>`;
  }

  function toolbar(counts) {
    return `<div class="toolbar">
      <label class="search">${A.icon('search', 17)}<input id="orders-search" type="search" placeholder="Номер, адрес или получатель" value="${esc(ui.search)}" aria-label="Поиск заявок"></label>
      <div class="chips" role="group" aria-label="Фильтр">
        ${[['all', 'Все', counts.all], ['ready', 'Готовы', counts.ready], ['check', 'Проверить', counts.check]].map(([v, t, c]) => `<button type="button" class="chip-btn ${ui.filter === v ? 'is-on' : ''}" data-act="filter" data-v="${v}">${t}<span>${A.fmt(c)}</span></button>`).join('')}
      </div>
    </div>`;
  }

  function packView() {
    const st = A.packageStats();
    return `<div class="kpis">
        ${kpi('list', 'Заявок в пакете', A.fmt(st.n), 'пакет № ' + A.scenario.packageNo)}
        ${kpi('weight', 'Общий вес', A.fmt(st.weight / 1000) + ' т', 'в среднем ' + A.fmtDec(st.weight / st.n, 1) + ' кг')}
        ${kpi('box', 'Грузовых мест', A.fmt(st.places), A.fmtDec(st.places / st.n, 1) + ' на заявку')}
        ${kpi('building', 'Получатели-компании', Math.round(st.business / st.n * 100) + '%', A.fmt(st.business) + ' заявок')}
        ${kpi('shield', 'Готовы к расчёту', A.fmtDec(st.ready / st.n * 100, 1) + '%', A.fmt(st.issues) + ' проверить', 'is-ok')}
      </div>
      <div class="insights">
        <section class="card insight"><header class="insight-head"><h3>По зонам доставки</h3><span>${A.zones.length} зон · от РЦ до 60 км</span></header>${zoneBars(st)}</section>
        <section class="card insight"><header class="insight-head"><h3>Нагрузка по часам</h3><span class="legend-inline"><i class="lg-band"></i>Окно ${A.settings.from}–${A.settings.to}</span></header>${hourChart(st)}<p class="insight-note">Сколько заявок ждут доставку в каждый час. Окна приёмки — из самих заявок</p></section>
      </div>
      <section class="card table-card">
        ${toolbar({ all: st.n, ready: st.ready, check: st.issues })}
        <div id="orders-table">${packTable()}</div>
      </section>`;
  }

  function ownRows() {
    const q = ui.search.trim().toLowerCase();
    return store.orders.filter(o => {
      const ok = status(o) === 'Готов к расчёту';
      if (ui.filter === 'ready' && !ok) return false;
      if (ui.filter === 'check' && ok) return false;
      return [o.number, o.address, o.name, o.company].join(' ').toLowerCase().includes(q);
    });
  }

  function ownTable() {
    const list = ownRows(), pages = Math.max(1, Math.ceil(list.length / PAGE)), page = Math.min(ui.page, pages - 1), rows = list.slice(page * PAGE, page * PAGE + PAGE);
    const body = rows.length ? rows.map(o => {
      const st = status(o), errs = errors(o);
      return `<tr class="is-click" data-act="edit" data-uid="${esc(o.uid)}" tabindex="0">
        <td><span class="cell-num">${esc(o.number || 'Без номера')}</span></td>
        <td><span class="cell-main">${esc(o.company || o.name || 'Получатель не указан')}</span><span class="cell-sub">${o.type === 'business' ? 'Компания' : 'Физлицо'}</span></td>
        <td class="cell-addr">${esc(o.address || 'Адрес не указан')}</td>
        <td><span class="cell-main">${esc(o.cargo || '—')}</span><span class="cell-sub">${esc(o.places || '—')} мест</span></td>
        <td class="num">${o.weight ? esc(o.weight) + ' кг' : '—'}</td>
        <td class="mono-cell">${o.deadline ? esc(String(o.deadline).replace('T', ' ')) : '—'}</td>
        <td>${st === 'Готов к расчёту' ? `<span class="badge ok">${A.icon('check', 13)}Готова</span>` : st === 'Заполнить склад' ? `<span class="badge info" title="Заполните склад в настройках">${A.icon('warehouse', 13)}Нужен склад</span>` : `<span class="badge warn" title="${esc(errs[0])}">${A.icon('alert', 13)}${esc(errs[0].length > 30 ? 'Исправить' : errs[0])}</span>`}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="empty-row">Ничего не нашлось</td></tr>`;
    return tableShell(['Номер', 'Получатель', 'Адрес', 'Груз', 'Вес', 'Доставить до', 'Статус'], body, list.length, page, pages);
  }

  function dropzone(big) {
    return `<label class="dropzone ${big ? 'is-big' : ''}" id="dropzone">
      <input type="file" class="sr-only" id="orders-file" accept=".xlsx,.xls,.csv,.tsv,.txt">
      <span class="dz-ico">${A.icon('upload', 26)}</span>
      <b>Перетащите Excel или CSV сюда</b>
      <span>или <u>выберите файл</u> · до 5 000 строк, колонки сопоставим автоматически</span>
    </label>`;
  }

  function ownView() {
    if (!store.orders.length) return `<div class="own-empty">
        <section class="card own-upload">${dropzone(true)}</section>
        <section class="card own-side">
          <div class="own-option"><span class="card-ico">${A.icon('edit', 20)}</span><div><b>Добавить вручную</b><p>Один получатель: адрес, груз и время доставки</p></div><button class="btn btn-secondary" data-act="new">${A.icon('plus', 17)}Новая заявка</button></div>
          <div class="own-option"><span class="card-ico">${A.icon('file', 20)}</span><div><b>Шаблон таблицы</b><p>17 колонок с примерами: физлицо и компания</p></div><a class="btn btn-ghost" href="orders-template.csv" download>${A.icon('download', 17)}Скачать</a></div>
          ${!warehouseReady() ? `<div class="own-option is-warn"><span class="card-ico">${A.icon('warehouse', 20)}</span><div><b>Заполните склад</b><p>Адрес и контакт склада нужны для каждой заявки</p></div><button class="btn btn-ghost" data-go="settings">Открыть</button></div>` : ''}
        </section>
      </div>`;
    const ready = store.orders.filter(o => status(o) === 'Готов к расчёту').length;
    return `<div class="kpis kpis-4">
        ${kpi('list', 'Моих заявок', A.fmt(store.orders.length), 'сохранены на этом устройстве')}
        ${kpi('check', 'Готовы к расчёту', A.fmt(ready), '', 'is-ok')}
        ${kpi('alert', 'Требуют правки', A.fmt(store.orders.length - ready), '', store.orders.length - ready ? 'is-warn' : '')}
        ${kpi('warehouse', 'Склад', esc(store.warehouse.name || 'Не указан'), warehouseReady() ? 'заполнен' : 'заполните в настройках', warehouseReady() ? '' : 'is-warn')}
      </div>
      <section class="card table-card">
        <div class="toolbar-row">
          ${toolbar({ all: store.orders.length, ready, check: store.orders.length - ready })}
          <div class="toolbar-actions">
            <button class="btn btn-secondary btn-sm" data-act="new">${A.icon('plus', 16)}Заявка</button>
            <label class="btn btn-ghost btn-sm">${A.icon('upload', 16)}Загрузить<input type="file" class="sr-only" id="orders-file" accept=".xlsx,.xls,.csv,.tsv,.txt"></label>
            <button class="btn btn-ghost btn-sm" data-act="export">${A.icon('download', 16)}CSV</button>
          </div>
        </div>
        <div id="orders-table">${ownTable()}</div>
      </section>`;
  }

  A.renderOrders = function () {
    const own = ui.source === 'own', st = A.packageStats();
    return `<div class="page-head">
        <div>
          <span class="kicker">Шаг 2 из 3</span>
          <h1>Заявки на доставку</h1>
          <p class="lead">${own ? 'Ваши заявки сохраняются на этом устройстве. Загрузите таблицу или добавьте заявку вручную.' : 'Пакет дня уже загружен и проверен. Посмотрите состав перед анализом.'}</p>
        </div>
        <div class="seg seg-lg" role="tablist" aria-label="Источник заявок">
          <button role="tab" aria-selected="${!own}" class="${!own ? 'is-on' : ''}" data-act="source" data-v="pack">Пакет дня<span>${A.fmt(st.n)}</span></button>
          <button role="tab" aria-selected="${own}" class="${own ? 'is-on' : ''}" data-act="source" data-v="own">Мои заявки<span>${A.fmt(store.orders.length)}</span></button>
        </div>
      </div>
      ${loadError ? `<p class="notice bad">${esc(loadError)}</p>` : ''}
      ${own ? ownView() : packView()}
      <div class="action-bar"><div class="action-bar-in">
        <div class="ab-text"><b>Пакет № ${A.scenario.packageNo} · ${A.fmt(st.n)} заявок</b><span>${own ? 'Анализ пока считает пакет дня. Свои заявки подключим вместе с поиском адресов на карте' : A.fmtDec(st.ready / st.n * 100, 1) + '% готовы · анализ займёт около 5 секунд'}</span></div>
        <button class="btn btn-ghost" data-go="settings">Назад</button>
        <button class="btn btn-primary btn-lg" data-go="analysis" data-autostart="1">${A.icon('play', 16)}Запустить анализ</button>
      </div></div>`;
  };

  function refreshTable(root) {
    const t = root.querySelector('#orders-table');
    if (t) t.innerHTML = ui.source === 'own' ? ownTable() : packTable();
  }

  async function handleFile(f) {
    try {
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) throw Error('Максимальный размер файла — 5 МБ.');
      if (!/\.(xlsx|xls|csv|tsv|txt)$/i.test(f.name)) throw Error('Выберите Excel или CSV.');
      if (typeof XLSX === 'undefined') await A.loadScript('vendor/xlsx.full.min.js');
      const book = /\.(csv|tsv|txt)$/i.test(f.name) ? XLSX.read(await f.text(), { type: 'string', raw: true }) : XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false });
      importState = { book, file: f.name };
      selectSheet(0);
      openImport();
    } catch (e) { A.toast(e.message, 'bad'); }
  }

  A.bindOrders = function (root) {
    root.onclick = e => {
      const t = e.target.closest('[data-act]');
      if (!t || !root.contains(t)) return;
      const act = t.dataset.act;
      if (act === 'source') { ui.source = t.dataset.v; ui.page = 0; ui.search = ''; saveUi(); A.rerender(); }
      if (act === 'filter') { ui.filter = t.dataset.v; ui.page = 0; saveUi(); root.querySelectorAll('[data-act="filter"]').forEach(b => b.classList.toggle('is-on', b === t)); refreshTable(root); }
      if (act === 'page') { ui.page = Math.max(0, ui.page + Number(t.dataset.dir)); refreshTable(root); root.querySelector('.table-card').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      if (act === 'new') openDrawer(null);
      if (act === 'edit') openDrawer(store.orders.find(o => o.uid === t.dataset.uid));
      if (act === 'export') exportCSV();
    };
    root.onkeydown = e => { if (e.key === 'Enter' && e.target.matches('tr[data-act="edit"]')) e.target.click(); };
    const search = root.querySelector('#orders-search');
    if (search) search.addEventListener('input', () => { ui.search = search.value; ui.page = 0; refreshTable(root); });
    const file = root.querySelector('#orders-file');
    if (file) file.addEventListener('change', () => { handleFile(file.files[0]); file.value = ''; });
    const dz = root.querySelector('#dropzone');
    if (dz) {
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-over'); }));
      dz.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
    }
  };

  /* ---------- Боковая панель заявки ---------- */
  function input(k, o, errs, type = 'text', extra = '') {
    const err = errs.find(x => x[0] === k);
    return `<label class="field ${err ? 'has-error' : ''} ${extra}"><span class="field-label">${label(k)}${required.includes(k) ? '<i>*</i>' : ''}</span><input name="${k}" type="${type}" value="${esc(o[k])}" ${type === 'number' ? 'min="0.01" step="any" inputmode="decimal"' : ''}>${err ? `<span class="field-error">${esc(err[1].replace(label(k) + ': ', ''))}</span>` : ''}</label>`;
  }

  function drawerHTML(o, errs) {
    const biz = o.type === 'business';
    return `<div class="drawer-backdrop" data-close></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <header class="drawer-head">
        <div><span class="kicker">${o.uid ? 'Заявка' : 'Новая заявка'}</span><h2 id="drawer-title">${o.uid ? esc(o.number || 'Без номера') : 'Куда доставить?'}</h2></div>
        <button class="icon-btn" data-close aria-label="Закрыть">${A.icon('x', 20)}</button>
      </header>
      <form id="order-form" class="drawer-body" novalidate>
        ${errs.length ? `<div class="notice warn">${A.icon('alert', 17)}<div><b>Черновик: ${errs.length} ${A.plural(errs.length, 'поле требует', 'поля требуют', 'полей требуют')} внимания</b><span>Можно сохранить и вернуться позже</span></div></div>` : ''}
        <fieldset class="fs">
          <legend>${A.icon('user', 17)}Получатель</legend>
          <div class="seg seg-block" role="radiogroup" aria-label="Тип получателя">
            <button type="button" role="radio" aria-checked="${!biz}" class="${!biz ? 'is-on' : ''}" data-type="person">${A.icon('user', 16)}Физлицо</button>
            <button type="button" role="radio" aria-checked="${biz}" class="${biz ? 'is-on' : ''}" data-type="business">${A.icon('building', 16)}Магазин / компания</button>
          </div>
          <input type="hidden" name="type" value="${biz ? 'business' : 'person'}">
          <div class="form-grid">
            ${input('number', o, errs)}
            <div class="biz-only ${biz ? '' : 'hidden'}">${input('company', o, errs)}</div>
            ${input('name', o, errs)}
            ${input('phone', o, errs, 'tel')}
            ${input('address', o, errs, 'text', 'span-2')}
          </div>
        </fieldset>
        <fieldset class="fs">
          <legend>${A.icon('box', 17)}Груз</legend>
          <div class="form-grid">
            ${input('cargo', o, errs, 'text', 'span-2')}
            ${input('places', o, errs, 'number')}
            ${input('weight', o, errs, 'number')}
          </div>
          <p class="fs-hint">Размеры одного места, см. Места в заявке одинаковые, вес — общий</p>
          <div class="form-grid g3">${input('length', o, errs, 'number')}${input('width', o, errs, 'number')}${input('height', o, errs, 'number')}</div>
        </fieldset>
        <fieldset class="fs">
          <legend>${A.icon('calendar', 17)}Когда</legend>
          <div class="form-grid">
            ${input('ready', o, errs, 'datetime-local')}
            ${input('deadline', o, errs, 'datetime-local')}
          </div>
          <div class="form-grid biz-only ${biz ? '' : 'hidden'}">${input('windowFrom', o, errs, 'time')}${input('windowTo', o, errs, 'time')}</div>
        </fieldset>
        <fieldset class="fs">
          <legend>${A.icon('info', 17)}Инструкции для курьера</legend>
          <label class="field"><textarea name="comment" rows="3" placeholder="Подъезд, этаж, код домофона">${esc(o.comment)}</textarea></label>
        </fieldset>
      </form>
      <footer class="drawer-foot">
        ${o.uid ? `<button type="button" class="btn btn-danger-ghost" data-delete>${A.icon('trash', 16)}Удалить</button>` : '<span></span>'}
        <div class="drawer-foot-r"><button type="button" class="btn btn-ghost" data-close>Отмена</button><button type="submit" form="order-form" class="btn btn-primary">Сохранить</button></div>
      </footer>
    </aside>`;
  }

  function openDrawer(order) {
    drawer = order ? { ...order } : { type: 'person', places: '1' };
    const root = document.getElementById('overlay-root');
    const errs = order ? validate(drawer) : [];
    root.innerHTML = drawerHTML(drawer, errs);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => root.querySelector('.drawer').classList.add('is-open'));
    const form = root.querySelector('#order-form');
    const close = () => { root.querySelector('.drawer')?.classList.remove('is-open'); root.querySelector('.drawer-backdrop')?.classList.add('is-leaving'); setTimeout(() => { root.innerHTML = ''; document.body.classList.remove('no-scroll'); }, 220); drawer = null; document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    root.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
      const biz = b.dataset.type === 'business';
      form.querySelector('[name=type]').value = b.dataset.type;
      root.querySelectorAll('[data-type]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', x === b); });
      root.querySelectorAll('.biz-only').forEach(x => x.classList.toggle('hidden', !biz));
    }));
    const del = root.querySelector('[data-delete]');
    if (del) del.addEventListener('click', () => {
      if (!confirm('Удалить заявку ' + (drawer.number || '') + '?')) return;
      store.orders = store.orders.filter(x => x.uid !== drawer.uid);
      save(); close(); A.toast('Заявка удалена', 'info'); A.rerender();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(form));
      o.uid = drawer.uid || crypto.randomUUID();
      if (o.number && store.orders.some(x => x.uid !== o.uid && x.number === o.number)) { A.toast('Этот номер заказа уже существует', 'bad'); return; }
      const i = store.orders.findIndex(x => x.uid === o.uid);
      if (i >= 0) store.orders[i] = o; else store.orders.push(o);
      const errs = errors(o);
      save(); close();
      ui.source = 'own'; saveUi();
      A.toast(errs.length ? 'Черновик сохранён. Исправьте отмеченные поля' : 'Заявка сохранена', errs.length ? 'info' : 'ok');
      A.rerender();
    });
    setTimeout(() => form.querySelector('input[name=number]')?.focus(), 250);
  }

  /* ---------- Окно сопоставления колонок ---------- */
  function importHTML() {
    const st = importState, preview = mapped().slice(0, 4);
    const found = fields.filter(([k]) => st.mapping[k] >= 0).length;
    return `<div class="modal-backdrop">
      <div class="modal modal-import" role="dialog" aria-modal="true" aria-labelledby="imp-title">
        <header class="modal-head">
          <span class="card-ico">${A.icon('file', 20)}</span>
          <div><h2 id="imp-title">Проверьте колонки</h2><p>${esc(st.file)} · ${A.fmt(st.rows.length)} ${A.plural(st.rows.length, 'строка', 'строки', 'строк')} · распознано ${found} из ${fields.length}</p></div>
          <button class="icon-btn" data-close aria-label="Закрыть">${A.icon('x', 20)}</button>
        </header>
        <div class="modal-body">
          ${st.book.SheetNames.length > 1 ? `<label class="field inline"><span class="field-label">Лист</span><select id="import-sheet">${st.book.SheetNames.map((n, i) => `<option value="${i}" ${i === st.sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
          <div class="map-grid">${fields.map(([k, lab]) => {
            const v = Number(st.mapping[k]), auto = v >= 0 && v === st.auto[k];
            return `<label class="map-row ${v >= 0 ? 'is-set' : ''}"><span class="map-label">${v >= 0 ? A.icon('check', 14) : '<i class="map-dot"></i>'}${lab}${required.includes(k) ? '<i class="req">*</i>' : ''}</span>
              <select data-map="${k}"><option value="-1">Не задано</option>${st.headers.map((h, i) => `<option value="${i}" ${i === v ? 'selected' : ''}>${esc(h || 'Колонка ' + (i + 1))}</option>`).join('')}</select>${auto ? '<span class="map-auto">авто</span>' : ''}</label>`;
          }).join('')}</div>
          <h3 class="sub-title">Первые строки</h3>
          <div class="table-scroll"><table class="table table-compact"><thead><tr><th>Номер</th><th>Получатель</th><th>Адрес</th><th>Телефон</th><th class="num">Вес</th></tr></thead><tbody>
            ${preview.map(o => `<tr><td>${esc(o.number || '—')}</td><td>${esc(o.company || o.name || '—')}</td><td class="cell-addr">${esc(o.address || '—')}</td><td>${esc(o.phone || '—')}</td><td class="num">${esc(o.weight || '—')}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="fs-hint">Дубликаты номеров пропустим. Неполные строки сохранятся с пометкой «Исправить»</p>
        </div>
        <footer class="modal-foot"><button class="btn btn-ghost" data-close>Отмена</button><button class="btn btn-primary" id="import-confirm">Добавить ${A.fmt(st.rows.length)} ${A.plural(st.rows.length, 'заявку', 'заявки', 'заявок')}</button></footer>
      </div></div>`;
  }

  function openImport() {
    const root = document.getElementById('overlay-root');
    const draw = () => {
      root.innerHTML = importHTML();
      const close = () => { root.innerHTML = ''; importState = null; document.body.classList.remove('no-scroll'); };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
      const bd = root.querySelector('.modal-backdrop');
      let down = false;
      bd.addEventListener('pointerdown', e => { down = e.target === bd; });
      bd.addEventListener('click', e => { if (e.target === bd && down) close(); });
      const sheet = root.querySelector('#import-sheet');
      if (sheet) sheet.addEventListener('change', () => { try { selectSheet(Number(sheet.value)); } catch (e) { A.toast(e.message, 'bad'); } draw(); });
      root.querySelectorAll('[data-map]').forEach(el => el.addEventListener('change', () => { importState.mapping[el.dataset.map] = Number(el.value); draw(); }));
      root.querySelector('#import-confirm').addEventListener('click', () => {
        const seen = new Set(store.orders.map(o => o.number).filter(Boolean));
        let skipped = 0, added = 0;
        for (const o of mapped()) { if (o.number && seen.has(o.number)) { skipped++; continue; } if (o.number) seen.add(o.number); store.orders.push(o); added++; }
        save(); close();
        ui.source = 'own'; ui.filter = 'all'; saveUi();
        A.toast(`Добавлено ${A.fmt(added)} ${A.plural(added, 'заявка', 'заявки', 'заявок')}` + (skipped ? `, пропущено дубликатов: ${skipped}` : ''));
        A.rerender();
      });
    };
    document.body.classList.add('no-scroll');
    draw();
  }
})(Atlas);
