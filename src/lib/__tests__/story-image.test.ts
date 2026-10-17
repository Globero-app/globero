import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ active: false }));
const writeFile = vi.hoisted(() => vi.fn().mockResolvedValue({ uri: 'file:///cache/story.png' }));
const share = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.active } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile }, Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' } }));
vi.mock('@capacitor/share', () => ({ Share: { share } }));
import { exportStory } from '../story-image';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); native.active = false; writeFile.mockClear(); share.mockClear(); });
describe('story image delivery', () => {
  it('shares the actual PNG file through Web Share', async () => {
    const webShare = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share: webShare });
    await expect(exportStory(new Blob(['png'], { type: 'image/png' }), 'story.png', 'share', 'Workout')).resolves.toBe('shared');
    expect(webShare).toHaveBeenCalledWith({ title: 'Workout', files: [expect.objectContaining({ name: 'story.png', type: 'image/png', size: 3 })] });
  });
  it('downloads a PNG when browser file sharing is unavailable', async () => {
    vi.useFakeTimers();
    try {
      const click = vi.fn(), remove = vi.fn();
      const anchor = { click, remove, href: '', download: '', target: '', rel: '' };
      vi.stubGlobal('navigator', {});
      vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild: vi.fn() } });
      const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:story');
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const blob = new Blob(['png']);
      expect(await exportStory(blob, 'story.png', 'share', 'Workout')).toBe('downloaded');
      expect(create).toHaveBeenCalledWith(blob);
      expect(anchor.download).toBe('story.png');
      expect(click).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledOnce();
      vi.runAllTimers(); expect(revoke).toHaveBeenCalledWith('blob:story');
    } finally { vi.useRealTimers(); }
  });
  it('shares a cached image file on Capacitor, not an inaccessible blob URL', async () => {
    native.active = true;
    vi.stubGlobal('FileReader', class {
      result = 'data:image/png;base64,cG5n';
      onload?: () => void;
      readAsDataURL() { this.onload?.(); }
    });
    expect(await exportStory(new Blob(['png']), 'story.png', 'share', 'Workout')).toBe('shared');
    expect(writeFile).toHaveBeenCalledWith({ path: 'story.png', data: 'cG5n', directory: 'CACHE' });
    expect(share).toHaveBeenCalledWith({ title: 'Workout', files: ['file:///cache/story.png'], dialogTitle: 'Workout' });
  });
});