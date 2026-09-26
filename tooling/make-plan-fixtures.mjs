#!/usr/bin/env node
/**
 * Образцы планов «как их могут прислать» — для проверки импорта в редакторе.
 *
 *   node --experimental-websocket tooling/make-plan-fixtures.mjs
 *
 * Официальные планы вуза неизвестно в каком виде придут: PDF из чертёжной
 * программы (несколько этажей в одном файле, рамка, штамп, лист повёрнут,
 * среди листов — экспликация, а не этаж), сканы в TIFF и JPG, картинки с
 * полями, архивы, чертежи DXF. Образцы воспроизводят всё это на планах
 * тестового кампуса из `data/`, а результат лежит в репозитории: тестам не
 * нужен браузер, чтобы их получить.
 *
 * PDF и картинки рисует браузер (Chrome или Edge без окна), архив собирает
 * JSZip, DXF пишется текстом. Скана в TIFF здесь нет: без сжатия он весит
 * мегабайты, поэтому сценарий импорта собирает его сам, на лету.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from './browser/cdp.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'tooling/browser/fixtures/plans');
const require = createRequire(path.join(repoRoot, 'apps/editor/package.json'));
const JSZip = require('jszip');

const plan = (building, floor) =>
  readFileSync(path.join(repoRoot, `data/buildings/${building}/floors/${floor}/map.svg`), 'utf8').replace(/<\?xml[^>]*\?>/, '');
const campus = () => readFileSync(path.join(repoRoot, 'data/campus/map.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');

function findBrowser() {
  const candidates = [
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Нужен Chrome или Edge');
  return found;
}

async function launchBrowser() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'campus-fixtures-'));
  const child = spawn(
    findBrowser(),
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', 'about:blank'],
    { stdio: 'ignore' }
  );
  const stop = () => {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      /* профиль ещё занят — не страшно */
    }
  };
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200; i += 1) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split('\n')[0], 10);
      if (port > 0) return { debugUrl: `http://127.0.0.1:${port}`, stop };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  stop();
  throw new Error('Браузер не запустился');
}

/** Лист чертежа: рамка, заголовок, план, штамп в углу. */
function sheet(title, svg, { rotate = false, stamp = 'Масштаб 1:200' } = {}) {
  return `<section class="sheet">
    <div class="frame">
      <h1>${title}</h1>
      <div class="plan${rotate ? ' plan--rotated' : ''}">${svg}</div>
      <table class="stamp"><tr><td>Кафедра АХЧ</td><td>${stamp}</td></tr><tr><td>Лист</td><td>Формат А4</td></tr></table>
    </div>
  </section>`;
}

const SHEET_CSS = `
  @page { size: 297mm 210mm; margin: 0; }
  body { margin: 0; font-family: Arial, sans-serif; }
  .sheet { width: 297mm; height: 210mm; page-break-after: always; box-sizing: border-box; padding: 10mm; }
  .frame { position: relative; width: 100%; height: 100%; border: 0.6mm solid #000; box-sizing: border-box; padding: 8mm; }
  h1 { font-size: 16pt; margin: 0 0 6mm; }
  .plan svg { width: 240mm; height: auto; }
  .plan--rotated { transform: rotate(90deg) translate(20mm, -150mm); transform-origin: 0 0; }
  .plan--rotated svg { width: 150mm; }
  .stamp { position: absolute; right: 4mm; bottom: 4mm; border-collapse: collapse; font-size: 8pt; }
  .stamp td { border: 0.3mm solid #000; padding: 1mm 3mm; }
  table.list { border-collapse: collapse; font-size: 10pt; }
  table.list td { border: 0.3mm solid #000; padding: 1mm 3mm; }
`;

async function pdf(page, html) {
  await page.send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
  await page.sleep(800);
  const { data } = await page.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  return Buffer.from(data, 'base64');
}

/** Картинка страницы в формате `image/png` или `image/jpeg`. */
async function raster(page, html, width, height, { type = 'image/png', quality = 0.92 } = {}) {
  await page.send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
  await page.sleep(600);
  return page.eval(`(async () => {
    const svg = document.querySelector('svg');
    const text = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = ${width};
    canvas.height = ${height};
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, ${width}, ${height});
    context.drawImage(image, 0, 0, ${width}, ${height});
    const url = canvas.toDataURL(${JSON.stringify(type)}, ${quality});
    return { base64: url.split(',')[1] };
  })()`);
}

