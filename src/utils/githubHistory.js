import { generateCacheKey, getCache, saveCache } from "./cache.js";

const API_ROOT = "https://api.github.com";
const HISTORY_PAGE_SIZE = 30;
const REPO_PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 100;
const DAILY_SECONDS = 86400;
const MAX_ANONYMOUS_REQUESTS = 60;
const RESERVE_REQUESTS = 5;
const HISTORY_CACHE_DAYS = 1;

class RateBudgetExhausted extends Error {
	constructor() {
		super(
			"GitHub API rate budget is exhausted. Only complete repositories can be displayed.",
		);
		this.name = "RateBudgetExhausted";
	}
}

export class GitHubApiError extends Error {
	constructor(message, status) {
		super(message);
		this.name = "GitHubApiError";
		this.status = status;
	}
}

function validWeek(value) {
	return (
		value &&
		Number.isSafeInteger(value.week) &&
		value.week >= 0 &&
		Array.isArray(value.days) &&
		value.days.length === 7 &&
		value.days.every((day) => Number.isSafeInteger(day) && day >= 0) &&
		Number.isSafeInteger(value.total) &&
		value.total === value.days.reduce((a, b) => a + b, 0)
	);
}

function validWeeks(value) {
	return (
		Array.isArray(value) &&
		value.every(validWeek) &&
		new Set(value.map((entry) => entry.week)).size === value.length
	);
}

function validRepos(value) {
	return (
		Array.isArray(value) &&
		value.every(
			(repo) =>
				typeof repo.full_name === "string" &&
				/^[\w.-]+\/[\w.-]+$/.test(repo.full_name) &&
				Number.isSafeInteger(repo.stargazers_count) &&
				repo.stargazers_count >= 0,
		)
	);
}

function toChart(weeksPerRepo) {
	const dailyTotals = new Map();
	for (const weeks of weeksPerRepo) {
		for (const record of weeks) {
			record.days.forEach((count, index) => {
				if (count === 0) return;
				// GitHub does not guarantee UTC day boundaries. This is a nominal date label.
				const date = new Date((record.week + index * DAILY_SECONDS) * 1000)
					.toISOString()
					.slice(0, 10);
				dailyTotals.set(date, (dailyTotals.get(date) ?? 0) + count);
			});
		}
	}
	const eventDates = [...dailyTotals.keys()].sort();
	if (eventDates.length === 0) return { labels: [], data: [] };

	// Chart.js uses a category x-axis: include zero-event days to preserve elapsed time.
	const start = Date.parse(`${eventDates[0]}T00:00:00Z`);
	const end = Date.parse(`${eventDates.at(-1)}T00:00:00Z`);
	const labels = [];
	const data = [];
	let cumulative = 0;
	for (let day = start; day <= end; day += DAILY_SECONDS * 1000) {
		const date = new Date(day).toISOString().slice(0, 10);
		cumulative += dailyTotals.get(date) ?? 0;
		labels.push(date);
		data.push(cumulative);
	}
	return { labels, data };
}

/**
 * Collect complete histories only; incomplete repositories never enter the chart.
 * maxRepos is a user preference, not a guarantee under unauthenticated rate limits.
 */
