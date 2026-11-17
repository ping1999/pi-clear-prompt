import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rewriteMessages } from '../extensions/pi-clear-prompt/rewrite.mjs';

const original = 'You are a coding assistant running inside pi, a coding agent harness. Help users inspect files, run commands, and modify code.';
const userText = 'pi, PI_*, /tmp/pi: leave project and user text unchanged.';
const tool = { name: 'read', description: 'Read file contents', parameters: { type: 'object' } };
const initial = () => ({
  role: 'system', content: '', timestamp: 1, toolsAdded: [tool],
  sections: {
    preamble: original,
    tools: '<tools>\n- read: Read file contents\n\nAdditional tools may be available.\n</tools>',
    rules: '<rules>\n- Use read to examine files instead of cat or sed.\n- Be concise in your responses\n</rules>',
    docs: '<docs>\nPi documentation (read only when the user asks about the harness itself, its SDK, extensions, themes, skills, or TUI):\n- Main documentation: /installed/pi/README.md\n- Additional docs: /installed/pi/docs\n- Examples: /installed/pi/examples (extensions, custom tools, SDK)\n</docs>',
    skills: `<skills>\n${userText}\n</skills>`,
    project_context: `<project_context>\n${userText}\n</project_context>`,
    addendum: `<addendum>\n${original}\n</addendum>`,
    cwd: '<cwd>\n/tmp/pi\n</cwd>',
  },
});

test('rewrites default identity and known text without changing tool schemas or contextual instructions', () => {
  const head = initial();
  const user = { role: 'user', content: userText };
  const input = [head, user];
  const snapshot = structuredClone(input);
  const output = rewriteMessages(input);
  assert.match(output[0].sections.preamble, /Antigravity/);
  assert.doesNotMatch(output[0].sections.tools, /Read file contents|Additional tools may be available/);
  assert.doesNotMatch(output[0].sections.rules, /Use read to examine|Be concise/);
  assert.match(output[0].sections.docs, /Antigravity documentation/);
  for (const path of ['/installed/pi/README.md', '/installed/pi/docs', '/installed/pi/examples']) {
    assert.ok(output[0].sections.docs.includes(path));
  }
  for (const key of ['skills', 'project_context', 'addendum', 'cwd']) {
    assert.equal(output[0].sections[key], head.sections[key]);
  }
  assert.strictEqual(output[0].toolsAdded, head.toolsAdded);
  assert.strictEqual(output[1], user);
  assert.deepEqual(input, snapshot, 'must not mutate stored transcript');
  assert.deepEqual(rewriteMessages(output), output, 'rewriting must be idempotent');
});

test('rewrites dynamic section patches without freezing the tool list, and keeps unknown instructions', () => {
  const patch = {
    role: 'system', content: '', timestamp: 2,
    toolsAdded: [{ name: 'mcp_demo', description: 'New upstream description' }],
    toolsRemoved: [{ name: 'read' }],
    sections: {
      tools: '<tools>\n- bash: Execute bash commands (ls, grep, find, etc.)\n- mcp_demo: New upstream description\n\nAdditional tools may be available.\n</tools>',
      rules: '<rules>\n- You can inspect PI_* environment variables for current model and session details.\n- Keep this new upstream restriction exactly.\n</rules>',
      skills: null,
    },
  };
  const output = rewriteMessages([initial(), patch]);
  assert.doesNotMatch(output[1].sections.tools, /Execute bash commands/);
  assert.match(output[1].sections.tools, /- mcp_demo: New upstream description/);
  assert.doesNotMatch(output[1].sections.tools, /- read:/);
  assert.match(output[1].sections.rules, /PI_\*/);
  assert.doesNotMatch(output[1].sections.rules, /You can inspect/);
  assert.match(output[1].sections.rules, /Keep this new upstream restriction exactly/);
  assert.equal(output[1].sections.skills, null);
  assert.strictEqual(output[1].toolsRemoved, patch.toolsRemoved);
});

test('does not overwrite custom system prompts or unrelated messages', () => {
  const custom = initial();
  custom.sections.preamble = 'My custom pi identity.';
  const input = [custom, { role: 'assistant', content: original }, { role: 'toolResult', content: original }];
  assert.deepEqual(rewriteMessages(input), input);
  const changed = { role: 'system', content: '', sections: { preamble: 'User-selected profile', tools: initial().sections.tools } };
  assert.equal(rewriteMessages([initial(), changed])[1].sections.tools, changed.sections.tools);
});

test('preserves unknown descriptions even when a known tool name is reused', () => {
  const head = initial();
  head.sections.tools = '<tools>\n- read: Read only from the authorized sandbox.\n</tools>';
  assert.equal(rewriteMessages([head])[0].sections.tools, head.sections.tools);
});

test('handles a legacy flat default prompt while leaving its appended context untouched', () => {
  const sections = initial().sections;
  const prompt = `${original}\n\n${sections.tools}\n\n${sections.rules}\n\n${sections.docs}\n\n${sections.addendum}\n\n${sections.project_context}`;
  const input = [{ role: 'system', content: prompt, timestamp: 1, toolsAdded: [tool] }];
  const output = rewriteMessages(input);
  assert.match(output[0].content, /^You operate.*Antigravity/);
  assert.ok(output[0].content.endsWith(`${sections.addendum}\n\n${sections.project_context}`));
  assert.strictEqual(output[0].toolsAdded, input[0].toolsAdded);
  assert.deepEqual(rewriteMessages(output), output);
  const patch = { role: 'system', content: '', sections: { tools: sections.tools } };
  assert.match(rewriteMessages([...input, patch])[1].sections.tools, /- read: View/);
});

test('appended system content does not cancel rewrites of subsequent dynamic patches', () => {
  for (const content of ['Answer in Chinese.', [{ type: 'text', text: 'Answer in Chinese.' }]]) {
    const addition = { role: 'system', content, timestamp: 2 };
    const patch = { role: 'system', content: '', sections: { tools: initial().sections.tools } };
    const output = rewriteMessages([initial(), addition, patch]);
    assert.match(output[2].sections.tools, /- read: View/);
    assert.deepEqual(output[1], addition);
  }
});

test('preserves unknown multiline rules containing quoted built-in wording', () => {
  const head = initial();
  head.sections.rules = '<rules>\n- For policy_check, pass the following policy verbatim:\n```text\n- Be concise in your responses\n```\n- Show file paths clearly when working with files\n</rules>';
  assert.equal(rewriteMessages([head])[0].sections.rules, head.sections.rules);
});

test('keeps an empty tool set empty rather than adding tools from the rewrite dictionary', () => {
  const head = initial();
  head.sections.tools = '<tools>\n(none)\n\nAdditional tools may be available.\n</tools>';
  const output = rewriteMessages([head]);
  assert.match(output[0].sections.tools, /\(none\)/);
  assert.doesNotMatch(output[0].sections.tools, /- read:|- Agent:/);
});
