// v6/modules/storage.js
// LocalStorage + Migration von v5 nach v6

import { DEFAULT_CATALOG, DEFAULT_CABLE_TYPES, DEFAULT_EMOJIS } from './constants.js';

const STORAGE_KEY = 'tbp_v6';
const LEGACY_KEY_V5 = 'tbp_v5';
const LEGACY_KEY_V4 = 'tbp_v4';

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Storage save failed:', e);
  }
}

export function loadState() {
  try {
    // 1) v6 lesen (bei Reload)
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return ensureSchema(s);
    }

    // 2) Fallback: v5 oder v4 migrieren
    const legacy = localStorage.getItem(LEGACY_KEY_V5) || localStorage.getItem(LEGACY_KEY_V4);
    if (!legacy) return null;

    const migrated = migrateFromLegacy(JSON.parse(legacy));

    // Migration-Ergebnis unter v6 speichern. v5 bleibt UNVERÄNDERT.
    saveState(migrated);
    return migrated;
  } catch (e) {
    console.warn('Storage load/migrate failed:', e);
    return null;
  }
}

// Stellt sicher, dass ein geladener v6-State alle neuen Felder hat (falls zwischen Versionen
// Felder dazukommen). Idempotent.
function ensureSchema(s) {
  if (!s.cableTypes) s.cableTypes = JSON.parse(JSON.stringify(DEFAULT_CABLE_TYPES));
  if (!s.viz) s.viz = { hw:true, tr:true, links:false };
  if (s.viz.links === undefined) s.viz.links = false;
  if (!s.uiMode) s.uiMode = 'edit';
  if (!s.schemaVersion) s.schemaVersion = 6;
  if (!Array.isArray(s.objects)) s.objects = [];
  if (!Array.isArray(s.traces)) s.traces = [];
  // Jedes Object muss neue Felder haben
  s.objects.forEach(o => {
    if (o.customName === undefined) o.customName = '';
    if (o.iconTypeOverride === undefined) o.iconTypeOverride = '';
    if (o.linkedTraceId === undefined) o.linkedTraceId = null;
    if (o.linkedSegmentIdx === undefined) o.linkedSegmentIdx = null;
  });
  // Jedes Catalog-Item
  s.catalog.forEach(c => {
    if (!c.iconType) c.iconType = 'hybrid';
    if (!c.defaultEmoji) c.defaultEmoji = DEFAULT_EMOJIS[c.id] || '❓';
    // Description aus DEFAULT_CATALOG ergänzen, wenn vorhanden und noch nicht gesetzt
    if (c.description === undefined) {
      const def = DEFAULT_CATALOG.find(d => d.id === c.id);
      c.description = def?.description || '';
    }
  });
  // Traces: cables-Array sicherstellen
  s.traces.forEach(t => {
    if (!Array.isArray(t.cables)) t.cables = [];
  });
  return s;
}

function migrateFromLegacy(legacy) {
  // CABLE_KEYS in v5 waren fest verdrahtet
  const CABLE_KEYS = ['k1','k2','k3','k4','d','l','fb','re'];

  const s = {
    meta: Object.assign({
      we:'', loc:'', date: new Date().toISOString().slice(0,10),
      author:'', note:'', gk:0, wg:0, konta:false, denk:false,
      kontaPct:20, denkPct:15
    }, legacy.meta || {}),
    catalog: [],
    cableTypes: JSON.parse(JSON.stringify(DEFAULT_CABLE_TYPES)),
    objects: [],
    traces: [],
    selectedCat: legacy.selectedCat || null,
    viz: Object.assign({ hw:true, tr:true, links:false }, legacy.viz || {}),
    uiMode: 'edit',
    schemaVersion: 6
  };

  // Catalog-Migration
  const legacyCatalog = legacy.catalog && legacy.catalog.length ? legacy.catalog : DEFAULT_CATALOG;
  s.catalog = legacyCatalog.map(c => {
    const merged = Object.assign({}, c);
    if (!merged.iconType) merged.iconType = 'hybrid';
    if (!merged.defaultEmoji) merged.defaultEmoji = DEFAULT_EMOJIS[c.id] || '❓';
    return merged;
  });

  // Objekte
  s.objects = (legacy.objects || []).map(o => Object.assign({
    customName: '',
    iconTypeOverride: '',
    linkedTraceId: null,
    linkedSegmentIdx: null
  }, o));

  // Trassen: flat cable fields → cables[] Array
  s.traces = (legacy.traces || []).map(t => {
    const cables = [];
    CABLE_KEYS.forEach(k => {
      const n = Number(t[k]) || 0;
      if (n <= 0) return;

      // Reserve aus alten Feldern ermitteln (Prozent)
      let r = Number(t[k + 'r']);
      if (isNaN(r)) r = Number(t.reserve) || 10;

      const cableType = DEFAULT_CABLE_TYPES.find(ct => ct.id === k);
      cables.push({
        typeId: k,
        label: cableType ? cableType.label : k,
        priceSnapshot: cableType ? cableType.price : 0,
        priceOverride: null,
        count: n,
        reserveMode: 'pct',
        reserveValue: r
      });
    });

    // Segmente säubern
    const segments = (t.segments || []).map(seg => {
      let of = seg.of;
      if (of === 'OF2B') of = 'OF2';
      if (!['OF0','OF1','OF2','OF3'].includes(of)) of = 'OF0';
      return { of, hand: !!seg.hand, len: Number(seg.len) || 0 };
    });

    return {
      id: t.id,
      points: t.points,
      segments,
      cables,
      note: t.note || '',
      photos: t.photos || []
    };
  });

  return s;
}
