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
		ws.on('get-cec-version', (data) => {
			ws.send(cec.getCECVersion(parseDataToJSON(data).logicalDeviceId));
		});
		ws.on('get-audio-status', (data) => {
			ws.send(cec.getAudioStatus(parseDataToJSON(data).logicalDeviceId));
		});
		ws.on('set-volume-relative', (data) => {
			const { logicalDeviceId, volume } = parseDataToJSON(data);
			ws.send(cec.setVolumeRelative(logicalDeviceId, volume));
		});
		ws.on('set-volume-absolute', (data) => {
			const { logicalDeviceId, volume } = parseDataToJSON(data);
			ws.send(cec.setVolumeAbsolute(logicalDeviceId, volume));
		});
		ws.on('set-mute', (data) => {
			const { logicalDeviceId, mute } = parseDataToJSON(data);
			ws.send(cec.setMute(logicalDeviceId, mute));
		});
		ws.on('set-active-source', (data) => {
			const { physicalAddress } = parseDataToJSON(data);
			ws.send(cec.setActiveSource(physicalAddress));
		});
		ws.on('set-image-view-on', (data) => {
			const { logicalDeviceId } = parseDataToJSON(data);
			ws.send(cec.setImageViewOn(logicalDeviceId));
		});
		ws.on('set-standby', (data) => {
			const { logicalDeviceId } = parseDataToJSON(data);
			ws.send(cec.setStandby(logicalDeviceId));
		});
		ws.on('user-control-pressed', (data) => {
			const { logicalDeviceId, control } = parseDataToJSON(data);
			ws.send(cec.sendUserControl(logicalDeviceId, control));
		});
	});
}

module.exports = WebSocketHandler;
