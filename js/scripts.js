/**
 * Created by Josh on 9/10/2016.
 * Plain JS (no jQuery) since 2026.
 */
const TMDB = "https://api.themoviedb.org/3";
const FALLBACK_TMDB_KEY = "a5d4199b71fd3989796a8f11a0176c28";
const REGION = "US";
const NUM_PAGES = 5;
const STORAGE_KEY = "endlessTrailers.filters";
const SEEN_KEY = "endlessTrailers.seen";
const SEEN_LIMIT = 3000;
const MAX_PAGES_SKIPPING_SEEN = 15;

let remoteConfig = null;
let g_configuration = null;

// Playback state. mode is "idle", "running" (the endless stream) or "single" (a title search).
const state = {
    mode: "idle",
    queue: [],
    index: 0,
    run: 0, // bumps on every Start/Stop/search so stale async work can bail out
    misses: 0, // trailers skipped in a row, so an empty stream stops instead of spinning
    play: 0, // bumps on every trailer change so a slow lookup can't start the wrong video
    playing: false, // true once YouTube reports the current trailer is actually playing
    appliedKey: null, // the filters the current stream was started with
};

const $id = (id) => document.getElementById(id);

function tmdbKey() {
    const key = remoteConfig ? remoteConfig.getString("mdb_api_key") : "";
    return key || FALLBACK_TMDB_KEY;
}

async function tmdb(path, params = {}) {
    const query = new URLSearchParams({ api_key: tmdbKey(), ...params });
    const res = await fetch(`${TMDB}${path}?${query}`);
    if (!res.ok) {
        throw new Error(`TMDB ${path} returned ${res.status}`);
    }
    return res.json();
}

function setError(msg) {
    $id("err").textContent = msg;
}

function setStatus(msg) {
    $id("status").textContent = msg;
}

/* ---------- Startup ---------- */

async function initialSetup() {
    if (window.firebase && firebase.remoteConfig) {
        try {
            remoteConfig = firebase.remoteConfig();
            remoteConfig.settings = { minimumFetchIntervalMillis: 3600000 };
            remoteConfig.defaultConfig = { yt_api_key: "not_set" };
            await remoteConfig.fetchAndActivate();
        } catch (err) {
            console.error(err);
        }
    }
    initYoutube(remoteConfig ? remoteConfig.getString("yt_api_key") : "");

    const providers = tmdb("/watch/providers/movie", { watch_region: REGION, language: "en-US" })
        .then(({ results }) => insertProviders(results))
        .catch((err) => {
            console.error(err);
            $id("providerChips").replaceChildren(mutedText("Streaming services unavailable"));
        });
    try {
        g_configuration = await tmdb("/configuration");
        const { genres } = await tmdb("/genre/movie/list");
        insertGenres(genres);
    } catch (err) {
        console.error(err);
        $id("genreChips").replaceChildren(mutedText("Genres unavailable"));
        $id("excludeChips").replaceChildren(mutedText("Genres unavailable"));
        setError("Couldn't reach The Movie DB. Try reloading.");
    }
    await providers;
    restoreFilters();
    updateSeenCount();
    updateFilterSummary();
    $id("startBtn").disabled = false;
    setStatus("Ready. Press Start.");
}

const g_genreNames = {};

function mutedText(text) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = text;
    return span;
}

function chip(name, value, label) {
    const el = document.createElement("label");
    el.className = "chip";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = value;
    input.dataset.name = label;
    const span = document.createElement("span");
    span.textContent = label;
    el.append(input, span);
    return el;
}

function insertGenres(genres) {
    genres.forEach((genre) => { g_genreNames[genre.id] = genre.name; });
    $id("genreChips").replaceChildren(...genres.map((g) => chip("genre", g.id, g.name)));
    $id("excludeChips").replaceChildren(...genres.map((g) => chip("genreOut", g.id, g.name)));
}

