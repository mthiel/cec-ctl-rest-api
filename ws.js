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
			const { command, params } = parseDataToJSON(data);

			switch (command) {
				case 'get-cec-version':
					ws.send(cec.getCECVersion(params.logicalDeviceId));
					break;
				case 'get-audio-status':
					ws.send(cec.getAudioStatus(params.logicalDeviceId));
					break;
				case 'set-volume-relative':
					ws.send(cec.setVolumeRelative(params.logicalDeviceId, params.volume));
					break;
				case 'set-volume-absolute':
					ws.send(cec.setVolumeAbsolute(params.logicalDeviceId, params.volume));
					break;
				case 'set-mute':
					ws.send(cec.setMute(params.logicalDeviceId, params.mute));
					break;
				case 'set-active-source':
					ws.send(cec.setActiveSource(params.address));
					break;
				case 'set-image-view-on':
					ws.send(cec.setImageViewOn(params.logicalDeviceId));
					break;
				case 'set-standby':
					ws.send(cec.setStandby(params.logicalDeviceId));
					break;
				case 'user-control-pressed':
					ws.send(cec.sendUserControl(params.logicalDeviceId, params.control));
					break;
			}
		});
	});
}

module.exports = WebSocketHandler;
