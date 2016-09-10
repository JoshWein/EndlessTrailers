var currentMovieList;
var currentMovieIndex;
var configuration;
var genreMap;

function initialSetup() {
    getConfiguration();
    getGenres();
}
function getConfiguration() {
    $.ajax({
        url: "https://api.themoviedb.org/3/configuration",
        data: {
            api_key: "a5d4199b71fd3989796a8f11a0176c28"
        },
        success: function(data) {
            configuration = data;
            console.log(configuration);
        }
    });
}

function getGenres() {
    console.log("a");
    $.ajax({
        url: "https://api.themoviedb.org/3/genre/movie/list",
        data: {
            api_key: "a5d4199b71fd3989796a8f11a0176c28"
        },
        success: function(data) {
            setupSite(data.genres);
            genreMap = {}
            for(var i = 0; i < data.genres.length; i++) {
                genreMap[data.genres[i].id] = data.genres[i].name;
            }
            console.log(genreMap);
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
        getMovies(this.id);
        $(".genreChoice").removeClass("activeGenre");
        $(this).addClass("activeGenre");
    });
}

function getMovies(genre) {
    console.log("Getting " + genre + " movies");
    $.ajax({
        url: "https://api.themoviedb.org/3/discover/movie",
        data: {
            api_key: "a5d4199b71fd3989796a8f11a0176c28",
            with_genres: genre,
            language: "en"
        },
        success: function(data) {
            currentMovieList = data.results;
            // Unique every time!
            shuffle(currentMovieList);
            console.log(currentMovieList);
            currentMovieIndex = 0;
            loadVideo(currentMovieList[currentMovieIndex]);
        }
    });
}

function loadNextVideo() {
    currentMovieIndex++;
    if(currentMovieIndex > currentMovieList.length - 1) {
        currentMovieIndex = 0;
    }
    loadVideo(currentMovieList[currentMovieIndex]);
}

function loadPreviousVideo() {
    currentMovieIndex--;
    if(currentMovieIndex < 0) {
        currentMovieIndex = currentMovieList.length - 1;
    }
    loadVideo(currentMovieList[currentMovieIndex]);
}

function loadVideo(movie) {
    search(movie.title);
    showMovieInfo(movie);
    loadPoster(movie);
}

var monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

function showMovieInfo(data) {
    // Set movie info
    $("#movieInfo").html(data.overview);
    var date = new Date(data.release_date.substring(0, 4), data.release_date.substring(5,7), data.release_date.substring(8,10) );
    // Set release date
    $("#releaseDate").html("Release Date: " + monthNames[date.getMonth()] +" " + date.getDate() + ", " + date.getFullYear());
    // Set rating
    $("#rating").html("Rating: " + data.vote_average);
}

function loadPoster(data) {
    var base_url = configuration.images.secure_base_url;
    var size = configuration.images.poster_sizes[0];
    $("#poster").html("<img src=\"" + base_url+size+data.poster_path + "\">");
    console.log(base_url+size+data.poster_path);
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

document.onload = initialSetup();


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
        controls: 2,
        iv_load_policy: 3,
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
