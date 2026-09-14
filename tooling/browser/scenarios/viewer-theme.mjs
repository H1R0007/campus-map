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

    const look = () =>
      page.eval(`(() => {
        const line = document.querySelector('.campus-route-line');
        // Векторный план холста красится токенами темы (запись 32): территория
        // видна всегда, по её траве видно, какой лист на экране.
        const ground = document.querySelector('svg.campus-plan .plan-ground');
        return {
          panel: getComputedStyle(${PANEL}).backgroundColor,
          line: line ? getComputedStyle(line).stroke : null,
          ground: ground ? getComputedStyle(ground).fill : null,
          filter: ground ? getComputedStyle(ground.closest('.campus-placed-plan')).filter : null,
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
      assert.equal(light.ground, 'rgb(228, 238, 218)', 'план в светлой теме — цвета файла');
      assert.equal(light.filter, 'none', 'план без фильтра');
    });

    await step('тёмная тема: текст на основных экранах контрастен', async () => {
      await useScheme('dark');
      await mainScreens('dark');
    });

    await step('тёмная тема: тёмная панель, светлая линия маршрута, план без яркого листа', async () => {
      const dark = await look();
      assert.equal(dark.panel, 'rgb(27, 34, 46)');
      assert.equal(dark.line, 'rgb(110, 168, 255)');
      assert.equal(dark.ground, 'rgb(22, 30, 26)', 'план в тёмной теме — тёмный лист');
      assert.equal(dark.filter, 'none', 'тёмный лист — токенами, а не инверсией');
      const meta = await page.eval(`document.querySelector('meta[name="theme-color"][media*="dark"]')?.content ?? null`);
      assert.equal(meta, '#0E1219');
    });

    await step('смена темы системы перекрашивает без перезагрузки', async () => {
      await useScheme('light');
      await page.sleep(300);
      const light = await look();
      assert.equal(light.panel, 'rgb(255, 255, 255)');
      assert.equal(light.line, 'rgb(0, 99, 204)');
      assert.equal(light.ground, 'rgb(228, 238, 218)', 'план снова светлый');
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
