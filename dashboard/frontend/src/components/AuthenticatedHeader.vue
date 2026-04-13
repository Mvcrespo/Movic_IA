<script setup lang="ts">
import { computed } from "vue";
import LanguageToggle from "./LanguageToggle.vue";
import { marketingCopy } from "../marketingCopy";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";

const props = withDefaults(
  defineProps<{
    active: "dashboard" | "change-password" | "created-user";
  }>(),
  {}
);

const language = useMarketingLanguage();

const content = computed(() => marketingCopy[language.value]);
const shellCopy = computed(() =>
  language.value === "en"
    ? {
        changePassword: "Change password"
      }
    : {
        changePassword: "Trocar password"
      }
);

function actionClasses(isActive: boolean) {
  return isActive
    ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
    : "border-white/10 bg-white/5 text-slate-200";
}
</script>

<template>
  <header class="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 pb-4 pt-2 sm:px-6">
    <a class="flex items-center gap-3" href="/home" aria-label="Movic home">
      <img class="h-11 w-auto" :src="'/assets/logo-wordmark.png'" alt="Movic" />
    </a>

    <div class="flex flex-wrap items-center justify-end gap-3">
      <LanguageToggle v-model="language" />
      <a
        class="rounded-full border px-5 py-3 text-sm font-semibold transition"
        :class="actionClasses(props.active === 'dashboard')"
        href="/dashboard"
      >
        {{ content.navDashboard }}
      </a>
      <a
        class="rounded-full border px-5 py-3 text-sm font-semibold transition"
        :class="actionClasses(props.active === 'change-password')"
        href="/change-password"
      >
        {{ shellCopy.changePassword }}
      </a>
      <form method="post" action="/logout">
        <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">
          {{ content.navLogout }}
        </button>
      </form>
    </div>
  </header>
</template>
