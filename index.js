import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

const roomMap: Record<string, WebSocket[]> = {};
const heartbeatMap = new Map<WebSocket, number>();

const HEARTBEAT_INTERVAL = 30_000;
const MAX_INACTIVITY = 60_000;

const getParams = (url: string) => {
    const queryParams = new URLSearchParams(url);
    return Object.fromEntries(queryParams.entries());
};

const saveWSConnectionAndShareStreams = (ws: WebSocket & { room?: string, streamName?: string }) => {
    const { room } = ws;
    if (!room) return;

    if (!roomMap[room]) {
        roomMap[room] = [];
    }

    roomMap[room].push(ws);
    const streams = roomMap[room].map(w => (w as any).streamName);

    roomMap[room].forEach(client => {
        if (client !== ws && client.readyState === client.OPEN) {
            client.send(JSON.stringify({ room, streams }));
        }
    });
};

const clearWSData = (ws: WebSocket & { room?: string }) => {
    const { room } = ws;
    heartbeatMap.delete(ws);

    if (!room || !roomMap[room]) return;

    roomMap[room] = roomMap[room].filter(w => w !== ws);
    if (roomMap[room].length === 0) {
        delete roomMap[room];
    } else {
        const streams = roomMap[room].map(w => (w as any).streamName);
        roomMap[room].forEach(client => {
            if (client.readyState === client.OPEN) {
                client.send(JSON.stringify({ room, streams }));
            }
        });
    }
};

wss.on('connection', (ws: WebSocket & { room?: string, streamName?: string }, req) => {
    console.log('[WS] Connection opened');

    const params = getParams(req.url?.split('?')[1] || '');
    const { room, streamName } = params;

    if (!room || !streamName) {
        ws.send(JSON.stringify({ error: 'Missing required query parameters: room, streamName' }));
        ws.close();
        return;
    }

    ws.room = room;
    ws.streamName = streamName;

    heartbeatMap.set(ws, Date.now());
    saveWSConnectionAndShareStreams(ws);

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());

            if (parsed.type === 'ping') {
                heartbeatMap.set(ws, Date.now());
                ws.send(JSON.stringify({ type: 'pong' }));
                return;
            }

            const recipients = roomMap[ws.room!]?.filter(client => client !== ws);
            recipients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    client.send(message.toString());
                }
            });
        } catch (err) {
            console.error('[WS] Invalid JSON:', err);
        }
    });

    ws.on('close', () => {
        console.log('[WS] Connection closed');
        clearWSData(ws);
    });

    ws.on('error', (err) => {
        console.error('[WS] Error:', err);
        clearWSData(ws);
    });
});

setInterval(() => {
    const now = Date.now();
    heartbeatMap.forEach((lastSeen, ws) => {
        if (now - lastSeen > MAX_INACTIVITY) {
            console.log('[WS] Kicking inactive client');
            ws.terminate();
            clearWSData(ws);
        }
    });
}, HEARTBEAT_INTERVAL);

console.log('[WS] Server running on ws://localhost:8080');
