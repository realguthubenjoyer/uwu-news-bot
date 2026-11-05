import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Ban, Check, Clock3, Image, Languages, Loader2, Radio, RefreshCw, Send, ShieldAlert, Video } from 'lucide-react';
import { getGetDashboardQueryKey, getListPostsQueryKey, useGetDashboard, useListPosts, useRunSync } from '@workspace/api-client-react';
import type { Post } from '@workspace/api-client-react';
import { DataNotice, formatDate, formatReceived, Panel, SectionHeading, SkeletonBlock } from '@/components/relay-shell';

const tabs = [{ value: 'all', label: 'All activity' }, { value: 'published', label: 'Published' }, { value: 'queued', label: 'Needs review' }, { value: 'blocked', label: 'Ads removed' }];

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const dashboard = useGetDashboard();
  const posts = useListPosts(status === 'all' ? undefined : { status: status as 'published' | 'queued' | 'blocked' }, { query: { queryKey: getListPostsQueryKey(status === 'all' ? undefined : { status: status as 'published' | 'queued' | 'blocked' }), refetchInterval: 30_000 } });
  const runSync = useRunSync();
  const isLoading = dashboard.isLoading || posts.isLoading;
  const postItems = posts.data ?? [];
  const metrics = dashboard.data;

  const handleSync = () => {
    runSync.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      },
    });
  };

  return (
    <div className="control-grid -mx-4 min-h-[calc(100dvh-68px)] px-4 pb-20 sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10">
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading eyebrow="Live desk / 04:12 UTC" title="Control room" detail="A clean handoff from public feeds to one trusted destination." action={<button type="button" onClick={handleSync} disabled={runSync.isPending} data-testid="button-run-sync" className="group inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_6px_15px_hsl(var(--primary)/.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_9px_20px_hsl(var(--primary)/.2)] disabled:cursor-wait disabled:opacity-70">{runSync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4 transition-transform group-hover:rotate-45" />} {runSync.isPending ? 'Syncing feeds…' : 'Run sync'}</button>} />
        {runSync.data && <div className={`mb-5 flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${runSync.data.accepted ? 'border-emerald-300/70 bg-emerald-50 text-emerald-900' : 'border-amber-300/70 bg-amber-50 text-amber-900'}`} data-testid="status-sync-result"><span className="flex items-center gap-2"><Check className="size-4" /> {runSync.data.message}</span><span className="font-mono text-[10px] uppercase tracking-wider opacity-60">{formatReceived(runSync.data.queuedAt)}</span></div>}
        {runSync.isError && <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" data-testid="status-sync-error">Sync could not be queued. Check the connection before trying again.</div>}
        {dashboard.isError ? <DataNotice title="Dashboard unavailable" detail="The relay summary did not load. The feed can be retried without losing your place." action={<button type="button" onClick={() => dashboard.refetch()} data-testid="button-retry-dashboard" className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">Retry summary</button>} /> : <MetricStrip loading={isLoading} metrics={metrics} />}
        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          <section className="min-w-0">
            <Panel className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-serif text-xl font-bold tracking-[-.03em]">Relay stream</h2><p className="mt-0.5 text-xs text-muted-foreground">Latest messages from enabled sources</p></div>
                <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Post status">
                  {tabs.map((tab) => <button type="button" key={tab.value} role="tab" aria-selected={status === tab.value} onClick={() => setStatus(tab.value)} data-testid={`tab-posts-${tab.value}`} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all ${status === tab.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{tab.label}</button>)}
                </div>
              </div>
              {posts.isError ? <div className="p-6"><DataNotice title="Stream paused" detail="Recent posts could not be loaded from the relay service." action={<button type="button" onClick={() => posts.refetch()} data-testid="button-retry-posts" className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">Try again</button>} /></div> : isLoading ? <PostSkeleton /> : postItems.length === 0 ? <EmptyStream filter={status} /> : <div className="divide-y divide-border">{postItems.map((post, index) => <PostRow key={post.id} post={post} index={index} />)}</div>}
            </Panel>
          </section>
          <aside className="space-y-6">
            <RelayPreview posts={postItems} />
            <ModerationPreview />
            <DeskLegend />
          </aside>
        </div>
      </div>
    </div>
  );
}

function MetricStrip({ loading, metrics }: { loading: boolean; metrics?: { activeSources: number; postsToday: number; blockedToday: number; mediaRate: number; lastSync: string; syncState?: string } }) {
  const items = [
    { label: 'Active sources', value: metrics?.activeSources ?? 0, meta: 'enabled feeds', icon: Radio, color: 'text-primary' },
    { label: 'Posts today', value: metrics?.postsToday ?? 0, meta: 'across all feeds', icon: Send, color: 'text-primary' },
    { label: 'Ads removed today', value: metrics?.blockedToday ?? 0, meta: 'posts kept clean', icon: Ban, color: 'text-destructive' },
    { label: 'Media preserved', value: metrics ? `${Math.round(metrics.mediaRate)}%` : '0%', meta: 'of published posts', icon: Image, color: 'text-secondary-foreground' },
  ];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{items.map((item, index) => { const Icon = item.icon; return <Panel key={item.label} className={`relay-rise relay-rise-${index + 1} relative overflow-hidden p-4 sm:p-5`} data-testid={`metric-${item.label.toLowerCase().replaceAll(' ', '-')}`}><div className={`mb-5 flex size-8 items-center justify-center rounded-lg bg-muted ${item.color}`}><Icon className="size-4" /></div>{loading ? <><SkeletonBlock className="h-8 w-16" /><SkeletonBlock className="mt-2 h-3 w-24" /></> : <><div className="font-serif text-3xl font-bold tracking-[-.05em]">{item.value}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.meta}</div></>}<div className="absolute -right-4 -top-5 size-20 rounded-full border border-border/50" /></Panel>; })}</div>;
}

function PostRow({ post, index }: { post: Post; index: number }) {
  const statusStyle = post.status === 'published' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : post.status === 'blocked' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200';
  return <article className="relay-rise flex gap-3 px-5 py-4 transition-colors hover:bg-muted/35 sm:gap-4" style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }} data-testid={`post-row-${post.id}`}>
    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-medium text-accent-foreground">{post.sourceHandle.replace('@', '').slice(0, 2).toUpperCase()}</div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-primary">{post.sourceName}</span><span className="text-[10px] text-muted-foreground">/ {post.group}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{formatReceived(post.receivedAt)}</span></div><h3 className="mt-1.5 line-clamp-1 text-sm font-semibold leading-snug">{post.headline}</h3><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{post.body}</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyle}`}>{post.status}</span>{post.translated && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"><Languages className="size-3" /> translated</span>}{post.mediaType !== 'none' && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{post.mediaType === 'video' ? <Video className="size-3" /> : <Image className="size-3" />} media</span>}{post.reason && <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><ShieldAlert className="size-3" /> {post.reason}</span>}</div></div><ArrowUpRight className="mt-1 hidden size-4 text-muted-foreground/50 sm:block" />
  </article>;
}

function RelayPreview({ posts }: { posts: Post[] }) {
  const sample = useMemo(() => posts.find((post) => post.status === 'published') ?? posts[0], [posts]);
  return <Panel className="overflow-hidden bg-[#f5f7f3] dark:bg-card" data-testid="card-relay-preview"><div className="flex items-center justify-between border-b border-[#dce4dc] px-4 py-3"><div><div className="font-mono text-[9px] uppercase tracking-[.16em] text-[#6d8373]">Destination preview</div><div className="mt-1 text-xs font-semibold text-[#20352b] dark:text-foreground"># relay-destination</div></div><span className="flex items-center gap-1 text-[10px] text-[#698071]"><span className="size-1.5 rounded-full bg-emerald-500" /> formatted</span></div><div className="p-3"><div className="rounded-[13px] rounded-tl-[4px] bg-card px-3.5 py-3 shadow-sm"><div className="flex items-center gap-2 text-[10px] font-semibold text-primary"><span className="flex size-5 items-center justify-center rounded-full bg-accent text-[8px] font-bold">{sample ? sample.sourceHandle.replace('@', '').slice(0, 1).toUpperCase() : 'S'}</span>{sample?.sourceName ?? 'Source label'} <span className="font-normal text-muted-foreground">via Signal Relay</span></div><div className="mt-3 border-l-2 border-secondary pl-2.5"><p className="text-xs font-semibold leading-snug text-foreground">{sample?.headline ?? 'A source label will appear here'}</p><p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{sample?.body ?? 'Preserved media and translated copy stay together in the outgoing post.'}</p></div><div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground"><span>{sample?.mediaType !== 'none' ? 'Media attached' : 'Text relay'}</span><span>{sample ? formatReceived(sample.receivedAt) : '—'}</span></div></div></div><div className="border-t border-[#dce4dc] px-4 py-2.5 text-[10px] leading-relaxed text-[#6d8373]">Source attribution stays visible at the top of every published post.</div></Panel>;
}

 function DeskLegend() {
  return <Panel className="p-5"><div className="flex items-center gap-2"><Clock3 className="size-4 text-secondary-foreground" /><h3 className="text-sm font-semibold">Desk notes</h3></div><div className="mt-4 space-y-3 text-xs leading-relaxed text-muted-foreground"><p><span className="font-semibold text-foreground">Queued</span> posts are waiting for the next relay cycle.</p><p><span className="font-semibold text-foreground">Ads removed</span> posts keep their news while promotional blocks stay in the audit trail.</p><p><span className="font-semibold text-foreground">Last sync</span> is refreshed after each accepted cycle.</p></div></Panel>;
}

 function ModerationPreview() {
  return <Panel className="overflow-hidden" data-testid="card-moderation-preview"><div className="border-b border-border px-4 py-3"><div className="flex items-center justify-between"><div><div className="font-mono text-[9px] uppercase tracking-[.16em] text-primary">Filter reference</div><div className="mt-1 text-xs font-semibold">What gets removed</div></div><ShieldAlert className="size-4 text-destructive" /></div></div><div className="space-y-2.5 bg-muted/30 p-3"><div className="rounded-[11px] rounded-tl-[4px] border border-amber-200/80 bg-card p-3"><div className="flex items-center gap-2 text-[10px] font-semibold text-primary">Source update <span className="font-normal text-muted-foreground">/ public channel</span></div><p className="mt-2 text-[11px] font-semibold leading-relaxed">The useful report stays published</p><div className="mt-2 rounded-md border border-border bg-muted/50 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">Quoted promo box removed</div><div className="mt-2 flex items-center justify-between"><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-800"><Ban className="size-3" /> ad removed</span><span className="font-mono text-[9px] text-muted-foreground">cleanup rule</span></div></div><div className="flex items-center gap-2 px-1 text-[10px] leading-relaxed text-muted-foreground"><Check className="size-3.5 text-emerald-600" /> Standalone promos stay out; useful posts stay in.</div></div></Panel>;
}

function PostSkeleton() {
  return <div className="divide-y divide-border">{[1, 2, 3, 4].map((item) => <div className="flex gap-4 px-5 py-5" key={item}><SkeletonBlock className="size-8 shrink-0 rounded-full" /><div className="flex-1"><SkeletonBlock className="h-3 w-36" /><SkeletonBlock className="mt-3 h-4 w-4/5" /><SkeletonBlock className="mt-2 h-3 w-3/5" /></div></div>)}</div>;
}

function EmptyStream({ filter }: { filter: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center px-5 text-center"><div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Radio className="size-5" /></div><h3 className="mt-4 font-serif text-lg font-bold">No {filter === 'all' ? 'activity' : filter} posts yet</h3><p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Run a sync or enable another source to bring the desk to life.</p></div>;
}
