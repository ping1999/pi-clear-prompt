import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../extensions/pi-clear-prompt/index.ts', import.meta.url));
// Set these after a nonstandard installation or when testing a newer host.
const hosts = [
  ['CLI', process.env.PI_TEST_CLI_ROOT ?? '/usr/lib/node_modules/@earendil-works/pi-coding-agent'],
  ['pi-web SDK', process.env.PI_TEST_WEB_ROOT ?? '/usr/lib/node_modules/@agegr/pi-web/node_modules/@earendil-works/pi-coding-agent'],
];

for (const [name, root] of hosts) {
  test(`${name}: actual extension loader + request hooks preserve live tool deltas`, async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pi-clear-prompt-test-'));
    try {
      const { ExtensionRunner } = await import(`${root}/dist/core/extensions/runner.js`);
      const { SessionManager } = await import(`${root}/dist/core/session-manager.js`);
      const { createEventBus } = await import(`${root}/dist/core/event-bus.js`);
      const { loadExtensions } = await import(`${root}/dist/core/extensions/loader.js`);
      const { buildSystemPromptSections, diffSystemPromptSections } = await import(`${root}/dist/core/system-prompt.js`);
      const loaded = await loadExtensions([entry], cwd, createEventBus());
      assert.deepEqual(loaded.errors, [], 'extension must load with the actual host loader');
      const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, cwd, SessionManager.inMemory(cwd), undefined);
      const errors = [];
      runner.onError((error) => errors.push(error));
      const snippets = {};
      const guidelines = {};
      for (const toolName of ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']) {
        const m = await import(`${root}/dist/core/tools/${toolName}.js`);
        const contribution = m[`${toolName}ToolSystemPromptContribution`];
        snippets[toolName] = contribution.snippet;
        guidelines[toolName] = contribution.guidelines ?? [];
      }
      const options = {
        cwd,
        selectedTools: ['read', 'edit'],
        toolSnippets: snippets,
        toolGuidelines: guidelines,
        contextFiles: [{ path: '/project/AGENTS.md', content: 'Keep pi and PI_* literal here.' }],
        skills: [{ name: 'demo', description: 'pi skill', filePath: '/skills/pi/SKILL.md', baseDir: '/skills/pi', source: 'user', disableModelInvocation: false }],
      };
      const sections = buildSystemPromptSections(options);
      const readTool = { name: 'read', description: 'unchanged actual tool schema', parameters: { type: 'object' } };
      const head = { role: 'system', content: '', sections, toolsAdded: [readTool], timestamp: 1 };
      const user = { role: 'user', content: [{ type: 'text', text: 'test' }], timestamp: 2 };
      const first = await runner.emitContext([head, user]);
      assert.match(first[0].sections.preamble, /Antigravity/);
      assert.doesNotMatch(first[0].sections.tools, /Read file contents|Make precise file edits/);
      for (const rule of guidelines.edit) {
        assert.ok(!first[0].sections.rules.includes(rule), `edit guideline must be reworded: ${rule}`);
      }
      assert.doesNotMatch(first[0].sections.docs, /Pi documentation|When working on pi topics|Always read pi \.md/);
      assert.deepEqual(first[0].toolsAdded, [readTool]);
      assert.equal(first[0].sections.skills, sections.skills);
      assert.equal(first[0].sections.project_context, sections.project_context);
      assert.ok(first[0].sections.docs.includes(root), 'docs must retain the host installation path');

      // A new tool connects between requests in the same run. No second
      // before_agent_start event is emitted here: only request-time hooks run.
      const nextSections = buildSystemPromptSections({
        ...options, selectedTools: ['bash', 'mcp_new'],
        toolSnippets: { ...snippets, mcp_new: 'Unknown future tool, keep its description.' },
        toolGuidelines: { ...guidelines, mcp_new: ['Never bypass this new restriction.'] },
      });
      const patch = { role: 'system', content: '', timestamp: 3,
        sections: diffSystemPromptSections(sections, nextSections),
        toolsAdded: [{ name: 'mcp_new', description: 'actual schema unchanged', parameters: {} }],
        toolsRemoved: [{ name: 'read' }],
      };
      const second = await runner.emitContext([head, user, patch]);
      assert.match(second[2].sections.tools, /- bash: Run/);
      assert.match(second[2].sections.tools, /Unknown future tool, keep its description/);
      assert.doesNotMatch(second[2].sections.tools, /- read:|- edit:/);
      assert.match(second[2].sections.rules, /PI_\*/);
      assert.match(second[2].sections.rules, /Never bypass this new restriction/);
      assert.doesNotMatch(second[2].sections.rules, /You can inspect/);
      assert.deepEqual(second[2].toolsAdded, patch.toolsAdded);
      assert.deepEqual(second[2].toolsRemoved, patch.toolsRemoved);
      assert.equal(head.sections.preamble, sections.preamble, 'stored source is untouched');
      assert.deepEqual(errors, []);

      // An explicitly selected SYSTEM.md/profile must win over branding.
      const custom = { role: 'system', content: '', timestamp: 4,
        sections: buildSystemPromptSections({ ...options, customPrompt: 'Custom profile wins.' }),
      };
      assert.deepEqual(await runner.emitContext([custom, user]), [custom, user]);
      // Explicit customPrompt wins even if the user chose the stock opening text.
      const customOptions = { ...options, customPrompt: sections.preamble };
      const beginRun = (options) => runner.emitBeforeAgentStart.length === 3
        ? runner.emitBeforeAgentStart('test', undefined, options)
        : runner.emitBeforeAgentStart({ messageType: 'user', prompt: 'test' }, options);
      await beginRun(customOptions);
      const sameOpening = { ...custom, sections: buildSystemPromptSections(customOptions) };
      assert.deepEqual(await runner.emitContext([sameOpening, user]), [sameOpening, user]);
      // A later run with the default prompt must re-enable the rewrite.
      await beginRun(options);
      assert.match((await runner.emitContext([head, user]))[0].sections.preamble, /Antigravity/);
      runner.invalidate();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
}
