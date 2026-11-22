import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = `tamogachi-core${process.platform === 'win32' ? '.exe' : ''}`;
const packaged = process.argv.includes('--packaged');
const bundle = join(root, 'release', `DuPaGotchi-${process.platform}-${process.arch}`);
const executable = packaged
  ? join(bundle, ...(process.platform === 'darwin' ? ['DuPaGotchi.app', 'Contents', 'Resources'] : ['resources']), name)
  : join(root, 'build', name);

test('native commands, Unicode paths, save replacement, restore, and EOF', { timeout: 20000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'dupagotchi-'));
  const rom = join(folder, 'تاما ROM.bin');
  const save = join(folder, 'پیشرفت.state');
  // Synthetic data exercises the host protocol without distributing a game ROM.
  await writeFile(rom, Buffer.alloc(12288));
  const children = [];
  function launch() {
    const child = spawn(executable, [rom, save, '--paused'], { windowsHide: true });
    children.push(child);
    let output = '', errors = '', failure;
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { errors += chunk; });
    child.on('error', error => { failure = error; });
    const closed = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
    async function waitFor(predicate) {
      const deadline = Date.now() + 5000;
      while (!predicate(output.split('\n').slice(0, -1).filter(Boolean).map(line => JSON.parse(line)))) {
        if (failure) throw failure;
        assert.equal(child.exitCode, null, errors);
        assert.ok(Date.now() < deadline, `Timed out: ${output}\n${errors}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    return { child, waitFor, closed };
  }
  try {
    const first = launch();
    await first.waitFor(messages => messages.some(m => m.type === 'ready' && !m.restored));
    first.child.stdin.write('A 1\r\nA 0\r\nP 0\n');
    await first.waitFor(messages => messages.some(m => m.type === 'frame' && !m.paused));
    first.child.stdin.write('P 1\nS\n');
    await first.waitFor(messages => messages.some(m => m.type === 'saved'));
    const snapshot = await readFile(save);
    first.child.stdin.write('S\n');
    await first.waitFor(messages => messages.filter(m => m.type === 'saved').length >= 2);
    assert.deepEqual(await readFile(save), snapshot, 'replacing an existing save must succeed');
    first.child.stdin.write('Q\n');
    assert.deepEqual(await first.closed, { code: 0, signal: null });
    const second = launch();
    await second.waitFor(messages => messages.some(m => m.type === 'ready' && m.restored));
    second.child.stdin.end();
    assert.deepEqual(await second.closed, { code: 0, signal: null });
    await writeFile(save, 'damaged');
    const third = launch();
    await third.waitFor(messages => messages.some(m => m.type === 'ready' && !m.restored));
    third.child.stdin.write('Q\n');
    assert.deepEqual(await third.closed, { code: 0, signal: null });
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await new Promise(resolve => child.once('close', resolve));
      }
    }
    await rm(folder, { recursive: true, force: true });
  }
});
