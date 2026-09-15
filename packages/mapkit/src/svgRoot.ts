import type { ImageSize } from './useImageSize.js';

/**
 * Корневой тег SVG-плана и стиль, вписанный в файл перед показом (запись 35).
 *
 * План показывается изображением, а не встраивается в страницу: подписи
 * встроенного SVG Chromium заново раскладывал на каждом кадре масштаба. Внутрь
 * изображения стили страницы не проходят, поэтому стиль темы вписывается в сам
 * текст файла. Функции работают со строками — их можно проверить без DOM.
 */

export interface SvgRoot {
  /** Размер из `width`/`height` или `viewBox`; `null`, если его не из чего взять. */
  size: ImageSize | null;
  /** Классы корня: по `campus-plan` видно, что план перекрашивается стилем темы. */
  classes: string[];
  /** Где кончается открывающий тег — сюда вписывается стиль. */
  end: number;
}

const attributeOf = (tag: string, name: string): string | null => {
  const match = new RegExp(String.raw`\s${name}\s*=\s*(["'])([^"']*)\1`, 'i').exec(tag);
  return match ? match[2] : null;
};

/** Корневой тег `<svg>`; `null`, если файл — не SVG. */
export function parseSvgRoot(text: string): SvgRoot | null {
  const match = /<svg\b[^>]*>/i.exec(text);
  if (!match) return null;

  const tag = match[0];
  const width = Number.parseFloat(attributeOf(tag, 'width') ?? '');
  const height = Number.parseFloat(attributeOf(tag, 'height') ?? '');
  const viewBox = (attributeOf(tag, 'viewBox') ?? '').trim().split(/[\s,]+/).map(Number);

  const size =
    width > 0 && height > 0
      ? { width, height }
      : viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0
        ? { width: viewBox[2], height: viewBox[3] }
        : null;

  return {
    size,
    classes: (attributeOf(tag, 'class') ?? '').split(/\s+/).filter(Boolean),
    end: match.index + tag.length,
  };
}

/**
 * Текст SVG со вписанным стилем и заданным размером. Размер нужен файлам без
 * `width`/`height`: изображение иначе получило бы размер по умолчанию, 300×150.
 */
export function prepareSvgText(text: string, root: SvgRoot, size: ImageSize, css: string): string {
  const opening = text.slice(0, root.end);
  const sized = root.size
    ? opening
    : opening.replace(/<svg\b/i, `<svg width="${size.width}" height="${size.height}"`);
  const style = css ? `<style><![CDATA[${css.split("]]>").join("]]]]><![CDATA[>")}]]></style>` : "";
  return `${sized}${style}${text.slice(root.end)}`;
}
