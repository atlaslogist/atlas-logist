'use strict';
/* Демонстрационный сценарий: пакет № 2417, 60 000 заявок из РЦ Подольск.
   Перевозчики, ставки и доли — иллюстративные значения для показа продукта. */
(function (A) {
  A.scenario = {
    packageNo: '2417',
    orders: 60000,
    baseline: 780,
    hub: { name: 'РЦ Подольск', lng: 37.5712, lat: 55.4392 },
    variants: [
      { id: 'A', name: 'Консолидация', price: 552, routes: 2940, onTime: 96.8, load: 94, stops: 20.4, routeShare: .68,
        description: 'Меньше рейсов, больше точек в каждой машине.', parts: [170, 38, 20] },
      { id: 'B', name: 'Баланс', price: 497, routes: 3260, onTime: 98.6, load: 89, stops: 18.4, routeShare: .84, recommended: true,
        description: 'Цена и сроки уравновешены по всему пакету.', parts: [150, 82, 51] },
      { id: 'C', name: 'Скорость', price: 523, routes: 3610, onTime: 99.4, load: 81, stops: 16.6, routeShare: 1,
        description: 'Больше прямых рейсов, приоритет окнам доставки.', parts: [95, 102, 60] }
    ]
  };

  A.carrierGroups = [
    { id: 'express', title: 'Курьерские агрегаторы', sub: 'Экспресс и последняя миля' },
    { id: 'tc', title: 'Транспортные компании', sub: 'Сборные грузы и B2B' },
    { id: 'freight', title: 'Грузовые биржи', sub: 'Машина под рейс от 1,5 т' },
    { id: 'fleet', title: 'Собственный парк', sub: 'Машины распределительного центра' }
  ];

  /* bid — средняя ставка за точку в демо-сценарии, share — доля пакета, penalty — рост цены за точку без канала. */
  A.carriers = [
    { id: 'yandex', group: 'express', name: 'Яндекс Доставка', note: 'Курьеры и грузовые до 1,5 т', glyph: 'Я', bg: '#FFCC00', fg: '#1C1F20', bid: 462, share: 19, penalty: 8 },
    { id: 'dostavista', group: 'express', name: 'Достависта', note: 'Пешие и авто-курьеры', glyph: 'Д', bg: '#F2553D', fg: '#FFFFFF', bid: 488, share: 11, penalty: 5 },
    { id: 'ozon', group: 'express', name: 'Ozon Логистика', note: 'До двери в день заказа', glyph: 'ozon', bg: '#005BFF', fg: '#FFFFFF', bid: 455, share: 8, penalty: 4 },
    { id: 'cdek', group: 'tc', name: 'СДЭК', note: 'Сборные отправки по области', glyph: 'СДЭК', bg: '#1AB248', fg: '#FFFFFF', bid: 471, share: 14, penalty: 7 },
    { id: 'dellin', group: 'tc', name: 'Деловые Линии', note: 'Паллеты и крупногабарит', glyph: 'ДЛ', bg: '#1D2B4F', fg: '#FFC21A', bid: 509, share: 9, penalty: 5 },
    { id: 'pek', group: 'tc', name: 'ПЭК', note: 'Магистраль и терминалы', glyph: 'ПЭК', bg: '#0A4DA2', fg: '#FFFFFF', bid: 498, share: 6, penalty: 3 },
    { id: 'ati', group: 'freight', name: 'ATI.SU', note: 'Биржа грузоперевозок', glyph: 'ATI', bg: '#0F7BDA', fg: '#FFFFFF', bid: 436, share: 10, penalty: 6 },
    { id: 'monopoly', group: 'freight', name: 'Монополия', note: 'Цифровая платформа перевозок', glyph: 'M', bg: '#16181D', fg: '#FFFFFF', bid: 452, share: 5, penalty: 3 },
    { id: 'fleet', group: 'fleet', name: 'Парк РЦ Подольск', note: '42 машины · от 1,5 до 20 т', glyph: 'truck', bg: '#406180', fg: '#FFFFFF', bid: 530, share: 18, penalty: 14 }
  ];
  A.carrierById = id => A.carriers.find(c => c.id === id);

  A.logo = (c, size = 40) => {
    const len = c.glyph.length;
    const cls = c.glyph === 'truck' ? 'g-icon' : len === 1 ? 'g1' : len <= 3 ? 'g3' : 'g4';
    const inner = c.glyph === 'truck' ? A.icon('truck', Math.round(size * .52)) : `<span>${A.esc(c.glyph)}</span>`;
    return `<span class="logo-tile ${cls}" style="--lb:${c.bg};--lf:${c.fg};--ls:${size}px" aria-hidden="true">${inner}</span>`;
  };

  A.trucks = [
    { t: '1,5', label: 'Газель', note: 'до 9 м³', w: 58 },
    { t: '5', label: 'Валдай', note: 'до 22 м³', w: 72 },
    { t: '10', label: 'Фургон', note: 'до 36 м³', w: 88 },
    { t: '20', label: 'Фура', note: 'до 82 м³', w: 108 }
  ];

  /* Зоны доставки: точка зоны — ближайший к ней центр (диаграмма Вороного). */
  A.zones = [
    { id: 0, name: 'Центр Москвы', color: '#4C6FD8', seed: [37.62, 55.755], label: [37.617, 55.752] },
    { id: 1, name: 'Север Москвы', color: '#8B6FCB', seed: [37.58, 55.87], label: [37.6, 55.872] },
    { id: 2, name: 'Восток и Люберцы', color: '#2A9DB3', seed: [37.86, 55.72], label: [37.86, 55.735] },
    { id: 3, name: 'Запад и Одинцово', color: '#D45D82', seed: [37.36, 55.71], label: [37.37, 55.712] },
    { id: 4, name: 'Юг Москвы', color: '#E3A13A', seed: [37.62, 55.612], label: [37.63, 55.612] },
    { id: 5, name: 'Новая Москва', color: '#3E9B6E', seed: [37.26, 55.5], label: [37.3, 55.49] },
    { id: 6, name: 'Подольск и Климовск', color: '#5880A6', seed: [37.54, 55.4], label: [37.45, 55.37] },
    { id: 7, name: 'Видное и Домодедово', color: '#E0775A', seed: [37.79, 55.5], label: [37.79, 55.47] },
    { id: 8, name: 'Чехов и Серпухов', color: '#8C9A3E', seed: [37.44, 55.03], label: [37.43, 55.035] }
  ];

  /* Населённые пункты: [долгота, широта, вес, разброс в км, город для адреса]. */
  const centers = [
    [37.6173, 55.7558, 14, 5.5, 'Москва'],
    [37.60, 55.86, 7, 5, 'Москва'], [37.50, 55.84, 3, 3.5, 'Москва'], [37.70, 55.83, 3, 3.5, 'Москва'],
    [37.80, 55.77, 5, 4, 'Москва'], [37.75, 55.70, 3, 3, 'Москва'], [37.898, 55.676, 3, 2.8, 'Люберцы'], [38.23, 55.567, 2, 2.5, 'Раменское'],
    [37.48, 55.68, 5, 4, 'Москва'], [37.40, 55.74, 3, 3.5, 'Москва'], [37.264, 55.678, 2.5, 3, 'Одинцово'],
    [37.60, 55.62, 8, 4, 'Москва'], [37.74, 55.65, 4, 3, 'Москва'], [37.53, 55.545, 5, 3, 'Москва'],
    [37.47, 55.565, 3, 2.5, 'Москва'], [37.3053, 55.4847, 2, 2.2, 'Троицк'], [36.7334, 55.386, 2, 2.5, 'Наро-Фоминск'],
    [37.5446, 55.4312, 7, 3.2, 'Подольск'], [37.53, 55.363, 3, 2.2, 'Климовск'], [37.559, 55.507, 2.5, 2, 'Щербинка'],
    [37.709, 55.553, 3.5, 2.3, 'Видное'], [37.7665, 55.4363, 4, 3, 'Домодедово'], [37.90, 55.58, 1.5, 2, 'Лыткарино'],
    [37.4539, 55.1425, 2.5, 2.4, 'Чехов'], [37.4111, 54.9158, 3, 3, 'Серпухов'], [38.078, 54.886, 1.5, 2, 'Ступино']
  ];
  A.centers = centers;
  const KX = Math.cos(55.5 * Math.PI / 180);
  A.KX = KX;

  const nearestZone = (lng, lat) => {
    let best = 0, bd = Infinity;
    for (const z of A.zones) {
      const dx = (lng - z.seed[0]) * KX, dy = lat - z.seed[1], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = z.id; }
    }
    return best;
  };
  A.nearestZone = nearestZone;

  /* 60 000 точек: координаты, зона, город и нормированная дальность от РЦ для волны появления. */
  let pointsCache = null;
  A.points = () => {
    if (pointsCache) return pointsCache;
    const n = A.scenario.orders, rnd = A.rng(2417);
    const lng = new Float64Array(n), lat = new Float64Array(n), zone = new Uint8Array(n), center = new Uint8Array(n), dist = new Float32Array(n);
    const total = centers.reduce((s, c) => s + c[2], 0);
    const cum = []; let acc = 0;
    for (const c of centers) { acc += c[2] / total; cum.push(acc); }
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const hub = A.scenario.hub;
    let maxD = 0;
    for (let i = 0; i < n; i++) {
      const r = rnd(); let ci = cum.findIndex(x => r <= x); if (ci < 0) ci = centers.length - 1;
      const c = centers[ci];
      let gx = gauss(), gy = gauss();
      while (gx * gx + gy * gy > 7.5) { gx = gauss(); gy = gauss(); }
      const x = c[0] + gx * c[3] / (111 * KX), y = c[1] + gy * c[3] / 111;
      lng[i] = x; lat[i] = y; center[i] = ci; zone[i] = nearestZone(x, y);
      const d = Math.hypot((x - hub.lng) * KX, y - hub.lat); dist[i] = d; if (d > maxD) maxD = d;
    }
    for (let i = 0; i < n; i++) dist[i] /= maxD;
    const zoneCount = new Array(A.zones.length).fill(0);
    for (let i = 0; i < n; i++) zoneCount[zone[i]]++;
    pointsCache = { n, lng, lat, zone, center, dist, zoneCount };
    return pointsCache;
  };

  /* Шестиугольная сетка плотности (~1,3 км): высота столбика — число заявок, цвет — зона большинства. */
  let hexCache = null;
  A.hexbins = () => {
    if (hexCache) return hexCache;
    const P = A.points(), R = .0118, s3 = Math.sqrt(3), cells = new Map();
    for (let i = 0; i < P.n; i++) {
      const x = P.lng[i] * KX, y = P.lat[i];
      const q = (s3 / 3 * x - y / 3) / R, r = (2 / 3 * y) / R;
      let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
      const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dz >= dy) rz = -rx - ry;
      const key = rx * 100000 + rz;
      let c = cells.get(key);
      if (!c) { c = { q: rx, r: rz, n: 0, z: new Uint16Array(A.zones.length) }; cells.set(key, c); }
      c.n++; c.z[P.zone[i]]++;
    }
    let max = 0;
    const list = [...cells.values()].filter(c => c.n >= 3);
    list.forEach(c => { if (c.n > max) max = c.n; });
    const best = A.zones.map(() => null);
    const features = list.map(c => {
      const cx = R * (s3 * c.q + s3 / 2 * c.r), cy = R * 1.5 * c.r;
      let zi = 0; for (let k = 1; k < c.z.length; k++) if (c.z[k] > c.z[zi]) zi = k;
      if (!best[zi] || c.n > best[zi].n) best[zi] = { n: c.n, lngLat: [cx / KX, cy] };
      const ring = [];
      for (let k = 0; k <= 6; k++) { const a = Math.PI / 180 * (60 * (k % 6) - 30); ring.push([(cx + R * .9 * Math.cos(a)) / KX, cy + R * .9 * Math.sin(a)]); }
      return { type: 'Feature', properties: { n: c.n, k: Math.round(c.n / max * 1000) / 1000, z: zi, color: A.zones[zi].color }, geometry: { type: 'Polygon', coordinates: [ring] } };
    });
    hexCache = { type: 'FeatureCollection', features, max, peaks: best };
    return hexCache;
  };

  /* ---------- Демо-заявки пакета № 2417 (строятся по индексу, в хранилище не пишутся) ---------- */
  const streets = ['ул. Ленина', 'ул. Садовая', 'Октябрьский пр-т', 'ул. Школьная', 'ул. Лесная', 'ул. Мира', 'ул. Парковая', 'Комсомольская ул.', 'ул. Победы', 'Советская ул.', 'ул. Молодёжная', 'ул. Центральная', 'ул. Гагарина', 'Заводская ул.', 'ул. Пушкина', 'Береговая ул.', 'ул. Строителей', 'Новая ул.', 'ул. Энтузиастов', 'Профсоюзная ул.'];
  const firstNames = ['Анна', 'Игорь', 'Мария', 'Дмитрий', 'Ольга', 'Сергей', 'Елена', 'Алексей', 'Наталья', 'Павел', 'Ирина', 'Михаил', 'Татьяна', 'Андрей', 'Юлия', 'Никита', 'Светлана', 'Артём', 'Ксения', 'Роман'];
  const initials = 'АБВГДЕЗИКЛМНОПРСТФХЧШ';
  const shops = ['Магазин «Уют»', 'Аптека «Здоровье»', 'Кофейня «Зерно»', 'Цветы «Флора»', 'Книжный «Лист»', 'Зоомагазин «Хвост»', 'Пекарня «Колос»', 'Оптика «Взгляд»', 'Электроника «Ватт»', 'Мебель «Кедр»', 'Спорт «Старт»', 'Хозтовары «Дом»', 'Канцтовары «Скрепка»', 'Салон «Бриз»', 'Детский «Мишка»', 'Фермерская лавка'];
  const personCargo = [['Одежда', .4, 4], ['Книги', .5, 6], ['Электроника', .3, 8], ['Косметика', .2, 3], ['Бытовая химия', 2, 12], ['Посуда', 1, 9], ['Зоотовары', 2, 15], ['Продукты', 3, 14]];
  const bizCargo = [['Канцтовары', 8, 60], ['Продукты', 20, 180], ['Лекарства', 4, 40], ['Стройматериалы', 40, 320], ['Мебель', 30, 260], ['Бытовая химия', 15, 120], ['Электроника', 6, 90], ['Цветы', 5, 35]];
  const personSlots = [['10:00', '14:00'], ['14:00', '18:00'], ['18:00', '22:00'], ['08:00', '12:00']];
  const bizSlots = [['09:00', '13:00'], ['10:00', '18:00'], ['13:00', '17:00'], ['07:00', '11:00']];
  const issues = ['Нет номера дома', 'Телефон в неверном формате', 'Не указан вес', 'Окно приёмки короче часа'];

  A.demoOrder = i => {
    const P = A.points(), h = s => A.hash(i, s);
    const business = h(1) < .38;
    const town = centers[P.center[i]][4];
    const street = streets[Math.floor(h(2) * streets.length)];
    const house = 1 + Math.floor(h(3) * 120);
    const cargo = (business ? bizCargo : personCargo)[Math.floor(h(4) * 8)];
    const weight = Math.round((cargo[1] + h(5) * (cargo[2] - cargo[1])) * 10) / 10;
    const places = business ? 1 + Math.floor(h(6) * 10) : 1 + Math.floor(h(6) * h(6) * 4);
    const slot = (business ? bizSlots : personSlots)[Math.floor(h(7) * 4)];
    const issue = h(8) < .0031 ? issues[Math.floor(h(9) * issues.length)] : '';
    return {
      number: A.scenario.packageNo + '-' + String(i + 1).padStart(5, '0'),
      business,
      recipient: business ? shops[Math.floor(h(10) * shops.length)] : firstNames[Math.floor(h(10) * firstNames.length)] + ' ' + initials[Math.floor(h(11) * initials.length)] + '.',
      address: `${town}, ${street}, ${house}`,
      cargo: cargo[0], weight, places,
      from: slot[0], to: slot[1],
      zone: P.zone[i],
      issue
    };
  };

  let packStats = null;
  A.packageStats = () => {
    if (packStats) return packStats;
    const n = A.scenario.orders, load = new Array(24).fill(0), zones = new Array(A.zones.length).fill(0), rows = new Array(n);
    let weight = 0, places = 0, business = 0, issues = 0;
    for (let i = 0; i < n; i++) {
      const o = A.demoOrder(i); rows[i] = o;
      weight += o.weight; places += o.places; business += o.business ? 1 : 0; issues += o.issue ? 1 : 0;
      zones[o.zone]++;
      const a = Number(o.from.slice(0, 2)), b = Number(o.to.slice(0, 2));
      for (let h = a; h < b; h++) load[h] += 1 / (b - a);
    }
    packStats = { n, weight, places, business, issues, ready: n - issues, load, zones, rows };
    return packStats;
  };
})(Atlas);
