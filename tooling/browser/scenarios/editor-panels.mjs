import { strict as assert } from 'node:assert';

/**
 * Редактор: редкие функции убраны, в интерфейсе нет эмодзи, у вкладки есть
 * свой значок.
 */
export default {
  app: 'editor',
  name: 'редактор: панели и значки',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);

    const click = async (label) => {
      const clicked = await page.eval(`(() => {
        const label = ${JSON.stringify(label)};
        const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label) || b.getAttribute('title') === label);
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`нет кнопки «${label}»`);
      await page.sleep(500);
    };

    await step('у вкладки свой значок, запроса favicon.ico с ошибкой нет', async () => {
      await page.goto(`${base}/`);
      await page.waitFor(`document.body.innerText.includes('Слои') && document.querySelectorAll('.leaflet-overlay-pane path').length > 0`, 20_000);
      await page.sleep(500);
      assert.ok(await page.eval(`document.querySelector('link[rel="icon"]')?.href.startsWith('data:image/svg+xml')`));
    });

    await step('редкого нет: закладок, статистики, «Последних действий», инструмента «Удалить»', async () => {
      const text = await page.eval('document.body.innerText');
      for (const gone of ['Закладки', 'Статистика', 'Последние действия']) {
        assert.ok(!text.includes(gone), `на экране осталось «${gone}»`);
      }
      const deleteTool = await page.eval(
        `[...document.querySelectorAll('button')].some((b) => (b.getAttribute('title') ?? '').startsWith('Удалить (D)'))`
      );
      assert.ok(!deleteTool, 'осталась кнопка инструмента «Удалить»');
      await shot('editor-panels');
    });

    await step('в панелях нет эмодзи', async () => {
      await click('Диагностика');
      await click('Маршрут');
      await click('Корпус А');
      await click('Этаж 1');
      const pictographs = await page.eval(`[...new Set(document.body.innerText.match(/\\p{Extended_Pictographic}/gu) ?? [])]`);
      assert.deepEqual(pictographs, [], `эмодзи на экране: ${pictographs.join(' ')}`);

      await click('Поиск (Ctrl+F)');
      const inSearch = await page.eval(`[...new Set(document.body.innerText.match(/\\p{Extended_Pictographic}/gu) ?? [])]`);
      assert.deepEqual(inSearch, [], `эмодзи в поиске: ${inSearch.join(' ')}`);
    });
  },
};
