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
        title: "Privacy Policy",
        updatedLabel: "Last updated",
        updatedAt: "April 13, 2026",
        intro:
          "This policy explains what data Movic processes, why it is used and how access, sessions and integrations are managed inside the platform.",
        sections: [
          {
            title: "1. Data we process",
            items: [
              "Account data such as name, email, role and login status.",
              "Authentication and session data needed to keep access secure.",
              "Discord identifiers and chat linkage metadata when a user connects a DM to the platform.",
              "Calendar and integration data synchronized through Apple, Google and Notion, when those integrations are enabled.",
              "Operational logs and error messages required to keep the service stable and auditable."
            ]
          },
          {
            title: "2. Why we process this data",
            items: [
              "To authenticate users and manage access to the dashboard.",
              "To associate each Discord conversation with the correct account.",
              "To create, list, update and remove events requested through the assistant.",
              "To synchronize approved data with external providers selected by each user.",
              "To improve security, monitor failures and support account administration."
            ]
          },
          {
            title: "3. Sharing and external services",
            items: [
              "Movic only sends data to the services strictly needed for the requested flow, such as Discord, Apple, Google, Notion and the local AI pipeline.",
              "Integration credentials are stored separately and protected with server-side encryption where applicable.",
              "The platform does not expose one user's integrations to another user's account."
            ]
          },
          {
            title: "4. Retention and deletion",
            items: [
              "Data is kept while the account and its configured flows remain active.",
              "When an account is deleted by an administrator, the platform removes sessions, linkage data and associated operational records according to the current cleanup flow.",
              "Some external providers may still keep data already synchronized on their side until it is removed there as well."
            ]
          },
          {
            title: "5. Security",
            items: [
              "Movic uses internal tokens, authenticated sessions and segmented storage for configuration data.",
              "Sensitive integration secrets are not exposed in the public interface.",
              "Access can be disabled by an administrator whenever necessary."
            ]
          },
          {
            title: "6. Your rights and contact",
            items: [
              "You may request clarification, correction or review of account-related data through the project contact.",
              "For privacy or access questions, contact:"
            ]
          }
        ],
        contactFallback: "the platform administrator"
      }
    : {
        title: "Política de Privacidade",
        updatedLabel: "Última atualização",
        updatedAt: "13 de abril de 2026",
        intro:
          "Esta política explica que dados a Movic processa, porque são usados e como são geridos os acessos, as sessões e as integrações dentro da plataforma.",
        sections: [
          {
            title: "1. Dados que processamos",
            items: [
              "Dados de conta como nome, email, perfil e estado de login.",
              "Dados de autenticação e de sessão necessários para manter o acesso seguro.",
              "Identificadores do Discord e metadados de ligação do chat quando um utilizador associa a DM à plataforma.",
              "Dados de calendário e de integração sincronizados através de Apple, Google e Notion, quando essas integrações estão ativas.",
              "Logs operacionais e mensagens de erro necessários para manter o serviço estável e auditável."
            ]
          },
          {
            title: "2. Porque usamos estes dados",
            items: [
              "Para autenticar utilizadores e gerir o acesso à dashboard.",
              "Para associar cada conversa Discord à conta correta.",
              "Para criar, listar, atualizar e remover eventos pedidos através do assistente.",
              "Para sincronizar dados aprovados com os providers externos escolhidos por cada utilizador.",
              "Para melhorar a segurança, monitorizar falhas e apoiar a administração da conta."
            ]
          },
          {
            title: "3. Partilha e serviços externos",
            items: [
              "A Movic só envia dados para os serviços estritamente necessários ao fluxo pedido, como Discord, Apple, Google, Notion e a pipeline local de IA.",
              "As credenciais de integração são guardadas separadamente e protegidas com cifragem no servidor quando aplicável.",
              "A plataforma não expõe as integrações de um utilizador a outra conta."
            ]
          },
          {
            title: "4. Retenção e apagamento",
            items: [
              "Os dados são mantidos enquanto a conta e os respetivos fluxos configurados estiverem ativos.",
              "Quando uma conta é apagada por um administrador, a plataforma remove sessões, dados de ligação e registos operacionais associados de acordo com o fluxo atual de limpeza.",
              "Alguns providers externos podem continuar a manter dados já sincronizados do lado deles até esses dados serem removidos também lá."
            ]
          },
          {
            title: "5. Segurança",
            items: [
              "A Movic usa tokens internos, sessões autenticadas e armazenamento segmentado para os dados de configuração.",
              "Os segredos sensíveis das integrações não são expostos na interface pública.",
              "O acesso pode ser desativado por um administrador sempre que necessário."
            ]
          },
          {
            title: "6. Direitos e contacto",
            items: [
              "Podes pedir esclarecimentos, correção ou revisão de dados associados à tua conta através do contacto do projeto.",
              "Para questões de privacidade ou acesso, contacta:"
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
