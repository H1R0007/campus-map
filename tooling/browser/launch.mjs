/**
 * Запуск установленного Chrome, Edge или Chromium без окна.
 *
 * Вынесено из `browser-check.mjs`, когда тот же браузер понадобился второму
 * инструменту — печати документации в PDF. Обе задачи запускают браузер
 * одинаково: временный профиль, нулевой порт отладки, `DevToolsActivePort`.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Сколько ждать, пока браузер откроет порт отладки. */
export const BROWSER_START_TIMEOUT_MS = 30_000;

export function which(command) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, command);
    if (dir && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Установленный Chrome, Edge или Chromium; `null`, если ни одного нет. */
export function findBrowser() {
  const override = process.env.CAMPUS_BROWSER;
  if (override) return existsSync(override) ? override : which(override);

  const candidates = {
    win32: [
      process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'],
  }[process.platform] ?? [];

  for (const candidate of candidates.filter(Boolean)) {
    const found = path.isAbsolute(candidate) ? (existsSync(candidate) ? candidate : null) : which(candidate);
    if (found) return found;
  }
  return null;
}

/**
 * Запускает браузер без окна с временным профилем.
 *
 * Порт отладки — нулевой: браузер выбирает свободный сам и пишет его в
 * `DevToolsActivePort` профиля. Профиль каждый раз новый, поэтому сервис
 * воркер, хранилище и разрешения прошлого прогона не влияют на этот.
 */
export async function launchBrowser(executable) {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'campus-map-browser-'));
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // Язык браузера — русский, как у сценариев: у раннера GitHub он английский,
    // и навигатор (язык по navigator.languages) открывался бы по-английски.
    '--lang=ru-RU',
    '--accept-lang=ru-RU,ru',
  ];
  // Под root (контейнер CI) песочница Chrome не запускается.
  if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox');
  args.push('about:blank');

  const child = spawn(executable, args, { stdio: 'ignore' });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    // Chrome и Edge порождают процессы-помощники; на Windows их снимает только
    // завершение всего дерева.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (cause) {
      // Файлы профиля ещё заняты завершающимся браузером. Это временный
      // каталог системы, проверку это не портит — только сообщаем.
      console.warn(`Не удалось удалить временный профиль ${profile}: ${cause.message}`);
    }
  };
  process.on('exit', stop);

  const portFile = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + BROWSER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split('\n')[0], 10);
      if (Number.isInteger(port) && port > 0) return { debugUrl: `http://127.0.0.1:${port}`, stop };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  stop();
  throw new Error(`Браузер не открыл порт отладки за ${BROWSER_START_TIMEOUT_MS / 1000} с: ${executable}`);
}

