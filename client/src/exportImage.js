import { toPng } from 'html-to-image';
import { getRectOfNodes, getTransformForBounds } from 'reactflow';
import { getEdgeKind } from './edgePresets.js';

const PAD = 40;
const TITLE_H = 72;
const LEGEND_ROW_H = 28;

// Theme palette — picked at export time from the current document.
function currentPalette() {
  const light = typeof document !== 'undefined'
    && document.documentElement.classList.contains('theme-light');
  return light
    ? {
        light,
        bg:       '#f4f6fb',
        titleBg:  '#ffffff',
        legendBg: '#f1f5f9',
        text:     '#0f172a',
        muted:    '#64748b',
        accent:   '#0ea5e9',
      }
    : {
        light,
        bg:       '#0f172a',
        titleBg:  '#1e293b',
        legendBg: '#141e33',
        text:     '#e2e8f0',
        muted:    '#94a3b8',
        accent:   '#38bdf8',
      };
}

export async function exportCanvasPng({ nodes, edges = [], title = 'Network Design', subtitle = '' }) {
  const viewport = document.querySelector('.react-flow__viewport');
  if (!viewport) throw new Error('Canvas not found');
  if (!nodes.length) throw new Error('Nothing to export');

  const palette = currentPalette();
  const bounds = getRectOfNodes(nodes);

  const legendItems = collectLegend(edges);
  const legendCols = Math.max(1, Math.min(4, Math.ceil(legendItems.length / 6)));
  const legendRows = Math.ceil(legendItems.length / legendCols);
  const legendH = legendItems.length ? (legendRows * LEGEND_ROW_H + 36) : 0;

  const canvasW = Math.ceil(bounds.width + PAD * 2);
  const graphH  = Math.ceil(bounds.height + PAD * 2);
  const totalH  = TITLE_H + graphH + legendH;
  const [x, y, zoom] = getTransformForBounds(bounds, canvasW, graphH, 0.5, 2);

  const graphPng = await toPng(viewport, {
    backgroundColor: palette.bg,
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
    width: canvasW, height: totalH, graphH, legendH,
    legendItems, legendCols,
    title, subtitle, palette,
  });
  download(dataUrl, `${slug(title)}.png`);
}

// Connection kinds only — one row per kind that actually appears on an
// edge in the design. Device icons are intentionally left out; the icons
// speak for themselves on the canvas.
function collectLegend(edges) {
  const keys = new Set();
  for (const e of edges) keys.add(e.data?.kind ?? 'network');
  return [...keys].map((kk) => {
    const k = getEdgeKind(kk);
    return {
      edgeKey: kk,
      label: k.label,
      stroke: k.stroke,
      dash: k.strokeDasharray,
      animated: k.animated,
    };
  });
}

function composeWithChrome(graphPng, opts) {
  const { width, height, graphH, legendH, legendItems, legendCols, title, subtitle, palette } = opts;
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Backdrop
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    // Title block
    ctx.fillStyle = palette.titleBg;
    ctx.fillRect(0, 0, width, TITLE_H);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(0, TITLE_H - 2, width, 2);

    ctx.fillStyle = palette.text;
    ctx.font = '600 22px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(title, 24, 32);

    ctx.fillStyle = palette.muted;
    ctx.font = '13px -apple-system, Segoe UI, Roboto, sans-serif';
    if (subtitle) ctx.fillText(subtitle, 24, 54);

    const ts = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    ctx.textAlign = 'right';
    ctx.fillStyle = palette.muted;
    ctx.fillText(ts, width - 24, 32);
    ctx.textAlign = 'left';

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, TITLE_H, width, graphH);

      if (legendH > 0) {
        const y0 = TITLE_H + graphH;
        ctx.fillStyle = palette.legendBg;
        ctx.fillRect(0, y0, width, legendH);
        ctx.fillStyle = palette.muted;
        ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.fillText('CONNECTIONS', 24, y0 + 20);

        const colWidth = (width - 48) / legendCols;
        legendItems.forEach((item, i) => {
          const col = i % legendCols;
          const row = Math.floor(i / legendCols);
          const lx = 24 + col * colWidth;
          const ly = y0 + 36 + row * LEGEND_ROW_H;
          drawEdgeLegend(ctx, item, lx, ly, palette);
        });
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = graphPng;
  });
}

function drawEdgeLegend(ctx, item, x, y, palette) {
  const stroke = item.stroke ?? palette.muted;
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
  if (item.animated) {
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.moveTo(x + 34, y - 2);
    ctx.lineTo(x + 28, y - 6);
    ctx.lineTo(x + 28, y + 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = palette.text;
  ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(item.label, x + 42, y + 2);
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
