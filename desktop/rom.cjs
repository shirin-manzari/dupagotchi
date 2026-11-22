const { readFile, mkdir, writeFile, rename, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

function validateRom(bytes) {
  if (bytes.length !== 12288 || createHash('md5').update(bytes).digest('hex') !== '3fce172403c27274e59723bbb9f6d8e9') {
    throw new Error('This file is not a supported Tamagotchi P1 ROM. Choose another .b file.');
  }
}

async function storedRom(folder) {
  const path = join(folder, 'tama.b');
  try {
    validateRom(await readFile(path));
    return path;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function importRom(source, folder) {
  const bytes = await readFile(source);
  validateRom(bytes);
  await mkdir(folder, { recursive: true });
  const path = join(folder, 'tama.b');
  const temporary = `${path}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return path;
}

module.exports = { storedRom, importRom };
