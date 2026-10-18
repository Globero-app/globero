import { Capacitor } from '@capacitor/core';
import type { StoryChoice, StoryWorkout } from './workout-story';
import { privateStory, STORY_PALETTES, type StoryPrivacy, type StoryStyle } from './workout-story';
import { storyLabels } from './story-labels';
import { localeCode, type Lang } from './i18n';

export async function renderStory(canvas: HTMLCanvasElement, originalWorkout: StoryWorkout, originalChoice: StoryChoice, lang: Lang, privacy: StoryPrivacy = { hideLocation: false, hideMetrics: false }, style: StoryStyle = 'oscuro') {
  const { workout, choice } = privateStory(originalWorkout, originalChoice, privacy);
  await document.fonts.ready;
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const css = getComputedStyle(document.documentElement);
  const palette = STORY_PALETTES[style] ?? STORY_PALETTES.oscuro;
  const color = (name: keyof typeof palette) => palette[name];
  const l = storyLabels(lang);
  ctx.fillStyle = color('background');
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = color('accent');
  ctx.fillRect(72, 72, 12, 64);
  const text = (value: string, x: number, y: number, size = 40, ink = 'foreground', bold = false) => {
    ctx.fillStyle = color(ink);
    ctx.font = `${bold ? 800 : 500} ${size}px ${css.getPropertyValue('--font-sans').trim()}`;
    ctx.fillText(value, x, y);
  };
  const lines = (value: string, y: number, size: number, max = 4) => {
    ctx.font = `800 ${size}px ${css.getPropertyValue('--font-sans').trim()}`;
    const words = value.split(/\s+/);
    let line = '', count = 0;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > 936 && line) {
        text(line, 72, y, size, 'foreground', true); y += size * 1.2; count++; line = word;
        if (count === max - 1) break;
      } else line = next;
    }
    while (ctx.measureText(line).width > 936 && line.length > 1) line = line.slice(0, -2) + '…';
    text(line, 72, y, size, 'foreground', true);
  };
  text('GLOBERO', 108, 126, 54, 'foreground', true);
  if (workout.completed_at && Number.isFinite(Date.parse(workout.completed_at))) text(new Date(workout.completed_at).toLocaleDateString(localeCode(lang), { day: 'numeric', month: 'long', year: 'numeric' }), 72, 218, 30, 'muted');
  text(l[choice.kind].toUpperCase(), 72, 350, 32, 'accent', true);
  lines(choice.badge?.label || workout.plan?.title || workout.plan?.name || l[choice.kind], 460, 64);
  const track = workout.gpsTrack ?? [];
  if (track.length > 1) {
    // Draw only the recorded geometry, without third-party tiles or location labels.
    const radians = Math.PI / 180;
    const origin = track[0];
    const projected = track.map(([lat, lon]) => [
      ((((lon - origin[1]) + 540) % 360) - 180) * Math.cos(origin[0] * radians),
      -(lat - origin[0]),
    ]);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of projected) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const scale = style === 'mapa'
      ? Math.min(920 / Math.max(maxX - minX, 0.000001), 720 / Math.max(maxY - minY, 0.000001))
      : Math.min(820 / Math.max(maxX - minX, 0.000001), 500 / Math.max(maxY - minY, 0.000001));
    const centerY = style === 'mapa' ? 1000 : 940;
    const xy = ([x, y]: number[]) => [540 + (x - (minX + maxX) / 2) * scale, centerY + (y - (minY + maxY) / 2) * scale];
    ctx.strokeStyle = color('accent'); ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    projected.forEach((point, i) => { const [x, y] = xy(point); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    const [x, y] = xy(projected[0]);
    ctx.fillStyle = color('foreground'); ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  } else {
  // An unframed, oversized medal is the visual mark of the actual achievement.
  ctx.strokeStyle = color('accent'); ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(540, 960, 208, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(540, 960, 229, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center';
  text(choice.kind === 'record' && !privacy.hideMetrics ? `${Math.round(choice.record?.watts ?? 0)}` : choice.kind !== 'workout' ? '★' : '✓', 540, 995, choice.kind === 'record' && !privacy.hideMetrics ? 112 : 160, 'foreground', true);
  text(choice.kind === 'record' && !privacy.hideMetrics ? `W · ${choice.record?.label ?? ''}` : l.done, 540, 1085, 28, 'accent', true);
  }
  ctx.textAlign = 'left';
  if (choice.kind === 'badge') lines(choice.badge?.detail ?? '', 1330, 36, 4);
  else if (choice.kind === 'record' && !privacy.hideMetrics) text(choice.record?.gain ? `+${Math.round(choice.record.gain)} W` : choice.record?.label ?? '', 72, 1380, 70, 'accent', true);
  else if (choice.kind === 'workout' && !privacy.hideMetrics) {
    const metrics = [
      { label: l.duration, value: workout.duration_minutes ? `${workout.duration_minutes} min` : '—' },
      { label: l.load, value: workout.actual_tss != null ? `${Math.round(workout.actual_tss)} TSS` : '—' },
      { label: l.compliance, value: workout.plan?.gamification?.compliance?.percent != null ? `${workout.plan.gamification.compliance.percent}%` : '—' },
    ];
    metrics.forEach((metric, i) => { text(metric.label, 72, 1300 + i * 122, 28, 'muted'); text(metric.value, 72, 1358 + i * 122, 52, 'foreground', true); });
  }
  ctx.fillStyle = color('accent'); ctx.fillRect(72, 1750, 936, 3);
  text('coach.globero.app', 72, 1828, 32, 'muted');
}

export function storyBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png'));
}

export async function exportStory(blob: Blob, filename: string, mode: 'share' | 'download', title: string): Promise<'shared' | 'downloaded' | 'native-saved'> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = reject;
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.split(',')[1]) : reject(new Error('Image unavailable'));
      reader.readAsDataURL(blob);
    });
    if (mode === 'download') {
      await Filesystem.writeFile({ path: `Globero/${filename}`, data, directory: Directory.Documents, recursive: true });
      return 'native-saved';
    }
    const file = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, files: [file.uri], dialogTitle: title });
    return 'shared';
  }
  const file = new File([blob], filename, { type: 'image/png' });
  if (mode === 'share' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title, files: [file] });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}