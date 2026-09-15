import type { PlanFormat } from '@campus-map/core';
import { rewriteHrefReference, rewriteStyleReferences, rewriteUrlReferences } from './svgIds.js';
import type { ImageSize } from './useImageSize.js';

/**
 * Содержимое плана для холста: встроенный SVG или картинка (запись 31).
 *
 * SVG встраивается в страницу, а не показывается через `<img>`: так план
 * перекрашивают правила CSS темы, и тёмной теме не нужен фильтр инверсии.
 * Встроенный SVG исполнял бы свои скрипты и обработчики, поэтому они
 * вырезаются: план — данные, а не код.
 */

export interface PlanContent {
  element: Element;
  /** Размер плана в пикселях: у SVG — из `width`/`height` или `viewBox`, у картинки — натуральный. */
  size: ImageSize;
}

/** Текст SVG по адресу — один запрос на план, сколько бы раз его ни показали. */
const svgTexts = new Map<string, Promise<string>>();

const FORBIDDEN_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed']);

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

/** Убирает из SVG исполняемое: скрипты, встроенный HTML, обработчики, `javascript:`-ссылки. */
export function sanitizeSvg(root: Element): void {
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (FORBIDDEN_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const scriptLink = (name === 'href' || name === 'xlink:href') && /^\s*javascript:/i.test(attribute.value);
      if (name.startsWith('on') || scriptLink) element.removeAttribute(attribute.name);
    }
  }
}

/** Размер SVG в пикселях плана; `null`, если его не из чего взять. */
export function svgSize(root: Element): ImageSize | null {
  const width = Number.parseFloat(root.getAttribute('width') ?? '');
  const height = Number.parseFloat(root.getAttribute('height') ?? '');
  if (width > 0 && height > 0) return { width, height };

  const viewBox = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  return viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0 ? { width: viewBox[2], height: viewBox[3] } : null;
}

let scopedPlans = 0;

/** Даёт `id` плана префикс, свой у каждого встроенного экземпляра, и переписывает ссылки на них. */
function scopeSvgIds(root: Element): void {
  const prefix = `campus-plan-${(scopedPlans += 1)}-`;
  const ids = new Map<string, string>();
  for (const element of root.querySelectorAll('[id]')) {
    const id = element.getAttribute('id') ?? '';
    ids.set(id, prefix + id);
    element.setAttribute('id', prefix + id);
  }
  if (ids.size === 0) return;

  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      attribute.value =
        name === 'href' || name === 'xlink:href'
          ? rewriteHrefReference(attribute.value, ids)
          : rewriteUrlReferences(attribute.value, ids);
    }
    if (element.localName === 'style' && element.textContent) {
      element.textContent = rewriteStyleReferences(element.textContent, ids);
    }
  }
}

async function loadSvg(url: string, fallback: ImageSize): Promise<PlanContent> {
  const text = await fetchSvgText(url);
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || parsed.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`План ${url}: не SVG`);
  }

  sanitizeSvg(root);
  scopeSvgIds(root);
  const size = svgSize(root) ?? fallback;
  const element = document.importNode(root, true);
  element.setAttribute('width', String(size.width));
  element.setAttribute('height', String(size.height));
  element.setAttribute('aria-hidden', 'true');
  return { element, size };
}

function loadRaster(url: string): Promise<PlanContent> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.className = 'campus-plan-raster';
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ element: image, size: { width: image.naturalWidth, height: image.naturalHeight } });
      } else {
        reject(new Error(`План ${url}: пустое изображение`));
      }
    };
    image.onerror = () => reject(new Error(`План ${url}: не загрузился`));
    image.src = url;
  });
}

/**
 * Загружает план и готовит элемент для холста.
 *
 * @param fallback размер из метаданных — для SVG без `width`/`height` и `viewBox`
 */
export function loadPlanContent(url: string, format: PlanFormat, fallback: ImageSize): Promise<PlanContent> {
  return format === 'svg' ? loadSvg(url, fallback) : loadRaster(url);
}
