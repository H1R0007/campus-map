import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Плоский конфиг ESLint для всего монорепо.
 *
 * Правила подобраны под дефекты, которые в этом проекте уже случались, а не
 * «на всякий случай»:
 *
 * - `no-explicit-any` — загрузка данных и отмена действий в редакторе были
 *   написаны на `any`, из-за чего разошедшиеся API ядра и стора не ловились
 *   компилятором;
 * - `react-hooks/rules-of-hooks` и `exhaustive-deps` — эффект подгонки
 *   viewport зависел от `JSON.stringify(bounds)` и от перечня стабильных
 *   функций, что приводило к лишним перерисовкам карты;
 * - `no-console` в ядре — пакет не имеет права писать в консоль: вывод
 *   принадлежит приложениям, а ядро возвращает предупреждения списком.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      'apps/*/public/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // --- общий минимум для всего TypeScript ---
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // `no-unused-vars` из базового набора дублирует правило TypeScript и
      // не понимает типов, поэтому отключено в его пользу.
      'no-unused-vars': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // --- приложения: React ---
  {
    files: ['apps/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // --- ядро: ни браузера, ни консоли ---
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: {
      globals: {},
    },
    rules: {
      // Ядро возвращает предупреждения списком и не печатает их само:
      // решение, что показывать пользователю, принимает приложение.
      'no-console': 'error',
    },
  },

  // --- mapkit: React без DOM-глобалов в типах не обходится ---
  {
    files: ['packages/mapkit/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // --- инструмент сборки: Node, а не браузер ---
  {
    files: ['tooling/**/*.mjs', '**/*.config.{js,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // --- тесты: Node и API Vitest ---
  {
    files: ['packages/*/tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  }
);
