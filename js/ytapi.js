/**
 * YouTube Data/Player API code.
 * The Data API is only a fallback now: trailers come from TMDB's video list first.
 */
let g_youtubeSearchReady = false;
let player = null;
let g_playerReady = false;
let g_pendingVideoId = null;

let g_youtubeKey = null;
let g_gapiLoaded = false;

// The key (from Remote Config) and the async gapi script can arrive in either order.
function initYoutube(apiKey) {
    if (apiKey && apiKey !== "not_set") {
        g_youtubeKey = apiKey;
    }
    startYoutubeClient();
}

function onGapiLoad() {
    g_gapiLoaded = true;
    startYoutubeClient();
}

function startYoutubeClient() {
    if (g_youtubeSearchReady || !g_youtubeKey || !g_gapiLoaded || !window.gapi) {
        return;
    }
    const apiKey = g_youtubeKey;
    g_youtubeKey = null; // start once
    gapi.load("client", () => {
        gapi.client.setApiKey(apiKey);
        gapi.client.load("youtube", "v3", () => {
            g_youtubeSearchReady = true;
        });
    });
}

// Resolves to the first video id YouTube finds for the query, or null.
function youtubeSearch(q) {
    if (!g_youtubeSearchReady) {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        gapi.client.youtube.search.list({
            q,
            part: "snippet",
            type: "video",
            videoEmbeddable: "true",
            maxResults: 1,
        }).execute((response) => {
            const item = response && response.items && response.items[0];
            resolve(item ? item.id.videoId : null);
        });
    });
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player("player", {
        width: "100%",
        height: "100%",
        playerVars: {
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            modestbranding: 1,
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError,
        },
    });
}

function onPlayerReady() {
    g_playerReady = true;
    if (g_pendingVideoId) {
        player.loadVideoById(g_pendingVideoId);
        g_pendingVideoId = null;
    }
}

function playVideoId(videoId) {
    if (g_playerReady) {
        player.loadVideoById(videoId);
    } else {
        g_pendingVideoId = videoId;
    }
}

function stopPlayer() {
    g_pendingVideoId = null;
    if (g_playerReady) {
        player.stopVideo();
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        onTrailerEnded();
    } else if (event.data === YT.PlayerState.PLAYING) {
        onTrailerPlaying();
    }
}

// 100/101/150: removed, private or not embeddable. Skip it instead of stalling.
function onPlayerError() {
    onTrailerFailed();
}
