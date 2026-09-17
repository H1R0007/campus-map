import { strict as assert } from 'node:assert';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: переходы между планами — как они создаются и как показаны.
 *
 * Переход на другой план отмечается у узла, а не рисуется линией через этаж.
 * Создаётся щелчками, между которыми можно сменить этаж: прежде смена этажа
 * сбрасывала начатый переход, и лестницу между этажами нельзя было создать
 * вовсе.
 *
 * Написан под тестовый `data/`: в корпусе А лестница через три этажа, лифт
 * между первым и вторым, переход в корпус Б на втором.
 */
export default {
  app: 'editor',
  name: 'редактор: переходы на другой план',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);

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

    await step('лестница между этажами: щелчок, смена этажа, щелчок', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      await e.press('Переход (T)');
      await e.press('Лестница');

      const start = await e.nodePoint('a1_room104');
      await e.click(start.x, start.y);
      assert.match(await e.notice(), /Лестница от «А-104»/, 'редактор не сказал, что делать дальше');

      await e.press('Этаж 2');
      assert.match(await e.status(), /Этаж 2/);
      assert.match(await e.status(), /А-104/, 'после смены этажа начатый переход не потерялся');

      const finish = await e.nodePoint('a2_room204');
      await e.click(finish.x, finish.y);
      assert.match(await e.notice(), /Лестница: «А-104» — «А-204»/, 'переход не создан');
      assert.ok((await e.transitionKeys()).includes('a1_room104|a2_room204'), 'отметка нового перехода не появилась');
      assert.ok((await e.transitionTargets()).includes('↓ этаж 1'), 'отметка не говорит, куда ведёт переход');
      await shot('editor-new-transition');

      await e.key('z', { modifiers: MOD.ctrl });
      assert.ok(!(await e.transitionKeys()).includes('a1_room104|a2_room204'), 'отмена не убрала переход');
    });

    await step('переход между узлами одного плана редактор объясняет', async () => {
      const a = await e.nodePoint('a2_room204');
      await e.click(a.x, a.y);
      const b = await e.nodePoint('a2_room205');
      await e.click(b.x, b.y);
      assert.match(await e.notice(), /одном плане/, `сообщение: ${await e.notice()}`);
      assert.ok(!(await e.transitionKeys()).includes('a2_room204|a2_room205'), 'переход внутри плана всё же создан');
      await e.key('Escape');
    });
  },
};
