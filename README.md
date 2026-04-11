# @markoonakic/pi-working-line

Claude-style working messages for [pi](https://github.com/badlogic/pi-mono).

`pi-working-line` replaces Pi's default working message with a per-turn phrase
and an elapsed timer.

```text
Baking... · 12s
Herding... · 1m 04s
Baking... · running bash · 45s · thought for 8s
```

## Install

```bash
pi install npm:@markoonakic/pi-working-line
```

For local development:

```json
{
  "packages": ["/path/to/pi-working-line"]
}
```

## What It Does

- Picks one working phrase per agent turn.
- Shows elapsed time next to the phrase.
- Shows the currently running tool as a suffix.
- Shows thinking state and thinking duration when Pi exposes thinking stream events.
- Can show an approximate live output token count.
- Can optionally add a visible turn-duration message after long turns.
- Restores Pi's default working message when the turn ends.

## What It Does Not Do

- It does not replace spinner frames.
- It does not integrate with task/subagent extensions yet.

## Configuration

Configure it in `~/.pi/agent/settings.json`:

```json
{
  "pi-working-line": {
    "enabled": true,
    "phrases": {
      "mode": "append",
      "verbs": []
    },
    "segments": {
      "phrase": true,
      "suffix": true,
      "elapsed": true,
      "thinking": true,
      "tokens": false
    },
    "turnDuration": {
      "enabled": false,
      "thresholdMs": 30000
    }
  }
}
```

Defaults:

- `phrases.mode`: `append`
- `phrases.verbs`: `[]`
- `phrase`: on
- `suffix`: on
- `elapsed`: on
- `thinking`: on
- `tokens`: off, because it is an approximate `text_delta.length / 4` estimate
- `turnDuration`: off, because it adds a visible transcript message

Example with tokens enabled:

```text
Baking... · running bash · 45s · thought for 8s · ↓ 1.8k tokens
```

Example turn-duration message when enabled:

```text
Baked for 1m 06s
```

### Custom Phrases

Append your own phrases to the built-in list:

```json
{
  "pi-working-line": {
    "phrases": {
      "mode": "append",
      "verbs": ["Consulting", "Reticulating"]
    }
  }
}
```

Replace the built-in list entirely:

```json
{
  "pi-working-line": {
    "phrases": {
      "mode": "replace",
      "verbs": ["Consulting", "Reticulating"]
    }
  }
}
```

## Command

```text
/working-line
```

Shows the effective configuration, phrase count, and a sample rendered line.

## Compatibility

This extension intentionally owns the whole `ctx.ui.setWorkingMessage(...)`
surface. Do not run it together with another extension that continuously rewrites
the working message, or the extensions will overwrite each other.

It is fine to use alongside spinner-frame extensions, footer extensions, and
theme extensions that do not call `setWorkingMessage()`.

## Development

```bash
npm install
npm run check
npm run pack:dry
```
