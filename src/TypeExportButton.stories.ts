import type { Meta, StoryObj } from '@storybook/vue3-vite';
import TypeExportButton from './TypeExportButton.vue';

const meta: Meta<typeof TypeExportButton> = { component: TypeExportButton, tags: ['autodocs'] };
export default meta;

export const Default: StoryObj<typeof TypeExportButton> = { args: { label: 'Click me' } };
