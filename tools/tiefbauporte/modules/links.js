// v6/modules/links.js
// Zeichnet Asset→Trasse-Pfeile als SVG-Overlay auf der Karte.

import { OF_DEFS } from './constants.js';

const ARROW_ORANGE = '#F57C00';
let svgEl = null;
let labelContainer = null;
let singleActive = null;     // {objectId}
let mapMoveListener = null;
let activeCtx = null;

function ensureSvg(ctx) {
  activeCtx = ctx;
  if (svgEl && document.body.contains(svgEl)) return svgEl;
  const mapEl = document.getElementById('map');
  if (!mapEl) return null;

  svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('class', 'link-arrow-svg');
  svgEl.style.position = 'absolute';
  svgEl.style.top = '0';
  svgEl.style.left = '0';
  svgEl.style.width = '100%';
  svgEl.style.height = '100%';
  svgEl.style.pointerEvents = 'none';
  svgEl.style.zIndex = '450';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'tbp-ah');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '5');
  marker.setAttribute('orient', 'auto');
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 10 5, 0 10');
  polygon.setAttribute('fill', ARROW_ORANGE);
  marker.appendChild(polygon);
  defs.appendChild(marker);
  svgEl.appendChild(defs);

  mapEl.appendChild(svgEl);

  labelContainer = document.createElement('div');
  labelContainer.style.position = 'absolute';
  labelContainer.style.top = '0';
  labelContainer.style.left = '0';
  labelContainer.style.width = '100%';
  labelContainer.style.height = '100%';
  labelContainer.style.pointerEvents = 'none';
  labelContainer.style.zIndex = '451';
  mapEl.appendChild(labelContainer);

  if (!mapMoveListener) {
    mapMoveListener = () => redraw(activeCtx);
    ctx.map.on('move zoom', mapMoveListener);
  }

  return svgEl;
}

function clearVisual() {
  if (!svgEl) return;
  svgEl.querySelectorAll('line').forEach(l => l.remove());
  if (labelContainer) labelContainer.innerHTML = '';
}

function segmentMidpoint(trace, segIdx) {
  if (segIdx == null || segIdx < 0 || segIdx >= trace.segments.length) return null;
  const a = trace.points[segIdx];
  const b = trace.points[segIdx + 1];
  if (!a || !b) return null;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function nearestPoint(trace, lat, lng) {
  let best = null, bestD = Infinity;
  trace.points.forEach(p => {
    const dLat = p[0] - lat, dLng = p[1] - lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) { bestD = d; best = p; }
  });
  return best;
}

function linkTarget(o, state) {
  if (!o.linkedTraceId) return null;
  const t = state.traces.find(x => x.id === o.linkedTraceId);
  if (!t || !t.points.length) return null;
  if (o.linkedSegmentIdx != null) {
    return { point: segmentMidpoint(t, o.linkedSegmentIdx), trace: t, segIdx: o.linkedSegmentIdx };
  }
  return { point: nearestPoint(t, o.lat, o.lng), trace: t, segIdx: null };
}

function drawArrow(ctx, o, animate, withLabel) {
  const target = linkTarget(o, ctx.state);
  if (!target || !target.point) return;
  const from = ctx.map.latLngToContainerPoint([o.lat, o.lng]);
  const to = ctx.map.latLngToContainerPoint(target.point);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', from.x);
  line.setAttribute('y1', from.y);
  line.setAttribute('x2', to.x);
  line.setAttribute('y2', to.y);
  line.setAttribute('stroke', ARROW_ORANGE);
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-dasharray', '6,4');
  line.setAttribute('marker-end', 'url(#tbp-ah)');
  line.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,.3))';
  if (animate) {
    const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    anim.setAttribute('attributeName', 'stroke-dashoffset');
    anim.setAttribute('from', '0');
    anim.setAttribute('to', '-10');
    anim.setAttribute('dur', '1s');
    anim.setAttribute('repeatCount', 'indefinite');
    line.appendChild(anim);
  }
  svgEl.appendChild(line);

  if (withLabel && target.segIdx != null && target.trace) {
    const seg = target.trace.segments[target.segIdx];
    const def = OF_DEFS[seg.of];
    const label = document.createElement('div');
    label.className = 'link-arrow-label';
    label.style.position = 'absolute';
    label.style.left = (to.x + 10) + 'px';
    label.style.top = (to.y - 24) + 'px';
    label.textContent = `→ Segment ${target.segIdx + 1} · ${def?.label || seg.of}`;
    labelContainer.appendChild(label);
  }
}

function redraw(ctx) {
  if (!ctx) return;
  ensureSvg(ctx);
  clearVisual();

  if (singleActive) {
    const o = ctx.state.objects.find(x => x.id === singleActive.objectId);
    if (o && o.linkedTraceId) drawArrow(ctx, o, true, true);
  }

  if (ctx.state.viz.links) {
    ctx.state.objects.forEach(o => {
      if (!o.linkedTraceId) return;
      if (singleActive && singleActive.objectId === o.id) return;
      drawArrow(ctx, o, false, false);
    });
  }
}

export function showSingleArrow(ctx, objectId) {
  ensureSvg(ctx);
  singleActive = { objectId };
  redraw(ctx);
}

export function hideSingleArrow() {
  singleActive = null;
  if (activeCtx) redraw(activeCtx);
}

export function renderAllLinks(ctx) {
  ensureSvg(ctx);
  redraw(ctx);
}

export function clearAllLinks() {
  clearVisual();
}
