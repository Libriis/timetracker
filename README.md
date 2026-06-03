# Time Tracker

A desktop time-tracking and billing app for a creative studio. Built with **Tauri 2 + React 19 + Vite + Tailwind**.

## Features

- **Timer** and **manual entries** (by duration or start/end time)
- **Clients, tasks and hourly rates**, with per-client overrides for rate, VAT and rounding
- **VAT** handling (e.g. SK 23 %, or 0 % for reverse-charge / non-VAT clients)
- **Billing rounding** to fixed blocks (e.g. 15 min), the standard agency practice
- **Complimentary (free)** work — tracked, billed at €0, shown separately for transparency
- **Dashboard** with period filters (today / week / month / all / custom range)
- **Daily log**, grouped and editable
- **CSV export** and a **bilingual (EN/SK) printable PDF report** with an activity glossary
- **JSON backup & restore** — the only export that round-trips back into the app

## Data & backups

All data is stored locally on the device (browser-style storage inside the app's
webview). It never leaves your machine. **CSV and PDF are reports, not backups** — to
move or safeguard your data use **Settings → Data & backup → Export backup (JSON)**, and
restore the same file on another machine or after a reinstall.

## Development

```bash
npm install
npm run tauri dev      # run the desktop app in dev mode
npm run dev            # run only the web frontend (http://localhost:1420)
npm run tauri build    # produce a packaged desktop build
```

## Project layout

- `src/` — React frontend (`App.jsx` holds the whole UI and billing logic)
- `src-tauri/` — Rust/Tauri shell (`tauri.conf.json`, `Cargo.toml`, `src/lib.rs`)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
