import { strict as assert } from 'node:assert';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: клавиатура.
 *
 * Команда разметки печатает по-русски, и раскладка обычно русская. Клавиши
 * читаются по физической клавише, а не по букве: раньше в русской раскладке
 * не работали ни отмена, ни копирование, ни переключение инструментов.
 *
 * Здесь же стрелки: со включённой сеткой шаг равен клетке (иначе сдвиг
 * притягивался обратно и узел не двигался), подряд идущие сдвиги — одна
 * отмена, а без выделения стрелки двигают карту.
 */
export default {
  app: 'editor',
  name: 'редактор: клавиатура и раскладка',

  async run({ page, base, step }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    /** Клавиша в русской раскладке: буква другая, физическая клавиша та же. */
    const ru = (letter, code, modifiers = 0) => e.key(letter, { code, modifiers });

    await step('русская раскладка: инструмент, создание узла и отмена', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      const before = (await e.nodeIds()).length;

      await ru('т', 'KeyN');
      assert.match(await e.status(), /Узел/, 'клавиша инструмента не сработала в русской раскладке');

      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y);
      assert.equal((await e.nodeIds()).length, before + 1, 'узел не поставлен');

      await ru('я', 'KeyZ', MOD.ctrl);
      assert.equal((await e.nodeIds()).length, before, 'Ctrl+Z в русской раскладке не отменил');

      await ru('м', 'KeyV');
      assert.match(await e.status(), /Выбор/);
    });

    await step('стрелки двигают узел: по пикселю, с сеткой — по клетке, отмена одна', async () => {
      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      const startX = Number(await e.panelValue('Координата X'));

      for (let i = 0; i < 3; i++) await e.key('ArrowRight');
      assert.equal(Number(await e.panelValue('Координата X')), startX + 3);

      await e.key('z', { modifiers: MOD.ctrl });
      assert.equal(Number(await e.panelValue('Координата X')), startX, 'три нажатия — одна отмена');

      await e.press('Фильтры');
      await e.toggleFilter('Включить сетку');
      await e.press('Закрыть фильтры');

      const room2 = await e.nodePoint('a1_room101');
      await e.click(room2.x, room2.y);
      for (let i = 0; i < 2; i++) await e.key('ArrowRight');
      assert.equal(Number(await e.panelValue('Координата X')), startX + 40, 'со включённой сеткой шаг — клетка');

      await e.key('z', { modifiers: MOD.ctrl });
      assert.equal(Number(await e.panelValue('Координата X')), startX);

      await e.press('Фильтры');
      await e.toggleFilter('Включить сетку');
      await e.press('Закрыть фильтры');
    });

    await step('без выделения стрелки двигают карту', async () => {
      await e.key('Escape');
      const before = await e.nodePoint('a1_room101');
      await e.key('ArrowRight');
      await page.sleep(400);
      const after = await e.nodePoint('a1_room101');
      assert.ok(after.x < before.x - 60, `карта не сдвинулась: ${before.x} → ${after.x}`);

      await e.key('ArrowLeft');
      await page.sleep(400);
      const back = await e.nodePoint('a1_room101');
      assert.ok(Math.abs(back.x - before.x) < 3, 'карта не вернулась');
    });

    await step('PageUp и PageDown листают этажи корпуса', async () => {
      assert.match(await e.status(), /Этаж 1/);
      await e.key('PageUp');
      assert.match(await e.status(), /Этаж 2/);
      await e.key('PageUp');
      assert.match(await e.status(), /Этаж 3/);
      await e.key('PageUp');
      assert.match(await e.status(), /Этаж 3/, 'выше верхнего этажа листать некуда');
      await e.key('PageDown');
      await e.key('PageDown');
      assert.match(await e.status(), /Этаж 1/);
    });
  },
};
