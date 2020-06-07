/**
* Youtube Data/Player API Code
*/
var g_youtube_api_created = false;
function initYoutube() {
    if (!g_youtube_api_created && remoteConfig.getString('yt_api_key') !== 'not_set') {
        console.log("Creating youtube api client");
        gapi.client.setApiKey(remoteConfig.getString('yt_api_key'));
        gapi.client.load("youtube", "v3", function(){
            //ready;
            console.log("Client Ready");
        });
        g_youtube_api_created = true;
    }
}

googleApiClientReady = function() {
  gapi.auth.init(function() {
    window.setTimeout(checkAuth, 1);
  });
}

var player;
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        controls: 2,
        iv_load_policy: 3,
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log("Video Player ready");
}

// when video ends
function onPlayerStateChange(event) {
    if(event.data === 0) {
        loadNextVideo();
    }
}/**
 * Created by Josh on 9/10/2016.
 */
