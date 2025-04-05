import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

const roomMap = {}; // roomName -> array of WebSocket connections
const heartbeatMap = new Map();

const HEARTBEAT_INTERVAL = 30000;
const MAX_INACTIVITY = 60000;

const getParams = (url) => {
  const queryParams = new URLSearchParams(url);
  return Object.fromEntries(queryParams.entries());
};

const saveWSConnectionAndShareStreams = (ws) => {
  const { room } = ws;
  if (!room) return;

  if (!roomMap[room]) {
    roomMap[room] = [];
  }

  roomMap[room].push(ws);
  const streams = roomMap[room].map(w => w.streamName);

  roomMap[room].forEach(client => {
    if (client !== ws && client.readyState === client.OPEN) {
      client.send(JSON.stringify({ room, streams }));
    }
  });
};

const clearWSData = (ws) => {
  const { room } = ws;
  heartbeatMap.delete(ws);

  if (!room || !roomMap[room]) return;

  roomMap[room] = roomMap[room].filter(w => w !== ws);
  if (roomMap[room].length === 0) {
    delete roomMap[room];
  } else {
    const streams = roomMap[room].map(w => w.streamName);
    roomMap[room].forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ room, streams }));
      }
    });
  }
};

wss.on('connection', (ws, req) => {
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

      const recipients = roomMap[ws.room]?.filter(client => client !== ws);
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
