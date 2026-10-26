const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Static files serve করা
app.use(express.static(path.join(__dirname, 'public')));

// রুম অনুযায়ী ক্লায়েন্টদের ট্র্যাক করার জন্য
const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;
    let userId = Math.random().toString(36).substring(2, 9);

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        const { type, room } = data;

        if (type === 'join') {
            currentRoom = room;
            if (!rooms.has(room)) {
                rooms.set(room, new Set());
            }
            const roomClients = rooms.get(room);
            
            if (roomClients.size >= 2) {
                ws.send(JSON.stringify({ type: 'full' }));
                return;
            }

            roomClients.add(ws);
            ws.send(JSON.stringify({ type: 'joined', userId }));

            // যদি রুমে অন্য কেউ থাকে, তাকে নতুন ইউজারের কথা জানানো
            roomClients.forEach(client => {
                if (client !== ws) {
                    client.send(JSON.stringify({ type: 'peer-joined', userId }));
                }
            });
        } else {
            // সিগন্যালিং ডেটা (offer, answer, candidate) রিলে করা
            if (currentRoom && rooms.has(currentRoom)) {
                rooms.get(currentRoom).forEach(client => {
                    if (client !== ws) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            const roomClients = rooms.get(currentRoom);
            roomClients.delete(ws);
            if (roomClients.size === 0) {
                rooms.delete(currentRoom);
            } else {
                roomClients.forEach(client => {
                    client.send(JSON.stringify({ type: 'peer-left', userId }));
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
