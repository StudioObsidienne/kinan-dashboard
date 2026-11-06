> **Update:** run `git pull` in this folder, then relaunch `lancer-kinan-os.cmd`. The plugin is updated separately (`/plugin`), so the badge can stay on "plugin update available" until you do. The dashboard can check for new versions itself (off by default, see `config.js`).

# Kinan dashboard

[Français](README.fr.md) · [Website](https://kinan-orchestre-site.vercel.app/)

An offline Electron dashboard for the **kinan-orchestre** Claude Code plugin. It shows, in a small pixel-art office, what the judge (Kinan) and the configured agents are doing, which Claude Code conversations are active, when the next relay is due, and a few local statistics. By default it reads local files only, makes no network connection and calls no model, so it consumes no tokens. Two options change that, only once you enable them: the update check, and the Mail tab (your own mailbox over IMAP/SMTP, summaries and quotes prepared by Claude Code). See "Network".

The plugin writes the state files; this dashboard only displays them. Without the plugin's hooks, the dashboard stays in its idle state.

## Status

- Tested on Windows only. macOS and Linux are untested.
- Two separate version numbers: the dashboard (this app, shown as "Dashboard" next to the title) and the kinan-orchestre plugin (shown as "Plugin" below it). They are updated separately and do not have to match. The dashboard is updated with `git pull`; the plugin is updated in Claude Code (`claude plugin marketplace update kinan`, then `claude plugin update kinan-orchestre@kinan`, then restart Claude Code).
- The interface text is in French.
- Version 0.2.6. Electron 45. Already used by testers on their own computers (first feedback integrated: animation smoothness, taskbar icon, update flow). A next version is in progress.
- The dashboard displays what the plugin writes. For the judge to work as designed, use **Sonnet 5.5** with **medium** effort in the main Claude chat.

## Installation

Requirements: Node.js 20 or later and npm.

```
npm install
npm start
```

On Windows, `lancer-kinan-os.cmd` runs the same two steps.

If `npm start` reports that Electron failed to install (some npm versions skip install scripts), run `node node_modules/electron/install.js` once, then `npm start` again.

`npm install` also installs the three mail libraries used by the optional Mail tab (`imapflow`, `nodemailer`, `mailparser`, pinned versions). They are loaded only after you enable that tab.

Check the network rules statically: `npm run verifier` (see "Network" below). Run the tests: `npm test`.

## Features and their limits

| Feature | Limit |
|---|---|
| Pixel-art office: the judge and up to five agents, with four states (idle, working, error, waiting for an answer) | The scene has five seats. With more than five agents configured, the extra agents appear in Gestion but are not drawn in the scene. An agent stuck in "working" with no event for 15 minutes is shown as idle. |
| Clones: several instances of the same agent at once, with a ×N badge | Depends on the events the plugin's hooks receive. |
| Live tracking of several conversations (status box and bubbles) | A conversation appears only at the first event it sends. Bubbles show conversations that are working or waiting; idle ones are hidden. |
| Next relay (time and context tokens remaining) and the "start a new conversation" banner | Estimate based on the end of the local Claude Code log of the followed conversation. Thresholds come from the `relais` section of the configuration. |
| TOKEN OUT alert when a usage limit is reached, with the resume time: a pixel sign drops from the ceiling of the scene and hangs on two chains above the agents ("×" shrinks it to a badge in the header) | Reads the end of recent Claude Code logs every 30 seconds. Their format is not a documented interface: if the text cannot be read, the resume time is shown as unknown. Reduced motion: no drop, no blinking. |
| Red "limit" bubble when 10% or less of the Claude Code 5-hour or weekly limit remains | Needs the provided status line (`node outils/installer-statusline.js`), which writes `limites.json` from Claude Code's official `rate_limits` field. That field only exists for Claude.ai Pro and Max subscriptions, after the first response of a session. Without it, no bubble. |
| Version shown next to the title, green check when up to date, "update available" badge with the steps | Off until you agree: on first launch, a single question asks whether to check for new versions (one request to raw.githubusercontent.com every 30 min). Without "Yes", only the installed version is shown, without the check mark; hovering it says "check disabled". See `miseAJour.verifier`. |
| Green check: report on the last 3 hours (tokens per model, share delegated, estimated savings) | Estimate at public API prices, not an invoice. A subscription is not billed that way. |
| Event log, Gestion window (Tasks, History, Tokens, Mail tabs) | Tasks are stored locally; the Tokens tab is an estimate from local logs. |
| Sounds (Web Audio synthesis, no audio file) | Can be turned off with the Sounds button or `sons.actif: false`. |
| Theme (colors, fonts) | Fonts must be installed on the computer: nothing is downloaded. `theme.logo` (a URL) is never downloaded (offline edition): to show your logo in the frame on the wall, copy it to `~/.kinan-os/logo.png` (or `logo.jpg`, `logo.webp`; 2 MB at most). It is redrawn as 32 × 24 pixel art (12 colours at most, 1-pixel outline when the logo has a transparent background). No file, or a file that cannot be read: a neutral landscape is shown. `source` is not used. |
| Mail tab (Gestion, optional, disabled by default): fetch your mails read-only, summary and reply drafts by the plugin's `courrier` agent, quotes by its `devis` agent from your price grid, validation, then sending after a system confirmation | Needs the kinan-orchestre plugin (agents) and the `claude` command. Password authentication only: OAuth is not supported, so some Microsoft accounts are refused. Inbox only; first fetch: last 30 days, 50 mails at most. See "Mail". |

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

Update check: `"miseAJour": { "verifier": true }` reads the latest published version (`package.json` of kinan-dashboard and `plugin.json` of kinan-orchestre, main branch, on raw.githubusercontent.com) at start-up when the last check is older than 30 minutes, then every 30 minutes. Network failure: nothing is shown. If the dashboard folder is a clean git repository tracking a remote branch, an "Update" button runs `git pull --ff-only` after confirmation (never forced, refused when there are local changes), then offers to restart. Otherwise the steps are only displayed. The plugin is never updated automatically. When a new version of the dashboard or the plugin is detected, a small "New update" pop-up (installed version → new version, "Update" and "Later" buttons) appears once per version, in addition to the system notification: "Update" uses the git flow above for the dashboard and shows the `/plugin` steps for the plugin. Not set: on first launch a single dialog asks the question ("No" by default); the answer is written to `miseAJour.verifier` in `kinan.config.json` (other keys untouched) and the question is not asked again. Boolean; `false` = no network.

## Mail

The Mail tab (Gestion window, "Courrier") is an option, disabled by default.

1. Install the kinan-orchestre plugin: it provides the `courrier` and `devis` agents that the tab runs with `claude -p --agent kinan-orchestre:courrier` (or `:devis`). If `claude` is not on your PATH, set the `CLAUDE_BIN` environment variable to its full path.
2. Open Gestion, tab **Courrier**, click **Activer le courrier** and confirm the system dialog.
3. Choose your provider, enter your address and an app password, click **Enregistrer** (save), then **Tester la connexion** (test). The test opens an IMAP and an SMTP connection; nothing is read or sent.
4. **Relever** (fetch) reads the inbox in read-only mode: nothing is marked as read, deleted or moved. Once the connection is verified, the dashboard also fetches every 30 minutes while it is open.
5. **Récap mails** runs the `courrier` agent: a summary (one line per point) and reply drafts. **Préparer les devis** runs the `devis` agent on the mails flagged as quote requests.
6. Validate, edit or refuse each draft. **Envoyer** (send) opens a system dialog listing the recipients; nothing is sent without it.

| Provider | Password to use | Before connecting |
|---|---|---|
| Zoho Mail (zoho.eu or zoho.com) | An app-specific password (Zoho account, Security, App passwords) | Enable IMAP (Zoho Mail settings, Mail, IMAP access) and choose your account's region. |
| Gmail / Google Workspace | An app password (Google Account, Security; 2-Step Verification required). Your usual password is refused. | Check that IMAP is enabled (Settings, See all settings, Forwarding and POP/IMAP). A Workspace administrator can block IMAP or app passwords. |
| Outlook.com / Microsoft 365 | An app password, if your account offers one | Microsoft increasingly requires modern authentication (OAuth), which this version does not support: the connection may be refused. On Microsoft 365, your administrator must allow IMAP and authenticated SMTP (SMTP AUTH). |
| OVHcloud (MX Plan) | The mailbox password set in the OVHcloud control panel | IMAP is on by default. For Email Pro or Exchange, choose "Autre" (Other) with the servers shown in your control panel. |
| iCloud Mail | An app-specific password (Apple Account, Sign-In and Security; two-factor authentication required) | If login fails, enter the part of the address before the @ as the login. |
| Other | What your provider documents for IMAP and SMTP | Enter host, port and security (SSL/TLS or STARTTLS) for IMAP and SMTP. A host name is required (no IP address, no localhost, no protocol prefix); unencrypted connections are not offered. |

Predefined servers: `imap.zoho.eu`/`smtp.zoho.eu`, `imap.zoho.com`/`smtp.zoho.com`, `imap.gmail.com`/`smtp.gmail.com`, `outlook.office365.com`/`smtp.office365.com` (STARTTLS, port 587), `ssl0.ovh.net`, `imap.mail.me.com`/`smtp.mail.me.com` (STARTTLS, port 587). TLS certificates are always verified (TLS 1.2 minimum).

Safety rules, enforced by the code (and covered by `npm test`):

- The password is encrypted with Electron's `safeStorage` (refused when the system offers no real encryption). It is never sent back to the page, never logged, and masked in error messages.
- The recipient is recomputed from the original mail (`Reply-To`, otherwise `From`); a draft that names another address is blocked as suspicious.
- The agents only have Read, Glob and Grep, limited to the `echange` folder; they answer with a JSON block, and the dashboard validates it and writes the drafts. Mail content is data, never instructions.
- A mail becomes "processed" only if the agent listed it in its answer and did not report it as unreadable. If reading was refused, the mails stay "new".
- Quote amounts are computed by the dashboard from your price grid (unit price × quantity, VAT from the grid), never taken from the model. A line without a price blocks validation until you enter one.
- Sending requires your validation, then the system confirmation; a mail already sent, or whose sending is uncertain, is never sent again automatically.

Price grid for quotes: copy `exemples/grille-prix.exemple.json` (fictional) to `echange/grille-prix.json` and replace its lines with your services and prices. Format: `devise` (ISO code, `EUR` by default), `tauxTva` (0 to 0.5), `lignes` (`id`, `libelle`, `unite`, `prixUnitaire`), optional `mentions` (up to 6 lines printed at the bottom of the PDF).

## Network

By default, the dashboard opens no network connection:

- every page carries a Content-Security-Policy with `default-src 'none'` and `connect-src 'none'`;
- the main process cancels every `http`, `https`, `ws` and `wss` request at the session level, refuses new windows, navigation outside local files and permission requests;
- outside the declared exceptions below, no module such as `http`, `https`, `net`, `tls`, `dns` or `child_process` is loaded, and no mail library is loaded.

Three declared exceptions, checked by the verifier:

- `mise-a-jour.js` (update check and `git pull --ff-only`) is loaded only when `miseAJour.verifier` is `true`; a single origin, `raw.githubusercontent.com`, redirects are not followed;
- `courrier.js` (Mail tab) is loaded only by `courrier-ipc.js`, and only after you enable the tab (`courrier-option.json` with `"actif": true`, written by the "Activer le courrier" button after a system confirmation). It then connects only to the IMAP and SMTP servers of the provider you chose, or to the ones you typed for "Other", when you click Test, Fetch or Send, and every 30 minutes for fetching once the connection is verified. It also starts `claude -p` for the summaries and quotes: that Claude Code session talks to Anthropic and uses your Claude account and tokens, like any Claude Code session. "Désactiver le courrier" stops all of it;
- `outils/statusline-limites.js` is run by Claude Code (status line), never by the dashboard. It uses no network; it starts a process only to re-run a status line that was installed before it.

`node outils/verifier-hors-ligne.js` (or `npm run verifier`) checks these points statically and fails if a network call, a remote resource or a page without a strict CSP is found outside the exceptions. For the mail option it also checks that `courrier.js` is loaded only under the activation condition, takes its hosts only from the validated servers, keeps TLS certificate checks, starts no process other than `claude` (without a shell), refuses to send without explicit confirmation, and that the only runtime dependencies are the three pinned mail libraries. It lists every file access found in the code and the predefined mail servers.

`npm install` downloads Electron and the mail libraries; that happens once, before the dashboard runs.

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
| `courrier-option.json` (Mail tab enabled or not) | yes | yes, by the Enable / Disable buttons |
| `courrier.json` (provider, address, login, servers, last fetch; no password) | yes, when enabled | yes, when enabled |
| `courrier.bin` (address, login and password, encrypted by `safeStorage`) | yes, when enabled | yes on Save; deleted by "Oublier les identifiants" |
| `envois.jsonl` (sending log: file, recipient, result; no credential) | yes, when enabled | appended, when enabled |

Mail exchange folder: `echange/` inside the dashboard folder (ignored by git). Used only when the Mail tab is enabled:

| Path | Content | Written by |
|---|---|---|
| `echange/mails/<id>.json` | Fetched mails (plain text, truncated to 6,000 characters, attachment names only) | the dashboard |
| `echange/a-valider/`, `valides/`, `refuses/`, `envoyes/` | Reply and quote drafts at each stage | the dashboard (never the agents) |
| `echange/recap-mails.md`, `recap-devis.md` | Last summaries | the dashboard, from the agent's answer |
| `echange/grille-prix.json` | Your price grid | you |

The agents read `echange/mails/`, `echange/a-valider/` and `echange/grille-prix.json`, nothing else.

Claude Code logs, read only: `~/.claude/projects/**/*.jsonl` and the `.meta.json` files of sub-agents (relay, TOKEN OUT, tokens, 3-hour report). Only the end of recent files is read.

Status line: `node outils/installer-statusline.js` adds the `statusLine` key to `~/.claude/settings.json` (backup `settings.json.bak-kinan`, no other key changed). An existing status line is not overwritten: the new one re-runs it and its output stays visible. `--retirer` restores the previous one.

The dashboard writes nothing else and sends nothing anywhere, except through the options you enable: the update check, and the Mail tab (connections to your mail servers, the mails you confirm, and the Claude Code sessions it starts). Recaps can also be copied to the clipboard or saved to a `.txt` file you choose.

## Development

- `?demo=1` in `src/index.html` (opened in a browser, for example through a local static server) shows simulated data. Other parameters: `relais=1`, `tokenout=1`, `economies=1`, `ouvert=1`, `sieges=1..5`, `clones=skyze:2`, `calme=1` (reduced motion).
- `node outils/faire-logo.js` regenerates `assets/icon.png` (256 px) and `assets/icon.ico` (16, 24, 32, 48, 64, 128 and 256 px, transparent background, each size drawn from the 16 × 16 grid so the taskbar icon stays sharp). On Windows, windows use `icon.ico`.
- The interface honours `prefers-reduced-motion`. Scene: about 30 frames per second with a jitter tolerance (steady pacing on 60 Hz screens), stopped while the window is hidden or minimised. With reduced motion (on Windows: "Animation effects" off, or "Adjust for best performance"), the scene is redrawn once per second and stays still on purpose.
- `npm test` starts the real app once (`test/demarrage.test.js`): Electron opens the window in a temporary state folder, with the update check off, and the test fails on any error in the page console or the main process; a second run starts with corrupted state files.
- `npm test` also checks that the "New update" pop-up appears only once per version (`test/mise-a-jour.test.js`).
- `npm test` runs the mail tests (`test/courrier.test.js`) with fake IMAP, SMTP and `claude` processes: provider table, host and port validation, read-only fetch, "processed" only when the agent listed the mail, recipient recomputed, no sending without confirmation, quote amounts from the grid. No real mailbox is contacted.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Antivirus note (Windows)
Windows Defender sometimes quarantines Electron's `ffmpeg.dll` (detection name "Posilod.EB!cl"; the "!cl" suffix marks a cloud or heuristic detection). It is a false positive: the file comes unmodified from the official Electron package installed by `npm install`. What to do, in this order:
1. `lancer-kinan-os.cmd` detects the missing file and reinstalls Electron automatically.
2. If it is removed again: Windows Security > Virus & threat protection > Protection history, select the `ffmpeg.dll` item, then Actions > Restore.
3. Report the false positive to Microsoft: https://www.microsoft.com/wdsi/filesubmission ("Incorrectly detected", attach `node_modules\electron\dist\ffmpeg.dll`). Once Microsoft updates its definitions, the detection goes away for everyone.
4. Last resort, your own decision: add an exclusion for the dashboard folder only (Windows Security > Virus & threat protection settings > Exclusions). Warning: Defender will no longer scan anything in that folder, including files you later download into it. Never exclude a whole drive, and remove the exclusion once the detection is fixed.

The project never disables Defender and never adds an exclusion itself. Checked on 6 November 2026 with Defender definitions 1.463.137.0: a local scan does not detect the `ffmpeg.dll` of Electron 45.2.3, so switching Electron versions cannot be shown to help; detection depends on each PC's definitions and cloud protection.
