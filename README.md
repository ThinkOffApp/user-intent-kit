# user-intent-kit

Cross-device user intent state for AI agents. Built on [Ant Farm](https://antfarm.world).

## What is user intent in AgentOS?

The [AgentOS paper](https://arxiv.org/abs/2603.08938) (Liu et al., 2026) proposes replacing traditional OS interfaces with an Agent Kernel that interprets user intent and orchestrates agents. Applications become composable skills. Natural language becomes the primary interface.

A key piece the paper describes but doesn't solve: **user intent state**. This is the real-time understanding of what the user is trying to do, what context they're in, and how agents should adapt. When you're in a meeting, your agents should know to keep responses short and silent. When you're coding, they can be verbose. When you're driving, voice-only.

## Why multi-device?

The AgentOS paper thinks from a single-machine perspective. But people use multiple devices: a laptop for work, a phone in their pocket, a smartwatch on their wrist. Each device has unique signals:

- **Watch:** wrist raise, heart rate, screen glance, calendar sync
- **Laptop:** active application, current task, IDE context
- **Phone:** location, motion (driving/walking/still), notification state

No single device sees the full picture. The watch knows you raised your wrist. The laptop knows you're in a Zoom call. The phone knows you're at the office. Combined, these signals tell agents exactly how to reach you and what kind of response is appropriate.

We searched for existing solutions to this problem. AIOS (agiresearch) has account-based sync but no per-device signal merging. Agent-Kernel (ZJU) distributes agents across machines but doesn't share user context between devices. Google's A2A protocol handles agent-to-agent communication but not user state. Anthropic's MCP handles tool context but not device signals. A few early attempts exist (fepvenancio/crdt-agent) but nothing production-ready.

So we built our own.

## Design choices

### Two-layer architecture: Profile + Intent

User state splits naturally into two layers with different update frequencies:

**User Profile** (static, changes rarely): birthdate, physical characteristics, preferences for UI/food/brands, quiet hours, response style. Read once when an agent starts, cached locally. Think of it as a config file for your agents.

**User Intent** (live, updates every few seconds): which device is active, what app is in the foreground, whether you're in a meeting, what task you're working on, which agents are busy. This is the real-time dashboard that agents check before every response.

Separating them avoids polling static data on every request and keeps the live layer lightweight.

### CRDT-ready, starting simple

CRDTs (Conflict-free Replicated Data Types) allow multiple devices to edit state independently, even offline, and merge automatically when they reconnect. This matters because a smartwatch loses Bluetooth connectivity regularly.

For v0, we start with a simpler approach: last-writer-wins (LWW) per device slot, with per-field timestamps. Each device owns its own slot and only writes to it, so conflicts don't happen in practice. The server merges by reading all device slots together.

If offline merge becomes a real need (e.g., watch accumulates sensor readings while disconnected), the storage layer can upgrade to Yjs CRDT documents without changing the client API.

### API design

The API follows REST conventions on Ant Farm:

- `GET /api/v1/profile/{user_id}` - read static profile
- `GET /api/v1/intent/{user_id}` - read merged intent state across all devices
- `PATCH /api/v1/intent/{user_id}/{device_id}` - partial update to a device slot (no accidental field wipes)
- `PATCH /api/v1/intent/{user_id}/agents/{agent_name}` - publish agent status

The server computes a `derived` object from raw device signals: urgency mode, available modalities, preferred device, whether to suppress audio. Agents read this derived state instead of parsing raw signals themselves.

Heartbeats keep device slots alive (90s TTL for devices, 300s for agents). Stale slots are excluded from derived state computation. The server deduplicates heartbeats within 5s to prevent write churn.

Full API spec with error codes, auth model, and integration details is on the [thinkoff-development scratchpad](https://antfarm.world) (pad 3be0e08c).

## Install

```bash
npm install user-intent-kit
```

No dependencies. Node.js >= 18.

## Quick start

```js
import { IntentClient } from 'user-intent-kit';

const client = new IntentClient({
  baseUrl: 'https://antfarm.world/api/v1',
  apiKey: 'xfb_your_key',
  userId: 'petrus',
  deviceId: 'macbook',
});

// Read current intent state
const intent = await client.getIntent();
console.log(intent.derived.urgency_mode); // "text-only" if in meeting

// Publish device state
await client.patchDevice({ context: 'coding', active_app: 'claude-code' });

// Check before responding
if (await client.shouldSuppressAudio()) {
  // Text-only response
}

// Auto-heartbeat to keep device slot alive
client.startHeartbeat();
```

## Adapters

Platform-specific adapters wrap the core `IntentClient` with ergonomic helpers.

### Included adapters

#### [IDE Agent Kit](https://github.com/ThinkOffApp/ide-agent-kit) (Node.js)

For IDE-connected agents that poll rooms and respond to messages.

```js
import { IntentClient, IAKAdapter } from 'user-intent-kit';

const client = new IntentClient({ baseUrl, apiKey, userId });
const ideAgentKit = new IAKAdapter(client, { agentHandle: '@claudemm' });

await ideAgentKit.publishStatus({ status: 'active', currentTask: 'reviewing PR #5' });
if (await ideAgentKit.shouldSuppressNudge()) return;
const hint = await ideAgentKit.getResponseHint();
```

#### OpenClaw (Node.js)

For [OpenClaw](https://github.com/AntfarmFinancial/openclaw) bots. Generates system prompt modifiers based on user intent state.

```js
import { IntentClient, OpenClawAdapter } from 'user-intent-kit';

const client = new IntentClient({ baseUrl, apiKey, userId });
const oc = new OpenClawAdapter(client);

const modifier = await oc.getPromptModifier();
// "User is in a meeting. Text only, be concise."
await oc.publishBotStatus('sally', { status: 'busy', task: 'transcribing call' });
```

An OpenClaw plugin is also included at `src/plugins/openclaw/` that hooks into `before_prompt_build` to inject intent context automatically.

#### Desktop (Node.js, macOS)

Detects the active window and infers user context (meeting, coding, browsing). Publishes state automatically on an interval.

```js
import { IntentClient, DesktopAdapter } from 'user-intent-kit';

const client = new IntentClient({ baseUrl, apiKey, userId, deviceId: 'macbook' });
const desktop = new DesktopAdapter(client);
desktop.start(); // background polling + publishing
```

Currently macOS only (uses `osascript` for active window detection). Linux and Windows adapters are welcome contributions.

#### Browser (Node.js / browser)

For web dashboards showing live intent state. Polls the API and calls back on each update.

```js
import { BrowserAdapter } from 'user-intent-kit/adapters/browser';
import { IntentClient } from 'user-intent-kit';

const client = new IntentClient({ baseUrl, apiKey, userId });
const browser = new BrowserAdapter(client, {
  onUpdate: (intent) => renderDashboard(intent),
  pollIntervalMs: 5000,
});
browser.start();
```

#### CLI

Command-line tool for reading and writing intent state. Useful for scripts and debugging.

```bash
npm install -g user-intent-kit

export INTENT_API_BASE=https://antfarm.world/api/v1
export INTENT_API_KEY=xfb_your_key
export INTENT_USER_ID=petrus
export INTENT_DEVICE_ID=macbook

intent get                     # show full intent state
intent profile                 # show user profile
intent derived                 # show derived state only
intent patch context=coding    # update device state
intent heartbeat               # send heartbeat
```

#### Swift (watchOS / iOS / macOS)

Native Swift client with async/await. Includes a `WatchAdapter` for Apple Watch with alert mode detection.

```swift
let client = IntentClient(
    baseURL: URL(string: "https://antfarm.world/api/v1")!,
    apiKey: "xfb_your_key",
    userId: "petrus",
    deviceId: "apple-watch"
)

let adapter = WatchAdapter(client: client)
try await adapter.publishState(wristRaise: true, heartRate: 72)
let mode = try await adapter.alertMode() // .full, .textOnly, or .silent
```

See `swift/` for the SPM package. Targets watchOS 9+, iOS 16+, macOS 13+.

#### Kotlin (Wear OS / Android)

Kotlin client using coroutines and `HttpURLConnection` (no external dependencies). Includes a `WatchAdapter` for Wear OS smartwatches.

```kotlin
val client = IntentClient(
    baseUrl = "https://antfarm.world/api/v1",
    apiKey = "xfb_your_key",
    userId = "petrus",
    deviceId = "wear-os-watch"
)

val adapter = WatchAdapter(client)
adapter.publishState(wristRaise = true, heartRate = 72)
val mode = adapter.alertMode() // FULL, TEXT_ONLY, or SILENT
```

See `kotlin/` for the Gradle project.

#### Python

Zero-dependency Python client using `urllib.request`. Threading-based heartbeat.

```python
from user_intent_kit import IntentClient

client = IntentClient(
    base_url="https://antfarm.world/api/v1",
    api_key="xfb_your_key",
    user_id="petrus",
    device_id="server",
)

intent = client.get_intent()
print(intent["derived"]["urgency_mode"])

client.start_heartbeat()  # background thread
```

See `python/` for the package. Requires Python >= 3.9.

### Adapters we'd like to see

Community contributions welcome. Some ideas:

- **Linux Desktop** - X11/Wayland active window detection (similar to the macOS Desktop adapter)
- **Windows Desktop** - Win32 API for active window and focus tracking
- **Home Assistant** - Publish room presence, lighting state, and smart home context
- **Slack/Teams** - Detect meeting status, DND mode, presence from workplace chat
- **Calendar** - Feed upcoming events into intent state (busy, free, focus time)
- **Location** - Geofencing-based context (home, office, commuting)
- **Health sensors** - Continuous HR, stress level, sleep state from wearables
- **Vehicle** - CarPlay/Android Auto integration for driving context
- **Accessibility** - Screen reader state, magnification, input method preferences

To build an adapter: wrap `IntentClient`, call `patchDevice()` with your signals, and optionally read `getIntent()` to adapt behavior. See any included adapter for the pattern.

## License

AGPL-3.0
