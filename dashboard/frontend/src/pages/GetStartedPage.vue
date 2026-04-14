<script setup lang="ts">
import { computed, ref } from "vue";
import LanguageToggle from "../components/LanguageToggle.vue";
import SiteFooter from "../components/SiteFooter.vue";
import { marketingCopy } from "../marketingCopy";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";

const props = defineProps<{
  contactEmail: string;
}>();

const language = useMarketingLanguage();
const name = ref("");
const email = ref("");
const organization = ref("");
const goal = ref("");
const requestFeedback = ref("");

const content = computed(() => marketingCopy[language.value]);

const subject = computed(() => {
  const seed = organization.value || name.value;
  return seed
    ? `${content.value.getStarted.email.subjectPrefix}${seed}`
    : content.value.getStarted.email.subjectDefault;
});

const body = computed(() =>
  [
    content.value.getStarted.email.greeting,
    "",
    content.value.getStarted.email.intro,
    "",
    `${content.value.getStarted.email.labels.name}: ${name.value || "-"}`,
    `${content.value.getStarted.email.labels.email}: ${email.value || "-"}`,
    `${content.value.getStarted.email.labels.organization}: ${organization.value || "-"}`,
    `${content.value.getStarted.email.labels.goal}: ${goal.value || "-"}`,
    "",
    content.value.getStarted.email.closing
  ].join("\n")
);

const mailtoLink = computed(
  () =>
    `mailto:${props.contactEmail}?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`
);

const isReady = computed(
  () =>
    name.value.trim().length > 1 &&
    email.value.trim().length > 4 &&
    goal.value.trim().length > 12
);

function submitRequest() {
  if (!isReady.value) {
    return;
  }

  requestFeedback.value = content.value.getStarted.success;
  window.location.href = mailtoLink.value;
}
</script>

<template>
  <div class="relative isolate min-h-screen overflow-hidden">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute left-[8%] top-[-4rem] h-72 w-72 rounded-full bg-cyan-400/16 blur-[120px]"></div>
      <div class="absolute right-[8%] top-[15rem] h-80 w-80 rounded-full bg-fuchsia-500/14 blur-[130px]"></div>
      <div class="soft-grid absolute inset-0 opacity-45"></div>
    </div>

    <header class="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pb-4 pt-6 sm:px-8">
      <a class="flex items-center gap-3" href="/home">
        <img class="h-11 w-auto" :src="'/assets/logo-wordmark.png'" alt="Movic" />
      </a>
      <div class="flex items-center gap-3">
        <LanguageToggle v-model="language" />
        <a class="secondary-button hidden rounded-full px-5 py-3 text-sm font-semibold sm:inline-flex" href="/home">{{ content.navHome }}</a>
        <a class="primary-button rounded-full px-5 py-3 text-sm font-semibold" href="/login">{{ content.navLogin }}</a>
      </div>
    </header>

    <main class="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 sm:px-8">
      <section class="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <aside class="grid gap-6">
          <article class="glass-card rounded-[2rem] p-7 panel-reveal">
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ content.getStarted.eyebrow }}
            </span>
            <h1 class="font-display mt-5 text-4xl font-bold leading-tight text-white sm:text-5xl">
              {{ content.getStarted.title }}
            </h1>
            <p class="mt-5 text-base leading-8 text-slate-300">{{ content.getStarted.body }}</p>
          </article>

          <article class="glass-card rounded-[2rem] p-7 panel-reveal">
            <div class="grid gap-4">
              <article
                v-for="(step, index) in content.getStarted.steps"
                :key="step"
                class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5"
              >
                <h2 class="text-lg font-semibold text-white">{{ index + 1 }}. {{ step }}</h2>
              </article>
            </div>
          </article>

          <article class="glass-card rounded-[2rem] p-7 panel-reveal">
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ content.getStarted.noteTitle }}
            </span>
            <p class="mt-5 text-sm leading-7 text-slate-300">{{ content.getStarted.noteBody }}</p>
          </article>
        </aside>

        <div class="grid gap-6">
          <article class="glass-card rounded-[2rem] p-7 panel-reveal">
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ content.getStarted.formTitle }}
            </span>
            <p class="mt-5 text-sm leading-7 text-slate-300">{{ content.getStarted.formBody }}</p>

            <form class="mt-8 grid gap-5" @submit.prevent="submitRequest">
              <div class="grid gap-5 md:grid-cols-2">
                <label class="grid gap-2">
                  <span class="text-sm font-semibold text-slate-200">{{ content.getStarted.fields.name }}</span>
                  <input
                    v-model="name"
                    required
                    class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100"
                    :placeholder="content.getStarted.placeholders.name"
                  />
                </label>
                <label class="grid gap-2">
                  <span class="text-sm font-semibold text-slate-200">{{ content.getStarted.fields.email }}</span>
                  <input
                    v-model="email"
                    required
                    type="email"
                    class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100"
                    :placeholder="content.getStarted.placeholders.email"
                  />
                </label>
              </div>

              <label class="grid gap-2">
                <span class="text-sm font-semibold text-slate-200">{{ content.getStarted.fields.organization }}</span>
                <input
                  v-model="organization"
                  class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100"
                  :placeholder="content.getStarted.placeholders.organization"
                />
              </label>

              <label class="grid gap-2">
                <span class="text-sm font-semibold text-slate-200">{{ content.getStarted.fields.goal }}</span>
                <textarea
                  v-model="goal"
                  required
                  rows="6"
                  class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100"
                  :placeholder="content.getStarted.placeholders.goal"
                ></textarea>
              </label>

              <div class="rounded-[1.5rem] border border-cyan-400/14 bg-cyan-400/8 px-4 py-4 text-sm leading-7 text-cyan-50">
                {{ content.getStarted.submitHint }}
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <button
                  class="primary-button rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55"
                  type="submit"
                  :disabled="!isReady"
                >
                  {{ content.getStarted.submit }}
                </button>
              </div>

              <p class="min-h-[1.5rem] text-sm font-semibold text-cyan-100">{{ requestFeedback }}</p>
            </form>
          </article>

          <article class="glass-card rounded-[2rem] p-7 panel-reveal">
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ content.getStarted.reviewTitle }}
            </span>
            <p class="mt-5 text-sm leading-7 text-slate-300">{{ content.getStarted.reviewBody }}</p>
          </article>
        </div>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>
