import { describe, expect, it } from 'vitest';
import { Graph } from '@campus-map/core';
import type { MapNode } from '@campus-map/core';
import { containSize, pointPhotos, routePhotoUrls } from '../src/utils/photos';

/** Фото точек в навигаторе (записи 85, 86). */

const DOOR = { file: '1111111111111111.webp', width: 1600, height: 1200 };
const LANDMARK = { file: '2222222222222222.png', width: 1280, height: 960 };
const EXTRA = { file: '3333333333333333.jpg', width: 900, height: 1200 };

function node(id: string, photos?: MapNode['photos']): MapNode {
  return { id, x: 0, y: 0, floor: 1, building: 'b', isPortal: false, neighbors: [], ...(photos ? { photos } : {}) };
}

const GRAPH = new Graph([node('door', [DOOR, EXTRA]), node('coffee', [LANDMARK]), node('corridor')], []);

describe('pointPhotos', () => {
  it('фото точки по порядку; нет точки или фото — пустой список', () => {
    expect(pointPhotos(GRAPH, 'door')).toEqual([DOOR, EXTRA]);
    expect(pointPhotos(GRAPH, 'corridor')).toEqual([]);
    expect(pointPhotos(GRAPH, null)).toEqual([]);
    expect(pointPhotos(null, 'door')).toEqual([]);
  });
});

describe('routePhotoUrls', () => {
  it('заранее грузятся только маленькие главные фото точек шагов, без повторов', () => {
    const urls = routePhotoUrls(GRAPH, [null, 'coffee', 'corridor', 'door', 'door']);

    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/\/photos\/2222222222222222\.small\.png$/);
    expect(urls[1]).toMatch(/\/photos\/1111111111111111\.small\.webp$/);
  });
});

describe('containSize', () => {
  it('вписывает целиком: широкое фото — по ширине, высокое — по высоте', () => {
    expect(containSize(DOOR, { width: 390, height: 700 })).toEqual({ width: 390, height: 293 });
    expect(containSize(EXTRA, { width: 1440, height: 800 })).toEqual({ width: 600, height: 800 });
  });

  it('пока область не измерена — нулевой размер, а не деление на ноль', () => {
    expect(containSize(DOOR, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});
