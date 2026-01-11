<script setup>
import { ref, onMounted } from 'vue';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const username = ref('');
const chartCanvas = ref(null);
let chartInstance = null;
const loading = ref(false);
const error = ref(null);
const message = ref('');

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
  message.value = 'Fetching user repositories...';

  try {
    let allRepos = [];
    let page = 1;
    let repos;
    do {
      const res = await fetch(`https://api.github.com/users/${username.value}/repos?page=${page}&per_page=100`);
      repos = await res.json();
      if (repos.message) throw new Error(repos.message);
      allRepos = allRepos.concat(repos);
      page++;
    } while (repos.length === 100);

    allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count);
    const topRepos = allRepos.slice(0, 10);

    let allStars = [];
    for (const repo of topRepos) {
      message.value = `Fetching stars for ${repo.name}...`;
      let starsPage = 1;
      let stars;
      do {
        const res = await fetch(`${repo.stargazers_url}?page=${starsPage}&per_page=100`, {
          headers: { 'Accept': 'application/vnd.github.v3.star+json' }
        });
        stars = await res.json();
        if (stars.message) throw new Error(stars.message);
        allStars = allStars.concat(stars);
        starsPage++;
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
    <h1>GitHub User Star History</h1>
    <form @submit.prevent="getStarHistory">
      <input type="text" v-model="username" placeholder="Enter a GitHub username" />
      <button type="submit" :disabled="loading">{{ loading ? 'Loading...' : 'Generate Chart' }}</button>
    </form>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="message">{{ message }}</div>
    <canvas ref="chartCanvas"></canvas>
  </div>
</template>

<style scoped>
#app {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family: sans-serif;
  text-align: center;
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
