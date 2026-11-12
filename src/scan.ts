import { readFileSync } from "node:fs";
import { relative } from "node:path";
import fg from "fast-glob";
import type { CatalogModel, ScanHit } from "./types";

/** Characters that may sit inside a model id token. */
const ID_CHAR = /[A-Za-z0-9._:/-]/;

/**
 * True when `key` at `index` is bounded by non-id characters (or string edges), so we do not match
 * `gpt-4` inside `gpt-4o-mini` or `claude` inside `anthropic-claude-helper`.
 */
export function isBoundedMatch(content: string, index: number, length: number): boolean {
  const before = index === 0 ? "" : content[index - 1]!;
  const after = index + length >= content.length ? "" : content[index + length]!;
  const leftOk = !before || !ID_CHAR.test(before);
  const rightOk = !after || !ID_CHAR.test(after);
  return leftOk && rightOk;
}

/** 1-based line and column for a byte offset in a string. */
export function positionAt(content: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

/**
 * Find every catalog key that appears as a bounded token in `content`. Keys are tried longest-first
 * so `gpt-4o-mini` wins over `gpt-4o` and `gpt-4`.
 */
export function scanContent(
  content: string,
  file: string,
  index: Map<string, CatalogModel>,
): ScanHit[] {
  const keys = [...index.keys()].sort((a, b) => b.length - a.length);
  const hits: ScanHit[] = [];
  // Track covered ranges so a longer match suppresses overlapping shorter ones on the same span.
  const covered: Array<{ start: number; end: number }> = [];

  const overlaps = (start: number, end: number): boolean =>
    covered.some((span) => start < span.end && end > span.start);

  for (const key of keys) {
    if (key.length < 3) continue; // Avoid pathological short tokens (e.g. "ha", "v1").
    let from = 0;
    while (from <= content.length - key.length) {
      const idx = content.indexOf(key, from);
      if (idx < 0) break;
      const end = idx + key.length;
      if (isBoundedMatch(content, idx, key.length) && !overlaps(idx, end)) {
        const model = index.get(key);
        if (model) {
          const { line, column } = positionAt(content, idx);
          hits.push({ matchedText: key, model, file, line, column });
          covered.push({ start: idx, end });
        }
      }
      from = idx + 1;
    }
  }

  return hits;
}

export interface ScanOptions {
  workspace: string;
  paths: string[];
  exclude: string[];
  index: Map<string, CatalogModel>;
}

/**
 * Walk the workspace with the configured globs and return every model-id hit. Binary-ish files and
 * oversized blobs are skipped so a accidental `** /*` does not melt the runner.
 */
export async function scanWorkspace(options: ScanOptions): Promise<ScanHit[]> {
  const patterns = options.paths.length > 0 ? options.paths : ["**/*"];
  const files = await fg(patterns, {
    cwd: options.workspace,
    absolute: true,
    onlyFiles: true,
    dot: true,
    ignore: options.exclude,
    followSymbolicLinks: false,
  });

  const hits: ScanHit[] = [];
  const maxBytes = 1_500_000;

  for (const abs of files) {
    let content: string;
    try {
      const buf = readFileSync(abs);
      if (buf.byteLength > maxBytes) continue;
      // Skip likely-binary files (NUL in the first 8 KiB).
      const sample = buf.subarray(0, Math.min(buf.byteLength, 8192));
      if (sample.includes(0)) continue;
      content = buf.toString("utf8");
    } catch {
      continue;
    }

    const rel = relative(options.workspace, abs).replace(/\\/g, "/");
    hits.push(...scanContent(content, rel, options.index));
  }

  return hits;
}
