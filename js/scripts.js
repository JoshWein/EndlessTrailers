var g_currentMovieList;
var g_currentMovieIndex;
var g_configuration;
var g_genreMap;
var g_advancedFilters;
var g_NUM_FILTERS;
var g_ACTOR_FILTER;
var g_MIN_RATING_FILTER;
var g_MPAA_FILTER;
var g_DEFAULT_REGION = "us";
var g_numpages = 5;

function initialSetup() {
    getConfiguration();
    getGenres();
}
function getConfiguration() {
    $.ajax({
        url: "https://api.themoviedb.org/3/configuration",
        data: {
            api_key: api_key
        },
        success: function (data) {
            g_configuration = data;
        }
    });
}

function getGenres() {
    $.ajax({
        url: "https://api.themoviedb.org/3/genre/movie/list",
        data: {
            api_key: api_key
        },
        success: function (data) {
            setupSite(data.genres);
            g_genreMap = {}
            for (var i = 0; i < data.genres.length; i++) {
                g_genreMap[data.genres[i].id] = data.genres[i].name;
            }
        }
    });
}

function setupSite(genres) {
    setupFilters();
    insertGenres(genres);
    initializeEventHandlers();
    g_currentMovieList = [];
}

function setupFilters() {
    g_NUM_FILTERS = 2;
    g_ACTOR_FILTER = 0;
    g_MIN_RATING_FILTER = 1;
    g_MPAA_FILTER = 3;
    g_advancedFilters = [];
    for (var i = 0; i < g_NUM_FILTERS; i++) {
        g_advancedFilters[i] = false;
    }
}

function insertGenres(genres) {
    $(".spinner").addClass("hidden");
    $("#genreList").html("");

    genres.forEach(function (a) {
            $("#genreList").html($("#genreList").html() + "<div class=\"genreChoice\" id=\"" + a.id + "\">" + a.name + "</div>");
        }
    )
}

function initializeEventHandlers() {
    $(".genreChoice").click(function () {
        getMovies(this.id);
        $(".genreChoice").removeClass("activeGenre");
        $(".extraGenreChoice").removeClass("activeGenre");
        $(this).addClass("activeGenre");
    });
    $(".extraGenreChoice").click(function () {
        getMoviesSpecialList(this.id);
        $(".genreChoice").removeClass("activeGenre");
        $(".extraGenreChoice").removeClass("activeGenre");
        $(this).addClass("activeGenre");
    });
    $("#refreshResults").click(function () {
        refreshResults();
    });
    initializeFilterEventHandlers();
}

function initializeFilterEventHandlers() {
    initializeFilterPanelEventHandlers();
    initializeActorFilterEventHandlers();
    initMinRatingFilterEventHandlers();
    initMpaaRatingFilterEventHandlers();
}

function initializeFilterPanelEventHandlers() {
    $(document).on('click', '.panel-heading span.clickable', function (e) {
        var $this = $(this);
        if (!$this.hasClass('panel-collapsed')) {
            $this.parents('.panel').find('.panel-body').slideUp();
            $this.addClass('panel-collapsed');
            $this.find('i').removeClass('glyphicon-minus').addClass('glyphicon-plus');
        } else {
            $this.parents('.panel').find('.panel-body').slideDown();
            $this.removeClass('panel-collapsed');
            $this.find('i').removeClass('glyphicon-plus').addClass('glyphicon-minus');
        }
    });
    $(document).on('click', '.panel div.clickable', function (e) {
        var $this = $(this);
        if (!$this.hasClass('panel-collapsed')) {
            $this.parents('.panel').find('.panel-body').slideUp();
            $this.addClass('panel-collapsed');
            $this.find('i').removeClass('glyphicon-minus').addClass('glyphicon-plus');
        } else {
            $this.parents('.panel').find('.panel-body').slideDown();
            $this.removeClass('panel-collapsed');
            $this.find('i').removeClass('glyphicon-plus').addClass('glyphicon-minus');
        }
    });
}

function initializeActorFilterEventHandlers() {
    $("#actorFilterApply").click(function () {
        if ($("#actorText").val().length > 0) {
            g_advancedFilters[g_ACTOR_FILTER] = true;
        } else {
            g_advancedFilters[g_ACTOR_FILTER] = false;
        }
        updateFilterVisuals();
        refreshResults();
    });
    $("#actorText").keyup(function (e) {
        if (e.keyCode == 13) {
            $("#actorFilterApply").click();
        }
    })
    $("#actorFilterClear").click(function () {
        $("#actorText").val("");
        g_advancedFilters[g_ACTOR_FILTER] = false;
        updateFilterVisuals();
        refreshResults();
    });
}

