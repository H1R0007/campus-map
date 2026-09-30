import React, { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useReadiness, useReadinessAction } from '../../hooks/useReadiness';
import { READINESS_GROUPS } from '../../utils/readiness';
import type { ReadinessAction, ReadinessGroup, ReadinessItem, ReadinessState } from '../../utils/readiness';
import { InfoTip } from './Field';
import { Icon } from './Icon';

const GROUPS: ReadinessGroup[] = ['frame', 'markup', 'links', 'result'];

/** Состояние строки словами — для чтения с экрана: значок его не называет. */
const STATE_WORDS: Record<ReadinessState, string> = {
  done: 'выполнено',
  todo: 'не выполнено',
  blocked: 'ждёт другой строки',
  pending: 'проверяется',
};

/**
 * «Готовность карты» — вкладка «Проверки» (запись 67): все строки по группам,
 * у невыполненной — кнопка к месту исправления и, если мест несколько, их
 * список.
 */
export const ReadinessView: React.FC = () => {
  const { items, done, total, next } = useReadiness();
  const run = useReadinessAction();

  return (
    <div className="editor-card">
      <section className="editor-card__section editor-card__section--first" aria-label="Итог готовности">
        <ReadinessMeter done={done} total={total} />
        {next ? (
          <div className="editor-ready__next">
            <span className="editor-ready__next-label">Дальше</span>
            <span className="editor-ready__next-title">{next.title}</span>
            {next.button && (
              <button type="button" className="editor-button editor-button--primary editor-button--block" onClick={() => run(next.button!.action)}>
                {next.button.label}
              </button>
            )}
          </div>
        ) : (
          <div className="editor-callout editor-callout--ok">
            Карта готова: навигатор откроет каждый этаж, найдёт помещения по названию и проложит маршруты со временем в пути.
          </div>
        )}
      </section>

      {GROUPS.map((group) => (
        <section key={group} className="editor-card__section" aria-label={READINESS_GROUPS[group]}>
          <h3 className="editor-card__heading">{READINESS_GROUPS[group]}</h3>
          <ul className="editor-ready">
            {items
              .filter((item) => item.group === group)
              .map((item) => (
                <ReadinessRow key={item.id} item={item} run={run} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

/** «11 из 15» и полоса. */
const ReadinessMeter: React.FC<{ done: number; total: number }> = ({ done, total }) => (
  <div className="editor-ready__meter">
    <div className="editor-ready__count">
      <span className="editor-ready__count-value">
        {done} из {total}
      </span>
      <span className="editor-ready__count-label">проверок выполнено</span>
    </div>
    <div className="editor-ready__bar" role="progressbar" aria-label="Готовность карты" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <span style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
    </div>
  </div>
);

/** Сколько мест показывать в строке, пока список не раскрыт. */
const SHOWN = 3;

const ReadinessRow: React.FC<{ item: ReadinessItem; run: (action: ReadinessAction) => void }> = ({ item, run }) => {
  const [expanded, setExpanded] = useState(false);
  const problems = expanded ? item.problems : item.problems.slice(0, SHOWN);
  // Место называется всегда; своя кнопка у него — только когда мест несколько:
  // одно место и есть кнопка строки.
  const several = item.problems.length > 1;

  return (
    <li className={`editor-ready__item editor-ready__item--${item.state}`} data-ready={item.id} data-state={item.state}>
      <span className="editor-ready__mark" aria-hidden="true">
        {item.state === 'done' && <Icon name="checkCircle" size={18} />}
      </span>
      <div className="editor-ready__body">
        <div className="editor-ready__title-row">
          <span className="editor-ready__title">{item.title}</span>
          <span className="sr-only">: {STATE_WORDS[item.state]}</span>
          {!item.required && <span className="editor-ready__optional">желательно</span>}
          <InfoTip about={item.title}>{item.hint}</InfoTip>
        </div>
        <span className="editor-ready__status">{item.status}</span>
        {item.state !== 'done' && item.problems.length > 0 && (
          <ul className="editor-ready__problems" aria-label={`Где: ${item.title}`}>
            {problems.map((problem) => (
              <li key={problem.text}>
                <span>{problem.text}</span>
                {several && problem.button && (
                  <button type="button" className="editor-ready__link" onClick={() => run(problem.button!.action)}>
                    {problem.button.label}
                  </button>
                )}
              </li>
            ))}
            {item.problems.length > SHOWN && (
              <li>
                <button type="button" className="editor-ready__link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                  {expanded ? 'Свернуть' : `Ещё ${item.problems.length - SHOWN}`}
                </button>
              </li>
            )}
          </ul>
        )}
        {item.state !== 'done' && !several && item.button && (
          <button type="button" className="editor-button editor-button--ghost editor-button--compact editor-ready__action" onClick={() => run(item.button!.action)}>
            {item.button.label}
          </button>
        )}
      </div>
    </li>
  );
};

/**
 * Полоса «Готовность карты» внизу структуры в «Планах и корпусах»: сколько
 * выполнено и что дальше. Полный список — в «Проверке».
 */
export const ReadinessStrip: React.FC = () => {
  const { done, total, next } = useReadiness();
  const run = useReadinessAction();
  const openCheck = useEditorStore((s) => s.openCheck);

  return (
    <section className="editor-ready-strip" aria-label="Готовность карты">
      <button type="button" className="editor-ready-strip__head" onClick={() => openCheck('ready')} title="Открыть полный список в «Проверке»">
        <span className="editor-ready-strip__title">Готовность карты</span>
        <span className="editor-ready-strip__count">
          {done} из {total}
        </span>
        <Icon name="chevronRight" size={14} />
      </button>
      <div className="editor-ready__bar" aria-hidden="true">
        <span style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
      </div>
      {next ? (
        <>
          <p className="editor-ready-strip__next">Дальше: «{next.title}»</p>
          {next.button && (
            <button type="button" className="editor-button editor-button--ghost editor-button--compact editor-button--block" onClick={() => run(next.button!.action)}>
              {next.button.label}
            </button>
          )}
        </>
      ) : (
        <p className="editor-ready-strip__next">Карта готова</p>
      )}
    </section>
  );
};
