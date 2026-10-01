/**
 * Заглушка вместо снимка: сфера-компас с углами от середины снимка.
 *
 * Нужна там, где файла нет: открытые снимки не скачаны, CI без снимков,
 * точка ещё не снята. По ней же видно, верно ли стоят стрелки: стрелка с
 * углом +90° на снимке должна лежать под отметкой «+90°».
 */

const WIDTH = 2048;
const HEIGHT = 1024;

const cache = new Map<string, Promise<string>>();

/** Подпись отметки угла от середины снимка. */
function markLabel(degrees: number): string {
  if (degrees === 0) return '0° середина снимка';
  if (degrees === 180) return '180° сзади';
  return degrees > 0 ? `+${degrees}° вправо` : `${degrees}° влево`;
}

function draw(title: string, subtitle: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return canvas;

  const sky = context.createLinearGradient(0, 0, 0, HEIGHT / 2);
  sky.addColorStop(0, '#9fb8d6');
  sky.addColorStop(1, '#e4ebf3');
  context.fillStyle = sky;
  context.fillRect(0, 0, WIDTH, HEIGHT / 2);

  const floor = context.createLinearGradient(0, HEIGHT / 2, 0, HEIGHT);
  floor.addColorStop(0, '#c9c4bb');
  floor.addColorStop(1, '#8d877d');
  context.fillStyle = floor;
  context.fillRect(0, HEIGHT / 2, WIDTH, HEIGHT / 2);

  // Горизонт и отметки через 10°: x = (угол / 360 + 0,5) · ширина.
  context.strokeStyle = '#2b3440';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(0, HEIGHT / 2);
  context.lineTo(WIDTH, HEIGHT / 2);
  context.stroke();

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let degrees = -180; degrees < 180; degrees += 10) {
    const x = (degrees / 360 + 0.5) * WIDTH;
    const major = degrees % 30 === 0;
    context.lineWidth = major ? 3 : 1;
    context.beginPath();
    context.moveTo(x, HEIGHT / 2 - (major ? 60 : 24));
    context.lineTo(x, HEIGHT / 2 + (major ? 60 : 24));
    context.stroke();
    if (major) {
      context.fillStyle = degrees === 0 ? '#0b5cad' : '#2b3440';
      context.font = `${degrees === 0 ? 'bold ' : ''}26px system-ui, sans-serif`;
      context.fillText(markLabel(degrees === -180 ? 180 : degrees), x, HEIGHT / 2 - 90);
    }
  }

  // Название — четырежды по кругу, чтобы оно было видно в любую сторону.
  for (const degrees of [-135, -45, 45, 135]) {
    const x = (degrees / 360 + 0.5) * WIDTH;
    context.fillStyle = '#1d2733';
    context.font = 'bold 34px system-ui, sans-serif';
    context.fillText(title, x, HEIGHT / 2 - 200);
    context.font = '24px system-ui, sans-serif';
    context.fillText(subtitle, x, HEIGHT / 2 - 160);
  }

  return canvas;
}

/** Адрес картинки-заглушки (blob), одной на подпись. */
export function placeholderPanorama(title: string, subtitle: string): Promise<string> {
  const key = `${title}\n${subtitle}`;
  let url = cache.get(key);
  if (!url) {
    url = new Promise((resolve, reject) => {
      draw(title, subtitle).toBlob(
        (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('заглушка не нарисовалась'))),
        'image/jpeg',
        0.9
      );
    });
    cache.set(key, url);
  }
  return url;
}
