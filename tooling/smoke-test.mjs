#!/usr/bin/env node
/**
 * Смоук-тест раздачи приложения.
 *
 * Поднимает dev- или preview-сервер, прогоняет матрицу HTTP-проверок и
 * завершается с кодом 1 при любом провале. Нужен потому, что ключевые дефекты
 * этого проекта были не в логике, а в раздаче: отсутствующие файлы данных
 * молча отдавались как `index.html` с кодом 200, и загрузчик датасета падал
 * на разборе HTML вместо JSON.
 *
 * Запросы отправляются через `node:http` с явным `path`, а не через `fetch`:
 * WHATWG URL нормализует `..` до отправки, и проверки обхода каталога
 * стали бы бесполезными.
 *
 * Использование:
 *   node tooling/smoke-test.mjs --app viewer --mode prod
 *   node tooling/smoke-test.mjs --app viewer --mode dev
 *   node tooling/smoke-test.mjs --app editor --mode dev
 *
 * Развёртывание в подкаталоге проверяется тем же набором:
 *   CAMPUS_BASE_PATH=/campus/ pnpm --filter @campus-map/viewer build
 *   node tooling/smoke-test.mjs --app viewer --mode prod --base /campus/
 *
 * Базовый путь не выводится из окружения сам: сборка и проверка — разные
 * запуски, и молчаливое расхождение между ними дало бы зелёный прогон на
 * неверно собранном приложении.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Матрица проверок.
 *
 * `only` ограничивает проверку режимами, в которых она имеет смысл:
 * PWA-оболочка существует только в прод-сборке навигатора.
 */
const CHECKS = [
  // --- точка входа ---
  { url: '/', code: 200, contentType: 'text/html', title: 'точка входа' },

  // --- PWA-оболочка (только прод-сборка навигатора) ---
  { url: '/manifest.webmanifest', code: 200, contentType: 'application/manifest+json', only: 'viewer-prod', title: 'PWA-манифест' },
  { url: '/sw.js', code: 200, contentType: 'javascript', only: 'viewer-prod', title: 'service worker' },
  { url: '/favicon.svg', code: 200, contentType: 'image/svg+xml', only: 'viewer-prod', title: 'favicon' },
  { url: '/robots.txt', code: 200, contentType: 'text/plain', only: 'viewer-prod', title: 'robots.txt' },
  { url: '/pwa-192x192.png', code: 200, contentType: 'image/png', only: 'viewer-prod', title: 'иконка 192×192' },
  { url: '/pwa-512x512.png', code: 200, contentType: 'image/png', only: 'viewer-prod', title: 'иконка 512×512' },
  { url: '/pwa-maskable-512x512.png', code: 200, contentType: 'image/png', only: 'viewer-prod', title: 'maskable-иконка' },
  { url: '/apple-touch-icon.png', code: 200, contentType: 'image/png', only: 'viewer-prod', title: 'apple-touch-icon' },

  // --- данные датасета: контент должен быть данными, а не оболочкой ---
  { url: '/data/campus/meta.json', code: 200, contentType: 'json', title: 'мета кампуса' },
  { url: '/data/campus/graph.json', code: 200, contentType: 'json', title: 'граф кампуса' },
  { url: '/data/campus/map.png', code: 200, contentType: 'image/png', title: 'карта кампуса' },
  { url: '/data/transitions.json', code: 200, contentType: 'json', title: 'переходы между этажами' },
  { url: '/data/aliases.json', code: 200, contentType: 'json', title: 'алиасы аудиторий' },
  { url: '/data/buildings/building_a/meta.json', code: 200, contentType: 'json', title: 'мета корпуса А' },
  { url: '/data/buildings/building_a/floors/1/graph.json', code: 200, contentType: 'json', title: 'граф этажа А-1' },
  { url: '/data/buildings/building_a/floors/1/map.png', code: 200, contentType: 'image/png', title: 'карта этажа А-1' },
  { url: '/data/buildings/building_b/floors/2/graph.json', code: 200, contentType: 'json', title: 'граф этажа Б-2' },

  // --- отсутствующие файлы: честный 404, НЕ index.html ---
  { url: '/data/campus/nope.json', code: 404, title: 'нет такого файла в кампусе' },
  { url: '/data/buildings/building_z/meta.json', code: 404, title: 'нет такого корпуса' },
  { url: '/data/buildings/building_a/floors/99/graph.json', code: 404, title: 'нет такого этажа' },
  { url: '/data/nope.png', code: 404, title: 'нет такой карты' },
  { url: '/data/campus', code: 404, title: 'каталог вместо файла' },

  // --- обход каталога: отказ, содержимое репозитория наружу не уходит ---
  { url: '/data/../../package.json', code: 403, title: 'dot-dot из корня' },
  { url: '/data/campus/../../package.json', code: 403, title: 'dot-dot из подкаталога' },
  { url: '/data/%2e%2e/%2e%2e/package.json', code: 403, title: 'закодированный dot-dot' },
  { url: '/data/%2e%2e%2fpackage.json', code: 403, title: 'закодированный слэш' },
  { url: '/data//etc/passwd', code: 404, title: 'двойной слэш' },

  // --- некорректные запросы: 400, а не падение сервера и не оболочка ---
  { url: '/data/campus/meta.json%00.png', code: 400, title: 'NUL-байт в пути' },
  { url: '/data/campus/%E0%A4%A.json', code: 400, title: 'обрывок percent-последовательности' },
  { url: '/data/campus/100%.json', code: 400, title: 'одиночный процент' },

  // --- клиентская маршрутизация продолжает работать ---
  { url: '/some/deep/route', code: 200, contentType: 'text/html', title: 'SPA-переход' },
];

