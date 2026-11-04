import Anthropic from "@anthropic-ai/sdk";

export function describeError(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) {
    return "Claude rejected the API key. Check ANTHROPIC_API_KEY in .env.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Claude rate limit reached. Sync again in a minute; it picks up where it stopped.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Claude API error${error.status ? ` (${error.status})` : ""}: ${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("invalid_grant")) {
    return "Gmail access expired. Disconnect and connect Gmail again.";
  }
  if (message.includes("invalid_client")) {
    return "Google rejected the client ID or secret. Check them in .env.";
  }
  if (message.includes("authentication method")) {
    return "ANTHROPIC_API_KEY is not set in .env.";
  }
  return `Sync failed: ${message}`;
}
