import { strict as assert } from 'node:assert';
import { PANEL, viewerHelpers } from '../viewer.mjs';

/**
 * Навигатор: светлая и тёмная тема по теме системы (запись 21).
 *
 * Главная проверка — контраст: у каждого видимого текста цвет против
 * фактического фона, с учётом полупрозрачных подложек и прозрачности, не ниже
 * 4,5:1, у крупного текста — 3:1 (WCAG 1.4.3). Проверяется в обеих темах на
 * основных экранах, поэтому ловит и забытый класс, и неудачный токен.
 */

/** Выражение в странице: видимые тексты с недостаточным контрастом. */
const LOW_CONTRAST = `(() => {
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

export default {
  app: 'viewer',
  name: 'навигатор: светлая и тёмная тема',

  async run({ page, base, step, shot }) {
    const v = viewerHelpers(page, base);

    const useScheme = (value) =>
      page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });

    // Нарушения копятся по всем экранам шага и проверяются разом: одно
    // сообщение со всеми, а не первое попавшееся.
    let found = [];
    const checkContrast = async (where) => {
      for (const failure of await page.eval(LOW_CONTRAST)) found.push({ where, ...failure });
    };
    const assertNoLowContrast = () => {
      const failures = found;
      found = [];
      assert.deepEqual(failures, [], `низкий контраст:\n${failures.map((f) => JSON.stringify(f)).join('\n')}`);
    };

    const look = () =>
      page.eval(`(() => {
        const line = document.querySelector('.campus-route-line');
        const image = document.querySelector('.leaflet-image-layer');
        return {
          panel: getComputedStyle(${PANEL}).backgroundColor,
          line: line ? getComputedStyle(line).stroke : null,
          filter: image ? getComputedStyle(image).filter : null,
        };
      })()`);

    /** Основные экраны телефона с проверкой контраста на каждом. */
    const mainScreens = async (theme) => {
      await v.open('/');
      await checkContrast(`${theme}: пустая панель`);
      await v.click('Развернуть панель');
      await checkContrast(`${theme}: раскрытая панель`);

      await v.click('Найти аудиторию или место');
      await v.typeSearch('столовая');
      await checkContrast(`${theme}: подсказки поиска`);
      await v.chooseOption('Столовая');
      await checkContrast(`${theme}: карточка места`);

      await v.open('/?from=campus_gate&to=a3_room305');
      await v.click('Развернуть панель');
      await checkContrast(`${theme}: обзор маршрута`);
      await shot(`viewer-${theme}-route`);

      await v.click('Свернуть панель');
      await v.click('Начать');
      await v.click('Далее');
      await v.click('Далее');
      await checkContrast(`${theme}: шаг навигации`);
      await shot(`viewer-${theme}-navigation`);
      assertNoLowContrast();
    };

    await page.viewport(390, 844, 2);

    await step('проверка контраста сама замечает бледный текст', async () => {
      // Без этого шага проверка, которая по ошибке ничего не находит, тоже
      // «проходила» бы на любых цветах.
      await v.open('/');
      await page.eval(`(() => {
        const probe = document.createElement('p');
        probe.id = 'contrast-probe';
        probe.textContent = 'бледный текст';
        probe.style.cssText = 'position:fixed;top:140px;left:20px;z-index:5000;background:#ffffff;color:#c8c8c8;font-size:14px';
        document.body.append(probe);
      })()`);
      const failures = await page.eval(LOW_CONTRAST);
      await page.eval(`document.getElementById('contrast-probe').remove()`);
      assert.ok(failures.some((failure) => failure.text === 'бледный текст'), `проба не замечена: ${JSON.stringify(failures)}`);
    });

    await step('светлая тема: текст на основных экранах контрастен', async () => {
      await useScheme('light');
      await mainScreens('light');
      const light = await look();
      assert.equal(light.panel, 'rgb(255, 255, 255)');
      assert.equal(light.line, 'rgb(0, 99, 204)');
      assert.equal(light.filter, 'none', 'план в светлой теме без фильтра');
    });

    await step('тёмная тема: текст на основных экранах контрастен', async () => {
      await useScheme('dark');
      await mainScreens('dark');
    });

    await step('тёмная тема: тёмная панель, светлая линия маршрута, план без яркого листа', async () => {
      const dark = await look();
      assert.equal(dark.panel, 'rgb(27, 34, 46)');
      assert.equal(dark.line, 'rgb(110, 168, 255)');
      assert.ok(dark.filter?.includes('invert'), `фильтр плана: ${dark.filter}`);
      const meta = await page.eval(`document.querySelector('meta[name="theme-color"][media*="dark"]')?.content ?? null`);
      assert.equal(meta, '#0E1219');
    });

    await step('смена темы системы перекрашивает без перезагрузки', async () => {
      await useScheme('light');
      await page.sleep(300);
      const light = await look();
      assert.equal(light.panel, 'rgb(255, 255, 255)');
      assert.equal(light.line, 'rgb(0, 99, 204)');
      assert.ok((await v.headerText()).includes('Шаг 3 из'), 'навигация не сбросилась');
    });

    await step('широкий экран, тёмная тема: контраст панели и шапки', async () => {
      await page.viewport(1440, 900, 1);
      await useScheme('dark');
      await v.open('/?from=campus_gate&to=b2_lab');
      await checkContrast('тёмная тема, широкий экран');
      assertNoLowContrast();
      await shot('viewer-dark-desktop');
    });
  },
};
