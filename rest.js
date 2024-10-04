'use strict';

/**
 * Renders the result of a REST request.
 * @param {import('express').Request} req The request object.
 * @param {import('express').Response} res The response object.
 * @param {import('express').NextFunction} next The next middleware function.
 */
function renderResult(req, res, next) {
	if (!res.locals.result || res.locals.result.error === true) {
		res.status(500);
	}

	res.json(res.locals.result);

	next();
}

/**
 * Initializes the REST handler.
 * @param {import('./cec')} cec The CEC module.
 * @param {import('express').Application} app The Express application instance.
 */
function RestHandler(cec, app) {
	// const bodyParser = require('body-parser');
	// app.use(bodyParser.json());

	app.get(
		'/get-cec-version/:logicalDeviceId',
		(req, res) => {
			res.locals.result = cec.getCECVersion(req.params.logicalDeviceId);
		},
		renderResult
	);

	app.get(
		'/give-audio-status/:logicalDeviceId',
		(req, res) => {
			res.locals.result = cec.getAudioStatus(req.params.logicalDeviceId);
		},
		renderResult
	);

	app.get(
		'/set-volume-relative/:logicalDeviceId/:volume',
		(req, res) => {
			const { logicalDeviceId, volume } = req.params;

			// TODO: Implement multiple volume steps
			if (volume > 0) {
				res.locals.result = cec.increaseVolume(logicalDeviceId);
			} else {
				res.locals.result = cec.decreaseVolume(logicalDeviceId);
			}
		},
		renderResult
	);

	app.get(
		'/set-volume-absolute/:logicalDeviceId/:volume',
		(req, res) => {
			const { logicalDeviceId, volume } = req.params;

			res.locals.result = cec.setVolumeAbsolute(logicalDeviceId, volume);
		},
		renderResult
	);

	app.get(
		'/set-mute/:logicalDeviceId/:mute',
		(req, res) => {
			const { logicalDeviceId, mute } = req.params;

			res.locals.result = cec.setMute(logicalDeviceId, mute);
		},
		renderResult
	);

	app.get(
		'/set-active-source/:address',
		(req, res) => {
			res.locals.result = cec.setActiveSource(req.params.address);
		},
		renderResult
	);

	app.get(
		'/image-view-on/:logicalDeviceId',
		(req, res) => {
			res.locals.result = cec.setImageViewOn(req.params.logicalDeviceId);
		},
		renderResult
	);

	app.get(
		'/standby/:logicalDeviceId',
		(req, res) => {
			res.locals.result = cec.setStandby(req.params.logicalDeviceId);
		},
		renderResult
	);

	app.get(
		'/user-control-pressed/:logicalDeviceId/:control',
		(req, res) => {
			const { logicalDeviceId, control } = req.params;

			res.locals.result = cec.sendUserControl(logicalDeviceId, control);
		},
		renderResult
	);
}

module.exports = RestHandler;
