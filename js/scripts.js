var currentMovieList;
var currentMovieIndex;

function getGenres() {
    console.log("Loading genres...");
    $.ajax({
        url: "https://api.themoviedb.org/3/genre/movie/list",
        data: {
            api_key: "a5d4199b71fd3989796a8f11a0176c28"
        },
        success: function(data) {
            setupSite(data.genres);
        }
    });
}

function setupSite(genres) {
    insertGenres(genres);
    initializeEventHandlers();
}

function insertGenres(genres) {
    genres.forEach(function(a) {
            $("#genreList").html($("#genreList").html() + "<li class=\"genreChoice\" id=\""+a.id+"\">"+ a.name + "</li>");
        }
    )
}

function initializeEventHandlers() {
    $(".genreChoice").click(function() {
        console.log(this);
        getMovies(this.id);
    });
    document.getElementById("videoPlayer").addEventListener('ended', loadNextVideo,false);
}

function getMovies(genre) {
    console.log("Getting " + genre + " movies");
    $.ajax({
        url: "https://api.themoviedb.org/3/discover/movie",
        data: {
            api_key: "a5d4199b71fd3989796a8f11a0176c28",
            with_genres: genre
        },
        success: function(data) {
            currentMovieList = data.results;
            // Unique every time!
            shuffle(currentMovieList);
            console.log(currentMovieList);
            currentMovieIndex = 0;
            search(currentMovieList[currentMovieIndex].title);
        }
    });
}

function loadNextVideo() {
    console.log("nexting");
    currentMovieIndex++;
    search(currentMovieList[currentMovieIndex].title);
}

function init() {
    gapi.client.setApiKey("AIzaSyDw7S38ScuTjqJ7uQZf9MAyRdhemeUEJnc");
    gapi.client.load("youtube", "v3", function(){
        //ready;
        console.log("ready");
    })
}

// Search for a specified string.
function search(q) {
    var request = gapi.client.youtube.search.list({
        q: q + " trailer",
        part: 'snippet',
        type: "video",
        maxResults: 1
    });

    request.execute(function(response) {
        console.log(response);
        player.loadVideoById(response.items[0].id.videoId, 1, "default");
        $("#videoTitle").html(q);
    });
}

// Knuth shuffle
function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

document.onload = getGenres();

var player;
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: 'M7lc1UVf-VE',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

// autoplay video
function onPlayerReady(event) {
    event.target.playVideo();
}

// when video ends
function onPlayerStateChange(event) {
    if(event.data === 0) {
        currentMovieIndex++;
        search(currentMovieList[currentMovieIndex].title);
    }
}
