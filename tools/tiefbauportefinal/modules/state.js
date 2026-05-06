// State management with undo/redo and localStorage

const STORAGE_KEY = 'kalkuporte.v7.state';
const MAX_UNDO = 30;

export const OF_DEFS = {
  OF0: { label:'Rasen/unbef.', short:'OF0', color:'#4CAF50', prOF:38.50, prWH:28.60 },
  OF1: { label:'Pflaster',     short:'OF1', color:'#FBC02D', prOF:50.60, prWH:28.60 },
  OF2: { label:'Beton',        short:'OF2', color:'#F57C00', prOF:291.61,prWH:35.20 },
  OF3: { label:'Asphalt',      short:'OF3', color:'#D32F2F', prOF:187.00,prWH:35.20 },
};
export const PRICE_GRABEN = 159.50;
export const PRICE_HAND = 89.10;
export const TRACE_COLOR = '#D32F2F';

const DEFAULT_CATALOG = [
  { id:'ln2', name:'LN2 Ladesäule Normal', icon:'LN2', pos:'24a.', price:605.00, unit:'Stk', cat:'Ladeinfrastruktur', emoji:'🔌', color:'#00796B', shape:'circle', kw:true, amp:false, fav:true },
  { id:'wa2', name:'WA2 Wallbox Außen', icon:'WA2', pos:'24c.', price:429.00, unit:'Stk', cat:'Ladeinfrastruktur', emoji:'🔋', color:'#2E7D32', shape:'circle', kw:true, amp:false, fav:true },
  { id:'wi2', name:'WI2 Wallbox Innen', icon:'WI2', pos:'24c.', price:429.00, unit:'Stk', cat:'Ladeinfrastruktur', emoji:'🪫', color:'#558B2F', shape:'circle', kw:true, amp:false, fav:false },
  { id:'ls2', name:'LS2 Schnelllader DC', icon:'LS2', pos:'24b.', price:605.00, unit:'Stk', cat:'Ladeinfrastruktur', emoji:'⚡', color:'#C62828', shape:'circle', kw:true, amp:false, fav:false },
  { id:'kvs', name:'KVS Kabelverteilerschrank', icon:'KVS', pos:'5E.', price:275.00, unit:'Stk', cat:'Verteilung', emoji:'📦', color:'#E65100', shape:'square', kw:false, amp:true, fav:true, supply:true },
  { id:'mws', name:'MWS Messwandlerschrank', icon:'MWS', pos:'6E.', price:275.00, unit:'Stk', cat:'Verteilung', emoji:'📊', color:'#EF6C00', shape:'square', kw:false, amp:true, supply:true },
  { id:'zas', name:'ZAS Zähleranschlusssäule', icon:'ZAS', pos:'7E.', price:275.00, unit:'Stk', cat:'Verteilung', emoji:'🔢', color:'#F57F17', shape:'square', kw:false, amp:true, supply:true },
  { id:'nws', name:'NWS Netzwerkverteiler', icon:'NWS', pos:'', price:0, unit:'Stk', cat:'Verteilung', emoji:'🌐', color:'#827717', shape:'square', supply:true },
  { id:'trafo', name:'Trafostation kompakt', icon:'TRA', pos:'4aE.', price:10350.00, unit:'Stk', cat:'Netzanschluss', emoji:'🏭', color:'#D84315', shape:'square', kw:true, supply:true },
  { id:'best', name:'Bestandsanschluss HAK', icon:'HAK', pos:'', price:0, unit:'Stk', cat:'Netzanschluss', emoji:'🔌', color:'#3E2723', shape:'square', kw:true, amp:true, fav:true, supply:true },
  { id:'fund_ac', name:'AC-Fundament', icon:'FUN', pos:'8aE.', price:160.60, unit:'Stk', cat:'Ausstattung', emoji:'🧱', color:'#5D4037', shape:'hex' },
  { id:'fund_dc', name:'DC-Fundament', icon:'FDC', pos:'8bE.', price:218.90, unit:'Stk', cat:'Ausstattung', emoji:'🪨', color:'#6D4C41', shape:'hex' },
  { id:'poller', name:'Anfahrpoller', icon:'POL', pos:'1aE.', price:224.40, unit:'Stk', cat:'Ausstattung', emoji:'🚧', color:'#455A64', shape:'hex', fav:true },
  { id:'schild', name:'Parkplatzschild', icon:'SCH', pos:'2E.', price:59.40, unit:'Stk', cat:'Ausstattung', emoji:'🪧', color:'#1976D2', shape:'hex' },
  { id:'kernb', name:'Kernbohrung', icon:'KB', pos:'28b.', price:198.00, unit:'Stk', cat:'Durchbruch', emoji:'🕳', color:'#6A1B9A', shape:'hex' },
  { id:'dbrand', name:'Brandabschnitt', icon:'BA', pos:'28a.', price:292.10, unit:'Stk', cat:'Durchbruch', emoji:'🚪', color:'#BF360C', shape:'hex' },
  { id:'tiefen', name:'Tiefenerder V4A 3m', icon:'TE', pos:'aLV.', price:663.30, unit:'Stk', cat:'Erdung', emoji:'⚓', color:'#00695C', shape:'hex' },
  { id:'kreuz', name:'Kreuzverbinder V4A', icon:'KV', pos:'aLV.', price:21.44, unit:'Stk', cat:'Erdung', emoji:'✖', color:'#00838F', shape:'hex' },
  { id:'foto', name:'Foto-Wegpunkt', icon:'📷', pos:'', price:0, unit:'Stk', cat:'Sonstiges', emoji:'📷', color:'#455A64', shape:'hex' },
];