function parseArgs(argv) {
  const options = { app: 'viewer', mode: 'prod', base: '/' };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--app') options.app = argv[++i];
    else if (argv[i] === '--mode') options.mode = argv[++i];
    else if (argv[i] === '--base') options.base = argv[++i];
  }

  if (!['viewer', 'editor'].includes(options.app)) {
    throw new Error(`Неизвестное приложение: ${options.app}`);
  }
  if (!['dev', 'prod'].includes(options.mode)) {
    throw new Error(`Неизвестный режим: ${options.mode}`);
  }

  if (!options.base.startsWith('/')) options.base = `/${options.base}`;
  if (!options.base.endsWith('/')) options.base = `${options.base}/`;

  return options;
}

/**
 * Переносит путь проверки под базовый путь развёртывания.
 *
 * Проверки обхода каталога (`/data/../../package.json`) переносятся так же,
 * как обычные: плагин смонтирован по базовому пути, и защита должна работать
 * именно там.
 */
function withBase(base, url) {
  return url === '/' ? base : `${base}${url.slice(1)}`;
}

/** Ищет свободный TCP-порт. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Отправляет запрос с дословным путём, без нормализации `..`.
 *
 * @returns {{status: number, contentType: string}}
 */
function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method: 'GET' },
      (res) => {
        res.resume();
        res.once('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            contentType: String(res.headers['content-type'] ?? ''),
          });
        });
      }
    );

    req.once('error', reject);
    req.end();
  });
}

/** Ждёт, пока сервер начнёт отвечать. */
async function waitForServer(port, base = '/', timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await request(port, base);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  throw new Error(`Сервер не поднялся на порту ${port} за ${timeoutMs / 1000} с`);
}

async function main() {
  const { app, mode, base } = parseArgs(process.argv.slice(2));
  const appDir = path.join(repoRoot, 'apps', app);
  const port = await findFreePort();

  // Запускаем vite напрямую из node_modules, а не через `npx`: тот порождает
  // цепочку npm → sh → node, и SIGKILL обёртке оставляет сервер-внук жить с
  // открытыми пайпами — процесс теста из-за этого никогда не завершается.
  const viteBin = path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const args = [
    viteBin,
    ...(mode === 'dev' ? [] : ['preview']),
    '--host', '127.0.0.1',
    '--port', String(port),
    '--strictPort',
  ];

  process.stdout.write(
    `\n${app} / ${mode}${base === '/' ? '' : ` / base ${base}`}: поднимаю vite на порту ${port}\n`
  );

  // `detached` даёт собственную группу процессов — её можно снять целиком.
  const child = spawn(process.execPath, args, {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, BROWSER: 'none' },
  });

  let serverOutput = '';
  const capture = (chunk) => {
    serverOutput += chunk.toString();
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  const shutdown = () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    try {
      // Отрицательный pid — сигнал всей группе процессов.
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  };
  process.on('exit', shutdown);

  try {
    await waitForServer(port, base);
  } catch (cause) {
    shutdown();
    process.stdout.write(`\n--- вывод сервера ---\n${serverOutput}\n`);
    throw cause;
  }

  const scope = `${app}-${mode}`;
  const applicable = CHECKS.filter((check) => !check.only || check.only === scope);

  let failures = 0;

  for (const check of applicable) {
    const url = withBase(base, check.url);

    let response;
    try {
      response = await request(port, url);
    } catch (cause) {
      process.stdout.write(`  ПРОВАЛ  ${check.title.padEnd(38)} ${url} — ${cause.message}\n`);
      failures += 1;
      continue;
    }

    const codeOk = response.status === check.code;
    const typeOk = !check.contentType || response.contentType.includes(check.contentType);

    if (codeOk && typeOk) {
      process.stdout.write(`  OK      ${check.title.padEnd(38)} ${url}\n`);
    } else {
      const expected = `${check.code}${check.contentType ? ` ${check.contentType}` : ''}`;
      const actual = `${response.status}${response.contentType ? ` ${response.contentType}` : ''}`;
      process.stdout.write(`  ПРОВАЛ  ${check.title.padEnd(38)} ${url}\n`);
      process.stdout.write(`            ожидали ${expected}, получили ${actual}\n`);
      failures += 1;
    }
  }

  shutdown();

  process.stdout.write(
    `\n${app} / ${mode}: проверок ${applicable.length}, провалов ${failures}\n`
  );

  if (failures > 0) {
    process.stdout.write(`\n--- вывод сервера ---\n${serverOutput}\n`);
  }

  // Явный выход: не полагаемся на опустошение event loop, иначе незакрытый
  // сокет сервера удерживал бы процесс.
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((cause) => {
  process.stderr.write(`\nСмоук-тест не выполнен: ${cause?.stack ?? cause}\n`);
  process.exitCode = 1;
});