// The dozen biggest US services, in TMDB's own US display order
function insertProviders(providers) {
    const rank = (p) => (p.display_priorities && p.display_priorities[REGION]) ?? p.display_priority ?? 999;
    const top = providers.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 12);
    $id("providerChips").replaceChildren(...top.map((p) => chip("provider", p.provider_id, p.provider_name)));
}

/* ---------- Analytics ---------- */

// Sends a GA4 event if the tag loaded (ad blockers often stop it; that's fine).
// GA4 drops parameter values longer than 100 characters, so trim them.
function track(name, params = {}) {
    if (typeof window.gtag !== "function") return;
    const clean = {};
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        clean[key] = typeof value === "string" ? value.slice(0, 100) : value;
    }
    window.gtag("event", name, clean);
}

function filterParams(f) {
    const { from, to } = yearRange(f);
    return {
        list: f.list,
        genres: f.genreNames.join(", ") || "any",
        genre_mode: f.genres.length > 1 ? f.genreMode : undefined,
        mpaa: f.mpaa.join(", ") || "any",
        min_rating: f.minRating,
        years: from || to ? `${from || "any"}-${to || "now"}` : "any",
        streaming: f.providerNames.join(", ") || "any",
        hidden_genres: f.excludedNames.join(", ") || undefined,
        length: f.runtime ? RUNTIME_NAMES[f.runtime] : undefined,
        original_language: f.languageName || undefined,
        actors: f.actors.join(", ") || undefined,
        directors: f.directors.join(", ") || undefined,
        skip_seen: f.skipSeen ? "yes" : "no",
    };
}

/* ---------- Filters ---------- */

function readFilters() {
    const form = $id("filterForm");
    const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)];
    return {
        list: (checked("list")[0] || {}).value || "popular",
        genres: checked("genre").map((i) => i.value),
        genreNames: checked("genre").map((i) => i.dataset.name),
        genreMode: (checked("genreMode")[0] || {}).value || "any",
        mpaa: checked("mpaa").map((i) => i.value),
        minRating: Number($id("ratingMinimum").value),
        actors: splitNames($id("actorText").value),
        yearFrom: $id("yearFrom").value,
        yearTo: $id("yearTo").value,
        providers: checked("provider").map((i) => i.value),
        providerNames: checked("provider").map((i) => i.dataset.name),
        excluded: checked("genreOut").map((i) => i.value),
        excludedNames: checked("genreOut").map((i) => i.dataset.name),
        runtime: $id("runtimeFilter").value,
        language: $id("language").value,
        languageName: $id("language").value ? $id("language").selectedOptions[0].textContent : "",
        directors: splitNames($id("directorText").value),
        skipSeen: $id("skipSeen").checked,
    };
}

function splitNames(text) {
    return text.split(",").map((s) => s.trim()).filter(Boolean);
}

function filterKey(f) {
    return JSON.stringify([f.list, f.genres, f.genreMode, f.mpaa, f.minRating, f.actors, f.yearFrom, f.yearTo,
        f.providers, f.excluded, f.runtime, f.language, f.directors, f.skipSeen]);
}

// How many of the tucked-away filters are on, shown next to "More filters"
function moreFilterCount(f) {
    return [f.excluded.length > 0, f.runtime, f.language, f.directors.length > 0, f.skipSeen].filter(Boolean).length;
}

const RUNTIME_NAMES = { lt90: "under 90 min", lt120: "under 2 hrs", gt120: "2 hrs+" };

function yearRange(f) {
    let from = f.yearFrom;
    let to = f.yearTo;
    if (from && to && Number(from) > Number(to)) [from, to] = [to, from];
    return { from, to };
}

const LIST_NAMES = {
    popular: "Popular",
    top_rated: "Top rated",
    now_playing: "In theaters",
    upcoming: "Coming soon",
};

