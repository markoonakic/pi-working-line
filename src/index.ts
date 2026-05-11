import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWorkingLineMessageRenderer } from "./message-renderer.js";
import { installWorkingLine } from "./working-line.js";

export default function piWorkingLine(pi: ExtensionAPI): void {
  registerWorkingLineMessageRenderer(pi);
  installWorkingLine(pi);
}
