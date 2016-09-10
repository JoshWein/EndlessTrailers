function getGenres() {
    console.log("Loading genres...");
    $.ajax({
        url: "https://api.themoviedb.org/3/genre/movie/list",
        data: {
            api_key: "a5d4199b71fd3989796a8f11a0176c28"
        },
        success: function(data) {
            insertGenres(data.genres);
        }
    });
}

function insertGenres(genres) {
    genres.forEach(function(a) {
            $("#genreList").html($("#genreList").html() + "<li>" + a.name + "</li>");
        }
    )
}
document.onload = getGenres();