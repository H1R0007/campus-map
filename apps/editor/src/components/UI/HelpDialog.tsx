import React, { useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { Icon } from './Icon';

const MOUSE: [string, string][] = [
  ['Щелчок по карте инструментом «Узел»', 'поставить точку выбранного вида: название, связь и переходы сразу'],
  ['Щелчок по узлу', 'выбрать узел и открыть его карточку справа'],
  ['Двойной щелчок по узлу', 'сразу ввести или поправить название'],
  ['Перетащить узел', 'сдвинуть его (или всё выбранное)'],
  ['Shift или Ctrl + щелчок', 'добавить узел к выбранным или убрать'],
  ['Shift + протянуть по пустому месту', 'рамка выделения'],
  ['Перетащить пустое место', 'двигать карту; колесо — приблизить'],
  ['Правая кнопка', 'меню узла, связи, перехода или пустого места'],
  ['Щелчок по отметке «↑ этаж 2»', 'перейти к другому концу перехода'],
];

const KEYS: [string, string][] = [
  ['V, N, E, T, L', 'инструменты: выбор, узел, связь, переход, линия'],
  ['1–8', 'выбрать вид точки и взять инструмент «Узел»'],
  ['Ctrl+Z, Ctrl+Y', 'отменить, повторить'],
  ['Ctrl+C, Ctrl+V, Ctrl+D', 'копировать, вставить на открытый план, дублировать'],
  ['Ctrl+A', 'выбрать все узлы плана'],
  ['Delete', 'удалить выбранное'],
  ['Стрелки (с Shift — крупнее)', 'сдвинуть выбранное; без выбора — карту'],
  ['PageUp, PageDown', 'этаж выше, ниже'],
  ['Ctrl+F', 'поиск по названию, id или координатам'],
  ['Ctrl+S', 'сохранить'],
  ['Esc', 'отменить начатое и снять выбор'],
  ['F1', 'эта справка'],
];

const RECIPES: [string, string][] = [
  [
    'Лестница или лифт между этажами',
    'Вид «Лестница» (цифра 6) и один щелчок: точки встанут на всех этажах корпуса и свяжутся переходами. Отдельный переход между двумя точками — инструмент «Переход» (T).',
  ],
  [
    'Свой вид точки',
    'Строка над картой → «Все виды…» → «Создать вид»: название, значок, шаблон названия и что вид делает. Виды хранятся вместе с разметкой.',
  ],
  [
    'Коридор из многих точек',
    'Инструмент «Линия» (L): начало, конец, число узлов — узлы встанут на равном расстоянии и соединятся цепочкой.',
  ],
  [
    'Найти ошибки',
    'Кнопка «Проверка» в шапке: список ошибок и «Исправить что можно». Без выбора справа — обзор плана: не распался ли он на части.',
  ],
  [
    'Сохранить',
    'Кнопка «Сохранить» или Ctrl+S записывает правки в data/. Несохранённое держится черновиком в браузере и предлагается при следующем открытии.',
  ],
];

/**
 * Справка по мыши и клавишам (F1 или «?» в шапке).
 *
 * Редактором пользуются урывками, и держать в голове клавиши не нужно:
 * всё, что умеет редактор, собрано здесь простыми словами.
 */
export const HelpDialog: React.FC = () => {
  const open = useEditorStore((s) => s.helpOpen);
  const setHelpOpen = useEditorStore((s) => s.setHelpOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setHelpOpen(false), [setHelpOpen]);

  useDialogFocus(open, dialogRef, close);

  if (!open) return null;

  return (
    <div className="editor-dialog-backdrop" onClick={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="editor-dialog editor-help"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="editor-help__head">
          <h2 id="help-title" className="editor-dialog__title">
            Как работать в редакторе
          </h2>
          <button type="button" className="editor-icon-button" onClick={close} aria-label="Закрыть справку">
            <Icon name="close" />
          </button>
        </div>

        <div className="editor-help__body">
          <HelpTable title="Мышь" rows={MOUSE} />
          <HelpTable title="Клавиши — в любой раскладке" rows={KEYS} />
          <section>
            <h3 className="editor-card__heading">Как сделать</h3>
            <dl className="editor-help__recipes">
              {RECIPES.map(([what, how]) => (
                <React.Fragment key={what}>
                  <dt>{what}</dt>
                  <dd>{how}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
};

const HelpTable: React.FC<{ title: string; rows: [string, string][] }> = ({ title, rows }) => (
  <section>
    <h3 className="editor-card__heading">{title}</h3>
    <table className="editor-help__table">
      <tbody>
        {rows.map(([what, does]) => (
          <tr key={what}>
            <th scope="row">{what}</th>
            <td>{does}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
