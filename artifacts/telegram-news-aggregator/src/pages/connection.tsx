import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, CheckCircle2, Clipboard, ExternalLink, KeyRound, Loader2, LockKeyhole, RefreshCw, Settings2, Shield, WifiOff } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { getGetConnectionQueryKey, getGetDashboardQueryKey, getListPostsQueryKey, useGetConnection, useRunSync } from '@workspace/api-client-react';
import { DataNotice, formatDate, Panel, SectionHeading, SkeletonBlock } from '@/components/relay-shell';

type LoginState =
  | 'missing_credentials'
  | 'needs_login'
  | 'code_required'
  | 'password_required'
  | 'connected'
  | 'error';

type MtprotoStatus = {
  ok: boolean;
  username: string | null;
  detail: string;
  loginState: LoginState;
  mode: 'mtproto_user';
};

async function mtprotoRequest(path: string, init?: RequestInit): Promise<MtprotoStatus> {
  const response = await fetch(`/api/mtproto/${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error('MTProto request failed');
  }
  return (await response.json()) as MtprotoStatus;
}

export default function ConnectionPage() {
  const queryClient = useQueryClient();
  const connection = useGetConnection();
  const sync = useRunSync();
  const mtproto = useQuery({
    queryKey: ['mtproto-status'],
    queryFn: () => mtprotoRequest('status'),
    refetchInterval: 4000,
  });
  const detail = connection.data;
  const reader = mtproto.data;
  const connected = reader?.loginState === 'connected' || detail?.status === 'connected';

  const refreshBridge = () => {
    void queryClient.invalidateQueries({ queryKey: getGetConnectionQueryKey() });
    void queryClient.invalidateQueries({ queryKey: ['mtproto-status'] });
  };

  const runSync = () => {
    sync.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetConnectionQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ['mtproto-status'] });
      },
    });
  };

  return (
    <div>
      <SectionHeading
        eyebrow="Infrastructure / telegram bridge"
        title="Connection"
        detail="The user account reads configured source channels over MTProto. The bot only publishes to @comnyews."
        action={
          <button
            type="button"
            onClick={runSync}
            disabled={sync.isPending || !connected}
            data-testid="button-sync-connection"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_6px_15px_hsl(var(--primary)/.16)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {sync.isPending ? 'Syncing…' : 'Run sync'}
          </button>
        }
      />
      {connection.isError ? (
        <DataNotice
          title="Connection status unavailable"
          detail="The bridge status could not be read. This does not change your configured settings."
          action={
            <button
              type="button"
              onClick={() => {
                void connection.refetch();
                void mtproto.refetch();
              }}
              data-testid="button-retry-connection"
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              Retry status
            </button>
          }
        />
      ) : connection.isLoading && mtproto.isLoading ? (
        <ConnectionSkeleton />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <StatusCard
              status={connected ? 'connected' : detail?.status}
              label={connected ? 'Reader connected' : detail?.label}
              detail={reader?.detail ?? detail?.detail}
              loginState={reader?.loginState}
            />
            <LoginPanel status={reader} onChanged={refreshBridge} />
            <Panel className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Bot className="size-5" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-bold tracking-[-.03em]">Publishing bot</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Destination publishing still uses the existing bot in @comnyews. Source channels are read by the user account.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <InfoCell label="Reader mode" value="MTProto user account" />
                <InfoCell
                  label="Publisher"
                  value={detail?.tokenConfigured || connected ? 'Bot configured for @comnyews' : 'Bot token not configured'}
                />
              </div>
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5 text-primary" /> API hash, phone number, bot token, and session data stay on the server.
              </div>
            </Panel>
          </div>
          <div className="space-y-6">
            <SetupGuide configured={connected} loginState={reader?.loginState} />
            <SyncResult
              accepted={sync.data?.accepted}
              message={sync.data?.message}
              queuedAt={sync.data?.queuedAt}
              pending={sync.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LoginPanel({ status, onChanged }: { status?: MtprotoStatus; onChanged: () => void }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'code' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loginState = status?.loginState ?? 'needs_login';
  const needsCredentials = loginState === 'missing_credentials';
  const loggedIn = loginState === 'connected';

  const requestCode = async () => {
    setBusy('code');
    setError(null);
    try {
      await mtprotoRequest('request-code', { method: 'POST' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a verification code.');
    } finally {
      setBusy(null);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('verify');
    setError(null);
    try {
      await mtprotoRequest('verify', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim() || undefined,
          password: password || undefined,
        }),
      });
      setCode('');
      setPassword('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="p-5 sm:p-6" data-testid="panel-mtproto-login">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h2 className="font-serif text-xl font-bold tracking-[-.03em]">User account login</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Request a Telegram verification code, then enter it here. The first code is usually inside the Telegram app, not a phone notification. Add the 2FA password only if Telegram asks for it.
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
        Reader state: <span className="font-semibold">{loginState.replace(/_/g, ' ')}</span>
      </div>
      {needsCredentials && (
        <p className="mt-4 text-sm text-muted-foreground">
          Add Telegram API credentials and a phone number on the server before requesting a code.
        </p>
      )}
      {loggedIn && (
        <p className="mt-4 text-sm text-emerald-800">The user account is authorized and listening for source posts.</p>
      )}
      {!loggedIn && !needsCredentials && (
        <form className="mt-5 space-y-4" onSubmit={verify}>
          <button
            type="button"
            onClick={() => void requestCode()}
            disabled={busy !== null}
            data-testid="button-request-code"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            {busy === 'code' ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
            Request verification code
          </button>
          <label className="block text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
            Verification code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              data-testid="input-login-code"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
            2FA password (optional)
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              data-testid="input-login-password"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground"
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null || (!code.trim() && !password)}
            data-testid="button-verify-login"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy === 'verify' ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
            Verify login
          </button>
        </form>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </Panel>
  );
}

function StatusCard({
  status,
  label,
  detail,
  loginState,
}: {
  status?: string;
  label?: string;
  detail?: string;
  loginState?: string;
}) {
  const isConnected = status === 'connected';
  const isError = status === 'error' || loginState === 'error';
  return (
    <Panel className={`overflow-hidden border-l-4 ${isConnected ? 'border-l-emerald-500' : isError ? 'border-l-destructive' : 'border-l-secondary'}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-11 items-center justify-center rounded-xl ${
                isConnected ? 'bg-emerald-100 text-emerald-700' : isError ? 'bg-red-100 text-destructive' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isConnected ? <CheckCircle2 className="size-5" /> : isError ? <WifiOff className="size-5" /> : <AlertTriangle className="size-5" />}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Bridge state</div>
              <h2 className="mt-1 font-serif text-2xl font-bold tracking-[-.04em]">{label ?? 'Status unknown'}</h2>
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              isConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {(loginState ?? status)?.replace(/_/g, ' ') ?? 'unknown'}
          </span>
        </div>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {detail ?? 'No detail returned from the Telegram bridge.'}
        </p>
      </div>
      <div className="border-t border-border bg-muted/35 px-5 py-3 text-[11px] text-muted-foreground">
        Sync controls are enabled only after the MTProto reader is connected.
      </div>
    </Panel>
  );
}

