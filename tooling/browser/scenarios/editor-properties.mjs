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
      assert.match(await e.panelSection('Названия'), /Названия \(4\)/);

      const input = await e.panelPoint('input[aria-label="Новое название"]');
      assert.ok(input);
      await e.click(input.x, input.y);
      await e.type('Проверочное имя');
      await e.key('Enter');

      let section = await e.panelSection('Названия');
      assert.match(section, /Названия \(5\)/, `после добавления: ${section}`);
      assert.match(section, /Проверочное имя/, 'добавленное название не показано');
      await shot('editor-properties');

      // Удаление первого названия не должно трогать добавленное.
      const remove = await e.panelPoint('button[aria-label="Удалить название «А-101»"]');
      await e.click(remove.x, remove.y);
      section = await e.panelSection('Названия');
      assert.match(section, /Названия \(4\)/, `после удаления: ${section}`);
      assert.match(section, /Проверочное имя/, 'добавленное название стёрлось при следующей правке');
      assert.doesNotMatch(section, /А-101/, 'удалено не то название');

      await e.key('z', { modifiers: 2 });
      await e.key('z', { modifiers: 2 });
      section = await e.panelSection('Названия');
      assert.match(section, /Названия \(4\)/);
      assert.doesNotMatch(section, /Проверочное имя/, 'отмена вернула прежние названия');
    });

    await step('список связей обновляется после удаления связи', async () => {
      const stairs = await e.nodePoint('a1_stairs');
      await e.click(stairs.x, stairs.y);
      const before = await e.panelSection('Связи');
      assert.match(before, /Связи \(1\)/, before);

      const remove = await e.panelPoint('button[aria-label^="Удалить связь"]');
      await e.click(remove.x, remove.y);
      assert.match(await e.panelSection('Связи'), /Связи \(0\)/, 'список связей не обновился');
      await e.key('z', { modifiers: 2 });
      assert.match(await e.panelSection('Связи'), /Связи \(1\)/);
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

    await step('названия — первый раздел карточки, служебное свёрнуто', async () => {
      const layout = await page.eval(`(() => {
        const card = document.querySelector('[aria-label="Свойства узла"]');
        return {
          first: card.querySelector('section h3')?.textContent.trim(),
          serviceOpen: card.querySelector('details')?.open ?? null,
        };
      })()`);
      assert.match(layout.first ?? '', /^Названия/, `первый раздел: ${layout.first}`);
      assert.equal(layout.serviceOpen, false, 'положение и id должны быть свёрнуты');
    });

    await step('двойной щелчок по узлу без названия — сразу ввод названия', async () => {
      const corridor = await e.nodePoint('a1_corridor_3');
      await e.dblclick(corridor.x, corridor.y);
      assert.equal(await e.propertiesNodeId(), 'a1_corridor_3');
      assert.equal(
        await page.eval(`document.activeElement?.getAttribute('aria-label')`),
        'Новое название',
        'курсор не в поле названия'
      );
      await e.type('Коридор у лестницы');
      await e.key('Enter');
      assert.match(await e.panelSection('Названия'), /Коридор у лестницы/);
      assert.equal(
        await page.eval(`document.querySelector('[aria-label="Свойства узла"] h2')?.textContent.trim()`),
        'Коридор у лестницы',
        'заголовок карточки — первое название'
      );
      // Ctrl+Z в поле ввода — отмена набора, а не правки: сначала уходим из поля.
      await page.eval('document.activeElement?.blur()');
      await e.key('z', { modifiers: 2 });
      assert.doesNotMatch(await e.panelSection('Названия'), /Коридор у лестницы/, 'отмена не убрала название');
    });

    await step('двойной щелчок по узлу с названием — правка главного названия', async () => {
      const room = await e.nodePoint('a1_room102');
      await e.dblclick(room.x, room.y);
      assert.equal(await page.eval(`document.activeElement?.getAttribute('aria-label')`), 'Название 1');
      await e.key('Escape');
      assert.equal(await e.propertiesNodeId(), 'a1_room102', 'Esc в поле названия снял выбор');
    });

    await step('без выбора — обзор плана: сводка и распавшийся план', async () => {
      const overview = () =>
        page.eval(`document.querySelector('[aria-label="Обзор плана"]')?.textContent.replace(/\\s+/g, ' ') ?? ''`);
      await e.key('Escape');
      let text = await overview();
      assert.match(text, /Корпус А, этаж 1/, text);
      assert.match(text, /Узлов ?23/, text);
      assert.match(text, /Все узлы плана связаны/, text);

      const room = await e.nodePoint('a1_room103');
      await e.click(room.x, room.y);
      const remove = await e.panelPoint('button[aria-label^="Удалить связь"]');
      await e.click(remove.x, remove.y);
      await e.key('Escape');
      text = await overview();
      assert.match(text, /распался на 2 части/, text);
      assert.match(text, /Без связей ?1/, text);
      await shot('editor-plan-overview');

      await e.key('z', { modifiers: 2 });
      assert.match(await overview(), /Все узлы плана связаны/, 'отмена не вернула связь в обзоре');
    });
  },
};
