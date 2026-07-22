// Port of js/components/TopBar.js — the app title, plus (on wide/desktop
// layouts) the primary navigation. On mobile, navigation instead lives in
// BottomNav's fixed bottom tab bar, so TopBar there is just the title.
//
// This used to also show a per-platform storage status dot/message; that
// was removed — Settings already surfaces detailed linking status, and a
// terse duplicate of it up here added noise without much value.
import { Link, useMatch } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList } from '@/components/ui/navigation-menu';
import { NAV_TABS, type NavTab } from './navTabs';

// Deliberately *not* react-router's usual `<NavLink className={({isActive}) =>
// ...}>` pattern here. `NavigationMenuLink asChild` composes its own props
// onto its child via Radix's `Slot`, which merges `className` props with
// `[slotClassName, childClassName].filter(Boolean).join(' ')` — that
// assumes both are strings. Handed a *function* (NavLink's className
// form), `.join(' ')` calls `.toString()` on it, silently replacing the
// whole className with the function's source code as text — which matches
// no real Tailwind class, so nothing ever highlights. Computing `isActive`
// up front with `useMatch` and handing NavLink a plain string sidesteps
// that entirely. (`useMatch` is called here, in its own component rather
// than inline in a `.map()`, to keep it a top-level hook call per the
// rules of hooks.)
function TopBarTab({ tab }: { tab: NavTab }) {
  const isActive = !!useMatch({ path: tab.to, end: tab.end });
  return (
    <NavigationMenuItem>
      <NavigationMenuLink asChild active={isActive}>
        <Link
          to={tab.to}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent',
            isActive && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
          )}
        >
          <tab.icon className="h-4 w-4 shrink-0" />
          {tab.label}
        </Link>
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
}

export function TopBar() {
  return (
    // A 3-column grid (1fr / auto / 1fr), not `justify-between`: with only
    // two children, `justify-between` centers the nav in whatever space is
    // left *after* the title rather than in the header as a whole, so it
    // visibly drifts right of true-center once the title's width is
    // nonzero. The empty third column balances the title's column so the
    // middle (nav) column centers against the full header width.
    <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b bg-background/95 px-4 py-2.5 backdrop-blur">
      <h1 className="justify-self-start text-base font-semibold tracking-tight text-black">
        {/* Full name when there's room either side of the nav (mobile,
            where the nav is hidden entirely, or wide desktop); abbreviated
            to initials in the squeezed md..lg range where the nav bar and
            title are competing for the same row. */}
        <span className="md:hidden lg:inline">SimpleLedger</span>
        <span className="hidden md:inline lg:hidden">SL</span>
      </h1>

      <NavigationMenu className="col-start-2 hidden justify-self-center md:flex">
        <NavigationMenuList className="gap-1">
          {NAV_TABS.map(tab => (
            <TopBarTab key={tab.to} tab={tab} />
          ))}
        </NavigationMenuList>
      </NavigationMenu>

      <div aria-hidden="true" className="hidden md:block" />
    </header>
  );
}
