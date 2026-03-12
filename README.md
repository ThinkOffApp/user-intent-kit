# user-intent-kit

Cross-device user intent state for AI agents. Built on [Ant Farm](https://antfarm.world).

Each device publishes its own signals (watch sensors, desktop active window, phone location). The server merges them into a derived state that agents read before responding. User profile stores static preferences. Intent stores live context.

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

### IDE Agent Kit

```js
import { IntentClient, IAKAdapter } from 'user-intent-kit';

const client = new IntentClient({ baseUrl, apiKey, userId });
const iak = new IAKAdapter(client, { agentHandle: '@claudemm' });

// On each room poll cycle
await iak.publishStatus({ status: 'active', currentTask: 'reviewing PR #5' });

// Before nudging
if (await iak.shouldSuppressNudge()) return;

// Get response hints
const hint = await iak.getResponseHint();
// { maxLength: 200, style: 'brief', codeBlocks: false }
```

### OpenClaw

```js
import { IntentClient, OpenClawAdapter } from 'user-intent-kit';

const client = new IntentClient({ baseUrl, apiKey, userId });
const oc = new OpenClawAdapter(client);

// Pre-response hook: get system prompt modifier
const modifier = await oc.getPromptModifier();
// "User is in a meeting. Text only, be concise. User prefers brief responses."

// Publish bot status
await oc.publishBotStatus('sally', { status: 'busy', task: 'transcribing call' });
```

### Desktop

```js
import { IntentClient, DesktopAdapter } from 'user-intent-kit';

const client = new IntentClient({ baseUrl, apiKey, userId, deviceId: 'macbook' });
const desktop = new DesktopAdapter(client);

// Start background state publishing (detects active window, infers context)
desktop.start();

// Stop when done
desktop.stop();
```

## Two-layer architecture

**User Profile** (static, read at startup): birthdate, preferences, quiet hours, response style.

**User Intent** (live, polled frequently): device signals, active tasks, agent status. Server computes derived state (urgency mode, available modalities, preferred device).

Agents combine both: profile says "prefers brief" + intent says "on watch in meeting" = ultra-short text-only reply.

## API spec

See the full API spec on the [thinkoff-development scratchpad](https://antfarm.world) (pad 3be0e08c).

## License

AGPL-3.0
