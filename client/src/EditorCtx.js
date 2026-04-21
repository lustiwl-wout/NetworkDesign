import { createContext } from 'react';

// Handed down from the Editor so custom edges and other deep children
// can update the canvas state directly (controlled-mode friendly).
export const EditorCtx = createContext({ setEdges: () => {} });
