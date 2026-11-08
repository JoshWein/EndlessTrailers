/**
 * Created by Josh on 9/10/2016.
 * Plain JS (no jQuery) since 2026.
 */
const TMDB = "https://api.themoviedb.org/3";
const FALLBACK_TMDB_KEY = "a5d4199b71fd3989796a8f11a0176c28";
const DEFAULT_REGION = "us";
const NUM_PAGES = 5;

let remoteConfig;
let g_configuration;
let g_currentMovieList = [];
let g_currentMovieIndex = 0;
// What the genre dropdown last picked: {type: "genre" | "list", id}
let g_currentSelection = null;

const filters = { actor: false, minRating: false, mpaa: false };

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

function initialSetup() {
    remoteConfig = firebase.remoteConfig();
    remoteConfig.settings = { minimumFetchIntervalMillis: 3600000 };
    remoteConfig.defaultConfig = { yt_api_key: "not_set" };

    remoteConfig.fetchAndActivate()
        .catch((err) => console.error(err))
        .then(() => {
            initYoutube();
            return loadMovieDb();
        })
        .catch((err) => {
            console.error(err);
            setError("Couldn't reach The Movie DB. Try reloading.");
        });
}

async function loadMovieDb() {
    g_configuration = await tmdb("/configuration");
    const { genres } = await tmdb("/genre/movie/list");
    insertGenres(genres);
    initializeEventHandlers();
}

function insertGenres(genres) {
    const list = $id("genreList");
    genres.forEach((genre) => {
        const option = document.createElement("option");
        option.className = "genreChoice";
        option.value = genre.id;
        option.textContent = genre.name;
        list.appendChild(option);
    });
}

function initializeEventHandlers() {
    $id("genreList").addEventListener("change", function () {
        const option = this.selectedOptions[0];
        if (option.classList.contains("extraGenreChoice")) {
            g_currentSelection = { type: "list", id: option.value };
        } else if (option.classList.contains("genreChoice")) {
            g_currentSelection = { type: "genre", id: option.value };
        } else {
            return; // "Choose Genre..." placeholder
        }
        refreshResults();
    });

    bindFilter("actor", "actorText", "actorFilterApply", "actorFilterClear");
    bindFilter("minRating", "ratingMinimum", "ratingMinimumFilterApply", "ratingMinimumFilterClear");

    $id("mpaaRatingFilterApply").addEventListener("click", () => {
        filters.mpaa = selectedMpaaRating() !== null;
        updateFilterVisuals();
        refreshResults();
    });
    $id("mpaaRatingFilterClear").addEventListener("click", () => {
        filters.mpaa = false;
        document.querySelectorAll('input[name="mpaaRating"]').forEach((input) => {
            input.checked = false;
        });
        updateFilterVisuals();
        refreshResults();
    });
}

function bindFilter(name, inputId, applyId, clearId) {
    const input = $id(inputId);
    $id(applyId).addEventListener("click", () => {
        filters[name] = input.value.length > 0;
        updateFilterVisuals();
        refreshResults();
    });
    input.addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            $id(applyId).click();
        }
    });
    $id(clearId).addEventListener("click", () => {
        input.value = "";
        filters[name] = false;
        updateFilterVisuals();
        refreshResults();
    });
}

function selectedMpaaRating() {
    const checked = document.querySelector('input[name="mpaaRating"]:checked');
    return checked ? checked.value : null;
}

function refreshResults() {
    if (!g_currentSelection) {
        return;
    }
    const load = g_currentSelection.type === "list"
        ? getMoviesSpecialList(g_currentSelection.id)
        : getMovies(g_currentSelection.id);
    load.catch((err) => {
        console.error(err);
        setError("Couldn't load movies. Try again.");
    });
}

// Now Playing / Upcoming / Top Rated / Popular
async function getMoviesSpecialList(list) {
    const response = await tmdb(`/movie/${list}`, { region: DEFAULT_REGION });
    showMovieList(response.results);
}

// Build the discover request from the genre and the advanced filters
async function getMovies(genre) {
    const params = {
        with_genres: genre,
        language: "en",
        "vote_average.gte": filters.minRating ? $id("ratingMinimum").value : 4,
    };
    const rating = selectedMpaaRating();
    if (filters.mpaa && rating) {
        params.certification_country = "US";
        params.certification = rating;
    }
    if (filters.actor) {
        const result = await tmdb("/search/person", { query: $id("actorText").value });
        if (result.results.length === 0) {
            setError("No results for that actor");
            return;
        }
        $id("actorText").value = result.results[0].name;
        params.with_cast = result.results[0].id;
    }

    const first = await tmdb("/discover/movie", params);
    const pages = Math.min(first.total_pages, NUM_PAGES);
    const rest = [];
    for (let page = 2; page <= pages; page++) {
        rest.push(tmdb("/discover/movie", { ...params, page }));
    }
    const more = await Promise.all(rest);
    showMovieList(first.results.concat(...more.map((r) => r.results)));
}

