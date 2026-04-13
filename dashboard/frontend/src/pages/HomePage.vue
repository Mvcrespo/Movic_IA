<script setup lang="ts">
import { computed } from "vue";
import LanguageToggle from "../components/LanguageToggle.vue";
import { marketingCopy } from "../marketingCopy";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";

const props = defineProps<{
  contactEmail: string;
  isAuthenticated: boolean;
}>();

const language = useMarketingLanguage();

const content = computed(() => marketingCopy[language.value]);
const leftFeatures = computed(() => content.value.home.features.slice(0, 2));
const rightFeatures = computed(() => content.value.home.features.slice(2));
const topPrimaryLabel = computed(() =>
  props.isAuthenticated ? content.value.navDashboard : content.value.navGetStarted
);
const topPrimaryHref = computed(() => (props.isAuthenticated ? "/dashboard" : "/get-started"));
const heroPrimaryLabel = computed(() =>
  props.isAuthenticated ? content.value.navDashboard : content.value.home.heroPrimary
);
const heroPrimaryHref = computed(() => (props.isAuthenticated ? "/dashboard" : "/get-started"));
const ctaLabel = computed(() => (props.isAuthenticated ? content.value.navDashboard : content.value.navGetStarted));
const ctaHref = computed(() => (props.isAuthenticated ? "/dashboard" : "/get-started"));
const ctaPillLabel = computed(() => (props.isAuthenticated ? content.value.navDashboard : content.value.home.ctaLabel));
const ctaTitle = computed(() =>
  props.isAuthenticated
    ? language.value === "en"
      ? "Return to your control area."
      : "Voltar para a área de controlo."
    : content.value.home.ctaTitle
);
const ctaBody = computed(() =>
  props.isAuthenticated
    ? language.value === "en"
      ? "Open the dashboard to keep managing the bot, the live chat and every connected integration."
      : "Entra na dashboard para continuares a gerir o bot, a conversa ativa e as integrações ligadas."
    : content.value.home.ctaBody
);
const ctaNote = computed(() =>
  props.isAuthenticated
    ? language.value === "en"
      ? "You can return to the public home at any time through the Movic logo."
      : "Podes voltar a esta home pública a qualquer momento através do logo da Movic."
    : content.value.home.ctaNote
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
        <template v-if="props.isAuthenticated">
          <a class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" href="/dashboard">
            {{ content.navDashboard }}
          </a>
          <form method="post" action="/logout">
            <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">
              {{ content.navLogout }}
            </button>
          </form>
        </template>
        <template v-else>
          <a class="secondary-button hidden rounded-full px-5 py-3 text-sm font-semibold sm:inline-flex" :href="topPrimaryHref">
            {{ topPrimaryLabel }}
          </a>
          <a class="primary-button rounded-full px-5 py-3 text-sm font-semibold" href="/login">
            {{ content.navLogin }}
          </a>
        </template>
      </div>
    </header>

    <main class="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 sm:px-8">
      <section class="panel-reveal text-center">
        <div class="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-slate-300">
          <span class="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.8)]"></span>
          <span>{{ content.home.eyebrow }}</span>
        </div>
        <h1 class="font-display mx-auto mt-7 max-w-5xl text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-7xl">
          {{ content.home.heroTitle }}
        </h1>
        <p class="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
          {{ content.home.heroBody }}
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a class="primary-button rounded-full px-5 py-3 text-sm font-semibold" :href="heroPrimaryHref">{{ heroPrimaryLabel }}</a>
          <a class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" href="#flow">{{ content.home.heroSecondary }}</a>
        </div>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <span
            v-for="chip in content.home.chips"
            :key="chip"
            class="neon-pill rounded-full px-4 py-2 text-sm text-slate-200"
          >
            {{ chip }}
          </span>
        </div>
      </section>

      <section class="panel-reveal mt-16">
        <div class="mx-auto max-w-4xl text-center">
          <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
            {{ content.home.coreLabel }}
          </span>
          <h2 class="font-display mt-6 text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            {{ content.home.coreTitle }}
          </h2>
          <p class="mx-auto mt-5 max-w-3xl text-base leading-8 text-slate-300">
            {{ content.home.coreBody }}
          </p>
        </div>

        <div class="mt-10 lg:hidden">
          <div class="relative flex min-h-[20rem] items-center justify-center">
            <div class="absolute h-56 w-56 rounded-full border border-cyan-300/12"></div>
            <div class="absolute h-72 w-72 rounded-full border border-white/8"></div>
            <div class="absolute h-52 w-52 rounded-full bg-cyan-400/18 blur-[90px]"></div>
            <div class="absolute h-56 w-56 rounded-full bg-fuchsia-500/16 blur-[110px]"></div>
            <img class="floating-core relative z-10 h-48 w-48 object-contain drop-shadow-[0_0_80px_rgba(96,165,250,0.4)]" :src="'/assets/icon-brain.png'" alt="Movic core" />
          </div>

          <div class="mt-8 grid gap-4 sm:grid-cols-2">
            <article
              v-for="feature in content.home.features"
              :key="feature.title"
              class="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl"
            >
              <div class="flex items-start gap-4">
                <div class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 shadow-[0_0_28px_rgba(15,23,42,0.6)]">
                  <div class="absolute inset-[3px] rounded-full bg-gradient-to-br" :class="feature.glow"></div>
                  <span class="relative text-sm font-bold text-white">{{ feature.label.slice(0, 1) }}</span>
                </div>
                <div>
                  <div class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">{{ feature.label }}</div>
                  <h3 class="mt-2 text-xl font-semibold text-white">{{ feature.title }}</h3>
                  <p class="mt-2 text-sm leading-7 text-slate-300">{{ feature.body }}</p>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div class="relative mt-14 hidden min-h-[46rem] lg:block">
          <div class="absolute inset-y-8 left-0 flex w-[19rem] flex-col justify-between">
            <article
              v-for="(feature, index) in leftFeatures"
              :key="feature.title"
              class="relative overflow-visible rounded-[1.9rem] border border-white/10 bg-slate-950/55 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl"
            >
              <div
                class="connector-line absolute -right-40 top-1/2 hidden w-40 -translate-y-1/2 lg:block"
                :class="index === 0 ? 'rotate-[10deg]' : '-rotate-[10deg]'"
              ></div>
              <div class="flex items-start gap-4">
                <div class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 shadow-[0_0_28px_rgba(15,23,42,0.6)]">
                  <div class="absolute inset-[3px] rounded-full bg-gradient-to-br" :class="feature.glow"></div>
                  <span class="relative text-sm font-bold text-white">{{ feature.label.slice(0, 1) }}</span>
                </div>
                <div>
                  <div class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">{{ feature.label }}</div>
                  <h3 class="mt-3 text-2xl font-semibold text-white">{{ feature.title }}</h3>
                  <p class="mt-3 text-sm leading-7 text-slate-300">{{ feature.body }}</p>
                </div>
              </div>
            </article>
          </div>

          <div class="absolute left-1/2 top-1/2 flex h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <div class="absolute h-[18rem] w-[18rem] rounded-full border border-cyan-300/12"></div>
            <div class="absolute h-[24rem] w-[24rem] rounded-full border border-white/8"></div>
            <div class="absolute h-[30rem] w-[30rem] rounded-full border border-white/5"></div>
            <div class="absolute h-56 w-56 rounded-full bg-cyan-400/18 blur-[100px]"></div>
            <div class="absolute h-60 w-60 rounded-full bg-fuchsia-500/18 blur-[120px]"></div>
            <div class="absolute h-px w-40 bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent"></div>
            <div class="absolute h-40 w-px bg-gradient-to-b from-transparent via-fuchsia-300/50 to-transparent"></div>
            <img
              class="floating-core relative z-10 h-72 w-72 object-contain drop-shadow-[0_0_80px_rgba(96,165,250,0.4)]"
              :src="'/assets/icon-brain.png'"
              alt="Movic core"
            />
          </div>

          <div class="absolute inset-y-8 right-0 flex w-[19rem] flex-col justify-between">
            <article
              v-for="(feature, index) in rightFeatures"
              :key="feature.title"
              class="relative overflow-visible rounded-[1.9rem] border border-white/10 bg-slate-950/55 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl"
            >
              <div
                class="connector-line absolute -left-40 top-1/2 hidden w-40 -translate-y-1/2 -scale-x-100 lg:block"
                :class="index === 0 ? '-rotate-[10deg]' : 'rotate-[10deg]'"
              ></div>
              <div class="flex items-start gap-4">
                <div class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 shadow-[0_0_28px_rgba(15,23,42,0.6)]">
                  <div class="absolute inset-[3px] rounded-full bg-gradient-to-br" :class="feature.glow"></div>
                  <span class="relative text-sm font-bold text-white">{{ feature.label.slice(0, 1) }}</span>
                </div>
                <div>
                  <div class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">{{ feature.label }}</div>
                  <h3 class="mt-3 text-2xl font-semibold text-white">{{ feature.title }}</h3>
                  <p class="mt-3 text-sm leading-7 text-slate-300">{{ feature.body }}</p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="flow" class="mt-12 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article class="glass-card rounded-[2rem] p-7 panel-reveal">
          <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-200">Flow</span>
          <h2 class="font-display mt-5 text-3xl font-bold text-white">{{ content.home.flowTitle }}</h2>
          <p class="mt-4 text-sm leading-7 text-slate-300">{{ content.home.flowBody }}</p>
          <div class="mt-8 grid gap-4">
            <article
              v-for="(step, index) in content.home.flowSteps"
              :key="step"
              class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5"
            >
              <h3 class="text-lg font-semibold text-white">{{ index + 1 }}.</h3>
              <p class="mt-2 text-sm leading-7 text-slate-300">{{ step }}</p>
            </article>
          </div>
        </article>

        <article class="glass-card rounded-[2rem] p-7 panel-reveal">
          <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-200">
            {{ ctaPillLabel }}
          </span>
          <h2 class="font-display mt-5 text-2xl font-bold text-white">{{ ctaTitle }}</h2>
          <p class="mt-4 text-base leading-8 text-slate-300">{{ ctaBody }}</p>
          <a class="primary-button mt-8 inline-flex rounded-full px-5 py-3 text-sm font-semibold" :href="ctaHref">
            {{ ctaLabel }}
          </a>
          <p class="mt-5 text-sm leading-7 text-slate-400">{{ ctaNote }}</p>
        </article>
      </section>
    </main>
  </div>
</template>
