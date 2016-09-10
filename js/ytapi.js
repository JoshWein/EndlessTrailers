/**
* Youtube Data/Player API Code
*/
function init() {
    console.log("initing")
    gapi.client.setApiKey("AIzaSyDw7S38ScuTjqJ7uQZf9MAyRdhemeUEJnc");
    gapi.client.load("youtube", "v3", function(){
        //ready;
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
    console.log("Player ready");
}

// when video ends
function onPlayerStateChange(event) {
    if(event.data === 0) {
        loadNextVideo();
    }
}/**
 * Created by Josh on 9/10/2016.
 */
