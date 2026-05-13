export type TrustLevel = 'trusted' | 'partially_trusted' | 'untrusted' | 'quarantined';

export const TRUST_ORDER: Record<TrustLevel, number> = {
  quarantined: 0,
  untrusted: 1,
  partially_trusted: 2,
  trusted: 3,
};

export function gte(a: TrustLevel, b: TrustLevel): boolean {
  return TRUST_ORDER[a] >= TRUST_ORDER[b];
}
