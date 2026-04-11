import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { installWorkingLine } from "./working-line.js";

export default function piWorkingLine(pi: ExtensionAPI): void {
  installWorkingLine(pi);
}
