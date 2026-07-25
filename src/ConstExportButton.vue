<script lang="ts">
export const CONST_EXPORT_BUTTON_DEFAULT_VARIANT = 'primary';
</script>
<script setup lang="ts">
defineProps<{
  /** The visible button label */
  label: string;
  /** Visual style */
  variant?: 'primary' | 'secondary';
}>();
</script>
<template>
  <button :class="variant">{{ label }}</button>
</template>
