const { readFileSync, writeFileSync, renameSync, mkdirSync } = require('node:fs');
const { dirname } = require('node:path');
const ASPECT = 1312 / 1199;
const MIN_WIDTH = 260;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;
function sizeForWidth(width) {
  const value = Number.isFinite(width) ? width : DEFAULT_WIDTH;
  const rounded = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value)));
  return { width: rounded, height: Math.round(rounded / ASPECT) };
}
function readSize(file) {
  try { return sizeForWidth(JSON.parse(readFileSync(file, 'utf8'))?.width); }
  catch { return sizeForWidth(DEFAULT_WIDTH); }
}
function saveSize(file, width) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(sizeForWidth(width)));
  renameSync(`${file}.tmp`, file);
}
module.exports = { ASPECT, MIN_WIDTH, MAX_WIDTH, sizeForWidth, readSize, saveSize };
