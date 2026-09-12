// apps/editor/src/utils/importZip.ts

import JSZip from 'jszip';
import type { MapNode, Transition, BuildingMeta } from '@campus-map/core';
import { parseTransitionType } from '@campus-map/core';

type ImportedDataset = {
  nodes: MapNode[];
  transitions: Transition[];
  buildingMetas: BuildingMeta[];
  aliases: { id: string; names: string[] }[];
};

/**
 * Читает JSON из zip с защитой от BOM
 */
async function readJson(zip: JSZip, path: string): Promise<any> {
  const file = zip.file(path);
  if (!file) throw new Error(`Missing file in zip: ${path}`);
  
  let text = await file.async('string');
  
  // Убираем BOM если есть
  text = text.replace(/^\uFEFF/, '');
  
  // Убираем возможные невидимые символы в начале
  text = text.trimStart();
  
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse JSON at ${path}: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

function detectRoot(zip: JSZip): string {
  // zip может быть: data/..., либо сразу campus/...
  const hasData = zip.file('data/campus/meta.json') != null;
  return hasData ? 'data/' : '';
}

export async function importDatasetFromZip(file: File): Promise<ImportedDataset> {
  const zip = await JSZip.loadAsync(file);
  const root = detectRoot(zip);

  const campusMeta = await readJson(zip, `${root}campus/meta.json`);
  const campusGraph = await readJson(zip, `${root}campus/graph.json`);

  const buildingMetas: BuildingMeta[] = [];
  const nodes: MapNode[] = [];

  // campus nodes
  for (const n of campusGraph.nodes ?? []) {
    nodes.push({
      id: n.id,
      x: n.x ?? 0,
      y: n.y ?? 0,
      building: n.building ?? 'CAMPUS',
      floor: n.floor ?? 0,
      neighbors: n.neighbors ?? [],
      isPortal: n.isPortal ?? false,
    });
  }

  // buildings
  for (const b of campusMeta.buildings ?? []) {
    const bid = b.id;
    
    try {
      const meta = await readJson(zip, `${root}buildings/${bid}/meta.json`);
      buildingMetas.push(meta);

      for (const fl of meta.floors ?? []) {
        const floorNum = fl.floor;
        
        try {
          const fg = await readJson(zip, `${root}buildings/${bid}/floors/${floorNum}/graph.json`);
          
          for (const n of fg.nodes ?? []) {
            nodes.push({
              id: n.id,
              x: n.x ?? 0,
              y: n.y ?? 0,
              building: bid,
              floor: floorNum,
              neighbors: n.neighbors ?? [],
              isPortal: n.isPortal ?? false,
            });
          }
        } catch (e) {
          console.warn(`Failed to load floor ${floorNum} of ${bid}:`, e);
        }
      }
    } catch (e) {
      console.warn(`Failed to load building ${bid}:`, e);
    }
  }

  // transitions
  let transitions: Transition[] = [];
  try {
    const tj = await readJson(zip, `${root}transitions.json`);
    transitions = (tj.transitions ?? []).map((t: any) => ({
      fromNode: t.from.node,
      toNode: t.to.node,
      type: parseTransitionType(t.transition_type ?? 'entrance'),
    }));
  } catch {
    transitions = [];
  }

  // aliases
  let aliases: { id: string; names: string[] }[] = [];
  try {
    const aj = await readJson(zip, `${root}aliases.json`);
    aliases = (aj.aliases ?? []).map((a: any) => ({
      id: a.id,
      names: a.names ?? (a.name ? [a.name] : []),
    }));
  } catch {
    aliases = [];
  }

  return { nodes, transitions, buildingMetas, aliases };
}