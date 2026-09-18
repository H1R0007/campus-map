import { strict as assert } from 'node:assert';
import { editorHelpers } from '../editor.mjs';

/**
 * Редактор: карточка узла показывает то, что есть в данных сейчас.
 *
 * Списки названий, соседей и переходов раньше снимались один раз при выборе
 * узла: добавленное название в карточке не появлялось, а следующая правка шла
 * по устаревшему списку и стирала его. Это потеря разметки, поэтому проверяется
 * весь круг: добавили, удалили другое, открыли заново.
 */
export default {
  app: 'editor',
  name: 'редактор: карточка узла живая',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);

    await step('добавленное название видно, а правка другого его не стирает', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      assert.equal(await e.propertiesNodeId(), 'a1_room101');
      assert.match(await e.panelSection('Алиасы'), /Алиасы \(4\)/);

      const input = await e.panelPoint('input[placeholder="Новый алиас..."]');
      assert.ok(input);
      await e.click(input.x, input.y);
      await e.type('Проверочное имя');
      await e.key('Enter');

      let section = await e.panelSection('Алиасы');
      assert.match(section, /Алиасы \(5\)/, `после добавления: ${section}`);
      assert.match(section, /Проверочное имя/, 'добавленное название не показано');
      await shot('editor-properties');

      // Удаление первого названия не должно трогать добавленное.
      const remove = await e.panelPoint('button[aria-label="Удалить название «А-101»"]');
      await e.click(remove.x, remove.y);
      section = await e.panelSection('Алиасы');
      assert.match(section, /Алиасы \(4\)/, `после удаления: ${section}`);
      assert.match(section, /Проверочное имя/, 'добавленное название стёрлось при следующей правке');
      assert.doesNotMatch(section, /А-101/, 'удалено не то название');

      await e.key('z', { modifiers: 2 });
      await e.key('z', { modifiers: 2 });
      section = await e.panelSection('Алиасы');
      assert.match(section, /Алиасы \(4\)/);
      assert.doesNotMatch(section, /Проверочное имя/, 'отмена вернула прежние названия');
    });

    await step('список соседей обновляется после удаления ребра', async () => {
      const stairs = await e.nodePoint('a1_stairs');
      await e.click(stairs.x, stairs.y);
      const before = await e.panelSection('Соседи');
      assert.match(before, /Соседи \(1\)/, before);

      const remove = await e.panelPoint('button[aria-label^="Удалить связь"]');
      await e.click(remove.x, remove.y);
      assert.match(await e.panelSection('Соседи'), /Соседи \(0\)/, 'список соседей не обновился');
      await e.key('z', { modifiers: 2 });
      assert.match(await e.panelSection('Соседи'), /Соседи \(1\)/);
    });

    await step('список переходов обновляется после удаления перехода на карте', async () => {
      assert.equal(await e.propertiesNodeId(), 'a1_stairs');
      assert.match(await e.panelSection('Переходы'), /Переходы \(1\)/);

      const row = await e.transitionRowPoint('a1_stairs|a2_stairs');
      await e.click(row.x, row.y, { button: 'right' });
      await e.menuPick('Удалить переход');

      assert.equal(await e.propertiesNodeId(), 'a1_stairs', 'узел остался выбранным');
      assert.match(await e.panelSection('Переходы'), /Переходы \(0\)/, 'список переходов не обновился');
      await e.key('z', { modifiers: 2 });
      assert.match(await e.panelSection('Переходы'), /Переходы \(1\)/);
    });
  },
};
