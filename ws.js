'use strict';

const expressWs = require('express-ws');

function parseDataToJSON(data) {
    var parsedData;

	try {
		parsedData = JSON.parse(data);
	} catch (error) {
		parsedData = {
			error: true,
			message: 'Failed to parse data: ' + error
		};
	}

	return parsedData;
}

/**
 * Initializes the WebSocket handler.
 * @param {import('./cec')} cec The CEC module.
 * @param {import('express').Application} app The Express application instance.
 * @param {string} [path='/socket'] The path to the WebSocket endpoint.
 */
function WebSocketHandler(cec, app, path = '/socket') {
	expressWs(app);

	app.ws(path, (ws) => {
		ws.on('message', (data) => {
			console.info('Received websocket message: ', data);

            var response = {};

            const dataObj = parseDataToJSON(data);

            if (dataObj.error) {
                ws.send(JSON.stringify(dataObj));
                return;
            }

            const { command, params } = dataObj;
            console.info('Parsed command: ', command);
			console.info('Parsed params: ', params);

            try {
                switch (command) {
                    case 'get-cec-version':
                        response = cec.getCECVersion(params.logicalDeviceId);
                        break;
                    case 'get-audio-status':
                        response = cec.getAudioStatus(params.logicalDeviceId);
                        break;
                    case 'set-volume-relative':
                        response = cec.setVolumeRelative(params.logicalDeviceId, params.volume);
                        break;
                    case 'set-volume-absolute':
                        response = cec.setVolumeAbsolute(params.logicalDeviceId, params.volume);
                        break;
                    case 'set-mute':
                        response = cec.setMute(params.logicalDeviceId, params.mute);
                        break;
                    case 'set-active-source':
                        response = cec.setActiveSource(params.address);
                        break;
                    case 'set-image-view-on':
                        response = cec.setImageViewOn(params.logicalDeviceId);
                        break;
                    case 'set-standby':
                        response = cec.setStandby(params.logicalDeviceId);
                        break;
                    case 'user-control-pressed':
                        response = cec.sendUserControl(params.logicalDeviceId, params.control);
                        break;
                    default:
                        response = {
                            error: true,
                            message: 'Invalid command.'
                        };
                }
            } catch (error) {
                response = {
                    error: true,
                    message: 'Failed to execute command: ' + error
                };
            }

			ws.send(JSON.stringify(response));
		});
	});
}

module.exports = WebSocketHandler;