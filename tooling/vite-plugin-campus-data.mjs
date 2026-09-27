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
 *
 * Исходники планов — файлы, как их прислали (PDF, сканы, чертежи), — лежат
 * отдельно, в `sourcesDir` (`data-sources/`, запись 46): в навигатор они не
 * попадают, редактор берёт их, чтобы переделать план.
 *
 * Учебная копия (`sandboxDir`, запись 55) — отдельный каталог с копией
 * данных и своими служебными адресами (`__campus/sandbox/...`): в ней можно
 * пробовать всё, включая сохранение, а настоящие данные не меняются.
 */

import { createHash } from 'node:crypto';
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
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

/**
 * Наибольший размер одного загружаемого файла, байты.
 *
 * Большие файлы — готовые планы и исходники — идут не в теле сохранения, а
 * заранее, по одному (`upload`): иначе десяток этажей разом не пролез бы в
 * одно сохранение. Скан в TIFF без сжатия бывает в сотни мегабайт.
 */
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

/** Имя загрузки — полный SHA-256 содержимого. */
const UPLOAD_NAME = /^[0-9a-f]{64}$/;

/**
 * Имя исходника: первые 16 знаков SHA-256 содержимого и расширение.
 *
 * Имя по содержимому: один и тот же файл, присланный дважды, лежит один раз,
 * а запись об исходнике в данных не зависит от того, как файл назвали.
 */
const SOURCE_NAME = /^([0-9a-f]{16})\.(pdf|png|jpg|jpeg|webp|gif|bmp|svg|tif|tiff|dxf)$/;

/** Сколько лежит неиспользованная загрузка, прежде чем её убрать, миллисекунды. */
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

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

function sha256Of(content) {
  return createHash('sha256').update(content).digest('hex');
}

/** Содержимое файла или `null`, если его нет. */
function readIfFile(resolved) {
  return existsSync(resolved) && statSync(resolved).isFile() ? readFileSync(resolved) : null;
}

/** Имя из хвоста адреса служебного запроса: `/abc?x` → `abc`. */
function nameFromUrl(url) {
  return (url ?? '').split('?')[0].replace(/^\//, '');
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

/**
 * Пишет тело запроса в файл потоком, считая SHA-256 на ходу.
 *
 * Тело не собирается в памяти целиком: загрузки бывают в сотни мегабайт.
 *
 * @returns отпечаток содержимого или `null`, если тело больше разрешённого
 */
function streamBodyToFile(req, target) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const out = createWriteStream(target);
    let size = 0;
    let tooBig = false;

    req.on('data', (chunk) => {
      if (tooBig) return;
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        tooBig = true;
        out.destroy();
        req.destroy();
        rmSync(target, { force: true });
        resolve(null);
        return;
      }
      hash.update(chunk);
      out.write(chunk);
    });
    req.on('end', () => {
      if (tooBig) return;
      out.end(() => resolve(hash.digest('hex')));
    });
    req.on('error', (cause) => {
      out.destroy();
      rmSync(target, { force: true });
      reject(cause);
    });
  });
}

/**
 * Убирает пустые каталоги от `directory` вверх, не выше `root`.
 *
 * Каталог, который держит открытым кто-то ещё (проводник, антивирус на
 * Windows), остаётся: пустой каталог данным не мешает, а сохранение уже
 * записано.
 */
