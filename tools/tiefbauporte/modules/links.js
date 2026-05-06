// links.js — Zentrale Logik für Versorgungs-Beziehungen (supplies[]) und Trassen-Graph

import { state, pushUndo, uid } from './state.js';

// Liefert alle "Quellen-Kandidaten" (supply:true) ausser dem Asset selbst
export function supplySources(forObjectId){
  return state.objects.filter(o => {
    if (o.id === forObjectId) return false;
    const c = state.catalog.find(x => x.id === o.catId);
    return c && c.supply;
  });
}

// Distanz Asset → naechster Trassen-Punkt (in m)
function haversineRough(lat1, lng1, lat2, lng2){
  const dx = (lng2 - lng1) * 111000 * Math.cos((lat1+lat2)/2 * Math.PI/180);
  const dy = (lat2 - lat1) * 111000;
  return Math.hypot(dx, dy);
}
function nearestPointOnTrace(trace, lat, lng){
  let best = -1, bestD = Infinity;
  trace.points.forEach((p, i) => {
    const d = haversineRough(p[0], p[1], lat, lng);
    if (d < bestD){ bestD = d; best = i; }
  });
  return { idx: best, dist: bestD };
}
export function tracesNearAsset(asset, maxDist = 8){
  return state.traces.filter(t => nearestPointOnTrace(t, asset.lat, asset.lng).dist <= maxDist);
}

// Build adjacency graph between traces:
// Zwei Trassen sind verbunden, wenn sie sich an einem Punkt treffen ODER per parentTraceId.
function buildTraceGraph(){
  const adj = new Map(); // traceId -> Set(traceId)
  state.traces.forEach(t => adj.set(t.id, new Set()));
  // Endpunkte vergleichen (Toleranz ~3m)
  for (let i = 0; i < state.traces.length; i++){
    const a = state.traces[i];
    for (let j = i+1; j < state.traces.length; j++){
      const b = state.traces[j];
      let connected = false;
      a.points.forEach(pa => {
        if (connected) return;
        b.points.forEach(pb => {
          if (haversineRough(pa[0],pa[1],pb[0],pb[1]) <= 3) connected = true;
        });
      });
      if (connected){ adj.get(a.id).add(b.id); adj.get(b.id).add(a.id); }
    }
  }
  // parentTraceId-Verbindungen
  state.traces.forEach(t => {
    if (t.parentTraceId && adj.has(t.parentTraceId)){
      adj.get(t.id).add(t.parentTraceId);
      adj.get(t.parentTraceId).add(t.id);
    }
  });
  return adj;
}

// BFS kürzeste Trassen-Kette von Source-Asset zu Consumer-Asset
export function suggestTraceChain(source, consumer){
  if (!source || !consumer) return [];
  // Bevorzugt linkedTraceId, sonst Trassen in der Nähe
  const startCandidates = [];
  if (source.linkedTraceId){
    const t = state.traces.find(x => x.id === source.linkedTraceId);
    if (t) startCandidates.push(t);
  }
  if (!startCandidates.length) startCandidates.push(...tracesNearAsset(source, 15));
  const endIds = new Set();
  if (consumer.linkedTraceId){
    if (state.traces.find(x => x.id === consumer.linkedTraceId)) endIds.add(consumer.linkedTraceId);
  }
  if (!endIds.size) tracesNearAsset(consumer, 15).forEach(t => endIds.add(t.id));

  if (!startCandidates.length || !endIds.size){
    const ranked = state.traces.map(t => ({
      id: t.id,
      score: nearestPointOnTrace(t, source.lat, source.lng).dist + nearestPointOnTrace(t, consumer.lat, consumer.lng).dist
    })).sort((a,b) => a.score - b.score);
    return ranked.length ? [ranked[0].id] : [];
  }
  const adj = buildTraceGraph();
  const queue = startCandidates.map(t => [t.id]);
  const visited = new Set(startCandidates.map(t => t.id));
  while (queue.length){
    const path = queue.shift();
    const last = path[path.length-1];
    if (endIds.has(last)) return path;
    (adj.get(last) || new Set()).forEach(nb => {
      if (visited.has(nb)) return;
      visited.add(nb);
      queue.push([...path, nb]);
    });
  }
  return [...endIds][0] ? [[...endIds][0]] : [];
}

