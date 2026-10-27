const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 100 * 1024 * 1024 }); // বড় ফাইলের জন্য ১০০ মেগাবাইট পর্যন্ত এলাউড

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', (message) => {
        // যদি ডাটা বাইনারি বা ফাইল চাঙ্ক হয়, তবে রুমের অন্য ক্লায়েন্টে পাঠিয়ে দেব
        if (message instanceof Buffer || message instanceof ArrayBuffer) {
            if (currentRoom && rooms.has(currentRoom)) {
                rooms.get(currentRoom).forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            }
            return;
        }

        try {
            const data = JSON.parse(message);
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
                ws.send(JSON.stringify({ type: 'joined' }));

                roomClients.forEach(client => {
                    if (client !== ws) {
                        client.send(JSON.stringify({ type: 'peer-joined' }));
                    }
                });
            } else {
                // অন্য যেকোনো মেসেজ বা ফাইল ইনফো রিলে করা
                if (currentRoom && rooms.has(currentRoom)) {
                    rooms.get(currentRoom).forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(data));
                        }
                    });
                }
            }
        } catch (e) {
            console.error(e);
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
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'peer-left' }));
                    }
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
