import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.PI_TEST_WEB_ROOT ?? '/usr/lib/node_modules/@agegr/pi-web/node_modules/@earendil-works/pi-coding-agent';
const entry = fileURLToPath(new URL('../extensions/pi-clear-prompt/index.ts', import.meta.url));

test('pi-web SDK session: enabling and disabling tools during one run reaches the next provider request', async () => {
  const sdk = await import(`${root}/dist/index.js`);
  const { AssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools } = await import(`${dirname(root)}/pi-ai/dist/index.js`);
  const cwd = await mkdtemp(join(tmpdir(), 'pi-clear-prompt-session-test-'));
  let session;
  try {
    const modelRuntime = await sdk.ModelRuntime.create({
      authPath: join(cwd, 'auth.json'), modelsPath: null,
      modelsStorePath: join(cwd, 'models-store.json'), allowModelNetwork: false, refreshOnCreate: false,
    });
    await modelRuntime.setRuntimeApiKey('openai', 'offline-test-key-not-a-real-secret');
    const settingsManager = sdk.SettingsManager.inMemory({
      compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: 'off',
    });
    const loader = new sdk.DefaultResourceLoader({
      cwd, agentDir: cwd, settingsManager, noExtensions: true, noSkills: true,
      noContextFiles: true, noThemes: true, noPromptTemplates: true,
      additionalExtensionPaths: [entry],
      extensionFactories: [(pi) => {
        pi.registerTool({
          name: 'switch_tools', label: 'Switch', description: 'Local test tool',
          promptSnippet: 'Switch the test loadout.', parameters: { type: 'object', properties: {} },
          async execute() {
            pi.setActiveTools(['bash', 'mcp_future']);
            return { content: [{ type: 'text', text: 'Switched.' }], details: {} };
          },
        });
        pi.registerTool({
          name: 'mcp_future', label: 'Future', description: 'Future tool schema stays intact.',
          promptSnippet: 'Future tool description must survive.', defaultActive: false,
          parameters: { type: 'object', properties: {} },
          async execute() { return { content: [{ type: 'text', text: 'ok' }], details: {} }; },
        });
      }],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const model = { id: 'offline', name: 'Offline', provider: 'openai', api: 'openai-completions',
      baseUrl: 'http://invalid.invalid', reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 1000,
    };
    ({ session } = await sdk.createAgentSession({
      cwd, agentDir: cwd, modelRuntime, model, settingsManager, resourceLoader: loader,
      sessionManager: sdk.SessionManager.inMemory(cwd), thinkingLevel: 'off',
    }));
    session.setActiveToolsByName(['read', 'switch_tools']);
    const requests = [];
    // Replace only the external model transport; the real SDK lifecycle, tool
    // execution, active-tool updates and extension hooks all run normally.
    modelRuntime.streamSimple = (_model, context) => {
      requests.push(structuredClone(context.messages));
      const first = requests.length === 1;
      const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id,
        content: first ? [{ type: 'toolCall', id: 'switch-1', name: 'switch_tools', arguments: {} }] : [{ type: 'text', text: 'done' }],
        stopReason: first ? 'toolUse' : 'stop', timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      const stream = new AssistantMessageEventStream();
      stream.push({ type: 'done', reason: message.stopReason, message });
      stream.end();
      return stream;
    };
    await session.prompt('Exercise dynamic tool activation without network.');
    assert.equal(requests.length, 2, JSON.stringify(session.messages.filter((m) => m.role === 'assistant')));
    for (const messages of requests) assert.match(getCurrentSystemPrompt(messages), /Antigravity/);
    const firstPrompt = getCurrentSystemPrompt(requests[0]);
    const secondPrompt = getCurrentSystemPrompt(requests[1]);
    assert.match(firstPrompt, /- read: View file contents/);
    assert.doesNotMatch(secondPrompt, /- read:|- switch_tools:/);
    assert.match(secondPrompt, /- bash: Run shell commands/);
    assert.match(secondPrompt, /- mcp_future: Future tool description must survive/);
    assert.deepEqual(getCurrentTools(requests[1]).map((tool) => tool.name).sort(), ['bash', 'mcp_future']);
    assert.match(getCurrentSystemPrompt(session.messages), /running inside pi/,
      'request-only projection must not rewrite stored messages');
  } finally {
    session?.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});
