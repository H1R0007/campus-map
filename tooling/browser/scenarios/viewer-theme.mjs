import { strict as assert } from 'node:assert';
import { LOW_CONTRAST } from '../contrast.mjs';
import { PANEL, viewerHelpers } from '../viewer.mjs';

/**
 * Навигатор: светлая и тёмная тема по теме системы (запись 21).
 *
 * Главная проверка — контраст: у каждого видимого текста цвет против
 * фактического фона, с учётом полупрозрачных подложек и прозрачности, не ниже
 * 4,5:1, у крупного текста — 3:1 (WCAG 1.4.3). Проверяется в обеих темах на
 * основных экранах, поэтому ловит и забытый класс, и неудачный токен.
 */

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

    // Цвет травы на плане территории — пиксель у угла изображения: территория
    // видна всегда, и по ней видно, какой лист на экране. План — изображение со
    // вписанным стилем темы (запись 35), поэтому цвет читается с пикселя.
    const GROUND = `(() => {
      const image = document.querySelector('.campus-placed-plan[data-plan="campus"] img');
      if (!image || !image.complete || image.naturalWidth === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      context.drawImage(image, 4, 4, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    })()`;
    const LIGHT_GROUND = 'rgb(228, 238, 218)';
    const DARK_GROUND = 'rgb(22, 30, 26)';

    const look = () =>
      page.eval(`(() => {
        const line = document.querySelector('.campus-route-line');
        const image = document.querySelector('.campus-placed-plan[data-plan="campus"] img');
        return {
          panel: getComputedStyle(${PANEL}).backgroundColor,
          line: line ? getComputedStyle(line).stroke : null,
          ground: ${GROUND},
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
      await page.waitFor(`${GROUND} === '${LIGHT_GROUND}'`);
      const light = await look();
      assert.equal(light.panel, 'rgb(255, 255, 255)');
      assert.equal(light.line, 'rgb(0, 99, 204)');
      assert.equal(light.ground, LIGHT_GROUND, 'план в светлой теме — цвета файла');
      assert.equal(light.filter, 'none', 'план без фильтра');
    });

    await step('тёмная тема: текст на основных экранах контрастен', async () => {
      await useScheme('dark');
      await mainScreens('dark');
    });

    await step('тёмная тема: тёмная панель, светлая линия маршрута, план без яркого листа', async () => {
      await page.waitFor(`${GROUND} === '${DARK_GROUND}'`);
      const dark = await look();
      assert.equal(dark.panel, 'rgb(27, 34, 46)');
      assert.equal(dark.line, 'rgb(110, 168, 255)');
      assert.equal(dark.ground, DARK_GROUND, 'план в тёмной теме — тёмный лист');
      assert.equal(
        await page.eval(`getComputedStyle(document.querySelector('.leaflet-container')).backgroundColor`),
        DARK_GROUND,
        'фон холста в тёмной теме — тёмная трава территории'
      );
      assert.equal(dark.filter, 'none', 'тёмный лист — стилем в плане, а не инверсией');
      const meta = await page.eval(`document.querySelector('meta[name="theme-color"]')?.content ?? null`);
      assert.equal(meta, '#0E1219');
    });

    await step('смена темы системы перекрашивает без перезагрузки', async () => {
      await useScheme('light');
      await page.waitFor(`${GROUND} === '${LIGHT_GROUND}'`);
      const light = await look();
      assert.equal(light.panel, 'rgb(255, 255, 255)');
      assert.equal(light.line, 'rgb(0, 99, 204)');
      assert.equal(light.ground, LIGHT_GROUND, 'план снова светлый');
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

    await step('переключатель темы: тёмная при светлой системе, выбор запоминается, «Как в системе» возвращает', async () => {
      await page.viewport(390, 844, 2);
      await useScheme('light');
      await v.open('/');
      await v.click('Развернуть панель');
      await v.click('Тёмная');
      await page.waitFor(`document.documentElement.dataset.theme === 'dark'`);
      assert.equal((await look()).panel, 'rgb(27, 34, 46)', 'панель тёмная при светлой системе');
      await shot('viewer-theme-switch');
      assert.equal(await page.eval(`document.querySelector('meta[name="theme-color"]').content`), '#0E1219');

      await v.open('/');
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'dark', 'выбор сохранился после перезагрузки');

      await v.click('Развернуть панель');
      await v.click('Как в системе');
      await page.waitFor(`document.documentElement.dataset.theme === 'light'`);
      assert.equal((await look()).panel, 'rgb(255, 255, 255)', 'снова как в системе');
    });
  },
};
