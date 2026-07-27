import type { StorybookConfig } from '@storybook/vue3-vite';
import type { Plugin } from 'vite';
import Components from 'unplugin-vue-components/vite';

/**
 * Prepends a comment to every `.vue` module and changes nothing else. Stands in for any plugin that
 * emits ahead of the module's first statement, which is enough to defeat a `^`-anchored match
 * against the module source.
 */
function prependComment(): Plugin {
  return {
    name: 'repro:prepend-comment',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('.vue')) {
        return undefined;
      }
      return { code: `/* anything at all */${code}`, map: null };
    },
  };
}

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {
      docgen: {
        plugin: 'vue-component-meta',
        tsconfig: 'tsconfig.app.json',
      },
    },
  },
  viteFinal(config) {
    // Both off by default, so the numbers in the README stay about the two original defects.
    // verify-post-order.mjs turns them on one at a time.
    config.plugins ??= [];

    // These and the docgen plugin all run in "post", so which of them sees the others' output comes
    // down to array order. An app carrying a plugin in its own Vite config gets it ahead of
    // Storybook's, which is what unshifting reproduces.
    if (process.env.PREPEND) {
      config.plugins.unshift(prependComment());
    }
    if (process.env.UNPLUGIN) {
      config.plugins.unshift(Components({ dts: false, dirs: ['src'] }));
    }

    return config;
  },
};

export default config;
