// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveBase64 } = vi.hoisted(() => ({
  saveBase64: Object.assign(vi.fn(), { isSupported: vi.fn() }),
}));

vi.mock('@apps-in-toss/web-framework', () => ({ File: { saveBase64 } }));

import { encodeUtf8Base64, saveBackupText } from './exportBackup';

describe('backup file export', () => {
  beforeEach(() => vi.clearAllMocks());

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
});
