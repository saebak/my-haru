// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveBase64 } = vi.hoisted(() => ({
  saveBase64: Object.assign(vi.fn(), { isSupported: vi.fn() }),
}));

vi.mock('@apps-in-toss/web-framework', () => ({ File: { saveBase64 } }));

import { encodeUtf8Base64, saveBackupText } from './exportBackup';

describe('backup file export', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('encodes Korean JSON as UTF-8 Base64', () => {
    const text = '{"title":"할 일 ✅"}';
    expect(new TextDecoder().decode(Uint8Array.from(atob(encodeUtf8Base64(text)), (character) => character.charCodeAt(0)))).toBe(text);
  });

  it('uses the Apps in Toss native file saver when supported', async () => {
    saveBase64.isSupported.mockReturnValue(true);
    await saveBackupText('{"ok":true}', 'backup.json');
    expect(saveBase64).toHaveBeenCalledWith({
      data: encodeUtf8Base64('{"ok":true}'),
      fileName: 'backup.json',
      mimeType: 'application/json',
    });
  });

  it('falls back to a browser download when the SDK support check is unavailable', async () => {
    saveBase64.isSupported.mockImplementation(() => { throw new Error('No Apps in Toss environment'); });
    const createObjectURL = vi.fn().mockReturnValue('blob:backup');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await saveBackupText('{"ok":true}', 'backup.json');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
  });
});
