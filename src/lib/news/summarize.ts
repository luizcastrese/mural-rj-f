const MAX_WORDS = 80;

/** Mantém apenas fatos disponíveis no título e na descrição do provedor. */
export function summarize(title: string, description?: string): string {
  const input = (description?.trim() || title.trim()).replace(/\s+/g, " ");
  const words = input.split(" ");
  if (words.length <= MAX_WORDS) return input;
  return `${words.slice(0, MAX_WORDS).join(" ").replace(/[,:;]$/, "")}.`;
}
