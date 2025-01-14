// const express = require('express');
// const bodyParser = require('body-parser');
const { Server } = require('socket.io');

const io_port = process.env.PORT || 6061;
// const app_port = process.env.PORT || 6060;

// const app = express({
//     cors: {
//         origin: '*',
//     },
// });

const io = new Server({
    cors: {
        origin: '*',
    },
});

// app.use(bodyParser.json());

const socketBindings = new Map();
const negoCount = new Map();
const chatUsers = new Map(); 
const vidUsers = new Map();
const interestToChatUsers = new Map();
const interestToVidUsers = new Map();

function getChatUsers(interests, newUserId) {
    for (const interest of interests) {
        if (interestToChatUsers.has(interest)) {
            const users = interestToChatUsers.get(interest);

            for (const userId of users) {
                const userInterests = chatUsers.get(userId);
                for (const userInterest of userInterests) {
                    interestToChatUsers.get(userInterest)?.delete(userId);
                    if (interestToChatUsers.get(userInterest)?.size === 0) {
                        interestToChatUsers.delete(userInterest);
                    }
                }
                chatUsers.delete(userId);
                return userId;
            }
        }
    }

    const userInterestsSet = new Set(interests);
    chatUsers.set(newUserId, userInterestsSet);
    for (const interest of interests) {
        if (!interestToChatUsers.has(interest)) {
            interestToChatUsers.set(interest, new Set());
        }
        interestToChatUsers.get(interest).add(newUserId);
    }
    return null;
}

function getVidUsers(interests, newUserId) {
    for (const interest of interests) {
        if (interestToVidUsers.has(interest)) {
            const users = interestToVidUsers.get(interest);

            for (const userId of users) {
                const userInterests = vidUsers.get(userId);
                for (const userInterest of userInterests) {
                    interestToVidUsers.get(userInterest)?.delete(userId);
                    if (interestToVidUsers.get(userInterest)?.size === 0) {
                        interestToVidUsers.delete(userInterest);
                    }
                }
                vidUsers.delete(userId);
                return userId;
            }
        }
    }

    const userInterestsSet = new Set(interests);
    vidUsers.set(newUserId, userInterestsSet);
    for (const interest of interests) {
        if (!interestToVidUsers.has(interest)) {
            interestToVidUsers.set(interest, new Set());
        }
        interestToVidUsers.get(interest).add(newUserId);
    }
    return null;
}

function handleDisconnection(userId) {
    let usersMap;
    let interestsMap;
    if (vidUsers.has(userId)) {
        usersMap = vidUsers;
        interestsMap = interestToVidUsers;
    } else if (chatUsers.has(userId)) {
        usersMap = chatUsers;
        interestsMap = interestToChatUsers;
    } else {
        return;
    }

    const userInterests = usersMap.get(userId);

    if (userInterests) {
        for (const interest of userInterests) {
            interestsMap.get(interest)?.delete(userId);
            if (interestsMap.get(interest)?.size === 0) {
                interestsMap.delete(interest);
            }
        }
        usersMap.delete(userId);
    }
    
    const pairedUser = socketBindings.get(userId);
    if (pairedUser) {
        socketBindings.delete(pairedUser);
    }
    socketBindings.delete(userId);

    negoCount.delete(userId);
}


io.on('connection', (socket) => {
    socket.on('join-vid-room', (data) => {
        var { interests } = data;
        // console.log(interests);
        interests = interests.split(' ');
        const user = getVidUsers(interests, socket.id);
        if(user){
            socketBindings.set(socket.id, user);
            socketBindings.set(user, socket.id);
            negoCount.set(socket.id, 0);
            negoCount.set(user, 0);
            socket.emit('vid-room-joined', { user: user, sender: "me" });
            io.to(user).emit('vid-room-joined', { user: socket.id, sender: "stranger" });
        }
    });

    socket.on('call-user', (data) => {
        var { offer, user } = data;

        if(!user){
            user = socketBindings.get(socket.id);
            console.log("user", user);
        }
        
        // console.log(offer.type, user, socket.id);
        io.to(user).emit('incoming-call', { offer, remoteUser: socket.id });
    });

    socket.on('accepted-call', (data) => {
        const ans = data.ans;
        const id = data.id;
        // console.log("ans", id, ans.type);

        io.to(id).emit('call-accepted', { ans: ans });
    });

    socket.on("negotiation-needed", (data) => {
        var { offer, user } = data;

        if(!user && negoCount.get(socket.id) < 1){
            user = socketBindings.get(socket.id);
        }
        
        // console.log(offer.type, user, socket.id);
        negoCount.set(socket.id, negoCount.get(socket.id) + 1);
        io.to(user).emit('negotiation-needed', { offer, remoteUser: socket.id });
    });

    socket.on("negotiation-answered", (data) => {
        var { ans, user } = data;

        if(!user && negoCount.get(socket.id) < 1){
            user = socketBindings.get(socket.id);
        }
        
        // console.log(ans.type, user, socket.id);
        negoCount.set(socket.id, negoCount.get(socket.id) + 1);
        io.to(user).emit('negotiation-answered', { ans, remoteUser: socket.id });
    });
    
    socket.on('leave-vid-room', (data) => {
        const user = socketBindings.get(socket.id);
        if (user) {
            io.to(user).emit('vid-room-left', { user: socket.id });
        }
        handleDisconnection(socket.id);
    });

    socket.on('join-chat-room', (data) => {
        var { interests } = data;
        interests = interests.split(' ');
        // console.log(interests);
        const user = getChatUsers(interests, socket.id);
        if(user){
            socketBindings.set(socket.id, user);
            socketBindings.set(user, socket.id);
            // console.log("chat-room-joined", user, socket.id);
            socket.emit('chat-room-joined', { user: user });
            io.to(user).emit('chat-room-joined', { user: socket.id });
        }
    });

    socket.on('send', (data) => {
        const { text, to } = data;
        io.to(to).emit('receive', { text: text });
    });

    socket.on('leave-chat-room', (data) => {
        const user = socketBindings.get(socket.id);
        // console.log("left");
        if (user) {
            io.to(user).emit('chat-room-left', { user: socket.id });
        }
        handleDisconnection(socket.id);
    });

    socket.on('disconnected', () => {
        const user = socketBindings.get(socket.id);
        if (user && io.sockets.sockets.get(user)) {
            io.to(user).emit('vid-room-left', { user: socket.id });
        }
        handleDisconnection(socket.id);
    });
});

// app.listen(6060, () => {
//     console.log("server listening on port 8080.");
// })

io.listen(io_port);