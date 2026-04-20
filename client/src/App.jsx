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
import { NODE_CATALOG, CATALOG_BY_TYPE } from './nodeTypes.js';
import { api } from './api.js';

const nodeTypes = Object.fromEntries(NODE_CATALOG.map((n) => [n.type, NetworkNode]));

let tmpId = 1;
const nextId = () => `n_${Date.now().toString(36)}_${tmpId++}`;

function Editor() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [designs, setDesigns] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [name, setName] = useState('Untitled design');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [toast, setToast] = useState(null);
  const wrapperRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const refreshList = useCallback(async () => {
    try { setDesigns(await api.list()); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { refreshList(); }, [refreshList]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
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
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const meta = CATALOG_BY_TYPE[type];
      const newNode = {
        id: nextId(),
        type,
        position,
        data: { label: meta.label, ip: '' },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onPaletteDragStart = (event, type) => {
    event.dataTransfer.setData('application/reactflow', type);
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

  const updateSelectedNode = (patch) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n))
    );
    setSelectedNode((n) => ({ ...n, data: { ...n.data, ...patch } }));
  };

  const updateSelectedEdge = (patch) => {
    if (!selectedEdge) return;
    setEdges((eds) =>
      eds.map((e) => (e.id === selectedEdge.id ? { ...e, ...patch } : e))
    );
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

  const catalog = useMemo(() => NODE_CATALOG, []);

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
        <button className="btn secondary" onClick={newDesign}>New</button>
        <button className="btn" onClick={saveDesign}>Save</button>
        {currentId && <button className="btn danger" onClick={deleteDesign}>Delete</button>}
      </div>

      <aside className="palette">
        <h2>Drag to canvas</h2>
        {catalog.map((n) => (
          <div
            key={n.type}
            className="palette-item"
            draggable
            onDragStart={(e) => onPaletteDragStart(e, n.type)}
          >
            <span className="icon">{n.icon}</span>
            <span>{n.label}</span>
          </div>
        ))}
      </aside>

      <div className="canvas" ref={wrapperRef} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => { setSelectedNode(node); setSelectedEdge(null); }}
          onEdgeClick={(_, edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
          onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
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

        {selectedNode && (
          <>
            <h2>Node</h2>
            <label>Type</label>
            <input value={selectedNode.type} disabled />
            <label>Label</label>
            <input
              value={selectedNode.data?.label ?? ''}
              onChange={(e) => updateSelectedNode({ label: e.target.value })}
            />
            <label>IP / detail</label>
            <input
              value={selectedNode.data?.ip ?? ''}
              onChange={(e) => updateSelectedNode({ ip: e.target.value })}
              placeholder="10.0.0.1"
            />
            <button className="btn danger" onClick={deleteSelected}>Delete node</button>
          </>
        )}

        {selectedEdge && (
          <>
            <h2>Connection</h2>
            <label>Label</label>
            <input
              value={selectedEdge.label ?? ''}
              onChange={(e) => updateSelectedEdge({ label: e.target.value })}
              placeholder="1 Gbps"
            />
            <label>
              <input
                type="checkbox"
                checked={!!selectedEdge.animated}
                onChange={(e) => updateSelectedEdge({ animated: e.target.checked })}
              /> Animated
            </label>
            <div style={{ height: 8 }} />
            <button className="btn danger" onClick={deleteSelected}>Delete edge</button>
          </>
        )}

        {!selectedNode && !selectedEdge && (
          <>
            <h2>Tips</h2>
            <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
              Drag items from the palette onto the canvas. Connect nodes by dragging from the
              bottom handle to another node's top handle. Click a node or edge to edit it.
              Press <kbd>Delete</kbd> to remove selected items.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
