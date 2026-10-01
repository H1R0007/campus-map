#!/usr/bin/env node
/* global process, console, setTimeout */
/**
 * Сценарии прототипа экскурсий в настоящем браузере (запись 90).
 *
 * Отдельно от `tooling/browser-check.mjs`: прототип не развёртывается, а его
 * панорамы — WebGL, которого в CI может не оказаться. Обвязка протокола
 * отладки и сервер — общие (`tooling/browser/cdp.mjs`, `tooling/lib/vite-server.mjs`).
 *
 * По умолчанию снимков нет вовсе (пустой каталог): каждая точка — заглушка-
 * компас, и проверки не зависят от того, скачаны ли открытые снимки.
 *
 *   pnpm --filter @campus-map/tour-lab build
 *   pnpm --filter @campus-map/tour-lab check:browser [-- --mode dev] [--samples] [--shots <каталог>] [--only <часть имени>]
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { openPage } = await import(pathToFileURL(path.join(repoRoot, 'tooling/browser/cdp.mjs')).href);
const { startVite } = await import(pathToFileURL(path.join(repoRoot, 'tooling/lib/vite-server.mjs')).href);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = { mode: 'prod', samples: false, shots: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode') options.mode = argv[++i];
    else if (argv[i] === '--samples') options.samples = true;
    else if (argv[i] === '--shots') options.shots = path.resolve(argv[++i]);
    else if (argv[i] === '--only') options.only = argv[++i];
    else if (argv[i] !== '--') throw new Error(`Неизвестный аргумент: ${argv[i]}`);
  }
  return options;
}

function findBrowser() {
  if (process.env.CAMPUS_BROWSER) return process.env.CAMPUS_BROWSER;
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
          path.join(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
          path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
          path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function launchBrowser(executable) {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'tour-lab-browser-'));
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // Без видеокарты WebGL панорам рисует программный SwiftShader.
    '--enable-unsafe-swiftshader',
    '--lang=ru-RU',
  ];
  if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox');
  const child = spawn(executable, [...args, 'about:blank'], { stdio: 'ignore' });
  const stop = () => {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200; i++) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split('\n')[0], 10);
      if (port > 0) return { debugUrl: `http://127.0.0.1:${port}`, stop };
    }
    await sleep(100);
  }
  stop();
  throw new Error(`Браузер не открыл порт отладки: ${executable}`);
}

/** Разница углов в (−180, 180]. */
function angleDiff(a, b) {
  const value = (((a - b) % 360) + 540) % 360 - 180;
  return value === -180 ? 180 : value;
}

