import { describe, expect, it } from 'vitest';
import { rewriteHrefReference, rewriteStyleReferences, rewriteUrlReferences } from '../src/svgIds.js';

/**
 * Свои `id` у встроенных SVG-планов: ссылки внутри файла идут за переименованными `id`.
 */

const IDS = new Map([
  ['hatch', 'campus-plan-3-hatch'],
  ['wall-gradient', 'campus-plan-3-wall-gradient'],
]);

describe('rewriteUrlReferences', () => {
  it('переписывает url(#id) с кавычками и без, в том числе внутри style', () => {
    expect(rewriteUrlReferences('url(#hatch)', IDS)).toBe('url(#campus-plan-3-hatch)');
    expect(rewriteUrlReferences("url('#wall-gradient')", IDS)).toBe("url('#campus-plan-3-wall-gradient')");
    expect(rewriteUrlReferences('fill: url( "#hatch" ); stroke: red', IDS)).toBe('fill: url("#campus-plan-3-hatch"); stroke: red');
  });

  it('неизвестные id и значения без ссылок не трогает', () => {
    expect(rewriteUrlReferences('url(#other)', IDS)).toBe('url(#other)');
    expect(rewriteUrlReferences('#hatch', IDS)).toBe('#hatch');
    expect(rewriteUrlReferences('none', IDS)).toBe('none');
  });
});

describe('rewriteHrefReference', () => {
  it('переписывает ссылку на элемент того же файла, внешние оставляет', () => {
    expect(rewriteHrefReference('#hatch', IDS)).toBe('#campus-plan-3-hatch');
    expect(rewriteHrefReference('#other', IDS)).toBe('#other');
    expect(rewriteHrefReference('icons.svg#hatch', IDS)).toBe('icons.svg#hatch');
  });
});

describe('rewriteStyleReferences', () => {
  it('переписывает селекторы и ссылки известных id, цвета оставляет цветами', () => {
    const css = '#hatch line { stroke: #fff } .room { fill: url(#wall-gradient) } #fff { }';
    expect(rewriteStyleReferences(css, IDS)).toBe(
      '#campus-plan-3-hatch line { stroke: #fff } .room { fill: url(#campus-plan-3-wall-gradient) } #fff { }'
    );
  });
});
