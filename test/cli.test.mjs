import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const exec = promisify(execFile);
const entry = fileURLToPath(new URL('../extensions/pi-clear-prompt/index.ts', import.meta.url));

test('installed CLI bundle loads the user extension without contacting a model', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-clear-prompt-cli-test-'));
  try {
    const probe = join(cwd, 'probe.ts');
    await writeFile(probe, `export default function(pi) {
      pi.registerCommand('antigravity-install-probe', {
        description: 'Local installation test',
        handler: async () => { console.log('ANTIGRAVITY_CLI_LOADED'); },
      });
    }`);
    const running = exec(process.env.PI_TEST_CLI_BIN ?? '/usr/bin/pi', [
      '--mode', 'json', '--no-session', '-ne', '-ns', '-np', '-nt', '-nc',
      '-e', entry, '-e', probe, '/antigravity-install-probe',
    ], { cwd, env: { ...process.env, PI_CODING_AGENT_DIR: cwd }, timeout: 20000 });
    running.child.stdin.end(); // Pi reads piped input before processing CLI prompts.
    const { stdout, stderr } = await running;
    assert.match(stdout + stderr, /ANTIGRAVITY_CLI_LOADED/);
    assert.doesNotMatch(stdout + stderr, /Failed to load extension|Extension .* error|ERR_MODULE|SyntaxError/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