function assertAngle(actual, expected, what, tolerance = 1.5) {
  if (actual === null || actual === undefined || Math.abs(angleDiff(actual, expected)) > tolerance) {
    throw new Error(`${what}: ожидался угол ${expected.toFixed(1)}°, получен ${actual === null || actual === undefined ? actual : actual.toFixed(1)}°`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Направление на точку плана по часовой стрелке от верха, ось y вниз. */
const bearing = (dx, dy) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;

/** Помощники сценариев поверх страницы. */
function tourHelpers(page) {
  const helpers = {
    node: () => page.eval('window.tourLab?.plugin.getCurrentNode()?.id ?? null'),
    /** Куда смотрит человек, градусы территории. */
    yaw: () => page.eval('((tourLab.viewer.getPosition().yaw * 180 / Math.PI) % 360 + 360) % 360'),
    /** Угол стрелки к узлу в системе просмотрщика, градусы. */
    linkYaw: (target) =>
      page.eval(`((tourLab.plugin.getLinkPosition(${JSON.stringify(target)}).yaw * 180 / Math.PI) % 360 + 360) % 360`),
    /** Угол на снимке (от его середины), который виден в направлении взгляда `yaw`. */
    imageYawAt: (yaw) =>
      page.eval(`(() => {
        const width = tourLab.viewer.state.textureData.panoData.fullWidth;
        const { textureX } = tourLab.viewer.dataHelper.sphericalCoordsToTextureCoords({ yaw: ${yaw} * Math.PI / 180, pitch: 0 });
        return (textureX / width - 0.5) * 360;
      })()`),
    arrows: () => page.eval("[...document.querySelectorAll('.tour-arrow')].map((a) => a.dataset.target).sort()"),
    async waitNode(id, timeout = 20_000) {
      await page.waitFor(
        `window.tourLab?.plugin.getCurrentNode()?.id === ${JSON.stringify(id)} && ` +
          '!tourLab.viewer.state.loadingPromise && !tourLab.viewer.state.transitionAnimation && !tourLab.viewer.state.animation',
        timeout
      );
      // Переход — затемнение и поворот; ждём, пока камера простоит три замера подряд.
      let previous = null;
      let still = 0;
      for (let i = 0; i < 60 && still < 3; i++) {
        await sleep(150);
        const now = await helpers.yaw();
        still = previous !== null && Math.abs(angleDiff(now, previous)) < 0.05 ? still + 1 : 0;
        previous = now;
      }
    },
    async rotate(yaw) {
      await page.eval(`tourLab.viewer.rotate({ yaw: ${yaw} * Math.PI / 180, pitch: 0 }); true`);
      await sleep(300);
    },
    /**
     * Нажатие мышью в середину элемента — просмотрщик слушает настоящие
     * нажатия, а не click(). Со сдвигом на пару точек: щелчок просмотрщик
     * узнаёт лучом в грубую сферу (32×16 граней), и луч ровно из середины
     * экрана при взгляде ровно на 270° идёт по ребру граней и проскакивает
     * мимо. Человек так точно не попадает, а сценарий попадал.
     */
    async tapElement(selector) {
      const rect = await page.eval(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return { x: r.x + r.width / 2 + 3, y: r.y + r.height / 2 + 2 };
      })()`);
      assert(rect, `нет элемента ${selector}`);
      await page.tap(rect.x, rect.y);
    },
    click: (selector) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`),
    clickText: (selector, text) =>
      page.eval(`(() => {
        const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.includes(${JSON.stringify(text)}));
        if (!e || e.disabled) return false;
        e.click();
        return true;
      })()`),
  };
  return helpers;
}

const OPEN = (page) => page.waitFor("window.tourLab?.plugin.getCurrentNode() && document.querySelectorAll('.tour-arrow').length > 0", 40_000);

const SCENARIOS = [
  {
    name: 'стрелки по графу, заглушка-компас и направление снимка',
    async run({ page, base, step, shot, samples }) {
      const tour = tourHelpers(page);
      await step('открыть снимок у лифта', async () => {
        await page.viewport(1280, 800);
        await page.goto(`${base}/?at=a1_corridor_7`);
        await OPEN(page);
        await tour.waitNode('a1_corridor_7');
      });

      await step('три стрелки — к холлу, к лифту, к А-101; лифт выделен как маршрут', async () => {
        const arrows = await tour.arrows();
        assert(JSON.stringify(arrows) === JSON.stringify(['a1_corridor_4', 'a1_hall', 'a2_corridor_6']), `стрелки: ${arrows}`);
        const route = await page.eval("[...document.querySelectorAll('.tour-arrow--route')].map((a) => [a.dataset.target, a.getAttribute('aria-label')])");
        assert(route.length === 1 && route[0][0] === 'a2_corridor_6', `стрелка маршрута: ${JSON.stringify(route)}`);
        assert(route[0][1].includes('На лифте вверх — этаж 2') && route[0][1].includes('по маршруту'), `подпись: ${route[0][1]}`);
      });

      await step('стрелки стоят по направлениям плана', async () => {
        assertAngle(await tour.linkYaw('a2_corridor_6'), 0, 'лифт — вверх по плану');
        assertAngle(await tour.linkYaw('a1_corridor_4'), 270, 'к А-101 — влево по плану');
        // Холл: прицел на точку не ближе 3 м — (360,157) от (340,130).
        assertAngle(await tour.linkYaw('a1_hall'), bearing(20, 27), 'к холлу');
      });

      await step('середина снимка — на его heading (52°), а не на −52°', async () => {
        assertAngle(await tour.imageYawAt(52), 0, 'середина снимка');
        assertAngle(await tour.imageYawAt(0), -52, 'вверх по плану');
        if (!samples) {
          const badge = await page.eval("document.querySelector('[data-testid=view-bar]').innerText");
          assert(badge.includes('заглушка-компас'), `нет пометки заглушки: ${badge}`);
        }
      });
      await shot('lab-1-stub');

      await step('нажатие на стрелку ведёт к соседнему снимку и сохраняет направление шага', async () => {
        await tour.rotate(270);
        await tour.tapElement('.tour-arrow[data-target="a1_corridor_4"]');
        await tour.waitNode('a1_corridor_4');
        assertAngle(await tour.yaw(), 270, 'взгляд после шага');
      });

      await step('«Куда отсюда» — то же списком: сторона и расстояние', async () => {
        const items = await page.eval("[...document.querySelectorAll('.link-list__item')].map((b) => b.innerText.replace(/\\s+/g, ' '))");
        assert(items.some((text) => text.startsWith('Коридор у лифта') && text.includes('сзади')), `список: ${JSON.stringify(items)}`);
        assert(items.some((text) => text.startsWith('Столовая')), `нет столовой: ${JSON.stringify(items)}`);
        assert(await tour.click('.link-list__item[data-target="a1_corridor_7"]'), 'нет кнопки «Коридор у лифта»');
        await tour.waitNode('a1_corridor_7');
      });

      await step('точка на плане открывает её снимок', async () => {
        await tour.tapElement('circle[data-node="a1_canteen"]');
        await tour.waitNode('a1_canteen');
        assert((await page.eval("document.querySelector('.mini-plan__spot--current')?.dataset.node")) === 'a1_canteen', 'точка не стала текущей');
      });

      await step('повёрнутый корпус: стрелка — в системе территории (+20°)', async () => {
        await page.goto(`${base}/?at=c1_hall`);
        await OPEN(page);
        await tour.waitNode('c1_hall');
        // По плану корпуса В: на (450,150) от (300,177); корпус повёрнут на 20°.
        assertAngle(await tour.linkYaw('c1_pool'), bearing(150, -27) + 20, 'к бассейну');
        assertAngle(await tour.imageYawAt(20), 0, 'середина снимка корпуса В');
      });
    },
  },

  {
    name: 'маршрут: показать этот поворот',
    async run({ page, base, step, shot }) {
      const tour = tourHelpers(page);
      await step('маршрут по умолчанию — от площади до деканата', async () => {
        await page.viewport(1280, 800);
        await page.goto(`${base}/`);
        await OPEN(page);
        await tour.waitNode('campus_entrance_a');
        const steps = await page.eval("[...document.querySelectorAll('.steps__item strong')].map((s) => s.textContent)");
        const expected = ['Дойдите до входа', 'Войдите в корпус', 'Дойдите до лифта', 'Поднимитесь на лифте', 'Идите до цели'];
        assert(JSON.stringify(steps) === JSON.stringify(expected), `шаги: ${JSON.stringify(steps)}`);
        const none = await page.eval("[...document.querySelectorAll('.steps__item')].map((s) => !!s.querySelector('.steps__none'))");
        assert(JSON.stringify(none) === JSON.stringify([false, false, false, true, false]), `шаги без снимка: ${JSON.stringify(none)}`);
      });

      await step('«Показать этот поворот» у шага к лифту — холл, взгляд по маршруту', async () => {
        assert(await tour.click('[data-step="2"]'), 'нет кнопки шага 2');
        await tour.waitNode('a1_hall');
        assertAngle(await tour.yaw(), bearing(-20, -27), 'взгляд в холле');
        const active = await page.eval("[...document.querySelectorAll('.steps__item')].findIndex((s) => s.classList.contains('steps__item--active'))");
        assert(active === 2, `подсвечен шаг ${active}`);
      });
      await shot('lab-2-turn');

      await step('«Дальше по маршруту» — к лифту, взгляд на лифт', async () => {
        assert(await tour.clickText('.view-bar button', 'Дальше'), 'кнопка «Дальше» недоступна');
        await tour.waitNode('a1_corridor_7');
        assertAngle(await tour.yaw(), 0, 'взгляд у лифта');
      });

      await step('стрелка на лифт — на второй этаж, взгляд от дверей лифта', async () => {
        await tour.tapElement('.tour-arrow--route');
        await tour.waitNode('a2_corridor_6');
        assertAngle(await tour.yaw(), 180, 'взгляд после лифта');
        const active = await page.eval("document.querySelector('.steps__item--active strong')?.textContent");
        assert(active === 'Идите до цели', `подсвечен шаг «${active}»`);
      });

      await step('к цели и обратно — взгляд по маршруту в обе стороны', async () => {
        assert(await tour.clickText('.view-bar button', 'Дальше'), 'кнопка «Дальше» недоступна');
        await tour.waitNode('a2_dean');
        assertAngle(await tour.yaw(), 0, 'взгляд в деканате');
        assert(!(await tour.clickText('.view-bar button', 'Дальше')), '«Дальше» у цели должна быть недоступна');
        assert(await tour.clickText('.view-bar button', 'Назад'), 'кнопка «Назад» недоступна');
        await tour.waitNode('a2_corridor_6');
        assertAngle(await tour.yaw(), 90, 'взгляд к деканату');
      });

      await step('другой маршрут — открытый снимок не на нём: без выделенной стрелки', async () => {
        await page.eval(`(() => {
          const select = document.querySelector('[data-testid=route-to]');
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          setter.call(select, 'a1_canteen');
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`);
        await page.waitFor("document.querySelectorAll('.tour-arrow').length > 0 && document.querySelectorAll('.tour-arrow--route').length === 0", 10_000);
        assert(!(await page.eval("document.querySelector('.view-bar__route')")), 'кнопки маршрута остались');
      });
    },
  },

  {
    name: 'направление снимка одним щелчком',
    async run({ page, base, step, shot }) {
      const tour = tourHelpers(page);
      const line = () => page.eval("JSON.parse(document.querySelector('[data-testid=calibrate-line]').textContent)");

      await step('открыть настройку у лифта', async () => {
        await page.viewport(1280, 800);
        await page.goto(`${base}/?at=a1_corridor_7`);
        await OPEN(page);
        await tour.waitNode('a1_corridor_7');
        assert(await tour.click('[data-testid=calibrate-toggle]'), 'нет переключателя');
        await page.waitFor("!!document.querySelector('[data-testid=calibrate-line]')");
        assert((await line()).heading === 52, 'в строке не исходный heading');
      });

      await step('выбрать лифт и щёлкнуть по снимку: heading = направление на лифт − угол щелчка', async () => {
        assert(await tour.click('input[data-target="a2_corridor_6"]'), 'нет лифта в списке');
        await tour.rotate(100);
        // Середина экрана — горизонт, стрелок там нет. Угол щелчка на снимке: 100 − 52 = 48°.
        await tour.tapElement('[data-testid=panorama]');
        await page.waitFor("JSON.parse(document.querySelector('[data-testid=calibrate-line]').textContent).heading === 312", 10_000);
        await tour.waitNode('a1_corridor_7');
      });
      await shot('lab-3-calibrated');

      await step('снимок не прыгнул: в центре тот же угол снимка, стрелки на месте', async () => {
        assertAngle(await tour.yaw(), 0, 'взгляд после настройки');
        assertAngle(await tour.imageYawAt(0), 48, 'угол снимка на лифте');
        assertAngle(await tour.linkYaw('a2_corridor_6'), 0, 'стрелка на лифт');
      });

      await step('«Вернуть как в данных»', async () => {
        assert(await tour.clickText('button', 'Вернуть как в данных'), 'нет кнопки возврата');
        await page.waitFor("JSON.parse(document.querySelector('[data-testid=calibrate-line]').textContent).heading === 52", 10_000);
        await tour.waitNode('a1_corridor_7');
        assertAngle(await tour.yaw(), 100, 'взгляд после возврата');
        assertAngle(await tour.imageYawAt(52), 0, 'середина снимка');
      });
    },
  },

  {
    name: 'телефон и тёмная тема',
    async run({ page, base, step, shot }) {
      const tour = tourHelpers(page);
      await step('узкий экран: без прокрутки вбок, снимок в рост, кнопки под палец', async () => {
        await page.viewport(390, 844, 2);
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
        await page.goto(`${base}/?at=a1_hall`);
        await OPEN(page);
        await tour.waitNode('a1_hall');
        const layout = await page.eval(`({
          scroll: document.documentElement.scrollWidth - window.innerWidth,
          view: document.querySelector('[data-testid=panorama]').getBoundingClientRect().height,
          buttons: Math.min(...[...document.querySelectorAll('.link-list__item')].map((b) => b.getBoundingClientRect().height)),
          background: getComputedStyle(document.body).backgroundColor,
        })`);
        assert(layout.scroll <= 0, `прокрутка вбок: ${layout.scroll}px`);
        assert(layout.view >= 300, `снимок ${layout.view}px в высоту`);
        assert(layout.buttons >= 44, `кнопки «Куда отсюда» ${layout.buttons}px`);
        assert(layout.background === 'rgb(14, 18, 25)', `фон тёмной темы: ${layout.background}`);
      });
      await shot('lab-4-phone');

      await step('нажатие на стрелку на телефоне', async () => {
        await tour.rotate(bearing(-20, -27));
        await tour.tapElement('.tour-arrow[data-target="a1_corridor_7"]');
        await tour.waitNode('a1_corridor_7');
      });
    },
  },
];

async function main() {
  if (typeof globalThis.WebSocket === 'undefined') {
    const result = spawnSync(process.execPath, ['--experimental-websocket', ...process.argv.slice(1)], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
  }

  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'prod' && !existsSync(path.join(repoRoot, 'apps/tour-lab/dist/index.html'))) {
    throw new Error('Нет сборки прототипа: pnpm --filter @campus-map/tour-lab build или --mode dev');
  }
  const executable = findBrowser();
  if (!executable) throw new Error('Не найден Chrome или Edge — путь в CAMPUS_BROWSER');
  if (options.shots) mkdirSync(options.shots, { recursive: true });

  const emptyPanoramas = mkdtempSync(path.join(os.tmpdir(), 'tour-lab-panoramas-'));
  const env = options.samples ? {} : { CAMPUS_PANORAMAS_DIR: emptyPanoramas };
  const server = await startVite({ app: 'tour-lab', mode: options.mode, env });
  const browser = await launchBrowser(executable);
  const base = `http://127.0.0.1:${server.port}`;
  const failures = [];
  let total = 0;

  try {
    for (const scenario of SCENARIOS.filter((entry) => !options.only || entry.name.includes(options.only))) {
      total += 1;
      console.log(`  ${scenario.name}`);
      const page = await openPage(browser.debugUrl);
      const step = async (name, action) => {
        console.log(`    · ${name}`);
        await action();
        // Нет файла снимка — ожидаемый 404: точка показывается заглушкой.
        const problems = page.problems.filter((problem) => !/404 \(Not Found\) \S*\/panoramas\//.test(problem));
        if (problems.length > 0) throw new Error(`${name}: ошибки страницы:\n${problems.join('\n')}`);
      };
      const shot = async (name) => {
        if (!options.shots) return;
        await sleep(400);
        await page.screenshot(path.join(options.shots, `${name}.png`));
      };
      try {
        await scenario.run({ page, base, step, shot, samples: options.samples });
        console.log('  OK');
      } catch (error) {
        failures.push(scenario.name);
        console.log(`  ПРОВАЛ\n${error.stack ?? error}`);
        if (options.shots) await page.screenshot(path.join(options.shots, `fail-${failures.length}.png`)).catch(() => undefined);
      } finally {
        await page.close();
      }
    }
  } finally {
    browser.stop();
    server.stop();
    rmSync(emptyPanoramas, { recursive: true, force: true });
  }

  console.log(`\nсценариев ${total}, провалов ${failures.length}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((cause) => {
  console.error(`Сценарии прототипа не выполнены: ${cause?.stack ?? cause}`);
  process.exit(1);
});

