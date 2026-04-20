import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import NetworkNode from './NetworkNode.jsx';
import ZoneNode from './ZoneNode.jsx';
import DeviceIcon from './DeviceIcons.jsx';
import AdminPortal from './AdminPortal.jsx';
import DesignsPage from './DesignsPage.jsx';
import LoginPage from './LoginPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import { TEMPLATES } from './templates/index.js';
import { api } from './api.js';
import { deviceTypesApi, zoneTypesApi } from './catalogApi.js';
import { authApi } from './authApi.js';
import { EDGE_KINDS, EDGE_KINDS_BY_KEY, applyKind } from './edgePresets.js';
import { exportCanvasPng } from './exportImage.js';

const nodeTypes = { device: NetworkNode, zone: ZoneNode };

let tmpId = 1;
const nextId = () => `n_${Date.now().toString(36)}_${tmpId++}`;
const cloneGraph = (g) => JSON.parse(JSON.stringify(g));

// Find the zone node whose rectangle contains the given flow position,
// so dropped devices can auto-parent to it.
function findContainingZone(nodes, pos) {
  for (const n of nodes) {
    if (n.type !== 'zone') continue;
    const w = n.style?.width  ?? n.width  ?? 0;
    const h = n.style?.height ?? n.height ?? 0;
    if (
      pos.x >= n.position.x && pos.x <= n.position.x + w &&
      pos.y >= n.position.y && pos.y <= n.position.y + h
    ) {
      return n;
    }
  }
  return null;
}

function styleEdges(edges) {
  return edges.map((e) => {
    const kind = e.data?.kind ?? 'network';
    return applyKind(e, kind);
  });
}

