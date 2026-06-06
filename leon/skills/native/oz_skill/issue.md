# oz_skill — Performance Issues & Fixes

## Issue 1: No Token Caching (HIGH)

**Problem:** Every action call performs `POST /api/auth/token` with username+password credentials. JWT tokens are valid for 60+ minutes but never reused — each user message incurs an extra round-trip before any work begins.

**Fix:** Added module-level token cache in `src/lib/oz_client.ts` with a 50-minute TTL. Auth is skipped entirely on cache hit.

**Files:**
- `src/lib/oz_client.ts` — `_cachedToken` variable, `getToken()` checks cache before API call

---

## Issue 2: No Server List Caching (HIGH)

**Problem:** `fetchAllServers()` and `resolveServerByName()` both call `GET /api/servers` on every invocation. `launch_agent.ts` calls both sequentially (`findServerInUtterance` then `resolveServerByName`), resulting in two identical fetches. The server list rarely changes mid-conversation.

**Fix:** Added module-level server cache with 30-second TTL. `resolveServerByName` now benefits from `fetchAllServers` caching transparently.

**Files:**
- `src/lib/oz_client.ts` — `_cachedServers` variable, `fetchAllServers()` checks cache before API call
- `src/actions/launch_agent.ts` — redundant second fetch eliminated by shared cache

---

## Issue 3: Aggressive Polling (MEDIUM)

**Problem:** `launchAndWait()` polls every 2 seconds with 1.5× backoff to 10s cap. For a 5-minute agent this creates ~70 poll requests (each with 3× retry = up to 210 API calls).

**Fix:** Changed poll interval to start at 3 seconds with 2× backoff to 15s cap. Reduces polls to ~30 for a 5-minute run (~57% fewer).

**Files:**
- `src/lib/oz_client.ts` — `launchAndWait()` interval changed from `2000` / `1.5` / `10000` to `3000` / `2` / `15000`

---

## Issue 4: Duplicated Inline Auth Logic (MEDIUM)

**Problem:** Three actions (`list_agents.ts`, `get_agent.ts`, `cancel_agent.ts`) duplicate the credential reading + form-urlencoded auth POST inline instead of using the shared `getOzConfig()` / `getToken()` helpers. This is 25+ lines of duplicated code per file that doesn't benefit from token caching.

**Fix:** Refactored all three to use the shared helpers. Now they automatically benefit from the token cache fix in Issue 1.

**Files:**
- `src/actions/list_agents.ts` — replaced inline auth with `getOzConfig` + `getToken`
- `src/actions/get_agent.ts` — replaced inline auth with `getOzConfig` + `getToken`
- `src/actions/cancel_agent.ts` — replaced inline auth with `getOzConfig` + `getToken`

---

## Issue 5: `NetworkError` Status Code Cast (LOW)

**Problem:** Multiple files cast `NetworkError` to access `.response.statusCode` with a branded type, which is fragile and repeated across files.

**Fix:** Centralized `errorMessage()` helper already handles `NetworkError` generically. For 404-specific handling, the status code extraction was kept inline but could be moved to a helper in a future pass.

**Files:**
- `src/actions/get_agent.ts` — centralized 404 check before generic error
- `src/actions/cancel_agent.ts` — centralized 404 check before generic error

---

## Impact Summary

| Fix | Est. latency saved per action |
|-----|------------------------------|
| Token cache (Issue 1) | −1500ms (1 auth round-trip) |
| Server cache (Issue 2) | −500ms per server resolution |
| Poll optimization (Issue 3) | −57% API poll calls |
| Inline auth removal (Issue 4) | −25 LOC × 3 files, enables caching |
| **Total typical savings** | **~2s per action invocation** |