function showMovieList(movies) {
    if (movies.length === 0) {
        setError("No movies found");
        return;
    }
    setError("");
    g_currentMovieList = shuffle(movies.slice()); // Unique for everyone!
    g_currentMovieIndex = 0;
    loadVideo(g_currentMovieList[0]);
}

function loadNextVideo() {
    if (g_currentMovieList.length === 0) return;
    g_currentMovieIndex = (g_currentMovieIndex + 1) % g_currentMovieList.length;
    loadVideo(g_currentMovieList[g_currentMovieIndex]);
}

function loadPreviousVideo() {
    if (g_currentMovieList.length === 0) return;
    g_currentMovieIndex = (g_currentMovieIndex - 1 + g_currentMovieList.length) % g_currentMovieList.length;
    loadVideo(g_currentMovieList[g_currentMovieIndex]);
}

function loadVideo(movie) {
    search(movie.title);
    $id("movieTitle").textContent = movie.title;
    showMovieInfo(movie);
}

const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

function showMovieInfo(movie) {
    loadPoster(movie);
    $id("movieInfo").textContent = movie.overview || "";

    const [year, month, day] = (movie.release_date || "").split("-").map(Number);
    $id("releaseDate").textContent = year
        ? `Release Date: ${monthNames[month - 1]} ${day}, ${year}`
        : "";
    $id("rating").textContent = typeof movie.vote_average === "number"
        ? `Rating: ${movie.vote_average.toFixed(2)}/10`
        : "";

    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noopener";
    link.href = "https://www.justwatch.com/us/search?q=" + encodeURIComponent(movie.title);
    link.textContent = "Can I Stream It?";
    $id("canistreamlink").replaceChildren(link);
}

function loadPoster(movie) {
    const poster = $id("poster");
    if (!movie.poster_path || !g_configuration) {
        poster.replaceChildren();
        return;
    }
    const img = document.createElement("img");
    img.src = g_configuration.images.secure_base_url + g_configuration.images.poster_sizes[0] + movie.poster_path;
    img.alt = `${movie.title} poster`;
    poster.replaceChildren(img);
}

function searchSubmit() {
    const query = $id("searchText").value;
    if (!query) return false;
    search(query);
    getMovieInfo(query).catch((err) => console.error(err));
    return false;
}

// Search YouTube for the trailer and play the first hit
function search(q) {
    let queryAddon = " trailer";
    if (filters.actor) {
        queryAddon += " " + $id("actorText").value;
    }
    if (!window.gapi || !gapi.client || !gapi.client.youtube) {
        setError("YouTube search isn't ready yet. Try again in a moment.");
        return;
    }
    gapi.client.youtube.search.list({
        q: q + queryAddon,
        part: "snippet",
        type: "video",
        maxResults: 1,
    }).execute((response) => {
        if (response && response.items && response.items.length > 0 && player) {
            player.loadVideoById(response.items[0].id.videoId, 1, "default");
        }
    });
}

// Request movie data for a free-text search
async function getMovieInfo(query) {
    const response = await tmdb("/search/movie", { query });
    if (response.results.length > 0) {
        $id("movieTitle").textContent = response.results[0].original_title;
        showMovieInfo(response.results[0]);
    } else {
        $id("movieTitle").textContent = query;
        clearMovieInfo();
        $id("releaseDate").textContent = "No info found";
    }
}

function clearMovieInfo() {
    ["releaseDate", "movieInfo", "rating", "canistreamlink", "poster", "err"].forEach((id) => {
        $id(id).replaceChildren();
    });
}

function setActive(button, active) {
    button.classList.toggle("btn-success", active);
    button.classList.toggle("btn-outline-primary", !active);
}

function updateFilterVisuals() {
    setActive($id("actorFilterApply"), filters.actor);
    setActive($id("ratingMinimumFilterApply"), filters.minRating);
    setActive($id("mpaaRatingFilterApply"), filters.mpaa);
}

// Fisher-Yates shuffle
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
    initialSetup();
});
