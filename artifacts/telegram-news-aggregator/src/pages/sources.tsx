import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Loader2, Plus, Radio, Search, Trash2, Users, X } from 'lucide-react';
import { getListSourcesQueryKey, useCreateSource, useDeleteSource, useListSources, useUpdateSource } from '@workspace/api-client-react';
import type { Source } from '@workspace/api-client-react';
import { DataNotice, formatDate, Panel, SectionHeading, SkeletonBlock, Toggle } from '@/components/relay-shell';

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const sources = useListSources(undefined, { query: { queryKey: getListSourcesQueryKey(), refetchOnWindowFocus: false } });
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [groupFilter, setGroupFilter] = useState('All groups');
  const sourceItems = sources.data ?? [];
  const groups = useMemo(() => ['All groups', ...Array.from(new Set(sourceItems.map((source) => source.group)))], [sourceItems]);
  const filtered = sourceItems.filter((source) => (groupFilter === 'All groups' || source.group === groupFilter) && `${source.name} ${source.handle} ${source.group}`.toLowerCase().includes(search.toLowerCase()));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createSource.mutate({ data: { handle: String(form.get('handle') ?? '').trim(), name: String(form.get('name') ?? '').trim(), group: String(form.get('group') ?? '').trim(), enabled: true } }, { onSuccess: () => { invalidate(); setShowForm(false); } });
  };

  const handleDelete = (source: Source) => {
    if (!window.confirm(`Remove ${source.name} from the relay?`)) return;
    deleteSource.mutate({ id: source.id }, { onSuccess: invalidate });
  };

  return <div>
    <SectionHeading eyebrow="Input / source registry" title="Sources" detail="Organize the public channels that feed your desk. Disabled sources stay configured but stop forwarding." action={<button type="button" onClick={() => setShowForm((value) => !value)} data-testid="button-add-source" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_6px_15px_hsl(var(--primary)/.16)] transition-transform hover:-translate-y-0.5"><Plus className="size-4" /> Add source</button>} />
    {showForm && <Panel className="relay-rise mb-6 p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-serif text-lg font-bold">Add a source</h2><p className="mt-1 text-xs text-muted-foreground">Use the public Telegram handle without the t.me URL.</p></div><button type="button" onClick={() => setShowForm(false)} data-testid="button-close-source-form" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div><form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"><Field label="Handle" name="handle" placeholder="@globalbrief" required /><Field label="Display name" name="name" placeholder="Global Brief" required /><Field label="Group" name="group" placeholder="World desk" required /><button type="submit" disabled={createSource.isPending} data-testid="button-submit-source" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-secondary px-4 text-sm font-bold text-secondary-foreground hover:brightness-95 disabled:opacity-60">{createSource.isPending && <Loader2 className="size-4 animate-spin" />} Add source</button></form>{createSource.isError && <p className="mt-3 text-xs text-destructive" data-testid="status-create-source-error">Could not add this source. Check the handle and try again.</p>}</Panel>}
    <div className="mb-5 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-search-sources" placeholder="Search sources or groups…" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15" /></div><div className="flex gap-2 overflow-auto">{groups.map((group) => <button type="button" key={group} onClick={() => setGroupFilter(group)} data-testid={`filter-group-${group.toLowerCase().replaceAll(' ', '-')}`} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${groupFilter === group ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}>{group}</button>)}</div></div>
    {sources.isError ? <DataNotice title="Sources unavailable" detail="The registry could not be reached. Try again before changing forwarding state." action={<button type="button" onClick={() => sources.refetch()} data-testid="button-retry-sources" className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">Retry registry</button>} /> : sources.isLoading ? <SourceSkeleton /> : filtered.length === 0 ? <DataNotice kind="empty" title={sourceItems.length === 0 ? 'Your source registry is empty' : 'No matching sources'} detail={sourceItems.length === 0 ? 'Add the first public channel to start assembling your signal desk.' : 'Try another search or group filter.'} action={sourceItems.length === 0 ? <button type="button" onClick={() => setShowForm(true)} data-testid="button-empty-add-source" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Add first source</button> : undefined} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((source, index) => <SourceCard key={source.id} source={source} index={index} onToggle={(enabled) => updateSource.mutate({ id: source.id, data: { enabled } }, { onSuccess: invalidate })} onDelete={() => handleDelete(source)} updating={updateSource.isPending && updateSource.variables?.id === source.id} deleting={deleteSource.isPending && deleteSource.variables?.id === source.id} />)}</div>}
  </div>;
}

function SourceCard({ source, index, onToggle, onDelete, updating, deleting }: { source: Source; index: number; onToggle: (enabled: boolean) => void; onDelete: () => void; updating: boolean; deleting: boolean }) {
  return <Panel className={`relay-rise relay-rise-${Math.min(index + 1, 4)} overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_hsl(var(--foreground)/.07)]`} data-testid={`card-source-${source.id}`}><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className={`flex size-10 items-center justify-center rounded-xl ${source.enabled ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}><Radio className="size-[18px]" /></div><div><h2 className="text-sm font-bold">{source.name}</h2><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{source.handle}</p></div></div><button type="button" onClick={onDelete} disabled={deleting} aria-label={`Remove ${source.name}`} data-testid={`button-delete-source-${source.id}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-destructive disabled:opacity-50">{deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button></div><div className="mt-5 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"><FolderOpen className="size-3" /> {source.group}</span><span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"><Users className="size-3" /> {source.postsToday} today</span></div><div className="mt-5 flex items-end justify-between border-t border-border pt-4"><div><p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">Last seen</p><p className="mt-1 text-xs font-medium">{formatDate(source.lastSeen)}</p></div><div className="flex items-center gap-2"><span className={`text-[11px] font-semibold ${source.enabled ? 'text-emerald-700' : 'text-muted-foreground'}`}>{updating ? 'Saving…' : source.enabled ? 'Forwarding' : 'Paused'}</span><Toggle checked={source.enabled} onChange={onToggle} label={`Toggle forwarding for ${source.name}`} testId={`toggle-source-${source.id}`} /></div></div></Panel>;
}

function Field({ label, name, placeholder, required }: { label: string; name: string; placeholder: string; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</span><input name={name} placeholder={placeholder} required={required} data-testid={`input-source-${name}`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>;
}

function SourceSkeleton() {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Panel key={item} className="p-5"><div className="flex gap-3"><SkeletonBlock className="size-10 rounded-xl" /><div><SkeletonBlock className="h-4 w-28" /><SkeletonBlock className="mt-2 h-3 w-20" /></div></div><SkeletonBlock className="mt-6 h-5 w-36" /><SkeletonBlock className="mt-6 h-10 w-full" /></Panel>)}</div>;
}
