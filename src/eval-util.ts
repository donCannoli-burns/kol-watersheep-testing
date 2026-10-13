import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function n(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function round(value: number, digits = 4): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendJsonl(path: string, value: unknown): void {
  appendFileSync(path, JSON.stringify(value) + "\n", "utf8");
}

export function ensureMutableRun(root: string, manifestName = "manifest.json"): {
  root: string;
  manifestPath: string;
  checkpointPath: string;
  resultsPath: string;
  failuresPath: string;
} {
  const resolved = resolve(root);
  mkdirSync(resolved, { recursive: true });
  const manifestPath = resolve(resolved, manifestName);
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.status === "COMPLETE") {
      throw new Error(`run is already COMPLETE at ${resolved}; use a new run ID rather than overwriting it`);
    }
  }
  return {
    root: resolved,
    manifestPath,
    checkpointPath: resolve(resolved, "checkpoint.json"),
    resultsPath: resolve(resolved, "results.jsonl"),
    failuresPath: resolve(resolved, "failures.jsonl"),
  };
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function numericProbabilityMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
      .map(([k, v]) => [k, Number(v)]),
  );
}

export function totalVariation(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const key of keys) sum += Math.abs((a[key] || 0) - (b[key] || 0));
  return 0.5 * sum;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`).join(",")}}`;
}

export function maxNumericDiff(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b);
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    let max = 0;
    for (let i = 0; i < len; i++) max = Math.max(max, maxNumericDiff(a[i], b[i]));
    return max;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    let max = 0;
    for (const key of keys) max = Math.max(max, maxNumericDiff(ao[key], bo[key]));
    return max;
  }
  return 0;
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
