<script setup lang="ts">
const props = defineProps<{
  modelValue: "pt" | "en";
}>();

const emit = defineEmits<{
  "update:modelValue": ["pt" | "en"];
}>();

function setLanguage(language: "pt" | "en") {
  emit("update:modelValue", language);
}
</script>

<template>
  <div class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
    <button
      type="button"
      class="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] transition"
      :class="props.modelValue === 'pt' ? 'bg-white/12 text-white' : 'text-slate-300'"
      @click="setLanguage('pt')"
    >
      PT
    </button>
    <button
      type="button"
      class="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] transition"
      :class="props.modelValue === 'en' ? 'bg-white/12 text-white' : 'text-slate-300'"
      @click="setLanguage('en')"
    >
      EN
    </button>
  </div>
</template>
