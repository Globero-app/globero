import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { storyChoices, type StoryWorkout } from '@/lib/workout-story';
import { storyLabels } from '@/lib/story-labels';
import { exportStory, renderStory, storyBlob } from '@/lib/story-image';

export function WorkoutStoryShare({ workout }: { workout: StoryWorkout }) {
  const { lang } = useI18n();
  const l = storyLabels(lang);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('workout');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<Blob | null>(null);
  const choices = storyChoices(workout);
  const choice = choices.find(c => c.id === selected) ?? choices[0];

  useEffect(() => {
    if (!open || !choice) return;
    let cancelled = false;
    setReady(false); setError(false); image.current = null;
    // Wait until the dialog portal has mounted its canvas.
    const frame = requestAnimationFrame(async () => {
      const element = canvas.current;
      if (!element) return;
      try {
        await renderStory(element, workout, choice, lang);
        const blob = await storyBlob(element);
        if (!cancelled) { image.current = blob; setReady(true); }
      } catch { if (!cancelled) setError(true); }
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [open, selected, workout, lang]);

  if (!choice) return null;
  const send = async (mode: 'share' | 'download') => {
    const blob = image.current;
    if (!blob || busy) return;
    setBusy(true); setError(false);
    try {
      const filename = `globero-${workout.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36)}-${choice.id}.png`;
      const result = await exportStory(blob, filename, mode, l[choice.kind]);
      if (result !== 'shared') toast.success(result === 'native-saved' ? l.savedNative : l.saved);
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) { setError(true); toast.error(l.error); }
    } finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="ghost" size="icon" title={l.share} aria-label={l.share} onClick={() => setOpen(true)}><Share2 /></Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-md max-h-[95dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>{l.title}</DialogTitle><DialogDescription>{workout.plan?.title ?? workout.plan?.name ?? l.workout}</DialogDescription></DialogHeader>
        <select aria-label={l.share} disabled={busy} className="w-full rounded-md border bg-surface p-2 text-sm" value={choice.id} onChange={e => setSelected(e.target.value)}>
          {choices.map(c => <option key={c.id} value={c.id}>{l[c.kind]}{c.record ? ` · ${c.record.label} · ${c.record.watts} W` : c.badge ? ` · ${c.badge.label}` : ''}</option>)}
        </select>
        <canvas ref={canvas} width={1080} height={1920} role="img" aria-label={l[choice.kind]} className="mx-auto block aspect-[9/16] w-full max-w-[270px]" />
        {!ready && !error && <p role="status" className="text-center text-sm text-muted-foreground">{l.preparing}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{l.error}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" disabled={!ready || busy} onClick={() => void send('download')}><Download />{l.download}</Button>
          <Button type="button" disabled={!ready || busy} onClick={() => void send('share')}>{busy ? <Loader2 className="animate-spin" /> : <Share2 />}{l.send}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}