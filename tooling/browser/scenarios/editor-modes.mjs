import { strict as assert } from 'node:assert';
import { editorHelpers } from '../editor.mjs';

/**
 * Редактор: режимы работы (запись 60).
 *
 * «Планы и корпуса», «Разметка», «Проверка» — у каждого занятия свой набор
 * панелей. В «Планах и корпусах» точки бледные и не ловят щелчки; инструмент
 * правки сам переводит в «Разметку»; режим помнится; строка пути над картой
 * меняет корпус и этаж; архив — в меню «Сохранить».
 */
export default {
  app: 'editor',
  name: 'редактор: режимы работы',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const pressedMode = () => page.eval(`document.querySelector('.editor-modes__item[aria-pressed="true"]')?.textContent.trim() ?? ''`);
    const has = (selector) => page.eval(`!!document.querySelector(${JSON.stringify(selector)})`);
    const left = () => page.eval(`document.querySelector('nav[aria-label="Структура кампуса"]')?.textContent ?? ''`);
    const right = () => page.eval(`document.querySelector('aside[aria-label="Инспектор"]')?.textContent ?? ''`);

    await step('по умолчанию — «Разметка»: инструменты, их параметры и подсказка внизу', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      assert.equal(await pressedMode(), 'Разметка');
      assert.ok(await has('[role="toolbar"][aria-label="Инструменты"]'), 'нет колонки инструментов');
      assert.ok(await has('[aria-label="Параметры инструмента"]'), 'нет строки инструмента');
      assert.match(await left(), /Показывать на карте/);
      assert.match(await left(), /Точность/);
      assert.doesNotMatch(await left(), /Загрузить планы/);
      assert.match(await e.status(), /Щелчок — выбрать/, 'подсказки инструмента нет в строке состояния');
      assert.match(await right(), /Свойства/);
    });

    await step('«Планы и корпуса»: свойства этажа и корпуса, точки бледные и не ловят щелчки', async () => {
      await e.mode('Планы и корпуса');
      assert.equal(await pressedMode(), 'Планы и корпуса');
      assert.ok(!(await has('[role="toolbar"][aria-label="Инструменты"]')), 'колонка инструментов осталась');
      assert.ok(!(await has('[aria-label="Параметры инструмента"]')), 'строка инструмента осталась');
      assert.match(await left(), /Загрузить планы/);
      assert.doesNotMatch(await left(), /Показывать на карте/);
      assert.ok(await has('section[aria-label="Этаж и корпус"]'), 'справа нет свойств этажа и корпуса');
      assert.doesNotMatch(await e.status(), /Щелчок — выбрать/, 'подсказка инструмента вне «Разметки»');
      await shot('editor-modes-plans');

      const room = await e.nodePoint('a1_room101', { allowCovered: true });
      await e.click(room.x, room.y);
      assert.equal(await e.selectedCount(), 0, 'точка выбралась в «Планах и корпусах»');
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y, { button: 'right' });
      assert.ok(!(await has('[role="menu"]')), 'меню правой кнопки открылось в «Планах и корпусах»');
    });

    await step('клавиша инструмента переводит в «Разметку»; режим помнится после перезагрузки', async () => {
      await e.key('n');
      assert.equal(await pressedMode(), 'Разметка', 'N не открыл «Разметку»');
      assert.equal(await e.tool(), 'Точка');
      await e.key('v');

      await e.mode('Проверка');
      await e.open();
      assert.equal(await pressedMode(), 'Проверка', 'режим забыт после перезагрузки');
      assert.ok(await has('[role="tab"][aria-selected="true"]'), 'в «Проверке» нет вкладок');
      assert.match(await left(), /Подсветить на плане/);
      assert.doesNotMatch(await left(), /Точность/, '«Точность» видна в «Проверке»');
      await e.mode('Разметка');
    });

    await step('строка пути над картой меняет корпус и этаж', async () => {
      const pick = (label, value) =>
        page.eval(`(() => {
          const select = document.querySelector('.editor-mapbar select[aria-label=${JSON.stringify(label)}]');
          if (!select) return false;
          select.value = ${JSON.stringify(value)};
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`);
      assert.ok(await pick('Корпус', 'building_b'), 'нет списка корпусов');
      await page.sleep(500);
      assert.match(await e.place(), /Корпус Б/);
      assert.ok(await pick('Этаж', '2'), 'нет списка этажей');
      await page.sleep(500);
      assert.match(await e.place(), /Корпус Б \/ Этаж 2/);
      assert.ok(await pick('Корпус', ''), 'нет территории в списке');
      await page.sleep(500);
      assert.match(await e.place(), /Территория/);
    });

    await step('архив — в меню «Сохранить»; Escape закрывает меню', async () => {
      await e.press('Ещё: архив');
      const items = await page.eval(`[...document.querySelectorAll('.editor-split .editor-menu__item')].map((b) => b.textContent.trim())`);
      assert.deepEqual(items, ['Скачать архив', 'Открыть архив…']);
      await shot('editor-modes-save-menu');
      await e.key('Escape', { keyCode: 27 });
      assert.ok(!(await has('.editor-split .editor-menu__popover')), 'Escape не закрыл меню');
    });
  },
};