// Projiziert eine Position (lat,lng) auf eine Trasse.
// Liefert {segIdx, t, distFromStart} — segIdx = Index des Segments, t in [0,1]
// Anteil entlang des Segments, distFromStart = Meter ab Trassenanfang.
// distFromStart ist nützlich für Längenberechnung zwischen zwei Projektionen
// auf der GLEICHEN Trasse.
function projectOntoTrace(trace, lat, lng){
  if (!trace || !trace.points?.length) return null;
  // ohne Segmente: Punkt 0
  if (!trace.segments?.length || trace.points.length < 2){
    return { segIdx: 0, t: 0, distFromStart: 0, lat: trace.points[0][0], lng: trace.points[0][1] };
  }
  let best = { segIdx: 0, t: 0, dist: Infinity, distFromStart: 0, lat: trace.points[0][0], lng: trace.points[0][1] };
  let acc = 0; // Meter vom Trassenanfang bis zum Start des aktuellen Segments
  for (let i = 0; i < trace.segments.length; i++){
    const a = trace.points[i];
    const b = trace.points[i+1];
    if (!a || !b) { acc += trace.segments[i]?.len || 0; continue; }
    // lokales kartesisches Koordinatensystem: Meter relativ zum Mittelpunkt
    const midLat = (a[0] + b[0]) / 2;
    const cosLat = Math.cos(midLat * Math.PI / 180);
    const M_LAT = 111000;       // m pro Grad Lat
    const M_LNG = 111000 * cosLat; // m pro Grad Lng
    const ax = a[1] * M_LNG, ay = a[0] * M_LAT;
    const bx = b[1] * M_LNG, by = b[0] * M_LAT;
    const px = lng * M_LNG, py = lat * M_LAT;
    const dx = bx - ax, dy = by - ay;
    const segLen2 = dx*dx + dy*dy;
    let tProj = segLen2 > 0 ? ((px - ax)*dx + (py - ay)*dy) / segLen2 : 0;
    tProj = Math.max(0, Math.min(1, tProj));
    const fx = ax + tProj * dx;
    const fy = ay + tProj * dy;
    const d = Math.hypot(px - fx, py - fy);
    if (d < best.dist){
      const segLen = trace.segments[i]?.len || Math.sqrt(segLen2);
      best = {
        segIdx: i,
        t: tProj,
        dist: d,
        distFromStart: acc + tProj * segLen,
        lat: fy / M_LAT,
        lng: fx / M_LNG,
      };
    }
    acc += trace.segments[i]?.len || 0;
  }
  return best;
}

// Liefert die kumulierte Länge entlang einer Trasse vom Trassenanfang
// bis zum Punkt-Index idx (in Metern).
function distAlongTraceToIdx(trace, idx){
  if (!trace?.segments?.length) return 0;
  const max = Math.min(idx, trace.segments.length);
  let acc = 0;
  for (let i = 0; i < max; i++) acc += trace.segments[i]?.len || 0;
  return acc;
}

// Findet den Verbindungs-Punkt-Index in traceA, der traceB am nächsten liegt.
// Berücksichtigt parentTraceId (Abzweig-Beziehung).
function findConnectionPointIdx(traceA, traceB){
  // Abzweig-Sonderfall: A ist Abzweig von B → A.point[0] trifft B.point[parentPointIdx]
  if (traceA.parentTraceId === traceB.id && traceA.parentPointIdx != null){
    return 0;
  }
  if (traceB.parentTraceId === traceA.id && traceB.parentPointIdx != null){
    return traceB.parentPointIdx;
  }
  // Allgemein: nächstes Punktpaar
  let bestA = 0, bestD = Infinity;
  traceA.points.forEach((pa, i) => {
    traceB.points.forEach(pb => {
      const d = haversineRough(pa[0],pa[1],pb[0],pb[1]);
      if (d < bestD){ bestD = d; bestA = i; }
    });
  });
  return bestA;
}

