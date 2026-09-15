import { describe, expect, it } from 'vitest';
import { parseSvgRoot, prepareSvgText } from '../src/svgRoot.js';

/**
 * Корневой тег SVG-плана и стиль темы, вписанный в файл (запись 35).
 */
describe('parseSvgRoot', () => {
  it('размер — из width и height, классы и конец тега', () => {
    const text = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="720" height="260px" class="campus-plan x"><rect/></svg>';
    const root = parseSvgRoot(text);

    expect(root?.size).toEqual({ width: 720, height: 260 });
    expect(root?.classes).toEqual(['campus-plan', 'x']);
    expect(text.slice(root!.end)).toBe('<rect/></svg>');
  });

  it('без width и height — размер из viewBox, без обоих — null', () => {
    expect(parseSvgRoot("<svg viewBox='0 0 640,380'></svg>")?.size).toEqual({ width: 640, height: 380 });
    expect(parseSvgRoot('<svg></svg>')?.size).toBeNull();
  });

  it('не SVG — null', () => {
    expect(parseSvgRoot('<html><body>404</body></html>')).toBeNull();
  });
});

describe('prepareSvgText', () => {
  it('вписывает стиль сразу после открывающего тега', () => {
    const text = '<svg width="10" height="10"><rect class="plan-floor"/></svg>';
    const prepared = prepareSvgText(text, parseSvgRoot(text)!, { width: 10, height: 10 }, '.plan-floor{fill:#000}');

    expect(prepared).toBe('<svg width="10" height="10"><style><![CDATA[.plan-floor{fill:#000}]]></style><rect class="plan-floor"/></svg>');
  });

  it('файлу без размера добавляет размер из метаданных, без стиля текст не трогает', () => {
    const text = '<svg viewBox="0 0 5 5"><g/></svg>';
    const root = { ...parseSvgRoot(text)!, size: null };

    expect(prepareSvgText(text, root, { width: 500, height: 500 }, '')).toBe('<svg width="500" height="500" viewBox="0 0 5 5"><g/></svg>');
  });

  it('стиль — секция CDATA: ни </style>, ни ]]> в нём не закрывают её раньше времени', () => {
    const text = '<svg width="1" height="1"></svg>';
    const root = parseSvgRoot(text)!;
    const size = { width: 1, height: 1 };

    expect(prepareSvgText(text, root, size, 'a>b{}</style>')).toBe('<svg width="1" height="1"><style><![CDATA[a>b{}</style>]]></style></svg>');
    expect(prepareSvgText(text, root, size, 'a{}]]><x/>')).toBe(
      '<svg width="1" height="1"><style><![CDATA[a{}]]]]><![CDATA[><x/>]]></style></svg>'
    );
  });
});
