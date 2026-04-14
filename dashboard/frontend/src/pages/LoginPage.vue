<script setup lang="ts">
import { computed } from "vue";
import LanguageToggle from "../components/LanguageToggle.vue";
import SiteFooter from "../components/SiteFooter.vue";
import { marketingCopy } from "../marketingCopy";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";

const props = defineProps<{
  errorCode: "invalid_credentials" | "inactive" | null;
}>();

const language = useMarketingLanguage();

const content = computed(() => marketingCopy[language.value]);
const errorMessage = computed(() => {
  if (props.errorCode === "inactive") {
    return language.value === "en"
      ? "This account is disabled. Please contact the administrator or support team."
      : "Esta conta está desativada. Pede ao administrador ou à equipa para validar a situação.";
  }

  if (props.errorCode === "invalid_credentials") {
    return language.value === "en"
      ? "Incorrect email or password."
      : "Email ou password incorretos.";
  }

  return null;
});
const pageCopy = computed(() =>
  language.value === "en"
    ? {
        title: "Login",
        body: "Sign in with your account to see only your own settings and integrations.",
        email: "Email",
        password: "Password",
        submit: "Sign in"
      }
    : {
        title: "Login",
        body: "Entra com a tua conta para veres apenas as tuas definições e integrações.",
        email: "Email",
        password: "Password",
        submit: "Entrar"
      }
);
</script>

<template>
  <div class="relative isolate min-h-screen overflow-hidden">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute left-[10%] top-[-5rem] h-72 w-72 rounded-full bg-cyan-400/18 blur-[120px]"></div>
      <div class="absolute right-[8%] top-[12rem] h-96 w-96 rounded-full bg-fuchsia-500/14 blur-[150px]"></div>
      <div class="soft-grid absolute inset-0 opacity-50"></div>
    </div>

    <header class="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pb-4 pt-6 sm:px-8">
      <a class="flex items-center gap-3" href="/home" aria-label="Movic home">
        <img class="h-11 w-auto" :src="'/assets/logo-wordmark.png'" alt="Movic" />
      </a>
      <div class="flex items-center gap-3">
        <LanguageToggle v-model="language" />
        <a class="secondary-button hidden rounded-full px-5 py-3 text-sm font-semibold sm:inline-flex" href="/get-started">
          {{ content.navGetStarted }}
        </a>
        <a class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" href="/home">
          {{ content.navHome }}
        </a>
      </div>
    </header>

    <main class="relative z-10 flex min-h-[calc(100vh-6rem)] items-center justify-center px-6 py-10">
      <section class="glass-card w-full max-w-xl rounded-[2rem] p-8">
        <h1 class="font-display text-4xl font-bold text-white">{{ pageCopy.title }}</h1>
        <p class="mt-4 text-base leading-8 text-slate-300">
          {{ pageCopy.body }}
        </p>
        <div v-if="errorMessage" class="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-4 text-sm font-semibold text-rose-100">
          {{ errorMessage }}
        </div>
        <form method="post" action="/login" class="mt-8 grid gap-5">
          <label class="grid gap-2">
            <span class="text-sm font-semibold text-slate-200">{{ pageCopy.email }}</span>
            <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="email" name="email" required />
          </label>
          <label class="grid gap-2">
            <span class="text-sm font-semibold text-slate-200">{{ pageCopy.password }}</span>
            <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="password" name="password" required />
          </label>
          <div class="flex flex-wrap gap-3">
            <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ pageCopy.submit }}</button>
            <a class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" href="/get-started">{{ content.navGetStarted }}</a>
          </div>
        </form>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>
