import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Languages, Loader2, Megaphone, Paperclip, Plus, ShieldCheck, Tag, Trash2 } from 'lucide-react';
import { getGetRulesQueryKey, useGetRules, useUpdateRules } from '@workspace/api-client-react';
import { DataNotice, Panel, SectionHeading, SkeletonBlock, Toggle } from '@/components/relay-shell';

type RuleState = { translate: boolean; preserveMedia: boolean; addSourceLabel: boolean; blockAds: boolean; blockedKeywords: string[]; deliveryChannel: string };

const defaults: RuleState = { translate: true, preserveMedia: true, addSourceLabel: true, blockAds: true, blockedKeywords: [], deliveryChannel: '' };

export default function RulesPage() {
  const queryClient = useQueryClient();
  const rules = useGetRules();
  const updateRules = useUpdateRules();
  const [draft, setDraft] = useState<RuleState>(defaults);
  const [keyword, setKeyword] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (rules.data) setDraft({ ...rules.data, blockedKeywords: rules.data.blockedKeywords ?? [] });
  }, [rules.data]);

  const setFlag = (key: keyof Pick<RuleState, 'translate' | 'preserveMedia' | 'addSourceLabel' | 'blockAds'>) => (value: boolean) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const addKeyword = () => {
    const next = keyword.trim().toLowerCase();
    if (!next || draft.blockedKeywords.includes(next)) return;
    setDraft((current) => ({ ...current, blockedKeywords: [...current.blockedKeywords, next] }));
    setKeyword('');
    setSaved(false);
  };
  const save = () => {
    updateRules.mutate({ data: draft }, { onSuccess: (data) => { setDraft({ ...data, blockedKeywords: data.blockedKeywords ?? [] }); setSaved(true); queryClient.invalidateQueries({ queryKey: getGetRulesQueryKey() }); setTimeout(() => setSaved(false), 2800); } });
  };

  return <div>
    <SectionHeading eyebrow="Moderation / relay policy" title="Rules" detail="Tune what gets translated, preserved, labeled, and cleaned before it reaches the destination." action={<button type="button" onClick={save} disabled={updateRules.isPending || rules.isLoading} data-testid="button-save-rules" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_6px_15px_hsl(var(--primary)/.16)] transition-all hover:-translate-y-0.5 disabled:opacity-60">{updateRules.isPending ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}{updateRules.isPending ? 'Saving…' : saved ? 'Rules saved' : 'Save changes'}</button>} />
    {rules.isError ? <DataNotice title="Rules unavailable" detail="We could not load the current relay policy. No changes have been sent." action={<button type="button" onClick={() => rules.refetch()} data-testid="button-retry-rules" className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">Retry rules</button>} /> : rules.isLoading ? <RulesSkeleton /> : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Panel className="overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="font-serif text-xl font-bold tracking-[-.03em]">Relay behavior</h2><p className="mt-1 text-xs text-muted-foreground">The decisions applied to every incoming post.</p></div><div className="divide-y divide-border">
          <RuleRow icon={Languages} title="Translate incoming posts" detail="Convert source copy to the destination language before publishing." checked={draft.translate} onChange={setFlag('translate')} testId="toggle-translate" />
          <RuleRow icon={Paperclip} title="Preserve attached media" detail="Carry images and video through with the relayed post." checked={draft.preserveMedia} onChange={setFlag('preserveMedia')} testId="toggle-preserve-media" />
          <RuleRow icon={Tag} title="Add source label" detail="Keep a visible source attribution at the top of each outgoing post." checked={draft.addSourceLabel} onChange={setFlag('addSourceLabel')} testId="toggle-source-label" />
          <RuleRow icon={Megaphone} title="Remove ads from posts" detail="Drop standalone ad posts, but keep news posts and remove promotional quote boxes underneath them." checked={draft.blockAds} onChange={setFlag('blockAds')} testId="toggle-block-ads" />
        </div></Panel>
        <Panel className="p-5"><div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><ShieldCheck className="size-[18px]" /></div><div><h2 className="text-sm font-bold">Ad keywords</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">A fast second pass for promotional blocks to remove from otherwise useful posts.</p></div></div><div className="mt-5 flex gap-2"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addKeyword(); } }} data-testid="input-blocked-keyword" placeholder="e.g. casino, giveaway" className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><button type="button" onClick={addKeyword} data-testid="button-add-keyword" className="inline-flex h-10 items-center gap-1.5 rounded-md bg-secondary px-3 text-xs font-bold text-secondary-foreground"><Plus className="size-3.5" /> Add</button></div><div className="mt-4 flex flex-wrap gap-2">{draft.blockedKeywords.length ? draft.blockedKeywords.map((item) => <span key={item} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium">{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => { setDraft((current) => ({ ...current, blockedKeywords: current.blockedKeywords.filter((entry) => entry !== item) })); setSaved(false); }} data-testid={`button-remove-keyword-${item}`} className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-card hover:text-destructive"><Trash2 className="size-3" /></button></span>) : <span className="text-xs text-muted-foreground">No custom keywords added yet.</span>}</div></Panel>
      </div>
      <div className="space-y-6">
        <Panel className="p-5"><div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"><ExternalLink className="size-[18px]" /></div><div><h2 className="text-sm font-bold">Destination channel</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">One destination keeps the newsroom focused.</p></div></div><label className="mt-5 block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Telegram handle</span><input value={draft.deliveryChannel} onChange={(event) => { setDraft((current) => ({ ...current, deliveryChannel: event.target.value })); setSaved(false); }} data-testid="input-delivery-channel" placeholder="@signal-destination" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">The bot must be an administrator in this channel to publish.</p></Panel>
        <PolicyPreview draft={draft} />
      </div>
    </div>}
    {updateRules.isError && <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive" data-testid="status-rules-error">Rules were not saved. Your edits are still here so you can retry.</div>}
  </div>;
}

function RuleRow({ icon: Icon, title, detail, checked, onChange, testId }: { icon: typeof Languages; title: string; detail: string; checked: boolean; onChange: (value: boolean) => void; testId: string }) {
  return <div className="flex items-center gap-4 px-5 py-4"><div className={`hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex ${checked ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p></div><Toggle checked={checked} onChange={onChange} label={title} testId={testId} /></div>;
}

function PolicyPreview({ draft }: { draft: RuleState }) {
  return <Panel className="overflow-hidden"><div className="border-b border-border px-5 py-4"><div className="font-mono text-[10px] uppercase tracking-[.15em] text-primary">Policy preview</div><h2 className="mt-1 font-serif text-lg font-bold">A post, before it leaves</h2></div><div className="bg-[#f5f7f3] p-4 dark:bg-muted/40"><div className="rounded-[13px] rounded-tl-[4px] bg-card p-3 shadow-sm"><div className="flex items-center gap-2 text-[10px] font-semibold text-primary">{draft.addSourceLabel ? 'Source label · public channel' : 'Source label hidden'}</div><div className="mt-3 rounded-md border border-border bg-background p-3"><div className="h-2.5 w-4/5 rounded bg-muted" /><div className="mt-2 h-2.5 w-full rounded bg-muted" /><div className="mt-2 h-2.5 w-3/5 rounded bg-muted" /></div><div className="mt-3 flex flex-wrap gap-1.5">{draft.translate && <span className="rounded-full bg-accent px-2 py-1 text-[9px] text-accent-foreground">translated</span>}{draft.preserveMedia && <span className="rounded-full bg-accent px-2 py-1 text-[9px] text-accent-foreground">media preserved</span>}{draft.blockAds && <span className="rounded-full bg-secondary/35 px-2 py-1 text-[9px] text-secondary-foreground">ad filter on</span>}</div></div></div><div className="px-5 py-4 text-xs leading-relaxed text-muted-foreground">Destination: <span className="font-semibold text-foreground">{draft.deliveryChannel || 'not configured'}</span></div></Panel>;
}

function RulesSkeleton() {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><Panel className="p-5"><SkeletonBlock className="h-6 w-40" /><SkeletonBlock className="mt-3 h-3 w-64" /><div className="mt-7 space-y-8">{[1, 2, 3, 4].map((item) => <div className="flex justify-between" key={item}><div><SkeletonBlock className="h-4 w-52" /><SkeletonBlock className="mt-2 h-3 w-72" /></div><SkeletonBlock className="h-6 w-11 rounded-full" /></div>)}</div></Panel><Panel className="p-5"><SkeletonBlock className="h-6 w-36" /><SkeletonBlock className="mt-6 h-10 w-full" /></Panel></div>;
}
