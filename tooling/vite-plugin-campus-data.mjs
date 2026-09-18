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

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_ROOT } from '@campus-map/core';

/**
 * Что редактору разрешено писать в каталог данных.
 *
 * Список закрытый: запись включается только для редактора в режиме
 * разработки, но и там незачем позволять класть рядом с планами что угодно.
 */
const WRITABLE_EXTENSIONS = new Set(['.json', '.png', '.svg', '.jpg', '.jpeg', '.webp']);

/** Наибольший размер одного сохранения, байты: официальные планы тяжёлые. */
const MAX_SAVE_BYTES = 64 * 1024 * 1024;

const MIME_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

/** Отпечаток содержимого файла: по нему видно, менялся ли файл на диске. */
function hashOf(content) {
  return createHash('sha1').update(content).digest('hex');
}

/**
 * Запрос пришёл с этой же машины и от самой страницы редактора.
 *
 * Dev-сервер слушает все интерфейсы (`host: true`), поэтому запись
 * разрешается только с петлевого адреса. Заголовок `x-campus-editor`
 * добавляет страница: с чужого происхождения браузер сначала спросил бы
 * разрешение предварительным запросом, а его сервер не выдаёт.
 */
function isTrustedWrite(req) {
  const address = req.socket?.remoteAddress ?? '';
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  const sameSite = !req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin';
  return loopback && sameSite && req.headers['x-campus-editor'] === '1';
}

/** Читает тело запроса целиком; `null` — тело больше разрешённого. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SAVE_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

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
  /**
   * Разрешить редактору сохранять правки прямо в каталог данных.
   *
   * Включается только у редактора и работает только в dev-сервере: команда
   * разметки запускает его из репозитория, и правки сразу попадают в `data/`,
   * откуда их видит навигатор и забирает git. Развёрнутый редактор такой
   * возможности не имеет — там остаётся архив.
   */
  const writable = options.writable === true;

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

  /** Служебные адреса редактора: манифест и сохранение. */
  let controlPath = '/__campus';

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
      controlPath = `${config.base}__campus`;

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
      if (writable) {
        server.middlewares.use(`${controlPath}/manifest`, (req, res, next) => {
          if (req.method !== 'GET') return next();

          const files = {};
          for (const relative of walk(dataDir)) {
            files[relative] = hashOf(readFileSync(path.join(dataDir, relative)));
          }
          sendJson(res, 200, { writable: true, dataDir, files });
        });

        server.middlewares.use(`${controlPath}/save`, async (req, res, next) => {
          if (req.method !== 'POST') return next();
          if (!isTrustedWrite(req)) return sendJson(res, 403, { error: 'Запись разрешена только с этой машины' });

          const body = await readBody(req);
          if (body === null) return sendJson(res, 413, { error: 'Слишком большое сохранение' });

          let request;
          try {
            request = JSON.parse(body.toString('utf8'));
          } catch (cause) {
            return sendJson(res, 400, { error: `Тело запроса не разобрано: ${cause.message}` });
          }

          const files = request?.files ?? {};
          const base = request?.base ?? {};
          const planned = [];

          // Сначала проверяются все файлы: сохранение целиком либо не
          // применяется вовсе — половина записанных файлов хуже отказа.
          for (const [relative, file] of Object.entries(files)) {
            const resolved = resolveInside(dataDir, `/${relative}`);
            if (resolved === null || !WRITABLE_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
              return sendJson(res, 400, { error: `Недопустимый путь: ${relative}` });
            }

            const content =
              typeof file?.text === 'string'
                ? Buffer.from(file.text, 'utf8')
                : typeof file?.base64 === 'string'
                  ? Buffer.from(file.base64, 'base64')
                  : null;
            if (content === null) return sendJson(res, 400, { error: `Нет содержимого файла: ${relative}` });

            const existing = existsSync(resolved) && statSync(resolved).isFile() ? readFileSync(resolved) : null;
            const actual = existing === null ? null : hashOf(existing);
            const expected = base[relative] ?? null;

            // Файл изменился на диске после того, как редактор его прочитал:
            // перезапись затёрла бы чужую правку молча.
            if (expected !== actual && actual !== hashOf(content)) {
              return sendJson(res, 409, { conflicts: [{ path: relative, expected, actual }] });
            }

            planned.push({ relative, resolved, content, unchanged: actual === hashOf(content) });
          }

          const written = [];
          const unchanged = [];
          const hashes = {};
          for (const file of planned) {
            if (file.unchanged) {
              unchanged.push(file.relative);
            } else {
              mkdirSync(path.dirname(file.resolved), { recursive: true });
              writeFileSync(file.resolved, file.content);
              written.push(file.relative);
            }
            hashes[file.relative] = hashOf(file.content);
          }

          sendJson(res, 200, { written, unchanged, hashes });
        });
      }

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
