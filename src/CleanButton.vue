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