// Berechnet pro Trasse in der Kette die tatsächlich benötigten Segment-Indices
// zwischen Entry- und Exit-Punkt.
//
// Liefert: Map<traceId, segIds[]> — wobei segIds zusätzliche Eigenschaften trägt:
//   segIds.lengthM   = anteilige Gesamtlänge auf dieser Trasse (Meter)
//   segIds.entryAt   = {segIdx, t} (Entry-Projektion auf Trasse, wenn Asset)
//   segIds.exitAt    = {segIdx, t} (Exit-Projektion auf Trasse, wenn Asset)
//
// Die anteilige Länge berücksichtigt Quellen- und Verbraucher-Position
// (Projektion aufs nächste Segment), sodass NWS+Verbraucher auf derselben
// Trasse die echte Distanz zwischen ihnen ergeben — und nicht "0 oder volle
// Trasse".
export function computeChainSegments(chainTraceIds, sourceObj, consumerObj){
  const result = new Map();
  const traces = chainTraceIds.map(id => state.traces.find(t => t.id === id)).filter(Boolean);
  if (!traces.length) return result;

  // Liefert die "Position auf Trasse" für ein Asset:
  //   {segIdx, t, distFromStart} via Projektion auf nächstes Segment
  // Falls Asset nicht zur Trasse gehört, nutzt nearestPointOnTrace als Fallback.
  function assetPos(obj, t){
    if (!obj) return null;
    return projectOntoTrace(t, obj.lat, obj.lng);
  }
  // Liefert die "Position auf Trasse" für einen Trassen-Verbindungspunkt
  function connPos(t, neighborTrace){
    const idx = findConnectionPointIdx(t, neighborTrace);
    return {
      segIdx: Math.min(idx, (t.segments?.length||1) - 1),
      t: idx >= (t.segments?.length||0) ? 1 : 0,
      distFromStart: distAlongTraceToIdx(t, idx),
    };
  }

  for (let i = 0; i < traces.length; i++){
    const t = traces[i];
    let entryAt, exitAt;
    if (i === 0){
      entryAt = assetPos(sourceObj, t) || { segIdx: 0, t: 0, distFromStart: 0 };
    } else {
      entryAt = connPos(t, traces[i-1]);
    }
    if (i === traces.length - 1){
      exitAt = assetPos(consumerObj, t) || (() => {
        const last = t.segments?.length || 0;
        return { segIdx: Math.max(0, last-1), t: 1, distFromStart: distAlongTraceToIdx(t, t.points.length-1) };
      })();
    } else {
      exitAt = connPos(t, traces[i+1]);
    }

    // Geordnete Endpunkte
    const a = entryAt, b = exitAt;
    const fromAt = a.distFromStart <= b.distFromStart ? a : b;
    const toAt   = a.distFromStart <= b.distFromStart ? b : a;
    const lengthM = Math.max(0, toAt.distFromStart - fromAt.distFromStart);

    // Segment-Indices, die ganz oder teilweise belegt werden
    const segIds = [];
    const lo = fromAt.segIdx;
    const hi = toAt.segIdx;
    for (let s = lo; s <= hi; s++) segIds.push(s);
    // Edge-Case: gleicher segIdx, aber t-Anteile gleich → mind. dieses Segment
    if (!segIds.length && t.segments?.length) segIds.push(0);

    // Eigenschaften an Array hängen (Arrays sind Objekte)
    segIds.lengthM = lengthM;
    segIds.entryAt = entryAt;
    segIds.exitAt = exitAt;
    result.set(t.id, segIds);
  }
  return result;
}

// Erzeugt Cable-Eintrag(e) auf den Trassen einer Kette für eine supply
// Ueberschreibt bestehende cables mit gleicher feedSupplyId
export function applySupplyToTraces(supply, sourceObj, consumerObj){
  if (!supply || !supply.cableTypeId || !Array.isArray(supply.traceIds)) return;
  const ct = state.cableTypes.find(c => c.id === supply.cableTypeId);
  if (!ct) return;

  // Erst alle alten cables mit diesem feedSupplyId entfernen
  state.traces.forEach(t => {
    t.cables = (t.cables||[]).filter(c => c.feedSupplyId !== supply.id);
  });

  // Pfad-Segmente entlang der Kette (kürzester Weg innerhalb der Kette)
  const segMap = computeChainSegments(supply.traceIds, sourceObj, consumerObj);

  supply.traceIds.forEach(tid => {
    const t = state.traces.find(x => x.id === tid);
    if (!t) return;
    const segIds = segMap.get(tid) || [];
    if (!segIds.length) return; // Trasse trägt keinen Pfad bei
    t.cables = t.cables || [];
    t.cables.push({
      id: uid(),
      typeId: ct.id,
      label: ct.label,
      priceSnapshot: ct.price,
      priceOverride: null,
      count: Number(supply.count)||1,
      reserveMode: supply.reserveMode || 'pct',
      reserveValue: Number(supply.reserveValue)||10,
      segIds,
      feedSupplyId: supply.id,
      feedFromId: sourceObj?.id || null,
      feedToId: consumerObj?.id || null,
    });
  });
}

// Entfernt alle Cables einer supply
export function removeSupplyCables(supplyId){
  state.traces.forEach(t => {
    t.cables = (t.cables||[]).filter(c => c.feedSupplyId !== supplyId);
  });
}

// Rechnet alle supplies aller Objekte neu durch — nutzt aktuellen
// Asset/Trassen-Stand. Aufrufen nach Asset-Move oder Trassen-Edit.
export function recomputeAllSupplies(){
  state.objects.forEach(o => {
    (o.supplies||[]).forEach(s => {
      const src = state.objects.find(x => x.id === s.sourceId);
      applySupplyToTraces(s, src, o);
    });
  });
}

// Helper fuer Inspector / Feed: alle bestehenden supplies eines Assets
export function getSupplies(obj){
  if (!Array.isArray(obj.supplies)) obj.supplies = [];
  return obj.supplies;
}

