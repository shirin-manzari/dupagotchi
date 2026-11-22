import electron from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Hosted Linux runners may restrict the user namespaces Electron's sandbox needs.
// This flag is limited to the isolated CI smoke process.
const flags = process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : [];
const child = spawn(electron, [...flags, 'scripts/check-desktop.cjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
