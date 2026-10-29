#!/usr/bin/env node
/**
 * Проверка стиля документации.
 *
 * Документацию пишут разные люди и в разное время, а стиль разъезжается
 * незаметно: появляются оценки, обращения к читателю, обороты из рекламных
 * текстов. Вычитывать это глазами в каждом пул-реквесте дорого, поэтому часть
 * правил проверяется машиной.
 *
 * Проверяется только проза: блоки кода, вставки в обратных кавычках и
 * служебные файлы пропускаются. Ложные срабатывания лечатся правкой списка
 * ниже, а не отключением проверки.
 *
 * Использование:
 *   pnpm docs:style          # отчёт
 *   pnpm docs:style --check  # то же, но код выхода 1 при замечаниях
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');

/** Каталоги и файлы, которые не проверяются: архив, передача дел, сборка. */
const SKIP_DIRS = new Set(['.vitepress', 'dist', 'dist-offline', 'archive', 'node_modules']);
const SKIP_FILES = new Set(['STATUS.md', 'README.md']);

/**
 * Запрещённые обороты: уровень `error` валит проверку, `warn` только сообщает.
 *
 * Границы слова записываются через `(?<![а-яё])` / `(?![а-яё])`, а не через `\b`:
 * `\b` в JavaScript считается по латинице, и на кириллице не срабатывает.
 *
 * Правило добавляется, когда оборот действительно мешает читать: он оценивает,
 * обращается к читателю или обещает, вместо того чтобы сообщать факт. Конкретные
 * формулировки — в списке `RULES` ниже; в документацию они не переносятся.
 *
 * @type {{ pattern: RegExp, level: 'error' | 'warn', reason: string }[]}
 */
const RULES = [
  // Оценки вместо фактов.
  { pattern: /важно понимать/iu, level: 'error', reason: 'оценка вместо факта' },
  { pattern: /стоит отметить|стоит подчеркнуть/iu, level: 'error', reason: 'оценка вместо факта' },
  { pattern: /не секрет|как известно/iu, level: 'error', reason: 'оборот-заполнитель' },
  { pattern: /на самом деле|по сути(?! дела)/iu, level: 'error', reason: 'оборот-заполнитель' },
  { pattern: /нетрудно заметить|очевидно, что|легко заметить/iu, level: 'error', reason: 'оценка вместо факта' },
  { pattern: /идеально подходит|просто создан|мощный инструмент/iu, level: 'error', reason: 'рекламная формулировка' },

  // Обращение к читателю.
  { pattern: /давайте|представьте/iu, level: 'error', reason: 'обращение к читателю' },
  { pattern: /(?<![а-яё])вы можете|(?<![а-яё])вам нужно|(?<![а-яё])если вы|(?<![а-яё])вы увидите/iu, level: 'error', reason: 'обращение к читателю' },
  { pattern: /не забывайте|обратите внимание/iu, level: 'error', reason: 'обращение к читателю' },

  // Мягкие: допустимы, но чаще всего это след стиля.
  { pattern: /(?<![а-яё])просто(?![а-яё])/iu, level: 'warn', reason: 'оценочное слово' },
  { pattern: /(?<![а-яё])очевидно(?![а-яё])/iu, level: 'warn', reason: 'оценочное слово' },
  { pattern: /(?<![а-яё])легко(?![а-яё])/iu, level: 'warn', reason: 'оценочное слово' },
];

/** Все страницы документации. */
function pages(dir = DOCS_ROOT) {
  const result = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      result.push(...pages(full));
    } else if (entry.endsWith('.md') && !SKIP_FILES.has(entry)) {
      result.push(full);
    }
  }

  return result;
}

/**
 * Текст без кода: блоки ``` и вставки в обратных кавычках заменяются пробелами.
 *
 * Номера строк сохраняются: замечание должно указывать на место в файле.
 */
function prose(source) {
  let inFence = false;

  return source
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return '';
      }
      if (inFence) return '';
      return line.replace(/`[^`]*`/g, ' ');
    });
}

function main() {
  const check = process.argv.includes('--check');
  const findings = [];

  for (const file of pages()) {
    const relative = path.relative(REPO_ROOT, file).replaceAll('\\', '/');

    prose(readFileSync(file, 'utf8')).forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push({ file: relative, line: index + 1, rule, text: line.trim() });
        }
      }
    });
  }

  const errors = findings.filter((f) => f.rule.level === 'error');
  const warnings = findings.filter((f) => f.rule.level === 'warn');

  for (const finding of findings) {
    const level = finding.rule.level === 'error' ? 'ошибка' : 'замечание';
    process.stdout.write(
      `${finding.file}:${finding.line}: ${level}: ${finding.rule.reason}\n  ${finding.text.slice(0, 120)}\n`
    );
  }

  process.stdout.write(
    `\nСтраниц проверено: ${pages().length}. Ошибок: ${errors.length}, замечаний: ${warnings.length}.\n`
  );

  if (check && errors.length > 0) process.exit(1);
}

main();
