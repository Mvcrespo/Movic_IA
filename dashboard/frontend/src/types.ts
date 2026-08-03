export type AppUserRole = "admin" | "user";

export type AppUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: AppUserRole;
  mustChangePassword: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type RuntimeSettings = {
  id: string;
  userId: string;
  conversationPlatform: "discord" | "telegram";
  conversationChannelId: string | null;
  enabled: boolean;
  isPrimary: boolean;
  updatedAt: string;
  linkedUserId: string | null;
  linkedUsername: string | null;
  linkedDiscordUserId: string | null;
  linkedDiscordUsername: string | null;
  linkedAt: string | null;
  linkCode: string | null;
  linkCodeExpiresAt: string | null;
};

export type AppleCalendarOption = {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
};

export type GoogleCalendarOption = {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
  primary: boolean;
};

export type AppleCalendarConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  accountEmail: string | null;
  defaultCalendarId: string | null;
  defaultCalendarName: string | null;
  discoveredCalendars: AppleCalendarOption[];
  syncMode: string;
  lastTestedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  hasStoredSecret: boolean;
};

export type GoogleCalendarConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  accountEmail: string | null;
  defaultCalendarId: string | null;
  defaultCalendarName: string | null;
  discoveredCalendars: GoogleCalendarOption[];
  syncMode: string;
  lastTestedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type NotionConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  workspaceName: string | null;
  workspaceId: string | null;
  workspaceIcon: string | null;
  databaseId: string | null;
  databaseUrl: string | null;
  syncMode: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type DiscordBotIdentity = {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
};

export type SleepNotificationPreferences = {
  userId: string;
  enabled: boolean;
  sleepStartTime: string | null;
  sleepEndTime: string | null;
  wakeStartTime: string | null;
  wakeEndTime: string | null;
  onboardingStep: "sleep" | "wake" | null;
  lastEveningSentOn: string | null;
  lastMorningSentOn: string | null;
  updatedAt: string;
};

export type RuntimeChatLinks = {
  discord: RuntimeSettings | null;
  telegram: RuntimeSettings | null;
};

export type DashboardTab = "discord" | "telegram" | "apple" | "google" | "notion" | "users";

export type FrontendContext =
  | {
      page: "home";
      payload: {
        contactEmail: string;
        isAuthenticated: boolean;
      };
    }
  | {
      page: "get-started";
      payload: {
        contactEmail: string;
      };
    }
  | {
      page: "privacy-policy";
      payload: {
        contactEmail: string;
        isAuthenticated: boolean;
      };
    }
  | {
      page: "terms-of-service";
      payload: {
        contactEmail: string;
        isAuthenticated: boolean;
      };
    }
  | {
      page: "login";
      payload: {
        errorCode: "invalid_credentials" | "inactive" | null;
      };
    }
  | {
      page: "change-password";
      payload: {
        user: AppUser;
        errorMessage: string | null;
      };
    }
  | {
      page: "dashboard";
      payload: {
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
      };
    }
  | {
      page: "created-user";
      payload: {
        admin: AppUser;
        createdUser?: AppUser;
        temporaryPassword?: string;
        error?: string;
      };
    }
  | {
      page: "not-found";
      payload: Record<string, never>;
    }
  | {
      page: "error";
      payload: {
        message: string;
      };
    };

declare global {
  interface Window {
    __MOVIC_CONTEXT__: FrontendContext;
  }
}