function describeFilters(f) {
    const parts = [LIST_NAMES[f.list]];
    if (f.genreNames.length === 0) {
        parts.push("any genre");
    } else if (f.genreNames.length <= 3) {
        parts.push(f.genreNames.join(f.genreMode === "all" ? " + " : " / "));
    } else {
        parts.push(`${f.genreNames.length} genres`);
    }
    if (f.mpaa.length) parts.push(f.mpaa.join("/"));
    if (f.minRating > 0) parts.push(`${f.minRating}+`);
    if (f.actors.length) parts.push(f.actors.join(", "));
    const { from, to } = yearRange(f);
    if (from && to) parts.push(from === to ? from : `${from}–${to}`);
    else if (from) parts.push(`${from}+`);
    else if (to) parts.push(`up to ${to}`);
    if (f.providerNames.length) {
        parts.push(f.providerNames.length <= 2 ? `on ${f.providerNames.join(" / ")}` : `on ${f.providerNames.length} services`);
    }
    if (f.excludedNames.length) parts.push(`no ${f.excludedNames.join(" / ")}`);
    if (f.runtime) parts.push(RUNTIME_NAMES[f.runtime]);
    if (f.languageName) parts.push(f.languageName);
    if (f.directors.length) parts.push(`dir. ${f.directors.join(", ")}`);
    if (f.skipSeen) parts.push("unseen only");
    return parts.join(", ");
}

function updateFilterSummary() {
    const f = readFilters();
    $id("filterSummary").textContent = describeFilters(f);
    $id("ratingValue").textContent = f.minRating > 0 ? `${f.minRating}+` : "Any";
    const more = moreFilterCount(f);
    $id("moreCount").textContent = more ? `(${more} on)` : "";
    // Light up the decade chip that matches the From/To years
    document.querySelectorAll("#decadeChips .chip-btn").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.from === f.yearFrom && btn.dataset.to === f.yearTo));
    });
    updateButtons();
}

function saveFilters() {
    const f = readFilters();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
    } catch (err) {
        // storage can be unavailable (private mode); filters just won't persist
    }
}

function restoreFilters() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (err) {
        return;
    }
    if (!saved) return;
    const form = $id("filterForm");
    const setChecked = (name, values) => {
        form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
            input.checked = values.includes(input.value);
        });
    };
    if (saved.list) setChecked("list", [saved.list]);
    if (saved.genreMode) setChecked("genreMode", [saved.genreMode]);
    setChecked("genre", saved.genres || []);
    setChecked("mpaa", saved.mpaa || []);
    setChecked("provider", saved.providers || []);
    setChecked("genreOut", saved.excluded || []);
    $id("ratingMinimum").value = saved.minRating || 0;
    $id("actorText").value = (saved.actors || []).join(", ");
    $id("yearFrom").value = saved.yearFrom || "";
    $id("yearTo").value = saved.yearTo || "";
    $id("runtimeFilter").value = saved.runtime || "";
    $id("language").value = saved.language || "";
    $id("directorText").value = (saved.directors || []).join(", ");
    $id("skipSeen").checked = Boolean(saved.skipSeen);
    if (moreFilterCount(readFilters()) > 0) {
        $id("moreFilters").open = true;
    }
}

function resetFilters() {
    const form = $id("filterForm");
    form.reset();
    // form.reset() restores the HTML defaults, which is what we want
    updateFilterSummary();
    saveFilters();
}

function isoDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

