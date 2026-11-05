import { Bell, Bot, ChevronRight, CircleHelp, LayoutDashboard, ListFilter, Radio, Settings2, SlidersHorizontal, Wifi } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import type { HTMLAttributes, ReactNode } from 'react';
import type { Connection } from '@workspace/api-client-react';

const navItems = [
  { href: '/', label: 'Control room', short: 'Room', icon: LayoutDashboard },
  { href: '/sources', label: 'Sources', short: 'Sources', icon: Radio },
  { href: '/rules', label: 'Rules', short: 'Rules', icon: SlidersHorizontal },
  { href: '/connection', label: 'Connection', short: 'Connect', icon: Wifi },
];

export function RelayShell({ children, connection }: { children: ReactNode; connection?: Connection }) {
  const [location] = useLocation();
  const isConfigured = connection?.status === 'connected';
  return (
    <div className="signal-noise min-h-[100dvh] bg-background text-foreground lg:flex">
      <aside className="hidden w-[252px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex">
        <BrandMark />
        <div className="mt-9 px-2 text-[10px] font-semibold uppercase tracking-[.18em] text-sidebar-foreground/45">Operations</div>
        <nav className="mt-3 space-y-1.5" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} data-testid={`link-nav-${item.short.toLowerCase()}`} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_8px_20px_hsl(var(--sidebar-primary)/.15)]' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
                <Icon className={`size-[17px] ${active ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/55 group-hover:text-sidebar-primary'}`} strokeWidth={active ? 2.5 : 1.8} />
                <span>{item.label}</span>
                {active && <ChevronRight className="ml-auto size-3.5" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <div className={`mb-5 rounded-xl border p-3.5 ${isConfigured ? 'border-emerald-300/20 bg-emerald-400/8' : 'border-amber-200/20 bg-amber-300/8'}`}>
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${isConfigured ? 'bg-emerald-300' : 'bg-amber-300 relay-pulse'}`} />
              <span className="text-xs font-semibold">{isConfigured ? 'Relay online' : 'Setup required'}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-sidebar-foreground/55">{isConfigured ? 'Listening to enabled sources.' : 'Log in the Telegram user account to start relaying.'}</p>
            <Link href="/connection" data-testid="link-sidebar-connection" className="mt-3 inline-flex items-center text-[11px] font-semibold text-sidebar-primary hover:underline">View connection <ChevronRight className="ml-1 size-3" /></Link>
          </div>
          <div className="flex items-center gap-2 border-t border-sidebar-border pt-4 text-[10px] font-mono uppercase tracking-[.14em] text-sidebar-foreground/35"><CircleHelp className="size-3.5" /> Relay v0.1</div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur-md sm:px-7 lg:px-10">
          <div className="lg:hidden"><BrandMark compact /></div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="font-mono text-[10px] uppercase tracking-[.15em]">Workspace</span><ChevronRight className="size-3" /><span className="font-medium text-foreground">{navItems.find((item) => item.href === location || (item.href !== '/' && location.startsWith(item.href)))?.label ?? 'Control room'}</span></div>
          <div className="ml-auto flex items-center gap-2.5">
            <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium sm:flex ${isConfigured ? 'border-emerald-300/50 bg-emerald-50 text-emerald-800' : 'border-amber-300/60 bg-amber-50 text-amber-800'}`} data-testid="status-header-connection">
              <span className={`size-1.5 rounded-full ${isConfigured ? 'bg-emerald-500' : 'bg-amber-500 relay-pulse'}`} /> {isConfigured ? 'Telegram connected' : 'Telegram not configured'}
            </div>
            <button type="button" aria-label="Notifications" data-testid="button-notifications" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Bell className="size-[18px]" strokeWidth={1.7} /></button>
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground" data-testid="avatar-operator">OP</div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10">{children}</main>
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-border bg-background/95 px-2 backdrop-blur-md lg:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
            return <Link key={item.href} href={item.href} data-testid={`link-mobile-${item.short.toLowerCase()}`} className={`flex min-w-[64px] flex-col items-center gap-1 py-2 text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}><Icon className="size-[18px]" /><span>{item.short}</span></Link>;
          })}
        </nav>
      </div>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" data-testid="link-brand" className={`flex items-center gap-3 ${compact ? '' : 'px-2'}`}>
      <span className="relative flex size-8 items-center justify-center overflow-hidden rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_6px_16px_hsl(var(--sidebar-primary)/.15)]"><span className="absolute h-px w-5 bg-current opacity-70" /><span className="absolute h-5 w-px bg-current opacity-70" /><span className="absolute size-1.5 rounded-full bg-current" /></span>
      <span className="leading-none"><span className={`block font-serif text-lg font-bold tracking-[-.04em] ${compact ? 'text-foreground' : 'text-sidebar-foreground'}`}>Signal Relay</span>{!compact && <span className="mt-1 block font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/45">curate the signal</span>}</span>
    </Link>
  );
}

export function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.18em] text-primary"><span className="size-1.5 rounded-full bg-secondary" /> {eyebrow}</div><h1 className="font-serif text-3xl font-bold tracking-[-.04em] text-balance sm:text-[38px]">{title}</h1>{detail && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

export function DataNotice({ kind = 'error', title, detail, action }: { kind?: 'error' | 'empty'; title: string; detail: string; action?: ReactNode }) {
  return <div className={`rounded-xl border p-6 ${kind === 'error' ? 'border-destructive/25 bg-destructive/5' : 'border-border bg-card'}`} data-testid={`notice-${kind}`}><div className="flex gap-3"><div className={`mt-0.5 size-2 rounded-full ${kind === 'error' ? 'bg-destructive' : 'bg-secondary'}`} /><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p>{action && <div className="mt-4">{action}</div>}</div></div></div>;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} aria-hidden="true" />;
}

export function formatReceived(value?: string) {
  if (!value) return 'Awaiting first sync';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function Toggle({ checked, onChange, label, testId }: { checked: boolean; onChange: (value: boolean) => void; label: string; testId: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} data-testid={testId} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${checked ? 'border-primary bg-primary' : 'border-border bg-muted'}`}><span className={`absolute top-1 size-4 rounded-full bg-card shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-1'}`} /></button>;
}

export function Panel({ children, className = '', ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-card-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/.03)] ${className}`} {...props}>{children}</div>;
}
