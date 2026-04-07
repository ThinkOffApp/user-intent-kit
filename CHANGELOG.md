# Changelog

## 0.2.0 (2026-04-07)

### Added
- `bin/uik-daemon.js` — persistent background daemon that publishes desktop state and agent heartbeats to the intent API. Exposed as `uik-daemon` bin, runnable via `npm run daemon` or `npx uik-daemon`.
- npm `bin` entry for `uik-daemon`.

### Why
Previously the DesktopAdapter and IAKAdapter existed as library code but nothing ran them as a long-lived process, so the intent dashboard showed every device and agent as stale. The daemon closes that gap.

### Deployment
Run under launchd (macOS), systemd (Linux), or a detached tmux session. Environment:
- `INTENT_API_KEY` (required)
- `INTENT_USER_ID` (required)
- `INTENT_AGENT_HANDLE` (default `@agent`)
- `INTENT_DEVICE_ID` (default hostname)
- `POLL_INTERVAL_MS` (default 30000)

See `examples/claudemb-launchd.plist` and `examples/claudemb-daemon.sh` for a working macOS setup.

## 0.1.0

Initial release: IntentClient + IAK/Desktop/OpenClaw adapters, 2-level derived state.
