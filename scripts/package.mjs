import { packager } from '@electron/packager';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const outputs = await packager({
  dir: root, name: 'DuPaGotchi', icon: `${root}/assets/icon.icns`, out: `${root}/release`, overwrite: true,
  appBundleId: 'local.dupagotchi.desktop', appCategoryType: 'public.app-category.games',
  asar: true, prune: true,
  ignore: [/^\/build($|\/)/, /^\/release($|\/)/, /^\/roms($|\/)/,
    /^\/native($|\/)/, /^\/vendor($|\/)/, /^\/scripts($|\/)/, /\.md$/i, /\.(b|bin|state|tmp|log)$/i, /^\/\.git($|\/)/],
  extraResource: [`${root}/build/tamogachi-core`,
    `${root}/vendor/tamalib/LICENSE`],
});
console.log(outputs.join('\n'));
