import { toPng } from 'html-to-image';
import { getRectOfNodes, getTransformForBounds } from 'reactflow';

const PAD = 40;
const TITLE_H = 70;

export async function exportCanvasPng({ nodes, title = 'Network Design', subtitle = '' }) {
  const viewport = document.querySelector('.react-flow__viewport');
  if (!viewport) throw new Error('Canvas not found');
  if (!nodes.length) throw new Error('Nothing to export');

  const bounds = getRectOfNodes(nodes);
  const width = Math.ceil(bounds.width + PAD * 2);
  const height = Math.ceil(bounds.height + PAD * 2 + TITLE_H);
  const [x, y, zoom] = getTransformForBounds(bounds, width, height - TITLE_H, 0.5, 2);

  const graphPng = await toPng(viewport, {
    backgroundColor: '#0f172a',
    width,
    height: height - TITLE_H,
    pixelRatio: 2,
    style: {
      width: `${width}px`,
      height: `${height - TITLE_H}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
  });

  const dataUrl = await composeWithTitle(graphPng, { width, height, title, subtitle });
  download(dataUrl, `${slug(title)}.png`);
}

function composeWithTitle(graphPng, { width, height, title, subtitle }) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, width, TITLE_H);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, TITLE_H - 2, width, 2);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 22px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(title, 24, 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(subtitle, 24, 54);

    const ts = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(ts, width - 24, 32);
    ctx.textAlign = 'left';

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, TITLE_H, width, height - TITLE_H);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = graphPng;
  });
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
}

function download(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
