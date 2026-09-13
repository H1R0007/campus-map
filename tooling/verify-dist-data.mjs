#!/usr/bin/env node
/**
 * Проверка: датасет в сборке совпадает с каноническим `data/` в корне.
 *
 * Зачем отдельная проверка, а не запись в документации. В master однажды
 * оказались две полные копии датасета — в `apps/viewer/public/data/` и
 * `apps/editor/public/data/`. Каталог `public/` Vite копирует в `dist/` сам,
 * а `campusDataPlugin` кладёт туда же данные через `emitFile`. Двое писателей
 * в один путь дают результат, зависящий от порядка: приложения начинают
 * видеть разные данные, и «в редакторе есть, в навигаторе нет» ищется очень
 * долго.
 *
 * Проверяется не только совпадение содержимого, но и **отсутствие лишних
 * файлов**: именно лишний файл выдаёт вернувшуюся копию.
 *
 * Использование:
 *   node tooling/verify-dist-data.mjs --app viewer
 *   node tooling/verify-dist-data.mjs --dist apps/viewer/dist
 *   node tooling/verify-dist-data.mjs --app viewer --data .local/synthetic-data
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_ROOT } from '@campus-map/core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = { app: null, dist: null, data: null };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--app') options.app = argv[++i];
    else if (argv[i] === '--dist') options.dist = argv[++i];
    else if (argv[i] === '--data') options.data = argv[++i];
    else throw new Error(`Неизвестный аргумент: ${argv[i]}`);
  }

  if (!options.app && !options.dist) {
    throw new Error('Нужен --app <viewer|editor> либо --dist <путь>');
  }

  return options;
}

/** Рекурсивно перечисляет файлы каталога относительными путями в POSIX-нотации. */
function walk(directory, prefix = '') {
  const result = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...walk(full, relative));
    } else if (entry.isFile()) {
      result.push(relative);
    } else if (entry.isSymbolicLink()) {
      // Ссылка внутри собранного датасета — всегда ошибка: в `dist` должны
      // лежать настоящие файлы, иначе развёртывание копированием каталога
      // отдаст битые пути.
      throw new Error(`В сборке найдена ссылка вместо файла: ${full}`);
    }
  }

  return result;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const dataDir = path.resolve(repoRoot, options.data ?? DATA_ROOT);
  const distDir = options.dist
    ? path.resolve(repoRoot, options.dist)
    : path.join(repoRoot, 'apps', options.app, 'dist');
  const distDataDir = path.join(distDir, DATA_ROOT);

  if (!existsSync(dataDir)) {
    throw new Error(`Канонический каталог данных не найден: ${dataDir}`);
  }
  if (!existsSync(distDataDir) || !statSync(distDataDir).isDirectory()) {
    throw new Error(
      `В сборке нет каталога данных: ${distDataDir}\n` +
        'Сначала нужно собрать приложение (`pnpm build`).'
    );
  }

  const expected = new Set(walk(dataDir));
  const actual = new Set(walk(distDataDir));

  const missing = [...expected].filter((file) => !actual.has(file)).sort();
  const extra = [...actual].filter((file) => !expected.has(file)).sort();
  const differing = [...expected]
    .filter((file) => actual.has(file))
    .filter((file) => sha256(path.join(dataDir, file)) !== sha256(path.join(distDataDir, file)))
    .sort();

  const label = options.app ?? path.relative(repoRoot, distDir);

  if (missing.length === 0 && extra.length === 0 && differing.length === 0) {
    process.stdout.write(`\n${label}: dist/${DATA_ROOT} совпадает с ${DATA_ROOT}/ — ${expected.size} файлов\n`);
    return;
  }

  process.stdout.write(`\n${label}: датасет в сборке разошёлся с каноническим\n`);

  for (const file of missing) {
    process.stdout.write(`  НЕТ В СБОРКЕ   ${file}\n`);
  }
  for (const file of extra) {
    process.stdout.write(`  ЛИШНИЙ         ${file}\n`);
  }
  for (const file of differing) {
    process.stdout.write(`  ОТЛИЧАЕТСЯ     ${file}\n`);
  }

  if (extra.length > 0) {
    process.stdout.write(
      '\nЛишние файлы обычно означают вторую копию датасета внутри приложения\n' +
        `(\`apps/*/public/${DATA_ROOT}\`). Данные должны лежать в единственном экземпляре\n` +
        'в корне репозитория и раздаваться `tooling/vite-plugin-campus-data.mjs`.\n'
    );
  }

  process.exit(1);
}

try {
  main();
} catch (cause) {
  process.stderr.write(`\nПроверка датасета не выполнена: ${cause?.message ?? cause}\n`);
  process.exitCode = 1;
}