// Everything goes through /discover so the lists, genres and other filters combine.
async function buildDiscoverParams(f) {
    const params = {
        language: "en-US",
        include_adult: "false",
        sort_by: "popularity.desc",
    };
    if (f.list === "top_rated") {
        params.sort_by = "vote_average.desc";
        params["vote_count.gte"] = 300;
    } else if (f.list === "now_playing") {
        params.region = REGION;
        params.with_release_type = "2|3";
        params["release_date.gte"] = isoDate(-45);
        params["release_date.lte"] = isoDate(0);
    } else if (f.list === "upcoming") {
        params.region = REGION;
        params.with_release_type = "2|3";
        params["release_date.gte"] = isoDate(1);
        params["release_date.lte"] = isoDate(180);
    }
    if (f.genres.length) {
        params.with_genres = f.genres.join(f.genreMode === "all" ? "," : "|");
    }
    if (f.mpaa.length) {
        params.certification_country = REGION;
        const picked = MPAA_ORDER.map((r, i) => (f.mpaa.includes(r) ? i : -1)).filter((i) => i >= 0);
        const contiguous = picked[picked.length - 1] - picked[0] === picked.length - 1;
        if (contiguous) {
            // A documented range, e.g. PG through PG-13
            params["certification.gte"] = MPAA_ORDER[picked[0]];
            params["certification.lte"] = MPAA_ORDER[picked[picked.length - 1]];
        } else {
            params.certification = f.mpaa.join("|");
        }
    }
    if (f.minRating > 0) {
        params["vote_average.gte"] = f.minRating;
        // Unreleased films have almost no votes, so only ask for a vote floor on released ones
        if (f.list !== "upcoming") {
            params["vote_count.gte"] = Math.max(params["vote_count.gte"] || 0, f.list === "now_playing" ? 10 : 50);
        }
    }
    if (f.actors.length) {
        params.with_cast = (await findPeople(f.actors, "actor")).join(",");
    }
    if (f.directors.length) {
        params.with_crew = (await findPeople(f.directors, "director")).join("|");
    }
    const { from, to } = yearRange(f);
    if (from) params["primary_release_date.gte"] = `${from}-01-01`;
    if (to) params["primary_release_date.lte"] = `${to}-12-31`;
    if (f.providers.length) {
        params.watch_region = REGION;
        params.with_watch_providers = f.providers.join("|");
        params.with_watch_monetization_types = "flatrate|free|ads";
    }
    if (f.excluded.length) {
        params.without_genres = f.excluded.join(",");
    }
    if (f.runtime === "lt90") params["with_runtime.lte"] = 89;
    if (f.runtime === "lt120") params["with_runtime.lte"] = 119;
    if (f.runtime === "gt120") params["with_runtime.gte"] = 120;
    if (f.language) params.with_original_language = f.language;
    return params;
}

async function findPeople(names, role) {
    const people = await Promise.all(names.map((name) => tmdb("/search/person", { query: name })));
    const missing = names.filter((name, i) => people[i].results.length === 0);
    if (missing.length) {
        throw new UserError(`No ${role} found for "${missing.join('", "')}".`);
    }
    return people.map((p) => p.results[0].id);
}

class UserError extends Error {}

const MPAA_ORDER = ["G", "PG", "PG-13", "R", "NC-17"];

async function discoverMovies(f) {
    const params = await buildDiscoverParams(f);
    const keep = f.skipSeen ? ((m) => !seenIds().has(m.id)) : (() => true);
    const first = await tmdb("/discover/movie", params);
    const totalPages = first.total_pages;
    let movies = first.results.filter(keep);
    let page = 2;
    // Five pages normally; when skipping seen trailers keep going until there are enough new ones
    const limit = f.skipSeen ? MAX_PAGES_SKIPPING_SEEN : NUM_PAGES;
    while (page <= Math.min(totalPages, limit) && (page <= NUM_PAGES || movies.length < 40)) {
        const batch = [];
        for (let i = 0; i < 5 && page <= Math.min(totalPages, limit); i++, page++) {
            batch.push(tmdb("/discover/movie", { ...params, page }));
        }
        const results = await Promise.all(batch);
        movies = movies.concat(...results.map((r) => r.results.filter(keep)));
    }
    return movies;
}

/* ---------- Watched history ---------- */

function seenIds() {
    try {
        return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []);
    } catch (err) {
        return new Set();
    }
}

