// Port of js/components/SankeyChart.js — pure SVG sankey layout + renderer.
import { formatAmount } from '@/lib/utils/ledger';

const PALETTE = ['#2f5d50', '#c98a1f', '#7a4fa3', '#2f7f8f', '#a3452f', '#4f7a2f', '#a34f8a', '#5f5f5f', '#2f5da3', '#8a6b2f'];
const RIGHT_MARGIN = 150;
const MIN_LABEL_GAP = 14;
const TWO_LINE_GAP = 28;

export interface SankeyNode { id: string; label: string; column: number }
export interface SankeyLink { source: string; target: string; value: number }

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function layout(nodes: SankeyNode[], links: SankeyLink[], width: number, height: number) {
  const nodeWidth = 12;
  const nodePad = 10;
  const plotWidth = Math.max(width - RIGHT_MARGIN - nodeWidth, nodeWidth);

  const byColumn: Record<number, SankeyNode[]> = {};
  nodes.forEach(n => { (byColumn[n.column] = byColumn[n.column] || []).push(n); });
  const columnKeys = Object.keys(byColumn).map(Number).sort((a, b) => a - b);
  const numCols = columnKeys.length;

  const outSum: Record<string, number> = {}, inSum: Record<string, number> = {};
  links.forEach(l => {
    outSum[l.source] = (outSum[l.source] || 0) + l.value;
    inSum[l.target] = (inSum[l.target] || 0) + l.value;
  });
  const nodeValue: Record<string, number> = {};
  nodes.forEach(n => { nodeValue[n.id] = Math.max(outSum[n.id] || 0, inSum[n.id] || 0) || 0.01; });

  type Pos = { x: number; y: number; h: number; index: number; column: number };
  const pos: Record<string, Pos> = {};
  columnKeys.forEach((c, ci) => {
    const colNodes = byColumn[c].slice().sort((a, b) => nodeValue[b.id] - nodeValue[a.id]);
    const total = colNodes.reduce((s, n) => s + nodeValue[n.id], 0) || 1;
    const totalPad = nodePad * Math.max(0, colNodes.length - 1);
    const avail = Math.max(height - totalPad, 10);
    const x = numCols === 1 ? 0 : ci * (plotWidth / (numCols - 1));
    let y = 0;
    colNodes.forEach((n, i) => {
      const h = Math.max((nodeValue[n.id] / total) * avail, 3);
      pos[n.id] = { x, y, h, index: i, column: c };
      y += h + nodePad;
    });
  });

  const sortedLinks = links.slice().sort((a, b) => {
    const pa = pos[a.source], pb = pos[b.source];
    if (!pa || !pb) return 0;
    if (pa.column !== pb.column) return pa.column - pb.column;
    if (pa.index !== pb.index) return pa.index - pb.index;
    const ta = pos[a.target], tb = pos[b.target];
    return (ta ? ta.index : 0) - (tb ? tb.index : 0);
  });

  const sourceCursor: Record<string, number> = {}, targetCursor: Record<string, number> = {};
  nodes.forEach(n => { sourceCursor[n.id] = pos[n.id].y; targetCursor[n.id] = pos[n.id].y; });

  const builtLinks = sortedLinks.map(l => {
    const sp = pos[l.source], tp = pos[l.target];
    const sTotal = outSum[l.source] || 1;
    const tTotal = inSum[l.target] || 1;
    const sH = (l.value / sTotal) * sp.h;
    const tH = (l.value / tTotal) * tp.h;
    const y0 = sourceCursor[l.source];
    const y1 = targetCursor[l.target];
    sourceCursor[l.source] += sH;
    targetCursor[l.target] += tH;

    const x0 = sp.x + nodeWidth;
    const x1 = tp.x;
    const midX = (x0 + x1) / 2;
    const path = `M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1} L${x1},${y1 + tH} C${midX},${y1 + tH} ${midX},${y0 + sH} ${x0},${y0 + sH} Z`;
    return { ...l, path };
  });

  const builtNodes = nodes.map(n => ({ ...n, ...pos[n.id], value: nodeValue[n.id] }));
  return { nodes: builtNodes, links: builtLinks, numCols, nodeWidth };
}

function declutterLabels(builtNodes: Array<SankeyNode & { x: number; y: number; h: number }>) {
  const byColumn: Record<number, typeof builtNodes> = {};
  builtNodes.forEach(n => { (byColumn[n.column] = byColumn[n.column] || []).push(n); });

  const result: Record<string, { y: number; trueY: number; gap: number }> = {};
  Object.values(byColumn).forEach(colNodes => {
    const sorted = colNodes.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    let prevAssigned: number | null = null;
    sorted.forEach(n => {
      const trueY = n.y + n.h / 2;
      const y = prevAssigned === null ? trueY : Math.max(trueY, prevAssigned + MIN_LABEL_GAP);
      result[n.id] = { y, trueY, gap: 0 };
      prevAssigned = y;
    });
    sorted.forEach((n, i) => {
      const prev = i > 0 ? result[sorted[i - 1].id].y : -Infinity;
      const next = i < sorted.length - 1 ? result[sorted[i + 1].id].y : Infinity;
      result[n.id].gap = Math.min(result[n.id].y - prev, next - result[n.id].y);
    });
  });
  return result;
}

export function SankeyChart({ nodes, links, width, height }: { nodes: SankeyNode[]; links: SankeyLink[]; width?: number; height?: number }) {
  const w = width || 760;
  const h = height || Math.min(520, Math.max(260, nodes.length * 24));

  if (nodes.length <= 1 || links.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough flow to draw a diagram.</p>;
  }

  const { nodes: builtNodes, links: builtLinks, nodeWidth } = layout(nodes, links, w, h);
  const labelPos = declutterLabels(builtNodes);
  const BOTTOM_PAD = 30;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h + BOTTOM_PAD}`} className="w-full min-w-[600px]" preserveAspectRatio="xMidYMid meet">
        {builtLinks.map((l, i) => (
          <path key={i} d={l.path} fill={colorFor(l.source)} fillOpacity={0.35} stroke="none">
            <title>{l.source} → {l.target}: {formatAmount(l.value)}</title>
          </path>
        ))}
        {builtNodes.map(n => {
          const lp = labelPos[n.id];
          const trueCenterY = n.y + n.h / 2;
          const needsLeader = Math.abs(lp.y - trueCenterY) > 1.5;
          const twoLine = lp.gap >= TWO_LINE_GAP;
          const textX = n.x + nodeWidth + 6;
          const labelText = twoLine ? n.label : `${n.label} · ${formatAmount(n.value)}`;

          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={nodeWidth} height={n.h} rx={2} fill={colorFor(n.id)}>
                <title>{n.label}: {formatAmount(n.value)}</title>
              </rect>
              {needsLeader && (
                <path d={`M ${n.x + nodeWidth},${trueCenterY} L ${textX - 4},${lp.y}`} stroke="hsl(var(--border))" strokeWidth={1} fill="none" />
              )}
              <text x={textX} y={twoLine ? lp.y - 6 : lp.y} dominantBaseline="middle" textAnchor="start" className="fill-foreground text-[11px]">
                {labelText}
              </text>
              {twoLine && (
                <text x={textX} y={lp.y + 7} dominantBaseline="middle" textAnchor="start" className="fill-muted-foreground text-[10px]">
                  {formatAmount(n.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
