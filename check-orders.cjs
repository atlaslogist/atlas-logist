// Проверки без браузера: node check-orders.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert'), crypto = require('crypto');
const mem = {};
const ctx = {
  window: {}, console, crypto, Date, Intl, Math, URL, Blob,
  localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance: { now: () => 0 }
};
vm.createContext(ctx);
for (const f of ['js/util.js', 'js/data.js', 'js/routes-data.js', 'js/orders.js', 'js/settings.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const A = ctx.window.Atlas, O = A.orders;

// Заявки: проверка полей, дубликаты, даты, хранение, безопасный вывод
O.store.warehouse = { name: 'РЦ', address: 'Адрес', contact: 'Иван', phone: '79990000000' };
const order = { uid: '1', number: '001', type: 'person', address: 'Адрес', name: 'Имя', phone: '+79990000000', cargo: 'Книги', places: '1', weight: '2', length: '20', width: '10', height: '10', ready: '2026-10-09T09:00', deadline: '2026-10-09T15:00' };
assert.equal(O.errors(order).length, 0);
O.store.orders.push(order); O.save();
assert.equal(JSON.parse(mem['atlas-orders-v1']).orders[0].number, '001');
assert(O.errors({ ...order, uid: '2' }).some(e => e.includes('уже')));
assert(O.errors({ ...order, deadline: '2026-10-09T08:00' }).some(e => e.includes('позже')));
assert(O.errors({ ...order, type: 'business' }).length >= 2);
assert(O.validate({ ...order, phone: 'abc' }).some(([k]) => k === 'phone'));
assert.equal(A.esc('<img onerror=x>'), '&lt;img onerror=x&gt;');
assert.equal(O.status(order), 'Готов к расчёту');
O.store.warehouse.phone = '';
assert.equal(O.status(order), 'Заполнить склад');

// Импорт шаблона: все 17 колонок распознаны автоматически
ctx.XLSX = require('./vendor/xlsx.full.min.js');
O.importState = { book: ctx.XLSX.read(fs.readFileSync('orders-template.csv', 'utf8'), { type: 'string', raw: true }) };
O.selectSheet(0);
assert.equal(O.importState.rows.length, 2);
assert(Object.values(O.importState.mapping).every(i => i >= 0));
assert.equal(O.mapped()[1].type, 'business');
assert.equal(O.mapped()[0].phone, '79990000001');

// Сценарий: ветка B — 497 ₽ за точку, экономия 16,98 млн ₽ на 60 000 заявок
const B = A.scenario.variants.find(v => v.id === 'B');
assert.equal(A.priceOf(B), 497);
assert.equal(A.savingsAt(A.priceOf(B)), 16980000);
for (const v of A.scenario.variants) assert.equal(A.scenario.baseline - v.parts.reduce((s, x) => s + x, 0), v.price, 'водопад ветки ' + v.id);
A.settings.carriers.fleet = false;
assert.equal(A.priceOf(B), 497 + A.carrierById('fleet').penalty);
assert(Math.abs(A.shares().reduce((s, c) => s + c.pct, 0) - 1) < 1e-9);
A.settings.carriers.fleet = true;

// Данные карты и пакета
const P = A.points();
assert.equal(P.n, 60000);
assert.equal(P.zoneCount.reduce((s, x) => s + x, 0), 60000);
const stats = A.packageStats();
assert.equal(stats.n, 60000);
assert.equal(stats.ready + stats.issues, 60000);
assert(A.hexbins().features.length > 300);
assert.equal(A.roadRoutes.length, 45);
assert(A.roadRoutes.every(r => r.path.length > 10 && A.zones[r.z]));
assert.equal(A.demoOrder(0).number, '2417-00001');

// Экраны собираются без ошибок
assert(A.renderSettings().includes('Условия доставки'));
assert(A.renderOrders().includes('Заявки на доставку'));

console.log('PASS: заявки, импорт шаблона, сценарий 497 ₽ / 16,98 млн ₽, 60 000 точек, 45 рейсов, экраны');
