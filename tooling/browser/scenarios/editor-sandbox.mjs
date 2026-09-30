import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: учебная копия (запись 55).
 *
 * Копия — отдельный каталог с данными: в ней работает всё, включая
 * сохранение, а настоящие данные не меняются. Несохранённая работа при
 * переходе туда и обратно не теряется и не перепутывается: у каждых данных
 * свой черновик. Сценарий работает на копии `data/` со своим сервером и
 * своим каталогом учебной копии.
 */
export default {
  app: 'editor',
  name: 'редактор: учебная копия',
  isolatedData: true,

  async run({ page, base, step, shot, dataDir, sandboxDir }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const graphFile = (root) => path.join(root, 'buildings', 'building_a', 'floors', '1', 'graph.json');
    const sandboxData = path.join(sandboxDir, 'data');
    const realGraph = readFileSync(graphFile(dataDir), 'utf8');
    const dialogText = () => page.eval(`[...document.querySelectorAll('[role="dialog"]')].map((d) => d.textContent).join(' | ')`);
    const banner = () => page.eval(`document.querySelector('.editor-sandbox-banner')?.textContent ?? ''`);
    const waitLoaded = () => page.waitFor(`document.querySelectorAll('path[data-node-id]').length > 0`, 20_000);
    let added = null;

    await step('несохранённая правка, вход в копию: окно объясняет, что будет', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      const node = await e.nodePoint('a1_room101');
      await e.click(node.x, node.y);
      for (let i = 0; i < 3; i++) await e.key('ArrowRight');
      assert.match(await e.status(), /Изменено/);

      await e.press('Учебная копия');
      const text = await dialogText();
      assert.match(text, /настоящие данные и навигатор не меняются/);
      assert.match(text, /Несохранённые правки останутся в черновике/);
      await shot('editor-sandbox-dialog');

      page.dialogs.length = 0;
      await e.press('Открыть копию');
      await page.waitFor(`location.search.includes('space=sandbox')`, 10_000);
      await waitLoaded();
      assert.ok(!page.dialogs.includes('beforeunload'), 'браузер спросил «Покинуть сайт?», хотя черновик записан');
      assert.ok(existsSync(graphFile(sandboxData)), 'копия данных не создана');
    });

    await step('в копии — полоса и своё название вкладки, черновик настоящих данных не предлагается', async () => {
      assert.match(await banner(), /Учебная копия/);
      assert.match(await page.eval('document.title'), /^Учебная копия/);
      await page.sleep(500);
      assert.doesNotMatch(await dialogText(), /несохранённая работа/i, 'в копии предложен черновик настоящих данных');
    });

    await step('«Сохранить» пишет в копию, настоящие данные не меняются', async () => {
      await e.openFloor('Корпус А', 1);
      const before = new Set(await e.nodeIds());
      await e.key('n');
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y);
      added = (await e.nodeIds()).find((id) => !before.has(id));
      assert.ok(added, 'точка не поставлена');

      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено в учебную копию')`, 8000);
      const saved = JSON.parse(readFileSync(graphFile(sandboxData), 'utf8'));
      assert.ok(saved.nodes.some((node) => node.id === added), 'точка не записана в копию');
      assert.equal(readFileSync(graphFile(dataDir), 'utf8'), realGraph, 'изменились настоящие данные');
      await shot('editor-sandbox');
    });

    await step('выход из копии возвращает настоящие данные и их черновик', async () => {
      const node = await e.nodePoint('a1_room102');
      await e.click(node.x, node.y);
      await e.key('ArrowLeft');
      assert.match(await e.status(), /Изменено/);

      page.dialogs.length = 0;
      await e.press('Выйти из копии');
      await page.waitFor(`!location.search.includes('space=sandbox')`, 10_000);
      await page.waitFor(`document.querySelectorAll('[role="dialog"]').length > 0`, 10_000);
      assert.ok(!page.dialogs.includes('beforeunload'), 'браузер спросил «Покинуть сайт?» при выходе из копии');
      assert.equal(await banner(), '', 'полоса копии осталась');
      assert.match(await dialogText(), /несохранённая работа/i, 'черновик настоящих данных потерян');
      await e.press('Отбросить');

      await e.openFloor('Корпус А', 1);
      assert.ok(!(await e.nodeIds()).includes(added), 'точка из копии попала в настоящие данные');
    });

    await step('обратно в копию — её черновик; «Начать заново» возвращает копию к настоящим данным', async () => {
      await e.press('Учебная копия');
      assert.match(await dialogText(), /Начать с чистой копии/);
      await e.press('Продолжить в копии');
      await page.waitFor(`location.search.includes('space=sandbox')`, 10_000);
      await page.waitFor(`[...document.querySelectorAll('[role="dialog"]')].some((d) => /несохранённая работа/i.test(d.textContent))`, 10_000);
      await e.press('Отбросить');

      await e.press('Начать заново');
      assert.match(await dialogText(), /пробы в копии пропадут/);
      const dialogs = [...(await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].map((b) => b.textContent.trim())`))];
      assert.ok(dialogs.includes('Начать заново'));
      await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Начать заново').click()`);
      await page.sleep(1500);
      await waitLoaded();
      assert.equal(readFileSync(graphFile(sandboxData), 'utf8'), realGraph, 'копия не вернулась к настоящим данным');
      assert.match(await banner(), /Учебная копия/);
    });
  },
};
