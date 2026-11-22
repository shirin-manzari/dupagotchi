import electron from 'electron';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.argv.slice(2);
const smoke = args.includes('--smoke-test');
function launch(restored = false) {
  const child = spawn(electron, ['.', ...args, ...(restored ? ['--smoke-restored'] : [])], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit',
  });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => {
    if (smoke && !restored && code === 0) { launch(true); return; }
    if (smoke) rmSync(new URL('../build/smoke-profile', import.meta.url), { recursive: true, force: true });
    process.exitCode = code ?? 1;
  });
}
if (smoke) rmSync(new URL('../build/smoke-profile', import.meta.url), { recursive: true, force: true });
launch();
