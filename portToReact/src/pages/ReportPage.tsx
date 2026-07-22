// Port of js/components/ReportView.js — account picker, date range, depth
// slider, pie/sankey chart toggle.
import { useMemo, useState } from 'react';
import { useLedgerStore } from '@/store/useLedgerStore';
import { formatAmount } from '@/lib/utils/ledger';
import { AccountPicker } from '@/components/AccountPicker';
import { PieChart, type PieSlice } from '@/components/PieChart';
import { SankeyChart, type SankeyNode, type SankeyLink } from '@/components/SankeyChart';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import type { Account, Transaction } from '@/types/ledger';

const PALETTE = ['#2f5d50', '#c98a1f', '#7a4fa3', '#2f7f8f', '#a3452f', '#4f7a2f', '#a34f8a', '#5f5f5f', '#2f5da3', '#8a6b2f'];

function truncatePath(id: string, depth: number) {
  const parts = String(id).split('.');
  return parts.slice(0, Math.max(1, Math.min(depth, parts.length))).join('.');
}

function labelFor(id: string, accounts: Account[]) {
  const acc = accounts.find(a => a.id === id);
  if (acc) return acc.title;
  const last = String(id).split('.').pop() || id;
  return last.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function buildSankeyData(filtered: Transaction[], accountId: string, mode: 'from' | 'to', accounts: Account[]) {
  const linkTotals = new Map<string, number>();
  const nodeIds = new Set<string>([accountId]);

  filtered.forEach(t => {
    const counterpart = mode === 'from' ? t.to : t.from;
    const parts = String(counterpart).split('.');
    const levels = parts.map((_, i) => parts.slice(0, i + 1).join('.'));
    const chain = mode === 'from' ? [accountId, ...levels] : [...levels, accountId];
    chain.forEach(id => nodeIds.add(id));
    for (let i = 0; i < chain.length - 1; i++) {
      const key = chain[i] + '→' + chain[i + 1];
      linkTotals.set(key, (linkTotals.get(key) || 0) + t.amount);
    }
  });

  function depthOf(id: string) { return String(id).split('.').length; }
  const otherDepths = [...nodeIds].filter(id => id !== accountId).map(depthOf);
  const maxOtherDepth = otherDepths.length ? Math.max(...otherDepths) : 0;

  const nodes: SankeyNode[] = [...nodeIds].map(id => {
    const column = id === accountId ? (mode === 'from' ? 0 : maxOtherDepth) : (mode === 'from' ? depthOf(id) : depthOf(id) - 1);
    return { id, label: labelFor(id, accounts), column };
  });

  const links: SankeyLink[] = [...linkTotals.entries()].map(([key, value]) => {
    const [source, target] = key.split('→');
    return { source, target, value };
  });

  return { nodes, links };
}

export default function ReportPage() {
  const data = useLedgerStore(s => s.data)!;
  const defaultId = data.settings.defaultAccountId;

  const [accountId, setAccountId] = useState<string>(defaultId || data.accounts[0]?.id || '');
  const [mode, setMode] = useState<'from' | 'to'>('from');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [depth, setDepth] = useState(2);
  const [chartType, setChartType] = useState<'pie' | 'sankey'>('pie');

  const filtered = useMemo(() => {
    return data.transactions.filter(t => {
      const matchesAccount = mode === 'from' ? t.from === accountId : t.to === accountId;
      if (!matchesAccount) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      return true;
    });
  }, [data.transactions, accountId, mode, dateFrom, dateTo]);

  const maxDepth = useMemo(() => {
    let max = 1;
    filtered.forEach(t => {
      const counterpart = mode === 'from' ? t.to : t.from;
      max = Math.max(max, String(counterpart).split('.').length);
    });
    return max;
  }, [filtered, mode]);

  const effectiveDepth = Math.min(depth, maxDepth);

  const grouped = useMemo(() => {
    const totals: Record<string, number> = {};
    filtered.forEach(t => {
      const counterpart = mode === 'from' ? t.to : t.from;
      const key = truncatePath(counterpart, effectiveDepth);
      totals[key] = (totals[key] || 0) + t.amount;
    });
    return Object.entries(totals).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filtered, mode, effectiveDepth]);

  const total = grouped.reduce((s, g) => s + g.value, 0);
  const slices: PieSlice[] = grouped.map((g, i) => ({ ...g, color: PALETTE[i % PALETTE.length] }));
  const accountTitle = data.accounts.find(a => a.id === accountId)?.title || accountId || '—';

  const sankeyData = useMemo(() => buildSankeyData(filtered, accountId, mode, data.accounts), [filtered, accountId, mode, data.accounts]);

  if (data.accounts.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-xl font-semibold">Report</h2>
        <p className="text-sm text-muted-foreground">Add an account first — the Accounts tab.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">Report</h2>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Account</span>
          <AccountPicker accounts={data.accounts} value={accountId} onChange={setAccountId} placeholder="Type or pick an account" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={mode === 'to'} onCheckedChange={c => setMode(c ? 'to' : 'from')} />
          Show transactions going to this account instead
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">From date</span>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">To date</span>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        {chartType === 'pie' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Group by depth — {effectiveDepth} of {maxDepth}</span>
            <Slider min={1} max={Math.max(maxDepth, 1)} step={1} value={[effectiveDepth]} disabled={maxDepth <= 1} onValueChange={v => setDepth(v[0])} />
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} expense{filtered.length === 1 ? '' : 's'} {mode === 'from' ? 'from' : 'to'} <b className="text-foreground">{accountTitle}</b>
        {(dateFrom || dateTo) && <> between {dateFrom || '…'} and {dateTo || '…'}</>} — total {formatAmount(total)}
      </p>

      <div className="flex gap-2">
        <Button variant={chartType === 'pie' ? 'default' : 'outline'} size="sm" onClick={() => setChartType('pie')}>Pie</Button>
        <Button variant={chartType === 'sankey' ? 'default' : 'outline'} size="sm" onClick={() => setChartType('sankey')}>Sankey (full depth)</Button>
      </div>

      {chartType === 'pie' ? (
        slices.length === 0 ? <p className="text-sm text-muted-foreground">No matching expenses.</p> : <PieChart slices={slices} />
      ) : (
        <SankeyChart nodes={sankeyData.nodes} links={sankeyData.links} />
      )}
    </div>
  );
}
