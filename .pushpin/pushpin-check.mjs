#!/usr/bin/env node
/**
 * Project-local stand-in for the plugin's hooks. Copied into a project as
 * `.pushpin/pushpin-check.mjs` by `init.mjs`, and named in both hook manifests
 * instead of the plugin's own path.
 *
 * It stands in for three of them: the edit check by default, the write guard
 * when called with `--guard`, and the browser preview when called with
 * `--preview`.
 *
 * The plugin lives in a directory named after its version — a commit hash under
 * Cursor, a semver under Claude Code — and Cursor keeps exactly one, deleting
 * the old one when it updates itself. A hook manifest that names that directory
 * therefore stops resolving on the next update, and because hooks fail open, the
 * check silently stops running. This file is the indirection that fixes it: the
 * manifests name something inside the project, which does not move, and the
 * plugin is located at run time.
 *
 * Contract, inherited from the hook it delegates to: **never break a turn.**
 * Every failure path exits 0 with no output. It parses no events and makes no
 * decisions — stdin goes to the real hook, its stdout comes back verbatim.
 *
 * Generated. Re-run `init` rather than editing it.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const HERE = dirname(SELF);

// Three hooks reach the plugin through this one file: the edit check, the write
// guard that runs before a write lands, and the preview that keeps the browser
// reachable. One shim rather than three because the manifests recognize our
// hooks by this filename, and a project has one thing to keep current.
const argv = process.argv.slice(2);
const DELEGATE = argv.includes('--guard')
  ? 'pushpin-guard.mjs'
  : argv.includes('--preview')
    ? 'pushpin-preview.mjs'
    : 'pushpin-check.mjs';
const HOOK_REL = join('scripts', 'hooks', DELEGATE);

/** Exit quietly. The only exit this script has. */
const done = (payload) => {
  if (payload) process.stdout.write(payload);
  process.exit(0);
};

const subdirs = (p) => {
  try {
    return readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
};

/**
 * Where a skill sits inside an installed plugin. `pushpin/` is the current
 * layout; `skills/pushpin/` is the conventional one this may move to, and `.`
 * covers a flattened plugin. Listing all three means a layout change does not
 * strand an already-installed shim.
 */
const SKILL_RELS = ['pushpin', join('skills', 'pushpin'), '.'];

function hookUnder(skillDir) {
  const p = join(skillDir, HOOK_REL);
  return existsSync(p) ? p : null;
}

/**
 * Every hook this machine can offer, from both hosts' plugin caches. The layout
 * is <cache>/<marketplace>/<plugin>/<version>/<skill>/scripts/hooks/, and both
 * the marketplace and version segments are unpredictable, so they get walked
 * rather than guessed.
 */
function fromCaches() {
  const found = [];
  const roots = [
    join(homedir(), '.cursor', 'plugins', 'cache'),
    join(homedir(), '.claude', 'plugins', 'cache'),
  ];
  for (const root of roots) {
    for (const marketplace of subdirs(root)) {
      const pluginDir = join(root, marketplace, 'pushpin');
      for (const version of subdirs(pluginDir)) {
        for (const rel of SKILL_RELS) {
          const hit = hookUnder(join(pluginDir, version, rel));
          if (hit) found.push(hit);
        }
      }
    }
  }
  return found;
}

const mtime = (p) => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

/** The recorded install, which is authoritative while it still exists. */
function fromConfig() {
  try {
    const cfg = JSON.parse(readFileSync(resolve(HERE, '..', 'pushpin.config.json'), 'utf8'));
    return cfg.pluginPath ? hookUnder(cfg.pluginPath) : null;
  } catch {
    return null;
  }
}

function resolveHook() {
  const explicit = process.env.PUSHPIN_SKILL_DIR && hookUnder(process.env.PUSHPIN_SKILL_DIR);
  if (explicit) return explicit;

  const recorded = fromConfig();
  if (recorded) return recorded;

  // Newest wins. Both hosts name the directory after a version, but only one of
  // the two schemes sorts, so mtime is the signal they have in common.
  const [newest] = fromCaches()
    .filter((p) => resolve(p) !== SELF)
    .sort((a, b) => mtime(b) - mtime(a));
  return newest ?? null;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const hook = resolveHook();
  if (!hook) done();

  const input = await readStdin();

  let out = '';
  try {
    out = execFileSync(process.execPath, [hook], {
      input,
      encoding: 'utf8',
      // This file always sits in <project>/.pushpin/, so the directory above it
      // is the project — which is what a delegate falls back to when the event
      // does not name one, as it does not when the shim is run by hand.
      cwd: resolve(HERE, '..'),
      // Under the harness timeout of 15s, and above the 10s the hook allows
      // check.mjs, so a slow check is reported rather than killed here.
      timeout: 12_000,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch (err) {
    out = err?.stdout ?? '';
  }

  done(String(out));
}

main().catch(() => done());
