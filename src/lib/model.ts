export const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

/** US dollars per million tokens. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

// The prompt alone is about 800 input tokens; the rest depends on the email.
// A real 495-email sync on Opus cost about 1.2 cents per email, inside this range.
const TOKENS_PER_EMAIL = {
  low: { input: 1500, output: 40 },
  high: { input: 3000, output: 100 },
};

/** A rough price for classifying this many emails, or null for a model with no known price. */
export function estimateCost(emails: number, model = MODEL) {
  const price = PRICES[model];
  if (!price) return null;

  const cost = ({ input, output }: { input: number; output: number }) =>
    (emails * (input * price.input + output * price.output)) / 1_000_000;
  const low = cost(TOKENS_PER_EMAIL.low);
  const high = cost(TOKENS_PER_EMAIL.high);

  if (high < 0.01) return "under 1¢";
  if (low < 0.01) return `up to $${high.toFixed(2)}`;
  return `$${low.toFixed(2)}–$${high.toFixed(2)}`;
}
