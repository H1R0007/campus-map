import { strict as assert } from 'node:assert';
import { PANEL, viewerHelpers } from '../viewer.mjs';

/**
 * Навигатор: пошаговая навигация по маршруту.
 *
 * Написан под тестовый `data/`: от главного входа корпуса А до «А-305» —
 * четыре шага, подъём по лестнице на третий этаж.
 */
export default {
  app: 'viewer',
  name: 'навигатор: пошаговая навигация',

  async run({ page, base, step, shot }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    await step('«Начать» открывает первый шаг, маршрут приглушён, план не приближен до предела', async () => {
      await v.open('/?from=a1_entrance&to=a3_room305');
      await v.click('Начать');
      assert.ok((await v.panelText()).includes('Шаг 1 из 4'));
      assert.equal(await v.heading(), 'Старт');
      assert.ok((await v.routeLines()).muted > 0, 'маршрут приглушён');
      await page.sleep(600);
      const width = await v.planWidthInScreens();
      assert.ok(width !== null && width < 4, `ширина плана в экранах: ${width}`);
    });

    await step('«Далее» подсвечивает участок и сам открывает этаж шага', async () => {
      await v.click('Далее');
      assert.equal(await v.heading(), 'Дойдите до лестницы');
      assert.ok((await v.routeLines()).strong > 0, 'участок шага подсвечен');
      await v.click('Далее');
      assert.equal(await v.heading(), 'Поднимитесь по лестнице');
      assert.ok((await v.headerText()).includes('Этаж 3'), 'этаж прибытия');
      await page.sleep(600);
      const width = await v.planWidthInScreens();
      assert.ok(width !== null && width < 4, `ширина плана в экранах: ${width}`);
      await shot('viewer-navigation-step');
    });

    await step('ручная смена этажа не сбрасывает шаг', async () => {
      await v.click('Этаж 1, по маршруту');
      assert.ok((await v.panelText()).includes('Шаг 3 из 4'));
      await v.click('Показать шаг на карте');
      assert.ok((await v.headerText()).includes('Этаж 3'));
    });

    await step('последний шаг, «Назад» и «Готово»', async () => {
      await v.click('Далее');
      assert.ok((await v.panelText()).includes('Шаг 4 из 4'));
      await v.click('Предыдущий шаг');
      assert.ok((await v.panelText()).includes('Шаг 3 из 4'));
      await v.click('Далее');
      await v.click('Готово');
      assert.ok((await v.panelText()).includes('Маршрут ·'), 'обзор');
      assert.equal((await v.routeLines()).muted, 0, 'в обзоре маршрут не приглушён');
    });

    await step('нажатие на шаг в списке открывает навигацию с него', async () => {
      await v.click('Развернуть панель');
      await v.click('Поднимитесь по лестнице', `${PANEL}.querySelector('ol')`);
      assert.ok((await v.panelText()).includes('Шаг 3 из 4'));
      await v.click('Развернуть панель');
      const current = await page.eval(`${PANEL}.querySelector('ol [aria-current="step"]')?.textContent ?? ''`);
      assert.ok(current.includes('Поднимитесь по лестнице'), `текущий шаг в списке: ${current}`);
      await v.click('Свернуть панель');
    });

    await step('язык меняется посреди навигации', async () => {
      await v.click('English');
      assert.ok((await v.panelText()).includes('Step 3 of 4'));
      assert.equal(await v.heading(), 'Take the stairs up');
      await v.click('Русский');
    });

    await step('пересчёт маршрута возвращает к обзору', async () => {
      await v.click('Завершить пошаговую навигацию');
      await v.click('Развернуть панель');
      await v.click('Предпочитать лифт');
      assert.ok(!(await v.panelText()).includes('Шаг '), 'после пересчёта — обзор');
    });

    await page.viewport(1440, 900, 1);

    await step('широкий экран: текущий шаг подсвечен в списке', async () => {
      await v.open('/?from=campus_gate&to=b2_lab');
      await v.click('Начать');
      await v.click('Далее');
      await v.click('Далее');
      const current = await page.eval(`${PANEL}.querySelector('ol [aria-current="step"]')?.textContent ?? ''`);
      assert.ok(current.includes('Войдите в здание'), `текущий шаг: ${current}`);
    });
  },
};
