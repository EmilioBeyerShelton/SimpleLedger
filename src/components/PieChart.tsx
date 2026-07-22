// Port of js/components/PieChart.js — pure SVG doughnut chart + legend.
import { formatAmount } from '@/lib/utils/ledger';

const INNER_RATIO = 0.58;

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

function buildSlices(items: PieSlice[]) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const cx = 100, cy = 100, r1 = 90, r0 = r1 * INNER_RATIO;
  const point = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  let angle = -Math.PI / 2;
  return items.map(item => {
    const fraction = item.value / total;
    const start = angle;
    const end = angle + fraction * Math.PI * 2;
    angle = end;
    const largeArc = end - start > Math.PI ? 1 : 0;
    const [xo1, yo1] = point(r1, start);
    const [xo2, yo2] = point(r1, end);
    const [xi2, yi2] = point(r0, end);
    const [xi1, yi1] = point(r0, start);
    const path =
      `M ${xo1.toFixed(2)},${yo1.toFixed(2)} ` +
      `A ${r1},${r1} 0 ${largeArc},1 ${xo2.toFixed(2)},${yo2.toFixed(2)} ` +
      `L ${xi2.toFixed(2)},${yi2.toFixed(2)} ` +
      `A ${r0},${r0} 0 ${largeArc},0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z`;
    return { ...item, path, percent: fraction * 100 };
  });
}

export function PieChart({ slices }: { slices: PieSlice[] }) {
  const built = buildSlices(slices);
  const total = slices.reduce((s, i) => s + i.value, 0);
  const r1 = 90, r0 = r1 * INNER_RATIO;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <svg viewBox="0 0 200 200" className="w-full max-w-[280px]">
        {built.length === 1 ? (
          <path
            fillRule="evenodd"
            fill={built[0].color}
            d={`M 100,${100 - r1} A ${r1},${r1} 0 1 0 100,${100 + r1} A ${r1},${r1} 0 1 0 100,${100 - r1}
                M 100,${100 - r0} A ${r0},${r0} 0 1 0 100,${100 + r0} A ${r0},${r0} 0 1 0 100,${100 - r0}`}
          />
        ) : (
          built.map((s, i) => <path key={i} d={s.path} fill={s.color} />)
        )}
        <text x="100" y="94" textAnchor="middle" className="fill-muted-foreground text-[11px]">Total</text>
        <text x="100" y="112" textAnchor="middle" className="fill-foreground text-[16px] font-semibold">{formatAmount(total)}</text>
      </svg>
      <div className="flex w-full flex-col gap-1.5">
        {built.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="text-muted-foreground">{formatAmount(s.value)} · {s.percent.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
