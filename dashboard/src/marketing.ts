type MarketingPage = "home" | "get-started";

const MARKETING_COPY = {
  pt: {
    common: {
      navHome: "Home",
      navGetStarted: "Começar",
      navLogin: "Login"
    },
    home: {
      eyebrow: "Cockpit escuro para controlar tudo num so nucleo",
      heroTitle: "Orquestra o bot, o chat e as integracoes a partir de uma home muito mais viva.",
      heroBody:
        "Esta entrada publica foi redesenhada para parecer produto a serio: visual dark, cerebro central, animacoes, PT/EN e uma narrativa mais clara antes do utilizador entrar na dashboard privada.",
      heroPrimary: "Abrir fluxo guiado",
      heroSecondary: "Ver o flow",
      chipOne: "Discord por codigo seguro",
      chipTwo: "Integracoes privadas por utilizador",
      chipThree: "Landing pronta para PT / EN",
      networkLabel: "Nucleo interactivo",
      orbitStatus: "Tudo converge para um unico core",
      discordTitle: "Discord sempre ligado",
      discordBody:
        "Cada utilizador pode ligar a sua conversa sem misturar contexto, canais ou permissoes.",
      appleTitle: "Apple separado por conta",
      appleBody:
        "Calendarios privados, escolha do calendario certo e sync isolada para cada utilizador.",
      googleTitle: "Google pronto para OAuth",
      googleBody:
        "Fluxo mais limpo para autenticacao e sincronizacao controlada quando for preciso.",
      notionTitle: "Notion como hub operacional",
      notionBody:
        "Workspace, base de dados e sync ficam visiveis sem parecer uma pagina generica.",
      featureOneTitle: "Visual mais ousado",
      featureOneBody:
        "Tema escuro, brilho neon, profundidade e movimento em vez do bloco branco demasiado simples.",
      featureTwoTitle: "Estrutura mais aceitavel",
      featureTwoBody:
        "Mantemos o backend actual estavel e tratamos a home como uma camada moderna pronta para crescer.",
      featureThreeTitle: "PT e EN logo de origem",
      featureThreeBody:
        "O idioma pode ser trocado na hora e fica guardado para a proxima visita.",
      flowTitle: "Como este novo flow esta pensado",
      flowBody:
        "Em vez de empurrar o utilizador logo para um ecra seco, mostramos o valor, explicamos o funcionamento e so depois guiamos o pedido de acesso.",
      stepOneTitle: "1. Explorar a home",
      stepOneBody:
        "Perceber rapidamente o produto, as integracoes suportadas e a logica da plataforma.",
      stepTwoTitle: "2. Abrir o Get Started",
      stepTwoBody:
        "Preencher um mini briefing com objetivo, email e integracoes que quer activar.",
      stepThreeTitle: "3. Enviar o email",
      stepThreeBody:
        "O utilizador reve a mensagem antes do envio, num fluxo bem mais friendly.",
      readyTitle: "O que continua a funcionar",
      readyBody:
        "So a camada publica foi elevada. O login, a dashboard e as rotas internas continuam compativeis com o que ja tinhas.",
      readyPointOne: "Login e dashboard continuam activos",
      readyPointTwo: "As outras paginas mantem a logica actual",
      readyPointThree: "A base fica pronta para uma migracao maior depois",
      nextTitle: "Proximo passo natural",
      nextBody:
        "Se quiseres, a seguir podemos migrar o resto da experiencia para Vue + Tailwind com componentes reutilizaveis, sem rebentar o backend existente.",
      ctaTitle: "Queres arrancar com um onboarding mais limpo?",
      ctaBody:
        "Abre o fluxo guiado, prepara o email e decide as integracoes antes de entrares na plataforma.",
      ctaPrimary: "Abrir Get Started",
      ctaSecondary: "Ir para login"
    },
    getStarted: {
      eyebrow: "Fluxo guiado de acesso",
      pageTitle: "Prepara o teu pedido de acesso sem saltar etapas.",
      pageBody:
        "Aqui nao te atiramos para um mail cru. Primeiro montas o contexto, escolhes integracoes e so no fim abrimos o email ja preparado para enviares.",
      stepOneTitle: "1. Preenche",
      stepOneBody: "Conta-nos quem es, o teu email e o objetivo do pedido.",
      stepTwoTitle: "2. Reve",
      stepTwoBody: "Geramos uma pre-visualizacao clara antes de abrir o email.",
      stepThreeTitle: "3. Envia",
      stepThreeBody:
        "O teu cliente de email abre com a mensagem pronta, mas o controlo final continua do teu lado.",
      supportCardTitle: "Email de destino",
      supportCardBody:
        "Se o cliente de email nao abrir automaticamente, copia a mensagem e envia manualmente para:",
      formTitle: "Briefing rapido",
      formBody:
        "Quanto mais claro vier este contexto, mais simples fica preparar a conta e as integracoes certas.",
      fieldName: "Nome",
      fieldNamePlaceholder: "O teu nome",
      fieldEmail: "Email",
      fieldEmailPlaceholder: "tu@empresa.com",
      fieldOrganization: "Projeto ou organizacao",
      fieldOrganizationPlaceholder: "Ex.: tese, equipa interna, demo de produto",
      fieldUseCase: "O que queres fazer com a plataforma?",
      fieldUseCasePlaceholder:
        "Explica o objetivo, o tipo de tarefas e o que esperas automatizar.",
      fieldTimeline: "Quando queres comecar?",
      timelineSoon: "Nos proximos dias",
      timelineMonth: "Ainda este mes",
      timelineExplore: "Estou so a explorar",
      connectorsTitle: "Que integracoes queres activar?",
      connectorDiscord: "Discord",
      connectorApple: "Apple Calendar",
      connectorGoogle: "Google Calendar",
      connectorNotion: "Notion",
      previewTitle: "Pre-visualizacao do email",
      previewHint: "Este email e construido a partir do briefing para ficar mais facil enviar.",
      previewSubjectLabel: "Assunto",
      previewBodyLabel: "Mensagem",
      composeButton: "Abrir email",
      copyButton: "Copiar mensagem",
      finalNote:
        "Depois de clicares em abrir email, confirma o envio no teu cliente de email.",
      previewEmpty: "Preenche o formulario para ver o email completo.",
      subjectDefault: "Pedido de onboarding Movic",
      subjectPrefix: "Pedido de onboarding Movic - ",
      mailGreeting: "Ola equipa Movic,",
      mailIntro: "Queria pedir acesso a plataforma e preparar a minha conta.",
      mailLineName: "Nome",
      mailLineEmail: "Email",
      mailLineOrganization: "Projeto/organizacao",
      mailLineUseCase: "Objetivo",
      mailLineConnectors: "Integracoes",
      mailLineTimeline: "Janela de arranque",
      mailClosing: "Obrigado.",
      connectorNone: "Ainda sem integracoes seleccionadas",
      copySuccess: "Mensagem copiada para a area de transferencia.",
      copyError: "Nao consegui copiar automaticamente. Podes copiar manualmente."
    }
  },
  en: {
    common: {
      navHome: "Home",
      navGetStarted: "Get Started",
      navLogin: "Login"
    },
    home: {
      eyebrow: "A darker cockpit to control everything from one core",
      heroTitle:
        "Orchestrate the bot, the chat and every integration from a landing page that actually feels alive.",
      heroBody:
        "This public entry point was redesigned to feel like a real product: dark visuals, a central brain, motion, PT/EN support and a clearer story before users enter the private dashboard.",
      heroPrimary: "Open guided flow",
      heroSecondary: "See the flow",
      chipOne: "Discord linked by secure code",
      chipTwo: "Private integrations per user",
      chipThree: "Landing ready for PT / EN",
      networkLabel: "Interactive core",
      orbitStatus: "Everything converges into one core",
      discordTitle: "Discord always linked",
      discordBody:
        "Each user can attach their own conversation without mixing context, channels or permissions.",
      appleTitle: "Apple isolated per account",
      appleBody:
        "Private calendars, the right calendar selection and per-user sync isolation.",
      googleTitle: "Google ready for OAuth",
      googleBody:
        "A cleaner authentication path and on-demand synchronization when needed.",
      notionTitle: "Notion as an operational hub",
      notionBody:
        "Workspace, database and sync stay visible without looking like a generic page.",
      featureOneTitle: "A bolder visual direction",
      featureOneBody:
        "Dark theme, neon glow, depth and motion instead of a plain white block.",
      featureTwoTitle: "A more acceptable structure",
      featureTwoBody:
        "The current backend stays stable while the public home becomes a modern layer ready to grow.",
      featureThreeTitle: "PT and EN from the start",
      featureThreeBody:
        "Language switches instantly and is remembered on the next visit.",
      flowTitle: "How this new flow works",
      flowBody:
        "Instead of pushing users into a dry screen, we show value, explain the product and only then guide the access request.",
      stepOneTitle: "1. Explore the home",
      stepOneBody:
        "Quickly understand the product, the supported integrations and the platform logic.",
      stepTwoTitle: "2. Open Get Started",
      stepTwoBody:
        "Fill a short brief with goals, email and the integrations you want to activate.",
      stepThreeTitle: "3. Send the email",
      stepThreeBody:
        "Users review the message before sending it, which makes the whole flow much friendlier.",
      readyTitle: "What still works",
      readyBody:
        "Only the public layer was elevated. Login, dashboard and internal routes stay compatible with what you already had.",
      readyPointOne: "Login and dashboard stay active",
      readyPointTwo: "The remaining pages keep their current logic",
      readyPointThree: "The base is now ready for a larger migration later",
      nextTitle: "Next natural step",
      nextBody:
        "If you want, we can next migrate the rest of the experience to Vue + Tailwind with reusable components, without breaking the current backend.",
      ctaTitle: "Want a cleaner onboarding flow?",
      ctaBody:
        "Open the guided flow, prepare the email and choose the integrations before entering the platform.",
      ctaPrimary: "Open Get Started",
      ctaSecondary: "Go to login"
    },
    getStarted: {
      eyebrow: "Guided access flow",
      pageTitle: "Prepare your access request without skipping steps.",
      pageBody:
        "We do not throw you into a raw email button. First you add context, choose integrations and only then we open a pre-filled email ready to send.",
      stepOneTitle: "1. Fill it in",
      stepOneBody: "Tell us who you are, your email and what you want to achieve.",
      stepTwoTitle: "2. Review it",
      stepTwoBody: "We generate a clean preview before opening the email client.",
      stepThreeTitle: "3. Send it",
      stepThreeBody:
        "Your email client opens with the message ready, but final control still stays with you.",
      supportCardTitle: "Destination email",
      supportCardBody:
        "If your email client does not open automatically, copy the message and send it manually to:",
      formTitle: "Quick brief",
      formBody:
        "The clearer this context is, the easier it becomes to prepare the right account and integrations.",
      fieldName: "Name",
      fieldNamePlaceholder: "Your name",
      fieldEmail: "Email",
      fieldEmailPlaceholder: "you@company.com",
      fieldOrganization: "Project or organization",
      fieldOrganizationPlaceholder: "Example: thesis, internal team, product demo",
      fieldUseCase: "What do you want to do with the platform?",
      fieldUseCasePlaceholder:
        "Explain the goal, the kind of tasks and what you expect to automate.",
      fieldTimeline: "When do you want to start?",
      timelineSoon: "In the next few days",
      timelineMonth: "Still this month",
      timelineExplore: "I am just exploring",
      connectorsTitle: "Which integrations do you want to enable?",
      connectorDiscord: "Discord",
      connectorApple: "Apple Calendar",
      connectorGoogle: "Google Calendar",
      connectorNotion: "Notion",
      previewTitle: "Email preview",
      previewHint: "This email is built from the brief so it is easier to send.",
      previewSubjectLabel: "Subject",
      previewBodyLabel: "Message",
      composeButton: "Open email",
      copyButton: "Copy message",
      finalNote:
        "After clicking open email, confirm the send inside your email client.",
      previewEmpty: "Fill in the form to see the full email.",
      subjectDefault: "Movic onboarding request",
      subjectPrefix: "Movic onboarding request - ",
      mailGreeting: "Hello Movic team,",
      mailIntro: "I would like to request access to the platform and prepare my account.",
      mailLineName: "Name",
      mailLineEmail: "Email",
      mailLineOrganization: "Project/organization",
      mailLineUseCase: "Goal",
      mailLineConnectors: "Integrations",
      mailLineTimeline: "Start window",
      mailClosing: "Thank you.",
      connectorNone: "No integrations selected yet",
      copySuccess: "Message copied to the clipboard.",
      copyError: "I could not copy it automatically. You can still copy it manually."
    }
  }
} as const;

