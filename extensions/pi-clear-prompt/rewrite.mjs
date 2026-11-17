// Exact, section-scoped rewrites. Unknown upstream text intentionally passes through.
// Never replace identifiers, paths, schemas, skills, or project instructions globally.
const ORIGINAL_PREAMBLE = 'You are a coding assistant running inside pi, a coding agent harness. Help users inspect files, run commands, and modify code.';
const LEGACY_PREAMBLE = 'You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.';
const PREAMBLE = 'You operate as a programming assistant within Antigravity, an environment for coding agents. Assist with file inspection, command execution, and code changes.';
const LEGACY_REWRITE = 'You operate as an expert programming assistant within Antigravity, an environment for coding agents. Assist with file inspection, command execution, code edits, and new file creation.';
const PREAMBLES = new Map([[ORIGINAL_PREAMBLE, PREAMBLE], [LEGACY_PREAMBLE, LEGACY_REWRITE]]);
const REWRITTEN_PREAMBLES = new Set(PREAMBLES.values());

const TOOL_LINES = new Map([
  ['- read: Read file contents', '- read: View file contents'],
  ['- bash: Execute bash commands (ls, grep, find, etc.)', '- bash: Run shell commands such as ls or grep or find'],
  ['- powershell: Execute PowerShell commands', '- powershell: Run commands in PowerShell'],
  ['- edit: Make precise file edits with exact text replacement, including multiple disjoint edits in one call', '- edit: Apply exact-match replacements to one file; multiple separate changes can share a call'],
  ['- write: Create or overwrite files', '- write: Save a new file or replace an existing file entirely'],
  ['- mcp_status: Inspect configured MCP servers, their connection state, discovered tools, and authentication status.', '- mcp_status: Check configured MCP servers for connectivity plus tool discovery and authentication details'],
  ['- mcp_connect: Connect or reconnect to a configured MCP server by name and register its tools.', '- mcp_connect: Establish or restore a named MCP server connection and expose its tools'],
  ['- mcp_list_resources: Discover read-only MCP resources (documents, schemas, data streams) and URI templates, optionally for one server.', '- mcp_list_resources: Find read-only MCP resources and URI templates across connected servers or within a selected server; resources may include documents or schemas or data streams'],
  ['- mcp_read_resource: Read an MCP resource document or data stream by its URI from a connected server.', '- mcp_read_resource: Retrieve a document or data stream by URI from a connected MCP server'],
  ['- Agent: Delegate a focused task to an inspectable subagent session', '- Agent: Assign a bounded task to a subagent with an inspectable session'],
  ['- grep: Search file contents for patterns (respects .gitignore)', '- grep: Find matching file content while honoring .gitignore'],
  ['- find: Find files by glob pattern (respects .gitignore)', '- find: Locate files using glob patterns while honoring .gitignore'],
  ['- ls: List directory contents', '- ls: View directory entries'],
  ['Additional tools may be available.', 'Other tools may also be accessible.'],
  ['In addition to the tools above, you may have access to other custom tools depending on the project.', 'A project may provide further custom tools beyond those listed here.'],
]);

