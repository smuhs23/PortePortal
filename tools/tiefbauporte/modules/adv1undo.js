// v6/modules/undo.js
// Undo/Redo-Stack mit 30 Schritten Tiefe. Snapshots sind tiefe JSON-Clones des State.
// Aus Performance-Gründen NICHT automatisch bei jedem ctx.save(), sondern explizit
// an Datenänderungs-Punkten via ctx.pushUndo() anstoßen.

const MAX_DEPTH = 30;

export function createUndoManager(ctx) {
  const past = [];   // Stack alter Snapshots
  const future = []; // Redo-Stack

  function snapshot() {
    // serializeable deep clone
    return JSON.stringify(ctx.state);
  }

  function restore(str) {
    const s = JSON.parse(str);
    // In-place überschreiben (state ist ein Getter in app.js, keine Referenzübergabe)
    Object.keys(ctx.state).forEach(k => delete ctx.state[k]);
    Object.assign(ctx.state, s);
  }

  function updateUi() {
    if (typeof document === 'undefined') return;
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = past.length === 0;
    if (btnRedo) btnRedo.disabled = future.length === 0;
  }

  return {
    /** Vor jeder Datenänderung aufrufen. Speichert den aktuellen State als Snapshot. */
    push() {
      past.push(snapshot());
      if (past.length > MAX_DEPTH) past.shift();
      future.length = 0; // neue Änderung löscht Redo-Historie
      updateUi();
    },
    /** Einen Schritt zurück. */
    undo() {
      if (past.length === 0) return false;
      future.push(snapshot());
      const prev = past.pop();
      restore(prev);
      ctx.render();
      updateUi();
      return true;
    },
    /** Einen Schritt nach vorne. */
    redo() {
      if (future.length === 0) return false;
      past.push(snapshot());
      const next = future.pop();
      restore(next);
      ctx.render();
      updateUi();
      return true;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    updateUi
  };
}
