import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { MapNode, Transition, BuildingMeta } from '@campus-map/core';

interface ExportOptions {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
  buildingMetas: Map<string, BuildingMeta>;
  aliases?: { id: string; names: string[] }[];
}

export async function exportToZip(options: ExportOptions): Promise<void> {
  const { nodes, transitions, buildingMetas, aliases = [] } = options;
  
  const zip = new JSZip();
  const dataFolder = zip.folder('data')!;
  
  // === 1. Campus ===
  const campusFolder = dataFolder.folder('campus')!;
  
  // Вычисляем реальные размеры из узлов (или используем дефолт)
  const campusNodes = Array.from(nodes.values()).filter((n) => n.building === 'CAMPUS');
  let mapWidth = 1200;
  let mapHeight = 800;
  
  if (campusNodes.length > 0) {
    const maxX = Math.max(...campusNodes.map(n => n.x));
    const maxY = Math.max(...campusNodes.map(n => n.y));
    mapWidth = Math.max(1200, Math.ceil(maxX / 100) * 100 + 200);
    mapHeight = Math.max(800, Math.ceil(maxY / 100) * 100 + 200);
  }
  
  // campus/meta.json
  const campusMeta = {
    buildings: Array.from(buildingMetas.values()).map((b) => ({
      id: b.id,
      name: b.name,
    })),
    mapSize: {
      width: mapWidth,
      height: mapHeight,
    },
  };
  campusFolder.file('meta.json', JSON.stringify(campusMeta, null, 2));
  
  // campus/graph.json
  const campusGraphNodes = campusNodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    neighbors: n.neighbors,
    isPortal: n.isPortal,
  }));
  campusFolder.file('graph.json', JSON.stringify({ nodes: campusGraphNodes }, null, 2));
  
  // === 2. Buildings ===
  const buildingsFolder = dataFolder.folder('buildings')!;
  
  for (const [buildingId, meta] of buildingMetas) {
    const buildingFolder = buildingsFolder.folder(buildingId)!;
    
    // buildings/{id}/meta.json
    buildingFolder.file('meta.json', JSON.stringify({
      id: meta.id,
      name: meta.name,
      floors: meta.floors.map((f) => ({
        floor: f.floor,
        mapPath: 'map.png',
        graphPath: 'graph.json',
      })),
      bounds: meta.bounds,
    }, null, 2));
    
    // buildings/{id}/floors/{floor}/graph.json
    const floorsFolder = buildingFolder.folder('floors')!;
    
    for (const floor of meta.floors) {
      const floorFolder = floorsFolder.folder(String(floor.floor))!;
      
      const floorNodes = Array.from(nodes.values())
        .filter((n) => n.building === buildingId && n.floor === floor.floor)
        .map((n) => ({
          id: n.id,
          x: n.x,
          y: n.y,
          neighbors: n.neighbors,
          isPortal: n.isPortal,
        }));
      
      floorFolder.file('graph.json', JSON.stringify({ nodes: floorNodes }, null, 2));
    }
  }
  
  // === 3. Transitions ===
  const transitionsData = {
    transitions: transitions.map((t) => ({
      from: { node: t.fromNode },
      to: { node: t.toNode },
      transition_type: t.type,
    })),
  };
  dataFolder.file('transitions.json', JSON.stringify(transitionsData, null, 2));
  
  // === 4. Aliases (фильтруем пустые) ===
  const filteredAliases = aliases.filter(a => a.names.length > 0);
  const aliasesData = {
    aliases: filteredAliases,
  };
  dataFolder.file('aliases.json', JSON.stringify(aliasesData, null, 2));
  
  // === 5. README ===
  const readme = `# Campus Map Data Export

Экспортировано: ${new Date().toISOString()}

## Структура

\`\`\`
data/
├── campus/
│   ├── meta.json       # Метаданные кампуса
│   ├── graph.json      # Граф кампуса
│   └── map.png         # Карта кампуса (добавьте вручную)
├── buildings/
│   └── {building_id}/
│       ├── meta.json   # Метаданные корпуса
│       └── floors/
│           └── {floor}/
│               ├── graph.json  # Граф этажа
│               └── map.png     # Карта этажа (добавьте вручную)
├── transitions.json    # Переходы между этажами/корпусами
└── aliases.json        # Человекочитаемые названия
\`\`\`

## Типы переходов

- \`entrance\` — вход/выход из корпуса
- \`stairs\` — лестница
- \`lift\` — лифт
- \`bridge\` — переход между корпусами

## Использование

1. Распакуйте архив
2. Добавьте изображения карт (map.png) в соответствующие папки
3. Скопируйте папку data/ в apps/viewer/public/
4. Скопируйте папку data/ в apps/editor/public/
`;
  zip.file('README.md', readme);
  
  // === Генерация и скачивание ===
  const content = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().slice(0, 10);
  saveAs(content, `campus-map-data-${timestamp}.zip`);
}