// Достаёт подписчиков из архива TikTok и обновляет followers.json для города.
// Запуск:  node extract-followers.mjs путь/к/user_data_tiktok.json [followers.json]
//
// Берётся ТОЛЬКО блок FansList (дата подписки и ник). Почта, дата рождения,
// подписки и всё остальное из архива не читается и не сохраняется.
//
// Номера жителей стабильны: старые жители сохраняют свой номер и дом,
// новые получают следующие номера по дате подписки. Кто отписался,
// помечается left: true — дом остаётся на месте, но стоит свободным.

import fs from 'node:fs';

const [, , input, output = 'followers.json'] = process.argv;
if (!input) {
  console.error('Укажи путь к user_data_tiktok.json');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(input, 'utf8'));

// Ищем FansList, где бы он ни лежал (TikTok иногда меняет разделы архива).
function findFans(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node.FansList)) return node.FansList;
  for (const v of Object.values(node)) {
    const found = findFans(v);
    if (found) return found;
  }
  return null;
}

const fans = findFans(data);
if (!fans) {
  console.error('В архиве не нашёлся FansList. Проверь, что выбран раздел «Профиль и настройки» в формате JSON.');
  process.exit(1);
}

// Ключ жителя: ник, а для скрытых аккаунтов без ника — дата подписки.
const keyOf = (name, date) => (name ? 'u:' + name.toLowerCase() : 'd:' + date);

const incoming = fans
  .map(f => ({ name: String(f.UserName ?? '').trim(), date: String(f.Date ?? '').trim() }))
  .filter(f => f.date)
  .sort((a, b) => a.date.localeCompare(b.date));

let previous = [];
if (fs.existsSync(output)) {
  const old = JSON.parse(fs.readFileSync(output, 'utf8'));
  previous = Array.isArray(old) ? old : old.followers ?? [];
}

const byKey = new Map(previous.map(f => [keyOf(f.name, f.date), { ...f }]));
const present = new Set();
let nextN = previous.reduce((m, f) => Math.max(m, f.n), 0) + 1;
let added = 0;

for (const f of incoming) {
  const k = keyOf(f.name, f.date);
  present.add(k);
  const known = byKey.get(k);
  if (known) {
    delete known.left;
  } else {
    byKey.set(k, { n: nextN++, name: f.name, date: f.date });
    added++;
  }
}

let left = 0;
for (const [k, f] of byKey) {
  if (!present.has(k)) { f.left = true; left++; }
}

const followers = [...byKey.values()].sort((a, b) => a.n - b.n);
fs.writeFileSync(output, JSON.stringify({ updated: new Date().toISOString(), followers }, null, 2));

const active = followers.filter(f => !f.left).length;
console.log(`Готово: ${active} жителей, новых ${added}, отписались ${left}. Файл: ${output}`);
