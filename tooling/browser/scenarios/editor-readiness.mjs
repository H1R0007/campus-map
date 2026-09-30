import { strict as assert } from 'node:assert';
import { editorHelpers } from '../editor.mjs';

/**
 * Редактор: «Готовность карты» (запись 67).
 *
 * Пятнадцать строк по данным — в «Проверке», коротко — внизу структуры в
 * «Планах и корпусах» и числом в строке состояния. Правка, которая что-то
 * ломает, сразу видна в списке, а кнопка строки ведёт к месту исправления.
 */
export default {
  app: 'editor',
  name: 'редактор: готовность карты',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const rows = () =>
      page.eval(`[...document.querySelectorAll('[data-ready]')].map((row) => ({ id: row.dataset.ready, state: row.dataset.state }))`);
    const state = async (id) => (await rows()).find((row) => row.id === id)?.state;
    const meter = () => page.eval(`document.querySelector('.editor-ready__count-value')?.textContent.trim() ?? ''`);
    const statusCount = () => page.eval(`document.querySelector('.editor-statusbar__ready')?.textContent.trim() ?? ''`);
    const rowButton = (id, label) =>
      page.eval(`(() => {
        const row = document.querySelector('[data-ready=${JSON.stringify(id)}]');
        const button = [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
        if (!button) return false;
        button.click();
        return true;
      })()`);

    await step('«Проверка» открывается готовностью: 15 строк в четырёх группах, число — и в строке состояния', async () => {
      await e.open();
      await e.mode('Проверка');
      const selected = await page.eval(`document.querySelector('.editor-inspector [role="tab"][aria-selected="true"]')?.textContent.trim()`);
      assert.match(selected, /^Готовность/);
      assert.equal((await rows()).length, 15);
      const groups = await page.eval(`[...document.querySelectorAll('.editor-tabpanel .editor-card__heading')].map((h) => h.textContent.trim())`);
      assert.deepEqual(groups, ['Каркас', 'Разметка', 'Переходы', 'Итог']);
      const [done, total] = (await meter()).split(' из ').map(Number);
      assert.equal(total, 15);
      assert.equal(await statusCount(), `Готовность ${done} из 15`);
      assert.equal(
        await page.eval(`document.querySelectorAll('[data-ready] .editor-info').length`),
        15,
        'не у каждой строки есть пояснение ⓘ'
      );
    });

    await step('этажи сравниваются по картинкам в фоне, строка перестаёт ждать', async () => {
      await page.waitFor(`document.querySelector('[data-ready="floorsMatch"]')?.dataset.state !== 'pending'`, 20_000);
      assert.ok(['done', 'todo'].includes(await state('floorsMatch')), 'сравнение этажей не закончилось');
      // У корпусов с несколькими этажами планы есть — сравнение что-то сравнило.
      const status = await page.eval(`document.querySelector('[data-ready="floorsMatch"] .editor-ready__status').textContent`);
      assert.match(status, /^(Совпадают: \d+|Не совпадают: \d+)/, `этажи не сравнились: ${status}`);
      await shot('editor-readiness');
    });

    await step('точка без связей: строка сети краснеет, «Показать» открывает план и выбирает точку', async () => {
      await e.mode('Разметка');
      await e.openFloor('Корпус А', 1);
      assert.equal(await state('onePlanNetwork'), undefined, 'список виден вне «Проверки»');
      const free = await e.emptyMapPoint();
      await e.click(free.x, free.y, { button: 'right' });
      await e.menuPick('Поставить точку здесь');
      await e.key('Escape');

      await e.mode('Проверка');
      await page.waitFor(`document.querySelector('[data-ready="onePlanNetwork"]')?.dataset.state === 'todo'`, 5_000);
      assert.equal(await state('saved'), 'todo', 'несохранённая правка не видна');
      const problems = await page.eval(`document.querySelector('[data-ready="onePlanNetwork"]').textContent`);
      assert.match(problems, /Корпус А, этаж 1: 1 точка отдельно от остальных/);
      // Прокрутка к строке двигает только список: ничего из него не торчит
      // из-под прокрутки, и редактор целиком не сдвигается.
      await page.eval(`document.querySelector('[data-ready="onePlanNetwork"]').scrollIntoView({ block: 'center' })`);
      const shifted = await page.eval(`[document.documentElement, document.body, ...document.querySelectorAll('body > div, .editor-shell')].filter((el) => el.scrollTop !== 0).map((el) => el.tagName + '.' + el.className)`);
      assert.deepEqual(shifted, [], 'прокрутка к строке сдвинула весь редактор');
      await shot('editor-readiness-broken');

      assert.equal(await e.selectedCount(), 0);
      assert.ok(await rowButton('onePlanNetwork', 'Показать'), 'нет кнопки «Показать»');
      await page.sleep(400);
      assert.equal(await e.selectedCount(), 1, '«Показать» не выбрал точку');
      assert.match(await e.place(), /Корпус А, этаж 1/);
    });

    await step('отмена возвращает строку, «Сохранить» из строки — правок нет', async () => {
      await e.key('z', { code: 'KeyZ', modifiers: 2 });
      await page.waitFor(`document.querySelector('[data-ready="onePlanNetwork"]')?.dataset.state === 'done'`, 5_000);
      assert.equal(await state('saved'), 'done', 'после отмены правки всё ещё не сохранены');
    });

    await step('в «Планах и корпусах» — полоса внизу структуры, щелчок открывает список', async () => {
      await e.mode('Планы и корпуса');
      const strip = await page.eval(`document.querySelector('.editor-ready-strip')?.textContent ?? ''`);
      assert.match(strip, /Готовность карты\s*\d+ из 15/);
      assert.match(strip, /Дальше:|Карта готова/);
      await shot('editor-readiness-strip');
      await page.eval(`document.querySelector('.editor-ready-strip__head').click()`);
      await page.sleep(300);
      const selected = await page.eval(`document.querySelector('.editor-inspector [role="tab"][aria-selected="true"]')?.textContent.trim()`);
      assert.match(selected, /^Готовность/);
    });

    await step('кнопка строки «Проложить маршрут» ведёт на вкладку «Маршрут»', async () => {
      if ((await state('routeChecked')) === 'todo') {
        assert.ok(await rowButton('routeChecked', 'Проложить маршрут'));
        await page.sleep(300);
        const selected = await page.eval(`document.querySelector('.editor-inspector [role="tab"][aria-selected="true"]')?.textContent.trim()`);
        assert.equal(selected, 'Маршрут');
      }
    });
  },
};