export function renderHomePage(contactEmail: string): string {
  return renderMarketingShell({
    title: "Movic",
    page: "home",
    contactEmail,
    content: renderHomeContent()
  });
}

export function renderGetStartedPage(contactEmail: string): string {
  return renderMarketingShell({
    title: "Movic | Get Started",
    page: "get-started",
    contactEmail,
    content: renderGetStartedContent(contactEmail)
  });
}

function renderHomeContent(): string {
  return `
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute left-[10%] top-[-6rem] h-80 w-80 rounded-full bg-cyan-400/20 blur-[130px]"></div>
      <div class="absolute right-[5%] top-[12rem] h-96 w-96 rounded-full bg-fuchsia-500/16 blur-[150px]"></div>
      <div class="absolute bottom-[-8rem] left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-blue-500/14 blur-[170px]"></div>
      <div class="grid-overlay absolute inset-0 opacity-40"></div>
    </div>

    <header class="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pb-4 pt-6 sm:px-8">
      <a class="flex items-center gap-3" href="/" aria-label="Movic home">
        <img class="h-11 w-auto drop-shadow-[0_0_28px_rgba(59,130,246,0.32)]" src="/assets/logo-wordmark.png" alt="Movic" />
      </a>
      <div class="flex items-center gap-3">
        ${renderLanguageToggle()}
        <a class="action-button-secondary hidden sm:inline-flex" href="/get-started" data-copy="navGetStarted">Comecar</a>
        <a class="action-button-primary" href="/login" data-copy="navLogin">Login</a>
      </div>
    </header>

    <main class="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 sm:px-8">
      <section class="reveal-block text-center" data-reveal>
        <div class="mx-auto inline-flex max-w-max items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-slate-300 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <span class="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]"></span>
          <span data-copy="eyebrow">Cockpit escuro para controlar tudo num so nucleo</span>
        </div>
        <h1 class="mx-auto mt-7 max-w-5xl font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-7xl" data-copy="heroTitle">
          Orquestra o bot, o chat e as integracoes a partir de uma home muito mais viva.
        </h1>
        <p class="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg" data-copy="heroBody">
          Esta entrada publica foi redesenhada para parecer produto a serio: visual dark, cerebro central, animacoes, PT/EN e uma narrativa mais clara antes do utilizador entrar na dashboard privada.
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a class="action-button-primary" href="/get-started" data-copy="heroPrimary">Abrir fluxo guiado</a>
          <a class="action-button-secondary" href="#flow" data-copy="heroSecondary">Ver o flow</a>
        </div>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-300">
          <span class="signal-chip" data-copy="chipOne">Discord por codigo seguro</span>
          <span class="signal-chip" data-copy="chipTwo">Integracoes privadas por utilizador</span>
          <span class="signal-chip" data-copy="chipThree">Landing pronta para PT / EN</span>
        </div>
      </section>

      <section class="reveal-block mt-14" data-reveal>
        <div class="glass-panel relative overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_35%),radial-gradient(circle_at_bottom,rgba(217,70,239,0.12),transparent_35%)]"></div>
          <div class="relative">
            <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
              <span class="mini-pill" data-copy="networkLabel">Nucleo interactivo</span>
              <span class="rounded-full border border-cyan-400/20 bg-cyan-400/8 px-4 py-2 text-xs font-semibold text-cyan-100" data-copy="orbitStatus">
                Tudo converge para um unico core
              </span>
            </div>

            <div class="lg:hidden">
              <div class="relative mx-auto flex h-[17rem] w-[17rem] items-center justify-center">
                <div class="absolute inset-0 rounded-full bg-cyan-400/20 blur-[90px]"></div>
                <div class="absolute inset-4 rounded-full border border-cyan-300/20"></div>
                <div class="absolute inset-0 rounded-full border border-fuchsia-400/15"></div>
                <img class="relative z-10 h-52 w-52 animate-float object-contain drop-shadow-[0_0_55px_rgba(99,102,241,0.55)]" src="/assets/icon-brain.png" alt="Movic core" />
              </div>
              <div class="mt-6 grid gap-4 sm:grid-cols-2">
                ${renderConnectorCard("Discord", "discordTitle", "discordBody", "from-sky-400/40 to-cyan-200/10")}
                ${renderConnectorCard("Apple", "appleTitle", "appleBody", "from-indigo-400/40 to-fuchsia-200/10")}
                ${renderConnectorCard("Google", "googleTitle", "googleBody", "from-emerald-400/40 to-cyan-200/10")}
                ${renderConnectorCard("Notion", "notionTitle", "notionBody", "from-fuchsia-400/40 to-violet-200/10")}
              </div>
            </div>

            <div class="relative hidden h-[34rem] lg:block" data-network>
              <div class="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/6"></div>
              <div class="pointer-events-none absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/10 animate-[spin_28s_linear_infinite]"></div>
              <div class="pointer-events-none absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-400/10 animate-[spin_38s_linear_infinite_reverse]"></div>

              <div class="beam absolute left-1/2 top-1/2 hidden w-64 origin-left -translate-y-1/2 rotate-[210deg] lg:block"></div>
              <div class="beam absolute left-1/2 top-1/2 hidden w-64 origin-left -translate-y-1/2 rotate-[325deg] lg:block"></div>
              <div class="beam absolute left-1/2 top-1/2 hidden w-72 origin-left -translate-y-1/2 rotate-[146deg] lg:block"></div>
              <div class="beam absolute left-1/2 top-1/2 hidden w-72 origin-left -translate-y-1/2 rotate-[34deg] lg:block"></div>

              <div class="absolute left-1/2 top-1/2 z-20 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2">
                <div class="absolute inset-0 rounded-full bg-cyan-400/18 blur-[90px]"></div>
                <div class="absolute inset-6 rounded-full bg-fuchsia-500/15 blur-[95px]"></div>
                <div class="absolute inset-3 rounded-full border border-white/10 bg-slate-950/55 backdrop-blur-2xl shadow-[0_0_90px_rgba(59,130,246,0.18)]"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                  <img class="h-72 w-72 animate-float object-contain drop-shadow-[0_0_90px_rgba(99,102,241,0.5)]" src="/assets/icon-brain.png" alt="Movic core" />
                </div>
              </div>

              <div class="absolute left-0 top-8 w-72" data-depth="16">
                ${renderConnectorCard("Discord", "discordTitle", "discordBody", "from-sky-400/45 to-cyan-200/10", true)}
              </div>
              <div class="absolute right-0 top-12 w-72" data-depth="12">
                ${renderConnectorCard("Apple", "appleTitle", "appleBody", "from-indigo-400/45 to-fuchsia-200/10", true)}
              </div>
              <div class="absolute bottom-10 left-8 w-72" data-depth="18">
                ${renderConnectorCard("Google", "googleTitle", "googleBody", "from-emerald-400/45 to-cyan-200/10", true)}
              </div>
              <div class="absolute bottom-8 right-6 w-72" data-depth="14">
                ${renderConnectorCard("Notion", "notionTitle", "notionBody", "from-fuchsia-400/45 to-violet-200/10", true)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-12 grid gap-6 lg:grid-cols-3">
        ${renderFeatureCard("01", "featureOneTitle", "featureOneBody")}
        ${renderFeatureCard("02", "featureTwoTitle", "featureTwoBody")}
        ${renderFeatureCard("03", "featureThreeTitle", "featureThreeBody")}
      </section>

      <section id="flow" class="mt-12 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article class="glass-panel reveal-block p-7" data-reveal>
          <span class="mini-pill">Flow</span>
          <h2 class="mt-5 font-display text-3xl font-bold text-white" data-copy="flowTitle">Como este novo flow esta pensado</h2>
          <p class="mt-4 max-w-2xl text-sm leading-7 text-slate-300" data-copy="flowBody">
            Em vez de empurrar o utilizador logo para um ecra seco, mostramos o valor, explicamos o funcionamento e so depois guiamos o pedido de acesso.
          </p>
          <div class="mt-8 grid gap-4">
            ${renderStepCard("stepOneTitle", "stepOneBody")}
            ${renderStepCard("stepTwoTitle", "stepTwoBody")}
            ${renderStepCard("stepThreeTitle", "stepThreeBody")}
          </div>
        </article>

        <div class="grid gap-6">
          <article class="glass-panel reveal-block p-7" data-reveal>
            <span class="mini-pill">Stable</span>
            <h2 class="mt-5 font-display text-2xl font-bold text-white" data-copy="readyTitle">O que continua a funcionar</h2>
            <p class="mt-4 text-sm leading-7 text-slate-300" data-copy="readyBody">
              So a camada publica foi elevada. O login, a dashboard e as rotas internas continuam compativeis com o que ja tinhas.
            </p>
            <ul class="mt-6 grid gap-3 text-sm text-slate-200">
              <li class="list-row" data-copy="readyPointOne">Login e dashboard continuam activos</li>
              <li class="list-row" data-copy="readyPointTwo">As outras paginas mantem a logica actual</li>
              <li class="list-row" data-copy="readyPointThree">A base fica pronta para uma migracao maior depois</li>
            </ul>
          </article>

          <article class="glass-panel reveal-block p-7" data-reveal>
            <span class="mini-pill">Vue + Tailwind</span>
            <h2 class="mt-5 font-display text-2xl font-bold text-white" data-copy="nextTitle">Proximo passo natural</h2>
            <p class="mt-4 text-sm leading-7 text-slate-300" data-copy="nextBody">
              Se quiseres, a seguir podemos migrar o resto da experiencia para Vue + Tailwind com componentes reutilizaveis, sem rebentar o backend existente.
            </p>
          </article>
        </div>
      </section>

      <section class="reveal-block mt-12" data-reveal>
        <div class="glass-panel relative overflow-hidden px-7 py-8 sm:px-10 sm:py-10">
          <div class="absolute -right-10 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-fuchsia-500/18 blur-[80px]"></div>
          <div class="absolute left-16 top-10 h-24 w-24 rounded-full bg-cyan-400/14 blur-3xl"></div>
          <div class="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div class="max-w-3xl">
              <span class="mini-pill">Onboarding</span>
              <h2 class="mt-5 font-display text-3xl font-bold text-white" data-copy="ctaTitle">Queres arrancar com um onboarding mais limpo?</h2>
              <p class="mt-4 text-base leading-8 text-slate-300" data-copy="ctaBody">
                Abre o fluxo guiado, prepara o email e decide as integracoes antes de entrares na plataforma.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <a class="action-button-primary" href="/get-started" data-copy="ctaPrimary">Abrir Get Started</a>
              <a class="action-button-secondary" href="/login" data-copy="ctaSecondary">Ir para login</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderGetStartedContent(contactEmail: string): string {
  const safeEmail = escapeHtml(contactEmail);

  return `
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute left-[8%] top-[-4rem] h-72 w-72 rounded-full bg-cyan-400/18 blur-[120px]"></div>
      <div class="absolute right-[8%] top-[15rem] h-80 w-80 rounded-full bg-fuchsia-500/16 blur-[140px]"></div>
      <div class="grid-overlay absolute inset-0 opacity-35"></div>
    </div>

    <header class="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pb-4 pt-6 sm:px-8">
      <a class="flex items-center gap-3" href="/" aria-label="Movic home">
        <img class="h-11 w-auto drop-shadow-[0_0_28px_rgba(59,130,246,0.32)]" src="/assets/logo-wordmark.png" alt="Movic" />
      </a>
      <div class="flex items-center gap-3">
        ${renderLanguageToggle()}
        <a class="action-button-secondary hidden sm:inline-flex" href="/" data-copy="navHome">Home</a>
        <a class="action-button-primary" href="/login" data-copy="navLogin">Login</a>
      </div>
    </header>

    <main class="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 sm:px-8">
      <section class="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <aside class="grid gap-6">
          <article class="glass-panel reveal-block p-7" data-reveal>
            <span class="mini-pill" data-copy="eyebrow">Fluxo guiado de acesso</span>
            <h1 class="mt-5 font-display text-4xl font-bold leading-tight text-white sm:text-5xl" data-copy="pageTitle">
              Prepara o teu pedido de acesso sem saltar etapas.
            </h1>
            <p class="mt-5 text-base leading-8 text-slate-300" data-copy="pageBody">
              Aqui nao te atiramos para um mail cru. Primeiro montas o contexto, escolhes integracoes e so no fim abrimos o email ja preparado para enviares.
            </p>
          </article>

          <article class="glass-panel reveal-block p-7" data-reveal>
            <div class="grid gap-4">
              ${renderStepCard("stepOneTitle", "stepOneBody")}
              ${renderStepCard("stepTwoTitle", "stepTwoBody")}
              ${renderStepCard("stepThreeTitle", "stepThreeBody")}
            </div>
          </article>

          <article class="glass-panel reveal-block p-7" data-reveal>
            <span class="mini-pill" data-copy="supportCardTitle">Email de destino</span>
            <p class="mt-5 text-sm leading-7 text-slate-300" data-copy="supportCardBody">
              Se o cliente de email nao abrir automaticamente, copia a mensagem e envia manualmente para:
            </p>
            <div class="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 font-mono text-sm text-cyan-100 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
              ${safeEmail}
            </div>
          </article>
        </aside>

        <div class="grid gap-6">
          <article class="glass-panel reveal-block p-7" data-reveal>
            <span class="mini-pill" data-copy="formTitle">Briefing rapido</span>
            <p class="mt-5 text-sm leading-7 text-slate-300" data-copy="formBody">
              Quanto mais claro vier este contexto, mais simples fica preparar a conta e as integracoes certas.
            </p>

            <form class="mt-8 grid gap-5" id="request-form">
              <div class="grid gap-5 md:grid-cols-2">
                ${renderField("request-name", "fieldName", "text", "fieldNamePlaceholder")}
                ${renderField("request-email", "fieldEmail", "email", "fieldEmailPlaceholder")}
              </div>
              ${renderField("request-organization", "fieldOrganization", "text", "fieldOrganizationPlaceholder")}
              <label class="grid gap-2">
                <span class="text-sm font-semibold text-slate-200" data-copy="fieldUseCase">O que queres fazer com a plataforma?</span>
                <textarea id="request-goal" rows="5" class="form-surface resize-none" data-placeholder="fieldUseCasePlaceholder" placeholder="Explica o objetivo, o tipo de tarefas e o que esperas automatizar."></textarea>
              </label>
              <label class="grid gap-2">
                <span class="text-sm font-semibold text-slate-200" data-copy="fieldTimeline">Quando queres comecar?</span>
                <select id="request-timeline" class="form-surface">
                  <option value="soon" data-copy="timelineSoon">Nos proximos dias</option>
                  <option value="month" data-copy="timelineMonth">Ainda este mes</option>
                  <option value="explore" data-copy="timelineExplore">Estou so a explorar</option>
                </select>
              </label>
              <fieldset class="grid gap-3">
                <legend class="text-sm font-semibold text-slate-200" data-copy="connectorsTitle">Que integracoes queres activar?</legend>
                <div class="grid gap-3 sm:grid-cols-2">
                  ${renderCheckbox("discord", "connectorDiscord")}
                  ${renderCheckbox("apple", "connectorApple")}
                  ${renderCheckbox("google", "connectorGoogle")}
                  ${renderCheckbox("notion", "connectorNotion")}
                </div>
              </fieldset>
            </form>
          </article>

          <article class="glass-panel reveal-block p-7" data-reveal>
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span class="mini-pill" data-copy="previewTitle">Pre-visualizacao do email</span>
                <p class="mt-4 text-sm leading-7 text-slate-300" data-copy="previewHint">
                  Este email e construido a partir do briefing para ficar mais facil enviar.
                </p>
              </div>
              <a id="compose-email" class="action-button-primary" href="mailto:${safeEmail}" data-copy="composeButton">
                Abrir email
              </a>
            </div>

            <div class="mt-7 grid gap-5">
              <div class="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500" data-copy="previewSubjectLabel">Assunto</div>
                <div id="email-subject-preview" class="mt-3 text-base font-semibold text-white"></div>
              </div>
              <div class="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500" data-copy="previewBodyLabel">Mensagem</div>
                <pre id="email-body-preview" class="mt-3 whitespace-pre-wrap font-body text-sm leading-7 text-slate-200"></pre>
              </div>
            </div>

            <div class="mt-6 flex flex-wrap items-center gap-3">
              <button id="copy-email" class="action-button-secondary" type="button" data-copy="copyButton">Copiar mensagem</button>
              <a class="action-button-secondary" href="/login" data-copy="navLogin">Login</a>
            </div>
            <p class="mt-4 text-sm text-slate-400" data-copy="finalNote">
              Depois de clicares em abrir email, confirma o envio no teu cliente de email.
            </p>
            <p id="copy-feedback" class="mt-3 min-h-[1.5rem] text-sm font-semibold text-cyan-100"></p>
          </article>
        </div>
      </section>
    </main>
  `;
}

function renderMarketingShell(input: {
  title: string;
  page: MarketingPage;
  contactEmail: string;
  content: string;
}): string {
  return `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#030712" />
    <title>${escapeHtml(input.title)}</title>
    <link rel="icon" type="image/png" href="/assets/icon-brain.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com?plugins=forms"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: {
              body: ["Space Grotesk", "Segoe UI", "sans-serif"],
              display: ["Sora", "Segoe UI", "sans-serif"]
            }
          }
        }
      };
    </script>
    <style type="text/tailwindcss">
      @layer base {
        html { scroll-behavior: smooth; }
        body { @apply min-h-screen bg-slate-950 font-body text-slate-100 antialiased; }
      }

      @layer components {
        .glass-panel { @apply rounded-[2rem] border border-white/10 bg-white/[0.05] backdrop-blur-2xl shadow-[0_30px_120px_rgba(2,6,23,0.65)]; }
        .action-button-primary { @apply inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(56,189,248,0.32)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(217,70,239,0.28)]; }
        .action-button-secondary { @apply inline-flex items-center justify-center rounded-full border border-white/12 bg-white/6 px-5 py-3 text-sm font-semibold text-slate-100 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-400/8; }
        .mini-pill { @apply inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-200; }
        .signal-chip { @apply inline-flex items-center rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]; }
        .connector-card { @apply rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.55)] backdrop-blur-xl; }
        .feature-card { @apply glass-panel reveal-block p-7; }
        .step-card { @apply rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl; }
        .list-row { @apply flex items-start gap-3 rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-4; }
        .form-surface { @apply w-full rounded-[1.25rem] border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/20; }
        .checkbox-surface { @apply flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-200 transition duration-300 hover:border-cyan-300/40 hover:bg-cyan-400/6; }
      }

      @layer utilities {
        .grid-overlay {
          background-image:
            linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.95), transparent 88%);
        }

        .beam {
          height: 2px;
          border-radius: 9999px;
          background: linear-gradient(90deg, rgba(34, 211, 238, 0.7), rgba(168, 85, 247, 0.4), transparent);
          box-shadow: 0 0 26px rgba(34, 211, 238, 0.3);
          animation: beamPulse 3.2s ease-in-out infinite;
        }

        .reveal-block {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 700ms ease, transform 700ms ease;
        }

        .reveal-block.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
      }
    </style>
    <style>
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-12px); }
      }

      @keyframes beamPulse {
        0%, 100% { opacity: 0.5; transform: scaleX(0.96); }
        50% { opacity: 1; transform: scaleX(1); }
      }

      .animate-float { animation: float 7s ease-in-out infinite; }

      .list-row::before {
        content: "";
        display: block;
        margin-top: 0.35rem;
        height: 0.625rem;
        width: 0.625rem;
        flex-shrink: 0;
        border-radius: 9999px;
        background: rgb(125 211 252);
        box-shadow: 0 0 16px rgba(125, 211, 252, 0.9);
      }
    </style>
  </head>
  <body data-page="${input.page}" class="relative overflow-x-hidden">
    <div class="relative isolate min-h-screen">${input.content}</div>
    ${renderMarketingClientScript(input.page, input.contactEmail)}
  </body>
