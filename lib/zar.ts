/** ZAR cents -> "R250" (no decimals unless needed). */
export function zar(cents: number): string {
  const rands = cents / 100;
  return `R${Number.isInteger(rands) ? rands : rands.toFixed(2)}`;
}
