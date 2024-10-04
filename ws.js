'use strict';

const expressWs = require('express-ws');

/**
 * Initializes the WebSocket handler.
 * @param {import('./cec')} cec The CEC module.
 * @param {import('express').Application} app The Express application instance.
 * @param {string} [path='/socket'] The path to the WebSocket endpoint.
 */
function WebSocketHandler(cec, app, path = '/socket') {
    expressWs(app);

    app.ws(path, (ws) => {
        ws.on('get-cec-version', (data) => cec.getCECVersion(data));
        ws.on('get-audio-status', (data) => cec.getAudioStatus(data));
        ws.on('increase-volume', (data) => cec.increaseVolume(data));
        ws.on('decrease-volume', (data) => cec.decreaseVolume(data));
    });
}

module.exports = WebSocketHandler;
