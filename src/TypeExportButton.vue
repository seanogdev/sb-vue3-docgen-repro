<script lang="ts">
export type TypeExportButtonVariant = 'primary' | 'secondary' | 'ghost';
</script>
<script setup lang="ts">
defineProps<{
  /** The visible button label */
  label: string;
  /** Visual style */
  variant?: TypeExportButtonVariant;
}>();
</script>
<template>
  <button :class="variant">{{ label }}</button>
</template>
