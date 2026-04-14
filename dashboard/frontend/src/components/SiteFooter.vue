<script setup lang="ts">
import { computed } from "vue";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";

const language = useMarketingLanguage();

const copy = computed(() =>
  language.value === "en"
    ? {
        privacy: "Privacy Policy",
        terms: "Terms of Service",
        rights: "All rights reserved."
      }
    : {
        privacy: "Política de Privacidade",
        terms: "Termos de Serviço",
        rights: "Todos os direitos reservados."
      }
);
</script>

<template>
  <footer class="relative z-10 mx-auto mt-12 w-full max-w-7xl px-6 pb-8 pt-2 text-sm text-slate-400 sm:px-8">
    <div class="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div>Movic</div>
      <div class="flex items-center gap-4">
        <a class="transition hover:text-cyan-100" href="/privacy-policy">{{ copy.privacy }}</a>
        <a class="transition hover:text-cyan-100" href="/terms-of-service">{{ copy.terms }}</a>
        <span>{{ copy.rights }}</span>
      </div>
    </div>
  </footer>
</template>
