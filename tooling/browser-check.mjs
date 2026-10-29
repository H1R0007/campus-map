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

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage } from './browser/cdp.mjs';
import { findBrowser, launchBrowser } from './browser/launch.mjs';
import editorKeyboard from './browser/scenarios/editor-keyboard.mjs';
import editorMouse from './browser/scenarios/editor-mouse.mjs';
import editorPanels from './browser/scenarios/editor-panels.mjs';
import editorProperties from './browser/scenarios/editor-properties.mjs';
import editorRoute from './browser/scenarios/editor-route.mjs';
import editorSave from './browser/scenarios/editor-save.mjs';
import editorSandbox from './browser/scenarios/editor-sandbox.mjs';
import editorModes from './browser/scenarios/editor-modes.mjs';
import editorOverlay from './browser/scenarios/editor-overlay.mjs';
import editorWindows from './browser/scenarios/editor-windows.mjs';
import editorReadiness from './browser/scenarios/editor-readiness.mjs';
import editorStructure from './browser/scenarios/editor-structure.mjs';
import editorImport from './browser/scenarios/editor-import.mjs';
import editorOutline from './browser/scenarios/editor-outline.mjs';
import editorWorkshop from './browser/scenarios/editor-workshop.mjs';
import editorSheetTools from './browser/scenarios/editor-sheet-tools.mjs';
import editorSheetHelp from './browser/scenarios/editor-sheet-help.mjs';
import editorAlign from './browser/scenarios/editor-align.mjs';
import editorPlace from './browser/scenarios/editor-place.mjs';
import editorLayout from './browser/scenarios/editor-layout.mjs';
import editorHelpSearch from './browser/scenarios/editor-help-search.mjs';
import editorA11y from './browser/scenarios/editor-a11y.mjs';
import editorKinds from './browser/scenarios/editor-kinds.mjs';
import editorPhotos from './browser/scenarios/editor-photos.mjs';
import editorPhotoBlur from './browser/scenarios/editor-photo-blur.mjs';
import editorTransitions from './browser/scenarios/editor-transitions.mjs';
import editorWalkScratch from './browser/scenarios/editor-walk-scratch.mjs';
import editorWalkFix from './browser/scenarios/editor-walk-fix.mjs';
import viewerCanvas from './browser/scenarios/viewer-canvas.mjs';
import viewerLayout from './browser/scenarios/viewer-layout.mjs';
import viewerNavigation from './browser/scenarios/viewer-navigation.mjs';
import viewerOffline from './browser/scenarios/viewer-offline.mjs';
import viewerOnboarding from './browser/scenarios/viewer-onboarding.mjs';
import viewerPhotos from './browser/scenarios/viewer-photos.mjs';
import viewerQuick from './browser/scenarios/viewer-quick.mjs';
import viewerRecent from './browser/scenarios/viewer-recent.mjs';
import viewerTheme from './browser/scenarios/viewer-theme.mjs';
import viewerUpdate from './browser/scenarios/viewer-update.mjs';
import { repoRoot, startVite } from './lib/vite-server.mjs';

const SCENARIOS = [
  viewerLayout,
  viewerNavigation,
  viewerPhotos,
  viewerCanvas,
  viewerRecent,
  viewerQuick,
  viewerTheme,
  viewerOnboarding,
  viewerUpdate,
  // Последним у навигатора: останавливает сервер приложения.
  viewerOffline,
  editorTransitions,
  editorMouse,
  editorKeyboard,
  editorProperties,
  editorRoute,
  editorSave,
  editorSandbox,
  editorModes,
  editorOverlay,
  editorWindows,
  editorReadiness,
  editorStructure,
  editorImport,
  editorOutline,
  editorWorkshop,
  editorSheetTools,
  editorSheetHelp,
  editorAlign,
  editorPlace,
  editorLayout,
  editorHelpSearch,
  editorA11y,
  editorKinds,
  editorPhotos,
  editorPhotoBlur,
  editorPanels,
  // Разборы путей целиком (этап 5 фазы 12): длинные, поэтому последними.
  editorWalkScratch,
  editorWalkFix,
];

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
/**
 * Кампус «с нуля»: территория без плана, ни одного корпуса и точки. Каталог
 * видов точек — тот же, что в `data/`: его заводят один раз на проект.
 */
