// Seed rewatch counts onto the read-only demo account's existing watch history,
// so the "watched more than once" feature is visible on the demo (×2 / ×3 check
// badges + inflated episode/time stats) without needing a writable demo.
//
// The demo stays read-only in the app — this only touches the DB directly, the
// same way the demo library itself is seeded (sign in as the demo once, import a
// sample export). Run it AFTER the demo has some watched episodes.
//
//   node scripts/seed-demo-rewatches.mjs --local                 # local D1
//   node scripts/seed-demo-rewatches.mjs --remote --email=demo@demo.com
//
// Local reads DEMO_EMAIL from .dev.vars when --email is omitted. Remote needs
// --email explicitly (the email is a Cloudflare secret the script can't read).
// It sets absolute play counts, so it's idempotent — re-running gives the same
// result.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const emailArg = args.find((a) => a.startsWith("--email="))?.split("=")[1];

function demoEmailFromDevVars() {
  try {
    const txt = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    const line = txt
      .split("\n")
      .find((l) => l.trim().startsWith("DEMO_EMAIL="));
    return line?.split("=").slice(1).join("=").trim() || null;
  } catch {
    return null;
  }
}

const email = emailArg || (remote ? null : demoEmailFromDevVars());
if (!email) {
  console.error(
    remote
      ? "Pass the demo address: --email=demo@demo.com"
      : "No DEMO_EMAIL in .dev.vars — pass --email=demo@demo.com",
  );
  process.exit(1);
}

// A deterministic spread of rewatches over the demo's watched episodes: roughly
// one in three becomes a 2nd or 3rd watch, the rest stay single plays.
const sql = `
UPDATE watched_episodes
SET plays = CASE ((season * 53 + episode) % 7)
  WHEN 0 THEN 3
  WHEN 3 THEN 2
  WHEN 5 THEN 2
  ELSE 1
END
WHERE user_id = (SELECT id FROM users WHERE email = '${email.replace(/'/g, "''")}')
  AND watched = 1 AND season > 0;
`.trim();

const wranglerArgs = [
  "wrangler",
  "d1",
  "execute",
  "rip_tv_time",
  remote ? "--remote" : "--local",
  "--command",
  sql,
];

console.log(
  `Seeding demo rewatches (${remote ? "remote" : "local"}) for ${email}…`,
);
execFileSync("npx", wranglerArgs, { stdio: "inherit" });
console.log(
  "Done. The demo now shows ×2/×3 rewatch badges and inflated stats.",
);
