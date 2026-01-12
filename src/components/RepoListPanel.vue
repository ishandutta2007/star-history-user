<template>
  <div :class="['repo-list-panel', { 'collapsed': !isOpen }]">
    <button class="toggle-button" @click="togglePanel">
      {{ isOpen ? '↔' : '→' }}
    </button>
    <div v-if="isOpen" class="panel-content">
      <h3>Top {{ repos.length }} Repositories by Stars</h3>
      <ul v-if="repos.length">
        <li v-for="repo in repos" :key="repo.id">
          <a :href="repo.html_url" target="_blank">{{ repo.name }}</a>: {{ repo.stargazers_count }} ⭐
        </li>
      </ul>
      <p v-else>No repositories to display yet.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits, watch } from 'vue';

const props = defineProps({
  repos: {
    type: Array,
    default: () => []
  },
  isOpen: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['update:isOpen']);

const localIsOpen = ref(props.isOpen);

watch(() => props.isOpen, (newVal) => {
  localIsOpen.value = newVal;
});

const togglePanel = () => {
  localIsOpen.value = !localIsOpen.value;
  emit('update:isOpen', localIsOpen.value);
};
</script>

<style scoped>
.repo-list-panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100%;
  width: 250px;
  background-color: #f8f8f8;
  border-left: 1px solid #eee;
  padding: 20px;
  box-shadow: -2px 0 5px rgba(0,0,0,0.1);
  overflow-y: auto;
  z-index: 1000;
  transition: width 0.3s ease; /* Smooth transition for width changes */
}

.repo-list-panel.collapsed {
  width: 50px; /* Collapsed width, just enough for the button */
  padding: 0;
  overflow-x: hidden; /* Hide content when collapsed */
}

.toggle-button {
  position: absolute;
  left: -20px; /* Position button outside the panel */
  top: 50%;
  transform: translateY(-50%);
  background-color: #007bff;
  color: white;
  border: none;
  padding: 5px 10px;
  cursor: pointer;
  border-radius: 5px 0 0 5px;
  z-index: 1001; /* Ensure button is above panel */
}

.panel-content {
  padding: 20px; /* Ensure content padding when open */
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
