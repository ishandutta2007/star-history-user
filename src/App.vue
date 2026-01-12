<script setup>
import { ref, onMounted, computed } from 'vue';
import { Chart, registerables } from 'chart.js';
import { GITHUB_TOKEN } from './github_token.js';
import RepoListPanel from './components/RepoListPanel.vue'; // Import the new component

Chart.register(...registerables);

const username = ref('');
const chartCanvas = ref(null);
let chartInstance = null;
const loading = ref(false);
const error = ref(null);
const message = ref('');
const topRepos = ref([]); // New ref to store top repositories
const N_repo = 10; // Set to 10 for top 10 repos
const isPanelOpen = ref(true); // Track panel open state

const headers = {
  'Authorization': `token ${GITHUB_TOKEN}`,
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const mainContentMarginRight = computed(() => {
  return isPanelOpen.value ? '250px' : '50px'; // Panel width: 250px open, 50px collapsed
});

onMounted(() => {
  const ctx = chartCanvas.value.getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Total Stars',
        data: [],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }]
    }
  });
});

const getStarHistory = async () => {
  if (!username.value) {
    error.value = 'Please enter a GitHub username.';
    return;
  }

  loading.value = true;
  error.value = null;
  message.value = `Fetching repositories for user=${username.value}...`;
  topRepos.value = []; // Clear previous repos

  try {
    let allRepos = [];
    let page = 1;
    let repos;
    do {
      const res = await fetch(`https://api.github.com/users/${username.value}/repos?page=${page}&per_page=100`, { headers });
      repos = await res.json();
      if (repos.message && repos.message.includes('API rate limit exceeded')) {
        throw new Error(repos.message);
      }
      if (repos.message) throw new Error(repos.message);
      allRepos = allRepos.concat(repos);
      page++;
      await sleep(15000); // Delay after fetching repositories
    } while (repos.length === 100);

    allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count);
    const slicedTopRepos = allRepos.slice(0, N_repo); // Take top N_repo repos
    topRepos.value = slicedTopRepos; // Populate the ref

    let allStars = [];
    let repoctr = 0;
    let newrepolen = slicedTopRepos.length;
    for (const repo of slicedTopRepos) {
      repoctr++;
      message.value = `Fetching stars history for ${username.value}/${repo.name} [${repoctr}/${newrepolen}] ...`;
      let starsPage = 1;
      let stars;
      do {
        const res = await fetch(`${repo.stargazers_url}?page=${starsPage}&per_page=100`, {
          headers: { ...headers, 'Accept': 'application/vnd.github.v3.star+json' }
        });
        stars = await res.json();
        if (stars.message && stars.message.includes('API rate limit exceeded')) {
          throw new Error(stars.message);
        }
        if (stars.message) throw new Error(stars.message);
        allStars = allStars.concat(stars);
        starsPage++;
        await sleep(15000); // Delay after fetching stargazers
      } while (stars.length === 100);
    }

    allStars.sort((a, b) => new Date(a.starred_at) - new Date(b.starred_at));

    const chartData = allStars.reduce((acc, star, index) => {
      const date = new Date(star.starred_at).toLocaleDateString();
      if (!acc.labels.includes(date)) {
        acc.labels.push(date);
        acc.data.push(index + 1);
      } else {
        acc.data[acc.data.length - 1] = index + 1;
      }
      return acc;
    }, { labels: [], data: [] });

    chartInstance.data.labels = chartData.labels;
    chartInstance.data.datasets[0].data = chartData.data;
    chartInstance.update();

  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
    message.value = '';
  }
};
</script>

<template>
  <div id="app">
    <div class="main-content" :style="{ 'margin-right': mainContentMarginRight }">
      <h1>GitHub User Star History</h1>
      <form @submit.prevent="getStarHistory">
        <input type="text" v-model="username" placeholder="Enter a GitHub username" />
        <button type="submit" :disabled="loading">{{ loading ? 'Loading...' : 'Generate Chart' }}</button>
      </form>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="message">{{ message }}</div>
      <canvas ref="chartCanvas"></canvas>
    </div>
    <RepoListPanel :repos="topRepos" v-model:isOpen="isPanelOpen" />
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

input {
  padding: 0.5rem;
  margin-right: 0.5rem;
}

button {
  padding: 0.5rem 1rem;
}

canvas {
  margin-top: 2rem;
}

.error {
  color: red;
  margin-top: 1rem;
}
</style>
