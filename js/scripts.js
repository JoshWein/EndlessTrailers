/**
 * Created by Josh on 9/10/2016.
 * Plain JS (no jQuery) since 2026.
 */
const TMDB = "https://api.themoviedb.org/3";
const FALLBACK_TMDB_KEY = "a5d4199b71fd3989796a8f11a0176c28";
const REGION = "US";
const NUM_PAGES = 5;
const STORAGE_KEY = "endlessTrailers.filters";

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

    try {
        g_configuration = await tmdb("/configuration");
        const { genres } = await tmdb("/genre/movie/list");
        insertGenres(genres);
    } catch (err) {
        console.error(err);
        $id("genreChips").innerHTML = '<span class="muted">Genres unavailable</span>';
        setError("Couldn't reach The Movie DB. Try reloading.");
    }
    restoreFilters();
    updateFilterSummary();
    $id("startBtn").disabled = false;
    setStatus("Ready. Press Start.");
}

function insertGenres(genres) {
    const box = $id("genreChips");
    box.replaceChildren();
    genres.forEach((genre) => {
        const label = document.createElement("label");
        label.className = "chip";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = "genre";
        input.value = genre.id;
        input.dataset.name = genre.name;
        const span = document.createElement("span");
        span.textContent = genre.name;
        label.append(input, span);
        box.appendChild(label);
    });
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
        actors: $id("actorText").value.split(",").map((s) => s.trim()).filter(Boolean),
    };
}

function filterKey(f) {
    return JSON.stringify([f.list, f.genres, f.genreMode, f.mpaa, f.minRating, f.actors]);
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
    return parts.join(", ");
}

function updateFilterSummary() {
    const f = readFilters();
    $id("filterSummary").textContent = describeFilters(f);
    $id("ratingValue").textContent = f.minRating > 0 ? `${f.minRating}+` : "Any";
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
    $id("ratingMinimum").value = saved.minRating || 0;
    $id("actorText").value = (saved.actors || []).join(", ");
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
        const people = await Promise.all(f.actors.map((name) => tmdb("/search/person", { query: name })));
        const missing = f.actors.filter((name, i) => people[i].results.length === 0);
        if (missing.length) {
            throw new UserError(`No actor found for "${missing.join('", "')}".`);
        }
        params.with_cast = people.map((p) => p.results[0].id).join(",");
    }
    return params;
}

class UserError extends Error {}

const MPAA_ORDER = ["G", "PG", "PG-13", "R", "NC-17"];

async function discoverMovies(f) {
    const params = await buildDiscoverParams(f);
    const first = await tmdb("/discover/movie", params);
    const pages = Math.min(first.total_pages, NUM_PAGES);
    const rest = [];
    for (let page = 2; page <= pages; page++) {
        rest.push(tmdb("/discover/movie", { ...params, page }));
    }
    const more = await Promise.all(rest);
    return first.results.concat(...more.map((r) => r.results));
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
    updateButtons();
    collapseFiltersOnPhone();

    try {
        const movies = await discoverMovies(f);
        if (run !== state.run) return;
        if (movies.length === 0) {
            stop("No movies match those filters. Try loosening them.");
            return;
        }
        state.queue = shuffle(movies);
        state.index = 0;
        state.misses = 0;
        updateButtons();
        playCurrent();
    } catch (err) {
        if (run !== state.run) return;
        console.error(err);
        stop(err instanceof UserError ? err.message : "Couldn't load movies. Try again.");
    }
}

function stop(message) {
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
    const videoId = await findTrailer(movie);
    if (run !== state.run || play !== state.play) return;
    if (!videoId) {
        onTrailerFailed();
        return;
    }
    $id("screenIdle").hidden = true;
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
    state.playing = true;
}

// Called by the player when a trailer finishes.
function onTrailerEnded() {
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

// TMDB lists each movie's YouTube videos, so most trailers need no YouTube search at all.
async function findTrailer(movie) {
    try {
        if (movie.id) {
            const { results } = await tmdb(`/movie/${movie.id}/videos`, { language: "en-US" });
            const youtube = results.filter((v) => v.site === "YouTube");
            const rank = (v) => (v.type === "Trailer" ? 0 : v.type === "Teaser" ? 2 : 4) + (v.official ? 0 : 1);
            youtube.sort((a, b) => rank(a) - rank(b));
            if (youtube.length && rank(youtube[0]) < 4) {
                return youtube[0].key;
            }
        }
    } catch (err) {
        console.error(err);
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

    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noopener";
    link.href = "https://www.justwatch.com/us/search?q=" + encodeURIComponent(movie.title);
    link.textContent = "Where to stream it";
    $id("canistreamlink").replaceChildren(link);
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
    $id("filterForm").addEventListener("change", () => {
        updateFilterSummary();
        saveFilters();
    });
    $id("startBtn").addEventListener("click", start);
    $id("stopBtn").addEventListener("click", () => stop());
    $id("prevBtn").addEventListener("click", () => {
        state.misses = 0;
        step(-1);
    });
    $id("nextBtn").addEventListener("click", () => {
        state.misses = 0;
        step(1);
    });
    $id("resetBtn").addEventListener("click", resetFilters);
    $id("theaterBtn").addEventListener("click", () => setTheater(!isTheater()));
    // T toggles theater mode, Esc leaves it. (Keys pressed while the video itself
    // has focus go to YouTube, so the button stays visible as the way out.)
    document.addEventListener("keydown", (e) => {
        if (e.repeat || e.isComposing || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Escape" && isTheater()) {
            setTheater(false);
        } else if ((e.key === "t" || e.key === "T") && !isTyping(e.target)) {
            setTheater(!isTheater());
        }
    });
    // The class itself was set by the inline script in <head>, before first paint
    $id("theaterBtn").setAttribute("aria-pressed", String(isTheater()));
    initialSetup();
});
