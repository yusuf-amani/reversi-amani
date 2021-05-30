/********************************************************************************************************/

/* set up the static file server */
let static = require('node-static');

/* set up the http server library */
let http = require('http');

/* assume that we are running on Heroku */
let port = process.env.PORT;
let directory = __dirname + '/public';

/* if we aren't on Heroku, then we need to adjust our port and directory */
if ((typeof port == 'undefined') || (port === null)) {
    port = 8080;
    directory = './public';
}

/* Set up our static file web server to deliver files from the file system (my harddrive) */
let file = new static.Server(directory);

let app = http.createServer(
    function (request, response) {
        request.addListener('end',
            function () {
                file.serve(request, response);
            }
        ).resume();
    }
).listen(port);

console.log('the server is running');



/**********************************************************************************************************************************/
/* Set up the web socket server */

/* Set up a registry of player information and thier socket IDs */
let players = [];

const { Server } = require("socket.io");
const io = new Server(app);

io.on('connection', (socket) => {

    /* Output a log message on the server and sent it to the clients */
    function serverLog(...messages) {
        io.emit('log', ['**** Message from the server:\n']);
        messages.forEach((item) => {
            io.emit('log', ['****\t' + item]);
            console.log(item);
        });
    }

    serverLog('a page connected to the server: ' + socket.id);




    /* join_room command handler */
    /* expected payload: 
        {
            'room': the room to be joined
            'username': the name of the user joining the room
        }
    */
    /* join-room-response:
        {
            'result': 'success',
            'room': room that was joined, 
            'username': the user that joined the room, 
            'count': the number of users in the chat room 
            'socket_id': the socket of the user that just joined the room
        }
    or
        {
            'result': 'fail',
            'message': the reasons for failure, 
        }
    */

    socket.on('join_room', (payload) => {
        serverLog('Server recieved a command', '\' join room \'', JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        /* check that the room user want to join is good */
        if ((typeof room == 'undefined') || (room === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to join';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }
        /* check that the user's username is good */
        if ((typeof username == 'undefined') || (username === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid username to join the chat room';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }

        /* Hadle the command */
        socket.join(room);

        /* Make sure the client was put in the room */
        io.in(room).fetchSockets().then((sockets) => {
            /* Socket didnt join the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.includes(socket)) {
                response = {};
                response.result = 'fail';
                response.message = 'Server internal error joinng chat room';
                socket.emit('join_room_response', response);
                serverLog('join_room command failed', JSON.stringify(response));

            }
            /* Socket did join room */
            else {
                players[socket.id] = {
                    username: username,
                    room: room
                }
                /* Announce to everyone that is in the room, who else is in the room */
                for (const member of sockets){
                    response = {
                        result: 'success',
                        socket_id: member.id,
                        room: players[member.id].room,
                        username: players[member.id].username,
                        count: sockets.length
                    }
                    /* Tell everyone that a new user has joined the chat room */
                    io.of('/').to(room).emit('join_room_response', response);
                    serverLog('join_room succeeded ', JSON.stringify(response)); 
                }
 
                
            }
        });
    });


    socket.on('invite', (payload) => {
        serverLog('Server recieved a command', '\' invite \'', JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('invite_response', response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;

        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "") ) {
            response = {
                result : 'fail',
                message : 'client did not request a valid user to invite to play'
            }
            socket.emit('invite_response', response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
  
        if ((typeof room == 'undefined') || (room === null) || (room === "") ) {
            response = {
                result : 'fail',
                message : 'the user that was invited is not in a room'
            }
            socket.emit('invite_response', response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        
        if ((typeof username == 'undefined') || (username === null) || (username === "") ) {
            response = {
                result : 'fail',
                message : 'the user that was invited does not have a name registered'
            }
            socket.emit('invite_response', response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }

        /* Make sure the invited player is present */
        io.in(room).allSockets().then((sockets) => {
            /* Invitee isnt in the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result : 'fail',
                    message : 'the user that was invited is no longer in the room'
                }
                socket.emit('invite_response', response);
                serverLog('invite command failed', JSON.stringify(response));
                return;
            }
            /* Invitee is in the room */
            else {
                response = {
                    result : 'success',
                    socket_id : requested_user
                }
                socket.emit("invite_response", response);
                
                response = {
                    result : 'success',
                    socket_id : socket.id
                }
                socket.to(requested_user).emit("invited", response);
                serverLog('invite command succeeded', JSON.stringify(response));
            }
        });
    });

/* ************************************* */

    socket.on('uninvite', (payload) => {
        serverLog('Server recieved a command', '\' uninvite \'', JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('uninvited', response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;

        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "") ) {
            response = {
                result : 'fail',
                message : 'client did not request a valid user to uninvite'
            }
            socket.emit('uninvited', response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
  
        if ((typeof room == 'undefined') || (room === null) || (room === "") ) {
            response = {
                result : 'fail',
                message : 'the user that was uninvited is not in a room'
            }
            socket.emit('uninvited', response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        
        if ((typeof username == 'undefined') || (username === null) || (username === "") ) {
            response = {
                result : 'fail',
                message : 'the user that was uninvited does not have a name registered'
            }
            socket.emit('uninvited', response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }

        /* Make sure the uninvited player is present */
        io.in(room).allSockets().then((sockets) => {
            /* Uninvitee isnt in the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result : 'fail',
                    message : 'the user that was uninvited is no longer in the room'
                }
                socket.emit('uninvited', response);
                serverLog('uninvite command failed', JSON.stringify(response));
                return;
            }
            /* Uninvitee is in the room */
            else {
                response = {
                    result : 'success',
                    socket_id : requested_user
                }
                socket.emit("uninvited", response);
                
                response = {
                    result : 'success',
                    socket_id : socket.id
                }
                socket.to(requested_user).emit("uninvited", response);
                serverLog('uninvite command succeeded', JSON.stringify(response));
            }
        });
    });



    socket.on('game_start', (payload) => {
        serverLog('Server recieved a command', '\' game_start \'', JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('game_start_response', response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;

        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "") ) {
            response = {
                result : 'fail',
                message : 'client did not request a valid user to engage in play'
            }
            socket.emit('game_start_response', response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
  
        if ((typeof room == 'undefined') || (room === null) || (room === "") ) {
            response = {
                result : 'fail',
                message : 'the user that was engaged to play is not in a room'
            }
            socket.emit('game_start_response', response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        
        if ((typeof username == 'undefined') || (username === null) || (username === "") ) {
            response = {
                result : 'fail',
                message : 'the user that was engaged to play does not have a name registered'
            }
            socket.emit('game_start_response', response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }

        /* Make sure that the player to engage is present */
        io.in(room).allSockets().then((sockets) => {
            /* Engaged Player isnt in the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result : 'fail',
                    message : 'the user that was engaged to play is no longer in the room'
                }
                socket.emit('game_start_response', response);
                serverLog('game_start command failed', JSON.stringify(response));
                return;
            }
            /* Engaged player is in the room */
            else {
                let game_id = Math.floor(1 + Math.random() * 0x100000).toString(16);
                response = {
                    result : 'success',
                    game_id : game_id, 
                    socket_id : requested_user
                }
                socket.emit("game_start_response", response);
                socket.to(requested_user).emit("game_start_response", response);
                serverLog('game_start command succeeded', JSON.stringify(response));
            }
        });
    });





    socket.on('disconnect', () => {
        serverLog('a page disconnected from the server: ' + socket.id);
        if((typeof players[socket.id] != 'undefined') && (players[socket.id] != null) ){
            let payload = {
                username: players[socket.id].username,
                room: players[socket.id].room,
                count: Object.keys(players).length - 1,
                socket_id: socket.id
            };
            let room = players[socket.id].room;
            delete players[socket.id];
            /* Tell everyone who left the room */
            io.of("/").to(room).emit('player_disconnected', payload);
            serverLog('player_disconnected succeeded ',JSON.stringify(payload));
        }
    });


    /* ************************************************************************************************************************************** */

    /* send_chat_message command handler */
    /* expected payload: 
        {
            'room': the room to which the message should be sent,
            'username': the name of the sender,
            'message': the message to broadcast
        }
    */
    /* send_chat_message response:
        {
            'result': 'success',
            'username': the user that send the message, 
            'message': the message that was sent
        }
    or
        {
            'result': 'fail',
            'message': the reason for failure, 
        }
    */

    socket.on('send_chat_message', (payload) => {
        serverLog('Server recieved a command', '\' send_chat_message \'', JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        let message = payload.message;
        if ((typeof room == 'undefined') || (room === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to message';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid username as a message source';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        if ((typeof message == 'undefined') || (message === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid message';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }

        /* Hadle the command */
        let response = {};
        response.result = 'success';
        response.username = username;
        response.room = room;
        response.message = message;
        /* Tell everyone in the room what the message is */
        io.of('/').to(room).emit('send_chat_message_response', response);
        serverLog('send_chat_message command succeeded', JSON.stringify(response));

    });
});
