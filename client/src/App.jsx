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
import AnnotationNode from './AnnotationNode.jsx';
import SmartEdge from './SmartEdge.jsx';
import DeviceIcon, { ICON_META } from './DeviceIcons.jsx';
import AdminPortal from './AdminPortal.jsx';
import DesignsPage from './DesignsPage.jsx';
import LoginPage from './LoginPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import { api } from './api.js';
import { deviceTypesApi, zoneTypesApi, edgeKindsApi } from './catalogApi.js';
import { authApi } from './authApi.js';
import {
  applyKind,
  getEdgeKinds,
  getEdgeKind,
  setEdgeKinds as setEdgeKindsModule,
} from './edgePresets.js';
import { exportCanvasPng } from './exportImage.js';

const nodeTypes = { device: NetworkNode, zone: ZoneNode, annotation: AnnotationNode };
const edgeTypes = { smart: SmartEdge };

let tmpId = 1;
const nextId = () => `n_${Date.now().toString(36)}_${tmpId++}`;

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
  // Write access: logged in as user or admin (but not the view-only "viewer" role).
  const canSave = !!me && me.role !== 'viewer';
  const isAdmin = me?.role === 'admin';
  const [theme, setTheme] = useTheme();
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  // nodeId -> { cx, cy } in flow coords. Populated when a user drops a
  // palette item; consumed once the node's real dimensions are measured,
  // then the node is re-centred exactly on the cursor.
  const pendingDropRef = useRef(new Map());

  const onNodesChange = useCallback((changes) => {
    onNodesChangeRaw(changes);
    for (const ch of changes) {
      if (ch.type !== 'dimensions' || !ch.dimensions) continue;
      const pending = pendingDropRef.current.get(ch.id);
      if (!pending) continue;
      pendingDropRef.current.delete(ch.id);
      const { cx, cy } = pending;
      const w = ch.dimensions.width;
      const h = ch.dimensions.height;
      const snap = (v) => Math.round(v / 10) * 10;
      const newTop = { x: snap(cx - w / 2), y: snap(cy - h / 2) };
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== ch.id) return n;
          // If parented to a zone, keep parentNode and translate the
          // absolute-centre position into parent-relative coords.
          if (n.parentNode) {
            const parent = nds.find((p) => p.id === n.parentNode);
            if (parent) {
              return { ...n, position: { x: newTop.x - parent.position.x, y: newTop.y - parent.position.y } };
            }
          }
          return { ...n, position: newTop };
        })
      );
    }
  }, [onNodesChangeRaw, setNodes]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [zoneTypes, setZoneTypes] = useState([]);
  const [edgeKinds, setEdgeKindsState] = useState(getEdgeKinds());
  const [currentId, setCurrentId] = useState(null);
  const [name, setName] = useState('Untitled design');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [toast, setToast] = useState(null);
  const [present, setPresent] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState(null); // null = show all
  const [view, setView] = useState(me?.defaultView ?? 'management'); // 'management' | 'engineering'
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [allDesigns, setAllDesigns] = useState([]);
  const wrapperRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const refreshCatalogs = useCallback(async () => {
    try {
      const [d, z, k] = await Promise.all([
        deviceTypesApi.list(),
        zoneTypesApi.list(),
        edgeKindsApi.list(),
      ]);
      setDeviceTypes(d);
      setZoneTypes(z);
      if (Array.isArray(k) && k.length) {
        setEdgeKindsModule(k);   // updates module-level store so applyKind sees it
        setEdgeKindsState(k);     // triggers React re-render for the inspector
      }
    } catch (e) { console.error('Failed to load catalogs', e); }
  }, []);

  useEffect(() => { refreshCatalogs(); }, [refreshCatalogs]);

  // Designs list is used by the boundary-device inspector to pick a linked target.
  useEffect(() => {
    (async () => {
      try { setAllDesigns(await api.list()); } catch {}
    })();
  }, [currentId]);

  // Escape exits presentation mode
  useEffect(() => {
    if (!present) return;
    const onKey = (e) => { if (e.key === 'Escape') setPresent(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [present]);

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

  const onConnect = useCallback((params) => {
    // Floating edges: strip the specific handle the user dragged from /
    // onto, so the edge re-anchors to the closest side instead of stuck
    // on whichever anchor happened to be under the cursor.
    const edge = applyKind({
      id: `e_${Date.now().toString(36)}_${tmpId++}`,
      source: params.source,
      target: params.target,
      type: 'smart',
    }, 'network');
    setEdges((eds) => addEdge(edge, eds));
  }, [setEdges]);

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
      const cursor = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      // Rough initial position so the node shows up near the cursor in
      // the first frame. The real centring happens in onNodesChange
      // (dimensions event) once React Flow measures the actual size.
      let estW = 180, estH = 160;
      if (kind === 'zone') {
        const z = zoneByKey[value];
        if (z) { estW = z.defaultWidth; estH = z.defaultHeight; }
      } else if (kind === 'annotation') {
        estW = 220; estH = 80;
      }
      const snap = (v) => Math.round(v / 10) * 10;
      const position = { x: snap(cursor.x - estW / 2), y: snap(cursor.y - estH / 2) };

      const id = nextId();
      // Record the intended cursor centre so onNodesChange can reposition
      // this node once the real width / height are known.
      pendingDropRef.current.set(id, { cx: cursor.x, cy: cursor.y });

      if (kind === 'device') {
        const d = deviceByKey[value];
        if (!d) { pendingDropRef.current.delete(id); return; }
        const parent = findContainingZone(nodes, { x: cursor.x, y: cursor.y });
        const relPos = parent
          ? { x: position.x - parent.position.x, y: position.y - parent.position.y }
          : position;

        setNodes((nds) => nds.concat({
          id,
          type: 'device',
          position: relPos,
          ...(parent ? { parentNode: parent.id } : {}),
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
        if (!z) { pendingDropRef.current.delete(id); return; }
        setNodes((nds) => [
          {
            id,
            type: 'zone',
            position,
            style: { width: z.defaultWidth, height: z.defaultHeight },
            zIndex: -1,
            data: { typeKey: z.key, label: z.label, color: z.color, sublabel: '' },
          },
          ...nds,
        ]);
      } else if (kind === 'annotation') {
        setNodes((nds) => nds.concat({
          id,
          type: 'annotation',
          position,
          style: { width: 220, height: 80 },
          data: {
            text: 'Click to edit this note',
            title: '',
            color: value === 'warning' ? '#ef4444'
                 : value === 'success' ? '#22c55e'
                 : '#facc15',
            variant: value === 'note' ? 'note' : 'callout',
          },
        }));
      }
    },
    [screenToFlowPosition, setNodes, deviceByKey, zoneByKey, nodes]
  );

  const onPaletteDragStart = (event, kind, value) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ kind, value }));
    event.dataTransfer.effectAllowed = 'move';
  };

  // Re-parent devices when dragged across zones. Zones don't clamp their
  // children (extent: 'parent') so this runs on every drag.
  const onNodeDragStop = useCallback((_event, node) => {
    if (node.type !== 'device') return;
    const absPos = node.positionAbsolute
      ?? (node.parentNode
        ? (() => {
            const p = nodes.find((n) => n.id === node.parentNode);
            return p ? { x: node.position.x + p.position.x, y: node.position.y + p.position.y } : node.position;
          })()
        : node.position);
    const newParent = findContainingZone(nodes, absPos);
    const newParentId = newParent?.id ?? undefined;
    if (newParentId === (node.parentNode ?? undefined)) return;
    setNodes((nds) => nds.map((n) => {
      if (n.id !== node.id) return n;
      const relPos = newParent
        ? { x: absPos.x - newParent.position.x, y: absPos.y - newParent.position.y }
        : absPos;
      const next = { ...n, position: relPos };
      if (newParentId) next.parentNode = newParentId;
      else delete next.parentNode;
      return next;
    }));
  }, [nodes, setNodes]);

  const newDesign = () => {
    setCurrentId(null);
    setName('Untitled design');
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setSelectedEdge(null);
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
    if (!canSave) {
      flash('Demo mode — Save is disabled. Use Export PNG.');
      return;
    }
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
    } catch (e) { flash(`Save failed: ${e.message}`); }
  };

  const loadVersions = useCallback(async () => {
    if (!currentId) { setVersions([]); return; }
    try { setVersions(await api.versions(currentId)); }
    catch (e) { flash(`History: ${e.message}`); }
  }, [currentId]);

  const restoreVersion = async (vid) => {
    if (!currentId) return;
    if (!confirm('Restore this version? Current unsaved changes will be lost.')) return;
    try {
      const d = await api.restoreVersion(currentId, vid);
      setName(d.name);
      setNodes(d.graph?.nodes ?? []);
      setEdges(styleEdges(d.graph?.edges ?? []));
      setHistoryOpen(false);
      flash('Restored');
    } catch (e) { flash(`Restore failed: ${e.message}`); }
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
      await exportCanvasPng({ nodes, edges, title: name });
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

  // Build the sorted set of phase values present in the design
  const phaseOptions = useMemo(() => {
    const set = new Set();
    for (const n of nodes) if (n.type === 'device' && n.data?.phase) set.add(n.data.phase);
    return [...set].sort();
  }, [nodes]);

  // Apply phase filter: dim devices whose phase doesn't match; zones /
  // annotations / boundary pass-through unchanged. Edges connected to
  // a dimmed device get dimmed too so the story stays coherent.
  const { phasedNodes, phasedEdges } = useMemo(() => {
    if (!phaseFilter) return { phasedNodes: nodes, phasedEdges: edges };
    const dimOpacity = 0.18;
    const dimmedIds = new Set();
    const pnodes = nodes.map((n) => {
      if (n.type !== 'device') return n;
      const matches = n.data?.phase === phaseFilter || !n.data?.phase;
      if (matches) return n;
      dimmedIds.add(n.id);
      return { ...n, style: { ...(n.style ?? {}), opacity: dimOpacity } };
    });
    const pedges = edges.map((e) => {
      const dim = dimmedIds.has(e.source) || dimmedIds.has(e.target);
      if (!dim) return e;
      return { ...e, style: { ...(e.style ?? {}), opacity: dimOpacity } };
    });
    return { phasedNodes: pnodes, phasedEdges: pedges };
  }, [nodes, edges, phaseFilter]);

  const summary = useMemo(() => {
    const riskCounts = { low: 0, medium: 0, high: 0 };
    const phases = new Map();
    let deviceCount = 0;
    let inputCount = 0;
    let outputCount = 0;
    for (const n of nodes) {
      if (n.type === 'zone') continue;
      if (n.type === 'device') {
        deviceCount++;
        if (n.data?.iconKey === 'boundary-input')  inputCount++;
        if (n.data?.iconKey === 'boundary-output') outputCount++;
      }
      if (n.data?.risk && riskCounts[n.data.risk] != null) riskCounts[n.data.risk]++;
      const p = n.data?.phase;
      if (p) phases.set(p, (phases.get(p) ?? 0) + 1);
    }
    return { riskCounts, phases: [...phases.entries()], deviceCount, inputCount, outputCount };
  }, [nodes]);

  return (
    <div className={`app${present ? ' presenting' : ''}`}>
      <div className="topbar">
        <h1>Network Design</h1>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Design name"
        />
        <button
          type="button"
          className="btn secondary theme-btn"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          title={theme === 'light' ? 'Switch to Dark theme' : 'Switch to Light theme'}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <>☀︎ <span>Light</span></> : <>🌙 <span>Dark</span></>}
        </button>
        <div className="view-switch" role="tablist" aria-label="View">
          <button
            type="button"
            className={view === 'management' ? 'active' : ''}
            onClick={() => setView('management')}
            title="Management view — clean, no IP / VLAN chrome"
          >Management</button>
          <button
            type="button"
            className={view === 'engineering' ? 'active' : ''}
            onClick={() => setView('engineering')}
            title="Engineering view — shows & edits IP, VLAN, hostname, protocol"
          >Engineering</button>
        </div>
        <div className="spacer" />
        {phaseOptions.length > 0 && (
          <select
            className="phase-filter"
            value={phaseFilter ?? ''}
            onChange={(e) => setPhaseFilter(e.target.value || null)}
            title="Filter view by phase"
          >
            <option value="">All phases</option>
            {phaseOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <button className="btn secondary" onClick={newDesign}>New</button>
        <a className="btn secondary" href="/designs">Designs</a>
        {canSave && currentId && (
          <button className="btn secondary" onClick={() => { setHistoryOpen(true); loadVersions(); }} title="Version history">
            History
          </button>
        )}
        <button className="btn secondary" onClick={exportPng}>Export PNG</button>
        <button className="btn secondary" onClick={() => setPresent(true)} title="Enter presentation mode (Esc to exit)">
          ▶ Present
        </button>
        {canSave && <button className="btn" onClick={saveDesign}>Save</button>}
        {canSave && currentId && (
          <button className="btn danger" onClick={deleteDesign}>Delete</button>
        )}
        {isAdmin && (
          <a className="btn secondary" href="/admin" title="Admin portal">⚙︎ Admin</a>
        )}
        {me ? (
          <a className="btn secondary" href="/profile" title={me.email}>
            {me.displayName || me.email?.split('@')[0] || 'Profile'}
          </a>
        ) : (
          <a className="btn" href="/login">Sign in</a>
        )}
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

        <h2>Annotations</h2>
        {[
          { key: 'callout', label: 'Callout', color: '#facc15' },
          { key: 'note',    label: 'Note',    color: '#38bdf8' },
          { key: 'warning', label: 'Warning', color: '#ef4444' },
          { key: 'success', label: 'Success', color: '#22c55e' },
        ].map((a) => (
          <div
            key={a.key}
            className="palette-item"
            draggable
            onDragStart={(e) => onPaletteDragStart(e, 'annotation', a.key)}
            title="Drag onto the canvas, then click to edit"
          >
            <span className="zone-swatch" style={{ background: a.color }} />
            <span>{a.label}</span>
          </div>
        ))}
      </aside>

      <div className={`canvas view-${view}`} ref={wrapperRef} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={phasedNodes}
          edges={phasedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => { setSelectedNode(node); setSelectedEdge(null); }}
          onEdgeClick={(_, edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode="loose"
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ type: 'smart' }}
          snapToGrid
          snapGrid={[10, 10]}
        >
          <Background gap={16} size={1} color="var(--grid)" />
          <Controls />
          <MiniMap pannable zoomable maskColor="rgba(15,23,42,0.6)" />
        </ReactFlow>
        {!canSave && (
          <div className="demo-banner" role="status">
            <strong>{me ? 'Demo account' : 'Guest mode'}</strong>
            <span>
              {me
                ? 'Your account is view-only. Use Export PNG to keep your work.'
                : 'You can build and explore templates, but designs aren\'t saved. '}
              {!me && <a href="/login">Sign in</a>}
              {!me && ' to save.'}
            </span>
          </div>
        )}
        <SummaryPill summary={summary} />
        {present && (
          <button className="present-exit" onClick={() => setPresent(false)} title="Exit presentation (Esc)">
            ✕ Exit
          </button>
        )}
        {(selectedNode || selectedEdge) && (
          <InspectorPopup onClose={() => { setSelectedNode(null); setSelectedEdge(null); }}>
            {selectedNode && selectedNode.type === 'zone' && (
              <ZoneInspector node={selectedNode} onChange={updateSelectedNode} onDelete={deleteSelected} />
            )}
            {selectedNode && selectedNode.type === 'device' && (
              <NodeInspector
                node={selectedNode}
                view={view}
                allDesigns={allDesigns}
                currentId={currentId}
                onChange={updateSelectedNode}
                onDelete={deleteSelected}
              />
            )}
            {selectedNode && selectedNode.type === 'annotation' && (
              <AnnotationInspector node={selectedNode} onChange={updateSelectedNode} onDelete={deleteSelected} />
            )}
            {selectedEdge && (
              <EdgeInspector
                edge={selectedEdge}
                view={view}
                edgeKinds={edgeKinds}
                onChange={updateSelectedEdge}
                onKindChange={changeEdgeKind}
                onDelete={deleteSelected}
              />
            )}
          </InspectorPopup>
        )}
        {historyOpen && (
          <HistoryPanel
            versions={versions}
            onRestore={restoreVersion}
            onClose={() => setHistoryOpen(false)}
          />
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}

function HistoryPanel({ versions, onRestore, onClose }) {
  return (
    <div className="side-panel" onMouseDown={(e) => e.stopPropagation()}>
      <header>
        <h2>Version history</h2>
        <button className="inspector-close" onClick={onClose}>×</button>
      </header>
      {versions.length === 0 && <p className="hint">No snapshots yet. Save the design to start a history.</p>}
      <ul className="version-list">
        {versions.map((v) => (
          <li key={v.id}>
            <div>
              <strong>{v.name}</strong>
              <div className="meta">
                {new Date(v.created_at).toLocaleString(undefined, {
                  dateStyle: 'medium', timeStyle: 'short',
                })}
                {v.created_by_email ? ` · ${v.created_by_email}` : ''}
              </div>
            </div>
            <button className="btn secondary small" onClick={() => onRestore(v.id)}>Restore</button>
          </li>
        ))}
      </ul>
      <p className="hint small">A new snapshot is captured on every Save. Oldest are pruned past 50.</p>
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

function NodeInspector({ node, view = 'management', allDesigns = [], currentId, onChange, onDelete }) {
  const d = node.data ?? {};
  const isBoundary = d.iconKey === 'boundary-input' || d.iconKey === 'boundary-output';
  const engineer = view === 'engineering';
  const linkable = allDesigns.filter((x) => x.id !== currentId);
  return (
    <>
      <h2>Device</h2>
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

      {isBoundary && (
        <>
          <label>Linked design</label>
          <select
            value={d.linkedDesignId ?? ''}
            onChange={(e) => onChange({ linkedDesignId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">— None —</option>
            {linkable.map((des) => (
              <option key={des.id} value={des.id}>{des.name}</option>
            ))}
          </select>
          {d.linkedDesignId && (
            <a className="btn secondary" href={`/?design=${d.linkedDesignId}`}>
              Open linked design →
            </a>
          )}
          <p className="hint small">
            Lets readers jump from this boundary to the other side of the
            connection (e.g. Shop → HQ).
          </p>
        </>
      )}

      {engineer && (
        <>
          <hr className="form-divider" />
          <h2>Engineering</h2>
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

function AnnotationInspector({ node, onChange, onDelete }) {
  const d = node.data ?? {};
  return (
    <>
      <h2>Annotation</h2>
      <label>Title (optional)</label>
      <input
        value={d.title ?? ''}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="e.g. Bottleneck"
      />
      <label>Text</label>
      <textarea
        rows="4"
        value={d.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Free-form note, callout, or context…"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label>Style</label>
          <select
            value={d.variant ?? 'callout'}
            onChange={(e) => onChange({ variant: e.target.value })}
          >
            <option value="callout">Callout (dashed)</option>
            <option value="note">Note (solid)</option>
          </select>
        </div>
        <div>
          <label>Color</label>
          <input
            type="color"
            value={d.color ?? '#facc15'}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
      </div>
      <button className="btn danger" onClick={onDelete}>Delete annotation</button>
    </>
  );
}

function EdgeInspector({ edge, view = 'management', edgeKinds = [], onChange, onKindChange, onDelete }) {
  const kindKey = edge.data?.kind ?? 'network';
  const kind = getEdgeKind(kindKey);
  // Defensive fallback: if the prop is empty for any reason, read the
  // module's current kinds so the dropdown is never empty.
  const kinds = edgeKinds.length ? edgeKinds : getEdgeKinds();
  const engineer = view === 'engineering';
  const d = edge.data ?? {};
  const setData = (patch) => onChange({ data: { ...d, ...patch } });
  return (
    <>
      <h2>Connection</h2>
      <label>Connection kind</label>
      <select value={kindKey} onChange={(e) => onKindChange(e.target.value)}>
        {kinds.map((k) => (
          <option key={k.key} value={k.key}>{k.label}</option>
        ))}
      </select>
      {kind.description && <p className="hint small">{kind.description}</p>}

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
        value={edge.style?.stroke ?? kind.stroke ?? '#94a3b8'}
        onChange={(e) => onChange({ style: { ...(edge.style ?? {}), stroke: e.target.value } })}
      />

      {engineer && (
        <>
          <hr className="form-divider" />
          <h2>Engineering</h2>
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

function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('theme-light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);
  return [theme, setTheme];
}

function Root() {
  useTheme();
  const [me, setMe] = useState(undefined); // undefined = loading
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';

  const refreshMe = useCallback(async () => {
    try { setMe(await authApi.me()); }
    catch (e) { console.error(e); setMe({ user: null }); }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  if (me === undefined) {
    return <div className="auth-shell"><div className="hint">Loading…</div></div>;
  }

  // A logged-in user whose MFA is still required must clear it first.
  if (me.user && me.mfaRequired) {
    return <LoginPage initialMfa onAuthed={refreshMe} />;
  }

  // Explicit /login URL — show the sign-in page (unless already signed in).
  if (path.startsWith('/login')) {
    if (me.user) { window.location.href = '/'; return null; }
    return <LoginPage onAuthed={refreshMe} />;
  }

  // Admin portal: requires sign-in + admin role.
  if (path.startsWith('/admin')) {
    if (!me.user) return <LoginPage onAuthed={refreshMe} />;
    if (me.user.role !== 'admin') return <Forbidden me={me.user} />;
    return <AdminPortal />;
  }

  // Profile requires a signed-in user (there's nothing to show for guests).
  if (path.startsWith('/profile')) {
    if (!me.user) return <LoginPage onAuthed={refreshMe} />;
    return <ProfilePage me={me.user} onChange={refreshMe} />;
  }

  // /designs works for guests — it just shows an empty state.
  if (path.startsWith('/designs')) {
    return <DesignsPage me={me.user} />;
  }

  // Editor is available to everyone. Anonymous users get a demo banner
  // and the Save / Delete / History actions are hidden.
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
