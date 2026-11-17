import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { rewriteMessages } from './rewrite.mjs';

/** Request-time projection: Pi keeps ownership of tool loadouts and stored context. */
export default function antigravityPrompt(pi: ExtensionAPI) {
  // Inspect provenance without changing prompt options or forcing a static prompt.
  let promptOptions: { customPrompt?: string; forceSystemPrompt?: string } | undefined;
  pi.on('before_agent_start', (event) => {
    promptOptions = event.systemPromptOptions;
  });
  pi.on('context_with_system', (event) => {
    // Keep the same object so later before_agent_start handlers are respected too.
    if (promptOptions?.customPrompt || promptOptions?.forceSystemPrompt !== undefined) return;
    return { messages: rewriteMessages(event.messages) };
  });
}
