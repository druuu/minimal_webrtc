var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var socketIO = require('socket.io');
var uuid = require('node-uuid');
//var crypto = require('crypto');

var fileServer = new(nodeStatic.Server)();
var app = http.createServer(function (req, res) {
    fileServer.serve(req, res);
}).listen(1256, '0.0.0.0');

var io = socketIO.listen(app);

io.sockets.on('connection', function (client) {
    client.resources = {
        screen: false,
        video: true,
        audio: false
    };

    // pass a message to another id
    client.on('message', function (details) {
        if (!details) return;

        var otherClient = io.sockets.sockets[details.to];
        if (!otherClient) return;

        details.from = client.id;
        otherClient.emit('message', details);
    });

    client.on('shareScreen', function () {
        client.resources.screen = true;
    });

    client.on('unshareScreen', function (type) {
        client.resources.screen = false;
        removeFeed('screen');
    });

    client.on('join', join);

    function removeFeed(type) {
        if (client.room) {
            io.sockets.in(client.room).emit('remove', {
                id: client.id,
                type: type
            });
            if (!type) {
                client.leave(client.room);
                client.room = undefined;
            }
        }
    }

    function join(name, cb) {
        // sanity check
        if (typeof name !== 'string') return;
        // leave any existing rooms
        removeFeed();
        safeCb(cb)(null, describeRoom(name));
        client.join(name);
        client.room = name;
    }

    // we don't want to pass "leave" directly because the
    // event type string of "socket end" gets passed too.
    client.on('disconnect', function () {
        removeFeed();
    });
    client.on('leave', function () {
        removeFeed();
    });

    client.on('create', function (name, cb) {
        if (arguments.length == 2) {
            cb = (typeof cb == 'function') ? cb : function () {};
            name = name || uuid();
        } else {
            cb = name;
            name = uuid();
        }
        // check if exists
        if (io.sockets.clients(name).length) {
            safeCb(cb)('taken');
        } else {
            join(name);
            safeCb(cb)(null, name);
        }
    });

    // tell client about stun and turn servers and generate nonces
    //client.emit('stunservers', config.stunservers || []);

    // create shared secret nonces for TURN authentication
    // the process is described in draft-uberti-behave-turn-rest
    //var credentials = [];
    //config.turnservers.forEach(function (server) {
    //    var hmac = crypto.createHmac('sha1', server.secret);
    //    // default to 86400 seconds timeout unless specified
    //    var username = Math.floor(new Date().getTime() / 1000) + (server.expiry || 86400) + "";
    //    hmac.update(username);
    //    credentials.push({
    //        username: username,
    //        credential: hmac.digest('base64'),
    //        url: server.url
    //    });
    //});
    //client.emit('turnservers', credentials);
});
