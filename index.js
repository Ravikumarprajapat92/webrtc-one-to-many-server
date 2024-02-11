import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

const roomMap = {} // roomName(str):[<ws>(websocket connection)]
const getParams = params => {
    const map = {}
    params.split('&').forEach(item => {
        const string = item.split('=')
        map[string[0]] = string[1]
    })
    return map
}

const saveWSConnectionAndShareStreams = ws => {
    const {
        room
    } = ws
    if (!roomMap.hasOwnProperty(room)) {
        roomMap[room] = []
    }
    roomMap[room].push(ws)

    const listing = roomMap[room]
    const streams = listing.map(w => w.streamName)
    listing.forEach(l => {
        l.send(JSON.stringify({
            room,
            streams
        }))
    })
}

const clearWSData = ws => {
    const {
        room,
        streamName
    } = ws
    const listing = roomMap[room];
    const streams = listing.map(w => w.streamName)
    const index = streams.indexOf(streamName)
    if (index > -1) {
        roomMap[room].splice(index, 1)
        streams.splice(index, 1)
        roomMap[room].forEach(l => {
            l.send(JSON.stringify({
                room,
                streams
            }))
        })
    }
}

wss.on('connection', (ws, req) => {
    console.log('websocket connection open')
    const params = getParams(req.url.split('?')[1])
    console.log(params)

    if (!params.room && !params.streamName) {
        ws.send('The following query parameters are required: room, streamName')
        ws.close()
    }

    ws.room = params['room']
    ws.streamName = params['streamName']
    saveWSConnectionAndShareStreams(ws, params)

    ws.on('message', message => {
        console.log('webSocket message received', message);
        const listing = roomMap[ws.room].filter(w => w.streamName !== ws.streamName);
        // let json = message
        // if (typeof message === 'string') {
        //     // json = JSON.parse(message)
        // }
        listing.forEach(l => {
            l.send(message)
        })
        console.log('Received: ' + message)
    })

    ws.on('close', () => {
        console.log('websocket connection close')
        clearWSData(ws)
    })
})


// wss.on('connection', function connection(ws, req) {
//     const params = getParams(req.url.split('?')[1])
//     ws.on('error', console.error);

//     ws.on('message', function message(data) {
//         console.log('received: %s', data);
//         ws.send(data);
//     });

//     //   ws.send();
// });