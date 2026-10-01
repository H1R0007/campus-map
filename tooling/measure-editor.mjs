#!/usr/bin/env node
/**
 * Замер редактора на большом кампусе (этап гигиены после фазы 12).
 *
 * Поднимает прод-сборку редактора на каталоге данных из `--data` (обычно
 * синтетический кампус: `generate-synthetic-campus.mjs`), открывает её в
 * браузере без окна и меряет то, что разметчик делает постоянно: открытие,
 * смену этажа, перетаскивание точки, «Готовность карты», поиск. Долгие задачи
 * главного потока (дольше 50 мс) — то, что человек видит как подвисание.
 *
 *   node tooling/generate-synthetic-campus.mjs --out .local/campus-big --buildings 10 --rooms 60 --metric
 *   pnpm --filter @campus-map/editor build
 *   node tooling/measure-editor.mjs --data .local/campus-big [--cpu 4]
 *
 * Браузер — как у сценариев: `CAMPUS_BROWSER` или установленный Chrome.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage } from './browser/cdp.mjs';
import { editorHelpers } from './browser/editor.mjs';
import { createRequire } from 'node:module';
import { repoRoot, startVite } from './lib/vite-server.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const dataDir = path.resolve(option('--data', '.local/campus-big'));
const cpu = Number(option('--cpu', '1'));
const browserPath = process.env.CAMPUS_BROWSER ?? 'google-chrome';
if (!existsSync(dataDir)) throw new Error(`Нет каталога данных: ${dataDir}`);

async function launch() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'campus-measure-'));
  const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'];
  if (process.getuid?.() === 0) flags.push('--no-sandbox');
  const child = spawn(browserPath, flags, { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !existsSync(portFile); i += 1) await new Promise((r) => setTimeout(r, 100));
  const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
  return {
    debugUrl: `http://127.0.0.1:${port}`,
    stop() {
      // Chrome и Edge порождают процессы-помощники; на Windows их снимает только
      // завершение всего дерева, иначе профиль занят и не удаляется.
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch (cause) {
        // Временный каталог системы: на замер это не влияет — только сообщаем.
        console.warn(`Не удалось удалить временный профиль ${profile}: ${cause.message}`);
      }
    },
  };
}

const server = await startVite({ app: 'editor', mode: 'prod', env: { CAMPUS_DATA_DIR: dataDir } });
const browser = await launch();
const results = [];

try {
  const page = await openPage(browser.debugUrl);
  await page.viewport(1600, 950, 1);
  if (cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const e = editorHelpers(page, `http://127.0.0.1:${server.port}`);

  // Долгие задачи главного потока копятся на странице с самого начала.
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__long = []; new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__long.push(entry.duration); }).observe({ type: 'longtask', buffered: true });`,
  });

  /** Меряет шаг: время до условия и долгие задачи за это время. */
  const measure = async (name, act, until, timeout = 120_000) => {
    await page.eval('window.__long = []');
    const started = Date.now();
    await act();
    if (until) await page.waitFor(until, timeout);
    await page.sleep(300);
    const long = await page.eval('window.__long');
    const took = Date.now() - started - 300;
    results.push({ name, took, longest: Math.round(Math.max(0, ...long)), long: long.length, blocked: Math.round(long.reduce((a, b) => a + b, 0)) });
  };

  await measure(
    'открытие редактора',
    () => page.goto(`http://127.0.0.1:${server.port}/`),
    `document.querySelectorAll('path[data-node-id]').length > 0 && !document.querySelector('.editor-splash')`
  );

  const busy = await page.eval(`[...document.querySelectorAll('.editor-tree__label')].map((l) => l.textContent.trim()).find((t) => t.startsWith('Корпус'))`);
  // Корпус открытого плана уже раскрыт в дереве: нажатие свернуло бы его.
  const floorShown = await page.eval(`[...document.querySelectorAll('.editor-tree__label')].some((l) => l.textContent.trim() === 'Этаж 5')`);
  if (!floorShown) await e.press(busy);
  await page.sleep(500);
  await measure(
    'смена этажа (дерево)',
    () => e.press('Этаж 5'),
    `document.querySelectorAll('path[data-node-id]').length > 20`
  );
  const nodesOnFloor = await page.eval(`document.querySelectorAll('path[data-node-id]').length`);

  await e.mode('Разметка');
  const ids = await e.nodeIds();
  const node = await e.nodePoint(ids[Math.floor(ids.length / 2)], { allowCovered: true });
  const profile = args.includes('--profile');
  if (profile) {
    await page.send('Profiler.enable');
    await page.send('Profiler.start');
  }
  await measure('перетаскивание точки (40 кадров)', async () => {
    await page.eval(`window.__frames = []; (function tick(t) { window.__frames.push(t); if (window.__frames.length < 400) requestAnimationFrame(tick); })(performance.now())`);
    await e.drag(node.x, node.y, node.x + 160, node.y + 60, { steps: 40 });
  });
  if (profile) {
    // Собственное время функций за перетаскивание: где уходят кадры.
    const { profile: cpuProfile } = await page.send('Profiler.stop');
    const self = new Map();
    // Имена и места — по карте исходников сборки: в прод-сборке они сжаты.
    const { SourceMapConsumer } = createRequire(import.meta.url)(path.join(repoRoot, 'node_modules/.pnpm/source-map-js@1.2.1/node_modules/source-map-js'));
    const maps = new Map();
    const where = (frame) => {
      const file = frame.url.split('/').pop();
      if (!file.endsWith('.js')) return `${frame.functionName || '(служебное)'}`;
      if (!maps.has(file)) {
        const mapFile = path.join(repoRoot, 'apps/editor/dist/assets', `${file}.map`);
        maps.set(file, existsSync(mapFile) ? new SourceMapConsumer(JSON.parse(readFileSync(mapFile, 'utf8'))) : null);
      }
      const map = maps.get(file);
      const at = map?.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
      return at?.source ? `${at.name ?? frame.functionName} ${at.source.replace(/^.*node_modules\//, '').replace(/^\.\.\/\.\.\//, '')}:${at.line}` : `${frame.functionName} ${file}`;
    };
    const byId = new Map(cpuProfile.nodes.map((n) => [n.id, n]));
    const dt = cpuProfile.timeDeltas;
    cpuProfile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const key = where(n.callFrame);
      self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
    });
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    process.stdout.write('\nСобственное время при перетаскивании, мс:\n');
    for (const [key, ms] of top) process.stdout.write(`${ms.toFixed(0).padStart(7)}  ${key}\n`);
  }
  const frames = await page.eval(`(() => { const f = window.__frames; const d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); return d.sort((a, b) => a - b); })()`);
  const p95 = frames.length ? Math.round(frames[Math.floor(frames.length * 0.95)]) : null;

  await measure(
    '«Готовность карты» — полный список',
    () => e.mode('Проверка'),
    `document.querySelectorAll('.editor-ready__item').length === 15 && ![...document.querySelectorAll('.editor-ready__item')].some((i) => i.dataset.state === 'pending')`
  );
  const readyText = await page.eval(`document.querySelector('.editor-statusbar__ready')?.textContent.trim()`);

  await measure('поиск «А-305»', async () => {
    await e.key('f', { modifiers: 2 });
    await e.type('А-305');
  }, `document.querySelectorAll('[role="option"]').length > 0`);
  await e.key('Escape', { keyCode: 27 });

  await measure('отмена правки (Ctrl+Z)', () => e.key('z', { modifiers: 2 }));

  const nodes = JSON.parse(readFileSync(path.join(dataDir, 'campus/meta.json'), 'utf8'));
  process.stdout.write(`\nКампус: ${dataDir} · корпусов ${nodes.buildings.length} · процессор ×${cpu}\n`);
  process.stdout.write(`Точек на открытом этаже: ${nodesOnFloor}; ${readyText}\n\n`);
  process.stdout.write('шаг                                    время, мс  долгих задач  самая долгая, мс  всего заблокировано, мс\n');
  for (const r of results) {
    process.stdout.write(`${r.name.padEnd(38)} ${String(r.took).padStart(9)}  ${String(r.long).padStart(12)}  ${String(r.longest).padStart(16)}  ${String(r.blocked).padStart(23)}\n`);
  }
  process.stdout.write(`\nКадр при перетаскивании, 95-й процентиль: ${p95} мс (60 кадров/с — 16,7 мс)\n`);
  const problems = Array.isArray(page.problems) ? page.problems : [];
  if (problems.length) process.stdout.write(`\nОшибки страницы:\n${problems.join('\n')}\n`);
} finally {
  browser.stop();
  server.stop();
}
