/** "Twiggy" -> "Twiggy’s", "James" -> "James’" */
export function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}’` : `${n}’s`;
}

/** First name only, capped so it never breaks the slot buttons. */
export function shortName(name: string, max = 10): string {
  const first = name.trim().split(/\s+/)[0] || "Entertainer";
  return first.length > max ? first.slice(0, max - 1) + "…" : first;
}