export function addSupply(obj, partial){
  obj.supplies = obj.supplies || [];
  const s = {
    id: uid(),
    sourceId: null,
    traceIds: [],
    cableTypeId: null,
    count: 1,
    reserveValue: 10,
    reserveMode: 'pct',
    ...partial,
  };
  obj.supplies.push(s);
  return s;
}

export function removeSupply(obj, supplyId){
  obj.supplies = (obj.supplies || []).filter(s => s.id !== supplyId);
  removeSupplyCables(supplyId);
}

// Aufräumen, wenn ein Asset gelöscht wird:
// - alle supplies anderer Objekte, die dieses Asset als Quelle haben → entfernen
// - alle cables (feedFromId / feedToId) auf Trassen, die dieses Asset referenzieren → entfernen
export function cleanupAfterObjectDelete(deletedId){
  state.objects.forEach(o => {
    const before = (o.supplies||[]).length;
    o.supplies = (o.supplies||[]).filter(s => s.sourceId !== deletedId);
    if (before !== o.supplies.length){
      // entfernten supplies auch ihre cables wegräumen
      state.traces.forEach(t => {
        t.cables = (t.cables||[]).filter(c => !(c.feedFromId === deletedId || c.feedToId === deletedId));
      });
    }
    if (o.supplyFromId === deletedId){ o.supplyFromId = null; o.supplyCable = false; }
  });
  // Auch ohne supplies[]-Treffer: alle Kabel die dieses Asset referenzieren weg
  state.traces.forEach(t => {
    t.cables = (t.cables||[]).filter(c => !(c.feedFromId === deletedId || c.feedToId === deletedId));
  });
}

// Aufräumen, wenn eine Trasse gelöscht wird:
// - aus allen supplies[].traceIds rauswerfen
// - Abzweig-Trassen (parentTraceId === deleted) parent zurücksetzen (werden zu Standalone)
export function cleanupAfterTraceDelete(deletedId){
  state.objects.forEach(o => {
    (o.supplies||[]).forEach(s => {
      if (Array.isArray(s.traceIds)){
        s.traceIds = s.traceIds.filter(tid => tid !== deletedId);
      }
    });
    if (o.linkedTraceId === deletedId) o.linkedTraceId = null;
  });
  state.traces.forEach(t => {
    if (t.parentTraceId === deletedId){
      t.parentTraceId = null;
      t.parentPointIdx = null;
    }
  });
}

// ============================================================
// Chain-Highlight: für eine Selektion ermittelt diese Funktion
// alle zugehörigen Trassen und Assets der Versorgungs-Kette.
// - Asset selektiert: alle direkten supplies[] (downstream-Quelle, Trassen)
//   PLUS alle anderen Assets, deren supplies dieses Asset als Quelle nutzen (downstream)
//   transitive Verfolgung in BEIDE Richtungen
// - Trasse selektiert: alle Assets, deren supplies diese Trasse enthalten
//   PLUS alle weiteren Trassen aus deren Ketten (gleiche Versorgung)
// Liefert: { traceIds:Set<string>, objectIds:Set<string>, supplyIds:Set<string> }
// ============================================================
export function chainForSelection(sel){
  const traceIds = new Set();
  const objectIds = new Set();
  const supplyIds = new Set();
  if (!sel) return { traceIds, objectIds, supplyIds };

  const visit = (objId) => {
    if (!objId || objectIds.has(objId)) return;
    objectIds.add(objId);
    const obj = state.objects.find(o => o.id === objId);
    if (!obj) return;
    // upstream: eigene supplies
    (obj.supplies||[]).forEach(s => {
      supplyIds.add(s.id);
      (s.traceIds||[]).forEach(tid => traceIds.add(tid));
      if (s.sourceId) visit(s.sourceId);
    });
    // downstream: andere Objekte, die dieses als Quelle nutzen
    state.objects.forEach(other => {
      (other.supplies||[]).forEach(s => {
        if (s.sourceId === objId){
          supplyIds.add(s.id);
          (s.traceIds||[]).forEach(tid => traceIds.add(tid));
          visit(other.id);
        }
      });
    });
  };

  if (sel.kind === 'object'){
    visit(sel.id);
  } else if (sel.kind === 'trace'){
    // alle supplies finden, die diese Trasse enthalten — dann von beiden Endpunkten ausgehen
    state.objects.forEach(o => {
      (o.supplies||[]).forEach(s => {
        if ((s.traceIds||[]).includes(sel.id)){
          supplyIds.add(s.id);
          (s.traceIds||[]).forEach(tid => traceIds.add(tid));
          visit(o.id);
          if (s.sourceId) visit(s.sourceId);
        }
      });
    });
    traceIds.add(sel.id);
  }
  return { traceIds, objectIds, supplyIds };
}
