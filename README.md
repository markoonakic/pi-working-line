# @markoonakic/pi-working-line

Claude-style working messages for [pi](https://github.com/badlogic/pi-mono).

`pi-working-line` replaces Pi's default working message with a per-turn phrase
and an elapsed timer.

```text
Baking... · 12s
Herding... · 1m 04s
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
- Restores Pi's default working message when the turn ends.

## What It Does Not Do

- It does not replace spinner frames.
- It does not show token counts yet.
- It does not show thinking metadata yet.
- It does not integrate with task/subagent extensions yet.

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
