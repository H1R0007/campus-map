/** @type {import('tailwindcss').Config} */

/** Цвет из CSS-переменной с каналами RGB: так работает прозрачность (`bg-inverse/90`). */
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

const GRAY_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Значения цветов — CSS-переменные из `src/index.css`, каналами RGB, чтобы
      // работала прозрачность (`bg-primary/10`). Здесь только ссылки на них:
      // цвета объявлены в одном месте, и оттуда же их берут слои карты.
      //
      // Серая шкала тоже из переменных: в тёмной теме она перевёрнута, и
      // `text-gray-900` в обеих темах — главный текст, а `bg-gray-100` —
      // приглушённая подложка. Где смысл не «ступень серого», — отдельные
      // токены: поверхность, фирменный цвет текста, выбранное, сообщения,
      // ошибка (запись 21).
      colors: {
        primary: {
          DEFAULT: token('--color-primary'),
          hover: token('--color-primary-hover'),
        },
        start: token('--color-start'),
        accent: token('--color-accent'),
        surface: token('--color-surface'),
        inverse: token('--color-inverse'),
        'on-inverse': token('--color-on-inverse'),
        danger: {
          DEFAULT: token('--color-danger'),
          soft: token('--color-danger-soft'),
        },
        // Прозрачность подсветки — внутри токена: в тёмной теме её нужно больше.
        selected: 'rgb(var(--color-selected))',
        gray: Object.fromEntries(GRAY_STEPS.map((step) => [step, token(`--gray-${step}`)])),
      },
      // Шрифт не переопределяется: системный стек объявлен в `src/index.css`.
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
};