const RULE_LINES = new Map([
  ['Use read to examine files instead of cat or sed.', 'Inspect files with read rather than cat or sed.'],
  ['You can inspect PI_* environment variables for current model and session details.', 'Inspect PI_* environment variables when you need active model or session information.'],
  ['Use edit for targeted changes. Batch changes to one file in a single call.', 'Apply localized modifications with edit; combine changes to the same file in one call.'],
  ['Each edits[].oldText must exactly and uniquely match the original file. Keep matches short and non-overlapping; merge nearby changes without including large unchanged regions.', 'Ensure every edits[].oldText matches exactly one region in the original file. Use brief matches that do not overlap; consolidate adjacent edits without copying large unchanged sections.'],
  ['Use edit for precise changes (edits[].oldText must match exactly)', 'Apply precise modifications with edit; edits[].oldText requires an exact match.'],
  ['When changing multiple separate locations in one file, use one edit call with multiple entries in edits[] instead of multiple edit calls', 'Combine separate changes within the same file into multiple edits[] entries in a single edit call.'],
  ['Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.', 'Match each edits[].oldText against the unchanged source rather than the result of preceding replacements. Keep edit regions disjoint and non-nested; combine adjacent changes.'],
  ['Keep edits[].oldText as small as possible while still being unique in the file. Do not pad with large unchanged regions.', 'Choose the shortest unique edits[].oldText match; exclude large stretches of untouched content.'],
  ['Use write only for new files or complete rewrites.', 'Reserve write for creating files or replacing their full contents.'],
  ['Use Agent for a focused task that benefits from an isolated context.', 'Delegate to Agent when a focused task benefits from a separate context.'],
  ['Use multiple background Agent calls in the same response for independent parallel work.', 'Launch independent tasks through multiple background Agent calls within one response.'],
  ['Do not duplicate work already delegated to a running subagent.', 'Avoid repeating tasks already assigned to an active subagent.'],
  ['Be concise in your responses', 'Keep replies brief.'],
  ['Show file paths clearly when working with files', 'Clearly identify file paths whenever handling files.'],
  ['Use bash for file operations like ls, rg, find', 'Perform file operations through bash with commands such as ls or rg or find.'],
  ['Use PowerShell for file operations like listing, searching, and finding files', 'Perform directory listing and content searches and file discovery through PowerShell.'],
  ['Use bash or PowerShell for file operations like listing, searching, and finding files', 'Perform directory listing and content searches and file discovery through bash or PowerShell.'],
]);

const DOC_TOPICS = [
  ['Extension development', 'docs/extensions.md and examples/extensions/'],
  ['Theme customization', 'docs/themes.md'],
  ['Skill usage', 'docs/skills.md'],
  ['Reusable prompt templates', 'docs/prompt-templates.md'],
  ['TUI component development', 'docs/tui.md'],
  ['Keyboard binding configuration', 'docs/keybindings.md'],
  ['SDK integration work', 'docs/sdk.md'],
  ['Custom provider setup', 'docs/custom-provider.md'],
  ['Model registration', 'docs/models.md'],
  ['Package management', 'docs/packages.md'],
  ['Environment variable configuration', 'docs/environment-variables.md'],
  ['MCP server integration', 'docs/mcp.md'],
  ['Codemode scripting and non-LLM models including classifiers and image models', 'docs/codemode.md'],
];
const DOC_LINES = new Map([
  ['Pi documentation (read only when the user asks about the harness itself, its SDK, extensions, themes, skills, or TUI):', 'Consult Antigravity documentation only for questions about the harness or its SDK or extensions or themes or skills or TUI:'],
  ['- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory', '- Resolve documentation references beginning with docs/... relative to the supplementary documentation directory; resolve examples/... relative to the sample implementations directory. Neither is relative to the working directory.'],
  ['- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), packages (docs/packages.md), environment variables (docs/environment-variables.md), MCP servers (docs/mcp.md), codemode scripts and non-LLM models such as classifiers and image models (docs/codemode.md)', '- Use these references for the corresponding topics:\n' + DOC_TOPICS.map(([topic, path]) => `  - ${topic} → ${path}`).join('\n')],
  ['- Before implementing harness changes, read the relevant docs and examples in full, following related cross-references.', '- Read the applicable documentation and examples completely before changing the harness; follow relevant cross-references as well.'],
]);

