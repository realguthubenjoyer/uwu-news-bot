import { ArrowLeft, Radio } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100dvh-68px)] items-center justify-center">
      <div className="max-w-md px-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary"><Radio className="size-6" /></div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[.18em] text-primary">Signal lost</p>
        <h1 className="mt-2 font-serif text-4xl font-bold tracking-[-.05em]">That desk does not exist.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">The route you followed is not part of this relay workspace.</p>
        <Link href="/" data-testid="link-not-found-home" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><ArrowLeft className="size-4" /> Back to control room</Link>
      </div>
    </div>
  );
}
