import { unzipSync, strFromU8 } from "fflate";
import { parseExport, type FileMap } from "../../shared/parse";
import type { ParsedImport } from "../../shared/types";

// Files we care about from either export zip. Everything else is ignored.
const WANTED = new Set([
  // tv-time-export.zip
  "shows.json", "movies.json", "favorites.json", "lists.json",
  // gdpr-data.zip
  "tracking-prod-records-v2.csv", "tracking-prod-records.csv",
  "user_personal_data.csv", "user_show_special_status.csv", "user.csv", "user_tv_show_data.csv",
]);

/** Decompress one or more uploaded export zips and parse them into a normalized import. */
export function parseZips(buffers: Uint8Array[]): ParsedImport {
  const files: FileMap = {};
  for (const buf of buffers) {
    const entries = unzipSync(buf);
    for (const [path, data] of Object.entries(entries)) {
      const base = path.split("/").pop() ?? path;
      if (WANTED.has(base) && !files[base]) files[base] = strFromU8(data);
    }
  }
  return parseExport(files);
}
