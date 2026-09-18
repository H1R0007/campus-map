import { strict as assert } from 'node:assert';
import { editorHelpers } from '../editor.mjs';

/**
 * Редактор: проверка маршрута не мешает разметке.
 *
 * Прежде показанный маршрут каждые доли секунды сам переключал план — метка
 * шла по этажам, и работать было невозможно даже со скрытой панелью. Теперь
 * метка идёт, только пока панель открыта, а карту за собой ведёт лишь с явной
 * галочкой, которую снимает любое переключение плана человеком.
 */
export default {
  app: 'editor',
  name: 'редактор: проверка маршрута',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const floorOf = async () => (await e.place()).match(/Этаж (-?\d+)/)?.[1] ?? null;

    /** Где сейчас метка, идущая по маршруту, и есть ли линия маршрута. */
    const marker = () =>
      page.eval(`(() => {
        const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')];
        const dot = paths.find((p) => p.getAttribute('fill') === '#8b5cf6' && p.getAttribute('stroke') === '#ffffff');
        const line = paths.some((p) => p.getAttribute('stroke') === '#8b5cf6' && p.getAttribute('stroke-dasharray') === '10 6');
        if (!dot) return { at: null, line };
        const r = dot.getBoundingClientRect();
        return { at: Math.round(r.x) + ',' + Math.round(r.y), line };
      })()`);

    await step('маршрут строится щелчками по узлам', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      await e.press('Маршрут');

      const start = await e.nodePoint('a1_room101');
      await e.click(start.x, start.y);
      const finish = await e.nodePoint('a1_canteen');
      await e.click(finish.x, finish.y);

      await page.waitFor(`document.body.textContent.includes('точек')`);
      assert.match(await page.eval('document.body.textContent'), /\d+ точек/);
      await shot('editor-route');
    });

    await step('метка идёт по маршруту, пока открыта вкладка «Маршрут»', async () => {
      const first = await marker();
      assert.ok(first.at, 'метки маршрута нет');
      await page.sleep(1200);
      const second = await marker();
      assert.notEqual(second.at, first.at, 'метка стоит на месте');
    });

    await step('на другой вкладке метка стоит, а линия остаётся', async () => {
      await e.press('Свойства');
      await page.sleep(300);
      const first = await marker();
      assert.ok(first.line, 'линия маршрута пропала вместе с вкладкой');
      await page.sleep(1800);
      const second = await marker();
      assert.equal(second.at, first.at, 'метка идёт, хотя вкладка маршрута закрыта');
      assert.ok(second.line);
    });

    await step('маршрут через этажи не переключает план сам', async () => {
      await e.press('Маршрут');
      await e.press('Сброс');

      const start = await e.nodePoint('a1_room101');
      await e.click(start.x, start.y);
      await e.key('PageUp');
      assert.equal(await floorOf(), '2', 'этаж не переключился');

      const finish = await e.nodePoint('a2_room201');
      await e.click(finish.x, finish.y);
      await page.waitFor(`document.body.textContent.includes('точек')`);

      await e.key('PageDown');
      assert.equal(await floorOf(), '1');
      await page.sleep(2500);
      assert.equal(await floorOf(), '1', 'маршрут увёл карту на другой этаж');
    });

    await step('«вести карту за меткой» включается явно и снимается переключением плана', async () => {
      await e.toggleFilter('Вести карту за меткой');
      await page.waitFor(`document.querySelector('[data-status-place]')?.textContent.includes('Этаж 2')`, 8000);

      await e.key('PageDown');
      assert.equal(await floorOf(), '1');
      await page.sleep(2500);
      assert.equal(await floorOf(), '1', 'слежение не снялось после ручного переключения плана');
    });
  },
};