function initMinRatingFilterEventHandlers() {
    $("#ratingMinimumFilterApply").click(function () {
        if ($("#ratingMinimum").val().length > 0) {
            g_advancedFilters[g_MIN_RATING_FILTER] = true;
        } else {
            g_advancedFilters[g_MIN_RATING_FILTER] = false;
        }
        updateFilterVisuals();
        refreshResults();
    });
    $("#ratingMinimum").keyup(function (e) {
        if (e.keyCode == 13) {
            $("#ratingMinimumFilterApply").click();
        }
    });
    $("#ratingMinimumFilterClear").click(function () {
        $("#ratingMinimum").val("");
        g_advancedFilters[g_MIN_RATING_FILTER] = false;
        updateFilterVisuals();
        refreshResults();
    });
}

function initMpaaRatingFilterEventHandlers() {
    $("#mpaaRatingFilterApply").click(function () {
        g_advancedFilters[g_MPAA_FILTER] = true;
        updateFilterVisuals();
        refreshResults();
    });
    $("#mpaaRatingFilterClear").click(function () {
        g_advancedFilters[g_MPAA_FILTER] = false;
        updateFilterVisuals();
        refreshResults();
    });
}

function refreshResults() {
    if ($(".activeGenre").length > 0) {
        getMovies($(".activeGenre")[0].id);
    } else {
        if ($("#actorText").val().length > 0) {
            $.ajax({
                url: "https://api.themoviedb.org/3/search/person",
                data: {
                    api_key: api_key,
                    query: $("#actorText").val()
                },
                success: function (result) {
                    if (result.results.length > 0) {
                        $("#actorText").val(result.results[0].name);
                        ;
                    } else {
                        $("#err").html("No results for that actor");
                    }
                }
            });
        }
    }
}

function getMovies(genre) {
    compileRequestData(genre);
}

function getMoviesSpecialList(id) {
    var url = "https://api.themoviedb.org/3/movie/" + id;
    var data = {
        api_key: api_key,
        region: g_DEFAULT_REGION
    };
    $.ajax({
        url: url,
        data: data,
        success: function (response) {
            // if (initialCall) {
            //     g_currentMovieList = [];
            //     getMoreMovies(data, response);
            // }
            g_currentMovieList = [];
            g_currentMovieList = g_currentMovieList.concat(response.results);
            // if (remaining === 1) {
            if (g_currentMovieList.length > 0) {
                $("#err").html("");
                // Unique for everyone!
                shuffle(g_currentMovieList);
                g_currentMovieIndex = 0;
                loadVideo(g_currentMovieList[g_currentMovieIndex]);
            } else {
                $("#err").html("No movies found");
            }
            // }
        }
    });
}

function getMoviesWithData(data, initialCall, remaining) {
    $.ajax({
        url: "https://api.themoviedb.org/3/discover/movie",
        data: data,
        success: function (response) {
            if (initialCall) {
                g_currentMovieList = [];
                getMoreMovies(data, response);
            }
            g_currentMovieList = g_currentMovieList.concat(response.results);
            if (remaining === 1) {
                if (g_currentMovieList.length > 0) {
                    $("#err").html("");
                    // Unique for everyone!
                    shuffle(g_currentMovieList);
                    console.log(g_currentMovieList);
                    g_currentMovieIndex = 0;
                    loadVideo(g_currentMovieList[g_currentMovieIndex]);
                } else {
                    $("#err").html("No movies found");
                }
            }
        }
    });
}

function getMoreMovies(data, response) {
    var pageCounter;
    if (response.total_pages < g_numpages) {
        pageCounter = response.total_pages;
    } else {
        pageCounter = g_numpages;
    }
    while (pageCounter > 1) {
        data["page"] = pageCounter;
        getMoviesWithData(data, false, pageCounter--);
    }
    getMoviesWithData(data, false, pageCounter);
}

// Build the data request object based on genre choice and advanced filters
function compileRequestData(genre) {
    var data = {
        api_key: api_key,
        with_genres: genre,
        language: "en"
    };
    if (g_advancedFilters[g_MIN_RATING_FILTER]) {
        data["vote_average.gte"] = $("#ratingMinimum").val();
    } else {
        data["vote_average.gte"] = 4;
    }
    if(g_advancedFilters[g_MPAA_FILTER]) {
        data["certification_country"] = "US";
        $('#advancedFilterMpaaRating .btn.active').each(function() {
            data["certification"] = this.textContent;
        });
    }
    if (g_advancedFilters[g_ACTOR_FILTER]) {
        $.ajax({
            url: "https://api.themoviedb.org/3/search/person",
            data: {
                api_key: api_key,
                query: $("#actorText").val()
            },
            success: function (result) {
                if (result.results.length > 0) {
                    $("#actorText").val(result.results[0].name);
                    data["with_cast"] = result.results[0].id;
                    getMoviesWithData(data, true);
                } else {
                    $("#err").html("No results for that actor");
                }
            }
        });
    } else {
        getMoviesWithData(data, true);
    }
}

