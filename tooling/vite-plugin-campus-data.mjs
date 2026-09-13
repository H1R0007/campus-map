/**
 * Vite-плагин: подключает общий каталог данных к приложениям.
 *
 * Оба приложения читают датасет по абсолютному пути `/data/...`, но сами
 * данные лежат в корне монорепо в единственном экземпляре. Раньше их нужно
 * было вручную копировать в `apps/*\/public/data` — этот каталог был в
 * `.gitignore`, а механизма его создать в репозитории не было, поэтому чистый
 * клон не запускался.
 *
 * Плагин раздаёт один и тот же каталог и в dev, и в preview, и кладёт файлы в
 * прод-сборку — без промежуточных копий в дереве исходников.
 *
 * Использование:
 *   campusDataPlugin({ sourceDir: path.resolve(__dirname, '../../data') })
 *
 * `DATA_ROOT` берётся из `@campus-map/core`: раскладка данных принадлежит
 * доменному пакету, а инструмент сборки не должен заводить свою копию
 * константы и расходиться с ней.
 *
 * Точка монтирования учитывает `base` из конфига Vite, поэтому приложение
 * одинаково работает и в корне домена, и в подкаталоге. Отдельной опции для
 * базового пути намеренно нет: второй источник истины о нём разошёлся бы с
 * тем, что подставляет Vite в `import.meta.env.BASE_URL`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DATA_ROOT } from '@campus-map/core';

const MIME_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Рекурсивно перечисляет файлы каталога относительными путями в POSIX-нотации.
 */
function walk(directory, prefix = '') {
  const result = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      result.push(...walk(path.join(directory, entry.name), relative));
    } else if (entry.isFile()) {
      result.push(relative);
    }
  }

  return result;
}

/** Запрос не к данным — его обрабатывает Vite. */
const NOT_DATA = { kind: 'skip' };

/** Запрос к данным, но разобрать путь не удалось. */
const MALFORMED = { kind: 'bad' };

/**
 * Разбирает URL запроса к данным.
 *
 * Любой запрос на `/data/*` должен получить ответ от плагина: если оставить
 * неразобранный путь Vite, SPA-fallback отдаст `index.html` с кодом 200, и
 * загрузчик датасета будет разбирать HTML как JSON.
 */
function parseDataUrl(url, mountPath) {
  if (!url || (url !== mountPath && !url.startsWith(`${mountPath}/`))) {
    return NOT_DATA;
  }

  let relative;
  try {
    // Битый percent-encoding (например, одиночный «%») заставляет
    // decodeURIComponent бросить исключение — без перехвата это уронило бы
    // middleware с 500.
    relative = decodeURIComponent(url.slice(mountPath.length).split('?')[0]);
  } catch {
    return MALFORMED;
  }

  // NUL в пути — классический приём обрезать расширение. Разные файловые
  // системы и HTTP-стеки трактуют его по-разному, поэтому такой запрос
  // отклоняем целиком, не пытаясь резолвить.
  if (relative.includes('\0')) {
    return MALFORMED;
  }

  return { kind: 'path', relative };
}

/**
 * Резолвит относительный путь внутри каталога, не выпуская наружу.
 *
 * @returns абсолютный путь либо `null`, если путь выходит за границы.
 */
function resolveInside(root, relative) {
  const resolved = path.resolve(root, `.${relative}`);

  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

export function campusDataPlugin(options = {}) {
  const sourceDir = options.sourceDir;

  if (!sourceDir) {
    throw new Error('campusDataPlugin: требуется sourceDir');
  }
  if (!existsSync(sourceDir)) {
    throw new Error(`campusDataPlugin: каталог данных не найден: ${sourceDir}`);
  }

  const dataDir = path.resolve(sourceDir);

  /**
   * Точка монтирования с учётом `base`. Заполняется в `configResolved`:
   * до него базовый путь неизвестен.
   */
  let mountPath = `/${DATA_ROOT}`;

  /** Каталог сборки — нужен, чтобы preview отдавал 404 по тем же правилам. */
  let outDir = 'dist';

  /**
   * Отдаёт файл из каталога данных либо 404.
   *
   * Явный 404 критичен: SPA-fallback Vite на неизвестный путь отдаёт
   * `index.html` с кодом 200, и загрузчик датасета получает HTML вместо JSON.
   * Тогда «этажа нет» превращается из мягкого предупреждения в падение всей
   * загрузки с непонятной причиной.
   *
   * @returns `true`, если ответ отправлен и дальнейшая обработка не нужна.
   */
  function serveFromDirectory(req, res, root) {
    const parsed = parseDataUrl(req.url, mountPath);
    if (parsed.kind === 'skip') {
      return false;
    }
    if (parsed.kind === 'bad') {
      res.statusCode = 400;
      res.end('Bad request');
      return true;
    }

    const resolved = resolveInside(root, parsed.relative);
    if (resolved === null) {
      res.statusCode = 403;
      res.end('Forbidden');
      return true;
    }

    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return true;
    }

    res.setHeader(
      'Content-Type',
      MIME_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream'
    );
    res.setHeader('Cache-Control', 'no-cache');
    res.end(readFileSync(resolved));
    return true;
  }

  return {
    name: 'campus-map:shared-data',

    configResolved(config) {
      outDir = config.build.outDir;

      // `config.base` Vite нормализует так, что он всегда начинается и
      // заканчивается слэшем: '/' либо '/campus/'.
      mountPath = `${config.base}${DATA_ROOT}`;

      // Вторая копия датасета внутри приложения. `public/` Vite копирует в
      // `dist/` сам, поэтому вместе с `generateBundle` этого плагина в
      // `dist/data/**` оказались бы два писателя, и победитель зависел бы от
      // порядка. Именно так получалось «в редакторе видно, в навигаторе нет».
      //
      // Проверка стоит здесь, а не только в `.gitignore`: игнор прячет копию
      // от git, но не мешает ей появиться на диске и молча подменить данные.
      if (config.publicDir) {
        const strayData = path.join(config.publicDir, DATA_ROOT);

        if (existsSync(strayData)) {
          throw new Error(
            `campusDataPlugin: внутри приложения найдена копия датасета: ${strayData}\n` +
              `Датасет живёт в единственном экземпляре в корне репозитория и раздаётся этим ` +
              `плагином — в dev, в preview и в сборке. Копию нужно удалить.\n` +
              `Если это junction или симлинк на Windows, удалять его надо через ` +
              `«rmdir» (или Directory.Delete(path, false)): «rm -rf» пройдёт по ссылке ` +
              `и снесёт настоящие данные.`
          );
        }
      }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (serveFromDirectory(req, res, dataDir)) {
          return;
        }
        next();
      });
    },

    configurePreviewServer(server) {
      const distData = path.resolve(outDir, DATA_ROOT);

      server.middlewares.use((req, res, next) => {
        if (serveFromDirectory(req, res, distData)) {
          return;
        }
        next();
      });
    },

    generateBundle() {
      for (const relative of walk(dataDir)) {
        this.emitFile({
          type: 'asset',
          fileName: `${DATA_ROOT}/${relative}`,
          source: readFileSync(path.join(dataDir, relative)),
        });
      }
    },
  };
}
