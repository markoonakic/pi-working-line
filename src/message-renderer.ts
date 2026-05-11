import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const TURN_DURATION_MESSAGE_TYPE = "pi-working-line";

export function registerWorkingLineMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(TURN_DURATION_MESSAGE_TYPE, (message, _options, theme) => {
    const content = typeof message.content === "string" ? message.content.trim() : "";
    return new Text(theme.fg("dim", ` ${content}`), 0, 0);
  });
}
