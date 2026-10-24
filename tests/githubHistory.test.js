import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { generateCacheKey, saveCache } from "../src/utils/cache.js";
import { loadUserStarHistory } from "../src/utils/githubHistory.js";

const WEEK = Date.UTC(2026, 0, 4) / 1000;
const SEVEN_DAYS = 7 * 86400;

beforeEach(() => {
	const items = new Map();
	globalThis.localStorage = {
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => items.set(key, value),
		removeItem: (key) => items.delete(key),
		key: (index) => [...items.keys()][index] ?? null,
		get length() {
			return items.size;
		},
	};
});

const repo = (name, count, owner = "alice") => ({
	id: name.length * 100 + count,
	name,
	full_name: `${owner}/${name}`,
	stargazers_count: count,
	html_url: `https://github.com/${owner}/${name}`,
});

const week = (epoch, days) => ({
	week: epoch,
	total: days.reduce((a, b) => a + b, 0),
	days,
});

const reply = (json, remaining = 50, status = 200) =>
	new Response(JSON.stringify(json), {
		status,
		headers: { "x-ratelimit-remaining": String(remaining) },
	});

function mockApi(handlers) {
	const calls = [];
	return {
		calls,
		fetchImpl: async (url) => {
			const path = new URL(url).pathname + new URL(url).search;
			calls.push(path);
			for (const [matcher, response] of handlers) {
				if (matcher.test(path))
					return typeof response === "function" ? response(path) : response;
			}
			throw new Error(`Unexpected request: ${path}`);
		},
	};
}

test("combines daily star counts across repos and preserves panel consistency", async () => {
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("one", 3), repo("two", 1)], 50)],
		[
			/\/repos\/alice\/one\/stargazers\/history/,
			reply([week(WEEK, [1, 0, 1, 1, 0, 0, 0])], 49),
		],
		[
			/\/repos\/alice\/two\/stargazers\/history/,
			reply([week(WEEK, [0, 1, 0, 0, 0, 0, 0])], 48),
		],
	]);
	const result = await loadUserStarHistory({
		username: "alice",
		maxRepos: 10,
		fetchImpl: api.fetchImpl,
	});
	assert.deepEqual(result.chart.data, [1, 2, 3, 4]);
	assert.equal(result.chart.labels.length, 4);
	assert.equal(result.repos.length, 2);
	assert.equal(
		result.repos.reduce((n, r) => n + r.stargazers_count, 0),
		4,
	);
	assert.equal(result.partial, false);
	assert.ok(
		api.calls.every(
			(path) =>
				path.includes("/stargazers/history") || path.includes("/users/"),
		),
	);
});

test("sparse events retain every elapsed calendar day as a flat cumulative step", async () => {
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("sparse", 2)])],
		[
			/\/stargazers\/history/,
			reply([
				week(WEEK + SEVEN_DAYS, [1, 0, 0, 0, 0, 0, 0]),
				week(WEEK, [1, 0, 0, 0, 0, 0, 0]),
			]),
		],
	]);
	const result = await loadUserStarHistory({
		username: "alice",
		fetchImpl: api.fetchImpl,
	});
	assert.equal(result.chart.labels.length, 8);
	assert.deepEqual(result.chart.data, [1, 1, 1, 1, 1, 1, 1, 2]);
});

test("loads 30+1 weekly pages newest first and aggregates in chronological order", async () => {
	const first = Array.from({ length: 30 }, (_, i) =>
		week(WEEK + (30 - i) * SEVEN_DAYS, [i === 0 ? 1 : 0, 0, 0, 0, 0, 0, 0]),
	);
	const older = [week(WEEK, [1, 0, 0, 0, 0, 0, 0])];
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("long", 2)])],
		[/\/stargazers\/history\?page=1/, reply(first)],
		[/\/stargazers\/history\?page=2/, reply(older)],
	]);
	const result = await loadUserStarHistory({
		username: "alice",
		fetchImpl: api.fetchImpl,
	});
	assert.equal(result.chart.data.length, 211);
	assert.equal(result.chart.data[0], 1);
	assert.equal(result.chart.data.at(-1), 2);
	assert.ok(result.chart.data.slice(1, -1).every((count) => count === 1));
	assert.ok(result.chart.labels[0] < result.chart.labels.at(-1));
	assert.equal(api.calls.filter((s) => s.includes("/history")).length, 2);
});

test("ignores legacy stargazer cache and reuses complete v2 history", async () => {
	saveCache(generateCacheKey("stargazers", "alice/one"), [
		{ starred_at: "2024-01-01" },
	]);
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("one", 1)])],
		[/\/stargazers\/history/, reply([week(WEEK, [1, 0, 0, 0, 0, 0, 0])])],
	]);
	const one = await loadUserStarHistory({
		username: "alice",
		fetchImpl: api.fetchImpl,
	});
	const two = await loadUserStarHistory({
		username: "alice",
		fetchImpl: api.fetchImpl,
	});
	assert.deepEqual(one.chart, two.chart);
	assert.equal(api.calls.filter((s) => s.includes("/history")).length, 1);
});