function SetupGuide({ configured, loginState }: { configured: boolean; loginState?: LoginState }) {
  const steps = [
    { label: 'Keep the bot as publisher in @comnyews', done: configured || loginState !== 'missing_credentials' },
    { label: 'Do not add the bot as admin on source channels', done: true },
    { label: 'Request a Telegram verification code', done: configured || loginState === 'code_required' || loginState === 'password_required' },
    { label: 'Complete user-account login', done: configured },
  ];
  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Settings2 className="size-[18px]" />
        </div>
        <div>
          <h2 className="font-serif text-lg font-bold">Setup checklist</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {configured ? 'The user reader is ready for source posts.' : 'Log in the Telegram user account that can already see the source channels.'}
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center gap-3">
            <span
              className={`flex size-6 items-center justify-center rounded-full border font-mono text-[10px] ${
                step.done ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {step.done ? <CheckCircle2 className="size-3.5" /> : index + 1}
            </span>
            <span className={`text-xs ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Telegram will send the login code to the configured phone number. Enter it in this page, not in chat.
      </p>
      <a
        href="https://my.telegram.org"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="button-open-telegram-apps"
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        Telegram API credentials <ExternalLink className="size-3" />
      </a>
    </Panel>
  );
}

function SyncResult({
  accepted,
  message,
  queuedAt,
  pending,
}: {
  accepted?: boolean;
  message?: string;
  queuedAt?: string;
  pending: boolean;
}) {
  if (!pending && !message) {
    return (
      <Panel className="border-dashed p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clipboard className="size-4 text-muted-foreground" /> Sync log
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Run a sync to confirm the MTProto reader is listening.
        </p>
      </Panel>
    );
  }
  return (
    <Panel className={`p-5 ${accepted ? 'border-emerald-300/70' : 'border-amber-300/70'}`} data-testid="card-sync-result">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {pending ? (
          <Loader2 className="size-4 animate-spin text-primary" />
        ) : accepted ? (
          <CheckCircle2 className="size-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="size-4 text-amber-600" />
        )}{' '}
        Sync response
      </div>
      <p className="mt-3 text-sm leading-relaxed">{pending ? 'Waiting for the relay service to accept this cycle…' : message}</p>
      {queuedAt && <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Queued {formatDate(queuedAt)}</p>}
    </Panel>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/35 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ConnectionSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Panel className="p-6">
          <SkeletonBlock className="h-10 w-2/3" />
          <SkeletonBlock className="mt-6 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-4/5" />
        </Panel>
        <Panel className="p-6">
          <SkeletonBlock className="h-7 w-40" />
          <SkeletonBlock className="mt-6 h-16 w-full" />
        </Panel>
      </div>
      <Panel className="p-6">
        <SkeletonBlock className="h-6 w-36" />
        <SkeletonBlock className="mt-5 h-28 w-full" />
      </Panel>
    </div>
  );
}
