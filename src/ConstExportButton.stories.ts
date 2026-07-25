import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ConstExportButton from './ConstExportButton.vue';

const meta: Meta<typeof ConstExportButton> = { component: ConstExportButton, tags: ['autodocs'] };
export default meta;

export const Default: StoryObj<typeof ConstExportButton> = { args: { label: 'Click me' } };
