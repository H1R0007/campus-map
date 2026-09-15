import type { PlanFormat } from '@campus-map/core';
import { parseSvgRoot, prepareSvgText } from './svgRoot.js';
import type { ImageSize } from './useImageSize.js';

/**
 * Содержимое плана для холста — изображение, растровое или SVG (записи 31 и 35).
 *
 * SVG показывается изображением, а не встраивается в страницу. Подписи
 * встроенного SVG Chromium заново раскладывал на каждом кадре масштаба — на
 * подробных планах сотни миллисекунд на кадр. Изображение масштабируется
 * готовым, не исполняет скриптов и не делит `id` с другими планами. Тему в
 * изображение вносит стиль, вписанный в текст файла (`svgRoot.ts`).
 */

export interface PlanContent {
  element: HTMLImageElement;
  /** Размер плана в пикселях: у SVG — из `width`/`height` или `viewBox`, у картинки — натуральный. */
  size: ImageSize;
}

/** Текст SVG по адресу — один запрос на план, сколько бы раз его ни показали. */
const svgTexts = new Map<string, Promise<string>>();

function fetchSvgText(url: string): Promise<string> {
  const cached = svgTexts.get(url);
  if (cached) return cached;

  const request = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`План ${url}: HTTP ${response.status}`);
    return response.text();
  });
  // Неудача не кэшируется: без связи план не загрузился, а со связью загрузится.
  request.catch(() => svgTexts.delete(url));
  svgTexts.set(url, request);
  return request;
}

/** Подготовка изображения, ждущая своего кадра. */
const decodeQueue: Array<() => void> = [];

/**
 * Очередь подготовки: не больше одного плана за кадр. Разбор подробного SVG
 * при декодировании — работа главного потока, и когда камера подлетает к
 * кварталу корпусов вплотную, планы нескольких этажей готовы одновременно:
 * разом они подвешивали бы кадр.
 */
function nextDecodeSlot(): Promise<void> {
  return new Promise((resolve) => {
    decodeQueue.push(resolve);
    if (decodeQueue.length === 1) requestAnimationFrame(releaseDecodeSlot);
  });
}

function releaseDecodeSlot(): void {
  decodeQueue.shift()?.();
  if (decodeQueue.length > 0) requestAnimationFrame(releaseDecodeSlot);
}

function planImage(className: string): HTMLImageElement {
  const image = new Image();
  image.className = className;
  image.alt = '';
  image.draggable = false;
  image.decoding = 'async';
  return image;
}

/**
 * Изображение загружено и, где браузер умеет, декодировано заранее — чтобы план
 * не декодировался посреди кадра, когда появится на экране.
 *
 * `decode()` у SVG-изображений поддержан не во всех браузерах одинаково: отказ
 * декодирования ещё не значит, что плана нет, — решает загрузка.
 */
async function imageReady(image: HTMLImageElement): Promise<boolean> {
  try {
    await image.decode();
    return true;
  } catch {
    if (!image.complete) {
      await new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }
    return image.naturalWidth > 0;
  }
}

async function loadSvg(url: string, fallback: ImageSize, css: string): Promise<PlanContent> {
  const text = await fetchSvgText(url);
  const root = parseSvgRoot(text);
  if (root === null) throw new Error(`План ${url}: не SVG`);

  const size = root.size ?? fallback;
  // Планы с классами генератора перекрашиваются вписанным стилем; остальные в
  // тёмной теме инвертирует фильтр приложения.
  const image = planImage(root.classes.includes('campus-plan') ? 'campus-plan-image' : 'campus-plan-image campus-plan-image--foreign');
  image.width = size.width;
  image.height = size.height;

  await nextDecodeSlot();
  const source = URL.createObjectURL(new Blob([prepareSvgText(text, root, size, css)], { type: 'image/svg+xml' }));
  try {
    image.src = source;
    if (!(await imageReady(image))) throw new Error(`План ${url}: не разобрался`);
  } finally {
    // Загруженное изображение адрес больше не держит.
    URL.revokeObjectURL(source);
  }
  return { element: image, size };
}

async function loadRaster(url: string): Promise<PlanContent> {
  const image = planImage('campus-plan-image campus-plan-raster');
  image.src = url;
  if (!(await imageReady(image))) throw new Error(`План ${url}: не загрузился`);
  if (image.naturalHeight === 0) throw new Error(`План ${url}: пустое изображение`);
  return { element: image, size: { width: image.naturalWidth, height: image.naturalHeight } };
}

/**
 * Загружает план и готовит изображение для холста.
 *
 * @param fallback размер из метаданных — для SVG без `width`/`height` и `viewBox`
 * @param css стиль, вписываемый в SVG перед показом, — например, тёмная тема
 */
export function loadPlanContent(url: string, format: PlanFormat, fallback: ImageSize, css = ''): Promise<PlanContent> {
  return format === 'svg' ? loadSvg(url, fallback, css) : loadRaster(url);
}