function Editor({ me }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [zoneTypes, setZoneTypes] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [name, setName] = useState('Untitled design');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [toast, setToast] = useState(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [mode, setMode] = useState('management'); // 'management' | 'engineer'
  const wrapperRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const refreshCatalogs = useCallback(async () => {
    try {
      const [d, z] = await Promise.all([deviceTypesApi.list(), zoneTypesApi.list()]);
      setDeviceTypes(d);
      setZoneTypes(z);
    } catch (e) { console.error('Failed to load catalogs', e); }
  }, []);

  useEffect(() => { refreshCatalogs(); }, [refreshCatalogs]);

  // Deep-link: /?design=<id> auto-loads that design once catalogs are ready
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const designId = params.get('design');
    if (!designId) return;
    (async () => {
      try {
        const d = await api.get(designId);
        setCurrentId(d.id);
        setName(d.name);
        setNodes(d.graph?.nodes ?? []);
        setEdges(styleEdges(d.graph?.edges ?? []));
      } catch (e) {
        console.error('Failed to auto-load design:', e);
      }
    })();
  }, [setNodes, setEdges]);

  const deviceByKey = useMemo(
    () => Object.fromEntries(deviceTypes.map((d) => [d.key, d])),
    [deviceTypes]
  );
  const zoneByKey = useMemo(
    () => Object.fromEntries(zoneTypes.map((z) => [z.key, z])),
    [zoneTypes]
  );

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(applyKind({ ...params, id: `e_${Date.now().toString(36)}_${tmpId++}` }, 'network'), eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/reactflow');
      if (!raw) return;
      const { kind, value } = JSON.parse(raw);
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      if (kind === 'device') {
        const d = deviceByKey[value];
        if (!d) return;
        // If the drop point is inside a zone, parent the device to that zone
        // and make the position relative to the zone's top-left. extent:
        // 'parent' then prevents it from being dragged outside.
        const parent = findContainingZone(nodes, position);
        const relPos = parent
          ? { x: position.x - parent.position.x, y: position.y - parent.position.y }
          : position;

        setNodes((nds) => nds.concat({
          id: nextId(),
          type: 'device',
          position: relPos,
          ...(parent ? { parentNode: parent.id, extent: 'parent' } : {}),
          data: {
            iconKey: d.iconKey,
            label: d.label,
            typeKey: d.key,
            ip: '',
            inputs: d.defaultInputs,
            outputs: d.defaultOutputs,
            capacity: d.defaultCapacity ?? '',
            risk: d.defaultRisk ?? null,
            phase: null,
          },
        }));
      } else if (kind === 'zone') {
        const z = zoneByKey[value];
        if (!z) return;
        setNodes((nds) => [
          {
            id: nextId(),
            type: 'zone',
            position,
            style: { width: z.defaultWidth, height: z.defaultHeight },
            data: { typeKey: z.key, label: z.label, color: z.color, sublabel: '' },
          },
          ...nds,
        ]);
      }
    },
    [screenToFlowPosition, setNodes, deviceByKey, zoneByKey, nodes]
  );

  const onPaletteDragStart = (event, kind, value) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ kind, value }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const newDesign = () => {
    setCurrentId(null);
    setName('Untitled design');
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const loadTemplate = (tpl) => {
    const g = cloneGraph(tpl.graph);
    setCurrentId(null);
    setName(tpl.name);
    setNodes(g.nodes);
    setEdges(styleEdges(g.edges));
    setSelectedNode(null);
    setSelectedEdge(null);
    setTemplateOpen(false);
    flash(`Loaded template: ${tpl.name}`);
  };

  const loadDesign = async (id) => {
    try {
      const d = await api.get(id);
      setCurrentId(d.id);
      setName(d.name);
      setNodes(d.graph?.nodes ?? []);
      setEdges(styleEdges(d.graph?.edges ?? []));
      flash(`Loaded "${d.name}"`);
    } catch (e) { flash(`Load failed: ${e.message}`); }
  };

  const saveDesign = async () => {
    const graph = { nodes, edges };
    try {
      if (currentId) {
        const d = await api.update(currentId, { name, graph });
        flash(`Saved "${d.name}"`);
      } else {
        const d = await api.create({ name, graph });
        setCurrentId(d.id);
        flash(`Created "${d.name}"`);
      }
      refreshList();
    } catch (e) { flash(`Save failed: ${e.message}`); }
  };

  const deleteDesign = async () => {
    if (!currentId) return;
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await api.remove(currentId);
      newDesign();
      refreshList();
      flash('Deleted');
    } catch (e) { flash(`Delete failed: ${e.message}`); }
  };

  const exportPng = async () => {
    try {
      await exportCanvasPng({ nodes, title: name, subtitle: summarySubtitle() });
      flash('Exported PNG');
    } catch (e) { flash(`Export failed: ${e.message}`); }
  };

  const updateSelectedNode = (patch) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n))
    );
    setSelectedNode((n) => ({ ...n, data: { ...n.data, ...patch } }));
  };

  const setPortCount = (kind, count) => {
    if (!selectedNode) return;
    const n = Math.max(0, Math.min(64, Number(count) || 0));
    const nodeId = selectedNode.id;
    updateSelectedNode({ [kind]: n });
    setEdges((eds) =>
      eds.filter((e) => {
        if (kind === 'outputs' && e.source === nodeId && e.sourceHandle) {
          const idx = Number(e.sourceHandle.replace('out-', ''));
          return idx < n;
        }
        if (kind === 'inputs' && e.target === nodeId && e.targetHandle) {
          const idx = Number(e.targetHandle.replace('in-', ''));
          return idx < n;
        }
        return true;
      })
    );
  };

  const updateSelectedEdge = (patch) => {
    if (!selectedEdge) return;
    setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? { ...e, ...patch } : e)));
    setSelectedEdge((e) => ({ ...e, ...patch }));
  };

  const changeEdgeKind = (kindKey) => {
    if (!selectedEdge) return;
    setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? applyKind(e, kindKey) : e)));
    setSelectedEdge((e) => applyKind(e, kindKey));
  };

  const deleteSelected = () => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
    } else if (selectedEdge) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
    }
  };

  const summary = useMemo(() => {
    const riskCounts = { low: 0, medium: 0, high: 0 };
    const phases = new Map();
    let deviceCount = 0;
    for (const n of nodes) {
      if (n.type === 'zone') continue;
      deviceCount++;
      if (n.data?.risk && riskCounts[n.data.risk] != null) riskCounts[n.data.risk]++;
      const p = n.data?.phase;
      if (p) phases.set(p, (phases.get(p) ?? 0) + 1);
    }
    return { riskCounts, phases: [...phases.entries()], deviceCount };
  }, [nodes]);

  const summarySubtitle = () => {
    const parts = [`${summary.deviceCount} devices`];
    if (summary.riskCounts.high) parts.push(`${summary.riskCounts.high} high-risk`);
    if (summary.phases.length) parts.push(summary.phases.map(([p, c]) => `${p} (${c})`).join(' · '));
    return parts.join(' · ');
  };

  return (
    <div className="app">
      <div className="topbar">
        <h1>Network Design</h1>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Design name"
        />
        <div className="mode-switch" role="tablist" aria-label="View mode">
          <button
            className={mode === 'management' ? 'active' : ''}
            onClick={() => setMode('management')}
          >Management</button>
          <button
            className={mode === 'engineer' ? 'active' : ''}
            onClick={() => setMode('engineer')}
          >Engineer</button>
        </div>
        <div className="spacer" />
        <div className="menu">
          <button className="btn secondary" onClick={() => setTemplateOpen((v) => !v)}>
            Templates ▾
          </button>
          {templateOpen && (
            <div className="menu-pop">
              {TEMPLATES.map((t) => (
                <button key={t.id} className="menu-item" onClick={() => loadTemplate(t)}>
                  <div className="menu-item-title">{t.name}</div>
                  <div className="menu-item-desc">{t.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn secondary" onClick={newDesign}>New</button>
        <a className="btn secondary" href="/designs">Designs</a>
        <button className="btn secondary" onClick={exportPng}>Export PNG</button>
        <button className="btn" onClick={saveDesign}>Save</button>
        {currentId && <button className="btn danger" onClick={deleteDesign}>Delete</button>}
        {me?.role === 'admin' && (
          <a className="btn secondary" href="/admin" title="Admin portal">⚙︎ Admin</a>
        )}
        <a className="btn secondary" href="/profile" title={me?.email}>
          {me?.displayName || me?.email?.split('@')[0] || 'Profile'}
        </a>
      </div>

      <aside className="palette">
        <h2>Zones</h2>
        {zoneTypes.length === 0 && <div className="hint small">Loading…</div>}
        {zoneTypes.map((z) => (
          <div
            key={z.key}
            className="palette-item zone-chip"
            draggable
            onDragStart={(e) => onPaletteDragStart(e, 'zone', z.key)}
            style={{ borderColor: z.color }}
            title={z.description}
          >
            <span className="zone-swatch" style={{ background: z.color }} />
            <span>{z.label}</span>
          </div>
        ))}

        <h2>Devices</h2>
        {deviceTypes.length === 0 && <div className="hint small">Loading…</div>}
        {deviceTypes.map((d) => (
          <div
            key={d.key}
            className="palette-item"
            draggable
            onDragStart={(e) => onPaletteDragStart(e, 'device', d.key)}
            title={d.description}
          >
            <DeviceIcon iconKey={d.iconKey} size={28} />
            <span>{d.label}</span>
          </div>
        ))}

      </aside>

      <div className={`canvas mode-${mode}`} ref={wrapperRef} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => { setSelectedNode(node); setSelectedEdge(null); }}
          onEdgeClick={(_, edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
          onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); setTemplateOpen(false); }}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ type: 'smoothstep', pathOptions: { borderRadius: 12 } }}
        >
          <Background gap={16} size={1} color="#334155" />
          <Controls />
          <MiniMap pannable zoomable maskColor="rgba(15,23,42,0.6)" />
        </ReactFlow>
        <SummaryPill summary={summary} />
        {(selectedNode || selectedEdge) && (
          <InspectorPopup onClose={() => { setSelectedNode(null); setSelectedEdge(null); }}>
            {selectedNode && selectedNode.type === 'zone' && (
              <ZoneInspector node={selectedNode} onChange={updateSelectedNode} onDelete={deleteSelected} />
            )}
            {selectedNode && selectedNode.type === 'device' && (
              <NodeInspector
                node={selectedNode}
                mode={mode}
                onChange={updateSelectedNode}
                onPortChange={setPortCount}
                onDelete={deleteSelected}
              />
            )}
            {selectedEdge && (
              <EdgeInspector
                edge={selectedEdge}
                mode={mode}
                onChange={updateSelectedEdge}
                onKindChange={changeEdgeKind}
                onDelete={deleteSelected}
              />
            )}
          </InspectorPopup>
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}

function InspectorPopup({ onClose, children }) {
  return (
    <div className="inspector-popup" onMouseDown={(e) => e.stopPropagation()}>
      <button className="inspector-close" onClick={onClose} aria-label="Close">×</button>
      {children}
    </div>
  );
}

function SummaryPill({ summary }) {
  const { riskCounts, phases, deviceCount } = summary;
  if (deviceCount === 0) return null;
  return (
    <div className="summary-pill">
      <span><strong>{deviceCount}</strong> devices</span>
      {(riskCounts.high || riskCounts.medium || riskCounts.low) > 0 && (
        <span className="risk-bar">
          <span className="rb-h" title={`${riskCounts.high} high`}>{riskCounts.high}</span>
          <span className="rb-m" title={`${riskCounts.medium} medium`}>{riskCounts.medium}</span>
          <span className="rb-l" title={`${riskCounts.low} low`}>{riskCounts.low}</span>
        </span>
      )}
      {phases.length > 0 && (
        <span className="summary-pill-phases">
          {phases.map(([p, c]) => `${p} ${c}`).join(' · ')}
        </span>
      )}
    </div>
  );
}

function NodeInspector({ node, mode, onChange, onPortChange, onDelete }) {
  const d = node.data ?? {};
  const engineer = mode === 'engineer';
  return (
    <>
      <h2>Device{engineer ? ' (engineer)' : ''}</h2>
      <label>Type</label>
      <input value={d.typeKey ?? d.iconKey ?? '—'} disabled />
      <label>Label</label>
      <input value={d.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} />
      <label>Capacity / detail</label>
      <input
        value={d.capacity ?? ''}
        onChange={(e) => onChange({ capacity: e.target.value })}
        placeholder="500 users, 10 Gbps, 40 TB…"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label>Risk</label>
          <select value={d.risk ?? ''} onChange={(e) => onChange({ risk: e.target.value || null })}>
            <option value="">—</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label>Phase</label>
          <input
            value={d.phase ?? ''}
            onChange={(e) => onChange({ phase: e.target.value || null })}
            placeholder="Current, Phase 1…"
          />
        </div>
      </div>

      {engineer && (
        <>
          <h2 style={{ marginTop: 14 }}>Engineering</h2>
          <label>Hostname</label>
          <input
            value={d.hostname ?? ''}
            onChange={(e) => onChange({ hostname: e.target.value })}
            placeholder="dc-wms-01"
          />
          <label>IP / subnet</label>
          <input
            value={d.ip ?? ''}
            onChange={(e) => onChange({ ip: e.target.value })}
            placeholder="10.20.30.10/24"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label>VLAN</label>
              <input
                value={d.vlan ?? ''}
                onChange={(e) => onChange({ vlan: e.target.value })}
                placeholder="10"
              />
            </div>
            <div>
              <label>OS / model</label>
              <input
                value={d.model ?? ''}
                onChange={(e) => onChange({ model: e.target.value })}
                placeholder="RHEL 9 / C9300"
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label>Input ports</label>
              <input type="number" min="0" max="64"
                value={d.inputs ?? 0}
                onChange={(e) => onPortChange('inputs', e.target.value)} />
            </div>
            <div>
              <label>Output ports</label>
              <input type="number" min="0" max="64"
                value={d.outputs ?? 0}
                onChange={(e) => onPortChange('outputs', e.target.value)} />
            </div>
          </div>
          <label>Notes</label>
          <textarea
            rows="3"
            value={d.notes ?? ''}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </>
      )}

      <button className="btn danger" onClick={onDelete}>Delete device</button>
    </>
  );
}

function ZoneInspector({ node, onChange, onDelete }) {
  const d = node.data ?? {};
  return (
    <>
      <h2>Zone</h2>
      <label>Label</label>
      <input value={d.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} />
      <label>Sublabel</label>
      <input
        value={d.sublabel ?? ''}
        onChange={(e) => onChange({ sublabel: e.target.value })}
        placeholder="Optional caption"
      />
      <label>Color</label>
      <input
        type="color"
        value={d.color ?? '#38bdf8'}
        onChange={(e) => onChange({ color: e.target.value })}
      />
      <p className="hint">Drag the corner to resize. Zones sit behind devices.</p>
      <button className="btn danger" onClick={onDelete}>Delete zone</button>
    </>
  );
}

function EdgeInspector({ edge, mode, onChange, onKindChange, onDelete }) {
  const kindKey = edge.data?.kind ?? 'network';
  const kind = EDGE_KINDS_BY_KEY[kindKey] ?? EDGE_KINDS_BY_KEY.network;
  const engineer = mode === 'engineer';
  const d = edge.data ?? {};
  const setData = (patch) => onChange({ data: { ...d, ...patch } });
  return (
    <>
      <h2>Connection</h2>
      <label>Connection kind</label>
      <select value={kindKey} onChange={(e) => onKindChange(e.target.value)}>
        {EDGE_KINDS.map((k) => (
          <option key={k.key} value={k.key}>{k.label}</option>
        ))}
      </select>
      <p className="hint small">{kind.description}</p>

      <label>Label</label>
      <input
        value={edge.label ?? ''}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Primary · MPLS, Backup · 5G…"
      />
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={!!edge.animated}
          onChange={(e) => onChange({ animated: e.target.checked })}
        /> Animated flow
      </label>

      <label>Line color (override)</label>
      <input
        type="color"
        value={edge.style?.stroke ?? kind.style.stroke ?? '#94a3b8'}
        onChange={(e) => onChange({ style: { ...(edge.style ?? {}), stroke: e.target.value } })}
      />

      {engineer && (
        <>
          <h2 style={{ marginTop: 14 }}>Engineering</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label>Bandwidth</label>
              <input
                value={d.bandwidth ?? ''}
                onChange={(e) => setData({ bandwidth: e.target.value })}
                placeholder="1 Gbps"
              />
            </div>
            <div>
              <label>VLAN</label>
              <input
                value={d.vlan ?? ''}
                onChange={(e) => setData({ vlan: e.target.value })}
                placeholder="10"
              />
            </div>
          </div>
          <label>Protocol / notes</label>
          <input
            value={d.protocol ?? ''}
            onChange={(e) => setData({ protocol: e.target.value })}
            placeholder="OSPF · BGP · IPsec"
          />
        </>
      )}

      <div style={{ height: 8 }} />
      <button className="btn danger" onClick={onDelete}>Delete connection</button>
    </>
  );
}

function Root() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = unauthed
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';

  const refreshMe = useCallback(async () => {
    try { setMe(await authApi.me()); }
    catch (e) { if (e.status === 401) setMe(null); else console.error(e); }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  if (me === undefined) {
    return <div className="auth-shell"><div className="hint">Loading…</div></div>;
  }

  if (!me || !me.user || me.mfaRequired) {
    return (
      <LoginPage
        mode={path === '/register' ? 'register' : 'login'}
        initialMfa={!!me?.mfaRequired}
        onAuthed={refreshMe}
      />
    );
  }

  if (path.startsWith('/admin')) {
    if (me.user.role !== 'admin') return <Forbidden me={me.user} />;
    return <AdminPortal />;
  }
  if (path.startsWith('/profile')) {
    return <ProfilePage me={me.user} onChange={refreshMe} />;
  }
  if (path.startsWith('/designs')) {
    return <DesignsPage me={me.user} />;
  }

  return (
    <ReactFlowProvider>
      <Editor me={me.user} />
    </ReactFlowProvider>
  );
}

function Forbidden({ me }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Admin only</h1>
        <p className="hint">
          Your account ({me.email}) doesn't have access to this page.
        </p>
        <a className="btn" href="/">← Back to editor</a>
      </div>
    </div>
  );
}

export default function App() { return <Root />; }
