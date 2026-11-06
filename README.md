> **Update:** run `git pull` in this folder, then relaunch `lancer-kinan-os.cmd`. The dashboard can check for new versions itself (off by default, see `config.js`).

# Kinan dashboard

[Français](README.fr.md)

An offline Electron dashboard for the **kinan-orchestre** Claude Code plugin. It shows, in a small pixel-art office, what the judge (Kinan) and the configured agents are doing, which Claude Code conversations are active, when the next relay is due, and a few local statistics. It reads local files only. It makes no network connection and calls no model, so it consumes no tokens.

The plugin writes the state files; this dashboard only displays them. Without the plugin's hooks, the dashboard stays in its idle state.

## Status

- Tested on Windows only. macOS and Linux are untested.
- The interface text is in French.
- Version 0.1.0. Electron 45.

## Installation

Requirements: Node.js 20 or later and npm.

```
npm install
npm start
```

On Windows, `lancer-kinan-os.cmd` runs the same two steps.

If `npm start` reports that Electron failed to install (some npm versions skip install scripts), run `node node_modules/electron/install.js` once, then `npm start` again.

Check that the code contains no network call: `npm run verifier` (see "Network" below).

## Features and their limits

| Feature | Limit |
|---|---|
| Pixel-art office: the judge and up to five agents, with four states (idle, working, error, waiting for an answer) | The scene has five seats. With more than five agents configured, the extra agents appear in Gestion but are not drawn in the scene. An agent stuck in "working" with no event for 15 minutes is shown as idle. |
| Clones: several instances of the same agent at once, with a ×N badge | Depends on the events the plugin's hooks receive. |
| Live tracking of several conversations (status box and bubbles) | A conversation appears only at the first event it sends. Bubbles show conversations that are working or waiting; idle ones are hidden. |
| Next relay (time and context tokens remaining) and the "start a new conversation" banner | Estimate based on the end of the local Claude Code log of the followed conversation. Thresholds come from the `relais` section of the configuration. |
| TOKEN OUT alert when a usage limit is reached, with the resume time: a pixel sign drops from the ceiling of the scene and hangs on two chains above the agents ("×" shrinks it to a badge in the header) | Reads the end of recent Claude Code logs every 30 seconds. Their format is not a documented interface: if the text cannot be read, the resume time is shown as unknown. Reduced motion: no drop, no blinking. |
| Red "limit" bubble when 10% or less of the Claude Code 5-hour or weekly limit remains | Needs the provided status line (`node outils/installer-statusline.js`), which writes `limites.json` from Claude Code's official `rate_limits` field. That field only exists for Claude.ai Pro and Max subscriptions, after the first response of a session. Without it, no bubble. |
| Version shown next to the title, green check when up to date, "update available" badge with the steps | Check disabled by default (no connection): see `miseAJour.verifier`. Without it, only the installed version is shown. |
| Green check: report on the last 3 hours (tokens per model, share delegated, estimated savings) | Estimate at public API prices, not an invoice. A subscription is not billed that way. |
| Event log, Gestion window (Tasks, History, Tokens tabs) | Tasks are stored locally; the Tokens tab is an estimate from local logs. |
| Sounds (Web Audio synthesis, no audio file) | Can be turned off with the Sounds button or `sons.actif: false`. |
| Theme (colors, fonts) | Fonts must be installed on the computer: nothing is downloaded. `logo` and `source` are validated but not used by this offline edition. |

## Configuration

The dashboard reads `kinan.config.json` from the state folder: `~/.kinan-os/`, or the folder named by the `KINAN_OS_DOSSIER` environment variable. It never reads a configuration file from the open project. The format is the plugin's (see its README); the dashboard uses these keys:

| Key | Effect | Validation |
|---|---|---|
| `agents.<id>.nom`, `.couleur`, `.role`, `.modele`, `.base`, `.actif` | Names, colors and roles shown in the scene, cards, Gestion and notifications | Same rules as the plugin: id `^[a-z][a-z0-9-]{0,23}$`, at most 8 agents, color `#rrggbb`, name up to 24 characters |
| `juge.couleur` | Judge's color | `#rrggbb`. The judge's name ("Kinan") and role are locked. |
| `theme.fond`, `.surface`, `.texte`, `.accent`, `.accentSecondaire` | Interface colors | `#rgb` or `#rrggbb` only. Minimum contrast checked: text 4.5:1 on background and surface, accents 3:1 on background. If a check fails, the whole theme is ignored. |
| `theme.policeTitre`, `.policeTexte` | Heading and body fonts | Letters, digits, spaces and hyphens, 40 characters at most |
| `titreBureau` | Subtitle under the title | Text up to 60 characters. Default: "Bureau des agents" on a French system, "Agents desk" otherwise. |
| `dossierTravail` | When the followed conversation runs inside this absolute path, the subtitle shows `titreBureau`; elsewhere it shows "Agent · conversation name". Without it, a known conversation name is always shown. | Absolute path, 260 characters at most |
| `relais.minutes`, `relais.jetons` | Relay thresholds | 10 to 1440 minutes; 50,000 to 2,000,000 tokens |
| `sons.actif` | Sounds on or off by default | Boolean. The Sounds button setting takes precedence. |