function loadNextVideo() {
    g_currentMovieIndex++;
    if (g_currentMovieIndex > g_currentMovieList.length - 1) {
        g_currentMovieIndex = 0;
    }
    loadVideo(g_currentMovieList[g_currentMovieIndex]);
}

function loadPreviousVideo() {
    g_currentMovieIndex--;
    if (g_currentMovieIndex < 0) {
        g_currentMovieIndex = g_currentMovieList.length - 1;
    }
    loadVideo(g_currentMovieList[g_currentMovieIndex]);
}

function loadVideo(movie) {
    search(movie.title);
    $("#movieTitle").html(movie.title);
    showMovieInfo(movie);
}

var monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

function showMovieInfo(data) {
    loadPoster(data);
    // Set movie info
    $("#movieInfo").html(data.overview);
    var date = new Date(data.release_date.substring(0, 4), data.release_date.substring(5, 7), data.release_date.substring(8, 10));
    // Set release date
    $("#releaseDate").html("Release Date: " + monthNames[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear());
    // Set rating
    $("#rating").html("Rating: " + data.vote_average.toFixed(2) + "/10");
    $("#canistreamlink").html("<a target=\"_blank\" href=\"http://www.canistream.it/search/movie/" + data.title + "\">Can I Stream It?</a>");
}

function loadPoster(data) {
    var base_url = g_configuration.images.secure_base_url;
    var size = g_configuration.images.poster_sizes[0];
    $("#poster").html("<img src=\"" + base_url + size + data.poster_path + "\">");
}

$(function () {
    $("#trailerSearch").submit(function () {
        searchSubmit();
        return false;
    });
});

function searchSubmit() {
    console.log($("#searchText").val());
    search($("#searchText").val());
    getMovieInfo($("#searchText").val());
    return false;
}

// Search for a specified string.
function search(q) {
    var queryAddon = " trailer";
    if (g_advancedFilters[g_ACTOR_FILTER]) {
        queryAddon += " " + $("#actorText").val();
    }
    var request = gapi.client.youtube.search.list({
        q: q + queryAddon,
        part: 'snippet',
        type: "video",
        maxResults: 1
    });

    request.execute(function (response) {
        player.loadVideoById(response.items[0].id.videoId, 1, "default");
    });
}

// Request movie data
function getMovieInfo(query) {
    $.ajax({
        url: "https://api.themoviedb.org/3/search/movie",
        data: {
            api_key: api_key,
            query: query
        },
        success: function (response) {
            if (response.results.length > 0) {
                $("#movieTitle").html(response.results[0].original_title);
                showMovieInfo(response.results[0])
            } else {
                $("#movieTitle").html(query);
                clearMovieInfo();
                $("#releaseDate").html("No info found");
            }
        }
    });
}

function clearMovieInfo() {
    $("#releaseDate").html("");
    $("#movieInfo").html("");
    $("#rating").html("");
    $("#canistreamlink").html("");
    $("#poster").html("");
    $("#err").html("");
}

function updateFilterVisuals() {
    if (g_advancedFilters[g_ACTOR_FILTER]) {
        $("#advancedFilterActor").addClass("has-success");
        $("#actorFilterApply").removeClass("btn-default").addClass("btn-success");
    } else {
        $("#advancedFilterActor").removeClass("has-success");
        $("#actorFilterApply").addClass("btn-default").removeClass("btn-success");
    }
    if (g_advancedFilters[g_MIN_RATING_FILTER]) {
        $("#advancedFilterRating").addClass("has-success");
        $("#ratingMinimumFilterApply").removeClass("btn-default").addClass("btn-success");
    } else {
        $("#advancedFilterRating").removeClass("has-success");
        $("#ratingMinimumFilterApply").addClass("btn-default").removeClass("btn-success");
    }
    if (g_advancedFilters[g_MPAA_FILTER]) {
        $('#advancedFilterMpaaRating .btn').removeClass("btn-success").addClass("btn-default");
        $('#advancedFilterMpaaRating .btn.active').each(function() {
            $(this).removeClass("btn-default").addClass("btn-success");
        });
    } else {
        $('#advancedFilterMpaaRating .btn').removeClass("btn-success").removeClass('active').addClass("btn-default");
    }
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

var api_key = "a5d4199b71fd3989796a8f11a0176c28";