// Older CLI releases use a different heading, package label, and two doc rules.
DOC_LINES.set('Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):', DOC_LINES.get('Pi documentation (read only when the user asks about the harness itself, its SDK, extensions, themes, skills, or TUI):'));
const topicLine = [...DOC_LINES.keys()].find((line) => line.startsWith('- When asked about:'));
DOC_LINES.set(topicLine.replace('packages (docs/packages.md)', 'pi packages (docs/packages.md)'), DOC_LINES.get(topicLine));
DOC_LINES.set('- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing', '- Before implementing Antigravity-related changes, study its documentation and examples and follow Markdown cross-references.');
DOC_LINES.set('- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)', '- Read Antigravity Markdown documents in full and consult their linked references; tui.md covers the TUI API.');

function rewriteSection(name, text) {
  // Pi flattens guideline boundaries. If a section has multiline prose/quotes/code,
  // we cannot safely distinguish a real bullet from a literal example: leave it alone.
  if (name === 'rules' && text.split('\n').some((line) =>
    line !== '<rules>' && line !== '</rules>' && !line.startsWith('- '))) return text;
  return text.split('\n').map((line) => {
    if (name === 'tools') return TOOL_LINES.get(line) ?? line;
    if (name === 'rules') {
      const replacement = line.startsWith('- ') ? RULE_LINES.get(line.slice(2)) : undefined;
      return replacement === undefined ? line : `- ${replacement}`;
    }
    if (name === 'docs') {
      if (DOC_LINES.has(line)) return DOC_LINES.get(line);
      // Change only labels: retain the paths supplied by the running Pi installation.
      if (line.startsWith('- Main documentation: ')) return line.replace('- Main documentation: ', '- Primary guide: ');
      if (line.startsWith('- Additional docs: ')) return line.replace('- Additional docs: ', '- Supplementary documentation: ');
      const examples = /^- Examples: (.+) \(extensions, custom tools, SDK\)$/.exec(line);
      if (examples) return `- Sample implementations for extensions and custom tools and SDK usage: ${examples[1]}`;
    }
    return line;
  }).join('\n');
}

// Legacy flat messages: match only the known contiguous default prefix. Appended
// instructions may themselves contain XML-looking text; never search/replace there.
function rewriteFlatPrompt(text) {
  const original = [...PREAMBLES.keys()].find((preamble) => text.startsWith(preamble + '\n\n'));
  if (!original) return text;
  const prefix = /^(<tools>\n[\s\S]*?\n<\/tools>)\n\n(<rules>\n[\s\S]*?\n<\/rules>)\n\n(<docs>\n[\s\S]*?\n<\/docs>)/.exec(text.slice(original.length + 2));
  if (!prefix) return text;
  return PREAMBLES.get(original) + '\n\n' + ['tools', 'rules', 'docs'].map((name, i) => rewriteSection(name, prefix[i + 1])).join('\n\n') + text.slice(original.length + 2 + prefix[0].length);
}

/** Rewrite request copies, including mid-conversation section patches; never touch tools. */
export function rewriteMessages(messages) {
  let defaultPrompt = false;
  return messages.map((message) => {
    if (message.role !== 'system') return message;
    const sections = message.sections;
    // Mid-conversation content appends instructions; it does not reset sections.
    if (typeof message.content === 'string' && message.content.length > 0) {
      const content = rewriteFlatPrompt(message.content);
      if (content !== message.content) {
        defaultPrompt = true;
        return { ...message, content };
      }
    }
    if (!sections) return message;
    if (Object.hasOwn(sections, 'preamble')) {
      defaultPrompt = PREAMBLES.has(sections.preamble) || REWRITTEN_PREAMBLES.has(sections.preamble);
    }
    if (!defaultPrompt) return message;
    let rewritten;
    for (const name of ['preamble', 'tools', 'rules', 'docs']) {
      const text = sections[name];
      if (typeof text !== 'string') continue; // Preserve section deletion patches (null).
      const next = name === 'preamble' ? PREAMBLES.get(text) ?? text : rewriteSection(name, text);
      if (next !== text) {
        rewritten ??= { ...sections };
        rewritten[name] = next;
      }
    }
    return rewritten ? { ...message, sections: rewritten } : message;
  });
}
