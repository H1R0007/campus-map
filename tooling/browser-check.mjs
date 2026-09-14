#!/usr/bin/env node
/**
 * Сценарии в настоящем браузере: навигатор и редактор глазами человека.
 *
 * Модульные тесты навигатора работают без DOM, смоук-тест проверяет только
 * раздачу. Ни те ни другие не видели дефектов, которые проявлялись только при
 * нажатиях в браузере: падения навигатора на адресе с `//`, потери фокуса,
 * приближения плана до предела. Этот скрипт поднимает приложение, запускает
 * установленный Chrome или Edge без окна и проходит сценарии через протокол
 * отладки, проверяя после каждого шага консоль и экран ошибки (запись 18).
 *
 * Использование:
 *   pnpm build && pnpm check:browser                 # прод-сборка, все сценарии
 *   node tooling/browser-check.mjs --mode dev        # без сборки, dev-сервер
 *   node tooling/browser-check.mjs --app viewer --only навигация
 *   node tooling/browser-check.mjs --shots .local/shots
 *
 * Браузер ищется в обычных местах установки; другой — через CAMPUS_BROWSER.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage } from './browser/cdp.mjs';
import editorPanels from './browser/scenarios/editor-panels.mjs';
import editorTransitions from './browser/scenarios/editor-transitions.mjs';
import viewerLayout from './browser/scenarios/viewer-layout.mjs';
import viewerNavigation from './browser/scenarios/viewer-navigation.mjs';
import viewerRecent from './browser/scenarios/viewer-recent.mjs';
import { repoRoot, startVite } from './lib/vite-server.mjs';

const SCENARIOS = [viewerLayout, viewerNavigation, viewerRecent, editorTransitions, editorPanels];

/** Сколько ждать, пока браузер откроет порт отладки. */
const BROWSER_START_TIMEOUT_MS = 20_000;

function parseArgs(argv) {
  const options = { app: 'all', mode: 'prod', only: null, shots: null };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--app') options.app = argv[++i];
    else if (argv[i] === '--mode') options.mode = argv[++i];
    else if (argv[i] === '--only') options.only = argv[++i];
    else if (argv[i] === '--shots') options.shots = path.resolve(argv[++i]);
    else throw new Error(`Неизвестный аргумент: ${argv[i]}`);
  }

  if (!['all', 'viewer', 'editor'].includes(options.app)) throw new Error(`Неизвестное приложение: ${options.app}`);
  if (!['dev', 'prod'].includes(options.mode)) throw new Error(`Неизвестный режим: ${options.mode}`);

  return options;
}

/** Исполняемый файл в PATH; `null`, если его нет. */
function which(command) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, command);
    if (dir && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Установленный Chrome, Edge или Chromium; `null`, если ни одного нет. */
function findBrowser() {
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
async function launchBrowser(executable) {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'campus-map-browser-'));
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
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

/**
 * Проходит один сценарий в новой вкладке.
 *
 * @returns {Promise<string | null>} текст провала или `null`
 */
async function runScenario(scenario, { debugUrl, base, shots }) {
  const page = await openPage(debugUrl);
  const ignored = scenario.ignoreProblems ?? [];

  const step = async (name, action) => {
    process.stdout.write(`    · ${name}\n`);
    await action();

    const text = await page.eval('document.body.innerText');
    if (/Что-то пошло не так|Something went wrong/.test(text)) throw new Error(`${name}: экран ошибки отрисовки`);

    const problems = page.problems.filter((problem) => !ignored.some((pattern) => pattern.test(problem)));
    if (problems.length > 0) throw new Error(`${name}: ошибки страницы:\n${problems.join('\n')}`);
  };

  const shot = async (name) => {
    if (!shots) return;
    await page.sleep(500);
    await page.screenshot(path.join(shots, `${name}.png`));
  };

  try {
    await scenario.run({ page, base, step, shot });
    return null;
  } catch (error) {
    return error.stack ?? String(error);
  } finally {
    await page.close();
  }
}

async function main() {
  // На Node 20 WebSocket есть только за флагом. Перезапускаемся с ним, а не
  // требуем Node 22 ради одной проверки.
  if (typeof globalThis.WebSocket === 'undefined') {
    const result = spawnSync(process.execPath, ['--experimental-websocket', ...process.argv.slice(1)], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
  }

  const { app, mode, only, shots } = parseArgs(process.argv.slice(2));

  const executable = findBrowser();
  if (!executable) {
    process.stderr.write('Не найден Chrome, Edge или Chromium. Укажите путь к браузеру в CAMPUS_BROWSER.\n');
    process.exit(2);
  }
  if (shots) mkdirSync(shots, { recursive: true });

  const apps = app === 'all' ? ['viewer', 'editor'] : [app];
  let total = 0;
  const failures = [];

  for (const appName of apps) {
    const scenarios = SCENARIOS.filter((s) => s.app === appName && (!only || s.name.includes(only)));
    if (scenarios.length === 0) continue;

    if (mode === 'prod' && !existsSync(path.join(repoRoot, 'apps', appName, 'dist', 'index.html'))) {
      throw new Error(`Нет прод-сборки ${appName}: сначала pnpm build или запуск с --mode dev`);
    }

    process.stdout.write(`\n${appName} / ${mode}: поднимаю vite и браузер\n`);
    const server = await startVite({ app: appName, mode });
    const browser = await launchBrowser(executable);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      for (const scenario of scenarios) {
        total += 1;
        process.stdout.write(`  ${scenario.name}\n`);
        const failure = await runScenario(scenario, { debugUrl: browser.debugUrl, base, shots });
        if (failure) {
          failures.push(`${scenario.name}\n${failure}`);
          process.stdout.write(`  ПРОВАЛ\n${failure}\n`);
        } else {
          process.stdout.write('  OK\n');
        }
      }
    } finally {
      browser.stop();
      server.stop();
    }
  }

  process.stdout.write(`\nсценариев ${total}, провалов ${failures.length}\n`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((cause) => {
  process.stderr.write(`\nСценарии в браузере не выполнены: ${cause?.stack ?? cause}\n`);
  process.exit(1);
});
