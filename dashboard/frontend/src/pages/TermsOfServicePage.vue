<script setup lang="ts">
import { computed } from "vue";
import LanguageToggle from "../components/LanguageToggle.vue";
import SiteFooter from "../components/SiteFooter.vue";
import { marketingCopy } from "../marketingCopy";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";

const props = defineProps<{
  contactEmail: string;
  isAuthenticated: boolean;
}>();

const language = useMarketingLanguage();
const content = computed(() => marketingCopy[language.value]);

const copy = computed(() =>
  language.value === "en"
    ? {
        title: "Terms of Service",
        updatedLabel: "Last updated",
        updatedAt: "April 13, 2026",
        intro:
          "These terms govern the access and use of Movic, including the dashboard, Discord linkage and optional integrations connected to the platform.",
        sections: [
          {
            title: "1. Scope of the service",
            items: [
              "Movic provides a dashboard, a Discord-based assistant flow and optional synchronization with Apple, Google and Notion.",
              "Some features may depend on external services, valid credentials and configuration approved by the platform administrator."
            ]
          },
          {
            title: "2. Access and accounts",
            items: [
              "Access may be granted only after review or onboarding validation.",
              "Each account is personal and must not be shared without authorization.",
              "The administrator may suspend, disable or remove access when misuse, security issues or operational risks are detected."
            ]
          },
          {
            title: "3. Acceptable use",
            items: [
              "You agree to use the platform only for lawful and legitimate operational purposes.",
              "You must not attempt to bypass permissions, access another user's data or disrupt the service.",
              "You remain responsible for the content, events and external accounts you connect to the platform."
            ]
          },
          {
            title: "4. Integrations and third-party services",
            items: [
              "Movic may rely on external services such as Discord, Apple, Google and Notion.",
              "The availability or behavior of these providers may affect some features of the platform.",
              "You are also subject to the terms and policies of those providers when connecting your accounts."
            ]
          },
          {
            title: "5. Availability and changes",
            items: [
              "The platform may evolve, change or temporarily limit some features during maintenance, validation or security review.",
              "Features may be added, adjusted or removed when needed to improve stability, compliance or product direction."
            ]
          },
          {
            title: "6. Liability and contact",
            items: [
              "Movic is provided on a best-effort basis for the supported use cases currently enabled in the project.",
              "The team does not guarantee uninterrupted availability or error-free operation in every environment.",
              "For service, access or legal questions, contact:"
            ]
          }
        ],
        contactFallback: "the platform administrator"
      }
    : {
        title: "Termos de Serviço",
        updatedLabel: "Última atualização",
        updatedAt: "13 de abril de 2026",
        intro:
          "Estes termos regulam o acesso e a utilização da Movic, incluindo a dashboard, a ligação ao Discord e as integrações opcionais ligadas à plataforma.",
        sections: [
          {
            title: "1. Âmbito do serviço",
            items: [
              "A Movic disponibiliza uma dashboard, um fluxo assistido via Discord e sincronização opcional com Apple, Google e Notion.",
              "Algumas funcionalidades podem depender de serviços externos, credenciais válidas e configuração aprovada pelo administrador da plataforma."
            ]
          },
          {
            title: "2. Acesso e contas",
            items: [
              "O acesso pode ser concedido apenas após análise ou validação do onboarding.",
              "Cada conta é pessoal e não deve ser partilhada sem autorização.",
              "O administrador pode suspender, desativar ou remover acessos quando forem detetados usos indevidos, riscos de segurança ou problemas operacionais."
            ]
          },
          {
            title: "3. Utilização aceitável",
            items: [
              "Concordas em usar a plataforma apenas para fins legítimos e operacionais permitidos.",
              "Não deves tentar contornar permissões, aceder a dados de outros utilizadores ou perturbar o serviço.",
              "Continuas responsável pelo conteúdo, eventos e contas externas que ligares à plataforma."
            ]
          },
          {
            title: "4. Integrações e serviços de terceiros",
            items: [
              "A Movic pode depender de serviços externos como Discord, Apple, Google e Notion.",
              "A disponibilidade ou o comportamento desses providers pode afetar algumas funcionalidades da plataforma.",
              "Ao ligares as tuas contas, também ficas sujeito aos termos e políticas desses serviços."
            ]
          },
          {
            title: "5. Disponibilidade e alterações",
            items: [
              "A plataforma pode evoluir, mudar ou limitar temporariamente algumas funcionalidades durante manutenção, validação ou revisão de segurança.",
              "As funcionalidades podem ser adicionadas, ajustadas ou removidas quando necessário para melhorar estabilidade, conformidade ou direção do produto."
            ]
          },
          {
            title: "6. Responsabilidade e contacto",
            items: [
              "A Movic é disponibilizada numa lógica de melhor esforço para os casos de uso atualmente suportados no projeto.",
              "A equipa não garante disponibilidade ininterrupta nem funcionamento sem falhas em todos os ambientes.",
              "Para questões de serviço, acesso ou enquadramento legal, contacta:"
            ]
          }
        ],
        contactFallback: "o administrador da plataforma"
      }
);

const primaryLabel = computed(() =>
  props.isAuthenticated ? content.value.navDashboard : content.value.navHome
);
const primaryHref = computed(() => (props.isAuthenticated ? "/dashboard" : "/home"));
</script>

<template>
  <div class="relative isolate min-h-screen overflow-hidden">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute left-[9%] top-[-4rem] h-72 w-72 rounded-full bg-cyan-400/16 blur-[120px]"></div>
      <div class="absolute right-[7%] top-[12rem] h-96 w-96 rounded-full bg-fuchsia-500/14 blur-[150px]"></div>
      <div class="soft-grid absolute inset-0 opacity-50"></div>
    </div>

    <header class="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pb-4 pt-6 sm:px-8">
      <a class="flex items-center gap-3" href="/home" aria-label="Movic home">
        <img class="h-11 w-auto" :src="'/assets/logo-wordmark.png'" alt="Movic" />
      </a>
      <div class="flex items-center gap-3">
        <LanguageToggle v-model="language" />
        <a class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" :href="primaryHref">
          {{ primaryLabel }}
        </a>
      </div>
    </header>

    <main class="relative z-10 mx-auto w-full max-w-5xl px-6 pb-10 sm:px-8">
      <section class="glass-card rounded-[2rem] p-7 sm:p-9">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
            {{ copy.title }}
          </span>
          <span class="text-sm text-slate-400">{{ copy.updatedLabel }}: {{ copy.updatedAt }}</span>
        </div>

        <h1 class="font-display mt-7 text-4xl font-bold text-white sm:text-5xl">
          {{ copy.title }}
        </h1>
        <p class="mt-5 text-base leading-8 text-slate-300">
          {{ copy.intro }}
        </p>

        <div class="mt-10 grid gap-6">
          <article
            v-for="section in copy.sections"
            :key="section.title"
            class="rounded-[1.75rem] border border-white/10 bg-slate-950/50 p-6"
          >
            <h2 class="text-2xl font-semibold text-white">{{ section.title }}</h2>
            <ul class="mt-4 grid gap-3 text-sm leading-7 text-slate-300">
              <li v-for="item in section.items" :key="item">{{ item }}</li>
            </ul>
            <div v-if="section.title.startsWith('6.') || section.title.startsWith('6')" class="mt-4 text-sm font-semibold text-cyan-100">
              {{ contactEmail || copy.contactFallback }}
            </div>
          </article>
        </div>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>
