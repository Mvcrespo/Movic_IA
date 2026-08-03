<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AuthenticatedHeader from "../components/AuthenticatedHeader.vue";
import SiteFooter from "../components/SiteFooter.vue";
import { useMarketingLanguage } from "../composables/useMarketingLanguage";
import type {
  AppUser,
  AppleCalendarConnection,
  DashboardTab,
  DiscordBotIdentity,
  GoogleCalendarConnection,
  NotionConnection,
  RuntimeChatLinks,
  RuntimeSettings,
  SleepNotificationPreferences
} from "../types";

const props = defineProps<{
  currentUser: AppUser;
  users: AppUser[];
  settings: RuntimeSettings | null;
  chatLinks: RuntimeChatLinks;
  activeLinkCode: { code: string; expiresAt: string } | null;
  appleConnection: AppleCalendarConnection | null;
  googleConnection: GoogleCalendarConnection | null;
  notionConnection: NotionConnection | null;
  notificationPreferences: SleepNotificationPreferences;
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
const isUnlinkModalOpen = ref(false);
const isCreateUserModalOpen = ref(false);
const userPendingDeactivation = ref<AppUser | null>(null);
const userPendingDeletion = ref<AppUser | null>(null);
const language = useMarketingLanguage();

let countdownInterval: number | null = null;
let flashTimeout: number | null = null;

const canManageUsers = computed(() => props.currentUser.role === "admin");
const activeChatPlatform = computed<"discord" | "telegram">(() =>
  props.activeTab === "telegram" ? "telegram" : "discord"
);
const activeChatLink = computed(() => props.chatLinks[activeChatPlatform.value]);
const hasLinkedState = computed(
  () => Boolean(props.settings?.enabled && props.settings?.conversationChannelId && props.settings?.linkedUserId)
);
const currentPlatformLinked = computed(
  () => Boolean(activeChatLink.value?.enabled && activeChatLink.value.conversationChannelId && activeChatLink.value.linkedUserId)
);
const otherPlatformLinked = computed(
  () => false
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
const linkCommandText = computed(() => `!code ${props.activeLinkCode?.code ?? (language.value === "en" ? "CODE" : "CODIGO")}`);
const activePlatformLabel = computed(() =>
  activeChatPlatform.value === "telegram" ? "Telegram" : "Discord"
);
const telegramBotUsername = "@TheMovicBot";
const telegramBotUrl = "https://t.me/TheMovicBot";
const linkedPlatformLabel = computed(() =>
  props.settings?.conversationPlatform === "telegram" ? "Telegram" : "Discord"
);
const i18n = computed(() =>
  language.value === "en"
    ? {
        dashboardBadge: "Dashboard",
        title: "Control area",
        body: "Control the bot, the live conversation and external integrations from a clearer and stronger panel.",
        adminRole: "Administrator",
        adminBadge: "Administrator",
        userRole: "User",
        role: "Role",
        administrator: "Administrator",
        tabs: {
          discord: "Discord",
          telegram: "Telegram",
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
        primaryChat: "Primary chat",
        setPrimaryChat: "Make primary",
        primaryChatHelp: "Used later for automatic notifications.",
        noChat: "No linked chat",
        linkedBody: "This chat is already associated with the bot.",
        waitingBody: "Generate a code and send it to the bot in the selected app.",
        linkedElsewhere: "You already have a chat connected through",
        removeBeforeSwitching: "Remove the current chat before connecting another app.",
        user: "User",
        chat: "Chat",
        linkedAt: "Connected at",
        unlinkChat: "Remove linked chat",
        confirmUnlink: "Remove linked chat?",
        unlinkBody:
          "This removes the current chat connection. You can connect another app later with a new code.",
        confirmUnlinkButton: "Yes, remove chat",
        currentCode: "Current code",
        validUntil: "Valid until",
        timeLeft: "Time left",
        noCode: "There is no active code yet.",
        generateCode: "Generate code",
        copyCode: "Copy !code",
        codePlaceholder: "CODE",
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
        setupGuides: {
          discord: {
            serverTitle: "Discord server",
            serverBody: "Add the bot to the Discord server where you want to use it.",
            dmTitle: "Private message",
            dmBody: "Open Discord and start a DM with",
            codeTitle: "Temporary code",
            codeBody: "Generate the code to connect this panel to the chat.",
            sendTitle: "Send in the DM",
            sendBody: "Copy the full message and send it to the bot."
          },
          telegram: {
            startTitle: "Telegram bot",
            startBody: "Open Telegram and send a private message to",
            startNote: "Groups are not accepted. The bot only processes private chats.",
            openBot: "Open Telegram bot",
            codeTitle: "Temporary code",
            codeBody: "Generate the code to connect this panel to Telegram.",
            sendTitle: "Send in Telegram",
            sendBody: "Copy the full message and send it to the bot."
          },
          apple: {
            accountTitle: "Apple Account",
            accountBody: "Open Apple Account and create an app-specific password for the calendar.",
            openAccount: "Open Apple Account",
            credentialsTitle: "Credentials",
            credentialsBody: "Paste the iCloud email and the password you just generated here.",
            emailLabel: "Apple Account email",
            passwordLabel: "App-specific password",
            confirmTitle: "Confirm",
            confirmBody: "Save and test to confirm the calendar is ready."
          },
          google: {
            connectTitle: "Google Calendar",
            connectBody: "Start the connection with your Google account.",
            accountTitle: "Account",
            accountBody: "Choose the Google account that has the calendar you want to use.",
            permissionsTitle: "Permissions",
            permissionsBody: "Accept calendar access so Movic can sync events.",
            returnTitle: "Back to the panel",
            returnBody: "At the end you return automatically to this page with Google connected."
          },
          notion: {
            connectTitle: "Notion",
            connectBody: "Start the connection with your Notion account.",
            workspaceTitle: "Workspace",
            workspaceBody: "Choose the right workspace to store and sync tasks.",
            permissionsTitle: "Permissions",
            permissionsBody: "Authorize the integration so Movic can create and update the database.",
            returnTitle: "Back to the panel",
            returnBody: "At the end you return automatically to this page with Notion connected."
          }
        },
        commandHelp: {
          code: "connects the conversation.",
          show: "shows the pending request.",
          cancel: "cancels the current request.",
          deleteJoin: "or",
          delete: "clears bot messages."
        },
        notifications: {
          title: "Automatic reminders",
          body: "Movic sends the night summary in the first quarter of your bedtime range and the morning summary in the first quarter of your wake-up range.",
          enabled: "Enabled",
          disabled: "Disabled",
          bedtime: "Bedtime range",
          wake: "Wake-up range",
          save: "Save reminders",
          commands: "You can also change this in chat with",
          sleepCommand: "Sleep from 23 to 01",
          wakeCommand: "wake around 08 to 10"
        },
        syncStatus: "Synchronization status",
        active: "Active",
        optional: "Optional",
        bidirectional: "Bidirectional",
        disconnected: "Disconnected",
        account: "Account",
        primaryCalendar: "Primary calendar",
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
        adminBadge: "Administrador",
        userRole: "Utilizador",
        role: "Perfil",
        administrator: "Administrador",
        tabs: {
          discord: "Discord",
          telegram: "Telegram",
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
        primaryChat: "Chat principal",
        setPrimaryChat: "Tornar principal",
        primaryChatHelp: "Vai ser usado mais tarde para notificações automáticas.",
        noChat: "Nenhum chat ligado",
        linkedBody: "Este chat já está associado ao bot.",
        waitingBody: "Gera um código e envia-o ao bot na app escolhida.",
        linkedElsewhere: "Já tens um chat ligado por",
        removeBeforeSwitching: "Remove o chat atual antes de ligares outra app.",
        user: "Utilizador",
        chat: "Chat",
        linkedAt: "Ligado em",
        unlinkChat: "Remover chat associado",
        confirmUnlink: "Remover chat associado?",
        unlinkBody:
          "Isto remove a ligação atual do chat. Podes ligar outra app mais tarde com um novo código.",
        confirmUnlinkButton: "Sim, remover chat",
        currentCode: "Código atual",
        validUntil: "Válido até",
        timeLeft: "Tempo restante",
        noCode: "Ainda não existe nenhum código ativo.",
        generateCode: "Gerar código",
        copyCode: "Copiar !code",
        codePlaceholder: "CODIGO",
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
        setupGuides: {
          discord: {
            serverTitle: "Discord server",
            serverBody: "Adiciona o bot a um servidor do Discord onde o queiras usar.",
            dmTitle: "Mensagem privada",
            dmBody: "Abre o Discord e inicia uma DM com",
            codeTitle: "Código temporário",
            codeBody: "Gera o código para ligar este painel ao chat.",
            sendTitle: "Enviar na DM",
            sendBody: "Copia a mensagem completa e envia-a ao bot."
          },
          telegram: {
            startTitle: "Bot Telegram",
            startBody: "Abre o Telegram e envia mensagem privada para",
            startNote: "Grupos não são aceites. O bot só processa conversas privadas.",
            openBot: "Abrir bot Telegram",
            codeTitle: "Código temporário",
            codeBody: "Gera o código para ligar este painel ao Telegram.",
            sendTitle: "Enviar no Telegram",
            sendBody: "Copia a mensagem completa e envia-a ao bot."
          },
          apple: {
            accountTitle: "Apple Account",
            accountBody: "Abre a Apple Account e cria uma app-specific password para o calendário.",
            openAccount: "Abrir Apple Account",
            credentialsTitle: "Credenciais",
            credentialsBody: "Cola aqui o email iCloud e a password que acabaste de gerar.",
            emailLabel: "Apple Account email",
            passwordLabel: "App-specific password",
            confirmTitle: "Confirmar",
            confirmBody: "Guarda e testa para confirmar que o calendário ficou pronto."
          },
          google: {
            connectTitle: "Google Calendar",
            connectBody: "Começa a ligação com a tua conta Google.",
            accountTitle: "Conta",
            accountBody: "Escolhe a conta Google onde tens o calendário que queres usar.",
            permissionsTitle: "Permissões",
            permissionsBody: "Aceita o acesso ao calendário para o Movic conseguir sincronizar eventos.",
            returnTitle: "Voltar ao painel",
            returnBody: "No fim voltas automaticamente para esta página já com o Google ligado."
          },
          notion: {
            connectTitle: "Notion",
            connectBody: "Começa a ligação com a tua conta Notion.",
            workspaceTitle: "Workspace",
            workspaceBody: "Escolhe o workspace certo para guardar e sincronizar tarefas.",
            permissionsTitle: "Permissões",
            permissionsBody: "Autoriza a integração para o Movic criar e atualizar a base de dados.",
            returnTitle: "Voltar ao painel",
            returnBody: "No fim voltas automaticamente para esta página já com o Notion ligado."
          }
        },
        commandHelp: {
          code: "liga a conversa.",
          show: "mostra o pedido pendente.",
          cancel: "cancela o pedido atual.",
          deleteJoin: "ou",
          delete: "limpa mensagens do bot."
        },
        notifications: {
          title: "Avisos automáticos",
          body: "A Movic envia o resumo da noite no primeiro quarto do intervalo de deitar e o resumo da manhã no primeiro quarto do intervalo de acordar.",
          enabled: "Ligados",
          disabled: "Desligados",
          bedtime: "Intervalo de deitar",
          wake: "Intervalo de acordar",
          save: "Guardar avisos",
          commands: "Também podes alterar no chat com",
          sleepCommand: "Dormir das 23 as 01",
          wakeCommand: "acordo por volta das 08 as 10"
        },
        syncStatus: "Estado da sincronização",
        active: "Ativa",
        optional: "Opcional",
        bidirectional: "Bidirecional",
        disconnected: "Desligada",
        account: "Conta",
        primaryCalendar: "Calendário principal",
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
  () => activeChatLink.value?.linkedUsername?.trim() || activeChatLink.value?.linkedUserId || "Desconhecido"
);
const tabs = computed(() => {
  const base = [
    { key: "discord" as const, label: i18n.value.tabs.discord },
    { key: "telegram" as const, label: i18n.value.tabs.telegram },
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
  if (!props.activeLinkCode || currentPlatformLinked.value) {
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
    await navigator.clipboard.writeText(linkCommandText.value);
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

  if (props.activeLinkCode && !currentPlatformLinked.value) {
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

      <section v-if="activeTab === 'discord' || activeTab === 'telegram'" class="mt-6">
        <article class="glass-card rounded-[2rem] p-6 sm:p-8">
          <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-display text-2xl font-bold text-white">{{ activePlatformLabel }}</h2>
              <p class="mt-2 text-sm leading-7 text-slate-300">
                <template v-if="currentPlatformLinked">{{ i18n.linkedBody }}</template>
                <template v-else-if="otherPlatformLinked">{{ i18n.linkedElsewhere }} {{ linkedPlatformLabel }}. {{ i18n.removeBeforeSwitching }}</template>
                <template v-else>{{ i18n.waitingBody }}</template>
              </p>
            </div>
            <span
              class="w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]"
              :class="currentPlatformLinked ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : otherPlatformLinked ? 'border-amber-400/20 bg-amber-500/10 text-amber-100' : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'"
            >
              {{ currentPlatformLinked ? i18n.linked : i18n.waiting }}
            </span>
          </div>

          <div class="mt-7 border-y border-white/10 py-6">
            <div v-if="currentPlatformLinked" class="grid gap-4">
              <div>
                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{{ i18n.user }}</div>
                <div class="mt-2 text-xl font-semibold text-white">{{ linkedUserLabel }}</div>
              </div>
              <div class="text-sm leading-7 text-slate-300">
                {{ i18n.readyToChat }}. {{ i18n.linkedAt }} {{ formatTimestamp(activeChatLink?.linkedAt, "-") }}.
              </div>
              <div class="flex flex-wrap gap-3">
                <form v-if="!activeChatLink?.isPrimary" method="post" action="/dashboard/chat-primary">
                  <input type="hidden" name="platform" :value="activeChatPlatform" />
                  <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">
                    {{ i18n.setPrimaryChat }}
                  </button>
                </form>
                <span v-else class="w-fit rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                  {{ i18n.primaryChat }}
                </span>
                <button
                  class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-500/10 hover:text-rose-50"
                  type="button"
                  @click="isUnlinkModalOpen = true"
                >
                  {{ i18n.unlinkChat }}
                </button>
              </div>
              <p class="text-sm leading-7 text-slate-400">{{ i18n.primaryChatHelp }}</p>
            </div>

            <div v-else-if="otherPlatformLinked" class="grid gap-4 rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-5">
              <div class="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">{{ linkedPlatformLabel }}</div>
              <p class="text-lg font-semibold leading-7 text-white">
                {{ i18n.linkedElsewhere }} {{ linkedPlatformLabel }}.
              </p>
              <p class="text-sm leading-7 text-slate-300">
                {{ i18n.removeBeforeSwitching }}
              </p>
              <button
                class="secondary-button w-fit rounded-full px-5 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-500/10 hover:text-rose-50"
                type="button"
                @click="isUnlinkModalOpen = true"
              >
                {{ i18n.unlinkChat }}
              </button>
            </div>

            <div v-else class="mx-auto grid max-w-2xl gap-4">
              <div v-if="activeChatPlatform === 'discord'" class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">1</div>
                <div class="grid gap-3">
                  <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.discord.serverTitle }}</div>
                    <p class="mt-2 text-lg font-semibold leading-7 text-white">
                      {{ i18n.setupGuides.discord.serverBody }}
                    </p>
                  </div>
                <a
                  v-if="installUrl"
                  class="primary-button w-fit rounded-full px-6 py-3 text-sm font-semibold"
                  :href="installUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ i18n.addBot }}
                </a>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">{{ activeChatPlatform === 'telegram' ? '1' : '2' }}</div>
                <div class="grid gap-3">
                  <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                    {{ activeChatPlatform === 'telegram' ? i18n.setupGuides.telegram.startTitle : i18n.setupGuides.discord.dmTitle }}
                  </div>
                  <p class="mt-2 text-lg font-semibold leading-7 text-white">
                    <template v-if="activeChatPlatform === 'telegram'">{{ i18n.setupGuides.telegram.startBody }} <code>{{ telegramBotUsername }}</code>.</template>
                    <template v-else>{{ i18n.setupGuides.discord.dmBody }} <code>{{ botLabel }}</code>.</template>
                  </p>
                  <template v-if="activeChatPlatform === 'telegram'">
                    <p class="text-sm leading-7 text-slate-300">{{ i18n.setupGuides.telegram.startNote }}</p>
                    <a class="secondary-button w-fit rounded-full px-6 py-3 text-sm font-semibold" :href="telegramBotUrl" target="_blank" rel="noreferrer noopener">
                      {{ i18n.setupGuides.telegram.openBot }}
                    </a>
                  </template>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">{{ activeChatPlatform === 'telegram' ? '2' : '3' }}</div>
                <div class="grid gap-3">
                  <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                      {{ activeChatPlatform === 'telegram' ? i18n.setupGuides.telegram.codeTitle : i18n.setupGuides.discord.codeTitle }}
                    </div>
                    <p class="mt-2 text-lg font-semibold leading-7 text-white">
                      {{ activeChatPlatform === 'telegram' ? i18n.setupGuides.telegram.codeBody : i18n.setupGuides.discord.codeBody }}
                    </p>
                  </div>
                <form method="post" action="/dashboard/generate-code">
                  <input type="hidden" name="platform" :value="activeChatPlatform" />
                  <button class="primary-button rounded-full px-6 py-3 text-sm font-semibold" type="submit">{{ i18n.generateCode }}</button>
                </form>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">{{ activeChatPlatform === 'telegram' ? '3' : '4' }}</div>
                <div class="grid gap-3">
                  <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                      {{ activeChatPlatform === 'telegram' ? i18n.setupGuides.telegram.sendTitle : i18n.setupGuides.discord.sendTitle }}
                    </div>
                    <p class="mt-2 text-lg font-semibold leading-7 text-white">
                      {{ activeChatPlatform === 'telegram' ? i18n.setupGuides.telegram.sendBody : i18n.setupGuides.discord.sendBody }}
                    </p>
                  </div>
                <button
                  class="secondary-button inline-flex w-fit max-w-full items-center gap-3 rounded-full px-6 py-3 text-sm font-semibold"
                  :class="{ 'cursor-not-allowed opacity-50': !activeLinkCode }"
                  type="button"
                  :disabled="!activeLinkCode"
                  @click="copyCommand"
                >
                  <span class="truncate font-mono text-base text-cyan-50">{{ linkCommandText }}</span>
                  <span class="relative inline-block h-5 w-5 shrink-0 text-cyan-50" aria-hidden="true">
                    <span class="absolute left-0 top-1 h-4 w-3.5 rounded-[0.15rem] border border-current opacity-50"></span>
                    <span class="absolute left-1.5 top-0 h-4 w-3.5 rounded-[0.15rem] border border-current bg-slate-950"></span>
                  </span>
                </button>
                <div v-if="activeLinkCode" class="text-sm text-slate-300">{{ i18n.timeLeft }}: <strong>{{ countdown }}</strong></div>
                <p v-else class="text-sm leading-7 text-slate-300">{{ i18n.noCode }}</p>
                <p class="min-h-[1.5rem] text-sm font-semibold text-cyan-100">{{ copyFeedback }}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6">
            <h3 class="text-lg font-semibold text-white">{{ i18n.commands }}</h3>
            <ul class="mt-4 grid gap-3 text-sm leading-7 text-slate-300">
              <li><code>!code {{ i18n.codePlaceholder }}</code> {{ i18n.commandHelp.code }}</li>
              <li><code>!show</code> {{ i18n.commandHelp.show }}</li>
              <li><code>!cancel</code> {{ i18n.commandHelp.cancel }}</li>
              <li v-if="activeChatPlatform === 'discord'"><code>!delete</code> {{ i18n.commandHelp.deleteJoin }} <code>!delete 10</code> {{ i18n.commandHelp.delete }}</li>
            </ul>
          </div>

          <div class="mt-7 border-t border-white/10 pt-6">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 class="text-lg font-semibold text-white">{{ i18n.notifications.title }}</h3>
                <p class="mt-2 max-w-2xl text-sm leading-7 text-slate-300">{{ i18n.notifications.body }}</p>
                <p class="mt-2 text-sm leading-7 text-slate-400">
                  {{ i18n.notifications.commands }} <code>{{ i18n.notifications.sleepCommand }}</code> / <code>{{ i18n.notifications.wakeCommand }}</code>.
                </p>
              </div>
              <span
                class="w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]"
                :class="notificationPreferences.enabled ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-slate-400/20 bg-white/5 text-slate-200'"
              >
                {{ notificationPreferences.enabled ? i18n.notifications.enabled : i18n.notifications.disabled }}
              </span>
            </div>

            <form method="post" action="/dashboard/notification-preferences" class="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label class="grid gap-2 text-sm font-semibold text-slate-200">
                {{ i18n.notifications.bedtime }}
                <span class="grid grid-cols-2 gap-3">
                  <input class="form-input" type="time" name="sleepStartTime" :value="notificationPreferences.sleepStartTime ?? ''" />
                  <input class="form-input" type="time" name="sleepEndTime" :value="notificationPreferences.sleepEndTime ?? ''" />
                </span>
              </label>
              <label class="grid gap-2 text-sm font-semibold text-slate-200">
                {{ i18n.notifications.wake }}
                <span class="grid grid-cols-2 gap-3">
                  <input class="form-input" type="time" name="wakeStartTime" :value="notificationPreferences.wakeStartTime ?? ''" />
                  <input class="form-input" type="time" name="wakeEndTime" :value="notificationPreferences.wakeEndTime ?? ''" />
                </span>
              </label>
              <div class="flex flex-wrap items-center gap-3">
                <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <input class="h-4 w-4 accent-cyan-300" type="checkbox" name="notificationsEnabled" value="on" :checked="notificationPreferences.enabled" />
                  {{ i18n.notifications.enabled }}
                </label>
                <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.notifications.save }}</button>
              </div>
            </form>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'apple'" class="mt-6">
        <article class="glass-card rounded-[2rem] p-6 sm:p-8">
          <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-display text-2xl font-bold text-white">Apple Calendar</h2>
              <p class="mt-2 text-sm leading-7 text-slate-300">
                {{ appleConnection?.enabled ? i18n.linkedApple : i18n.applePasswordHelp }}
              </p>
            </div>
            <span
              class="w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]"
              :class="appleConnection?.enabled ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'"
            >
              {{ appleConnection?.enabled ? i18n.active : i18n.disconnected }}
            </span>
          </div>

          <div class="mt-7 border-y border-white/10 py-6">
            <div v-if="appleConnection?.enabled" class="grid gap-4">
              <div>
                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{{ i18n.account }}</div>
                <div class="mt-2 break-all text-xl font-semibold text-white">{{ appleConnection.accountEmail }}</div>
              </div>
              <p class="text-sm leading-7 text-slate-300">
                {{ i18n.primaryCalendar }}: <strong class="text-white">{{ appleConnection.defaultCalendarName ?? i18n.notSynced }}</strong>
                <br />
                {{ i18n.lastSync }}: {{ formatTimestamp(appleConnection.lastSyncAt, i18n.notSynced) }}
              </p>
              <p v-if="appleConnection.lastError" class="text-sm leading-7 text-rose-100">{{ appleConnection.lastError }}</p>
              <div class="flex flex-wrap gap-3">
                <form method="post" action="/dashboard/apple/sync-now">
                  <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.syncNow }}</button>
                </form>
                <form method="post" action="/dashboard/apple/disable">
                  <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit">{{ i18n.disable }}</button>
                </form>
              </div>
            </div>

            <div v-else class="mx-auto grid max-w-2xl gap-4">
              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">1</div>
                <div class="grid gap-3">
                  <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.apple.accountTitle }}</div>
                    <p class="mt-2 text-lg font-semibold leading-7 text-white">
                      {{ i18n.setupGuides.apple.accountBody }}
                    </p>
                  </div>
                  <a class="secondary-button w-fit rounded-full px-6 py-3 text-sm font-semibold" href="https://account.apple.com/" target="_blank" rel="noreferrer noopener">{{ i18n.setupGuides.apple.openAccount }}</a>
                </div>
              </div>

              <form method="post" action="/dashboard/apple/save" class="grid gap-4">
                <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                  <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">2</div>
                  <div class="grid gap-4">
                    <div>
                      <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.apple.credentialsTitle }}</div>
                      <p class="mt-2 text-lg font-semibold leading-7 text-white">
                        {{ i18n.setupGuides.apple.credentialsBody }}
                      </p>
                    </div>
                    <label class="grid gap-2">
                      <span class="text-sm font-semibold text-slate-200">{{ i18n.setupGuides.apple.emailLabel }}</span>
                      <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="email" name="accountEmail" :value="appleConnection?.accountEmail ?? ''" placeholder="teu-email@icloud.com" />
                    </label>
                    <label class="grid gap-2">
                      <span class="text-sm font-semibold text-slate-200">{{ i18n.setupGuides.apple.passwordLabel }}</span>
                      <input class="field-surface rounded-[1.25rem] px-4 py-3 text-slate-100" type="password" name="appSpecificPassword" placeholder="xxxx-xxxx-xxxx-xxxx" />
                    </label>
                  </div>
                </div>

                <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                  <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">3</div>
                  <div class="grid gap-3">
                    <div>
                      <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.apple.confirmTitle }}</div>
                      <p class="mt-2 text-lg font-semibold leading-7 text-white">
                        {{ i18n.setupGuides.apple.confirmBody }}
                      </p>
                    </div>
                    <input type="hidden" name="syncMode" value="bidirectional" />
                    <div class="flex flex-wrap gap-3">
                      <button class="primary-button rounded-full px-6 py-3 text-sm font-semibold" type="submit">{{ i18n.save }}</button>
                      <button class="secondary-button rounded-full px-6 py-3 text-sm font-semibold" type="submit" formaction="/dashboard/apple/test">{{ i18n.testConnection }}</button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'google'" class="mt-6">
        <article class="glass-card rounded-[2rem] p-6 sm:p-8">
          <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-display text-2xl font-bold text-white">Google Calendar</h2>
              <p class="mt-2 text-sm leading-7 text-slate-300">
                {{ googleConnection?.enabled ? i18n.linkedGoogle : i18n.googleConnectHelp }}
              </p>
            </div>
            <span
              class="w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]"
              :class="googleConnection?.enabled ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'"
            >
              {{ googleConnection?.enabled ? i18n.active : i18n.disconnected }}
            </span>
          </div>

          <div class="mt-7 border-y border-white/10 py-6">
            <div v-if="googleConnection?.enabled" class="grid gap-4">
              <div>
                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{{ i18n.account }}</div>
                <div class="mt-2 break-all text-xl font-semibold text-white">{{ googleConnection.accountEmail }}</div>
              </div>
              <p class="text-sm leading-7 text-slate-300">
                {{ i18n.primaryCalendar }}: <strong class="text-white">{{ googleConnection.defaultCalendarName ?? i18n.notSynced }}</strong>
                <br />
                {{ i18n.lastSync }}: {{ formatTimestamp(googleConnection.lastSyncAt, i18n.notSynced) }}
              </p>
              <p v-if="googleConnection.lastError" class="text-sm leading-7 text-rose-100">{{ googleConnection.lastError }}</p>
              <div class="flex flex-wrap gap-3">
                <form method="post" action="/dashboard/google/sync-now">
                  <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.syncNow }}</button>
                </form>
                <form method="post" action="/dashboard/google/disable">
                  <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit">{{ i18n.disable }}</button>
                </form>
              </div>
            </div>

            <div v-else class="mx-auto grid max-w-2xl gap-4">
              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">1</div>
                <div class="grid gap-3">
                  <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.google.connectTitle }}</div>
                    <p class="mt-2 text-lg font-semibold leading-7 text-white">
                      {{ i18n.setupGuides.google.connectBody }}
                    </p>
                  </div>
                  <a class="primary-button w-fit rounded-full px-6 py-3 text-sm font-semibold" href="/dashboard/google/connect">{{ i18n.connectGoogle }}</a>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">2</div>
                <div>
                  <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.google.accountTitle }}</div>
                  <p class="mt-2 text-lg font-semibold leading-7 text-white">
                    {{ i18n.setupGuides.google.accountBody }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">3</div>
                <div>
                  <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.google.permissionsTitle }}</div>
                  <p class="mt-2 text-lg font-semibold leading-7 text-white">
                    {{ i18n.setupGuides.google.permissionsBody }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">4</div>
                <div>
                  <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.google.returnTitle }}</div>
                  <p class="mt-2 text-lg font-semibold leading-7 text-white">
                    {{ i18n.setupGuides.google.returnBody }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'notion'" class="mt-6">
        <article class="glass-card rounded-[2rem] p-6 sm:p-8">
          <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-display text-2xl font-bold text-white">Notion</h2>
              <p class="mt-2 text-sm leading-7 text-slate-300">
                {{ notionConnection?.enabled ? i18n.linkedNotion : i18n.notionConnectHelp }}
              </p>
            </div>
            <span
              class="w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]"
              :class="notionConnection?.enabled ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'"
            >
              {{ notionConnection?.enabled ? i18n.active : i18n.disconnected }}
            </span>
          </div>

          <div class="mt-7 border-y border-white/10 py-6">
            <div v-if="notionConnection?.enabled" class="grid gap-4">
              <div>
                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{{ i18n.workspace }}</div>
                <div class="mt-2 break-all text-xl font-semibold text-white">{{ notionConnection.workspaceName ?? i18n.notSynced }}</div>
              </div>
              <p class="text-sm leading-7 text-slate-300">
                {{ i18n.lastSync }}: {{ formatTimestamp(notionConnection.lastSyncAt, i18n.notSynced) }}
                <br />
                <a v-if="notionConnection.databaseUrl" class="font-semibold text-cyan-100" :href="notionConnection.databaseUrl" target="_blank" rel="noreferrer">{{ i18n.openNotionDb }}</a>
                <span v-else>{{ i18n.notionDatabase }}: {{ i18n.notCreatedYet }}</span>
              </p>
              <p v-if="notionConnection.lastError" class="text-sm leading-7 text-rose-100">{{ notionConnection.lastError }}</p>
              <div class="flex flex-wrap gap-3">
                <form method="post" action="/dashboard/notion/sync-now">
                  <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="submit">{{ i18n.syncNow }}</button>
                </form>
                <form method="post" action="/dashboard/notion/disable">
                  <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit">{{ i18n.disable }}</button>
                </form>
              </div>
            </div>

            <div v-else class="mx-auto grid max-w-2xl gap-4">
              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">1</div>
                <div class="grid gap-3">
                  <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.notion.connectTitle }}</div>
                    <p class="mt-2 text-lg font-semibold leading-7 text-white">
                      {{ i18n.setupGuides.notion.connectBody }}
                    </p>
                  </div>
                  <a class="primary-button w-fit rounded-full px-6 py-3 text-sm font-semibold" href="/dashboard/notion/connect">{{ i18n.connectNotion }}</a>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">2</div>
                <div>
                  <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.notion.workspaceTitle }}</div>
                  <p class="mt-2 text-lg font-semibold leading-7 text-white">
                    {{ i18n.setupGuides.notion.workspaceBody }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">3</div>
                <div>
                  <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.notion.permissionsTitle }}</div>
                  <p class="mt-2 text-lg font-semibold leading-7 text-white">
                    {{ i18n.setupGuides.notion.permissionsBody }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-[2.75rem_1fr] gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                <div class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100">4</div>
                <div>
                  <div class="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">{{ i18n.setupGuides.notion.returnTitle }}</div>
                  <p class="mt-2 text-lg font-semibold leading-7 text-white">
                    {{ i18n.setupGuides.notion.returnBody }}
                  </p>
                </div>
              </div>
            </div>
          </div>
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

      <div
        v-if="isUnlinkModalOpen"
        class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm"
        @click.self="isUnlinkModalOpen = false"
      >
        <div class="glass-card relative w-full max-w-lg rounded-[2rem] border border-rose-400/20 p-7">
          <button
            class="secondary-button absolute right-5 top-5 rounded-full px-4 py-2 text-sm font-semibold"
            type="button"
            @click="isUnlinkModalOpen = false"
          >
            {{ i18n.close }}
          </button>

          <div class="flex flex-wrap items-start justify-between gap-3 pr-20">
            <div class="flex items-center gap-3">
              <h2 class="font-display text-3xl font-bold text-white">{{ i18n.confirmUnlink }}</h2>
              <span class="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-rose-100">
                {{ activePlatformLabel }}
              </span>
            </div>
          </div>
          <p class="mt-4 text-sm leading-7 text-slate-300">
            {{ i18n.unlinkBody }}
          </p>

          <div class="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
            <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{{ i18n.user }}</div>
            <div class="mt-2 text-lg font-semibold text-white">{{ linkedUserLabel }}</div>
          </div>

          <form method="post" action="/dashboard/unlink" class="mt-6 flex flex-wrap gap-3">
            <input type="hidden" name="platform" :value="activeChatPlatform" />
            <button class="secondary-button rounded-full px-5 py-3 text-sm font-semibold text-rose-100" type="submit">
              {{ i18n.confirmUnlinkButton }}
            </button>
            <button class="primary-button rounded-full px-5 py-3 text-sm font-semibold" type="button" @click="isUnlinkModalOpen = false">
              {{ i18n.cancel }}
            </button>
          </form>
        </div>
      </div>

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

    <SiteFooter />
  </div>
</template>
