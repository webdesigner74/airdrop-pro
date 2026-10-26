const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// স্ট্যাটিক ফাইলগুলো সরাসরি মেইন ফোল্ডার বা public ফোল্ডার থেকে লোড করার ব্যবস্থা
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// রুম এবং ক্লায়েন্ট ট্র্যাক করার WebSocket লজিক
const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;
    let userid = Math.random().toString(36).substring(2, 9);

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
            ws.send(JSON.stringify({ type: 'joined', userid }));

            roomClients.forEach(client => {
                if (client !== ws) {
                    client.send(JSON.stringify({ type: 'peer-joined', userid }));
                }
            });
        } else {
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
                    client.send(JSON.stringify({ type: 'peer-left', userid }));
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