function markSeen(movie) {
    if (!movie || !movie.id) return;
    const ids = [...seenIds()].filter((id) => id !== movie.id);
    ids.push(movie.id);
    try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-SEEN_LIMIT)));
    } catch (err) {
        // history just won't be remembered
    }
    updateSeenCount();
}

function updateSeenCount() {
    const n = seenIds().size;
    $id("seenCount").textContent = `${n} watched`;
    $id("clearSeenBtn").hidden = n === 0;
}

function clearSeen() {
    try {
        localStorage.removeItem(SEEN_KEY);
    } catch (err) {
        // nothing to clear
    }
    updateSeenCount();
}

/* ---------- Start / Stop ---------- */

async function start() {
    const f = readFilters();
    saveFilters();
    const run = ++state.run;
    state.mode = "running";
    state.appliedKey = filterKey(f);
    state.queue = [];
    setError("");
    setStatus(`Finding trailers: ${describeFilters(f)}…`);
    state.watched = 0;
    track("trailers_start", filterParams(f));
    updateButtons();
    collapseFiltersOnPhone();

    try {
        const movies = await discoverMovies(f);
        if (run !== state.run) return;
        if (movies.length === 0) {
            track("trailers_no_results", filterParams(f));
            $id("filterPanel").open = true; // phones folded it away on Start; they'll need it now
            stop(f.skipSeen
                ? "You've watched every trailer for these filters. Loosen them, or turn off \"Skip trailers I've already watched\"."
                : "No movies match those filters. Try loosening them.");
            return;
        }
        track("trailers_found", { movie_count: movies.length });
        state.queue = shuffle(movies);
        state.index = 0;
        state.misses = 0;
        updateButtons();
        playCurrent();
    } catch (err) {
        if (run !== state.run) return;
        console.error(err);
        if (err instanceof UserError) $id("filterPanel").open = true;
        stop(err instanceof UserError ? err.message : "Couldn't load movies. Try again.");
    }
}

function stop(message) {
    if (state.mode !== "idle" && typeof message !== "string") {
        track("trailers_stop", { trailers_watched: state.watched || 0 });
    }
    state.run++;
    state.mode = "idle";
    state.appliedKey = null;
    stopPlayer();
    $id("screenIdle").hidden = false;
    setError(typeof message === "string" ? message : "");
    setStatus("Stopped. Press Start to keep watching.");
    updateButtons();
}

function updateButtons() {
    const running = state.mode !== "idle";
    const changed = state.mode === "running" && state.appliedKey !== filterKey(readFilters());
    $id("startLabel").textContent = state.mode === "running" ? "Restart" : "Start";
    $id("startBtn").classList.toggle("is-attention", changed);
    $id("startBtn").title = changed ? "Your filters changed. Restart to use them." : "";
    $id("applyBtn").textContent = state.mode === "running"
        ? (changed ? "Restart with these filters" : "Playing these filters")
        : "Start with these filters";
    $id("applyBtn").disabled = $id("startBtn").disabled || (state.mode === "running" && !changed);
    $id("stopBtn").disabled = !running;
    const canSkip = state.mode === "running" && state.queue.length > 1;
    $id("prevBtn").disabled = !canSkip;
    $id("nextBtn").disabled = !canSkip;
    document.body.dataset.mode = state.mode;
    document.body.classList.toggle("filters-changed", changed);
}

function collapseFiltersOnPhone() {
    if (window.matchMedia("(max-width: 899px)").matches) {
        $id("filterPanel").open = false;
    }
}

/* ---------- Queue ---------- */

function step(delta) {
    if (state.queue.length === 0) return;
    const n = state.queue.length;
    state.index = (state.index + delta + n) % n;
    if (state.index === 0 && delta > 0) {
        shuffle(state.queue); // went all the way round: new order for the next lap
    }
    playCurrent();
}

