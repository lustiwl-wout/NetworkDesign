import { toPng } from 'html-to-image';
import { getRectOfNodes, getTransformForBounds } from 'reactflow';
import { ICON_META } from './DeviceIcons.jsx';
import { getEdgeKind } from './edgePresets.js';

const PAD = 40;
const TITLE_H = 72;
const LEGEND_ROW_H = 28;

export async function exportCanvasPng({ nodes, edges = [], deviceTypes = [], title = 'Network Design', subtitle = '' }) {
  const viewport = document.querySelector('.react-flow__viewport');
  if (!viewport) throw new Error('Canvas not found');
  if (!nodes.length) throw new Error('Nothing to export');

  const bounds = getRectOfNodes(nodes);

  const legend = collectLegend(nodes, edges, deviceTypes);
  const legendCols = Math.max(1, Math.min(4, Math.ceil(legend.items.length / 6)));
  const legendRows = Math.ceil(legend.items.length / legendCols);
  const legendH = legend.items.length ? (legendRows * LEGEND_ROW_H + 36) : 0;

  const canvasW = Math.ceil(bounds.width + PAD * 2);
  const graphH  = Math.ceil(bounds.height + PAD * 2);
  const totalH  = TITLE_H + graphH + legendH;
  const [x, y, zoom] = getTransformForBounds(bounds, canvasW, graphH, 0.5, 2);

  const graphPng = await toPng(viewport, {
    backgroundColor: '#0f172a',
    width: canvasW,
    height: graphH,
    pixelRatio: 2,
    style: {
      width: `${canvasW}px`,
      height: `${graphH}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
  });

  const dataUrl = await composeWithChrome(graphPng, {
    width: canvasW,
    height: totalH,
    graphH,
    legendH,
    legend,
    legendCols,
    title,
    subtitle,
  });
  download(dataUrl, `${slug(title)}.png`);
}

function collectLegend(nodes, edges, deviceTypes) {
  const labelByIcon = {};
  for (const d of deviceTypes ?? []) labelByIcon[d.iconKey] = d.label;

  const iconSet = new Map();    // iconKey -> label
  const edgeKinds = new Set();  // kind keys
  for (const n of nodes) {
    if (n.type !== 'device') continue;
    const key = n.data?.iconKey;
    if (!key) continue;
    if (!iconSet.has(key)) {
      iconSet.set(key, labelByIcon[key] || titleCase(key));
    }
  }
  for (const e of edges) {
    const k = e.data?.kind ?? 'network';
    edgeKinds.add(k);
  }

  const items = [];
  for (const [iconKey, label] of iconSet) {
    items.push({ kind: 'device', iconKey, label });
  }
  for (const kk of edgeKinds) {
    const k = getEdgeKind(kk);
    items.push({ kind: 'edge', edgeKey: kk, label: k.label, stroke: k.stroke, dash: k.strokeDasharray, animated: k.animated });
  }
  return { items };
}

function composeWithChrome(graphPng, opts) {
  const { width, height, graphH, legendH, legend, legendCols, title, subtitle } = opts;
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Backdrop
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Title block
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, width, TITLE_H);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, TITLE_H - 2, width, 2);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 22px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(title, 24, 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px -apple-system, Segoe UI, Roboto, sans-serif';
    if (subtitle) ctx.fillText(subtitle, 24, 54);

    const ts = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(ts, width - 24, 32);
    ctx.textAlign = 'left';

    // Graph image
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, TITLE_H, width, graphH);

      // Legend
      if (legendH > 0) {
        const y0 = TITLE_H + graphH;
        ctx.fillStyle = '#141e33';
        ctx.fillRect(0, y0, width, legendH);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.fillText('LEGEND', 24, y0 + 20);

        const colWidth = (width - 48) / legendCols;
        legend.items.forEach((item, i) => {
          const col = i % legendCols;
          const row = Math.floor(i / legendCols);
          const lx = 24 + col * colWidth;
          const ly = y0 + 36 + row * LEGEND_ROW_H;
          drawLegendItem(ctx, item, lx, ly);
        });
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = graphPng;
  });
}

function drawLegendItem(ctx, item, x, y) {
  if (item.kind === 'device') {
    const accent = (ICON_META[item.iconKey]?.accent) ?? '#94a3b8';
    // Rounded square swatch with accent fill
    roundRect(ctx, x, y - 10, 16, 16, 3);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(item.label, x + 24, y + 2);
  } else {
    // Edge sample line
    const stroke = item.stroke ?? '#94a3b8';
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    if (item.dash) {
      const dashes = String(item.dash).split(/\s+/).map(Number);
      ctx.setLineDash(dashes);
    }
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x + 34, y - 2);
    ctx.stroke();
    ctx.restore();
    // Animated flow arrow indicator
    if (item.animated) {
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(x + 34, y - 2);
      ctx.lineTo(x + 28, y - 6);
      ctx.lineTo(x + 28, y + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(item.label, x + 42, y + 2);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function titleCase(s) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