function writeEmptyCampus(dataDir) {
  const write = (relative, value) => {
    mkdirSync(path.dirname(path.join(dataDir, relative)), { recursive: true });
    writeFileSync(path.join(dataDir, relative), `${JSON.stringify(value, null, 2)}\n`);
  };
  write('campus/meta.json', { buildings: [] });
  write('campus/graph.json', { nodes: [] });
  write('transitions.json', { transitions: [] });
  write('aliases.json', { aliases: [] });
  cpSync(path.join(repoRoot, 'data', 'place-kinds.json'), path.join(dataDir, 'place-kinds.json'));
}

/**
 * Поднимает dev-сервер приложения на копии каталога данных.
 *
 * Копия нужна, чтобы проверка сохранения не переписывала канонический
 * `data/`: сценарий правит разметку и сохраняет её по-настоящему.
 * `'empty'` — вместо копии кампус с нуля (`writeEmptyCampus`).
 */
async function startIsolatedData(app, kind) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'campus-map-data-'));
  const dataDir = path.join(root, 'data');
  const sourcesDir = path.join(root, 'data-sources');
  const uploadsDir = path.join(root, 'uploads');
  const sandboxDir = path.join(root, 'sandbox');
  // Своя общая папка фото (запись 87): настройка машины не должна менять
  // проверку, а фото сохраняются туда, а не в копию `data/`.
  const photosDir = path.join(root, 'shared-photos');
  if (kind === 'empty') writeEmptyCampus(dataDir);
  else cpSync(path.join(repoRoot, 'data'), dataDir, { recursive: true });

  const server = await startVite({
    app,
    mode: 'dev',
    env: {
      CAMPUS_DATA_DIR: dataDir,
      CAMPUS_SOURCES_DIR: sourcesDir,
      CAMPUS_UPLOADS_DIR: uploadsDir,
      CAMPUS_SANDBOX_DIR: sandboxDir,
      CAMPUS_PHOTOS_DIR: photosDir,
    },
  });

  return {
    port: server.port,
    dataDir,
    sourcesDir,
    sandboxDir,
    photosDir,
    stop() {
      server.stop();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch (cause) {
        console.warn(`Не удалось удалить копию данных ${root}: ${cause.message}`);
      }
    },
  };
}

/**
 * Проходит один сценарий в новой вкладке.
 *
 * Сценарию доступны режим сборки (`mode`) и остановка сервера приложения
 * (`stopServer`): так сценарий без связи отключает сеть по-настоящему. Сервер
 * после этого не поднимается, поэтому такой сценарий — последний у приложения.
 *
 * Сценарию с `isolatedData` достаётся свой сервер на копии `data/` и путь к
 * ней (`dataDir`): он проверяет сохранение, читая файлы с диска, и не трогает
 * канонический датасет. Исходники планов и учебная копия у такого сервера
 * тоже свои (`sourcesDir`, `sandboxDir`), как и общая папка фото (`photosDir`).
 *
 * @returns {Promise<string | null>} текст провала или `null`
 */
async function runScenario(scenario, { debugUrl, base, shots, mode, stopServer, dataDir, sourcesDir, sandboxDir, photosDir }) {
  const page = await openPage(debugUrl);
  const ignored = scenario.ignoreProblems ?? [];
  // Настройки браузера (режим, тема, ширина колонок) и черновик несохранённой
  // работы у каждого сценария свои: иначе сценарий зависел бы от того, что
  // оставил предыдущий, — например, открывался бы окном «Осталась несохранённая работа».
  await page.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'local_storage,indexeddb' });

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
    await scenario.run({ page, base, step, shot, mode, stopServer, dataDir, sourcesDir, sandboxDir, photosDir });
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

        // Сценарий, который сохраняет данные, работает на копии `data/` и со
        // своим dev-сервером: запись в каталог данных есть только у него.
        const isolated = scenario.isolatedData ? await startIsolatedData(appName, scenario.isolatedData) : null;

        const failure = await runScenario(scenario, {
          debugUrl: browser.debugUrl,
          base: isolated ? `http://127.0.0.1:${isolated.port}` : base,
          shots,
          mode: isolated ? 'dev' : mode,
          stopServer: server.stop,
          dataDir: isolated?.dataDir,
          sourcesDir: isolated?.sourcesDir,
          sandboxDir: isolated?.sandboxDir,
          photosDir: isolated?.photosDir,
        });

        isolated?.stop();
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