Any invalid value is ignored and the default is used. Text from files is always inserted as text, never as HTML.

Example:

```json
{
  "titreBureau": "Agents desk",
  "agents": {
    "drafion": { "nom": "Scout", "base": "lecture", "couleur": "#4fb3ff" },
    "skyze": { "nom": "Maker", "base": "production" },
    "johms": { "nom": "Sage", "base": "expert", "couleur": "#ff8a3d" }
  },
  "theme": { "fond": "#0f1720", "surface": "#16202b", "texte": "#f1f5f9", "accent": "#38bdf8", "policeTexte": "Georgia" }
}
```

Update check: `"miseAJour": { "verifier": true }` reads the latest published version (`package.json` of kinan-dashboard and `plugin.json` of kinan-orchestre, main branch, on raw.githubusercontent.com) at start-up when the last check is older than 6 hours, then every 6 hours. Network failure: nothing is shown. If the dashboard folder is a clean git repository tracking a remote branch, an "Update" button runs `git pull --ff-only` after confirmation (never forced, refused when there are local changes), then offers to restart. Otherwise the steps are only displayed. The plugin is never updated automatically. Boolean, `false` by default (no network).

## Network

The dashboard opens no network connection:

- every page carries a Content-Security-Policy with `default-src 'none'` and `connect-src 'none'`;
- the main process cancels every `http`, `https`, `ws` and `wss` request at the session level, refuses new windows, navigation outside local files and permission requests;
- no module such as `http`, `https`, `net`, `tls`, `dns` or `child_process` is loaded, and there is no runtime dependency.

Two declared exceptions, checked by the verifier:

- `mise-a-jour.js` (update check and `git pull --ff-only`) is loaded only when `miseAJour.verifier` is `true`; a single origin, `raw.githubusercontent.com`, redirects are not followed;
- `outils/statusline-limites.js` is run by Claude Code (status line), never by the dashboard. It uses no network; it starts a process only to re-run a status line that was installed before it.

`node outils/verifier-hors-ligne.js` (or `npm run verifier`) checks these points statically and fails if a network call, a remote resource or a page without a strict CSP is found. It also lists every file access found in the code.

`npm install` itself downloads Electron; that happens once, before the dashboard runs.

## Files read and written

State folder (`~/.kinan-os/` or `KINAN_OS_DOSSIER`):

| File | Read | Written |
|---|---|---|
| `kinan.config.json` | yes | never |
| `state.json` (agent states, written by the plugin) | yes | created with idle states if absent |
| `sessions.json` (conversations, written by the plugin) | yes | never |
| `historique.jsonl` (event log, written by the plugin) | yes | never |
| `taches.json` (tasks) | yes | yes, from the Tasks tab (with the plugin's lock file `state.lock`) |
| `reglages.json` (window position, sounds, prices, context size) | yes | yes |
| `son.log` (audio diagnostics) | no | appended on audio errors |
| `limites.json` (5-hour and weekly limits, written by the status line) | yes, every 10 s | never by the dashboard |
| `mise-a-jour.json` (update check cache) | yes, when enabled | yes, when enabled |

Claude Code logs, read only: `~/.claude/projects/**/*.jsonl` and the `.meta.json` files of sub-agents (relay, TOKEN OUT, tokens, 3-hour report). Only the end of recent files is read.

Status line: `node outils/installer-statusline.js` adds the `statusLine` key to `~/.claude/settings.json` (backup `settings.json.bak-kinan`, no other key changed). An existing status line is not overwritten: the new one re-runs it and its output stays visible. `--retirer` restores the previous one.

The dashboard writes nothing else and sends nothing anywhere (except the update check, if you enable it).

## Development

- `?demo=1` in `src/index.html` (opened in a browser, for example through a local static server) shows simulated data. Other parameters: `relais=1`, `tokenout=1`, `economies=1`, `ouvert=1`, `sieges=1..5`, `clones=skyze:2`, `calme=1` (reduced motion).
- `node outils/faire-logo.js` regenerates `assets/icon.png` and `assets/icon.ico`.
- The interface honours `prefers-reduced-motion`.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Antivirus note
Windows Defender may wrongly quarantine Electron's `ffmpeg.dll` (false positive, "Posilod.EB!cl"). `lancer-kinan-os.cmd` detects it, reinstalls Electron, and otherwise tells you to click "Restore" in Windows Security > Protection history. Report false positives at https://www.microsoft.com/wdsi/filesubmission.
