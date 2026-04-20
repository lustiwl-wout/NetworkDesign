export const device = (id, iconKey, x, y, data = {}) => ({
  id,
  type: 'device',
  position: { x, y },
  data: { iconKey, inputs: 1, outputs: 1, ...data },
});

export const zone = (id, x, y, width, height, data) => ({
  id,
  type: 'zone',
  position: { x, y },
  style: { width, height },
  data,
});

export const edge = (id, source, target, kind = 'network', extras = {}) => ({
  id,
  source,
  target,
  sourceHandle: 'out-0',
  targetHandle: 'in-0',
  data: { kind },
  ...extras,
});

// Boundary / aligned interfaces shared across HQ, DC and Shop templates.
// Each site template exposes matching devices so the designs "plug into" each
// other visually even though they are stored as separate diagrams.
export const SHARED_INTERFACES = {
  mpls: {
    label: 'MPLS Edge',
    iconKey: 'router',
    note: 'Private MPLS WAN — primary inter-site transport for ERP, voice, replication.',
  },
  sdwan: {
    label: 'SD-WAN Edge',
    iconKey: 'router',
    note: 'SD-WAN overlay — internet break-out, cloud access and MPLS failover.',
  },
  internet: {
    label: 'Internet',
    iconKey: 'cloud',
    note: 'Public internet for SaaS, customer web, OOB break-glass.',
  },
  saas: {
    label: 'SaaS (M365 / collaboration)',
    iconKey: 'cloud',
    note: 'Email, productivity and collaboration cloud.',
  },
};
