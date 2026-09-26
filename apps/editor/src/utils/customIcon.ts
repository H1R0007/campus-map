import { MAX_ICON_IMAGE_LENGTH } from '@campus-map/core';

/** Сторона картинки своего значка, пиксели: крупнее значку не нужно, а данные тяжелеют. */
const RASTER_SIZE = 64;

/** Элементы, которые могут выполняться или тянуть чужие файлы. */
const UNSAFE_ELEMENTS = 'script, foreignObject, iframe, object, embed, audio, video';

/**
 * Свой значок из файла — картинкой для данных вида.
 *
 * SVG очищается от всего, что может выполняться или тянуть чужие файлы, и
 * остаётся векторным. PNG, JPG и WebP уменьшаются до 64×64 и сохраняются как
 * PNG. Значок рисуется маской — важна только непрозрачность: цветной рисунок
 * станет одноцветным силуэтом, поэтому лучше всего подходят одноцветные
 * значки на прозрачном фоне.
 *
 * @throws Error с объяснением для человека
 */
export async function customIconFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type === 'image/svg+xml' || name.endsWith('.svg')) return svgIcon(await file.text());
  if (/^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/.test(name)) return rasterIcon(file);
  throw new Error('Значок — файл SVG, PNG, JPG или WebP');
}

function svgIcon(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Файл не читается как SVG');
  }

  // Ничего исполняемого и ничего внешнего: картинка едет в данные навигатора.
  for (const unsafe of [...svg.querySelectorAll(UNSAFE_ELEMENTS)]) unsafe.remove();
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const attributeName = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      const external = (attributeName === 'href' || attributeName === 'xlink:href') && !value.startsWith('#');
      if (attributeName.startsWith('on') || external || value.includes('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  // Без viewBox значок не масштабируется — он берётся из размеров, если есть.
  if (!svg.getAttribute('viewBox')) {
    const width = Number.parseFloat(svg.getAttribute('width') ?? '');
    const height = Number.parseFloat(svg.getAttribute('height') ?? '');
    if (width > 0 && height > 0) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  svg.removeAttribute('width');
  svg.removeAttribute('height');

  const url = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  if (url.length > MAX_ICON_IMAGE_LENGTH) {
    throw new Error('Значок слишком сложный — больше 64 КБ. Упростите рисунок или возьмите PNG');
  }
  return url;
}

async function rasterIcon(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Картинка не открывается');
  }

  const canvas = document.createElement('canvas');
  canvas.width = RASTER_SIZE;
  canvas.height = RASTER_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог обработать картинку');

  // Вписать с сохранением пропорций, по центру.
  const scale = Math.min(RASTER_SIZE / bitmap.width, RASTER_SIZE / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (RASTER_SIZE - width) / 2, (RASTER_SIZE - height) / 2, width, height);

  const url = canvas.toDataURL('image/png');
  if (url.length > MAX_ICON_IMAGE_LENGTH) throw new Error('Значок слишком большой');
  return url;
}
