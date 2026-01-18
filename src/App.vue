<script setup>
import { Chart, registerables } from "chart.js";
import { computed, onMounted, ref, watch } from "vue";
import RepoListPanel from "./components/RepoListPanel.vue"; // Import the new component
import { GITHUB_TOKEN } from "./github_token.js";
import { generateCacheKey, getCache, saveCache } from "./utils/cache"; // Import caching utilities

Chart.register(...registerables);

const username = ref("");
const chartCanvas = ref(null);
let chartInstance = null;
const loading = ref(false);
const error = ref(null);
const message = ref("");
const topRepos = ref([]); // New ref to store top repositories
const N_repo = 100;
const N_repo_gh = 10;
const N_repos_per_page = 100;
const N_stargazers_per_page = 100;
const isPanelOpen = ref(true); // Track panel open state

// Load username from localStorage
onMounted(() => {
	const savedUsername = localStorage.getItem("github_username");
	if (savedUsername) {
		username.value = savedUsername;
	}
});

// Watch for changes in username and save to localStorage
watch(username, (newUsername) => {
	localStorage.setItem("github_username", newUsername);
});

const headers = {};
if (window.location.hostname === "localhost") {
	headers["Authorization"] = `token ${GITHUB_TOKEN}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mainContentMarginRight = computed(() => {
	return isPanelOpen.value ? "250px" : "50px"; // Panel width: 250px open, 50px collapsed
});

onMounted(() => {
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
});

const getStarHistory = async () => {
	if (!username.value) {
		error.value = "Please enter a GitHub username.";
		return;
	}

	loading.value = true;
	error.value = null;
	topRepos.value = []; // Clear previous repos

	try {
		let allRepos = [];
		const repoListCacheKey = generateCacheKey("repos", username.value);
		const cachedAllRepos = getCache(repoListCacheKey, 15);

		if (cachedAllRepos) {
			allRepos = cachedAllRepos;
			message.value = "Repositories loaded from cache.";
			console.log(
				`${allRepos.length} Repositories loaded from cache:`,
				allRepos,
			);
		} else {
			message.value = `Fetching Repositories for user=${username.value} via API...`;
			console.log("Fetching Repositories via API...");
			let page = 1;
			let repos;
			do {
				const res = await fetch(
					`https://api.github.com/users/${username.value}/repos?page=${page}&per_page=${N_repos_per_page}`,
					{ headers },
				);
				repos = await res.json();
				if (
					repos.message &&
					repos.message.includes("API rate limit exceeded")
				) {
					throw new Error(repos.message);
				}
				if (repos.message) throw new Error(repos.message);
				allRepos = allRepos.concat(repos);
				page++;
			} while (repos.length === N_repos_per_page);
			saveCache(repoListCacheKey, allRepos);
			console.log(
				`Top ${repos.length} Repositories of ${username.value} saved to cache.`,
			);
		}

		allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count);
		const slicedTopRepos = allRepos.slice(
			0,
			window.location.hostname === "localhost" ? N_repo : N_repo_gh,
		); // Take top N_repo repos
		topRepos.value = slicedTopRepos; // Populate the ref

		let allStars = [];
		let repoctr = 0;
		const newrepolen = slicedTopRepos.length;

		for (const repo of slicedTopRepos) {
			repoctr++;
			const stargazerCacheKey = generateCacheKey("stargazers", repo.full_name);
			const cachedRepoStars = getCache(stargazerCacheKey, 15);

			if (cachedRepoStars) {
				allStars = allStars.concat(cachedRepoStars);
				message.value = `Stars for ${username.value}/${repo.name} loaded from cache [${repoctr}/${newrepolen}] ...`;
				console.log(`Stars for ${repo.name} loaded from cache.`);
			} else {
				message.value = `Fetching stars history for ${username.value}/${repo.name} via API [${repoctr}/${newrepolen}] ...`;
				console.log(`Fetching stars for ${repo.name} via API.`);
				let starsForThisRepo = [];
				let starsPage = 1;
				let stars;
				const totalNoOfPagesOfRepo = Math.ceil(
					repo.stargazers_count / N_stargazers_per_page,
				); // Calculate total pages based on stargazers_count

				do {
					message.value = `Fetching stars history for ${username.value}/${repo.name} via API [repo=${repoctr}/${newrepolen}][page=${starsPage}${totalNoOfPagesOfRepo > 1 ? "/" + totalNoOfPagesOfRepo : ""}] ...`;
					const res = await fetch(
						`${repo.stargazers_url}?page=${starsPage}&per_page=${N_stargazers_per_page}`,
						{
							headers: {
								...headers,
								Accept: "application/vnd.github.v3.star+json",
							},
						},
					);

					stars = await res.json();
					if (
						stars.message &&
						stars.message.includes("API rate limit exceeded")
					) {
						throw new Error(stars.message);
					}
					if (stars.message) throw new Error(stars.message);
					starsForThisRepo = starsForThisRepo.concat(stars);
					starsPage++;
				} while (stars.length === N_stargazers_per_page);
				saveCache(stargazerCacheKey, starsForThisRepo);
				allStars = allStars.concat(starsForThisRepo);
				console.log(`Stars for ${repo.name} saved to cache.`);
			}
		}

		allStars.sort((a, b) => new Date(a.starred_at) - new Date(b.starred_at));

		const chartData = allStars.reduce(
			(acc, star, index) => {
				const date = new Date(star.starred_at).toLocaleDateString();
				if (!acc.labels.includes(date)) {
					acc.labels.push(date);
					acc.data.push(index + 1);
				} else {
					acc.data[acc.data.length - 1] = index + 1;
				}
				return acc;
			},
			{ labels: [], data: [] },
		);

		chartInstance.data.labels = chartData.labels;
		chartInstance.data.datasets[0].data = chartData.data;
		chartInstance.update();
	} catch (e) {
		error.value = e.message;
	} finally {
		loading.value = false;
		message.value = "";
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

canvas {
  margin-top: 2rem;
}

.error {
  color: red;
  margin-top: 1rem;
}
</style>
