import { createContext } from 'react';

// Handed down from the Editor so custom edges and other deep children
// can update the canvas state directly (controlled-mode friendly).
// `takeSnapshot` is called before any mutation so the undo history
// captures the pre-change state.
export const EditorCtx = createContext({
  setEdges: () => {},
  takeSnapshot: () => {},
});
