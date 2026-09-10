import { describe, expect, it } from 'vitest';

import { validateNickname } from './nicknameSession';

describe('validateNickname', () => {
  it('accepts a trimmed nickname between 2 and 20 characters', () => {
    expect(validateNickname(' 데일리 ')).toBeNull();
  });

  it('rejects a nickname outside the length boundary', () => {
    expect(validateNickname('a')).toContain('2자 이상');
    expect(validateNickname('123456789012345678901')).toContain('20자 이하');
  });

  it('rejects whitespace inside a nickname', () => {
    expect(validateNickname('daily todo')).toContain('공백');
  });
});
