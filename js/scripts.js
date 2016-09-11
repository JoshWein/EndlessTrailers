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
        }
    });
}

function getGenres() {
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
        }
    });
}

function setupSite(genres) {
    insertGenres(genres);
    initializeEventHandlers();
    currentMovieList = [];
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
    compileRequestData(genre);
}

function getMoviesWithData(data, initialCall, remaining) {
    $.ajax({
        url: "https://api.themoviedb.org/3/discover/movie",
        data: data,
        success: function(response) {
            currentMovieList = currentMovieList.concat(response.results);
            if(initialCall) {
                getMoreMovies(data);
            }
            if(remaining === 1) {
                // Unique for everyone!
                shuffle(currentMovieList);
                currentMovieIndex = 0;
                loadVideo(currentMovieList[currentMovieIndex]);
            }
        }
    });
}

function getMoreMovies(data) {
    currentMovieList = [];
    var pageCounter;
    if(data.total_pages < 4) {
        pageCounter = data.total_pages;
    } else {
        pageCounter = 4;
    }
    while(pageCounter > 1) {
        data["page"] = pageCounter--;
        getMoviesWithData(data, false, pageCounter);
    }
}

function compileRequestData(genre) {
    var data = {
        api_key: "a5d4199b71fd3989796a8f11a0176c28",
        with_genres: genre,
        language: "en"
    };
    if($("#ratingCheckbox").is(":checked")) {
        data["vote_average.gte"] =  $("#ratingMinimum").val();
    } else {
        data["vote_average.gte"] = 4;
    }
    if($("#actorCheckbox").is(":checked")) {
        $.ajax({
            url: "https://api.themoviedb.org/3/search/person",
            data: {
                api_key: "a5d4199b71fd3989796a8f11a0176c28",
                query: $("#actorText").val()
            },
            success: function(result) {
                data["with_cast"] = result.results[0].id;
                getMoviesWithData(data, true);
            }
        });
    } else {
        getMoviesWithData(data, true);
    }
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
    $("#rating").html("Rating: " + data.vote_average.toFixed(1) + "/10");
    $("#canistreamlink").html("<a target=\"_blank\" href=\"http://www.canistream.it/search/movie/"+data.title+"\">Can I Stream It?</a>")
}

function loadPoster(data) {
    var base_url = configuration.images.secure_base_url;
    var size = configuration.images.poster_sizes[0];
    $("#poster").html("<img src=\"" + base_url+size+data.poster_path + "\">");
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
