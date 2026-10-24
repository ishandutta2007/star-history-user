<script setup>
import { Chart, registerables } from "chart.js";
import { computed, onMounted, ref, watch } from "vue";
import RepoListPanel from "./components/RepoListPanel.vue"; // Import the new component
import { loadUserStarHistory } from "./utils/githubHistory.js";

Chart.register(...registerables);

const username = ref("");
const chartCanvas = ref(null);
let chartInstance = null;
const loading = ref(false);
const error = ref(null);
const message = ref("");
const topRepos = ref([]);
const maxRepos = ref(10);
const notices = ref([]);
const isPanelOpen = ref(true); // Track panel open state
const showPopup = ref(false);
let popupTimeout = null;

// Watch for changes in username and save to localStorage
watch(username, (newUsername) => {
	localStorage.setItem("github_username", newUsername);
});

const mainContentMarginRight = computed(() => {
	return isPanelOpen.value ? "250px" : "50px"; // Panel width: 250px open, 50px collapsed
});

const getStarHistory = async () => {
  if (loading.value) return;

  // Clear any pending popup and stale history before starting another request.
  if (popupTimeout) clearTimeout(popupTimeout);
  showPopup.value = false;
  loading.value = true;
  error.value = null;
  message.value = "";
  notices.value = [];
  topRepos.value = [];
  chartInstance.data.labels = [];
  chartInstance.data.datasets[0].data = [];
  chartInstance.update();

  try {
    const selectedUser = username.value.trim();
    const result = await loadUserStarHistory({
      username: selectedUser,
      maxRepos: maxRepos.value,
      onProgress: (progress) => { message.value = progress; },
    });

    topRepos.value = result.repos;
    chartInstance.data.labels = result.chart.labels;
    chartInstance.data.datasets[0].data = result.chart.data;
    chartInstance.update();

    notices.value = [...result.notices];
    if (result.partial) {
      notices.value.unshift(
        `Partial coverage: ${result.repos.length} of ${result.requested} repositories included. Only completed histories are shown.`,
      );
    }
    if (result.chart.labels.length === 0) {
      notices.value.push("No star history was available for the completed repositories.");
    }

    const url = new URL(window.location);
    url.searchParams.set("user", selectedUser);
    window.history.pushState({}, "", url);
    popupTimeout = setTimeout(() => { showPopup.value = true; }, 15000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
    message.value = "";
  }
};

// Load username from localStorage or URL parameter
onMounted(async () => {
	const ctx = chartCanvas.value.getContext("2d");
	chartInstance = new Chart(ctx, {
		type: "line",
		data: {
			labels: [],
			datasets: [
				{
					label: "Total Stars",
					data: [],
					fill: false,
					borderColor: "rgb(75, 192, 192)",
					tension: 0.1,
				},
			],
		},
	});

	const urlParams = new URLSearchParams(window.location.search);
	const userParam = urlParams.get("user");
	if (userParam) {
		username.value = userParam;
		await getStarHistory();
	} else {
		const savedUsername = localStorage.getItem("github_username");
		if (savedUsername) {
			username.value = savedUsername;
		}
	}
});
</script>

<template>
  <div id="app">
    <div class="main-content" :style="{ 'margin-right': mainContentMarginRight }">
      <header class="header">
        <h1>GitHub User Star History</h1>
        <div class="github-buttons">
          <iframe src="https://ghbtns.com/github-btn.html?user=ishandutta2007&repo=star-history-user&type=star&count=true&size=large" frameborder="0" scrolling="0" width="170" height="30" title="GitHub"></iframe>
          <iframe src="https://ghbtns.com/github-btn.html?user=ishandutta2007&type=follow&count=true&size=large" frameborder="0" scrolling="0" width="230" height="30" title="GitHub"></iframe>
        </div>
      </header>
      <form @submit.prevent="getStarHistory">
        <input type="text" v-model="username" placeholder="Enter a GitHub username" />
        <label for="repoLimit">Top repositories:</label>
        <select id="repoLimit" v-model.number="maxRepos" :disabled="loading">
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
        <button type="submit" :disabled="loading">{{ loading ? 'Loading...' : 'Generate Chart' }}</button>
      </form>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="message">{{ message }}</div>
      <ul v-if="notices.length" class="notices" aria-live="polite">
        <li v-for="notice in notices" :key="notice">{{ notice }}</li>
      </ul>
      <p class="data-note">History uses GitHub weekly aggregates. Day boundaries are approximate, and historical events may differ from currently starred totals.</p>
      <canvas ref="chartCanvas"></canvas>
    </div>
    <RepoListPanel :repos="topRepos" v-model:isOpen="isPanelOpen" />

    <!-- Support Popup -->
    <div v-if="showPopup" class="popup-overlay" @click.self="showPopup = false">
      <div class="popup-content">
        <button class="close-btn" @click="showPopup = false">&times;</button>
        <h2>Support this project!</h2>
        <p>If you like this tool, please consider starring the repo and following the author on GitHub.</p>
        <div class="github-buttons popup-buttons">
          <iframe src="https://ghbtns.com/github-btn.html?user=ishandutta2007&repo=star-history-user&type=star&count=true&size=large" frameborder="0" scrolling="0" width="170" height="30" title="GitHub"></iframe>
          <iframe src="https://ghbtns.com/github-btn.html?user=ishandutta2007&type=follow&count=true&size=large" frameborder="0" scrolling="0" width="230" height="30" title="GitHub"></iframe>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
#app {
  display: flex; /* Use flexbox for layout */
  /* Remove max-width: 100%; */
  margin: 0 auto;
  font-family: sans-serif;
  text-align: center;
}

