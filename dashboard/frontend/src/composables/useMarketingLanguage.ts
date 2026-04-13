import { onMounted, ref, watch } from "vue";
import type { MarketingLanguage } from "../marketingCopy";

export function useMarketingLanguage(defaultLanguage: MarketingLanguage = "pt") {
  const language = ref<MarketingLanguage>(defaultLanguage);

  function detectLanguage() {
    const stored = window.localStorage.getItem("movic-language");
    if (stored === "pt" || stored === "en") {
      language.value = stored;
      return;
    }

    language.value = navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
  }

  watch(language, (value) => {
    document.documentElement.lang = value;
    window.localStorage.setItem("movic-language", value);
  });

  onMounted(detectLanguage);

  return language;
}
