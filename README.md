# pi-clear-prompt

A user-level [Pi](https://pi.dev) extension that rewords Pi's default system prompt while Pi keeps owning dynamic tools, rules, skills, and project instructions.

The default prompt identity is presented as **Antigravity**. Every other instruction is reworded sentence by sentence with the original meaning preserved.

## What it does

- Rewrites the default preamble, recognized tool descriptions, built-in rules, and the docs section.
- Runs before **each model request**, so enabling or disabling tools mid-run (including MCP tools that connect later) reaches the next request.
- Keeps real documentation paths, package names, `PI_*` variable names, tool names, and parameter schemas unchanged.
- Keeps skills, project instructions (`AGENTS.md`), appended instructions, and the working directory intact.
- Leaves unknown tools and unknown rules untouched, so new capabilities keep their own descriptions and constraints.
- An explicit `SYSTEM.md`, `--system-prompt`, or custom profile wins; it is not rewritten, even if its text equals the stock opening.

## Install

From git:

```bash
pi install git:github.com/ping1999/pi-clear-prompt
```

From a local checkout:

```bash
pi install ./pi-clear-prompt
```

Only for one invocation, without changing settings:

```bash
pi -e git:github.com/ping1999/pi-clear-prompt
```

After installing, apply it with `/reload` in Pi, or restart.

## Scope and limits

This is a **request-time projection**. It does not rewrite stored sessions, so `session.systemPrompt`, `ctx.getSystemPrompt()`, the UI's base prompt display, and exported history may still show the original text. The model receives the rewritten version.

Notes:

- Other extensions that force a complete `systemPrompt`, set `forceSystemPrompt`, or rewrite the payload afterwards can override it. This extension does not fight those explicit overrides.
- Chat-only profiles, subagents, or launch configurations that disable extensions are unaffected.
- It does not rename the application, commands, config directories, or package names, and does not alter descriptions inside actual tool schemas.
- If a `rules` section contains multiline prose, quotes, or code blocks, the whole section is left as-is: Pi flattens guideline boundaries, so a literal example cannot be told apart from a real rule.
- The recognized stock openings are those of Pi 1.1.0 and Pi 1.5.2 (the version bundled with pi-web 0.17.0). A future upstream rewrite of the opening is safely skipped; add a mapping and re-run the tests.

## Tests

```bash
node --test test/*.test.mjs
```

The suite covers:

- Unit tests for text mapping and the conservative fallbacks.
- The real extension loader and request hooks of both installed Pi builds.
- A launched CLI that loads the extension without contacting a model.
- An SDK session that switches tools during one run and verifies the next provider request.

Tests use temporary directories and a local stand-in for the model transport. They read no credentials and call no paid model.

The default roots under test are:

- CLI: `/usr/lib/node_modules/@earendil-works/pi-coding-agent`
- pi-web SDK: `/usr/lib/node_modules/@agegr/pi-web/node_modules/@earendil-works/pi-coding-agent`

Override them with `PI_TEST_CLI_ROOT` and `PI_TEST_WEB_ROOT` for other installations.

## Package layout

```text
pi-clear-prompt/
├── package.json
├── extensions/pi-clear-prompt/
│   ├── index.ts      # extension entry
│   └── rewrite.mjs   # reword mapping and transformation
└── test/
```

## Uninstall

```bash
pi remove git:github.com/ping1999/pi-clear-prompt
```

Then `/reload` or restart.
