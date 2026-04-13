<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AuthenticatedHeader from "../components/AuthenticatedHeader.vue";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";
import type {
  AppUser,
  AppleCalendarConnection,
  DashboardTab,
  DiscordBotIdentity,
  GoogleCalendarConnection,
  NotionConnection,
  RuntimeSettings
} from "../types";

const props = defineProps<{
  currentUser: AppUser;
  users: AppUser[];
  settings: RuntimeSettings | null;
  activeLinkCode: { code: string; expiresAt: string } | null;
  appleConnection: AppleCalendarConnection | null;
  googleConnection: GoogleCalendarConnection | null;
  notionConnection: NotionConnection | null;
  botIdentity: DiscordBotIdentity | null;
  activeTab: DashboardTab;
  flashMessage: string | null;
  flashTone: "success" | "error" | null;
  timezone: string;
}>();

const flashVisible = ref(Boolean(props.flashMessage));
const copyFeedback = ref("");
const countdown = ref("--:--");
const userSearch = ref("");
const isCreateUserModalOpen = ref(false);
const userPendingDeactivation = ref<AppUser | null>(null);
const userPendingDeletion = ref<AppUser | null>(null);
const language = useMarketingLanguage();

let countdownInterval: number | null = null;
let flashTimeout: number | null = null;

