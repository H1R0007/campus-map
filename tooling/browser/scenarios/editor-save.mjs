import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: сохранение разметки и черновик несохранённого.
 *
 * Сценарий работает на копии `data/` и со своим dev-сервером
 * (`isolatedData`): он сохраняет по-настоящему и читает файлы с диска.
 * Прежде единственным способом сохранить был архив, который нужно было
 * вручную распаковать, а закрытая вкладка стирала несохранённое без вопроса.
 */
export default {
  app: 'editor',
  name: 'редактор: сохранение и черновик',
  isolatedData: true,
  // Отказ сохранить поверх чужой правки — ожидаемый ответ сервера, а не сбой
  // страницы: редактор объясняет его сообщением.
  ignoreProblems: [/status of 409/],

  async run({ page, base, step, shot, dataDir }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const graphPath = path.join(dataDir, 'buildings', 'building_a', 'floors', '1', 'graph.json');
    const graph = () => JSON.parse(readFileSync(graphPath, 'utf8'));
    const aliasesPath = path.join(dataDir, 'aliases.json');
    const aliasOf = (id) => {
      const file = JSON.parse(readFileSync(aliasesPath, 'utf8'));
      return (file.aliases ?? file).find((entry) => entry.id === id) ?? null;
    };

    await step('до сохранения файл на диске не меняется', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      assert.match(await e.status(), /Сохранено/);

      const before = graph().nodes.length;
      await e.key('n');
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y);
      assert.match(await e.status(), /Изменено/);
      assert.equal(graph().nodes.length, before, 'узел попал в файл до сохранения');
    });

    await step('Ctrl+S пишет правки в каталог данных', async () => {
      const before = graph().nodes.length;
      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено в data/')`, 8000);

      assert.equal(graph().nodes.length, before + 1, 'узел не записан в файл');
      assert.match(await e.status(), /Сохранено/, 'после сохранения правок быть не должно');
      await shot('editor-save');
    });

    await step('сохранённое читается редактором обратно', async () => {
      const saved = graph().nodes.at(-1);
      await e.open();
      await e.openFloor('Корпус А', 1);
      assert.ok((await e.nodeIds()).includes(saved.id), 'сохранённого узла нет после перезагрузки');
      assert.match(await e.status(), /Сохранено/);
      assert.equal(await page.eval(`document.querySelectorAll('[role="dialog"]').length`), 0, 'черновик предложен зря');
    });

    await step('несохранённая работа переживает перезагрузку страницы', async () => {
      const node = await e.nodePoint('a1_room101');
      await e.click(node.x, node.y);
      for (let i = 0; i < 5; i++) await e.key('ArrowRight');
      assert.match(await e.status(), /Изменено/);
      // Черновик пишется с задержкой после последней правки.
      await page.sleep(2500);

      page.dialogs.length = 0;
      await e.open();
      assert.ok(
        page.dialogs.includes('beforeunload'),
        'браузер не предупредил об уходе со страницы с несохранёнными правками'
      );
      await page.waitFor(`document.querySelectorAll('[role="dialog"]').length > 0`, 8000);
      assert.match(await page.eval(`document.querySelector('[role="dialog"]').textContent`), /несохранённая работа/i);
      await shot('editor-draft');

      // Окно черновика — модальное: фокус внутри и Tab из него не уходит.
      const insideDialog = () =>
        page.eval(`document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false`);
      assert.ok(await insideDialog(), 'фокус не в окне черновика');
      for (let i = 0; i < 3; i++) {
        await e.key('Tab', { keyCode: 9 });
        assert.ok(await insideDialog(), 'Tab увёл фокус из окна черновика');
      }

      await e.press('Восстановить');
      await page.sleep(500);
      assert.match(await e.status(), /Изменено/, 'восстановленная работа должна считаться несохранённой');

      await e.openFloor('Корпус А', 1);
      await e.press('Сохранить');
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено в data/')`, 8000);
      const x = graph().nodes.find((n) => n.id === 'a1_room101').x;
      assert.equal(x, 125, 'сдвинутый узел сохранён не на своём месте');
    });

    await step('вид места доходит до файла названий — иначе навигатор его не увидит', async () => {
      // Быстрые кнопки навигатора («ближайший туалет») работают по виду места
      // в aliases.json. Редактор до фазы 10 умел только сохранять то, что
      // вписано в файл руками.
      const room = await e.nodePoint('a1_room102');
      await e.click(room.x, room.y);
      assert.equal(aliasOf('a1_room102')?.category, undefined, 'у аудитории уже стоит вид места');

      const chip = await e.panelPoint('[aria-label="Вид места"] button[aria-pressed="false"]');
      await e.click(chip.x, chip.y);
      await e.press('Сохранить');
      await page.waitFor(`document.body.innerText.includes('Сохранено')`, 8000);
      assert.ok(
        ['toilet', 'food', 'cloakroom', 'exit'].includes(aliasOf('a1_room102')?.category),
        `вид места не попал в файл: ${JSON.stringify(aliasOf('a1_room102'))}`
      );

      await e.key('z', { modifiers: MOD.ctrl });
      await e.press('Сохранить');
      await page.waitFor(`document.body.innerText.includes('Сохранено')`, 8000);
      assert.equal(aliasOf('a1_room102')?.category, undefined, 'отмена не убрала вид места из файла');
    });

    await step('чужую правку на диске редактор не затирает молча', async () => {
      // Файл меняет кто-то другой: соседняя вкладка, git, другой разметчик.
      const onDisk = graph();
      onDisk.nodes.push({ id: 'a1_from_disk', x: 10, y: 10, neighbors: [], isPortal: false });
      writeFileSync(graphPath, `${JSON.stringify(onDisk, null, 2)}\n`);

      const node = await e.nodePoint('a1_room101');
      await e.click(node.x, node.y);
      await e.key('ArrowLeft');
      await e.press('Сохранить');
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('изменились')`, 8000);

      assert.ok(
        graph().nodes.some((n) => n.id === 'a1_from_disk'),
        'сохранение затёрло правку, сделанную на диске'
      );
      assert.match(await e.status(), /Изменено/, 'после отказа правки остаются несохранёнными');
      await e.key('z', { modifiers: MOD.ctrl });
    });

    await step('после сохранения черновик не предлагается', async () => {
      await e.open();
      await page.sleep(800);
      assert.equal(await page.eval(`document.querySelectorAll('[role="dialog"]').length`), 0, 'черновик остался после сохранения');
    });
  },
};