export async function loadUserStarHistory({
	username,
	maxRepos = 10,
	fetchImpl = globalThis.fetch,
	onProgress = () => {},
} = {}) {
	const owner = String(username ?? "").trim();
	if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner)) {
		throw new Error("Please enter a valid GitHub username.");
	}
	if (![10, 25, 50, 100].includes(maxRepos)) {
		throw new Error("Choose 10, 25, 50 or 100 repositories.");
	}

	const quota = { remaining: MAX_ANONYMOUS_REQUESTS };
	const notices = [];
	async function get(path) {
		if (quota.remaining <= RESERVE_REQUESTS) throw new RateBudgetExhausted();
		quota.remaining--;
		const response = await fetchImpl(`${API_ROOT}${path}`, {
			headers: { Accept: "application/vnd.github+json" },
		});
		const remaining = Number(response.headers?.get("x-ratelimit-remaining"));
		if (
			response.headers?.get("x-ratelimit-remaining") !== null &&
			Number.isFinite(remaining) &&
			remaining >= 0
		) {
			quota.remaining = Math.min(quota.remaining, remaining);
		}
		let body;
		try {
			body = await response.json();
		} catch {
			throw new GitHubApiError(
				"GitHub returned invalid JSON.",
				response.status,
			);
		}
		if (!response.ok) {
			const explanation =
				body && typeof body.message === "string"
					? body.message
					: "GitHub API request failed";
			throw new GitHubApiError(
				`GitHub API HTTP ${response.status}: ${explanation}`,
				response.status,
			);
		}
		return body;
	}

	const repoCacheKey = generateCacheKey("repos_v2", owner.toLowerCase());
	let allRepos = getCache(repoCacheKey, HISTORY_CACHE_DAYS);
	if (!validRepos(allRepos)) {
		allRepos = [];
		let page = 1;
		while (true) {
			onProgress(`Fetching repositories (page ${page})...`);
			const chunk = await get(
				`/users/${encodeURIComponent(owner)}/repos?per_page=${REPO_PAGE_SIZE}&page=${page}`,
			);
			if (!validRepos(chunk))
				throw new Error("GitHub returned an invalid repository list.");
			allRepos.push(...chunk);
			if (chunk.length < REPO_PAGE_SIZE) break;
			page++;
		}
		saveCache(repoCacheKey, allRepos);
	}

	const selected = [...allRepos]
		.sort(
			(a, b) =>
				b.stargazers_count - a.stargazers_count ||
				a.full_name.localeCompare(b.full_name),
		)
		.slice(0, maxRepos);
	const completedRepos = [];
	const completedWeeks = [];
	let partial = false;

	for (const [index, repo] of selected.entries()) {
		onProgress(
			`Loading star history ${index + 1}/${selected.length}: ${repo.full_name}`,
		);
		const cacheKey = generateCacheKey(
			"star_history_weekdays_v2",
			repo.full_name,
		);
		const cached = getCache(cacheKey, HISTORY_CACHE_DAYS);
		let weeks;
		if (
			cached?.version === 2 &&
			cached.complete === true &&
			validWeeks(cached.weeks)
		) {
			weeks = cached.weeks;
		} else {
			weeks = [];
			let complete = false;
			try {
				for (let page = 1; page <= MAX_HISTORY_PAGES; page++) {
					const chunk = await get(
						`/repos/${repo.full_name}/stargazers/history?page=${page}&per_page=${HISTORY_PAGE_SIZE}`,
					);
					if (!validWeeks(chunk))
						throw new Error(`Invalid GitHub history for ${repo.full_name}.`);
					weeks.push(...chunk);
					if (chunk.length < HISTORY_PAGE_SIZE) {
						complete = true;
						break;
					}
				}
			} catch (error) {
				const interrupted =
					error instanceof RateBudgetExhausted ||
					(error instanceof GitHubApiError && error.status >= 400);
				if (!interrupted) throw error;
				partial = true;
				const reason =
					error instanceof RateBudgetExhausted
						? "anonymous rate budget exhausted"
						: `GitHub HTTP ${error.status}${/rate limit/i.test(error.message) ? " (rate limited)" : ""}`;
				notices.push(
					`History interrupted for ${repo.full_name} (${reason}). Remaining repositories were omitted; no incomplete data was counted.`,
				);
				break;
			}
			if (!complete) {
				partial = true;
				notices.push(
					`GitHub's 100-page history cap was reached for ${repo.full_name}; this repository was omitted.`,
				);
				continue;
			}
			if (!validWeeks(weeks))
				throw new Error(`Duplicate or invalid weeks in ${repo.full_name}.`);
			saveCache(cacheKey, { version: 2, complete: true, weeks });
		}

		const historyCount = weeks.reduce((sum, item) => sum + item.total, 0);
		if (historyCount !== repo.stargazers_count) {
			notices.push(
				`${repo.full_name}: ${historyCount} historical star events, ${repo.stargazers_count} currently starred. GitHub history and current totals may differ.`,
			);
		}
		completedRepos.push(repo);
		completedWeeks.push(weeks);
	}

	if (completedRepos.length < selected.length) partial = true;
	return {
		chart: toChart(completedWeeks),
		repos: completedRepos,
		requested: selected.length,
		partial,
		notices,
	};
}
