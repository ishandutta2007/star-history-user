<template>
  <div :class="['repo-list-panel', { 'collapsed': !isOpen }]">
    <button class="toggle-button" @click="togglePanel">
      {{ isOpen ? '→' : '↔' }}
    </button>
    <div v-if="isOpen" class="panel-content">
      <h3>Top {{ repos.length }} Repositories by Stars</h3>
<h4>Total({{ repos.length }} repos) = {{ repos.reduce((sum, repo) => sum + repo.stargazers_count, 0) }} Stars</h4>
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
import { defineEmits, defineProps, ref, watch } from "vue";

const props = defineProps({
	repos: {
		type: Array,
		default: () => [],
	},
	isOpen: {
		type: Boolean,
		default: true,
	},
});

const emit = defineEmits(["update:isOpen"]);

const localIsOpen = ref(props.isOpen);

watch(
	() => props.isOpen,
	(newVal) => {
		localIsOpen.value = newVal;
	},
);

const togglePanel = () => {
	localIsOpen.value = !localIsOpen.value;
	emit("update:isOpen", localIsOpen.value);
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
  box-shadow: -2px 0 5px rgba(0,0,0,0.1);
  overflow-x: visible;
  transition: width 0.3s ease; /* Smooth transition for width changes */
  z-index: 1002;
}

.repo-list-panel.collapsed {
  width: 40px; /* Collapsed width, just enough for the button */
  padding: 0;
  overflow: visible;
}

.toggle-button {
  position: absolute;
  font-size: 20px;
  left: -20px; /*Position button outside the panel */
  top: 50%;
  transform: translateY(-50%);
  background-color: #f8f8f8;
  border: 1px solid #eee;
  border-top: none;
  border-bottom: none;
  border-right: none;
  border-left: 1px solid #eee;
  box-shadow: -2px 0 0 rgba(0, 0, 0, 0.1);
  padding: 5px 10px;
  cursor: pointer;
  border-radius: 15px 0 0 15px;
  z-index: 1001; /* Ensure button is above panel */
}

.panel-content {
  padding: 20px; /* Ensure content padding when open */
  overflow-y: auto;
  height: 100%;
}

.repo-list-panel h3 {
  margin-top: 0;
  margin-bottom: 0;
  color: #333;
}

.repo-list-panel h3,.repo-list-panel h4 {
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
