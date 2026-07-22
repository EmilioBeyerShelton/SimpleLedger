// Port of js/components/BottomNav.js — mobile-only tab bar. Desktop
// navigation lives in TopBar.tsx instead (see its file comment); this
// component just hides itself at md: and up rather than trying to
// reshape itself into a top bar the way it used to.
import { Link, useMatch } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV_TABS, type NavTab } from './navTabs';

// Mirrors TopBarTab's approach in TopBar.tsx: compute `isActive` up front
// via `useMatch()` in its own component (hooks can't be called inside
// `NAV_TABS.map()`), then hand a plain string className to a plain `Link`.
// Not strictly required here the way it is in TopBar — BottomNav has no
// Radix `asChild`/`Slot` wrapper to trip over `NavLink`'s function-form
// className — but keeping both nav bars' "is this tab active" logic
// identical, in one obvious shape, beats having two subtly different ones
// that only look the same by coincidence.
function BottomNavTab({ tab }: { tab: NavTab }) {
  const isActive = !!useMatch({ path: tab.to, end: tab.end });
  return (
    <Link
      to={tab.to}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-black transition-colors',
        isActive && 'bg-primary text-primary-foreground'
      )}
    >
      <tab.icon className="h-5 w-5" />
      <span>{tab.label}</span>
    </Link>
  );
}

export function BottomNav() {
  return (
    <nav className="safe-bottom sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-3xl justify-between px-1 py-1">
        {NAV_TABS.map(tab => (
          <BottomNavTab key={tab.to} tab={tab} />
        ))}
      </div>
    </nav>
  );
}