async function playCurrent() {
    const run = state.run;
    const play = ++state.play;
    state.playing = false;
    const movie = state.queue[state.index];
    showMovieInfo(movie);
    setStatus(state.mode === "running"
        ? `Trailer ${state.index + 1} of ${state.queue.length}`
        : "Search result");
    const details = await movieDetails(movie);
    if (run !== state.run || play !== state.play) return;
    if (details) showMovieDetails(details);
    const videoId = await findTrailer(movie, details);
    if (run !== state.run || play !== state.play) return;
    if (!videoId) {
        onTrailerFailed();
        return;
    }
    $id("screenIdle").hidden = true;
    state.videoId = videoId;
    playVideoId(videoId);
    // Phones can block autoplay; if nothing starts, say how to get it going
    setTimeout(() => {
        if (play === state.play && !state.playing && state.mode !== "idle") {
            setStatus(`${$id("status").textContent}. Tap the video if it doesn't start.`);
        }
    }, 4000);
}

// Called by the player once a trailer is really playing.
function onTrailerPlaying() {
    // Ignore a late PLAYING event from the previous trailer while the next one loads
    const data = player && player.getVideoData ? player.getVideoData() : null;
    if (data && data.video_id && data.video_id !== state.videoId) {
        return;
    }
    if (!state.playing) {
        const movie = state.queue[state.index];
        markSeen(movie);
        state.watched = (state.watched || 0) + 1;
        track("trailer_play", {
            movie_title: movie && movie.title,
            movie_id: movie && movie.id,
            source: state.mode === "single" ? "search" : "filters",
            trailer_number: state.mode === "running" ? state.watched : undefined,
            theater: isTheater() ? "on" : "off",
        });
    }
    state.playing = true;
}

// Called by the player when a trailer finishes.
function onTrailerEnded() {
    const movie = state.queue[state.index];
    track("trailer_complete", { movie_title: movie && movie.title, movie_id: movie && movie.id });
    state.misses = 0;
    if (state.mode === "running") {
        step(1);
    } else if (state.mode === "single") {
        state.mode = "idle";
        state.queue = [];
        setStatus("Done. Press Start for more.");
        updateButtons();
    }
}

// No trailer, or YouTube wouldn't play it: move on unless everything is failing.
function onTrailerFailed() {
    if (state.mode === "idle" || state.queue.length === 0) {
        return; // a late player error after Stop, or during a Restart that's still loading
    }
    state.misses++;
    if (state.mode === "running" && state.misses < Math.min(state.queue.length, 15)) {
        step(1);
    } else {
        stop(state.mode === "single"
            ? "Couldn't find a playable trailer for that movie."
            : "Couldn't find playable trailers for these movies.");
    }
}

// One request gets the details shown in the info box and the trailer list.
async function movieDetails(movie) {
    if (!movie.id) return null;
    try {
        return await tmdb(`/movie/${movie.id}`, {
            language: "en-US",
            append_to_response: "videos,release_dates,credits",
        });
    } catch (err) {
        console.error(err);
        return null;
    }
}

// TMDB lists each movie's YouTube videos, so most trailers need no YouTube search at all.
async function findTrailer(movie, details) {
    const results = (details && details.videos && details.videos.results) || [];
    const youtube = results.filter((v) => v.site === "YouTube");
    const rank = (v) => (v.type === "Trailer" ? 0 : v.type === "Teaser" ? 2 : 4) + (v.official ? 0 : 1);
    youtube.sort((a, b) => rank(a) - rank(b));
    if (youtube.length && rank(youtube[0]) < 4) {
        return youtube[0].key;
    }
    const year = (movie.release_date || "").slice(0, 4);
    return youtubeSearch(`${movie.title} ${year} trailer`);
}

/* ---------- Movie info ---------- */

const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

