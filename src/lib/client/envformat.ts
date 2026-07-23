/**
 * .env parsing for import (plannings/05 E4) and serialization for export
 * (Phase G). Pure functions — no crypto, no I/O. Runs client-side only.
 */

export interface EnvEntry {
  name: string;
  value: string;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parse .env text: KEY=value lines, #-comments, optional single/double quotes,
 *  \n escapes inside double quotes. Invalid lines are collected, not thrown. */
export function parseDotenv(text: string): { entries: EnvEntry[]; invalidLines: number[] } {
  const entries: EnvEntry[] = [];
  const invalidLines: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) {
      invalidLines.push(i + 1);
      continue;
    }
    let name = line.slice(0, eq).trim();
    if (name.startsWith("export ")) name = name.slice(7).trim();
    if (!NAME_RE.test(name)) {
      invalidLines.push(i + 1);
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      // unquoted: strip trailing comment
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    entries.push({ name, value });
  }
  return { entries, invalidLines };
}

/** Serialize to .env, quoting values that need it (Phase G export). */
export function serializeDotenv(entries: EnvEntry[]): string {
  return (
    entries
      .map(({ name, value }) => {
        if (/[\n\r"#'\s\\]/.test(value) || value === "") {
          const escaped = value
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t");
          return `${name}="${escaped}"`;
        }
        return `${name}=${value}`;
      })
      .join("\n") + "\n"
  );
}

export function serializeJson(entries: EnvEntry[]): string {
  const object: Record<string, string> = {};
  for (const { name, value } of entries) object[name] = value;
  return JSON.stringify(object, null, 2) + "\n";
}