function removeEmptyDirectories(directory, root) {
  let current = directory;
  while (current.startsWith(`${root}${path.sep}`) && existsSync(current) && readdirSync(current).length === 0) {
    try {
      rmdirSync(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

/** Убирает загрузки, которые так и не вошли в сохранение. */
function cleanStaleUploads(uploadsDir) {
  if (!existsSync(uploadsDir)) return;
  const now = Date.now();
  for (const name of readdirSync(uploadsDir)) {
    const file = path.join(uploadsDir, name);
    try {
      if (now - statSync(file).mtimeMs > UPLOAD_TTL_MS) rmSync(file, { force: true });
    } catch {
      // Файл убрал кто-то другой — тем лучше.
    }
  }
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

/**
 * Раскладка учебной копии. Копия не может лежать ни внутри настоящих данных,
 * ни вокруг них: сброс копии удаляет её каталог целиком.
 */
function sandboxLayout(sandboxDir, dataDir) {
  const inside = (child, parent) => child === parent || child.startsWith(`${parent}${path.sep}`);
  if (inside(sandboxDir, dataDir) || inside(dataDir, sandboxDir)) {
    throw new Error(`campusDataPlugin: учебная копия (${sandboxDir}) пересекается с каталогом данных (${dataDir})`);
  }
  return {
    root: sandboxDir,
    dataDir: path.join(sandboxDir, DATA_ROOT),
    sourcesDir: path.join(sandboxDir, 'data-sources'),
    stateFile: path.join(sandboxDir, 'state.json'),
  };
}

export function campusDataPlugin(options = {}) {
  const sourceDir = options.sourceDir;

  /**
   * Каталог исходников планов (`data-sources/`). Нужен только редактору;
   * создаётся при первом сохранённом исходнике.
   */
  const sourcesDir = options.sourcesDir ? path.resolve(options.sourcesDir) : null;

  /** Загрузки ждут сохранения здесь — вне репозитория. */
  const uploadsDir = options.uploadsDir ? path.resolve(options.uploadsDir) : path.join(os.tmpdir(), 'campus-map-uploads');
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
   * Учебная копия (запись 55): каталог, куда копируются данные, чтобы
   * пробовать правки без риска. Внутри — `data/`, `data-sources/` и отметка
   * о создании. Только для редактора с записью.
   */
  const sandbox = writable && options.sandboxDir ? sandboxLayout(path.resolve(options.sandboxDir), dataDir) : null;

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
  function serveFromDirectory(req, res, root, mount = mountPath) {
    const parsed = parseDataUrl(req.url, mount);
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
        cleanStaleUploads(uploadsDir);
        mountSpace(server, `${controlPath}`, { dataDir, sourcesDir, readSources: [sourcesDir] });

        if (sandbox) {
          // Учебная копия (запись 55): свои адреса, свой каталог данных и
          // исходников. Настоящий `data/` через эти адреса недостижим.
          const prefix = `${controlPath}/sandbox`;
          mountSpace(server, prefix, {
            dataDir: sandbox.dataDir,
            sourcesDir: sandbox.sourcesDir,
            // Исходники неизменны (имя — отпечаток), поэтому копия читает и
            // настоящие: «Изменить обрезку» работает и в копии.
            readSources: [sandbox.sourcesDir, sourcesDir],
          });

          server.middlewares.use(`${prefix}/state`, (req, res, next) => {
            if (req.method !== 'GET') return next();
            sendJson(res, 200, sandboxState());
          });

          server.middlewares.use(`${prefix}/reset`, (req, res, next) => {
            if (req.method !== 'POST') return next();
            if (!isTrustedWrite(req)) return sendJson(res, 403, { error: 'Запись разрешена только с этой машины' });
            try {
              resetSandbox();
            } catch (cause) {
              return sendJson(res, 500, { error: `Копия не создана: ${cause.message}` });
            }
            sendJson(res, 200, sandboxState());
          });

          server.middlewares.use((req, res, next) => {
            if (serveFromDirectory(req, res, sandbox.dataDir, `${prefix}/${DATA_ROOT}`)) return;
            next();
          });
        }
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

  /** Состояние учебной копии: есть ли она и когда создана. */
  function sandboxState() {
    const exists = existsSync(sandbox.dataDir);
    let createdAt = null;
    try {
      createdAt = JSON.parse(readFileSync(sandbox.stateFile, 'utf8')).createdAt ?? null;
    } catch {
      // Нет отметки — копию делали вручную; дата неизвестна.
    }
    return { exists, createdAt: exists ? createdAt : null };
  }

  /** Свежая копия настоящих данных; прежняя копия и её исходники убираются. */
  function resetSandbox() {
    for (const directory of [sandbox.dataDir, sandbox.sourcesDir]) {
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
    mkdirSync(path.dirname(sandbox.dataDir), { recursive: true });
    cpSync(dataDir, sandbox.dataDir, { recursive: true });
    writeFileSync(sandbox.stateFile, JSON.stringify({ createdAt: Date.now() }));
  }

  /**
   * Служебные адреса редактора для одного каталога данных: манифест,
   * загрузка, исходники, сохранение.
   *
   * @param prefix начало адресов: `/__campus` для настоящих данных,
   *        `/__campus/sandbox` для учебной копии
   * @param space где лежат данные и исходники; `readSources` — где исходники
   *        ищутся при чтении, по порядку
   */
  function mountSpace(server, prefix, space) {
    const { dataDir, sourcesDir, readSources } = space;
    const findSource = (name) => {
      for (const directory of readSources) {
        const content = directory ? readIfFile(path.join(directory, name)) : null;
        if (content !== null) return content;
      }
      return null;
    };

    server.middlewares.use(`${prefix}/manifest`, (req, res, next) => {
      if (req.method !== 'GET') return next();

      const files = {};
      if (existsSync(dataDir)) {
        for (const relative of walk(dataDir)) {
          files[relative] = hashOf(readFileSync(path.join(dataDir, relative)));
        }
      }
      const sources = new Set();
      for (const directory of readSources) {
        if (!directory || !existsSync(directory)) continue;
        for (const name of walk(directory)) if (SOURCE_NAME.test(name)) sources.add(name);
      }
      sendJson(res, 200, { writable: true, dataDir, sourcesDir, files, sources: [...sources] });
    });

    // Большой файл — заранее, по одному: сохранение потом ссылается на
    // него по отпечатку. Отпечаток проверяется, так что в сохранение
    // попадёт ровно то, что прислал редактор.
    server.middlewares.use(`${prefix}/upload`, async (req, res, next) => {
      if (req.method !== 'PUT') return next();
      if (!isTrustedWrite(req)) return sendJson(res, 403, { error: 'Запись разрешена только с этой машины' });

      const name = nameFromUrl(req.url);
      if (!UPLOAD_NAME.test(name)) return sendJson(res, 400, { error: `Недопустимое имя загрузки: ${name}` });

      mkdirSync(uploadsDir, { recursive: true });
      const target = path.join(uploadsDir, name);
      const partial = `${target}.${process.pid}.${Date.now()}.part`;
      const actual = await streamBodyToFile(req, partial);
      if (actual === null) return sendJson(res, 413, { error: 'Файл слишком большой' });
      if (actual !== name) {
        rmSync(partial, { force: true });
        return sendJson(res, 400, { error: 'Содержимое не совпало с отпечатком — файл повреждён при передаче' });
      }
      renameSync(partial, target);
      sendJson(res, 200, { uploaded: name });
    });

    // Исходник читается, чтобы переделать план. Только с этой машины:
    // присланные оригиналы могут быть закрытыми, а сервер слушает сеть.
    server.middlewares.use(`${prefix}/sources`, (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (!isTrustedWrite(req)) return sendJson(res, 403, { error: 'Чтение исходников — только с этой машины' });

      const name = nameFromUrl(req.url);
      if (!SOURCE_NAME.test(name)) return sendJson(res, 400, { error: `Недопустимое имя исходника: ${name}` });

      const content = findSource(name);
      if (content === null) return sendJson(res, 404, { error: `Исходника нет на этой машине: ${name}` });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(content);
    });

    server.middlewares.use(`${prefix}/save`, async (req, res, next) => {
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
      const deletions = Array.isArray(request?.delete) ? request.delete : [];
      const sources = request?.sources ?? {};
      const planned = [];
      const plannedDeletions = [];
      const plannedSources = [];
      const usedUploads = new Set();
      const conflicts = [];

      const readUpload = (name) => {
        if (typeof name !== 'string' || !UPLOAD_NAME.test(name)) return null;
        usedUploads.add(name);
        return readIfFile(path.join(uploadsDir, name));
      };

      // Сначала проверяется и читается всё: сохранение целиком либо не
      // применяется вовсе — половина записанных файлов хуже отказа. Копии
      // читаются тоже до записи, поэтому обмен этажей местами (2 ↔ 3) не
      // перезапишет файл раньше, чем его скопируют.
      for (const [relative, file] of Object.entries(files)) {
        const resolved = resolveInside(dataDir, `/${relative}`);
        if (resolved === null || !WRITABLE_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
          return sendJson(res, 400, { error: `Недопустимый путь: ${relative}` });
        }

        let content = null;
        if (typeof file?.text === 'string') {
          content = Buffer.from(file.text, 'utf8');
        } else if (typeof file?.base64 === 'string') {
          content = Buffer.from(file.base64, 'base64');
        } else if (typeof file?.upload === 'string') {
          content = readUpload(file.upload);
          if (content === null) {
            return sendJson(res, 400, { error: `Загрузка не найдена: ${relative}`, missingUpload: file.upload });
          }
        } else if (typeof file?.copy === 'string') {
          // Перенос уже сохранённого файла: этаж получил другой номер,
          // корпус — другой код. Копируемый файл тоже не должен был
          // измениться за спиной редактора.
          const from = resolveInside(dataDir, `/${file.copy}`);
          content = from === null ? null : readIfFile(from);
          if (content === null) return sendJson(res, 400, { error: `Нет файла для переноса: ${file.copy}` });
          const expectedFrom = base[file.copy] ?? null;
          if (expectedFrom !== hashOf(content)) {
            conflicts.push({ path: file.copy, expected: expectedFrom, actual: hashOf(content) });
          }
        }
        if (content === null) return sendJson(res, 400, { error: `Нет содержимого файла: ${relative}` });

        const existing = readIfFile(resolved);
        const actual = existing === null ? null : hashOf(existing);
        const expected = base[relative] ?? null;

        // Файл изменился на диске после того, как редактор его прочитал:
        // перезапись затёрла бы чужую правку молча.
        if (expected !== actual && actual !== hashOf(content)) {
          conflicts.push({ path: relative, expected, actual });
        }

        planned.push({ relative, resolved, content, unchanged: actual === hashOf(content) });
      }

      // Удаляются только файлы данных, и только если они такие, какими их
      // видел редактор: удалить чужую свежую правку — та же потеря.
      for (const relative of deletions) {
        const resolved = typeof relative === 'string' ? resolveInside(dataDir, `/${relative}`) : null;
        if (resolved === null || !WRITABLE_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
          return sendJson(res, 400, { error: `Недопустимый путь удаления: ${relative}` });
        }
        if (Object.hasOwn(files, relative)) {
          return sendJson(res, 400, { error: `Файл и пишется, и удаляется: ${relative}` });
        }

        const existing = readIfFile(resolved);
        if (existing === null) continue;
        const expected = base[relative] ?? null;
        if (expected !== hashOf(existing)) conflicts.push({ path: relative, expected, actual: hashOf(existing) });
        plannedDeletions.push({ relative, resolved });
      }

      // Исходники сохранение не меняет и не удаляет: имя — отпечаток
      // содержимого, поэтому файл с тем же именем уже тот самый.
      for (const [name, file] of Object.entries(sources)) {
        const match = SOURCE_NAME.exec(name);
        if (!sourcesDir || !match) return sendJson(res, 400, { error: `Недопустимое имя исходника: ${name}` });
        const resolved = path.join(sourcesDir, name);
        if (findSource(name) !== null) continue;

        const content = readUpload(file?.upload);
        if (content === null) {
          return sendJson(res, 400, { error: `Загрузка исходника не найдена: ${name}`, missingUpload: file?.upload });
        }
        if (!sha256Of(content).startsWith(match[1])) {
          return sendJson(res, 400, { error: `Исходник не совпал с именем: ${name}` });
        }
        plannedSources.push({ name, resolved, content });
      }

      if (conflicts.length > 0) return sendJson(res, 409, { conflicts });

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

      const deleted = [];
      for (const file of plannedDeletions) {
        rmSync(file.resolved, { force: true });
        removeEmptyDirectories(path.dirname(file.resolved), dataDir);
        deleted.push(file.relative);
      }

      for (const file of plannedSources) {
        mkdirSync(sourcesDir, { recursive: true });
        writeFileSync(file.resolved, file.content);
      }

      for (const name of usedUploads) rmSync(path.join(uploadsDir, name), { force: true });

      sendJson(res, 200, { written, unchanged, deleted, hashes, sources: plannedSources.map((file) => file.name) });
    });
  }
}
