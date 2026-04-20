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
import { TEMPLATES } from './templates/index.js';
import { api } from './api.js';
import { deviceTypesApi, zoneTypesApi } from './catalogApi.js';
import { EDGE_KINDS, EDGE_KINDS_BY_KEY, applyKind } from './edgePresets.js';
import { exportCanvasPng } from './exportImage.js';

const nodeTypes = { device: NetworkNode, zone: ZoneNode };

let tmpId = 1;
const nextId = () => `n_${Date.now().toString(36)}_${tmpId++}`;
const cloneGraph = (g) => JSON.parse(JSON.stringify(g));

function styleEdges(edges) {
  return edges.map((e) => {
    const kind = e.data?.kind ?? 'network';
    return applyKind(e, kind);
  });
}

function Editor() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [zoneTypes, setZoneTypes] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [name, setName] = useState('Untitled design');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [toast, setToast] = useState(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const wrapperRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const refreshList = useCallback(async () => {
    try { setDesigns(await api.list()); } catch (e) { console.error(e); }
  }, []);
  const refreshCatalogs = useCallback(async () => {
    try {
      const [d, z] = await Promise.all([deviceTypesApi.list(), zoneTypesApi.list()]);
      setDeviceTypes(d);
      setZoneTypes(z);
    } catch (e) { console.error('Failed to load catalogs', e); }
  }, []);

  useEffect(() => { refreshList(); refreshCatalogs(); }, [refreshList, refreshCatalogs]);

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
        setNodes((nds) => nds.concat({
          id: nextId(),
          type: 'device',
          position,
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
    [screenToFlowPosition, setNodes, deviceByKey, zoneByKey]
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
        <button className="btn secondary" onClick={exportPng}>Export PNG</button>
        <button className="btn" onClick={saveDesign}>Save</button>
        {currentId && <button className="btn danger" onClick={deleteDesign}>Delete</button>}
        <a className="btn secondary" href="/admin" title="Admin portal">⚙︎ Admin</a>
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

        <h2>View</h2>
        <label className="toggle-row">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          Show engineering details
        </label>
      </aside>

      <div className={`canvas${advanced ? '' : ' hide-ports'}`} ref={wrapperRef} onDrop={onDrop} onDragOver={onDragOver}>
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
        >
          <Background gap={16} size={1} color="#334155" />
          <Controls />
          <MiniMap pannable zoomable maskColor="rgba(15,23,42,0.6)" />
        </ReactFlow>
        {toast && <div className="toast">{toast}</div>}
      </div>

      <aside className="sidebar">
        <SummaryCard summary={summary} />

        <h2>Designs</h2>
        <ul className="design-list">
          {designs.length === 0 && <li className="meta">No saved designs</li>}
          {designs.map((d) => (
            <li
              key={d.id}
              className={d.id === currentId ? 'active' : ''}
              onClick={() => loadDesign(d.id)}
            >
              <span>{d.name}</span>
              <span className="meta">{new Date(d.updated_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>

        {selectedNode && selectedNode.type === 'zone' && (
          <ZoneInspector node={selectedNode} onChange={updateSelectedNode} onDelete={deleteSelected} />
        )}
        {selectedNode && selectedNode.type === 'device' && (
          <NodeInspector
            node={selectedNode}
            advanced={advanced}
            onChange={updateSelectedNode}
            onPortChange={setPortCount}
            onDelete={deleteSelected}
          />
        )}
        {selectedEdge && (
          <EdgeInspector
            edge={selectedEdge}
            onChange={updateSelectedEdge}
            onKindChange={changeEdgeKind}
            onDelete={deleteSelected}
          />
        )}
        {!selectedNode && !selectedEdge && (
          <>
            <h2>How to use</h2>
            <p className="hint">
              Drag <b>zones</b> first to frame the architecture (e.g. Production, IRE, Cloud),
              then drop <b>devices</b> inside them. Click anything to edit it. Use <b>Templates</b>
              to start from a reference design. Manage the device / zone catalog from the
              <b> Admin</b> page.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function SummaryCard({ summary }) {
  const { riskCounts, phases, deviceCount } = summary;
  return (
    <div className="summary">
      <h2>Design summary</h2>
      <div className="summary-row">
        <span>Devices</span>
        <strong>{deviceCount}</strong>
      </div>
      <div className="summary-row">
        <span>Risk</span>
        <span className="risk-bar">
          <span className="rb-h" title={`${riskCounts.high} high`}>{riskCounts.high}</span>
          <span className="rb-m" title={`${riskCounts.medium} medium`}>{riskCounts.medium}</span>
          <span className="rb-l" title={`${riskCounts.low} low`}>{riskCounts.low}</span>
        </span>
      </div>
      {phases.length > 0 && (
        <div className="summary-row">
          <span>Phases</span>
          <span>{phases.map(([p, c]) => `${p} (${c})`).join(' · ')}</span>
        </div>
      )}
    </div>
  );
}

function NodeInspector({ node, advanced, onChange, onPortChange, onDelete }) {
  const d = node.data ?? {};
  return (
    <>
      <h2>Device</h2>
      <label>Type</label>
      <input value={d.typeKey ?? '—'} disabled />
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

      {advanced && (
        <>
          <label>IP</label>
          <input
            value={d.ip ?? ''}
            onChange={(e) => onChange({ ip: e.target.value })}
            placeholder="10.0.0.1"
          />
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

function EdgeInspector({ edge, onChange, onKindChange, onDelete }) {
  const kindKey = edge.data?.kind ?? 'network';
  const kind = EDGE_KINDS_BY_KEY[kindKey] ?? EDGE_KINDS_BY_KEY.network;
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
        placeholder="1 Gbps, MPLS, One-way…"
      />
      <label>
        <input
          type="checkbox"
          checked={!!edge.animated}
          onChange={(e) => onChange({ animated: e.target.checked })}
        /> Animated flow
      </label>
      <div style={{ height: 8 }} />
      <button className="btn danger" onClick={onDelete}>Delete connection</button>
    </>
  );
}

function Root() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path.startsWith('/admin')) return <AdminPortal />;
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}

export default function App() { return <Root />; }