test("rate budget stops cleanly and never counts an incomplete repository", async () => {
	const api = mockApi([
		[
			/\/users\/alice\/repos/,
			reply([repo("one", 1), repo("two", 1), repo("three", 1)], 7),
		],
		[
			/\/one\/stargazers\/history/,
			reply([week(WEEK, [1, 0, 0, 0, 0, 0, 0])], 6),
		],
		[
			/\/three\/stargazers\/history/,
			reply([week(WEEK, [1, 0, 0, 0, 0, 0, 0])], 5),
		],
	]);
	const result = await loadUserStarHistory({
		username: "alice",
		maxRepos: 100,
		fetchImpl: api.fetchImpl,
	});
	assert.equal(result.requested, 3);
	assert.equal(result.repos.length, 2);
	assert.equal(result.chart.data.at(-1), 2);
	assert.equal(result.partial, true);
	assert.ok(result.notices.some((note) => /rate|quota|limit/i.test(note)));
});

test("GitHub 403 rate limits during a later history preserve completed repos", async () => {
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("a", 1), repo("b", 1)], 9)],
		[/\/a\/stargazers\/history/, reply([week(WEEK, [1, 0, 0, 0, 0, 0, 0])], 8)],
		[
			/\/b\/stargazers\/history/,
			reply({ message: "API rate limit exceeded" }, 0, 403),
		],
	]);
	const result = await loadUserStarHistory({
		username: "alice",
		fetchImpl: api.fetchImpl,
	});
	assert.equal(result.partial, true);
	assert.equal(result.repos.length, 1);
	assert.equal(result.chart.data.at(-1), 1);
	assert.ok(result.notices.some((notice) => /rate/i.test(notice)));
});

test("an unfinished 30-week page chain contributes no invented history", async () => {
	const page = Array.from({ length: 30 }, (_, i) =>
		week(WEEK + i * SEVEN_DAYS, [1, 0, 0, 0, 0, 0, 0]),
	);
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("long", 31)], 6)],
		[/\/stargazers\/history/, reply(page, 5)],
	]);
	const result = await loadUserStarHistory({
		username: "alice",
		fetchImpl: api.fetchImpl,
	});
	assert.equal(result.repos.length, 0);
	assert.deepEqual(result.chart.data, []);
	assert.equal(result.partial, true);
});

test("rejects malformed aggregate week data instead of producing a chart", async () => {
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("one", 1)])],
		[/\/stargazers\/history/, reply([{ week: WEEK, total: 7, days: [1, 0] }])],
	]);
	await assert.rejects(
		loadUserStarHistory({ username: "alice", fetchImpl: api.fetchImpl }),
		/invalid|malformed|history/i,
	);
});

test("HTTP 422 in later repository preserves completed results as partial", async () => {
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("a", 1), repo("b", 1)], 50)],
		[
			/\/a\/stargazers\/history/,
			reply([week(WEEK, [1, 0, 0, 0, 0, 0, 0])], 49),
		],
		[
			/\/b\/stargazers\/history/,
			reply({ message: "Validation failed" }, 48, 422),
		],
	]);
	const result = await loadUserStarHistory({
		username: "alice",
		fetchImpl: api.fetchImpl,
	});
	assert.equal(result.partial, true);
	assert.equal(result.repos.length, 1);
	assert.equal(result.chart.data.at(-1), 1);
	assert.ok(result.notices.some((note) => /422/.test(note)));
});

test("reports 401 and 429 as API errors, never as empty history", async () => {
	for (const status of [401, 429]) {
		const api = mockApi([
			[/\/users\/alice\/repos/, reply({ message: "Unauthorized" }, 0, status)],
		]);
		await assert.rejects(
			loadUserStarHistory({ username: "alice", fetchImpl: api.fetchImpl }),
			(err) => err.status === status,
		);
	}
});

test("rejects unsafe usernames before any HTTP request", async () => {
	const api = mockApi([]);
	await assert.rejects(
		loadUserStarHistory({ username: "../strange", fetchImpl: api.fetchImpl }),
		/valid|username/i,
	);
	assert.equal(api.calls.length, 0);
});

test("zero-current-star repos can still contribute historical events", async () => {
	const api = mockApi([
		[/\/users\/alice\/repos/, reply([repo("empty", 0)])],
		[/\/stargazers\/history/, reply([week(WEEK, [1, 0, 0, 0, 0, 0, 0])])],
	]);
	const result = await loadUserStarHistory({
		username: "alice",
		fetchImpl: api.fetchImpl,
	});
	assert.equal(result.repos.length, 1);
	assert.deepEqual(result.chart.data, [1]);
	assert.equal(api.calls.length, 2);
	assert.equal(result.partial, false);
	assert.ok(
		result.notices.some((note) => /historical star events/i.test(note)),
	);
});
