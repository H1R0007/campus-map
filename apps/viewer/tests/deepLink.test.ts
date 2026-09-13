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
  it('сохраняет путь страницы: навигатор может стоять в подкаталоге', () => {
    expect(routeLink('/campus/', { from: 'campus_gate', to: 'a2_room201' }, 'ru')).toBe(
      '/campus/?from=campus_gate&to=a2_room201'
    );
  });

  it('язык пишется, только если он не язык данных', () => {
    expect(routeLink('/', { from: 'campus_gate', to: null }, 'en')).toBe('/?from=campus_gate&lang=en');
    expect(routeLink('/', { from: null, to: null }, 'ru')).toBe('/');
  });

  it('ссылка читается обратно в те же точки', () => {
    const link = routeLink('/', { from: 'a1_hall', to: 'a2_room201' }, 'en');

    expect(readLinkParams(link.slice(link.indexOf('?')))).toEqual({
      from: 'a1_hall',
      to: 'a2_room201',
      at: null,
    });
  });
});
