import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

const roomMap = {}; // roomName(str) -> [WebSocket connections]

const getParams = (url) => {
    const queryParams = new URLSearchParams(url);
    return Object.fromEntries(queryParams.entries());
};

const saveWSConnectionAndShareStreams = (ws) => {
    const { room, streamName } = ws;
    
    if (!roomMap[room]) {
        roomMap[room] = [];
    }
    roomMap[room].push(ws);

    // Send updated stream list to all clients except the sender
    const streams = roomMap[room].map(w => w.streamName);
    roomMap[room].forEach(client => {
        if (client !== ws && client.readyState === client.OPEN) {
            client.send(JSON.stringify({ room, streams }));
        }
    });
};

const clearWSData = (ws) => {
    const { room, streamName } = ws;
    
    if (!roomMap[room]) return;

    // Remove WebSocket from room list
    roomMap[room] = roomMap[room].filter(w => w !== ws);
    
    if (roomMap[room].length === 0) {
        delete roomMap[room]; // Clean up empty rooms
    } else {
        // Send updated stream list to remaining clients
        const streams = roomMap[room].map(w => w.streamName);
        roomMap[room].forEach(client => {
            if (client.readyState === client.OPEN) {
                client.send(JSON.stringify({ room, streams }));
            }
        });
    }
};

wss.on('connection', (ws, req) => {
    console.log('WebSocket connection opened');

    const params = getParams(req.url.split('?')[1]);
    console.log(params);

    if (!params.room || !params.streamName) {
        ws.send(JSON.stringify({ error: 'Missing required query parameters: room, streamName' }));
        ws.close();
        return;
    }

    ws.room = params.room;
    ws.streamName = params.streamName;
    saveWSConnectionAndShareStreams(ws);

    ws.on('message', (message) => {
        console.log(`WebSocket message received: ${message}`);

        const recipients = roomMap[ws.room]?.filter(client => client !== ws);

        recipients.forEach(client => {
            if (client.readyState === client.OPEN) {
                client.send(message);
            }
        });
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        clearWSData(ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});
