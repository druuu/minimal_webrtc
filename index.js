var USE_AUDIO = true;
var USE_VIDEO = true;
var DEFAULT_CHANNEL = 'some-global-channel-name';
var MUTE_AUDIO_BY_DEFAULT = false;

var ICE_SERVERS = [
    {urls: "stun:stun.l.google.com:19302"},
    {urls: "turn:try.refactored.ai:3478", username: "test99", credential: "test"}
];


var dcs = {};
var signaling_socket = null;   /* our socket.io connection to our webserver */
var local_media_stream = null; /* our own microphone / webcam */
var peers = {};                /* keep track of our peer connections, indexed by peer_id (aka socket.io id) */
var peer_media_elements = {};  /* keep track of our <video>/<audio> tags, indexed by peer_id */

function init() {
    console.log("Connecting to signaling server");
    signaling_socket = io.connect();

    signaling_socket.on('connect', function() {
        console.log("Connected to signaling server");
        join_chat_channel(DEFAULT_CHANNEL, {'whatever-you-want-here': 'stuff'});
        $('body').append($('<h3>'+signaling_socket.id+'</h3><hr/><br/>'));
    });
    signaling_socket.on('disconnect', function() {
        console.log("Disconnected from signaling server");
        /* Tear down all of our peer connections and remove all the
         * media divs when we disconnect */
        for (peer_id in peer_media_elements) {
            peer_media_elements[peer_id].remove();
        }
        for (peer_id in peers) {
            peers[peer_id].close();
        }

        peers = {};
        peer_media_elements = {};
    });
    function join_chat_channel(channel, userdata) {
        signaling_socket.emit('join', {"channel": channel, "userdata": userdata});
    }
    function part_chat_channel(channel) {
        signaling_socket.emit('part', channel);
    }


    signaling_socket.on('addPeer', function(config) {
        console.log('Signaling server said to add peer:', config);
        var peer_id = config.peer_id;
        if (peer_id in peers) {
            /* This could happen if the user joins multiple channels where the other peer is also in. */
            console.log("Already connected to peer ", peer_id);
            return;
        }

        var peer_connection = new RTCPeerConnection({"iceServers": ICE_SERVERS});
        peers[peer_id] = peer_connection;
        var dataChannel = peer_connection.createDataChannel('data');
        dcs[peer_id] = dataChannel;
        var button = $('<button/>').text('send to '+peer_id).click(function () {
            dataChannel.send((new Date).getTime());
        });
        $('body').append(button);
        $('body').append($('<br/><span id="'+peer_id+'"></span><br/><br/>'));
        console.log('create data channel');
        dataChannel.onmessage = function(e) { 
            $('#'+peer_id).text(peer_id+' time: '+e.data);
            console.log(e.data); 
        };

        peer_connection.onicecandidate = function(event) {
            if (event.candidate) {
                signaling_socket.emit('relayICECandidate', {
                    'peer_id': peer_id, 
                    'ice_candidate': {
                        'sdpMLineIndex': event.candidate.sdpMLineIndex,
                        'candidate': event.candidate.candidate
                    }
                });
            }
        }

        if (config.should_create_offer) {
            console.log("Creating RTC offer to ", peer_id);
            peer_connection.createOffer(
                function (local_description) { 
                    console.log("Local offer description is: ", local_description);
                    peer_connection.setLocalDescription(local_description,
                        function() { 
                            signaling_socket.emit('relaySessionDescription', 
                                {'peer_id': peer_id, 'session_description': local_description});
                            console.log("Offer setLocalDescription succeeded"); 
                        },
                        function() { Alert("Offer setLocalDescription failed!"); }
                    );
                },
                function (error) {
                    console.log("Error sending offer: ", error);
                });
        }
    });


    /** 
     * Peers exchange session descriptions which contains information
     * about their audio / video settings and that sort of stuff. First
     * the 'offerer' sends a description to the 'answerer' (with type
     * "offer"), then the answerer sends one back (with type "answer").  
     */
    signaling_socket.on('sessionDescription', function(config) {
        console.log('Remote description received: ', config);
        var peer_id = config.peer_id;
        var peer = peers[peer_id];

        peer.ondatachannel = function (event) {
            var dataChannel = event.channel;
            console.log('ondatachannel');
            dataChannel.onmessage = function(e) { 
                $('#'+peer_id).text(e.data);
                console.log(e.data); 
            };
        };

        var remote_description = config.session_description;
        console.log(config.session_description);

        var desc = new RTCSessionDescription(remote_description);
        var stuff = peer.setRemoteDescription(desc, 
            function() {
                console.log("setRemoteDescription succeeded");
                if (remote_description.type == "offer") {
                    console.log("Creating answer");
                    peer.createAnswer(
                        function(local_description) {
                            console.log("Answer description is: ", local_description);
                            peer.setLocalDescription(local_description,
                                function() { 
                                    signaling_socket.emit('relaySessionDescription', 
                                        {'peer_id': peer_id, 'session_description': local_description});
                                    console.log("Answer setLocalDescription succeeded");
                                },
                                function() { Alert("Answer setLocalDescription failed!"); }
                            );
                        },
                        function(error) {
                            console.log("Error creating answer: ", error);
                            console.log(peer);
                        });
                }
            },
            function(error) {
                console.log("setRemoteDescription error: ", error);
            }
        );
        console.log("Description Object: ", desc);

    });

    signaling_socket.on('iceCandidate', function(config) {
        var peer = peers[config.peer_id];
        var ice_candidate = config.ice_candidate;
        peer.addIceCandidate(new RTCIceCandidate(ice_candidate));
    });


    signaling_socket.on('removePeer', function(config) {
        console.log('Signaling server said to remove peer:', config);
        var peer_id = config.peer_id;
        if (peer_id in peer_media_elements) {
            peer_media_elements[peer_id].remove();
        }
        if (peer_id in peers) {
            peers[peer_id].close();
        }

        delete peers[peer_id];
        delete peer_media_elements[config.peer_id];
    });
}

init();
