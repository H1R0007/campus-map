import { strict as assert } from 'node:assert';

/**
 * Редактор: плавающие панели не перекрывают друг друга, в интерфейсе нет
 * эмодзи, у вкладки есть свой значок.
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
    /** Прямоугольник ближайшего блока с рамкой панели, содержащего текст. */
    const rectOf = (text, selector) =>
      page.eval(`(() => {
        const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)}));
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      })()`);
    const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

    await step('у вкладки свой значок, запроса favicon.ico с ошибкой нет', async () => {
      await page.goto(`${base}/`);
      await page.waitFor(`document.body.innerText.includes('Слои') && document.querySelectorAll('.leaflet-overlay-pane path').length > 0`, 20_000);
      await page.sleep(500);
      assert.ok(await page.eval(`document.querySelector('link[rel="icon"]')?.href.startsWith('data:image/svg+xml')`));
    });

    await step('раскрытые «Фильтры» не закрывают «Закладки», а сдвигают их вниз', async () => {
      await click('Фильтры');
      const filters = await rectOf('Подписи алиасов', 'div.w-72');
      const bookmarksButton = await rectOf('Закладки', 'button');
      assert.ok(filters && bookmarksButton, 'обе панели на экране');
      assert.ok(!intersects(filters, bookmarksButton), `перекрытие: ${JSON.stringify({ filters, bookmarksButton })}`);

      await click('Закладки');
      const bookmarks = await rectOf('Нет закладок', 'div.w-72');
      assert.ok(bookmarks, 'панель закладок открылась');
      assert.ok(bookmarks.top >= filters.bottom, 'закладки ниже фильтров');
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
