import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { intervalsActivityDetail } from '@/lib/intervals.functions';
import { useAuth } from '@/lib/use-auth';
import { Download, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { storyChoices, storyTrack, STORY_STYLES, type StoryStyle, type StoryWorkout } from '@/lib/workout-story';
import { storyLabels } from '@/lib/story-labels';
import { exportStory, renderStory, storyBlob } from '@/lib/story-image';

export function WorkoutStoryShare({ workout }: { workout: StoryWorkout }) {
  const { lang } = useI18n();
  const l = storyLabels(lang);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('workout');
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState<StoryStyle>('oscuro');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [privacy, setPrivacy] = useState({ hideMap: true, hideLocation: false, hideMetrics: false });
  const changePrivacy = (key: keyof typeof privacy, checked: boolean) => {
    image.current = null; setReady(false);
    setPrivacy(previous => ({ ...previous, [key]: checked }));
  };
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<Blob | null>(null);
  const { user } = useAuth();
  const fetchDetail = useServerFn(intervalsActivityDetail);
  const activityId = workout.plan?.strava_activity_id ?? workout.plan?.intervals_activity_id;
  const gps = useQuery({
    queryKey: ['story-gps', user?.id, activityId],
    queryFn: async () => {
      if (activityId == null) return { track: [], metrics: undefined };
      const detail = await fetchDetail({ data: { id: activityId } });
      const a: any = detail.activity ?? {};
      const distance = detail.streams.distance?.data ?? [];
      const time = detail.streams.time?.data ?? [];
      const rawDistance = a.distance_km ?? a.distance;
      const metrics = {
        durationMinutes: a.moving_time ? Math.round(a.moving_time / 60) : time.length ? Math.round(time[time.length - 1] / 60) : undefined,
        distanceKm: rawDistance != null ? (rawDistance > 1000 ? rawDistance / 1000 : rawDistance) : distance.length ? distance[distance.length - 1] / 1000 : undefined,
      };
      return { track: storyTrack(detail.streams.latlng?.data), metrics };
    },
    enabled: open && !!user && activityId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const track = gps.data?.track;
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
        await renderStory(element, { ...workout, gpsTrack: track, actual: gps.data?.metrics }, choice, lang, privacy, style);
        const blob = await storyBlob(element);
        if (!cancelled) { image.current = blob; setReady(true); }
      } catch { if (!cancelled) setError(true); }
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [open, selected, workout, lang, privacy, track, style]);

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
        <select aria-label={l.style} disabled={busy} className="w-full rounded-md border bg-surface p-2 text-sm" value={style} onChange={e => { image.current = null; setReady(false); setStyle(e.target.value as StoryStyle); }}>
          {STORY_STYLES.map(s => <option key={s} value={s}>{l[`style${s[0].toUpperCase()}${s.slice(1)}` as keyof typeof l]}</option>)}
        </select>
        <fieldset disabled={busy} className="space-y-2 text-sm">
          <legend className="mb-2 font-semibold">{l.privacy}</legend>
          {track && track.length > 1 && <label className="flex items-center gap-2"><Checkbox checked={privacy.hideMap || privacy.hideLocation} disabled={privacy.hideLocation} onCheckedChange={value => changePrivacy('hideMap', value === true)} />{l.mapExcluded}</label>}
          {gps.isFetching && <p role="status" className="text-muted-foreground">{l.preparing}</p>}
          {gps.isError && <p role="alert" className="text-destructive">{l.error}</p>}
          <label className="flex items-center gap-2"><Checkbox checked={privacy.hideLocation} onCheckedChange={value => changePrivacy('hideLocation', value === true)} />{l.hideLocation}</label>
          <label className="flex items-center gap-2"><Checkbox checked={privacy.hideMetrics} onCheckedChange={value => changePrivacy('hideMetrics', value === true)} />{l.hideMetrics}</label>
        </fieldset>
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