const canManageUsers = computed(() => props.currentUser.role === "admin");
const hasLinkedState = computed(
  () => Boolean(props.settings?.enabled && props.settings?.conversationChannelId && props.settings?.linkedDiscordUserId)
);
const botLabel = computed(() =>
  props.botIdentity?.globalName?.trim()
    ? `${props.botIdentity.globalName} (${props.botIdentity.username})`
    : props.botIdentity?.username ?? (language.value === "en" ? "Discord bot" : "Bot do Discord")
);
const installUrl = computed(() =>
  props.botIdentity?.id
    ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(props.botIdentity.id)}&scope=bot%20applications.commands&permissions=0`
    : null
);
const i18n = computed(() =>
  language.value === "en"
    ? {
        dashboardBadge: "Dashboard",
        title: "Control area",
        body: "Control the bot, the live conversation and external integrations from a clearer and stronger panel.",
        adminRole: "Administrator",
        userRole: "User",
        tabs: {
          discord: "Discord",
          apple: "Apple Calendar",
          google: "Google Calendar",
          notion: "Notion",
          users: "Users"
        },
        flashSuccess: "Update completed",
        flashError: "Could not complete",
        botState: "Bot status",
        activeConversation: "Active conversation",
        waitingForLink: "Waiting for link",
        linked: "Connected",
        waiting: "Waiting",
        readyToChat: "Ready to chat",
        noChat: "No linked chat",
        linkedBody: "This DM is already associated with the bot.",
        waitingBody: "Generate a code and send it to the bot by DM.",
        user: "User",
        chat: "Chat",
        linkedAt: "Connected at",
        unlinkChat: "Remove linked chat",
        currentCode: "Current code",
        validUntil: "Valid until",
        timeLeft: "Time left",
        noCode: "There is no active code yet.",
        generateCode: "Generate code",
        copyCode: "Copy !code",
        directCommand: "Direct command",
        copyOk: "Command copied.",
        copyError: "I could not copy automatically.",
        botLabel: "Bot",
        currentBot: "Current bot",
        botHelp:
          "To talk to the bot, you first need to install it or share a server with it. Then open the DM and send the code shown on the left.",
        addBot: "Add bot to Discord",
        openDiscord: "Open Discord",
        commands: "Commands",
        connectBotNow: "How to connect the bot now",
        commandSteps: [
          "1. Add the bot to Discord if you do not have it yet.",
          "2. Open the DM with",
          "3. Copy the code shown in the bot status.",
          "4. Send"
        ],
        syncStatus: "Synchronization status",
        active: "Active",
        optional: "Optional",
        bidirectional: "Bidirectional",
        disconnected: "Disconnected",
        account: "Account",
        mode: "Mode",
        lastSync: "Last sync",
        notSynced: "Not synced yet",
        save: "Save",
        testConnection: "Test connection",
        syncNow: "Sync now",
        disable: "Disable",
        connectGoogle: "Connect Google Calendar",
        connectNotion: "Connect Notion",
        calendarsFound: "Calendars found",
        excludedAutomatic: "Excluded from automatic routing",
        automaticDefault: "Automatic default",
        automaticFallback: "Automatic fallback",
        primary: "Primary",
        linkedApple: "Apple Calendar connected",
        unlinkedApple: "Apple Calendar not connected yet",
        linkedGoogle: "Google Calendar connected",
        unlinkedGoogle: "Google Calendar not connected yet",
        linkedNotion: "Notion connected",
        unlinkedNotion: "Notion not connected yet",
        noDefaultCalendar: "You have not chosen a default calendar yet.",
        waitingGoogle: "Waiting for Google OAuth connection.",
        waitingNotion: "Waiting for Notion OAuth connection.",
        localListApple: "Listing remains local. Apple is only used to create, edit, delete and sync external changes.",
        localListGoogle: "Listing remains local. Google is only used to create, edit, delete and sync external changes.",
        localListNotion: "Listing remains local. Notion is only used to create, edit, delete and sync external changes.",
        applePasswordHelp:
          "The dashboard cannot read this password automatically. Apple requires you to generate and copy the app-specific password yourself.",
        loadAppleCalendars: "First click Test connection to load the calendars available in the Apple account.",
        googleConnectHelp:
          "Google is connected through secure login. The dashboard opens the authorization flow and then stores the account, discovered calendars and the automatic fallback.",
        loadGoogleCalendars: "First connect the Google account to load the available calendars.",
        notionConnectHelp:
          "Notion is connected through secure login. Then the connector automatically creates a Pulse Calendar page and a Pulse Events database so everything is stored without manual setup.",
        notionDatabase: "Notion database",
        automatic: "Automatic",
        pending: "Pending",
        workspace: "Workspace",
        link: "Link",
        openNotionDb: "Open database in Notion",
        notCreatedYet: "not created yet",
        userManagement: "User management",
        userManagementBody:
          "Search accounts, control access, block logins and delete users with cleanup of related data.",
        searchPlaceholder: "Search by name, email, role or status",
        addUser: "Add user",
        existingAccounts: "Existing accounts",
        profile: "Profile",
        status: "Status",
        lastAccess: "Last access",
        actions: "Actions",
        noUsers: "I could not find users with that filter.",
        currentSession: "Current session",
        currentAccount: "Current account",
        activeStatus: "Active",
        disabledStatus: "Disabled",
        neverLoggedIn: "Never signed in",
        deactivate: "Disable",
        reactivate: "Reactivate",
        delete: "Delete",
        createUser: "Create user",
        createUserBody:
          "Create the initial account, hand over a temporary password and let the user change it on the first login.",
        name: "Name",
        createTempPassword: "Create account with temporary password",
        cancel: "Cancel",
        close: "Close",
        confirmDeactivate: "Confirm deactivation",
        access: "Access",
        deactivateBody:
          "This action will block this user's login and terminate active sessions. You can reactivate the account later.",
        confirmDeactivateButton: "Yes, disable account",
        confirmDelete: "Confirm deletion",
        permanent: "Permanent",
        deleteBody:
          "This action removes the account, ends sessions and clears related data, including links, events and related history.",
        confirmDeleteButton: "Yes, delete account"
      }
    : {
        dashboardBadge: "Dashboard",
        title: "Área de controlo",
        body: "Controla o bot, a conversa ativa e as integrações externas a partir de um painel mais claro e mais forte.",
        adminRole: "Administrador",
        userRole: "Utilizador",
        tabs: {
          discord: "Discord",
          apple: "Apple Calendar",
          google: "Google Calendar",
          notion: "Notion",
          users: "Utilizadores"
        },
        flashSuccess: "Atualização concluída",
        flashError: "Não foi possível concluir",
        botState: "Estado do bot",
        activeConversation: "Conversa ativa",
        waitingForLink: "À espera de ligação",
        linked: "Ligado",
        waiting: "À espera",
        readyToChat: "Pronto para conversar",
        noChat: "Nenhum chat ligado",
        linkedBody: "Esta DM já está associada ao bot.",
        waitingBody: "Gera um código e envia-o ao bot por DM.",
        user: "Utilizador",
        chat: "Chat",
        linkedAt: "Ligado em",
        unlinkChat: "Remover chat associado",
        currentCode: "Código atual",
        validUntil: "Válido até",
        timeLeft: "Tempo restante",
        noCode: "Ainda não existe nenhum código ativo.",
        generateCode: "Gerar código",
        copyCode: "Copiar !code",
        directCommand: "Comando direto",
        copyOk: "Comando copiado.",
        copyError: "Não consegui copiar automaticamente.",
        botLabel: "Bot",
        currentBot: "Bot atual",
        botHelp:
          "Para falar com o bot, tens primeiro de o instalar ou de ter um servidor em comum com ele. Depois abres a DM e envias o código da esquerda.",
        addBot: "Adicionar bot ao Discord",
        openDiscord: "Abrir Discord",
        commands: "Comandos",
        connectBotNow: "Como ligar o bot agora",
        commandSteps: [
          "1. Adiciona o bot ao Discord, se ainda não o tiveres.",
          "2. Abre a DM do",
          "3. Copia o código mostrado no estado do bot.",
          "4. Envia"
        ],
        syncStatus: "Estado da sincronização",
        active: "Ativa",
        optional: "Opcional",
        bidirectional: "Bidirecional",
        disconnected: "Desligada",
        account: "Conta",
        mode: "Modo",
        lastSync: "Última sync",
        notSynced: "Ainda não sincronizado",
        save: "Guardar",
        testConnection: "Testar ligação",
        syncNow: "Sincronizar agora",
        disable: "Desligar",
        connectGoogle: "Ligar Google Calendar",
        connectNotion: "Ligar Notion",
        calendarsFound: "Calendários encontrados",
        excludedAutomatic: "Excluído do routing automático",
        automaticDefault: "Por defeito automático",
        automaticFallback: "Fallback automático",
        primary: "Principal",
        linkedApple: "Apple Calendar ligado",
        unlinkedApple: "Apple Calendar ainda não ligado",
        linkedGoogle: "Google Calendar ligado",
        unlinkedGoogle: "Google Calendar ainda não ligado",
        linkedNotion: "Notion ligado",
        unlinkedNotion: "Notion ainda não ligado",
        noDefaultCalendar: "Ainda não escolheste nenhum calendário por defeito.",
        waitingGoogle: "À espera da ligação OAuth ao Google.",
        waitingNotion: "À espera da ligação OAuth ao Notion.",
        localListApple: "A listagem continua local. O Apple entra só para criar, editar, apagar e sincronizar alterações externas.",
        localListGoogle: "A listagem continua local. O Google entra só para criar, editar, apagar e sincronizar alterações externas.",
        localListNotion: "A listagem continua local. O Notion entra só para criar, editar, apagar e sincronizar alterações externas.",
        applePasswordHelp:
          "A dashboard não consegue ler esta password automaticamente. A Apple obriga a que sejas tu a gerar e copiar a app-specific password.",
        loadAppleCalendars: "Primeiro clica em Testar ligação para carregar os calendários disponíveis da conta Apple.",
        googleConnectHelp:
          "O Google é ligado por login seguro. A dashboard abre a autorização e, no fim, guarda a conta, os calendários encontrados e o fallback automático.",
        loadGoogleCalendars: "Primeiro liga a conta Google para carregar os calendários disponíveis.",
        notionConnectHelp:
          "O Notion fica ligado por login seguro. Depois o connector cria automaticamente uma página Pulse Calendar e uma base Pulse Events para guardarmos tudo sem configuração manual.",
        notionDatabase: "Base Notion",
        automatic: "Automática",
        pending: "Pendente",
        workspace: "Workspace",
        link: "Link",
        openNotionDb: "Abrir base no Notion",
        notCreatedYet: "ainda não criado",
        userManagement: "Gestão de utilizadores",
        userManagementBody:
          "Pesquisa contas, controla acessos, bloqueia logins e apaga utilizadores com limpeza dos dados associados.",
        searchPlaceholder: "Pesquisar por nome, email, role ou estado",
        addUser: "Adicionar utilizador",
        existingAccounts: "Contas existentes",
        profile: "Perfil",
        status: "Estado",
        lastAccess: "Último acesso",
        actions: "Ações",
        noUsers: "Não encontrei utilizadores com esse filtro.",
        currentSession: "Sessão atual",
        currentAccount: "Conta atual",
        activeStatus: "Ativo",
        disabledStatus: "Desativado",
        neverLoggedIn: "Nunca entrou",
        deactivate: "Desativar",
        reactivate: "Reativar",
        delete: "Apagar",
        createUser: "Criar utilizador",
        createUserBody:
          "Cria a conta inicial, entrega uma password temporária e deixa o utilizador trocar a password no primeiro login.",
        name: "Nome",
        createTempPassword: "Criar conta com password temporária",
        cancel: "Cancelar",
        close: "Fechar",
        confirmDeactivate: "Confirmar desativação",
        access: "Acesso",
        deactivateBody:
          "Esta ação vai bloquear o login deste utilizador e terminar as sessões ativas. Podes reativar a conta mais tarde.",
        confirmDeactivateButton: "Sim, desativar conta",
        confirmDelete: "Confirmar apagamento",
        permanent: "Permanente",
        deleteBody:
          "Esta ação remove a conta, termina sessões e limpa os dados associados, incluindo ligações, eventos e histórico relacionado.",
        confirmDeleteButton: "Sim, apagar conta"
      }
);
const flashTitle = computed(() =>
  props.flashTone === "error" ? i18n.value.flashError : i18n.value.flashSuccess
);
const linkedUserLabel = computed(
  () => props.settings?.linkedDiscordUsername?.trim() || props.settings?.linkedDiscordUserId || "Desconhecido"
);
const tabs = computed(() => {
  const base = [
    { key: "discord" as const, label: i18n.value.tabs.discord },
    { key: "apple" as const, label: i18n.value.tabs.apple },
    { key: "google" as const, label: i18n.value.tabs.google },
    { key: "notion" as const, label: i18n.value.tabs.notion }
  ];

  return canManageUsers.value ? [...base, { key: "users" as const, label: i18n.value.tabs.users }] : base;
});
const filteredUsers = computed(() => {
  const query = userSearch.value.trim().toLowerCase();
  const sorted = [...props.users].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.role !== right.role) {
      return left.role === "admin" ? -1 : 1;
    }

    const leftLabel = (left.displayName ?? left.email).toLowerCase();
    const rightLabel = (right.displayName ?? right.email).toLowerCase();
    return leftLabel.localeCompare(rightLabel);
  });

  if (!query) {
    return sorted;
  }

  return sorted.filter((user) => {
    const haystack = [
      user.displayName ?? "",
      user.email,
      user.role,
      user.role === "admin" ? "admin administrador" : "user utilizador",
      user.active ? "ativo active" : "desativado inativo inactive",
      user.mustChangePassword ? "password troca obrigatória pendente" : "password pronta login ativo"
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
});

function formatTimestamp(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(language.value === "en" ? "en-GB" : "pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: props.timezone
  }).format(new Date(value));
}

function syncModeLabel(value: string | null | undefined) {
  return value === "bidirectional" || !value ? i18n.value.bidirectional : value;
}

function isReminderCalendarName(name: string | null | undefined) {
  const normalized = (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return normalized === "lembretes" || normalized === "reminders" || normalized === "reminder";
}

function openDeactivateModal(user: AppUser) {
  userPendingDeactivation.value = user;
}

function closeDeactivateModal() {
  userPendingDeactivation.value = null;
}

function openDeleteModal(user: AppUser) {
  userPendingDeletion.value = user;
}

function closeDeleteModal() {
  userPendingDeletion.value = null;
}

function updateCountdown() {
  if (!props.activeLinkCode || hasLinkedState.value) {
    countdown.value = "--:--";
    return;
  }

  const expiresAt = new Date(props.activeLinkCode.expiresAt).getTime();
  const remainingMs = Math.max(0, expiresAt - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  countdown.value = `${minutes}:${seconds}`;
}

async function copyCommand() {
  if (!props.activeLinkCode) {
    return;
  }

  try {
    await navigator.clipboard.writeText(`!code ${props.activeLinkCode.code}`);
    copyFeedback.value = i18n.value.copyOk;
  } catch {
    copyFeedback.value = i18n.value.copyError;
  }
}

function cleanTransientParams() {
  const url = new URL(window.location.href);
  [
    "generated",
    "unlinked",
    "appleTested",
    "appleSaved",
    "appleDisabled",
    "appleSynced",
    "appleError",
    "googleLinked",
    "googleDisabled",
    "googleSynced",
    "googleError",
    "notionLinked",
    "notionDisabled",
    "notionSynced",
    "notionError",
    "usersMessage",
    "usersError",
    "passwordChanged"
  ].forEach((key) => url.searchParams.delete(key));

  const nextUrl = url.pathname + (url.search ? url.search : "") + url.hash;
  window.history.replaceState({}, "", nextUrl);
}

onMounted(() => {
  if (props.flashMessage) {
    flashTimeout = window.setTimeout(() => {
      flashVisible.value = false;
    }, 3500);
    cleanTransientParams();
  }

  if (props.activeLinkCode && !hasLinkedState.value) {
    updateCountdown();
    countdownInterval = window.setInterval(updateCountdown, 1000);
    const expiresAt = new Date(props.activeLinkCode.expiresAt).getTime();
    const delay = Math.max(1000, expiresAt - Date.now() + 1000);
    window.setTimeout(() => window.location.reload(), delay);
  }
});

onBeforeUnmount(() => {
  if (countdownInterval) {
    window.clearInterval(countdownInterval);
  }

  if (flashTimeout) {
    window.clearTimeout(flashTimeout);
  }
});
</script>

<template>
  <div class="relative isolate min-h-screen overflow-hidden px-4 py-6 sm:px-6">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute left-[12%] top-[-4rem] h-72 w-72 rounded-full bg-cyan-400/14 blur-[120px]"></div>
      <div class="absolute right-[6%] top-[10rem] h-80 w-80 rounded-full bg-fuchsia-500/12 blur-[140px]"></div>
      <div class="soft-grid absolute inset-0 opacity-45"></div>
    </div>

    <AuthenticatedHeader active="dashboard" />

    <main class="relative z-10 mx-auto max-w-7xl">
      <section class="glass-card rounded-[2rem] p-6 sm:p-8">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span class="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">
              {{ i18n.dashboardBadge }}
            </span>
            <h1 class="font-display mt-6 text-4xl font-bold text-white">{{ i18n.title }}</h1>
            <p class="mt-3 max-w-3xl text-base leading-8 text-slate-300">
              {{ i18n.body }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div class="text-sm font-semibold text-white">{{ currentUser.displayName ?? currentUser.email }}</div>
              <div class="text-xs uppercase tracking-[0.24em] text-slate-400">
                {{ currentUser.role === "admin" ? i18n.adminRole : i18n.userRole }}
              </div>
            </div>
          </div>
        </div>

        <div class="mt-8 flex flex-wrap items-center gap-4">
          <nav class="flex flex-wrap gap-3">
            <a
              v-for="tab in tabs"
              :key="tab.key"
              class="tab-button rounded-full px-4 py-2 text-sm font-semibold text-slate-200 transition"
              :class="{ 'is-active': activeTab === tab.key }"
              :href="tab.key === 'discord' ? '/dashboard' : `/dashboard?tab=${tab.key}`"
            >
              {{ tab.label }}
            </a>
          </nav>
        </div>
      </section>

      <section v-if="activeTab === 'discord'" class="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article class="glass-card rounded-[2rem] p-6">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-display text-2xl font-bold text-white">{{ i18n.botState }}</h2>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ hasLinkedState ? i18n.activeConversation : i18n.waitingForLink }}
            </span>
          </div>

          <div class="mt-6 rounded-[1.75rem] border px-5 py-5" :class="hasLinkedState ? 'border-emerald-400/18 bg-emerald-500/10' : 'border-cyan-400/18 bg-cyan-500/10'">
            <div class="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/90">
              {{ hasLinkedState ? i18n.linked : i18n.waiting }}
            </div>
            <h3 class="mt-4 text-2xl font-semibold text-white">
              {{ hasLinkedState ? i18n.readyToChat : i18n.noChat }}
            </h3>
            <p class="mt-3 text-sm leading-7 text-slate-200">
              {{ hasLinkedState ? i18n.linkedBody : i18n.waitingBody }}
            </p>
          </div>

          <div v-if="hasLinkedState" class="mt-6 grid gap-4 sm:grid-cols-2">
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.user }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ linkedUserLabel }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.chat }}</div>
              <div class="mt-3 font-mono text-lg font-semibold text-cyan-100">{{ settings?.conversationChannelId }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5 sm:col-span-2">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.linkedAt }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ formatTimestamp(settings?.linkedAt, "-") }}</div>
            </div>
            <form method="post" action="/dashboard/unlink" class="sm:col-span-2">
              <button class="secondary-button w-full rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit">
                {{ i18n.unlinkChat }}
              </button>
            </form>
          </div>

          <div v-else class="mt-6">
            <div v-if="activeLinkCode" class="rounded-[1.75rem] border border-cyan-400/16 bg-cyan-400/8 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-300">{{ i18n.currentCode }}</div>
              <div class="mt-4 font-mono text-4xl font-black tracking-[0.14em] text-cyan-100">{{ activeLinkCode.code }}</div>
              <div class="mt-4 text-sm text-slate-300">{{ i18n.validUntil }} {{ formatTimestamp(activeLinkCode.expiresAt, "-") }}</div>
              <div class="mt-2 text-sm text-slate-200">{{ i18n.timeLeft }}: <strong>{{ countdown }}</strong></div>
            </div>
            <p v-else class="mt-4 text-sm leading-7 text-slate-300">{{ i18n.noCode }}</p>
            <div class="mt-6 flex flex-wrap gap-3">
              <form method="post" action="/dashboard/generate-code">
                <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.generateCode }}</button>
              </form>
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" type="button" @click="copyCommand">{{ i18n.copyCode }}</button>
            </div>
            <p class="mt-4 text-sm font-semibold text-cyan-100">{{ i18n.directCommand }}: <code>!code {{ activeLinkCode?.code ?? "CODIGO" }}</code></p>
            <p class="mt-2 min-h-[1.5rem] text-sm font-semibold text-cyan-100">{{ copyFeedback }}</p>
          </div>
        </article>

        <article class="glass-card rounded-[2rem] p-6">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-display text-2xl font-bold text-white">Discord</h2>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">{{ i18n.botLabel }}</span>
          </div>
          <div class="mt-6 flex items-center gap-4 rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-5">
            <img
              v-if="botIdentity?.avatarUrl"
              class="h-16 w-16 rounded-2xl border border-white/10 object-cover"
              :src="botIdentity.avatarUrl"
              alt="Avatar do bot"
            />
            <div v-else class="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl font-bold text-white">M</div>
            <div>
              <div class="text-sm text-slate-400">{{ i18n.currentBot }}</div>
              <div class="text-xl font-semibold text-white">{{ botLabel }}</div>
              <div v-if="botIdentity?.id" class="mt-2 font-mono text-sm text-cyan-100">{{ botIdentity.id }}</div>
            </div>
          </div>
          <p class="mt-6 text-sm leading-7 text-slate-300">
            {{ i18n.botHelp }}
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a v-if="installUrl" class="primary-button rounded-full px-5 py-3 text-sm font-semibold" :href="installUrl" target="_blank" rel="noreferrer">{{ i18n.addBot }}</a>
            <a class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" href="https://discord.com/channels/@me" target="_blank" rel="noreferrer">{{ i18n.openDiscord }}</a>
          </div>
          <div class="mt-8 grid gap-4 lg:grid-cols-2">
            <article class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <h3 class="text-lg font-semibold text-white">{{ i18n.commands }}</h3>
              <ul class="mt-4 grid gap-3 text-sm leading-7 text-slate-300">
                <li><code>!code CODIGO</code> liga a conversa.</li>
                <li><code>!show</code> mostra o pedido pendente.</li>
                <li><code>!cancel</code> cancela o pedido atual.</li>
                <li><code>!delete</code> ou <code>!delete 10</code> limpa mensagens do bot.</li>
              </ul>
            </article>
            <article class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <h3 class="text-lg font-semibold text-white">{{ i18n.connectBotNow }}</h3>
              <ol class="mt-4 grid gap-3 text-sm leading-7 text-slate-300">
                <li>{{ i18n.commandSteps[0] }}</li>
                <li>{{ i18n.commandSteps[1] }} <code>{{ botLabel }}</code>.</li>
                <li>{{ i18n.commandSteps[2] }}</li>
                <li>{{ i18n.commandSteps[3] }} <code>!code {{ activeLinkCode?.code ?? "CODIGO" }}</code> na DM.</li>
              </ol>
            </article>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'apple'" class="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article class="glass-card rounded-[2rem] p-6">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-display text-2xl font-bold text-white">{{ i18n.syncStatus }}</h2>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ appleConnection?.enabled ? i18n.active : i18n.optional }}
            </span>
          </div>
          <div class="mt-6 rounded-[1.75rem] border px-5 py-5" :class="appleConnection?.enabled ? 'border-emerald-400/18 bg-emerald-500/10' : 'border-cyan-400/18 bg-cyan-500/10'">
            <div class="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/90">
              {{ appleConnection?.enabled ? i18n.bidirectional : i18n.disconnected }}
            </div>
            <h3 class="mt-4 text-2xl font-semibold text-white">
              {{ appleConnection?.enabled ? i18n.linkedApple : i18n.unlinkedApple }}
            </h3>
            <p class="mt-3 text-sm leading-7 text-slate-200">
              {{ appleConnection?.defaultCalendarName ?? i18n.noDefaultCalendar }}
            </p>
          </div>
          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.account }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ appleConnection?.accountEmail ?? "Por configurar" }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.mode }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ syncModeLabel(appleConnection?.syncMode) }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5 sm:col-span-2">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.lastSync }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ formatTimestamp(appleConnection?.lastSyncAt, i18n.notSynced) }}</div>
            </div>
          </div>
          <p class="mt-6 text-sm leading-7 text-slate-300">
            {{ appleConnection?.lastError ?? i18n.localListApple }}
          </p>
        </article>

        <article class="glass-card rounded-[2rem] p-6">
          <h2 class="font-display text-2xl font-bold text-white">Apple Calendar</h2>
          <form method="post" action="/dashboard/apple/save" class="mt-6 grid gap-5">
            <label class="grid gap-2">
              <span class="text-sm font-semibold text-slate-200">Apple Account email</span>
              <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="email" name="accountEmail" :value="appleConnection?.accountEmail ?? ''" placeholder="teu-email@icloud.com" />
            </label>
            <label class="grid gap-2">
              <span class="text-sm font-semibold text-slate-200">App-specific password</span>
              <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="password" name="appSpecificPassword" :placeholder="appleConnection?.hasStoredSecret ? 'Mantida na base de dados' : 'xxxx-xxxx-xxxx-xxxx'" />
            </label>
            <input type="hidden" name="syncMode" value="bidirectional" />
            <div class="flex flex-wrap gap-3">
              <a class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" href="https://account.apple.com/" target="_blank" rel="noreferrer noopener">Abrir Apple Account</a>
              <a class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" href="https://support.apple.com/en-mide/102654" target="_blank" rel="noreferrer noopener">Guia oficial Apple</a>
            </div>
            <div class="text-sm leading-7 text-slate-300">
              {{ i18n.applePasswordHelp }}
            </div>
            <div class="flex flex-wrap gap-3">
              <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.save }}</button>
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit" formaction="/dashboard/apple/test">{{ i18n.testConnection }}</button>
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit" formaction="/dashboard/apple/sync-now">{{ i18n.syncNow }}</button>
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit" formaction="/dashboard/apple/disable">{{ i18n.disable }}</button>
            </div>
          </form>

          <article class="mt-8 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
            <div class="flex items-center justify-between gap-4">
              <h3 class="text-lg font-semibold text-white">{{ i18n.calendarsFound }}</h3>
              <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
                {{ appleConnection?.discoveredCalendars?.length ?? 0 }}
              </span>
            </div>
            <ul v-if="(appleConnection?.discoveredCalendars?.length ?? 0) > 0" class="mt-4 grid gap-4 text-sm leading-7 text-slate-300">
              <li v-for="calendar in appleConnection?.discoveredCalendars ?? []" :key="calendar.id" class="rounded-[1.25rem] border border-white/8 bg-slate-900/60 p-4">
                <div class="text-base font-semibold text-white">{{ calendar.name }}</div>
                <div class="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                  <span v-if="isReminderCalendarName(calendar.name)">{{ i18n.excludedAutomatic }}</span>
                  <span v-else-if="appleConnection?.defaultCalendarId === calendar.id">{{ i18n.automaticDefault }}</span>
                </div>
                <div v-if="calendar.timezone" class="mt-2 text-slate-400">{{ calendar.timezone }}</div>
                <div v-if="calendar.description" class="mt-2 text-slate-400">{{ calendar.description }}</div>
              </li>
            </ul>
            <p v-else class="mt-4 text-sm leading-7 text-slate-300">{{ i18n.loadAppleCalendars }}</p>
          </article>
        </article>
      </section>

      <section v-else-if="activeTab === 'google'" class="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article class="glass-card rounded-[2rem] p-6">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-display text-2xl font-bold text-white">{{ i18n.syncStatus }}</h2>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ googleConnection?.enabled ? i18n.active : i18n.optional }}
            </span>
          </div>
          <div class="mt-6 rounded-[1.75rem] border px-5 py-5" :class="googleConnection?.enabled ? 'border-emerald-400/18 bg-emerald-500/10' : 'border-cyan-400/18 bg-cyan-500/10'">
            <div class="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/90">
              {{ googleConnection?.enabled ? i18n.bidirectional : i18n.disconnected }}
            </div>
            <h3 class="mt-4 text-2xl font-semibold text-white">
              {{ googleConnection?.enabled ? i18n.linkedGoogle : i18n.unlinkedGoogle }}
            </h3>
            <p class="mt-3 text-sm leading-7 text-slate-200">
              {{ googleConnection?.defaultCalendarName ?? i18n.waitingGoogle }}
            </p>
          </div>
          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.account }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ googleConnection?.accountEmail ?? "Por configurar" }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.mode }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ syncModeLabel(googleConnection?.syncMode) }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5 sm:col-span-2">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.lastSync }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ formatTimestamp(googleConnection?.lastSyncAt, i18n.notSynced) }}</div>
            </div>
          </div>
          <p class="mt-6 text-sm leading-7 text-slate-300">
            {{ googleConnection?.lastError ?? i18n.localListGoogle }}
          </p>
        </article>

        <article class="glass-card rounded-[2rem] p-6">
          <h2 class="font-display text-2xl font-bold text-white">Google Calendar</h2>
          <p class="mt-6 text-sm leading-7 text-slate-300">
            {{ i18n.googleConnectHelp }}
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a class="primary-button rounded-full px-5 py-3 text-sm font-semibold" href="/dashboard/google/connect">{{ i18n.connectGoogle }}</a>
            <form method="post" action="/dashboard/google/sync-now">
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.syncNow }}</button>
            </form>
            <form method="post" action="/dashboard/google/disable">
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit">{{ i18n.disable }}</button>
            </form>
          </div>

          <article class="mt-8 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
            <div class="flex items-center justify-between gap-4">
              <h3 class="text-lg font-semibold text-white">{{ i18n.calendarsFound }}</h3>
              <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
                {{ googleConnection?.discoveredCalendars?.length ?? 0 }}
              </span>
            </div>
            <ul v-if="(googleConnection?.discoveredCalendars?.length ?? 0) > 0" class="mt-4 grid gap-4 text-sm leading-7 text-slate-300">
              <li v-for="calendar in googleConnection?.discoveredCalendars ?? []" :key="calendar.id" class="rounded-[1.25rem] border border-white/8 bg-slate-900/60 p-4">
                <div class="text-base font-semibold text-white">{{ calendar.name }}</div>
                <div class="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                  <span v-if="isReminderCalendarName(calendar.name)">{{ i18n.excludedAutomatic }}</span>
                  <span v-else-if="googleConnection?.defaultCalendarId === calendar.id">{{ i18n.automaticFallback }}</span>
                  <span v-else-if="calendar.primary">{{ i18n.primary }}</span>
                </div>
                <div v-if="calendar.timezone" class="mt-2 text-slate-400">{{ calendar.timezone }}</div>
                <div v-if="calendar.description" class="mt-2 text-slate-400">{{ calendar.description }}</div>
              </li>
            </ul>
            <p v-else class="mt-4 text-sm leading-7 text-slate-300">{{ i18n.loadGoogleCalendars }}</p>
          </article>
        </article>
      </section>

      <section v-else-if="activeTab === 'notion'" class="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article class="glass-card rounded-[2rem] p-6">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-display text-2xl font-bold text-white">{{ i18n.syncStatus }}</h2>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ notionConnection?.enabled ? i18n.active : i18n.optional }}
            </span>
          </div>
          <div class="mt-6 rounded-[1.75rem] border px-5 py-5" :class="notionConnection?.enabled ? 'border-emerald-400/18 bg-emerald-500/10' : 'border-cyan-400/18 bg-cyan-500/10'">
            <div class="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/90">
              {{ notionConnection?.enabled ? i18n.bidirectional : i18n.disconnected }}
            </div>
            <h3 class="mt-4 text-2xl font-semibold text-white">
              {{ notionConnection?.enabled ? i18n.linkedNotion : i18n.unlinkedNotion }}
            </h3>
            <p class="mt-3 text-sm leading-7 text-slate-200">
              {{ notionConnection?.workspaceName ?? i18n.waitingNotion }}
            </p>
          </div>
          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.workspace }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ notionConnection?.workspaceName ?? "Por configurar" }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.mode }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ syncModeLabel(notionConnection?.syncMode) }}</div>
            </div>
            <div class="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5 sm:col-span-2">
              <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{{ i18n.lastSync }}</div>
              <div class="mt-3 text-lg font-semibold text-white">{{ formatTimestamp(notionConnection?.lastSyncAt, i18n.notSynced) }}</div>
            </div>
          </div>
          <p class="mt-6 text-sm leading-7 text-slate-300">
            {{ notionConnection?.lastError ?? i18n.localListNotion }}
          </p>
        </article>

        <article class="glass-card rounded-[2rem] p-6">
          <h2 class="font-display text-2xl font-bold text-white">Notion</h2>
          <p class="mt-6 text-sm leading-7 text-slate-300">
            {{ i18n.notionConnectHelp }}
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a class="primary-button rounded-full px-5 py-3 text-sm font-semibold" href="/dashboard/notion/connect">{{ i18n.connectNotion }}</a>
            <form method="post" action="/dashboard/notion/sync-now">
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.syncNow }}</button>
            </form>
            <form method="post" action="/dashboard/notion/disable">
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit">{{ i18n.disable }}</button>
            </form>
          </div>

          <article class="mt-8 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
            <div class="flex items-center justify-between gap-4">
              <h3 class="text-lg font-semibold text-white">{{ i18n.notionDatabase }}</h3>
              <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
                {{ notionConnection?.enabled ? i18n.automatic : i18n.pending }}
              </span>
            </div>
            <ul class="mt-4 grid gap-3 text-sm leading-7 text-slate-300">
              <li><strong>{{ i18n.workspace }}:</strong> {{ notionConnection?.workspaceName ?? "por configurar" }}</li>
              <li><strong>Database ID:</strong> <code>{{ notionConnection?.databaseId ?? "-" }}</code></li>
              <li>
                <strong>{{ i18n.link }}:</strong>
                <a v-if="notionConnection?.databaseUrl" class="text-cyan-100" :href="notionConnection.databaseUrl" target="_blank" rel="noreferrer">{{ i18n.openNotionDb }}</a>
                <span v-else>{{ i18n.notCreatedYet }}</span>
              </li>
            </ul>
          </article>
        </article>
      </section>

      <section v-else-if="activeTab === 'users' && canManageUsers" class="mt-6 grid gap-6">
        <article class="glass-card rounded-[2rem] p-6">
          <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="flex items-center gap-3">
                <h2 class="font-display text-3xl font-bold text-white">{{ i18n.userManagement }}</h2>
                <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">{{ i18n.adminBadge }}</span>
              </div>
              <p class="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                {{ i18n.userManagementBody }}
              </p>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label class="relative block min-w-[18rem] flex-1">
                <input
                  v-model="userSearch"
                  class="field-surface w-full rounded-full px-5 py-3 text-sm text-slate-100"
                  type="search"
                  :placeholder="i18n.searchPlaceholder"
                />
              </label>
              <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="button" @click="isCreateUserModalOpen = true">
                {{ i18n.addUser }}
              </button>
            </div>
          </div>
        </article>

        <article class="glass-card rounded-[2rem] p-6">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-display text-2xl font-bold text-white">{{ i18n.existingAccounts }}</h2>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
              {{ filteredUsers.length }}
            </span>
          </div>
          <div class="mt-6 overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/45">
            <div class="overflow-x-auto">
              <table class="min-w-full border-collapse">
                <thead class="bg-white/5">
                  <tr class="text-left text-xs uppercase tracking-[0.24em] text-slate-400">
                    <th class="px-5 py-4 font-semibold">{{ i18n.user }}</th>
                    <th class="px-5 py-4 font-semibold">{{ i18n.profile }}</th>
                    <th class="px-5 py-4 font-semibold">{{ i18n.status }}</th>
                    <th class="px-5 py-4 font-semibold">{{ i18n.lastAccess }}</th>
                    <th class="px-5 py-4 font-semibold text-right">{{ i18n.actions }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="filteredUsers.length === 0">
                    <td colspan="5" class="px-5 py-8 text-sm text-slate-400">
                      {{ i18n.noUsers }}
                    </td>
                  </tr>
                  <template v-else>
                    <tr v-for="user in filteredUsers" :key="user.id" class="border-t border-white/8 align-top">
                      <td class="px-5 py-5">
                        <div class="text-base font-semibold text-white">{{ user.displayName ?? user.email }}</div>
                        <div class="mt-2 text-sm text-slate-300">{{ user.email }}</div>
                        <div v-if="user.id === currentUser.id" class="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                          {{ i18n.currentSession }}
                        </div>
                      </td>
                    <td class="px-5 py-5">
                      <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">
                        {{ user.role === "admin" ? i18n.adminBadge : i18n.userRole }}
                      </span>
                    </td>
                    <td class="px-5 py-5">
                      <span
                        class="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]"
                        :class="user.active ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-rose-400/20 bg-rose-500/10 text-rose-100'"
                      >
                        {{ user.active ? i18n.activeStatus : i18n.disabledStatus }}
                      </span>
                    </td>
                      <td class="px-5 py-5 text-sm text-slate-300">
                        {{ formatTimestamp(user.lastLoginAt, i18n.neverLoggedIn) }}
                      </td>
                      <td class="px-5 py-5">
                        <div v-if="user.id !== currentUser.id" class="flex flex-wrap justify-end gap-3">
                        <button
                          v-if="user.active"
                          class="secondary-button rounded-full px-4 py-2 text-sm font-semibold text-amber-100"
                          type="button"
                          @click="openDeactivateModal(user)"
                        >
                            {{ i18n.deactivate }}
                        </button>
                          <form v-else method="post" action="/dashboard/admin/users/activate">
                            <input type="hidden" name="userId" :value="user.id" />
                            <button class="secondary-button rounded-full px-4 py-2 text-sm font-semibold text-emerald-100" type="submit">
                              {{ i18n.reactivate }}
                            </button>
                          </form>
                        <button
                          class="secondary-button rounded-full px-4 py-2 text-sm font-semibold text-rose-100"
                          type="button"
                          @click="openDeleteModal(user)"
                        >
                          {{ i18n.delete }}
                        </button>
                        </div>
                        <div v-else class="text-right text-sm font-semibold text-slate-500">{{ i18n.currentAccount }}</div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </section>

      <div v-if="isCreateUserModalOpen" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm" @click.self="isCreateUserModalOpen = false">
        <div class="glass-card relative w-full max-w-2xl rounded-[2rem] p-7">
          <button class="secondary-button absolute right-5 top-5 rounded-full px-4 py-2 text-sm font-semibold" type="button" @click="isCreateUserModalOpen = false">
            {{ i18n.close }}
          </button>

          <div class="flex items-center gap-3">
            <h2 class="font-display text-3xl font-bold text-white">{{ i18n.createUser }}</h2>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">{{ i18n.adminBadge }}</span>
          </div>
          <p class="mt-4 text-sm leading-7 text-slate-300">
            {{ i18n.createUserBody }}
          </p>

          <form method="post" action="/dashboard/admin/users/create" class="mt-8 grid gap-5">
            <div class="grid gap-5 md:grid-cols-2">
              <label class="grid gap-2">
                <span class="text-sm font-semibold text-slate-200">Email</span>
                <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="email" name="email" placeholder="utilizador@email.com" required />
              </label>
              <label class="grid gap-2">
                <span class="text-sm font-semibold text-slate-200">{{ i18n.name }}</span>
                <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="text" name="displayName" placeholder="Nome do utilizador" />
              </label>
            </div>
            <label class="grid gap-2 md:max-w-xs">
              <span class="text-sm font-semibold text-slate-200">{{ i18n.role }}</span>
              <select class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" name="role">
                <option value="user">{{ i18n.userRole }}</option>
                <option value="admin">{{ i18n.administrator }}</option>
              </select>
            </label>
            <div class="flex flex-wrap gap-3">
              <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.createTempPassword }}</button>
              <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold" type="button" @click="isCreateUserModalOpen = false">
                {{ i18n.cancel }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div
        v-if="userPendingDeactivation"
        class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm"
        @click.self="closeDeactivateModal"
      >
        <div class="glass-card relative w-full max-w-lg rounded-[2rem] border border-amber-400/20 p-7">
          <button
            class="secondary-button absolute right-5 top-5 rounded-full px-4 py-2 text-sm font-semibold"
            type="button"
            @click="closeDeactivateModal"
          >
            {{ i18n.close }}
          </button>

          <div class="flex flex-wrap items-start justify-between gap-3 pr-20">
            <div class="flex items-center gap-3">
              <h2 class="font-display text-3xl font-bold text-white">{{ i18n.confirmDeactivate }}</h2>
              <span class="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-amber-100">
                {{ i18n.access }}
              </span>
            </div>
          </div>
          <p class="mt-4 text-sm leading-7 text-slate-300">
            {{ i18n.deactivateBody }}
          </p>

          <div class="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
            <div class="text-base font-semibold text-white">{{ userPendingDeactivation.displayName ?? userPendingDeactivation.email }}</div>
            <div class="mt-2 text-sm text-slate-300">{{ userPendingDeactivation.email }}</div>
          </div>

          <form method="post" action="/dashboard/admin/users/deactivate" class="mt-6 flex flex-wrap gap-3">
            <input type="hidden" name="userId" :value="userPendingDeactivation.id" />
            <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-amber-100" type="submit">
              {{ i18n.confirmDeactivateButton }}
            </button>
            <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="button" @click="closeDeactivateModal">
              {{ i18n.cancel }}
            </button>
          </form>
        </div>
      </div>

      <div
        v-if="userPendingDeletion"
        class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm"
        @click.self="closeDeleteModal"
      >
        <div class="glass-card relative w-full max-w-lg rounded-[2rem] border border-rose-400/20 p-7">
          <button
            class="secondary-button absolute right-5 top-5 rounded-full px-4 py-2 text-sm font-semibold"
            type="button"
            @click="closeDeleteModal"
          >
            {{ i18n.close }}
          </button>

          <div class="flex flex-wrap items-start justify-between gap-3 pr-20">
            <div class="flex items-center gap-3">
              <h2 class="font-display text-3xl font-bold text-white">{{ i18n.confirmDelete }}</h2>
              <span class="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-rose-100">
                {{ i18n.permanent }}
              </span>
            </div>
          </div>
          <p class="mt-4 text-sm leading-7 text-slate-300">
            {{ i18n.deleteBody }}
          </p>

          <div class="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
            <div class="text-base font-semibold text-white">{{ userPendingDeletion.displayName ?? userPendingDeletion.email }}</div>
            <div class="mt-2 text-sm text-slate-300">{{ userPendingDeletion.email }}</div>
          </div>

          <form method="post" action="/dashboard/admin/users/delete" class="mt-6 flex flex-wrap gap-3">
            <input type="hidden" name="userId" :value="userPendingDeletion.id" />
            <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit">
              {{ i18n.confirmDeleteButton }}
            </button>
            <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="button" @click="closeDeleteModal">
              {{ i18n.cancel }}
            </button>
          </form>
        </div>
      </div>

      <div v-if="flashVisible && flashMessage" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-6 backdrop-blur-sm">
        <div class="glass-card w-full max-w-md rounded-[2rem] border p-7" :class="props.flashTone === 'error' ? 'border-rose-400/20' : 'border-emerald-400/18'">
          <h2 class="font-display text-2xl font-bold text-white">{{ flashTitle }}</h2>
          <p class="mt-4 text-sm leading-7" :class="props.flashTone === 'error' ? 'text-rose-100' : 'text-slate-300'">{{ flashMessage }}</p>
          <div class="mt-6">
            <button class="rounded-full px-5 py-3 text-sm font-semibold" :class="props.flashTone === 'error' ? 'secondary-button text-rose-100' : 'primary-button'" type="button" @click="flashVisible = false">
              Fechar
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
