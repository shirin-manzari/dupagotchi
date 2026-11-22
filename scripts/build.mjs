import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform === 'win32') throw new Error('The native host currently supports macOS and Linux.');
mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
const result = spawnSync(process.env.CC || 'cc', [
  '-std=c11', '-D_POSIX_C_SOURCE=200809L', '-O2', '-Wall', '-Wextra',
  '-Wno-unused-parameter', '-Ivendor', 'native/core.c',
  'vendor/tamalib/cpu.c', 'vendor/tamalib/hw.c', 'vendor/tamalib/tamalib.c',
  '-o', 'build/tamogachi-core',
], { cwd: root, stdio: 'inherit' });
if (result.error) throw new Error(`C compiler unavailable: ${result.error.message}`);
process.exit(result.status ?? 1);