function showMovieInfo(movie) {
    $id("movie").hidden = false;
    $id("movieTitle").textContent = movie.title;
    loadPoster(movie);
    $id("movieInfo").textContent = movie.overview || "";

    const [year, month, day] = (movie.release_date || "").split("-").map(Number);
    $id("releaseDate").textContent = year ? `${monthNames[month - 1]} ${day}, ${year}` : "";
    $id("rating").textContent = movie.vote_count > 0 && typeof movie.vote_average === "number"
        ? `★ ${movie.vote_average.toFixed(1)}/10`
        : "";
    $id("mpaa").textContent = "";
    $id("runtime").textContent = "";
    $id("movieCast").replaceChildren();
    const genreNames = movie.genres
        ? movie.genres.map((g) => g.name)
        : (movie.genre_ids || []).map((id) => g_genreNames[id]).filter(Boolean);
    showGenres(genreNames);

    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noopener";
    link.href = "https://www.justwatch.com/us/search?q=" + encodeURIComponent(movie.title);
    link.textContent = "Where to stream it";
    $id("canistreamlink").replaceChildren(link);
}

// Filled in once the full details arrive: rating, runtime, genres, cast.
function showMovieDetails(details) {
    $id("mpaa").textContent = usCertification(details);
    if (details.runtime > 0) {
        const h = Math.floor(details.runtime / 60);
        const m = details.runtime % 60;
        $id("runtime").textContent = h ? `${h}h ${m}m` : `${m}m`;
    }
    if (details.genres && details.genres.length) {
        showGenres(details.genres.map((g) => g.name));
    }
    const cast = ((details.credits && details.credits.cast) || []).slice(0, 4).map((c) => c.name);
    const box = $id("movieCast");
    box.replaceChildren();
    if (cast.length) {
        const wanted = readFilters().actors.map((a) => a.toLowerCase());
        const label = document.createElement("span");
        label.className = "movie-cast-label";
        label.textContent = "Starring ";
        box.append(label);
        cast.forEach((name, i) => {
            const lower = name.toLowerCase();
            const el = document.createElement(wanted.some((w) => lower.includes(w)) ? "strong" : "span");
            el.textContent = name;
            box.append(el, i < cast.length - 1 ? ", " : "");
        });
    }
}

// US MPAA rating (G, PG, PG-13, R, NC-17) if TMDB has one, theatrical release first.
function usCertification(details) {
    const us = ((details.release_dates && details.release_dates.results) || []).find((r) => r.iso_3166_1 === "US");
    if (!us) return "";
    const dates = us.release_dates.filter((d) => MPAA_ORDER.includes(d.certification));
    dates.sort((a, b) => (a.type === 3 ? -1 : 0) - (b.type === 3 ? -1 : 0));
    return dates.length ? dates[0].certification : "";
}

// Genre tags; the ones you filtered on are filled in.
function showGenres(names) {
    const picked = readFilters().genreNames;
    const box = $id("movieGenres");
    box.replaceChildren();
    names.forEach((name) => {
        const tag = document.createElement("span");
        tag.className = picked.includes(name) ? "tag is-match" : "tag";
        tag.textContent = name;
        box.append(tag);
    });
}

function loadPoster(movie) {
    const poster = $id("poster");
    if (!movie.poster_path || !g_configuration) {
        poster.replaceChildren();
        return;
    }
    const sizes = g_configuration.images.poster_sizes;
    const img = document.createElement("img");
    img.src = g_configuration.images.secure_base_url + (sizes.includes("w185") ? "w185" : sizes[0]) + movie.poster_path;
    img.alt = `${movie.title} poster`;
    poster.replaceChildren(img);
}

/* ---------- Title search ---------- */

async function searchSubmit() {
    const query = $id("searchText").value.trim();
    if (!query) return;
    const run = state.run;
    setError("");
    try {
        track("search", { search_term: query });
        const response = await tmdb("/search/movie", { query });
        if (run !== state.run) return; // Start or Stop was pressed meanwhile
        if (response.results.length === 0) {
            setError(`No movie found for "${query}".`);
            return;
        }
        state.run++;
        state.mode = "single";
        state.appliedKey = null;
        state.queue = [response.results[0]];
        state.index = 0;
        state.misses = 0;
        updateButtons();
        playCurrent();
        $id("searchText").blur();
    } catch (err) {
        console.error(err);
        setError("Search failed. Try again.");
    }
}

