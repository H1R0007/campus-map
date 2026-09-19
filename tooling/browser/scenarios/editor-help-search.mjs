import { strict as assert } from 'node:assert';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: справка по клавишам и поиск, прощающий опечатки.
 *
 * Справка — модальное окно: фокус внутри, Tab из окна не уходит, Escape
 * закрывает окно и возвращает фокус туда, откуда его открыли, не трогая
 * выбранный узел. Поиск находит место так же, как навигатор: с опечаткой,
 * латинскими буквами и в другой раскладке. Раньше редактор искал только
 * точный кусок текста.
 */
export default {
  app: 'editor',
  name: 'редактор: справка и поиск',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const dialog = () =>
      page.eval(`(() => {
        const d = document.querySelector('[role="dialog"]');
        return d ? { label: d.getAttribute('aria-label') ?? d.querySelector('h2')?.textContent, focusInside: d.contains(document.activeElement) } : null;
      })()`);

    await step('F1 открывает справку, Tab не уходит из окна, Esc закрывает и не снимает выбор', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);

      await e.key('F1', { keyCode: 112 });
      let d = await dialog();
      assert.ok(d, 'справка не открылась');
      assert.match(d.label, /Как работать/);
      assert.ok(d.focusInside, 'фокус не в окне справки');
      await shot('editor-help');

      for (let i = 0; i < 4; i++) {
        await e.key('Tab', { keyCode: 9 });
        assert.ok((await dialog()).focusInside, 'Tab увёл фокус из окна');
      }

      await e.key('Escape', { keyCode: 27 });
      assert.equal(await dialog(), null, 'Esc не закрыл справку');
      assert.equal(await e.selectedCount(), 1, 'Esc в справке снял выбор узла');
    });

    await step('кнопка «?» открывает справку, а после закрытия фокус возвращается на неё', async () => {
      await page.eval(`document.querySelector('button[aria-label="Справка: мышь и клавиши"]').focus()`);
      await e.key('Enter', { keyCode: 13, text: String.fromCharCode(13) });
      assert.ok(await dialog(), 'справка не открылась с кнопки');
      await e.key('Escape', { keyCode: 27 });
      assert.equal(
        await page.eval(`document.activeElement?.getAttribute('aria-label')`),
        'Справка: мышь и клавиши',
        'фокус не вернулся на кнопку справки'
      );
    });

    /** Открывает поиск, набирает запрос и возвращает подписи найденного. */
    const search = async (query) => {
      await e.key('f', { modifiers: MOD.ctrl });
      const d = await dialog();
      assert.equal(d?.label, 'Поиск узла');
      assert.ok(d.focusInside, 'фокус не в поле поиска');
      await e.type(query);
      await page.sleep(200);
      return page.eval(`[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim())`);
    };

    await step('поиск прощает опечатку, латиницу и другую раскладку', async () => {
      for (const query of ['Аудитори 101', 'a-101', 'f-101']) {
        const options = await search(query);
        assert.match(options[0] ?? '', /^А-101/, `«${query}»: первым найдено ${JSON.stringify(options.slice(0, 3))}`);
        await e.key('Escape', { keyCode: 27 });
        assert.equal(await dialog(), null);
      }
    });

    await step('Enter в поиске открывает план узла и выбирает его', async () => {
      await e.key('Escape', { keyCode: 27 });
      await e.openFloor('Корпус Б', 1);
      const options = await search('А-102');
      assert.match(options[0] ?? '', /^А-102/);
      await shot('editor-search');
      await e.key('Enter', { keyCode: 13 });
      await page.waitFor(`document.querySelector('[data-status-place]')?.textContent.includes('Корпус А')`);
      assert.equal(await e.propertiesNodeId(), 'a1_room102', 'найденный узел не выбран');
      assert.equal(await dialog(), null, 'поиск не закрылся');
    });
  },
};
