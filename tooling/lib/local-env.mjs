/**
 * Настройки этой машины: переменная окружения или строка в `.env.local`.
 *
 * Путь к общей папке фото (запись 85) у каждого разработчика свой — облачная
 * папка, сетевой диск. Набирать переменную окружения перед каждым запуском
 * неудобно, поэтому её можно один раз записать в `.env.local` в корне
 * репозитория (файл в git не попадает):
 *
 *   CAMPUS_PHOTOS_DIR=D:/Яндекс.Диск/campus-photos
 *
 * Переменная окружения важнее файла: проверки подменяют каталоги ею.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Строки `ИМЯ=значение` файла; кавычки вокруг значения снимаются. */
function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/**
 * Каталог из настройки: абсолютный путь или `undefined`, если настройки нет.
 * Относительный путь из окружения — от текущего каталога, как у
 * `CAMPUS_DATA_DIR`; из `.env.local` — от корня репозитория.
 *
 * @param {string} name имя настройки
 * @param {{ envFile?: string }} [options] другой файл настроек — для проверок
 */
export function localDirectory(name, options = {}) {
  const fromEnv = process.env[name];
  if (fromEnv) return path.resolve(process.cwd(), fromEnv);

  const fromFile = readEnvFile(options.envFile ?? path.join(repoRoot, '.env.local'))[name];
  return fromFile ? path.resolve(repoRoot, fromFile) : undefined;
}