/** Лист с полями и надписью — как скан или выгрузка из программы. */
function paperSvg(title, planSvg, width, height, margin) {
  const inner = planSvg.replace(/<svg\b/, `<svg x="${margin}" y="${margin + 60}" width="${width - 2 * margin}" height="${height - 2 * margin - 60}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#ffffff"/>
    <text x="${margin}" y="${margin + 30}" font-family="Arial" font-size="28" fill="#000">${title}</text>
    ${inner}
  </svg>`;
}

/** Чертёж DXF: контур этажа, коридор, комнаты и подписи — отрезками, полилиниями и текстом. */
function dxf() {
  const lines = ['0', 'SECTION', '2', 'ENTITIES'];
  const line = (x1, y1, x2, y2, layer = 'WALLS') =>
    lines.push('0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '30', '0', '11', String(x2), '21', String(y2), '31', '0');
  const poly = (points, layer = 'WALLS') => {
    lines.push('0', 'LWPOLYLINE', '8', layer, '90', String(points.length), '70', '1');
    for (const [x, y] of points) lines.push('10', String(x), '20', String(y));
  };
  const text = (x, y, value, height = 1.2) =>
    lines.push('0', 'TEXT', '8', 'TEXT', '10', String(x), '20', String(y), '30', '0', '40', String(height), '1', value);

  // Корпус В, 1 этаж: 60 × 20 метров, коридор посередине.
  poly([[0, 0], [60, 0], [60, 20], [0, 20]]);
  line(0, 8, 60, 8);
  line(0, 12, 60, 12);
  for (const x of [12, 24, 36, 48]) {
    line(x, 12, x, 20);
    line(x, 0, x, 8);
  }
  text(4, 16, 'В-101');
  text(16, 16, 'В-102');
  text(28, 16, 'В-103');
  text(2, 22, 'Корпус В. План 1 этажа', 2);
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser();
try {
  const page = await openPage(browser.debugUrl);
  await page.viewport(1600, 1200, 1);

  // 1. PDF корпуса А: три этажа, третий лист повёрнут, четвёртый — экспликация.
  const book = `<html><head><meta charset="utf-8"><style>${SHEET_CSS}</style></head><body>
    ${sheet('Корпус А. План 1 этажа', plan('building_a', 1))}
    ${sheet('Корпус А. План 2-го этажа', plan('building_a', 2))}
    ${sheet('Корпус А. Этаж 3', plan('building_a', 3), { rotate: true })}
    <section class="sheet"><div class="frame"><h1>Экспликация помещений</h1>
      <table class="list"><tr><td>А-101</td><td>Аудитория</td></tr><tr><td>А-102</td><td>Лаборатория</td></tr></table>
    </div></section>
  </body></html>`;
  writeFileSync(path.join(outDir, 'korpus-A-plany.pdf'), await pdf(page, book));

  // 2. PNG: этаж корпуса Б с белыми полями и надписью.
  const b2 = await raster(page, `<html><body style="margin:0">${paperSvg('План 2 этажа корпуса Б', plan('building_b', 2), 1400, 900, 90)}</body></html>`, 1400, 900);
  writeFileSync(path.join(outDir, 'korpus-B-etazh-2.png'), Buffer.from(b2.base64, 'base64'));

  // 3. JPG: «подвал» — номер этажа только словом.
  const basement = await raster(
    page,
    `<html><body style="margin:0">${paperSvg('Корпус А. Подвал', plan('building_a', 1), 1200, 800, 60)}</body></html>`,
    1200,
    800,
    { type: 'image/jpeg', quality: 0.85 }
  );
  writeFileSync(path.join(outDir, 'korpus-A-podval.jpg'), Buffer.from(basement.base64, 'base64'));

  // 4. Генплан территории — JPG.
  const general = await raster(page, `<html><body style="margin:0">${campus()}</body></html>`, 1280, 760, {
    type: 'image/jpeg',
    quality: 0.85,
  });
  writeFileSync(path.join(outDir, 'genplan.jpg'), Buffer.from(general.base64, 'base64'));

  // 5. Архив: несколько файлов разом, в папке.
  const zip = new JSZip();
  zip.file('Планы/korpus-B-etazh-2.png', readFileSync(path.join(outDir, 'korpus-B-etazh-2.png')));
  zip.file('Планы/korpus-A-podval.jpg', readFileSync(path.join(outDir, 'korpus-A-podval.jpg')));
  zip.file('Планы/readme.txt', 'Планы корпусов, присланы архивом');
  writeFileSync(path.join(outDir, 'plany.zip'), await zip.generateAsync({ type: 'nodebuffer' }));

  // 6. DXF — чертёж корпуса В.
  writeFileSync(path.join(outDir, 'korpus-V-etazh-1.dxf'), dxf());

  console.log(`Образцы записаны в ${path.relative(repoRoot, outDir)}`);
} finally {
  browser.stop();
}
