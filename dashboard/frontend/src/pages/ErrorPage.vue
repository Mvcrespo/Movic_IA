<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-6 py-10">
    <section class="glass-card w-full max-w-xl rounded-[2rem] p-8 text-center">
      <img class="mx-auto h-14 w-auto" :src="'/assets/logo-wordmark.png'" alt="Movic" />
      <h1 class="font-display mt-8 text-4xl font-bold text-white">Algo correu mal</h1>
      <p class="mt-4 text-base leading-8 text-slate-300">{{ message }}</p>
      <a class="primary-button mt-8 inline-flex rounded-full px-5 py-3 text-sm font-semibold" href="/home">Voltar</a>
    </section>
  </div>
</template>