const DEFAULT_CABLE_TYPES = [
  { id:'k1', label:'Stromkabel ≤22kW', price:19.83, lvPos:'19a.', color:'#00796B', builtin:true },
  { id:'k2', label:'Stromkabel >22 ≤50kW', price:39.27, lvPos:'19b.', color:'#F57C00', builtin:true },
  { id:'k3', label:'Stromkabel >50 <100kW', price:167.18, lvPos:'19c.', color:'#E65100', builtin:true },
  { id:'k4', label:'Stromkabel ≥100 ≤150kW', price:194.40, lvPos:'19d.', color:'#D32F2F', builtin:true },
  { id:'d',  label:'Datenkabel', price:2.65, lvPos:'20.', color:'#666666', builtin:true },
  { id:'l',  label:'Leerrohr', price:14.26, lvPos:'21.', color:'#7E57C2', builtin:true },
  { id:'fb', label:'Flachband V4A (Erdung)', price:30.00, lvPos:'', color:'#00695C', builtin:true },
  { id:'re', label:'Runderder V4A (Erdung)', price:40.20, lvPos:'aLV.', color:'#00838F', builtin:true },
];

function defaultState(){
  return {
    schemaVersion: 7,
    meta: { name:'Neues Projekt', we:'', loc:'', center:[51.1657, 10.4515], zoom:6, gk:18, wg:5, konta:false, kontaPct:10, denk:false, denkPct:5 },
    catalog: JSON.parse(JSON.stringify(DEFAULT_CATALOG)),
    cableTypes: JSON.parse(JSON.stringify(DEFAULT_CABLE_TYPES)),
    objects: [],
    traces: [],
    selectedCat: null,
    viz: { pins:true, traces:true, labels:false, pinSize:30 },
    favorites: [], // catalog ids
    recents: [],   // recent catalog ids (LRU)
  };
}

export const state = defaultState();
// Static refs that map.js etc need via state
state.OF_DEFS = OF_DEFS;
state.PRICE_GRABEN = PRICE_GRABEN;
state.PRICE_HAND = PRICE_HAND;

let undoStack = [];
let redoStack = [];
let _dirty = false;

export function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw){
      const parsed = JSON.parse(raw);
      Object.assign(state, parsed);
      // Re-attach static refs
      state.OF_DEFS = OF_DEFS;
      state.PRICE_GRABEN = PRICE_GRABEN;
      state.PRICE_HAND = PRICE_HAND;
      // Ensure all defaults
      if (!state.viz) state.viz = {pins:true,traces:true,labels:false,pinSize:30};
      if (state.viz.pinSize == null) state.viz.pinSize = 30;
      if (!state.favorites) state.favorites = [];
      if (!state.recents) state.recents = [];
      if (!state.cableTypes) state.cableTypes = JSON.parse(JSON.stringify(DEFAULT_CABLE_TYPES));
      if (!state.catalog) state.catalog = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
      migrateSupplies();
      _dirty = false;
    }
  }catch(e){
    console.warn('State load failed:', e);
  }
}

export function saveState(){
  try{
    const toSave = {...state};
    delete toSave.OF_DEFS;
    delete toSave.PRICE_GRABEN;
    delete toSave.PRICE_HAND;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    _dirty = false;
  }catch(e){
    console.warn('Save failed:', e);
  }
}

export function dirty(){ return _dirty; }
export function markDirty(){ _dirty = true; }

export function pushUndo(){
  const snap = snapshotState();
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
  markDirty();
}

function snapshotState(){
  const s = {...state};
  delete s.OF_DEFS; delete s.PRICE_GRABEN; delete s.PRICE_HAND;
  return JSON.parse(JSON.stringify(s));
}

function applySnapshot(snap){
  // Save current as redo first done by caller
  Object.keys(state).forEach(k => {
    if (k === 'OF_DEFS' || k === 'PRICE_GRABEN' || k === 'PRICE_HAND') return;
    delete state[k];
  });
  Object.assign(state, snap);
  state.OF_DEFS = OF_DEFS;
  state.PRICE_GRABEN = PRICE_GRABEN;
  state.PRICE_HAND = PRICE_HAND;
}

export function undo(){
  if (!undoStack.length) return;
  const cur = snapshotState();
  redoStack.push(cur);
  applySnapshot(undoStack.pop());
  saveState();
}
export function redo(){
  if (!redoStack.length) return;
  const cur = snapshotState();
  undoStack.push(cur);
  applySnapshot(redoStack.pop());
  saveState();
}

export function uid(){
  return 'i_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}

// Migration: alte supplyFromId/supplyCable/linkedTraceId → neue supplies[]
function migrateSupplies(){
  (state.objects||[]).forEach(o => {
    if (!Array.isArray(o.supplies)) o.supplies = [];
    if (o.supplyFromId && !o.supplies.find(s => s.sourceId === o.supplyFromId)){
      // Versuch, das passende Cable auf der linkedTrace zu finden, das diesen Verbraucher speist
      let cableTypeId = null;
      const t = state.traces?.find(x => x.id === o.linkedTraceId);
      if (t){
        const cab = (t.cables||[]).find(c => c.feedToId === o.id || c.feedFromId === o.supplyFromId);
        if (cab) cableTypeId = cab.typeId;
      }
      o.supplies.push({
        id: uid(),
        sourceId: o.supplyFromId,
        traceIds: o.linkedTraceId ? [o.linkedTraceId] : [],
        cableTypeId,
        count: 1,
        reserveValue: 10,
        reserveMode: 'pct',
      });
    }
    // Alte Einzel-Felder beibehalten für Rückwärtskompat, aber Wahrheit ist jetzt supplies[]
  });
  (state.traces||[]).forEach(t => {
    if (t.parentTraceId === undefined) t.parentTraceId = null;
    if (t.parentPointIdx === undefined) t.parentPointIdx = null;
  });
}
