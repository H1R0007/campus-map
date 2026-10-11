#!/usr/bin/env node
/**
 * Образец «снимка с телефона» — для сценария фото в редакторе (запись 87).
 *
 *   node --experimental-websocket tooling/make-photo-fixtures.mjs
 *
 * Телефон пишет снимок так, как держали камеру, и кладёт в метаданные, как
 * его повернуть, где он снят и каким телефоном. Образец повторяет это на
 * нарисованной картинке: снимок лежит боком, в метаданных (EXIF) — поворот
 * «на 90° по часовой», координаты GPS и модель. Сценарий проверяет, что
 * редактор поставил фото прямо, а координат и модели в фото нет.
 *
 * Картинку рисует браузер (Chrome или Edge без окна), метаданные пишутся
 * здесь. Результат лежит в репозитории: тестам не нужен браузер, чтобы его
 * получить. Настоящих снимков в репозитории нет.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from './browser/cdp.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'tooling/browser/fixtures/photos');

/** Снимок, как его видит человек: стоя, 600 × 800. */
export const UPRIGHT = { width: 600, height: 800 };

function findBrowser() {
  const candidates = [
    process.env.CAMPUS_BROWSER,
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Нужен Chrome или Edge');
  return found;
}

async function launchBrowser() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'campus-photo-fixtures-'));
  const child = spawn(findBrowser(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], {
    stdio: 'ignore',
  });
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

/**
 * Рисует снимок стоя и кладёт его боком — повёрнутым на 90° против часовой,
 * как его пишет телефон, который держали вертикально. Красная полоса — вверху
 * снимка стоя: по ней сценарий видит, что фото поставлено прямо.
 */
const DRAW = `(async () => {
  const upright = document.createElement('canvas');
  upright.width = ${UPRIGHT.width};
  upright.height = ${UPRIGHT.height};
  const c = upright.getContext('2d');
  c.fillStyle = '#d9d3c6'; c.fillRect(0, 0, 600, 800);
  c.fillStyle = '#c8102e'; c.fillRect(0, 0, 600, 90);
  c.fillStyle = '#ece8df'; c.beginPath(); c.moveTo(0, 90); c.lineTo(600, 90); c.lineTo(380, 330); c.lineTo(220, 330); c.fill();
  c.fillStyle = '#a8a092'; c.beginPath(); c.moveTo(0, 800); c.lineTo(600, 800); c.lineTo(380, 520); c.lineTo(220, 520); c.fill();
  c.fillStyle = '#8a7e6c'; c.fillRect(270, 380, 60, 140);
  c.fillStyle = '#ffffff'; c.fillRect(30, 120, 180, 70);
  c.fillStyle = '#b42318'; c.font = 'bold 48px sans-serif'; c.fillText('ТЕСТ', 48, 172);
  const stored = document.createElement('canvas');
  stored.width = ${UPRIGHT.height};
  stored.height = ${UPRIGHT.width};
  const s = stored.getContext('2d');
  s.translate(0, ${UPRIGHT.width});
  s.rotate(-Math.PI / 2);
  s.drawImage(upright, 0, 0);
  const blob = await new Promise((resolve) => stored.toBlob(resolve, 'image/jpeg', 0.85));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
})()`;

/**
 * Метаданные снимка (EXIF): поворот, модель телефона и координаты GPS.
 * Порядок байтов — «II» (от младшего), как у большинства телефонов.
 */
function exifSegment() {
  const model = Buffer.from('TEST PHONE\0', 'ascii');
  const entries0 = 3;
  const entriesGps = 4;
  const ifd0 = 8;
  const ifd0Size = 2 + entries0 * 12 + 4;
  const gps = ifd0 + ifd0Size;
  const gpsSize = 2 + entriesGps * 12 + 4;
  const modelAt = gps + gpsSize;
  const latAt = modelAt + model.length;
  const lonAt = latAt + 24;
  const tiff = Buffer.alloc(lonAt + 24);

  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifd0, 4);

  const entry = (at, tag, type, count, value) => {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4);
    if (typeof value === 'number') tiff.writeUInt32LE(value, at + 8);
    else value.copy(tiff, at + 8);
  };
  const short = (value) => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt16LE(value, 0);
    return buffer;
  };

  // IFD0: модель, поворот (6 — повернуть на 90° по часовой), ссылка на GPS.
  tiff.writeUInt16LE(entries0, ifd0);
  entry(ifd0 + 2, 0x0110, 2, model.length, modelAt);
  entry(ifd0 + 14, 0x0112, 3, 1, short(6));
  entry(ifd0 + 26, 0x8825, 4, 1, gps);
  tiff.writeUInt32LE(0, ifd0 + 2 + entries0 * 12);

  // GPS: 55°45′21″ с. ш., 37°37′4″ в. д.
  tiff.writeUInt16LE(entriesGps, gps);
  entry(gps + 2, 0x0001, 2, 2, Buffer.from('N\0\0\0', 'ascii'));
  entry(gps + 14, 0x0002, 5, 3, latAt);
  entry(gps + 26, 0x0003, 2, 2, Buffer.from('E\0\0\0', 'ascii'));
  entry(gps + 38, 0x0004, 5, 3, lonAt);
  tiff.writeUInt32LE(0, gps + 2 + entriesGps * 12);

  model.copy(tiff, modelAt);
  [55, 45, 21].forEach((value, i) => {
    tiff.writeUInt32LE(value, latAt + i * 8);
    tiff.writeUInt32LE(1, latAt + i * 8 + 4);
  });
  [37, 37, 4].forEach((value, i) => {
    tiff.writeUInt32LE(value, lonAt + i * 8);
    tiff.writeUInt32LE(1, lonAt + i * 8 + 4);
  });

  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

async function main() {
  const { debugUrl, stop } = await launchBrowser();
  try {
    const page = await openPage(debugUrl);
    const jpeg = Buffer.from(await page.eval(DRAW), 'base64');
    await page.close();
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('браузер вернул не JPEG');

    // Метаданные — сразу за началом файла, как у телефона.
    const photo = Buffer.concat([jpeg.subarray(0, 2), exifSegment(), jpeg.subarray(2)]);
    mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, 'snimok-bokom.jpg');
    writeFileSync(file, photo);
    process.stdout.write(`${path.relative(repoRoot, file)}: ${photo.length} байт\n`);
  } finally {
    stop();
  }
}

main().catch((cause) => {
  process.stderr.write(`\nОбразец не создан: ${cause?.message ?? cause}\n`);
  process.exitCode = 1;
});
