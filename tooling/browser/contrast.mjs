/**
 * Проверка контраста текста для сценариев в браузере (записи 18 и 21).
 *
 * У каждого видимого текста цвет против фактического фона — с учётом
 * полупрозрачных подложек и прозрачности — не ниже 4,5:1, у крупного текста —
 * 3:1 (WCAG 1.4.3). Выражение выполняется в странице (`page.eval`) и
 * возвращает список нарушений.
 */

/** Выражение в странице: видимые тексты с недостаточным контрастом. */
export const LOW_CONTRAST = `(() => {
  const parse = (value) => {
    // Без обратных косых черт: строка уходит в страницу, и экранирование легко потерять.
    const open = value.indexOf('(');
    if (open === -1) return null;
    const parts = value.slice(open + 1, value.lastIndexOf(')')).split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const luminance = ({ r, g, b }) => {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const backgroundOf = (element) => {
    const layers = [];
    for (let el = element; el; el = el.parentElement) {
      const bg = parse(getComputedStyle(el).backgroundColor);
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 1) break;
      }
    }
    let result = layers.length > 0 && layers[layers.length - 1].a >= 1
      ? layers.pop()
      : parse(getComputedStyle(document.body).backgroundColor);
    while (layers.length > 0) result = over(layers.pop(), result);
    return result;
  };

  const failures = [];
  for (const element of document.querySelectorAll('body *')) {
    const text = [...element.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!text || element.closest('.leaflet-pane, script, style')) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue;
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden') continue;
    let opacity = 1;
    for (let el = element; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
    if (opacity < 0.5) continue;

    const color = parse(style.color);
    const background = backgroundOf(element);
    const foreground = over({ ...color, a: color.a * opacity }, background);
    const l1 = luminance(foreground);
    const l2 = luminance(background);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      failures.push({ text: text.slice(0, 40), ratio: Math.round(ratio * 100) / 100, color: style.color, size });
    }
  }
  return failures;
})()`;
