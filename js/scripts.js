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
            console.log("genres loaded");
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
            $("#genreList").html($("#genreList").html() + "<div class=\"genreChoice\" id=\""+a.id+"\">"+ a.name + "</div>");
        }
    )
}

function initializeEventHandlers() {
    $(".genreChoice").click(function() {
        console.log(this);
        getMovies(this.id);
    });
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
            showMovieInfo(currentMovieList[currentMovieIndex]);
        }
    });
}

function loadNextVideo() {
    currentMovieIndex++;
    if(currentMovieIndex > currentMovieList.length - 1) {
        currentMovieIndex = 0;
    }
    search(currentMovieList[currentMovieIndex].title);
    showMovieInfo(currentMovieList[currentMovieIndex]);
}

function loadPreviousVideo() {
    currentMovieIndex--;
    if(currentMovieIndex < 0) {
        currentMovieIndex = currentMovieList.length - 1;
    }
    search(currentMovieList[currentMovieIndex].title);
    showMovieInfo(currentMovieList[currentMovieIndex]);
}

function showMovieInfo(data) {
    // Set movie info
    $("#movieInfo").html(data.overview);
    var date = new Date(data.release_date.substring(0, 4), data.release_date.substring(5,7), data.release_date.substring(8,10) );
    date.setMonth(date.getMonth() - 1)
    // Set release date
    $("#releaseDate").html("Release Date: " + date.getMonth() +"/" + date.getDate() + "/" + date.getFullYear());
    // Set rating
    $("#rating").html("Rating: " + data.vote_average);

}

$(function() {
    $("#trailerSearch").submit(function() {
        searchSubmit();
        return false;
    });
});

function searchSubmit() {
    search($("#searchText").val());
    return false;
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
        $("#movieTitle").html(q);
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


/**
 * Youtube Data/Player API Code
 */
function init() {
    gapi.client.setApiKey("AIzaSyDw7S38ScuTjqJ7uQZf9MAyRdhemeUEJnc");
    gapi.client.load("youtube", "v3", function(){
        //ready;
        console.log("Player ready");
    })
}
var player;
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: '',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    // event.target.playVideo();
}

// when video ends
function onPlayerStateChange(event) {
    if(event.data === 0) {
        loadNextVideo();
    }
}
