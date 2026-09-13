/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Значения цветов — CSS-переменные из `src/index.css`, каналами RGB, чтобы
      // работала прозрачность (`bg-primary/10`). Здесь только ссылки на них:
      // фирменный цвет объявлен в одном месте, и оттуда же его берут слои карты.
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
        },
        start: 'rgb(var(--color-start) / <alpha-value>)',
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
