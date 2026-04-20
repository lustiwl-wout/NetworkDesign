// Layout primitives for templates.
//
// Rules — enforced by using these helpers in every template:
//   - Every device sits *inside* a zone (parentNode + extent: 'parent').
//   - Device positions are *relative to the parent zone*.
//   - Use GRID_X (220 px) and GRID_Y (180 px) as minimum spacing between
//     device centres so icons never visually crowd each other.
//   - PAD_X (40) / PAD_Y (60) inside a zone for visual breathing room
//     from the zone's header and border.

export const GRID_X = 220;
export const GRID_Y = 180;
export const PAD_X  = 40;
export const PAD_Y  = 60;

// Compute a (x, y) slot inside a zone given a (col, row) grid coord.
export const slot = (col, row) => ({
  x: PAD_X + col * GRID_X,
  y: PAD_Y + row * GRID_Y,
});

// Size a zone big enough to hold a grid of cols × rows with padding.
// Extra height reserved so the zone header above the border is visible.
export const zoneSize = (cols, rows) => ({
  width:  PAD_X * 2 + cols * GRID_X,
  height: PAD_Y * 2 + rows * GRID_Y,
});

export const zone = (id, x, y, width, height, data) => ({
  id,
  type: 'zone',
  position: { x, y },
  style: { width, height },
  data,
});

// Device *inside* a zone — position is relative to the parent, and
// extent: 'parent' clamps dragging so devices can never leave the zone.
export const device = (id, iconKey, zoneId, col, row, data = {}) => ({
  id,
  type: 'device',
  position: slot(col, row),
  parentNode: zoneId,
  extent: 'parent',
  data: { iconKey, inputs: 1, outputs: 1, ...data },
});

export const edge = (id, source, target, kind = 'network', extras = {}) => ({
  id,
  source,
  target,
  sourceHandle: 'out-0',
  targetHandle: 'in-0',
  type: 'smart',
  data: { kind },
  ...extras,
});
