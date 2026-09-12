/** @type {import('tailwindcss').Config} */

/**
 * Tailwind-конфиг редактора.
 *
 * Цвета темы объявлены один раз — в CSS-переменных `src/index.css`. Классы
 * Tailwind ссылаются на них, а не дублируют значения: раньше здесь были
 * захардкожены другие оттенки (`#1a1a2e`, `#16213e`, `#0f3460`), из-за чего
 * `LayersPanel` — единственный компонент, использующий классы `*-editor-*`, —
 * визуально расходился с остальным редактором, построенным на `var(--editor-*)`.
 *
 * Оборотная сторона: для таких цветов недоступен синтаксис прозрачности
 * `bg-editor-panel/50`. Там, где нужна полупрозрачность, используется
 * `rgba()` или отдельная переменная.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        editor: {
          bg: 'var(--editor-bg)',
          panel: 'var(--editor-panel)',
          accent: 'var(--editor-accent)',
          border: 'var(--editor-border)',
          highlight: 'var(--editor-highlight)',
          text: 'var(--editor-text)',
          muted: 'var(--editor-text-muted)',
        },
      },
    },
  },
  plugins: [],
};
