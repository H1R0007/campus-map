#!/usr/bin/env node
/**
 * Кроссплатформенное удаление артефактов сборки.
 *
 * Раньше скрипты `clean` были написаны как `rm -rf dist *.tsbuildinfo`. В
 * POSIX-оболочке это работает, но основная машина разработки в этом проекте —
 * Windows, где ни `rm` в cmd/PowerShell, ни раскрытие `*` оболочкой не
 * существуют. Описывать в документации обход через Git Bash — значит сделать
 * обязательным ещё один инструмент ради удаления каталога.
 *
 * Отдельно про Windows: `dist` может оказаться junction или симлинком, и
 * рекурсивное удаление прошло бы по ссылке и снесло цель. Поэтому точки
 * повторного разбора удаляются как ссылки, без захода внутрь.
 *
 * Использование (пути относительно текущего каталога):
 *   node ../../tooling/clean.mjs dist "*.tsbuildinfo"
 *
 * Шаблон поддерживается только в имени файла и только `*` — большего здесь
 * не нужно, а полноценный glob потянул бы зависимость.
 */

import { lstatSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';

/** Существует ли путь — без броска на отсутствующем файле. */
function lstatOrNull(target) {
  try {
    return lstatSync(target);
  } catch {
    // Единственная ожидаемая причина — пути нет. Для `clean` это успех:
    // удалять нечего. Любая другая ошибка проявится на самом удалении.
    return null;
  }
}

/** Раскрывает `*` в имени файла в список существующих путей. */
function expand(pattern) {
  const directory = path.dirname(pattern);
  const name = path.basename(pattern);

  if (!name.includes('*')) {
    return [pattern];
  }

  const matcher = new RegExp(
    `^${name.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
  );

  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    // Каталога нет — раскрывать нечего.
    return [];
  }

  return entries.filter((entry) => matcher.test(entry)).map((entry) => path.join(directory, entry));
}

function remove(target) {
  const stats = lstatOrNull(target);
  if (stats === null) return false;

  // Симлинк или junction: удаляем саму ссылку. `rmSync` с `recursive`
  // на такой цели в некоторых версиях Node заходит внутрь.
  if (stats.isSymbolicLink()) {
    unlinkSync(target);
    return true;
  }

  rmSync(target, { recursive: true, force: true });
  return true;
}

const patterns = process.argv.slice(2);

if (patterns.length === 0) {
  process.stderr.write('clean: не указано, что удалять\n');
  process.exit(1);
}

let removed = 0;

for (const pattern of patterns) {
  for (const target of expand(path.resolve(pattern))) {
    if (remove(target)) {
      process.stdout.write(`  удалено  ${path.relative(process.cwd(), target) || target}\n`);
      removed += 1;
    }
  }
}

if (removed === 0) {
  process.stdout.write('  нечего удалять\n');
}
