// src/utils/cache.js

const CACHE_PREFIX = "github_star_history_cache_";

/**
 * Generates a unique cache key for a given request.
 * @param {string} type - The type of data being cached (e.g., 'repos', 'stargazers').
 * @param {string} identifier - A primary identifier (e.g., GitHub username, repo full name).
 * @param {object} [params={}] - Additional parameters that differentiate the request (e.g., page number).
 * @returns {string} The unique cache key.
 */
export function generateCacheKey(type, identifier, params = {}) {
	const paramString = Object.keys(params)
		.sort()
		.map((key) => `${key}=${params[key]}`)
		.join("&");
	return `${CACHE_PREFIX}${type}_${identifier}_${paramString}`;
}

/**
 * Saves data to local storage with a timestamp.
 * @param {string} key - The cache key.
 * @param {any} data - The data to store.
 */
export function saveCache(key, data) {
	const cacheEntry = {
		timestamp: Date.now(),
		data: data,
	};
	try {
		localStorage.setItem(key, JSON.stringify(cacheEntry));
	} catch (e) {
		console.error("Error saving to local storage:", e);
	}
}

/**
 * Retrieves data from local storage if it's not stale.
 * @param {string} key - The cache key.
 * @param {number} maxAgeDays - The maximum age of the cache entry in days.
 * @returns {any | null} The cached data if fresh, otherwise null.
 */
export function getCache(key, maxAgeDays) {
	try {
		const item = localStorage.getItem(key);
		if (!item) {
			return null;
		}

		const cacheEntry = JSON.parse(item);
		const ageMilliseconds = Date.now() - cacheEntry.timestamp;
		const maxAgeMilliseconds = maxAgeDays * 24 * 60 * 60 * 1000;

		if (ageMilliseconds > maxAgeMilliseconds) {
			// Cache is stale, remove it
			localStorage.removeItem(key);
			return null;
		}

		return cacheEntry.data;
	} catch (e) {
		console.error("Error retrieving from local storage:", e);
		// If there's an error parsing, treat as no cache
		localStorage.removeItem(key); // Clean up potentially corrupt entry
		return null;
	}
}

/**
 * Clears a specific cache entry.
 * @param {string} key - The cache key to clear.
 */
export function clearCache(key) {
	try {
		localStorage.removeItem(key);
	} catch (e) {
		console.error("Error clearing cache:", e);
	}
}

/**
 * Clears all cache entries managed by this utility.
 */
export function clearAllCaches() {
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(CACHE_PREFIX)) {
				localStorage.removeItem(key);
			}
		}
	} catch (e) {
		console.error("Error clearing all caches:", e);
	}
}
