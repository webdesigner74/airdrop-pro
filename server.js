const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// মেমোরিতে ফাইল সাময়িকভাবে রাখার জন্য Multer সেটআপ (RAM Storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 } // সর্বোচ্চ ৫০০ মেগাবাইট ফাইল
});

// স্ট্যাটিক ফাইল সার্ভিস
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// রুম ও টেম্পোরারি ফাইল স্টোর
const rooms = new Map();
const fileStore = new Map();

// WebSocket রিয়েল-টাইম রুম কানেকশন লজিক
wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const { type, room } = data;

            if (type === 'join') {
                currentRoom = room;
                if (!rooms.has(room)) {
                    rooms.set(room, new Set());
                }
                const roomClients = rooms.get(room);
                roomClients.add(ws);

                ws.send(JSON.stringify({ type: 'joined' }));

                // রুমে অন্য কেউ থাকলে জানান দেওয়া
                if (roomClients.size > 1) {
                    roomClients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'peer-joined' }));
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
            }
        }
    });
});

// HTTP API: ফাইল আপলোড এন্ডপয়েন্ট
app.post('/api/upload', upload.single('file'), (req, res) => {
    const room = req.body.room;
    if (!req.file || !room) {
        return res.status(400).json({ error: 'Missing file or room code' });
    }

    const fileId = Math.random().toString(36).substring(2, 10) + '_' + Date.now();
    fileStore.set(fileId, {
        buffer: req.file.buffer,
        name: req.file.originalname,
        mime: req.file.mimetype
    });

    // ৫ মিনিট পর সার্ভার র‍্যাম থেকে ফাইল মুছে ফেলার টাইমার
    setTimeout(() => {
        fileStore.delete(fileId);
    }, 5 * 60 * 1000);

    // রুমে থাকা অন্য ডিভাইসগুলোকে ডাউনলোড লিংক সিগন্যাল পাঠানো
    if (rooms.has(room)) {
        const payload = JSON.stringify({
            type: 'file-available',
            fileId: fileId,
            name: req.file.originalname,
            size: req.file.size
        });

        rooms.get(room).forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }

    res.json({ success: true, fileId: fileId });
});

// HTTP API: ফাইল ডাউনলোড এন্ডপয়েন্ট
app.get('/api/download/:fileId', (req, res) => {
    const fileData = fileStore.get(req.params.fileId);
    if (!fileData) {
        return res.status(404).send('File expired or not found.');
    }

    res.setHeader('Content-Type', fileData.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.name)}"`);
    res.send(fileData.buffer);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
