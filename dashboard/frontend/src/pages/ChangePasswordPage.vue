<script setup lang="ts">
import { computed } from "vue";
import AuthenticatedHeader from "../components/AuthenticatedHeader.vue";
import SiteFooter from "../components/SiteFooter.vue";
import type { AppUser } from "../types";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";

const props = defineProps<{
  user: AppUser;
  errorMessage: string | null;
}>();

const language = useMarketingLanguage();

const pageCopy = computed(() =>
  language.value === "en"
    ? {
        title: "Change password",
        body: "This account is still using a temporary password. Before entering the dashboard, you need to change it.",
        currentPassword: "Current password",
        nextPassword: "New password",
        confirmPassword: "Confirm new password",
        submit: "Save password"
      }
    : {
        title: "Trocar password",
        body: "Esta conta ainda está com password temporária. Antes de entrares na dashboard, tens de a trocar.",
        currentPassword: "Password atual",
        nextPassword: "Nova password",
        confirmPassword: "Confirmar nova password",
        submit: "Guardar password"
      }
);
</script>

<template>
  <div class="relative isolate min-h-screen overflow-hidden px-4 py-6 sm:px-6">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute left-[12%] top-[-4rem] h-72 w-72 rounded-full bg-cyan-400/14 blur-[120px]"></div>
      <div class="absolute right-[6%] top-[10rem] h-80 w-80 rounded-full bg-fuchsia-500/12 blur-[140px]"></div>
      <div class="soft-grid absolute inset-0 opacity-45"></div>
    </div>

    <AuthenticatedHeader active="change-password" />

    <main class="relative z-10 mx-auto max-w-3xl">
      <section class="glass-card rounded-[2rem] p-8">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">{{ user.email }}</span>
        </div>
        <h1 class="font-display mt-8 text-4xl font-bold text-white">{{ pageCopy.title }}</h1>
        <p class="mt-4 text-base leading-8 text-slate-300">
          {{ pageCopy.body }}
        </p>
        <div v-if="errorMessage" class="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-4 text-sm font-semibold text-rose-100">
          {{ errorMessage }}
        </div>
        <form method="post" action="/change-password" class="mt-8 grid gap-5">
          <label class="grid gap-2">
            <span class="text-sm font-semibold text-slate-200">{{ pageCopy.currentPassword }}</span>
            <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="password" name="currentPassword" required />
          </label>
          <label class="grid gap-2">
            <span class="text-sm font-semibold text-slate-200">{{ pageCopy.nextPassword }}</span>
            <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="password" name="nextPassword" required />
          </label>
          <label class="grid gap-2">
            <span class="text-sm font-semibold text-slate-200">{{ pageCopy.confirmPassword }}</span>
            <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="password" name="confirmPassword" required />
          </label>
          <button class="primary-button mt-2 rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ pageCopy.submit }}</button>
        </form>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>
