import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: размытие лиц и надписей на фото точки (запись 88).
 *
 * Образец «снимка с телефона» несёт табличку с надписью «ТЕСТ» красными
 * буквами — на ней проверяется размытие: красных букв в табличке после него
 * не остаётся ни в окне, ни в сохранённом фото, ни в маленьком. Красная
 * полоса над табличкой рамкой не накрыта и остаётся красной.
 *
 * Путь разметчика: фото уже в общей папке; окно размытия берёт исходный
 * снимок из `data-sources/`; рамка рисуется мышью, двигается стрелкой,
 * растягивается за угол; клавиши окна не уходят на карту; Escape не бросает
 * рамки без вопроса; «Применить» заменяет фото, «Сохранить» пишет рамку в
 * данные и убирает прежнее фото из общей папки. Без исходного снимка
 * прежнее размытие закреплено.
 */

const PHONE_PHOTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/photos/snimok-bokom.jpg');
const POINT = 'a1_corridor_8';
const CARD = `document.querySelector('[aria-label="Свойства точки"]')`;
const DIALOG = `document.querySelector('[data-blur-dialog]')`;

/** Табличка «ТЕСТ» на снимке стоя 600 × 800: белая, с красными буквами. */
const SIGN = { x: 30 / 600, y: 120 / 800, width: 180 / 600, height: 70 / 800 };
/** Рамка с запасом вокруг таблички. */
const FRAME = { from: { x: 0.035, y: 0.135 }, to: { x: 0.37, y: 0.255 } };

/** Сколько точек красных букв в пикселях RGBA. */
const RED_TEXT = `((data) => { let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i] > 140 && data[i + 1] < 90 && data[i + 2] < 90) n += 1; return n; })`;

/** Красные буквы в табличке на холсте; `source` — выражение `{ canvas, context }`. */
const signRedText = (source) => `((target) => {
  const x = Math.round(${SIGN.x} * target.canvas.width);
  const y = Math.round(${SIGN.y} * target.canvas.height);
  const width = Math.round(${SIGN.width} * target.canvas.width);
  const height = Math.round(${SIGN.height} * target.canvas.height);
  return ${RED_TEXT}(target.context.getImageData(x, y, width, height).data);
})(${source})`;

