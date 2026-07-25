import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.stories.ts"
  ],
  "addons": [
    "@storybook/addon-docs"
  ],
  "framework": {
    "name": "@storybook/vue3-vite",
    "options": {
      "docgen": {
        "plugin": "vue-component-meta",
        "tsconfig": "tsconfig.app.json"
      }
    }
  }
};
export default config;