</html>`;
}

function renderMarketingClientScript(page: MarketingPage, contactEmail: string): string {
  return `<script>
    (() => {
      const page = ${serializeForInlineScript(page)};
      const contactEmail = ${serializeForInlineScript(contactEmail)};
      const copy = ${serializeForInlineScript(MARKETING_COPY)};
      const root = document.documentElement;
      const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
      const copyNodes = Array.from(document.querySelectorAll("[data-copy]"));
      const placeholderNodes = Array.from(document.querySelectorAll("[data-placeholder]"));
      let currentLanguage = localStorage.getItem("movic-language");

      if (currentLanguage !== "pt" && currentLanguage !== "en") {
        currentLanguage = navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
      }

      function dictionary(lang) {
        return { ...copy[lang].common, ...copy[lang][page] };
      }

      function t(key) {
        const langCopy = dictionary(currentLanguage);
        return langCopy[key] ?? key;
      }

      function applyLanguage(lang) {
        currentLanguage = lang;
        localStorage.setItem("movic-language", lang);
        root.lang = lang;

        copyNodes.forEach((node) => {
          const key = node.getAttribute("data-copy");
          if (key) {
            node.textContent = t(key);
          }
        });

        placeholderNodes.forEach((node) => {
          const key = node.getAttribute("data-placeholder");
          if (key) {
            node.setAttribute("placeholder", t(key));
          }
        });

        document.querySelectorAll("[data-lang-button]").forEach((button) => {
          const active = button.getAttribute("data-lang-button") === lang;
          button.setAttribute("aria-pressed", String(active));
          button.classList.toggle("bg-white/12", active);
          button.classList.toggle("border-white/30", active);
          button.classList.toggle("text-white", active);
          button.classList.toggle("bg-transparent", !active);
          button.classList.toggle("text-slate-300", !active);
        });

        if (page === "get-started") {
          updateEmailPreview();
        }
      }

      function setupReveal() {
        if (!("IntersectionObserver" in window)) {
          revealItems.forEach((item) => item.classList.add("is-visible"));
          return;
        }

        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.16 });

        revealItems.forEach((item) => observer.observe(item));
      }

      function setupParallax() {
        const network = document.querySelector("[data-network]");
        if (!network) {
          return;
        }

        const layers = Array.from(network.querySelectorAll("[data-depth]"));

        network.addEventListener("pointermove", (event) => {
          const bounds = network.getBoundingClientRect();
          const offsetX = event.clientX - bounds.left - bounds.width / 2;
          const offsetY = event.clientY - bounds.top - bounds.height / 2;

          layers.forEach((layer) => {
            const depth = Number(layer.getAttribute("data-depth") ?? "0");
            const x = (offsetX / bounds.width) * depth;
            const y = (offsetY / bounds.height) * depth;
            layer.style.transform = "translate3d(" + x.toFixed(2) + "px, " + y.toFixed(2) + "px, 0)";
          });
        });

        network.addEventListener("pointerleave", () => {
          layers.forEach((layer) => {
            layer.style.transform = "";
          });
        });
      }

      function getFieldValue(id) {
        const field = document.getElementById(id);
        return field && "value" in field ? String(field.value || "").trim() : "";
      }

      function getTimelineLabel(value) {
        const mapping = {
          soon: t("timelineSoon"),
          month: t("timelineMonth"),
          explore: t("timelineExplore")
        };
        return mapping[value] ?? t("timelineExplore");
      }

      function getSelectedConnectors() {
        return Array.from(document.querySelectorAll("input[name='connector']:checked"))
          .map((input) => {
            const value = input.getAttribute("value");
            if (value === "discord") return t("connectorDiscord");
            if (value === "apple") return t("connectorApple");
            if (value === "google") return t("connectorGoogle");
            if (value === "notion") return t("connectorNotion");
            return value ?? "";
          })
          .filter(Boolean);
      }

      function buildEmail() {
        const name = getFieldValue("request-name");
        const email = getFieldValue("request-email");
        const organization = getFieldValue("request-organization");
        const goal = getFieldValue("request-goal");
        const timeline = getTimelineLabel(getFieldValue("request-timeline"));
        const connectors = getSelectedConnectors();
        const connectorText = connectors.length > 0 ? connectors.join(", ") : t("connectorNone");
        const subjectSeed = name || organization;
        const subject = subjectSeed ? t("subjectPrefix") + subjectSeed : t("subjectDefault");
        const lines = [
          t("mailGreeting"),
          "",
          t("mailIntro"),
          "",
          t("mailLineName") + ": " + (name || "-"),
          t("mailLineEmail") + ": " + (email || "-"),
          t("mailLineOrganization") + ": " + (organization || "-"),
          t("mailLineUseCase") + ": " + (goal || "-"),
          t("mailLineConnectors") + ": " + connectorText,
          t("mailLineTimeline") + ": " + timeline,
          "",
          t("mailClosing")
        ];

        return { subject, body: lines.join("\\n") };
      }

      function buildMailtoLink(subject, body) {
        return "mailto:" + contactEmail + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      }

      function updateEmailPreview() {
        const subjectPreview = document.getElementById("email-subject-preview");
        const bodyPreview = document.getElementById("email-body-preview");
        const composeLink = document.getElementById("compose-email");

        if (!subjectPreview || !bodyPreview || !composeLink) {
          return;
        }

        const emailData = buildEmail();
        subjectPreview.textContent = emailData.subject;
        bodyPreview.textContent = emailData.body || t("previewEmpty");
        composeLink.setAttribute("href", buildMailtoLink(emailData.subject, emailData.body));
      }

      function setupGetStarted() {
        if (page !== "get-started") {
          return;
        }

        const form = document.getElementById("request-form");
        const copyButton = document.getElementById("copy-email");
        const feedback = document.getElementById("copy-feedback");

        if (form) {
          form.addEventListener("input", updateEmailPreview);
          form.addEventListener("change", updateEmailPreview);
        }

        if (copyButton && feedback) {
          copyButton.addEventListener("click", async () => {
            const emailData = buildEmail();
            const text = "To: " + contactEmail + "\\nSubject: " + emailData.subject + "\\n\\n" + emailData.body;

            try {
              await navigator.clipboard.writeText(text);
              feedback.textContent = t("copySuccess");
            } catch {
              feedback.textContent = t("copyError");
            }
          });
        }

        updateEmailPreview();
      }

      document.querySelectorAll("[data-lang-button]").forEach((button) => {
        button.addEventListener("click", () => {
          const nextLanguage = button.getAttribute("data-lang-button");
          if (nextLanguage === "pt" || nextLanguage === "en") {
            applyLanguage(nextLanguage);
          }
        });
      });

      applyLanguage(currentLanguage);
      setupReveal();
      setupParallax();
      setupGetStarted();
    })();
  </script>`;
}

function renderLanguageToggle(): string {
  return `
    <div class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <button type="button" class="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300 transition duration-200" data-lang-button="pt" aria-pressed="false">
        PT
      </button>
      <button type="button" class="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300 transition duration-200" data-lang-button="en" aria-pressed="false">
        EN
      </button>
    </div>
  `;
}

function renderConnectorCard(
  label: string,
  titleKey: string,
  bodyKey: string,
  gradientClass: string,
  animated = false
): string {
  return `
    <article class="connector-card ${animated ? "animate-float" : ""}">
      <div class="flex items-start gap-4">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientClass} text-sm font-bold text-white shadow-[0_0_26px_rgba(125,211,252,0.18)]">
          ${escapeHtml(label.slice(0, 1))}
        </div>
        <div>
          <span class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">${escapeHtml(label)}</span>
          <h3 class="mt-2 text-lg font-semibold text-white" data-copy="${titleKey}"></h3>
          <p class="mt-2 text-sm leading-7 text-slate-300" data-copy="${bodyKey}"></p>
        </div>
      </div>
    </article>
  `;
}

function renderFeatureCard(indexLabel: string, titleKey: string, bodyKey: string): string {
  return `
    <article class="feature-card" data-reveal>
      <span class="mini-pill">${escapeHtml(indexLabel)}</span>
      <h2 class="mt-5 font-display text-2xl font-bold text-white" data-copy="${titleKey}"></h2>
      <p class="mt-4 text-sm leading-7 text-slate-300" data-copy="${bodyKey}"></p>
    </article>
  `;
}

function renderStepCard(titleKey: string, bodyKey: string): string {
  return `
    <article class="step-card">
      <h3 class="text-lg font-semibold text-white" data-copy="${titleKey}"></h3>
      <p class="mt-2 text-sm leading-7 text-slate-300" data-copy="${bodyKey}"></p>
    </article>
  `;
}

function renderField(
  id: string,
  labelKey: string,
  type: string,
  placeholderKey: string
): string {
  return `
    <label class="grid gap-2">
      <span class="text-sm font-semibold text-slate-200" data-copy="${labelKey}"></span>
      <input id="${escapeHtml(id)}" type="${escapeHtml(type)}" class="form-surface" data-placeholder="${placeholderKey}" />
    </label>
  `;
}

function renderCheckbox(value: string, labelKey: string): string {
  return `
    <label class="checkbox-surface">
      <input class="h-4 w-4 rounded border-white/20 bg-slate-950/60 text-cyan-300 focus:ring-cyan-300/30" type="checkbox" name="connector" value="${escapeHtml(value)}" />
      <span data-copy="${labelKey}"></span>
    </label>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