/* ---------- Theater mode ---------- */

const THEATER_KEY = "endlessTrailers.theater";

function setTheater(on) {
    document.documentElement.classList.toggle("theater", on);
    $id("theaterBtn").setAttribute("aria-pressed", String(on));
    try {
        localStorage.setItem(THEATER_KEY, on ? "1" : "0");
    } catch (err) {
        // not remembered, that's fine
    }
}

function toggleTheater(method) {
    const on = !isTheater();
    setTheater(on);
    track("theater_mode", { state: on ? "on" : "off", method });
}

function isTheater() {
    return document.documentElement.classList.contains("theater");
}

// Only text boxes swallow the shortcut; chips, radios and the slider don't
function isTyping(target) {
    return Boolean(target && target.closest &&
        target.closest('input[type="text"], input[type="search"], textarea, select, [contenteditable="true"]'));
}

/* ---------- Helpers ---------- */

// Fisher-Yates shuffle, in place. Unique for everyone!
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

document.addEventListener("DOMContentLoaded", () => {
    $id("trailerSearch").addEventListener("submit", (e) => {
        e.preventDefault();
        searchSubmit();
    });
    $id("filterForm").addEventListener("submit", (e) => {
        e.preventDefault();
        start();
    });
    $id("filterForm").addEventListener("input", updateFilterSummary);
    $id("filterForm").addEventListener("change", (e) => {
        // A genre can't be both wanted and hidden: checking one side clears the other
        const t = e.target;
        if (t && t.checked && (t.name === "genre" || t.name === "genreOut")) {
            const other = t.name === "genre" ? "genreOut" : "genre";
            document.querySelectorAll(`input[name="${other}"][value="${t.value}"]`).forEach((i) => {
                i.checked = false;
            });
        }
        updateFilterSummary();
        saveFilters();
    });
    $id("startBtn").addEventListener("click", start);
    $id("stopBtn").addEventListener("click", () => stop());
    $id("prevBtn").addEventListener("click", () => {
        track("trailer_skip", { direction: "back", watched_playing: state.playing ? "yes" : "no" });
        state.misses = 0;
        step(-1);
    });
    $id("nextBtn").addEventListener("click", () => {
        track("trailer_skip", { direction: "next", watched_playing: state.playing ? "yes" : "no" });
        state.misses = 0;
        step(1);
    });
    $id("resetBtn").addEventListener("click", () => {
        track("filters_reset");
        resetFilters();
    });
    $id("clearSeenBtn").addEventListener("click", () => {
        track("seen_history_cleared");
        clearSeen();
    });
    // Decade shortcuts fill in From/To (tap the lit one again to clear)
    $id("decadeChips").addEventListener("click", (e) => {
        const btn = e.target.closest(".chip-btn");
        if (!btn) return;
        const on = btn.getAttribute("aria-pressed") === "true";
        $id("yearFrom").value = on ? "" : btn.dataset.from;
        $id("yearTo").value = on ? "" : btn.dataset.to;
        $id("yearFrom").dispatchEvent(new Event("change", { bubbles: true }));
    });
    $id("theaterBtn").addEventListener("click", () => toggleTheater("button"));
    // T toggles theater mode, Esc leaves it. (Keys pressed while the video itself
    // has focus go to YouTube, so the button stays visible as the way out.)
    document.addEventListener("keydown", (e) => {
        if (e.repeat || e.isComposing || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Escape" && isTheater()) {
            toggleTheater("escape");
        } else if ((e.key === "t" || e.key === "T") && !isTyping(e.target)) {
            toggleTheater("keyboard");
        }
    });
    // The class itself was set by the inline script in <head>, before first paint
    $id("theaterBtn").setAttribute("aria-pressed", String(isTheater()));
    initialSetup();
});
