<template>
  <div class="repo-list-panel">
    <h3>Top 10 Repositories by Stars</h3>
    <ul v-if="repos.length">
      <li v-for="repo in repos" :key="repo.id">
        <a :href="repo.html_url" target="_blank">{{ repo.name }}</a>: {{ repo.stargazers_count }} ⭐
      </li>
    </ul>
    <p v-else>No repositories to display yet.</p>
  </div>
</template>

<script setup>
import { defineProps } from 'vue';

const props = defineProps({
  repos: {
    type: Array,
    default: () => []
  }
});
</script>

<style scoped>
.repo-list-panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100%;
  width: 250px; /* Adjust width as needed */
  background-color: #f8f8f8;
  border-left: 1px solid #eee;
  padding: 20px;
  box-shadow: -2px 0 5px rgba(0,0,0,0.1);
  overflow-y: auto; /* Enable scrolling if content overflows */
  z-index: 1000; /* Ensure it stays on top */
}

.repo-list-panel h3 {
  margin-top: 0;
  color: #333;
}

.repo-list-panel ul {
  list-style: none;
  padding: 0;
}

.repo-list-panel li {
  margin-bottom: 10px;
}

.repo-list-panel a {
  text-decoration: none;
  color: #007bff;
}

.repo-list-panel a:hover {
  text-decoration: underline;
}
</style>