export default {
  app: 'editor',
  name: 'редактор: размытие лиц и надписей',
  isolatedData: true,

  async run({ page, base, step, shot, dataDir, sourcesDir, photosDir }) {
    await page.viewport(1600, 1000, 1);
    const e = editorHelpers(page, base);
    const graphPath = path.join(dataDir, 'buildings', 'building_a', 'floors', '1', 'graph.json');
    const savedPhoto = () => JSON.parse(readFileSync(graphPath, 'utf8')).nodes.find((node) => node.id === POINT).photos[0];
    const small = (file) => file.replace(/\.([a-z]+)$/, '.small.$1');

    /** Точка — через «Проверка → Фото»: развилка без ориентира. */
    const openPoint = async () => {
      await e.mode('Проверка');
      await e.press('Фото');
      await page.waitFor(`!!document.querySelector('[data-coverage-node=${JSON.stringify(POINT)}]')`);
      await page.eval(`document.querySelector('[data-coverage-node=${JSON.stringify(POINT)}]').click()`);
      await page.waitFor(`${CARD}?.dataset.nodeId === ${JSON.stringify(POINT)}`);
    };
    const openBlur = async () => {
      await e.press('Размыть лица и надписи на фото 1');
      await page.waitFor(`!!document.querySelector('[data-blur-base]') || !!${DIALOG}?.querySelector('[role="alert"]')`, 20_000);
      await page.sleep(400);
    };
    const stageRedText = () =>
      page.eval(signRedText(`(() => { const canvas = document.querySelector('[data-blur-stage] canvas'); return { canvas, context: canvas.getContext('2d') }; })()`));
    const fileRedText = (name) =>
      page.eval(`(async () => {
        const bitmap = await createImageBitmap(await (await fetch('/data/photos/${name}', { cache: 'no-store' })).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const top = [...context.getImageData(bitmap.width / 2, 10, 1, 1).data];
        return { red: ${signRedText('{ canvas, context }')}, top };
      })()`);
    const stagePoint = (fx, fy) =>
      page.eval(`(() => { const r = document.querySelector('[data-blur-stage]').getBoundingClientRect(); return { x: r.x + ${fx} * r.width, y: r.y + ${fy} * r.height }; })()`);
    const frames = () =>
      page.eval(`[...${DIALOG}.querySelectorAll('[data-frame]')].map((f) => ({
        left: parseFloat(f.style.left), top: parseFloat(f.style.top), width: parseFloat(f.style.width), height: parseFloat(f.style.height),
        locked: f.dataset.locked === 'true', selected: f.dataset.selected === 'true',
      }))`);
    const dialogText = () => page.eval(`${DIALOG}?.textContent ?? null`);

    let before;
    let original;

    await step('фото с табличкой — в общей папке, исходный снимок — у разработчика', async () => {
      await e.open();
      await openPoint();
      const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: true });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-photos-section] input[type=file]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: [PHONE_PHOTO] });
      await page.waitFor(`!!document.querySelector('.editor-photos__done')`, 20_000);
      assert.match(await page.eval(`document.querySelector('.editor-photos__done').textContent`), /«Размыть…» у фото/);
      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено')`, 15_000);
      original = savedPhoto();
      assert.ok(existsSync(path.join(photosDir, original.file)) && existsSync(path.join(sourcesDir, original.source)));
      assert.ok((await fileRedText(original.file)).red > 300, 'в табличке сохранённого фото нет красных букв');
    });

    await step('окно размытия: исходный снимок с диска, фокус на фото, табличка читается', async () => {
      // Память редактора чиста: исходник берётся из data-sources/.
      await e.open();
      await openPoint();
      await openBlur();
      assert.equal(await page.eval(`document.querySelector('[data-blur-base]')?.dataset.blurBase`), 'original', await dialogText());
      assert.ok(await page.eval(`!!document.activeElement?.closest('[data-blur-stage]')`), 'фокус не на фото');
      assert.match(await dialogText(), /Пока ни одной/);
      before = await stageRedText();
      assert.ok(before > 200, `букв в табличке не видно: ${before}`);
    });

    await step('рамка мышью: место размыто сразу, рамка в списке', async () => {
      const from = await stagePoint(FRAME.from.x, FRAME.from.y);
      const to = await stagePoint(FRAME.to.x, FRAME.to.y);
      await e.drag(from.x, from.y, to.x, to.y);
      const list = await frames();
      assert.equal(list.length, 1, JSON.stringify(list));
      assert.ok(list[0].selected);
      assert.ok(Math.abs(list[0].left - FRAME.from.x * 100) < 1 && Math.abs(list[0].width - (FRAME.to.x - FRAME.from.x) * 100) < 1, JSON.stringify(list));
      const after = await stageRedText();
      assert.ok(after < before * 0.03, `табличка читается: ${after} из ${before}`);
      assert.match(await dialogText(), /Рамка 1/);
      await shot('editor-blur');
    });

    await step('клавиши окна не уходят на карту: Delete убирает рамку, Ctrl+Z возвращает', async () => {
      await e.key('Delete');
      assert.equal((await frames()).length, 0);
      assert.ok(await page.eval(`!!document.querySelector('path[data-node-id=${JSON.stringify(POINT)}]')`), 'Delete удалил точку на карте');
      await e.key('z', { modifiers: MOD.ctrl });
      assert.equal((await frames()).length, 1, 'Ctrl+Z окна не вернул рамку');
      // Отмена карты не сработала: фото у точки осталось.
      assert.equal(await page.eval(`${CARD}.querySelectorAll('[data-photo-file]').length`), 1);
      assert.equal(await page.eval(`${CARD}?.dataset.nodeId`), POINT);
    });

    await step('стрелка двигает рамку, угол растягивает', async () => {
      await page.eval(`${DIALOG}.querySelector('.editor-blur__pick').click()`);
      await page.eval(`document.querySelector('[data-blur-stage]').focus()`);
      const [start] = await frames();
      await e.key('ArrowRight', { modifiers: MOD.shift });
      const [moved] = await frames();
      assert.ok(Math.abs(moved.left - start.left - 5) < 0.01, `${start.left} → ${moved.left}`);
      await e.key('ArrowLeft', { modifiers: MOD.shift });

      const corner = await page.eval(`(() => { const r = ${DIALOG}.querySelector('.editor-blur__corner--se').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await e.drag(corner.x, corner.y, corner.x + 30, corner.y + 20);
      const [resized] = await frames();
      assert.ok(resized.width > start.width + 1 && resized.height > start.height + 1, `${JSON.stringify(start)} → ${JSON.stringify(resized)}`);
      assert.ok(Math.abs(resized.left - start.left) < 0.01, 'противоположный угол сдвинулся');
    });

    await step('Escape не бросает рамки без вопроса', async () => {
      await e.key('Escape');
      assert.match(await dialogText(), /Рамки не применены\. Закрыть без размытия\?/);
      await e.key('Escape');
      assert.ok(await page.eval(`!!${DIALOG}`), 'окно закрылось');
      assert.doesNotMatch(await dialogText(), /Закрыть без размытия\?/);
    });

    await step('«Показать без размытия» — как было, и обратно', async () => {
      await page.eval(`${DIALOG}.querySelector('input[type=checkbox]').click()`);
      await page.sleep(300);
      assert.ok((await stageRedText()) > before * 0.8, 'без размытия табличка не видна');
      await page.eval(`${DIALOG}.querySelector('input[type=checkbox]').click()`);
      await page.sleep(300);
      assert.ok((await stageRedText()) < before * 0.03);
    });

    await step('«Применить»: фото точки заменено размытым', async () => {
      await e.press('Применить');
      await page.waitFor(`!${DIALOG}`, 20_000);
      const done = await page.eval(`document.querySelector('.editor-photos__done')?.textContent ?? ''`);
      assert.match(done, /Размыто участков: 1\..*уберётся из общей папки/, done);
      const file = await page.eval(`${CARD}.querySelector('[data-photo-file]').dataset.photoFile`);
      assert.notEqual(file, original.file);
      assert.equal(await page.eval(`${CARD}.querySelector('[data-photo-blurred]')?.dataset.photoBlurred`), '1');
    });

    await step('«Сохранить»: рамка в данных, прежнее фото ушло из общей папки, букв не прочесть', async () => {
      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено')`, 15_000);
      assert.match(await page.eval(`document.querySelector('.editor-notice').textContent`), /фото без размытия убрано из общей папки: 1/);

      const blurred = savedPhoto();
      assert.notEqual(blurred.file, original.file);
      assert.equal(blurred.source, original.source, 'исходный снимок должен остаться тем же');
      assert.deepEqual([blurred.width, blurred.height], [original.width, original.height]);
      assert.equal(blurred.blur.length, 1);
      const [region] = blurred.blur;
      assert.ok(region.x <= SIGN.x && region.y <= SIGN.y, JSON.stringify(region));
      assert.ok(region.x + region.width >= SIGN.x + SIGN.width && region.y + region.height >= SIGN.y + SIGN.height, JSON.stringify(region));

      for (const name of [original.file, small(original.file)]) assert.equal(existsSync(path.join(photosDir, name)), false, `${name} осталось в общей папке`);
      for (const name of [blurred.file, small(blurred.file)]) {
        assert.ok(existsSync(path.join(photosDir, name)), `${name} нет в общей папке`);
        const { red, top } = await fileRedText(name);
        assert.ok(red < 10, `в ${name} табличка читается: ${red}`);
        assert.ok(top[0] > 150 && top[1] < 80, `полоса над табличкой — не красная: ${top}`);
      }
      assert.ok(existsSync(path.join(sourcesDir, original.source)), 'исходный снимок пропал');
    });

    await step('рамку можно поправить потом: окно открывается с ней', async () => {
      await e.open();
      await openPoint();
      await openBlur();
      const list = await frames();
      assert.equal(list.length, 1);
      assert.equal(list[0].locked, false);
      assert.ok(await page.eval(`!!${DIALOG}.querySelector('[aria-label="Убрать рамку 1"]')`));
      // Ничего не меняли — Escape закрывает сразу.
      await e.key('Escape');
      assert.equal(await page.eval(`!!${DIALOG}`), false);
    });

    await step('без исходного снимка: прежнее размытие закреплено, фото не теряет его', async () => {
      rmSync(path.join(sourcesDir, original.source));
      await e.open();
      await openPoint();
      await openBlur();
      assert.equal(await page.eval(`document.querySelector('[data-blur-base]')?.dataset.blurBase`), 'photo');
      const list = await frames();
      assert.equal(list.length, 1);
      assert.equal(list[0].locked, true);
      assert.match(await dialogText(), /уже размыта/);
      assert.equal(await page.eval(`!!${DIALOG}.querySelector('[aria-label="Убрать рамку 1"]')`), false);
      assert.ok((await stageRedText()) < 10, 'размытое фото показано без размытия');
      await e.key('Escape');
    });
  },
};
