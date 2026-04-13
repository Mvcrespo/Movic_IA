<script setup lang="ts">
import ChangePasswordPage from "./pages/ChangePasswordPage.vue";
import CreatedUserPage from "./pages/CreatedUserPage.vue";
import DashboardPage from "./pages/DashboardPage.vue";
import ErrorPage from "./pages/ErrorPage.vue";
import GetStartedPage from "./pages/GetStartedPage.vue";
import HomePage from "./pages/HomePage.vue";
import LoginPage from "./pages/LoginPage.vue";
import NotFoundPage from "./pages/NotFoundPage.vue";
import type { FrontendContext } from "./types";

const context = window.__MOVIC_CONTEXT__ as FrontendContext;
</script>

<template>
  <HomePage v-if="context.page === 'home'" v-bind="context.payload" />
  <GetStartedPage v-else-if="context.page === 'get-started'" v-bind="context.payload" />
  <LoginPage v-else-if="context.page === 'login'" v-bind="context.payload" />
  <ChangePasswordPage v-else-if="context.page === 'change-password'" v-bind="context.payload" />
  <DashboardPage v-else-if="context.page === 'dashboard'" v-bind="context.payload" />
  <CreatedUserPage v-else-if="context.page === 'created-user'" v-bind="context.payload" />
  <NotFoundPage v-else-if="context.page === 'not-found'" />
  <ErrorPage v-else v-bind="context.payload" />
</template>
