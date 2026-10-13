const MASK_64 = (1n << 64n) - 1n;
const XORSHIFT64_STAR = 0x2545f4914f6cdd1dn;
const TWO_POW_53 = 2 ** 53;

export class XorShift64Star {
  private state: bigint;

  constructor(seed: number | bigint) {
    const normalized = BigInt(seed) & MASK_64;
    if (normalized === 0n) throw new RangeError("seed must be non-zero modulo 2^64");
    this.state = normalized;
  }

  nextU64(): bigint {
    let x = this.state;
    x ^= x >> 12n;
    x ^= (x << 25n) & MASK_64;
    x ^= x >> 27n;
    this.state = x & MASK_64;
    return (x * XORSHIFT64_STAR) & MASK_64;
  }

  uniform(): number {
    return Number(this.nextU64() >> 11n) / TWO_POW_53;
  }

  int(min: number, maxInclusive: number): number {
    if (maxInclusive < min) throw new RangeError("invalid integer range");
    return min + Math.floor(this.uniform() * (maxInclusive - min + 1));
  }
}
