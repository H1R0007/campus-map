import { strict as assert } from 'node:assert';

/**
 * Редактор: переходы на другой план — отметкой у узла, а не линией через этаж;
 * цвет узла, от которого строится переход.
 *
 * Написан под тестовый `data/`: в корпусе А лестница через три этажа, лифт
 * между первым и вторым, переход в корпус Б на втором.
 */
export default {
  app: 'editor',
  name: 'редактор: переходы на другой план',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);

    const click = async (label) => {
      const clicked = await page.eval(`(() => {
        const label = ${JSON.stringify(label)};
        const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label || b.getAttribute('title') === label);
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`нет кнопки «${label}»`);
      await page.sleep(600);
    };
    const targets = () =>
      page.eval(`[...document.querySelectorAll('.transition-target-tooltip .transition-target')].map((row) => row.textContent.trim())`);
    const dashedLines = () =>
      page.eval(`[...document.querySelectorAll('.leaflet-overlay-pane path')].filter((p) => p.getAttribute('stroke-dasharray') === '8 8').length`);

    await step('кампус и этаж 2: отметки планов назначения, пунктиров через план нет', async () => {
      await page.goto(`${base}/`);
      await page.waitFor(`document.body.innerText.includes('Слои') && document.querySelectorAll('.leaflet-overlay-pane path').length > 0`, 20_000);
      await page.sleep(800);
      assert.ok((await targets()).includes('Корпус А, этаж 1'));
      assert.equal(await dashedLines(), 0);

      await click('Корпус А');
      await click('Этаж 2');
      const floor2 = await targets();
      for (const expected of ['↓ этаж 1', '↑ этаж 3', 'Корпус Б, этаж 2']) assert.ok(floor2.includes(expected), expected);
      assert.equal(await dashedLines(), 0);
      await shot('editor-floor2');
    });

    await step('фильтр «Переходы» прячет отметки', async () => {
      await click('Фильтры');
      const toggle = `[...document.querySelectorAll('label')].find((l) => l.textContent.includes('Переходы')).querySelector('input')`;
      await page.eval(`${toggle}.click()`);
      await page.sleep(400);
      assert.deepEqual(await targets(), []);
      await page.eval(`${toggle}.click()`);
      await page.sleep(300);
    });

    await step('узел начала перехода — цветом типа, обводка — акцентом темы', async () => {
      await click('Переход (T)');
      const nodes = await page.eval(`[...document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')]
        .filter((p) => p.getAttribute('fill-opacity') === '0.9')
        .map((p) => { const r = p.getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2; return document.elementFromPoint(x, y) === p ? [x, y] : null; })
        .filter(Boolean)`);
      assert.ok(nodes.length > 0, 'узел, не закрытый панелями');
      await page.tap(nodes[0][0], nodes[0][1]);
      const colored = await page.eval(`[...document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')]
        .map((p) => (p.getAttribute('fill') + '|' + p.getAttribute('stroke')).toLowerCase())
        .filter((f) => ['#b45309', '#15803d', '#6d28d9', '#0e7490'].some((c) => f.startsWith(c)))`);
      assert.equal(colored.length, 1, `окрашенные узлы: ${JSON.stringify(colored)}`);
      assert.ok(colored[0].endsWith('#e94560'), 'обводка — акцент темы');
    });
  },
};
