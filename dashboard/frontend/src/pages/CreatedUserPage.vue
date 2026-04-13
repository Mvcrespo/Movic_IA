<script setup lang="ts">
import { computed } from "vue";
import AuthenticatedHeader from "../components/AuthenticatedHeader.vue";
import type { AppUser } from "../types";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";

defineProps<{
  admin: AppUser;
  createdUser?: AppUser;
  temporaryPassword?: string;
  error?: string;
}>();

const language = useMarketingLanguage();

const pageCopy = computed(() =>
  language.value === "en"
    ? {
        successTitle: "Account created successfully",
        errorTitle: "I could not create the account",
        body: "Share these details with the user. On the first login they will be required to change the password.",
        back: "Back",
        email: "Email",
        temporaryPassword: "Temporary password"
      }
    : {
        successTitle: "Conta criada com sucesso",
        errorTitle: "Não consegui criar a conta",
        body: "Entrega estes dados à pessoa. No primeiro login ela vai ser obrigada a trocar a password.",
        back: "Voltar",
        email: "Email",
        temporaryPassword: "Password temporária"
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

    <AuthenticatedHeader active="created-user" />

    <main class="relative z-10 mx-auto max-w-2xl">
      <section class="glass-card rounded-[2rem] p-8">
        <div class="flex items-center justify-end gap-4">
          <a class="secondary-button rounded-full px-4 py-2 text-sm font-semibold" href="/dashboard?tab=users">{{ pageCopy.back }}</a>
        </div>
        <h1 class="font-display mt-8 text-4xl font-bold text-white">
          {{ error ? pageCopy.errorTitle : pageCopy.successTitle }}
        </h1>
        <div
          v-if="error"
          class="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-4 text-sm font-semibold text-rose-100"
        >
          {{ error }}
        </div>
        <div v-else class="mt-6 grid gap-4">
          <p class="text-base leading-8 text-slate-300">
            {{ pageCopy.body }}
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ pageCopy.email }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ createdUser?.email }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ pageCopy.temporaryPassword }}</div>
              <div class="mt-3 font-mono text-lg font-semibold text-cyan-100">{{ temporaryPassword }}</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
