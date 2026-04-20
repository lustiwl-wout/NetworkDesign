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
import ZoneNode, { ZONE_PRESETS } from './ZoneNode.jsx';
import DeviceIcon from './DeviceIcons.jsx';
import { NODE_CATALOG, CATALOG_BY_TYPE } from './nodeTypes.js';
import { TEMPLATES } from './templates/index.js';
import { api } from './api.js';
import { exportCanvasPng } from './exportImage.js';

const nodeTypes = {
  ...Object.fromEntries(NODE_CATALOG.map((n) => [n.type, NetworkNode])),
  zone: ZoneNode,
};

let tmpId = 1;
const nextId = () => `n_${Date.now().toString(36)}_${tmpId++}`;
const cloneGraph = (g) => JSON.parse(JSON.stringify(g));

function Editor() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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

  useEffect(() => { refreshList(); }, [refreshList]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: false, label: '' }, eds)),
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
        const meta = CATALOG_BY_TYPE[value];
        setNodes((nds) => nds.concat({
          id: nextId(),
          type: value,
          position,
          data: {
            label: meta.label,
            ip: '',
            inputs: meta.defaultInputs,
            outputs: meta.defaultOutputs,
            costAnnual: null,
            capacity: '',
            risk: null,
            phase: null,
          },
        }));
      } else if (kind === 'zone') {
        const preset = ZONE_PRESETS[value];
        setNodes((nds) => [
          { id: nextId(), type: 'zone', position, style: { width: 360, height: 240 },
            data: { preset: value, label: preset.label } },
          ...nds,
        ]);
      }
    },
    [screenToFlowPosition, setNodes]
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
    setEdges(g.edges);
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
      setEdges(d.graph?.edges ?? []);
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
    let annualCost = 0;
    const riskCounts = { low: 0, medium: 0, high: 0 };
    const phases = new Map();
    let deviceCount = 0;
    for (const n of nodes) {
      if (n.type === 'zone') continue;
      deviceCount++;
      const c = Number(n.data?.costAnnual);
      if (Number.isFinite(c)) annualCost += c;
      if (n.data?.risk && riskCounts[n.data.risk] != null) riskCounts[n.data.risk]++;
      const p = n.data?.phase;
      if (p) phases.set(p, (phases.get(p) ?? 0) + 1);
    }
    return { annualCost, riskCounts, phases: [...phases.entries()], deviceCount };
  }, [nodes]);

  const summarySubtitle = () => {
    const parts = [`${summary.deviceCount} devices`];
    if (summary.annualCost > 0) parts.push(fmtMoney(summary.annualCost));
    if (summary.riskCounts.high) parts.push(`${summary.riskCounts.high} high-risk`);
    return parts.join(' · ');
  };

  const catalog = useMemo(() => NODE_CATALOG, []);
  const zonePresets = Object.entries(ZONE_PRESETS);

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
      </div>

      <aside className="palette">
        <h2>Zones</h2>
        {zonePresets.map(([key, p]) => (
          <div
            key={key}
            className="palette-item zone-chip"
            draggable
            onDragStart={(e) => onPaletteDragStart(e, 'zone', key)}
            style={{ borderColor: p.color }}
          >
            <span className="zone-swatch" style={{ background: p.color }} />
            <span>{p.label}</span>
          </div>
        ))}

        <h2>Devices</h2>
        {catalog.map((n) => (
          <div
            key={n.type}
            className="palette-item"
            draggable
            onDragStart={(e) => onPaletteDragStart(e, 'device', n.type)}
          >
            <DeviceIcon type={n.type} size={28} />
            <span>{n.label}</span>
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

        {selectedNode && selectedNode.type !== 'zone' && (
          <NodeInspector
            node={selectedNode}
            advanced={advanced}
            onChange={updateSelectedNode}
            onPortChange={setPortCount}
            onDelete={deleteSelected}
          />
        )}

        {selectedEdge && (
          <EdgeInspector edge={selectedEdge} onChange={updateSelectedEdge} onDelete={deleteSelected} />
        )}

        {!selectedNode && !selectedEdge && (
          <>
            <h2>How to use</h2>
            <p className="hint">
              Drag <b>zones</b> first to frame the architecture (e.g. Production, IRE, Cloud),
              then drop <b>devices</b> inside them. Click anything to edit its label, cost,
              capacity, risk, and phase. Use <b>Templates</b> to start from a reference design.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function SummaryCard({ summary }) {
  const { annualCost, riskCounts, phases, deviceCount } = summary;
  return (
    <div className="summary">
      <h2>Business summary</h2>
      <div className="summary-row">
        <span>Devices</span>
        <strong>{deviceCount}</strong>
      </div>
      <div className="summary-row">
        <span>Annual cost</span>
        <strong>{annualCost > 0 ? fmtMoney(annualCost) : '—'}</strong>
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
      <input value={node.type} disabled />
      <label>Label</label>
      <input value={d.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} />
      <label>Capacity / detail</label>
      <input
        value={d.capacity ?? ''}
        onChange={(e) => onChange({ capacity: e.target.value })}
        placeholder="500 users, 10 Gbps, 40 TB…"
      />
      <label>Annual cost (USD)</label>
      <input
        type="number"
        min="0"
        step="1000"
        value={d.costAnnual ?? ''}
        onChange={(e) => onChange({ costAnnual: e.target.value === '' ? null : Number(e.target.value) })}
        placeholder="0"
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
              <input
                type="number" min="0" max="64"
                value={d.inputs ?? 0}
                onChange={(e) => onPortChange('inputs', e.target.value)}
              />
            </div>
            <div>
              <label>Output ports</label>
              <input
                type="number" min="0" max="64"
                value={d.outputs ?? 0}
                onChange={(e) => onPortChange('outputs', e.target.value)}
              />
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
        value={d.color ?? ZONE_PRESETS[d.preset ?? 'generic'].color}
        onChange={(e) => onChange({ color: e.target.value })}
      />
      <p className="hint">Drag the corner to resize. Zones sit behind devices and won't be moved with them.</p>
      <button className="btn danger" onClick={onDelete}>Delete zone</button>
    </>
  );
}

function EdgeInspector({ edge, onChange, onDelete }) {
  return (
    <>
      <h2>Connection</h2>
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

function fmtMoney(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M/yr`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k/yr`;
  return `$${v}/yr`;
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
