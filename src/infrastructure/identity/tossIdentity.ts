export type ExternalIdentity = {
  provider: 'toss_anonymous';
  key: string;
};

export async function getTossAnonymousIdentity(): Promise<ExternalIdentity | null> {
  try {
    const { User } = await import('@apps-in-toss/web-framework');
    if (!User.getAnonymousKey.isSupported()) return null;
    const response = await User.getAnonymousKey();
    if (response.type !== 'HASH' || !response.hash.trim()) return null;
    return { provider: 'toss_anonymous', key: response.hash };
  } catch {
    return null;
  }
}
