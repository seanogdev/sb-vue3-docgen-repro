import type { Meta, StoryObj } from '@storybook/vue3-vite';
import CleanButton from './CleanButton.vue';

const meta: Meta<typeof CleanButton> = { component: CleanButton, tags: ['autodocs'] };
export default meta;

export const Default: StoryObj<typeof CleanButton> = { args: { label: 'Click me' } };
