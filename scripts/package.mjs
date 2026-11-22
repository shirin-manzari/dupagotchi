import { packager } from '@electron/packager';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const coreName = `tamogachi-core${process.platform === 'win32' ? '.exe' : ''}`;
const outputs = await packager({
  dir: root, name: 'DuPaGotchi', out: `${root}/release`, overwrite: true,
  ...(process.platform === 'darwin' ? { icon: `${root}/assets/icon.icns` } : {}),
  platform: process.platform, arch: process.arch,
  appBundleId: 'local.dupagotchi.desktop', appCategoryType: 'public.app-category.games',
  asar: true, prune: true,
  ignore: [/^\/build($|\/)/, /^\/release($|\/)/, /^\/roms($|\/)/,
    /^\/native($|\/)/, /^\/vendor($|\/)/, /^\/scripts($|\/)/, /\.md$/i, /\.(b|bin|state|tmp|log)$/i, /^\/\.git(hub)?($|\/)/],
  extraResource: [`${root}/build/${coreName}`,
    `${root}/vendor/tamalib/LICENSE`],
});
console.log(outputs.join('\n'));
