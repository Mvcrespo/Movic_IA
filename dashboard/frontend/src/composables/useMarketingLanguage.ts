import { onMounted, ref, watch } from "vue";
import type { MarketingLanguage } from "../marketingCopy";

const language = ref<MarketingLanguage>("pt");
let initialized = false;
let storageListenerAttached = false;

function resolveBrowserLanguage(): MarketingLanguage {
  if (typeof window === "undefined") {
    return "pt";
  }

  const stored = window.localStorage.getItem("movic-language");
  if (stored === "pt" || stored === "en") {
    return stored;
  }

  return navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
}

function syncDocumentLanguage(value: MarketingLanguage) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = value;
  }
}

function ensureInitialized(defaultLanguage: MarketingLanguage) {
  if (!initialized) {
    language.value = resolveBrowserLanguage() ?? defaultLanguage;
    syncDocumentLanguage(language.value);
    initialized = true;
  }

  if (typeof window !== "undefined" && !storageListenerAttached) {
    window.addEventListener("storage", (event) => {
      if (event.key === "movic-language" && (event.newValue === "pt" || event.newValue === "en")) {
        language.value = event.newValue;
      }
    });
    storageListenerAttached = true;
  }
}

watch(language, (value) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("movic-language", value);
  }
  syncDocumentLanguage(value);
});

export function useMarketingLanguage(defaultLanguage: MarketingLanguage = "pt") {
  onMounted(() => {
    ensureInitialized(defaultLanguage);
  });

  return language;
}
