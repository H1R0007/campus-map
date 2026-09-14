/**
 * Минимальная обвязка протокола отладки Chrome (CDP) для сценариев в браузере.
 *
 * Без Puppeteer и Playwright: те при установке зависимостей скачивают
 * собственный браузер на сотни мегабайт, а сценариям достаточно уже
 * установленного Chrome или Edge и десятка команд протокола (запись 18).
 */

import { writeFileSync } from 'node:fs';

/** Коды клавиш для `Input.dispatchKeyEvent`. */
const KEYS = {
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13 },
  ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Открывает новую вкладку и возвращает управление ею.
 *
 * Ошибки страницы — исключения, `console.error` и `console.assert`, ошибки
 * загрузки ресурсов — копятся в `page.problems`: шаг сценария обязан
 * закончиться без них.
 *
 * @param {string} debugUrl адрес отладки браузера: `http://127.0.0.1:<порт>`
 */
export async function openPage(debugUrl) {
  // PUT: новые Chrome и Edge отказывают в создании вкладки запросом GET.
  const target = await (await fetch(`${debugUrl}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('CDP: не удалось подключиться к вкладке'));
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  const problems = [];

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`CDP ${method}: ${JSON.stringify(message.error)}`));
      else resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      problems.push(`исключение: ${details.exception?.description ?? details.text}`);
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(message.params.type)) {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      problems.push(`console.${message.params.type}: ${text}`);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      problems.push(`журнал: ${message.params.entry.text} ${message.params.entry.url ?? ''}`.trim());
    }

    for (const listener of listeners) listener(message);
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  // Без эмуляции фокуса вкладка без окна считается неактивной: фокус не
  // переходит в поля, а буфер обмена отказывает в записи.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  const page = {
    problems,
    send,
    sleep,

    /** Размер окна; `scale` — плотность пикселей, `mobile` включается для узкого экрана. */
    async viewport(width, height, scale = 1) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: width < 600 });
    },

    async goto(url) {
      const loaded = new Promise((resolve) => {
        const listener = (message) => {
          if (message.method !== 'Page.loadEventFired') return;
          listeners.delete(listener);
          resolve();
        };
        listeners.add(listener);
      });
      await send('Page.navigate', { url });
      await loaded;
    },

    /** Выполняет выражение в странице и возвращает значение; исключение страницы — исключение здесь. */
    async eval(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) {
        const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
        throw new Error(`eval: ${description}\n${expression}`);
      }
      return result.result.value;
    },

    async waitFor(expression, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const value = await page.eval(expression);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`не дождались: ${expression}`);
        await sleep(100);
      }
    },

    async key(name) {
      const key = KEYS[name];
      if (!key) throw new Error(`неизвестная клавиша: ${name}`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, ...key });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, ...key });
      await sleep(350);
    },

    /** Нажатие и отпускание левой кнопки мыши в точке окна. */
    async tap(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(400);
    },

    /** Протягивание мышью по вертикали — жест ручки шторки. */
    async dragVertical(x, y, dy) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y + (dy * i) / steps, button: 'left', buttons: 1 });
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y + dy, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(400);
    },

    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(data, 'base64'));
    },

    async close() {
      socket.close();
      await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {
        // Браузер уже закрывается вместе со всеми вкладками — закрывать нечего.
      });
    },
  };

  return page;
}
