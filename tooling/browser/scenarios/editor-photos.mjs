import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: ориентир и фото точки (запись 87).
 *
 * Путь разметчика целиком: пустой раздел ориентира объясняет, зачем он, и
 * сразу даёт поле; название превращается в готовое предложение студента;
 * фраза правится; английский перевод; проходы через точку с исправлением
 * одного; снимок «с телефона» — лежит боком, в метаданных координаты и
 * модель — сжимается, встаёт прямо и сохраняется без метаданных в общую
 * папку фото; Ctrl+Z снимает правку карточки разом; «Проверка → Фото»
 * ведёт к точке.
 *
 * Работает на копии `data/` (`isolatedData`) со своей общей папкой фото.
 * Точка — `a1_corridor_8`: развилка у холла главного входа корпуса А, без
 * ориентира.
 */

const PHONE_PHOTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/photos/snimok-bokom.jpg');
const POINT = 'a1_corridor_8';

const CARD = `document.querySelector('[aria-label="Свойства точки"]')`;
const sentences = (page) => page.eval(`[...${CARD}.querySelectorAll('[data-landmark-sentence]')].map((p) => p.textContent)`);

export default {
  app: 'editor',
  name: 'редактор: ориентир и фото точки',
  isolatedData: true,

  async run({ page, base, step, shot, dataDir, sourcesDir, photosDir }) {
    await page.viewport(1600, 1000, 1);
    const e = editorHelpers(page, base);
    const graphPath = path.join(dataDir, 'buildings', 'building_a', 'floors', '1', 'graph.json');
    const savedPoint = () => JSON.parse(readFileSync(graphPath, 'utf8')).nodes.find((node) => node.id === POINT);

    const selectPoint = async () => {
      const point = await e.nodePoint(POINT, { allowCovered: true });
      await e.click(point.x, point.y);
      await page.waitFor(`${CARD}?.dataset.nodeId === ${JSON.stringify(POINT)}`);
    };
    /** Фокус в поле карточки по подписи для диктора. */
    const focusField = (label) =>
      page.eval(`(() => { const input = ${CARD}.querySelector('[aria-label=${JSON.stringify(label)}]'); input.focus(); input.select?.(); return !!input; })()`);

    await step('«Проверка → Фото»: развилка у холла — без ориентира, строка ведёт к точке', async () => {
      await e.open();
      await e.mode('Проверка');
      await e.press('Фото');
      const row = await page.eval(`!!document.querySelector('[data-coverage-node=${JSON.stringify(POINT)}]')`);
      assert.ok(row, 'развилки нет в списке «без ориентира»');
      await shot('editor-photo-coverage');
      await page.eval(`document.querySelector('[data-coverage-node=${JSON.stringify(POINT)}]').click()`);
      await page.waitFor(`${CARD}?.dataset.nodeId === ${JSON.stringify(POINT)}`);
      assert.match(await e.place(), /Корпус А.*этаж 1/i);
    });

    await step('пустой ориентир: объяснение и поле; название сразу видно предложением студента', async () => {
      const text = await page.eval(`${CARD}.querySelector('[data-landmark-section]').textContent`);
      assert.match(text, /Что видно у этой точки издалека/);
      await page.eval(`${CARD}.querySelector('[data-landmark-section] input').focus()`);
      await e.type('Турникеты');
      assert.match(await page.eval(`${CARD}.querySelector('[data-landmark-section]').textContent`), /«У турникетов поверните налево»/);
      await e.key('Enter');
      await page.waitFor(`!!${CARD}.querySelector('[aria-label="Название ориентира"]')`);
      assert.deepEqual(await sentences(page), ['«У турникетов поверните налево»']);
      await shot('editor-landmark');
    });

    await step('фраза правится прямо в строке, «Как предлагает редактор» возвращает догадку', async () => {
      await e.press('Изменить фразу');
      await page.eval(`(() => { const input = ${CARD}.querySelector('[aria-label="Фраза ориентира в шаге"]'); input.select(); })()`);
      await e.type('возле турникетов');
      await e.key('Enter');
      assert.deepEqual(await sentences(page), ['«Возле турникетов поверните налево»']);
      await e.press('Как предлагает редактор');
      assert.deepEqual(await sentences(page), ['«У турникетов поверните налево»']);
    });

    await step('по-английски: название — и фраза сама', async () => {
      await focusField('Название ориентира по-английски');
      await e.type('Turnstiles');
      await e.key('Enter');
      await page.waitFor(`${CARD}.querySelectorAll('[data-landmark-sentence]').length === 2`);
      assert.deepEqual(await sentences(page), ['«У турникетов поверните налево»', '«Turn left at the turnstiles»']);
    });

    await step('как скажет навигатор: каждый проход через точку, исправление одного прохода', async () => {
      const rows = await page.eval(`[...${CARD}.querySelectorAll('[data-passage]')].map((row) => ({
        key: row.dataset.passage,
        text: row.querySelector('.editor-passages__route').textContent,
        auto: row.querySelector('select').options[0].textContent,
      }))`);
      // Три связи — шесть проходов.
      assert.equal(rows.length, 6, JSON.stringify(rows));
      // Из холла на запад по коридору: шёл на север, запад слева.
      const fromHall = rows.find((row) => row.key === 'a1_hall>a1_corridor_7');
      assert.ok(fromHall, JSON.stringify(rows));
      assert.equal(fromHall.auto, 'налево (сам)');
      // Безымянные стороны названы ближайшим в них: со стороны холла — главный вход, по коридору — лифт.
      assert.equal(fromHall.text, '«Главный вход корпуса А» → лифт');

      await page.eval(`(() => {
        const select = ${CARD}.querySelector('[data-passage="a1_hall>a1_corridor_7"] select');
        select.value = 'straight';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await page.sleep(300);
      assert.match(await page.eval(`${CARD}.querySelector('[data-passage="a1_hall>a1_corridor_7"]').textContent`), /исправлено/);
    });

    await step('снимок с телефона: сжат, поставлен прямо, место съёмки не попало', async () => {
      const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: true });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-photos-section] input[type=file]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: [PHONE_PHOTO] });
      await page.waitFor(`!!document.querySelector('.editor-photos__done, [data-photos-section] .editor-field__problem')`, 20_000);
      const done = await page.eval(`document.querySelector('.editor-photos__done')?.textContent ?? document.querySelector('[data-photos-section] .editor-field__problem')?.textContent`);
      assert.match(done, /^Сжато: .*Место съёмки и модель телефона в фото не попали/, done);
      assert.equal(await page.eval(`${CARD}.querySelectorAll('[data-photo-file]').length`), 1);
      assert.match(await page.eval(`${CARD}.querySelector('.editor-photos__main')?.textContent ?? ''`), /Главное/);
      await page.eval(`${CARD}.querySelector('[data-photos-section]').scrollIntoView({ block: 'center' })`);
      await shot('editor-photo');
    });

    await step('«Сохранить»: ориентир с переводом и исправлением, фото — в общей папке, исходник — у разработчика', async () => {
      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено')`, 15_000);

      const saved = savedPoint();
      assert.deepEqual(saved.landmark, {
        name: 'Турникеты',
        at: 'у турникетов',
        translations: { en: { name: 'Turnstiles', at: 'at the turnstiles' } },
        turns: [{ from: 'a1_hall', to: 'a1_corridor_7', turn: 'straight' }],
      });
      assert.equal(saved.photos.length, 1);
      const [photo] = saved.photos;
      // Снимок лежал боком 800 × 600 с поворотом в метаданных — фото стоит: 600 × 800.
      assert.deepEqual([photo.width, photo.height], [600, 800]);
      assert.match(photo.file, /^[0-9a-f]{16}\.(webp|jpg)$/);

      const small = photo.file.replace(/\.([a-z]+)$/, '.small.$1');
      for (const name of [photo.file, small]) {
        const file = path.join(photosDir, name);
        assert.ok(existsSync(file), `нет ${name} в общей папке фото`);
        const bytes = readFileSync(file);
        assert.equal(bytes.includes('Exif'), false, `в ${name} остались метаданные`);
        assert.equal(bytes.includes('TEST PHONE'), false, `в ${name} осталась модель телефона`);
      }
      assert.equal(existsSync(path.join(dataDir, 'photos', photo.file)), false, 'фото легло в данные, а не в общую папку');
      // Исходный снимок — у разработчика, в исходниках, с метаданными как есть.
      assert.ok(photo.source && existsSync(path.join(sourcesDir, photo.source)), `исходника ${photo.source} нет`);
      assert.ok(readdirSync(photosDir).length >= 2);
    });

    await step('фото на сервере стоит прямо: красная полоса — сверху', async () => {
      const [photo] = savedPoint().photos;
      const top = await page.eval(`(async () => {
        const blob = await (await fetch('/data/photos/${photo.file}')).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const [r, g, b] = context.getImageData(bitmap.width / 2, 20, 1, 1).data;
        return { r, g, b };
      })()`);
      assert.ok(top.r > 150 && top.g < 80 && top.b < 100, `сверху не красное: ${JSON.stringify(top)}`);
    });

    await step('Ctrl+Z снимает правку карточки разом: ориентир и фото', async () => {
      // Правка карточки закрывается, когда выбор уходит с точки.
      await e.press('Снять выбор');
      await e.key('z', { modifiers: MOD.ctrl });
      await selectPoint();
      const text = await page.eval(`${CARD}.querySelector('[data-landmark-section]').textContent`);
      assert.match(text, /Что видно у этой точки издалека/, 'ориентир не снят отменой');
      assert.equal(await page.eval(`${CARD}.querySelectorAll('[data-photo-file]').length`), 0, 'фото не снято отменой');
      await e.key('y', { modifiers: MOD.ctrl });
      assert.deepEqual(await sentences(page), ['«У турникетов поверните налево»', '«Turn left at the turnstiles»']);
    });

    await step('«Проверка → Фото»: развилка с ориентиром ушла из списка', async () => {
      await e.mode('Проверка');
      await e.press('Фото');
      assert.equal(await page.eval(`!!document.querySelector('[data-coverage-node=${JSON.stringify(POINT)}]')`), false);
    });
  },
};
