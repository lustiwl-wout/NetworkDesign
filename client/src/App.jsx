import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorCtx } from './EditorCtx.js';
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
import { authApi, teamsApi } from './authApi.js';
import {
  applyKind,
  getEdgeKinds,
  getEdgeKind,
  setEdgeKinds as setEdgeKindsModule,
} from './edgePresets.js';
import { exportCanvasPng } from './exportImage.js';
import { AlignmentGuides, computeGuides } from './AlignmentGuides.jsx';

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

// Lightweight deep-ish equality for the autosave dirty-check. The
// graph objects are plain data + primitives, so JSON round-trip is
// cheap compared to how often this fires (debounced) and much
// simpler than a hand-rolled walker.
function shallowEqualGraph(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
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

  // Undo stack. Each entry is a deep-ish snapshot of nodes+edges;
  // we push BEFORE a discrete user action (drop, connect, delete,
  // drag-start, property change, bend-drag-start) so Ctrl+Z restores
  // the state as it was right before that action.
  const historyRef = useRef([]);
  const HISTORY_MAX = 50;
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const takeSnapshot = useCallback(() => {
    historyRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
    });
    if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
  }, []);
  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setNodes(prev.nodes);
    setEdges(prev.edges);
  }, [setNodes, setEdges]);

  // Clipboard for copy/paste. Keeps whatever was selected last time
  // Ctrl+C fired plus the edges strictly between those nodes, with
  // positions preserved relative to a reference point so paste can
  // offset predictably.
  const clipboardRef = useRef(null);
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
  // Optional team scope. null = personal design. Loaded per-design,
  // defaults to null for a new blank editor.
  const [teamId, setTeamId] = useState(null);
  const [myTeams, setMyTeams] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [toast, setToast] = useState(null);
  const [present, setPresent] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLegend, setExportLegend] = useState(true);
  const [exportTransparent, setExportTransparent] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState(null); // null = show all
  const [view, setView] = useState(me?.defaultView ?? 'management'); // 'management' | 'engineering'
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

  // My teams — loaded once after sign-in; drives the editor's team
  // picker and caps which team a new design can be scoped to.
  useEffect(() => {
    if (!me) return;
    (async () => {
      try { setMyTeams(await teamsApi.mine()); } catch { setMyTeams([]); }
    })();
  }, [me]);

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
    if (!designId) {
      // Fresh editor with an empty untitled design — mark it as
      // "saved" so autosave doesn't try to PUT an empty state before
      // the user has done anything.
      lastSavedRef.current = { nodes: [], edges: [], name: 'Untitled design' };
      return;
    }
    (async () => {
      try {
        const d = await api.get(designId);
        setCurrentId(d.id);
        setName(d.name);
        setTeamId(d.team_id ?? null);
        const loadedNodes = d.graph?.nodes ?? [];
        const loadedEdges = styleEdges(d.graph?.edges ?? []);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        lastSavedRef.current = {
          nodes: JSON.parse(JSON.stringify(loadedNodes)),
          edges: JSON.parse(JSON.stringify(loadedEdges)),
          name: d.name,
          teamId: d.team_id ?? null,
        };
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
    // Preserve sourceHandle / targetHandle when the user drags from a
    // specific handle, so they can attach multiple edges to separate
    // anchors on the same side (e.g. OOB + Network link). When null
    // (programmatic or drag from the card body), the edge falls back
    // to the floating side-midpoint behaviour.
    takeSnapshot();
    const edge = applyKind({
      id: `e_${Date.now().toString(36)}_${tmpId++}`,
      source: params.source,
      target: params.target,
      sourceHandle: params.sourceHandle ?? null,
      targetHandle: params.targetHandle ?? null,
      type: 'smart',
    }, 'network');
    setEdges((eds) => addEdge(edge, eds));
  }, [setEdges, takeSnapshot]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/reactflow');
      if (!raw) return;
      takeSnapshot();
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
    [screenToFlowPosition, setNodes, deviceByKey, zoneByKey, nodes, takeSnapshot]
  );

  const onPaletteDragStart = (event, kind, value) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ kind, value }));
    event.dataTransfer.effectAllowed = 'move';
  };

  // Alignment / equal-spacing guides shown while a node is being
  // dragged. Computed live in onNodeDrag; cleared in onNodeDragStop.
  const [guides, setGuides] = useState([]);
  const onNodeDrag = useCallback((_event, node) => {
    // React Flow passes positionAbsolute during drag; but for a node
    // inside a zone the node.position is relative to the zone and
    // may be stale in our own nodesRef copy. Use the live absolute
    // position as the override so the guide math matches where the
    // user actually sees the node.
    let abs = node.positionAbsolute;
    if (!abs && node.parentNode) {
      const parent = nodesRef.current.find((n) => n.id === node.parentNode);
      abs = parent
        ? { x: (parent.positionAbsolute?.x ?? parent.position.x) + node.position.x,
            y: (parent.positionAbsolute?.y ?? parent.position.y) + node.position.y }
        : node.position;
    }
    setGuides(computeGuides(node.id, nodesRef.current, { [node.id]: abs ?? node.position }));
  }, []);

  // Re-parent devices when dragged across zones. Zones don't clamp their
  // children (extent: 'parent') so this runs on every drag.
  const onNodeDragStop = useCallback((_event, node) => {
    setGuides([]);
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
    setTeamId(null);
    setNodes([]);
    setEdges([]);
    lastSavedRef.current = { nodes: [], edges: [], name: 'Untitled design', teamId: null };
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const loadDesign = async (id) => {
    try {
      const d = await api.get(id);
      setCurrentId(d.id);
      setName(d.name);
      setTeamId(d.team_id ?? null);
      setNodes(d.graph?.nodes ?? []);
      setEdges(styleEdges(d.graph?.edges ?? []));
      flash(`Loaded "${d.name}"`);
    } catch (e) { flash(`Load failed: ${e.message}`); }
  };

  // Autosave. Every edit schedules a silent save 1.5 s later; the
  // timer resets on every change so rapid edits coalesce into one
  // network call. No UI chip — saves run silently; errors still
  // surface via the toast so the user knows if something broke.
  const lastSavedRef = useRef(null);
  const saveTimerRef = useRef(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  const teamIdRef = useRef(teamId);
  teamIdRef.current = teamId;
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  // Compare current content to the last-saved snapshot. Cheap enough
  // for small diagrams; uses the refs so we read the latest values.
  const isDirty = useCallback(() => {
    const snap = lastSavedRef.current;
    if (!snap) return true;
    return snap.name !== nameRef.current
      || (snap.teamId ?? null) !== (teamIdRef.current ?? null)
      || !shallowEqualGraph(snap.nodes, nodesRef.current)
      || !shallowEqualGraph(snap.edges, edgesRef.current);
  }, []);

  // Block autosave until the user has named the design. Creating
  // phantom "Untitled design" rows every time someone opens the
  // editor and drags a node around pollutes the designs list.
  // Loaded designs (currentId set) still save on every edit
  // regardless of name, because the user already committed to
  // that design and its name is theirs to change.
  const hasRealName = useCallback(() => {
    const n = (nameRef.current ?? '').trim();
    return !!n && n !== 'Untitled design';
  }, []);

  const doSave = useCallback(async () => {
    if (!canSave) return;
    if (!isDirty()) return;
    if (!currentIdRef.current && !hasRealName()) return;
    const graph = { nodes: nodesRef.current, edges: edgesRef.current };
    const nm = nameRef.current;
    const tid = teamIdRef.current ?? null;
    try {
      let d;
      if (currentIdRef.current) {
        d = await api.update(currentIdRef.current, { name: nm, graph, teamId: tid });
      } else {
        d = await api.create({ name: nm, graph, teamId: tid });
        setCurrentId(d.id);
      }
      lastSavedRef.current = {
        nodes: JSON.parse(JSON.stringify(nodesRef.current)),
        edges: JSON.parse(JSON.stringify(edgesRef.current)),
        name: nm,
        teamId: tid,
      };
    } catch (e) {
      flash(`Autosave failed: ${e.message}`);
    }
  }, [canSave, isDirty]);

  // Schedule a debounced save whenever content changes.
  useEffect(() => {
    if (!canSave) return;
    if (lastSavedRef.current === null) return; // waiting for initial load
    if (!isDirty()) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { doSave(); }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [nodes, edges, name, teamId, canSave, doSave, isDirty]);

  // Save on tab close / navigation / reload. `keepalive: true` lets
  // the request complete after the page is unloading.
  useEffect(() => {
    if (!canSave) return;
    const onHide = () => {
      if (!isDirty()) return;
      if (!currentIdRef.current && !hasRealName()) return;
      const body = JSON.stringify({
        name: nameRef.current,
        graph: { nodes: nodesRef.current, edges: edgesRef.current },
        teamId: teamIdRef.current ?? null,
      });
      const id = currentIdRef.current;
      const url = id ? `/api/designs/${id}` : '/api/designs';
      const method = id ? 'PUT' : 'POST';
      try {
        fetch(url, {
          method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        });
      } catch {}
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [canSave, isDirty, hasRealName]);

  const exportPng = async ({ includeLegend, transparent }) => {
    try {
      await exportCanvasPng({ nodes, edges, title: name, includeLegend, transparent });
      flash('Exported PNG');
    } catch (e) { flash(`Export failed: ${e.message}`); }
  };

  const updateSelectedNode = (patch) => {
    if (!selectedNode) return;
    takeSnapshot();
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n))
    );
    setSelectedNode((n) => ({ ...n, data: { ...n.data, ...patch } }));
  };

  const updateSelectedEdge = (patch) => {
    if (!selectedEdge) return;
    takeSnapshot();
    setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? { ...e, ...patch } : e)));
    setSelectedEdge((e) => ({ ...e, ...patch }));
  };

  const changeEdgeKind = (kindKey) => {
    if (!selectedEdge) return;
    takeSnapshot();
    setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? applyKind(e, kindKey) : e)));
    setSelectedEdge((e) => applyKind(e, kindKey));
  };

  const deleteSelected = () => {
    if (selectedNode) {
      takeSnapshot();
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
    } else if (selectedEdge) {
      takeSnapshot();
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
    }
  };

  // --- Copy / paste ---
  // Copy: grab everything currently selected (React Flow flags them
  // with selected=true), plus the edges whose endpoints are both in
  // the selection. We store a deep copy so later mutations don't
  // bleed into the clipboard.
  const copySelection = useCallback(() => {
    const all = nodesRef.current;
    const seeds = new Set(all.filter((n) => n.selected).map((n) => n.id));
    if (!seeds.size) return;
    // If a zone is selected, implicitly copy everything inside it —
    // transitively, since zones can (in theory) nest. Edges whose
    // endpoints are both in the expanded set come along too.
    const ids = new Set(seeds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of all) {
        if (ids.has(n.id)) continue;
        if (n.parentNode && ids.has(n.parentNode)) {
          ids.add(n.id);
          changed = true;
        }
      }
    }
    const copyNodes = all.filter((n) => ids.has(n.id));
    const copyEdges = edgesRef.current.filter((e) => ids.has(e.source) && ids.has(e.target));
    clipboardRef.current = JSON.parse(JSON.stringify({ nodes: copyNodes, edges: copyEdges }));
    const extra = copyNodes.length - seeds.size;
    flash(
      extra > 0
        ? `Copied ${seeds.size} + ${extra} contained`
        : `Copied ${copyNodes.length} node${copyNodes.length === 1 ? '' : 's'}`
    );
  }, []);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || !clip.nodes.length) return;
    takeSnapshot();
    // Allocate new IDs in one pass so parentNode lookups work
    // regardless of iteration order in clip.nodes.
    const idMap = new Map();
    for (const n of clip.nodes) idMap.set(n.id, nextId());
    const pastedNodes = clip.nodes.map((n) => {
      const hasCopiedParent = !!(n.parentNode && idMap.has(n.parentNode));
      return {
        ...n,
        id: idMap.get(n.id),
        selected: true,
        // Only top-level pasted nodes get the "drop offset" — children
        // of a copied zone keep their relative-to-parent position so
        // the group holds together.
        position: hasCopiedParent
          ? { ...n.position }
          : { x: n.position.x + 24, y: n.position.y + 24 },
        parentNode: hasCopiedParent ? idMap.get(n.parentNode) : undefined,
      };
    });
    const pastedEdges = clip.edges.map((e) => ({
      ...e,
      id: `e_${Date.now().toString(36)}_${tmpId++}`,
      source: idMap.get(e.source),
      target: idMap.get(e.target),
      selected: true,
    }));
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(pastedNodes));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })).concat(pastedEdges));
    flash(`Pasted ${pastedNodes.length} node${pastedNodes.length === 1 ? '' : 's'}`);
  }, [setNodes, setEdges, takeSnapshot]);

  // Global keyboard shortcuts. Ignored while the user is typing in a
  // text field — otherwise Ctrl+Z inside, say, the node name input
  // would yank the whole canvas back.
  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const target = e.target;
      const tag = target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' ||
                     tag === 'SELECT' || target?.isContentEditable;
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'c') {
        copySelection();
        // Don't preventDefault — user may legitimately want to copy
        // text selected elsewhere; but selection here takes priority
        // only when focus is on the canvas.
      } else if (key === 'v') {
        e.preventDefault();
        pasteClipboard();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, copySelection, pasteClipboard]);

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
          onFocus={(e) => {
            // First-time naming: the placeholder-ish "Untitled design"
            // is a real value. Select all so typing replaces it in
            // one stroke without the user deleting it manually.
            if (name === 'Untitled design') e.target.select();
          }}
        />
        {canSave && myTeams.length > 0 && (
          <select
            className="topbar-team-picker"
            value={teamId ?? ''}
            onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}
            title="Team this design belongs to"
          >
            <option value="">Personal</option>
            {myTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn secondary theme-btn"
          onClick={() => setTheme(nextTheme(theme))}
          title={`Theme: ${THEME_NAME[theme]}. Click to switch to ${THEME_NAME[nextTheme(theme)]}.`}
          aria-label={`Theme: ${THEME_NAME[theme]}, click to cycle`}
        >
          {THEME_ICON[theme]}
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
        <div className="menu">
          <button className="btn secondary" onClick={() => setExportOpen((v) => !v)}>
            Export PNG
          </button>
          {exportOpen && (
            <div className="menu-pop" style={{ minWidth: 260 }} onMouseDown={(e) => e.stopPropagation()}>
              <label className="toggle-row" style={{ padding: '8px 10px' }}>
                <input
                  type="checkbox"
                  checked={exportLegend}
                  onChange={(e) => setExportLegend(e.target.checked)}
                />
                Include connection legend
              </label>
              <label className="toggle-row" style={{ padding: '4px 10px 8px' }}>
                <input
                  type="checkbox"
                  checked={exportTransparent}
                  onChange={(e) => setExportTransparent(e.target.checked)}
                />
                Transparent background
              </label>
              <button
                className="menu-item"
                onClick={() => {
                  setExportOpen(false);
                  exportPng({ includeLegend: exportLegend, transparent: exportTransparent });
                }}
              >
                <div className="menu-item-title">Export</div>
                <div className="menu-item-desc">
                  {[
                    exportLegend ? 'with legend' : 'no legend',
                    exportTransparent ? 'transparent' : 'themed background',
                  ].join(' · ')}
                </div>
              </button>
            </div>
          )}
        </div>
        <button className="btn secondary" onClick={() => setPresent(true)} title="Enter presentation mode (Esc to exit)">
          Present
        </button>
        {isAdmin && (
          <a className="btn secondary" href="/admin" title="Admin portal">Admin</a>
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
        <EditorCtx.Provider value={{ setEdges, takeSnapshot }}>
        <ReactFlow
          nodes={phasedNodes}
          edges={phasedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={takeSnapshot}
          onNodeDrag={onNodeDrag}
          onNodeClick={(_, node) => { setSelectedNode(node); setSelectedEdge(null); }}
          onEdgeClick={(_, edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); setExportOpen(false); }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode="loose"
          fitView
          fitViewOptions={{ padding: 0.4, maxZoom: 0.85 }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ type: 'smart' }}
          snapToGrid
          snapGrid={[10, 10]}
        >
          <Background gap={16} size={1} color="var(--grid)" />
          <Controls />
          <MiniMap pannable zoomable maskColor="rgba(15,23,42,0.6)" />
          <AlignmentGuides guides={guides} />
        </ReactFlow>
        </EditorCtx.Provider>
        {!canSave && (
          <div className="demo-banner" role="status">
            <strong>{me ? 'Demo account' : 'Guest mode'}</strong>
            <span>
              {me
                ? 'Your account is view-only. Use Export PNG to keep your work.'
                : 'You can build a design and export it as PNG, but changes aren\'t saved. '}
              {!me && <a href="/login">Sign in</a>}
              {!me && ' to save.'}
            </span>
          </div>
        )}
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

      <HandleCountRows data={d} onChange={onChange} />

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

function HandleCountRows({ data, onChange, defaultCount = 1 }) {
  const handles = data?.handles ?? {};
  const setSide = (side, v) => {
    const n = Math.max(0, Math.min(12, Number(v) || 0));
    onChange({ handles: { ...handles, [side]: n } });
  };
  const val = (side) => handles[side] ?? defaultCount;
  return (
    <>
      <label>Connection points per side</label>
      <div className="handle-grid">
        <div>
          <span>Top</span>
          <input type="number" min="0" max="12" value={val('t')}
            onChange={(e) => setSide('t', e.target.value)} />
        </div>
        <div>
          <span>Right</span>
          <input type="number" min="0" max="12" value={val('r')}
            onChange={(e) => setSide('r', e.target.value)} />
        </div>
        <div>
          <span>Bottom</span>
          <input type="number" min="0" max="12" value={val('b')}
            onChange={(e) => setSide('b', e.target.value)} />
        </div>
        <div>
          <span>Left</span>
          <input type="number" min="0" max="12" value={val('l')}
            onChange={(e) => setSide('l', e.target.value)} />
        </div>
      </div>
      <p className="hint small">
        Add points to expose drag-to-connect anchors. More than one on
        a side keeps different traffic (e.g. Network link + OOB)
        visually separated. Edges drawn without a handle still float.
      </p>
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
      <HandleCountRows data={d} onChange={onChange} defaultCount={0} />
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

function WaypointEditor({ edge, onChange }) {
  const wps = edge.data?.waypoints ?? [];
  const setWps = (next) => onChange({
    data: { ...(edge.data ?? {}), waypoints: next },
  });

  return (
    <>
      <label>Route</label>
      <p className="hint small">
        <b>Drag the small squares</b> on the line to reshape it. They
        sit in the middle of every straight segment. Double-click the
        line to add a waypoint at an arbitrary spot.
      </p>
      {wps.length > 0 && (
        <button
          type="button"
          className="btn secondary small"
          onClick={() => setWps([])}
        >
          Reset path
        </button>
      )}
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
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={!!d.curved}
          onChange={(e) => setData({ curved: e.target.checked })}
        /> Curved path — bows off the direct line (useful for a parallel / redundant link next to a primary one).
      </label>

      <label>Line color (override)</label>
      <input
        type="color"
        value={edge.style?.stroke ?? kind.stroke ?? '#94a3b8'}
        onChange={(e) => onChange({ style: { ...(edge.style ?? {}), stroke: e.target.value } })}
      />

      <WaypointEditor edge={edge} onChange={onChange} />

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


const THEMES = ['dark', 'light', 'professional'];
const THEME_ICON = { dark: '🌙', light: '☀︎', professional: '💼' };
const THEME_NAME = { dark: 'Dark', light: 'Light', professional: 'Professional' };
function nextTheme(t) { return THEMES[(THEMES.indexOf(t) + 1) % THEMES.length] || 'dark'; }

function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const v = localStorage.getItem('theme');
    return THEMES.includes(v) ? v : 'dark';
  });
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('theme-light', theme === 'light');
    html.classList.toggle('theme-professional', theme === 'professional');
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

  // Record a visit once per page load — fire-and-forget, errors are
  // intentionally silenced.
  useEffect(() => {
    fetch('/api/visits', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: window.location.pathname }),
    }).catch(() => {});
  }, []);

  if (me === undefined) {
    return <div className="auth-shell"><div className="hint">Loading…</div></div>;
  }

  // A logged-in user whose MFA is still required must clear it first.
  if (me.user && me.mfaRequired) {
    return <LoginPage initialMfa onAuthed={refreshMe} />;
  }

  // If the password was seeded by an admin, force the user to
  // choose their own before they can do anything else.
  if (me.user && me.user.mustChangePassword) {
    return <ForceChangePassword me={me.user} onDone={refreshMe} />;
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

function ForceChangePassword({ me, onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setErr('New passwords don\'t match.'); return; }
    if (next === current) { setErr('Pick a password different from the temporary one.'); return; }
    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      onDone?.();
    } catch (e2) {
      setErr(e2.message || 'Could not update password.');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Set a new password</h1>
        <p className="hint">
          Your account ({me.email}) is using a temporary password an administrator set. Pick your own before continuing.
        </p>
        <form onSubmit={submit} className="form">
          <label>Temporary password</label>
          <input type="password" autoFocus required value={current} onChange={(e) => setCurrent(e.target.value)} />

          <label>New password</label>
          <input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />

          <label>Confirm new password</label>
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />

          {err && <div className="admin-error">{err}</div>}

          <div className="form-actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? '…' : 'Save password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() { return <Root />; }
