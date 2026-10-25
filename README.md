# Nexus Flow - High-Speed Trading Terminal

Nexus Flow is a hybrid high-frequency trading terminal for P2P traders.

## Architecture
- **Terminal UI**: Runs locally on your machine at `http://localhost:5173`.
- **Wire Engine**: Executes on your dedicated remote cloud server (Render / VPS in Frankfurt) to ensure low latency and account safety.

## Quick Start
1. Ensure [Node.js](https://nodejs.org/) (LTS version) is installed.
2. Double-click `start-all.bat` to launch the terminal.
3. Paste your dedicated Render engine URL into the top bar and click **Connect**.

## Updating
Double-click `update.bat` at any time to automatically download the latest online updates from GitHub.
