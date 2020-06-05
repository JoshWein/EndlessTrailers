/**
* Youtube Data/Player API Code
*/
function init() {
    gapi.client.setApiKey("AIzaSyBH7fP5kldmBUXnpUSP8dkgAZHvDKnNRSk");
    gapi.client.load("youtube", "v3", function(){
        //ready;
    })
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
    // event.target.playVideo();
}

// when video ends
function onPlayerStateChange(event) {
    if(event.data === 0) {
        loadNextVideo();
    }
}/**
 * Created by Josh on 9/10/2016.
 */
