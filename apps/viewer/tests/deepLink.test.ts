import { describe, expect, it } from 'vitest';
import { AliasManager } from '@campus-map/core';
import { readLinkParams, resolveLink, resolvePoint, routeLink } from '../src/utils/deepLink';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Ссылки на маршрут и точку «вы здесь».
 */

const graph = fixtureGraph();
const aliases = new AliasManager();
aliases.load([
  { id: 'a2_room201', names: ['А-201'] },
  { id: 'a1_hall', names: ['Холл'] },
  { id: 'a1_entrance', names: ['Холл'] },
]);

describe('readLinkParams', () => {
  it('читает точки маршрута и точку «вы здесь»', () => {
    expect(readLinkParams('?from=campus_gate&to=a2_room201')).toEqual({
      from: 'campus_gate',
      to: 'a2_room201',
      at: null,
    });
    expect(readLinkParams('?at=a1_entrance&lang=en').at).toBe('a1_entrance');
  });

  it('пустое и пробельное значение — точки нет', () => {
    expect(readLinkParams('?from=&to=%20%20')).toEqual({ from: null, to: null, at: null });
  });
});

describe('resolvePoint', () => {
  it('разрешает id узла и однозначное название', () => {
    expect(resolvePoint('a1_stairs', graph, aliases)).toBe('a1_stairs');
    expect(resolvePoint('А-201', graph, aliases)).toBe('a2_room201');
  });

  it('неоднозначное и неизвестное — не разрешает, а не выбирает случайно', () => {
    expect(resolvePoint('Холл', graph, aliases)).toBeNull();
    expect(resolvePoint('нет_такого_узла', graph, aliases)).toBeNull();
  });
});

describe('resolveLink', () => {
  it('«вы здесь» важнее «откуда»: QR-код у двери точнее пересланной ссылки', () => {
    const link = resolveLink({ from: 'campus_gate', to: 'a2_room201', at: 'a1_entrance' }, graph, aliases);

    expect(link).toEqual({ from: 'a1_entrance', to: 'a2_room201', unresolved: [] });
  });

  it('называет точки, которых нет в данных, а не теряет их молча', () => {
    // Устаревший QR-код после переразметки должен выдать себя.
    const link = resolveLink({ from: null, to: 'старая_аудитория', at: 'Холл' }, graph, aliases);

    expect(link).toEqual({ from: null, to: null, unresolved: ['Холл', 'старая_аудитория'] });
  });

  it('ссылка без точек — пустой результат', () => {
    expect(resolveLink({ from: null, to: null, at: null }, graph, aliases)).toEqual({
      from: null,
      to: null,
      unresolved: [],
    });
  });
});

describe('routeLink', () => {
  const ORIGIN = 'https://campus.example';

  it('сохраняет путь страницы: навигатор может стоять в подкаталоге', () => {
    expect(routeLink(`${ORIGIN}/campus/`, { from: 'campus_gate', to: 'a2_room201' }, 'ru')).toBe(
      `${ORIGIN}/campus/?from=campus_gate&to=a2_room201`
    );
  });

  it('язык пишется, только если он не язык данных', () => {
    expect(routeLink(`${ORIGIN}/`, { from: 'campus_gate', to: null }, 'en')).toBe(
      `${ORIGIN}/?from=campus_gate&lang=en`
    );
    expect(routeLink(`${ORIGIN}/`, { from: null, to: null }, 'ru')).toBe(`${ORIGIN}/`);
  });

  it('заменяет прежние параметры и сохраняет фрагмент', () => {
    expect(routeLink(`${ORIGIN}/?at=a1_entrance&lang=en#map`, { from: 'a1_entrance', to: null }, 'ru')).toBe(
      `${ORIGIN}/?from=a1_entrance#map`
    );
  });

  it('при пути «//» остаётся на том же хосте', () => {
    // Путь с запросом давал «//?from=…» — ссылку без схемы на другой хост, и
    // `history.replaceState` падал с SecurityError при первом выборе точки.
    const link = routeLink('http://localhost:3000//', { from: 'campus_gate', to: null }, 'ru');

    expect(new URL(link).origin).toBe('http://localhost:3000');
    expect(link).toBe('http://localhost:3000//?from=campus_gate');
  });

  it('ссылка читается обратно в те же точки', () => {
    const link = routeLink(`${ORIGIN}/`, { from: 'a1_hall', to: 'a2_room201' }, 'en');

    expect(readLinkParams(new URL(link).search)).toEqual({
      from: 'a1_hall',
      to: 'a2_room201',
      at: null,
    });
  });
});
