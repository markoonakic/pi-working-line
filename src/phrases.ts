export const DEFAULT_PHRASES = [
  "Accomplishing",
  "Architecting",
  "Baking",
  "Brewing",
  "Calculating",
  "Canoodling",
  "Channelling",
  "Composing",
  "Computing",
  "Concocting",
  "Considering",
  "Cooking",
  "Crafting",
  "Deciphering",
  "Deliberating",
  "Dilly-dallying",
  "Discombobulating",
  "Doodling",
  "Fermenting",
  "Flibbertigibbeting",
  "Forging",
  "Generating",
  "Herding",
  "Hyperspacing",
  "Ideating",
  "Incubating",
  "Moseying",
  "Musing",
  "Noodling",
  "Orchestrating",
  "Percolating",
  "Pondering",
  "Processing",
  "Puzzling",
  "Recombobulating",
  "Ruminating",
  "Simmering",
  "Synthesizing",
  "Thinking",
  "Tinkering",
  "Transmuting",
  "Vibing",
  "Whirring",
  "Working",
  "Wrangling",
  "Zigzagging"
] as const;

export function pickPhrase(
  phrases: readonly string[] = DEFAULT_PHRASES,
  random: () => number = Math.random
): string {
  if (phrases.length === 0) return "Working";
  const index = Math.min(phrases.length - 1, Math.floor(random() * phrases.length));
  return phrases[index] ?? "Working";
}