.main-content {
  flex-grow: 1; /* Allows main content to take available space */
  padding: 2rem;
  /* margin-right is now dynamic */
  transition: margin-right 0.3s ease; /* Smooth transition for margin changes */
}

.header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.header h1 {
  margin: 0;
}

.github-buttons {
  display: flex;
  gap: 1rem;
  align-items: center;
}

input {
  padding: 0.75rem 1rem; /* Slightly more padding */
  margin-right: 0.5rem;
  border: 1px solid #ccc; /* Add a subtle border */
  border-radius: 8px; /* Rounded corners */
  font-size: 1rem; /* Consistent font size */
  transition: all 0.2s ease-in-out; /* Smooth transitions */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); /* Subtle shadow */
}

input:focus {
  border-color: #007bff; /* Highlight border on focus */
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25); /* Focus ring */
  outline: none; /* Remove default outline */
}

button {
  padding: 0.75rem 1.5rem; /* More padding for a larger button */
  background-color: #007bff; /* Blue background */
  color: white; /* White text */
  border: none; /* No border */
  border-radius: 8px; /* Rounded corners */
  font-size: 1rem; /* Consistent font size */
  cursor: pointer; /* Pointer cursor on hover */
  transition: all 0.2s ease-in-out; /* Smooth transitions */
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); /* Subtle shadow */
}

button:hover:not(:disabled) {
  background-color: #0056b3; /* Darker blue on hover */
  box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15); /* Slightly larger shadow on hover */
  transform: translateY(-1px); /* Slight lift effect */
}

button:disabled {
  background-color: #cccccc; /* Grey background when disabled */
  cursor: not-allowed; /* Not-allowed cursor */
  box-shadow: none;
}

select {
  margin: 0.5rem 0.75rem 0.5rem 0.25rem;
  padding: 0.65rem;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: white;
}

.notices {
  text-align: left;
  color: #6d4200;
}

.data-note {
  color: #555;
  font-size: 0.85rem;
}

canvas {
  margin-top: 2rem;
}

.error {
  color: red;
  margin-top: 1rem;
}

/* Popup Styles */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.popup-content {
  background: white;
  padding: 2.5rem;
  border-radius: 16px;
  position: relative;
  max-width: 500px;
  width: 90%;
  text-align: center;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #888;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #333;
}

.popup-content h2 {
  margin-top: 0;
  color: #333;
}

.popup-content p {
  color: #666;
  margin-bottom: 2rem;
  line-height: 1.5;
}

.popup-buttons {
  justify-content: center;
}
</style>