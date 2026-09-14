import { strict as assert } from 'node:assert';
import { PANEL, SEARCH, viewerHelpers } from '../viewer.mjs';

const STORAGE_KEY = 'campus-map:recent-places';

/**
 * Навигатор: недавние места в пустом поиске, в том числе без доступа к
 * хранилищу браузера.
 */
export default {
  app: 'viewer',
  name: 'навигатор: недавние места',

  async run({ page, base, step }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    const recentInSearch = () =>
      page.eval(`(() => {
        const section = [...${SEARCH}.querySelectorAll('section')].find((s) => s.textContent.includes('Недавние'));
        return section ? [...section.querySelectorAll('li')].map((li) => li.innerText.split('\\n')[0]) : [];
      })()`);

    await step('без истории «Недавних» нет', async () => {
      await v.open('/');
      await page.eval(`localStorage.removeItem('${STORAGE_KEY}')`);
      await v.open('/');
      await v.click('Найти аудиторию или место');
      await page.waitFor(`!!${SEARCH}`);
      assert.deepEqual(await recentInSearch(), []);
    });

    await step('выбранное место выбирается из пустого поиска без набора', async () => {
      await v.typeSearch('библиотека');
      await v.chooseOption('Библиотека');
      await v.click('Закрыть карточку места');
      await v.click('Найти аудиторию или место');
      await page.waitFor(`!!${SEARCH}`);
      assert.deepEqual(await recentInSearch(), ['Библиотека']);
      await v.click('Библиотека', SEARCH);
      assert.equal(await v.heading(), 'Библиотека');
      assert.equal(await page.eval(`localStorage.getItem('${STORAGE_KEY}')`), '["b1_library"]');
    });

    await step('после перезагрузки у QR-кода недавнее место строит маршрут', async () => {
      await v.open('/?at=a1_entrance');
      await v.click('Куда вы хотите попасть?');
      await page.waitFor(`!!${SEARCH}`);
      await v.click('Библиотека', SEARCH);
      await page.waitFor(`${PANEL}.textContent.includes('Маршрут ·')`);
      assert.equal(new URL(await v.href()).searchParams.get('to'), 'b1_library');
    });

    await step('раскрытая панель показывает недавние, «Очистить» стирает', async () => {
      await v.open('/');
      await v.click('Развернуть панель');
      assert.ok((await v.panelText()).includes('Библиотека'));
      await v.click('Очистить недавние места', PANEL);
      assert.ok(!(await v.panelText()).includes('Недавние'));
      assert.equal(await page.eval(`localStorage.getItem('${STORAGE_KEY}')`), '[]');
    });

    await step('хранилище недоступно — поиск работает, недавние живут во вкладке', async () => {
      const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `Storage.prototype.getItem = () => { throw new DOMException('запрет', 'SecurityError'); };
                 Storage.prototype.setItem = () => { throw new DOMException('запрет', 'SecurityError'); };`,
      });
      try {
        await v.open('/');
        await v.click('Найти аудиторию или место');
        await v.typeSearch('305');
        await v.chooseOption('А-305');
        await v.click('Закрыть карточку места');
        await v.click('Найти аудиторию или место');
        await page.waitFor(`!!${SEARCH}`);
        assert.deepEqual(await recentInSearch(), ['А-305']);
      } finally {
        await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      }
    });
  },
};
