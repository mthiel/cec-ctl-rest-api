"use strict";

/**
 * @typedef {Object} RestResponse
 * @property {boolean} error - Indicates if an error occurred during execution.
 * @property {string} message - Contains details about the response.
 */

/**
 * Rest response object factory
 * @returns {RestResponse} The response object.
 */
function RestResponse() {
	return {
		error: false,
		message: "",
	};
}

function RestHandler(cec, app) {
	// const bodyParser = require('body-parser');
	// app.use(bodyParser.json());

	app.get("/get-cec-version/:logicalDeviceId", (req, res, next) => {
		const { logicalDeviceId } = req.params;
		const response = RestResponse();

		if (!logicalDeviceId) {
			response.error = true;
			response.message = "Logical device ID is required";
			return res.status(400).json(response);
		}

		/*
            Sample output:
    
            Transmit from Playback Device 2 to Audio System (8 to 5):
            GET_CEC_VERSION (0x9f)
                Received from Audio System (5):
                CEC_VERSION (0x9e):
                    cec-version: version-1-4 (0x05)
                    Sequence: 979 Tx Timestamp: 76018.612s Rx Timestamp: 76018.705s
                    Approximate response time: 21 ms
        */
		const output = cec.call(`--get-cec-version -t ${logicalDeviceId}`);

		if (output !== null) {
			const version = output.match(/cec-version: (\S+)/); // cec-version: version-1-4 (0x05)
			response.version = version ? version[1] : null;
		} else {
			response.error = true;
			response.message = "Failed to get CEC version.";
			return res.status(500).json(response);
		}

		res.json(response);

		next();
	});

	app.get("/give-audio-status/:logicalDeviceId", (req, res, next) => {
		const { logicalDeviceId } = req.params;
		var response = RestResponse();

		if (!logicalDeviceId) {
			response.error = true;
			response.message = "Logical device ID is required.";
			return res.status(400).json(response);
		}

		const audioStatus = cec.getAudioStatus(logicalDeviceId);
		if (audioStatus) {
			response = { ...response, audioStatus };
		} else {
			response.error = true;
			response.message = "Failed to get audio status.";
			return res.status(500).json(response);
		}

		res.json(response);

		next();
	});

	app.get(
		"/set-volume-relative/:logicalDeviceId/:volume",
		(req, res, next) => {
			const { logicalDeviceId, volume } = req.params;
			const response = RestResponse();

			if (!logicalDeviceId || !volume) {
				response.error = true;
				response.message =
					"Logical device ID and volume offset are required.";
				return res.status(400).json(response);
			}

			// TODO: Implement multiple volume steps
			if (volume > 0) {
				cec.increaseVolume(logicalDeviceId);
			} else {
				cec.decreaseVolume(logicalDeviceId);
			}

			res.status(200).json(response);

			next();
		}
	);

	app.get(
		"/set-volume-absolute/:logicalDeviceId/:volume",
		async (req, res, next) => {
			const { logicalDeviceId, volume } = req.params;
			const { debug } = req.query;

			const response = RestResponse();

			if (!logicalDeviceId || !volume) {
				response.error = true;
				response.message = "Logical device ID and volume are required.";
				return res.status(400).json(response);
			}

			if (debug) {
				response.debug = response.debug || {};
				response.debug.requestedVolume = volume;
			}

			// Default values are what work for my setup
			const VOLUME_STEP = 0.5;
			const COMMAND_DELAY = 50;
			const volumeStep = req.query.volumeStep
				? parseFloat(req.query.volumeStep)
				: VOLUME_STEP;
			const commandDelay = req.query.commandDelay
				? parseInt(req.query.commandDelay)
				: COMMAND_DELAY;

			try {
				const audioStatus = cec.getAudioStatus(logicalDeviceId);
				if (!audioStatus) {
					throw "Failed to get current audio status. Aborting.";
				}

				const currentVolume = audioStatus.volume;
				if (currentVolume === null) {
					throw "The current volume level is not available to compare against. Aborting.";
				}

				if (currentVolume === volume) {
					response.message =
						"Volume is already set to the desired value.";
					return res.status(200).json(response);
				}

				const adjustmentSteps =
					Math.abs(currentVolume - volume) / volumeStep;
				for (let i = 0; i < adjustmentSteps; i++) {
					function adjustVolume() {
						if (currentVolume < volume) {
							return cec.increaseVolume(logicalDeviceId);
						} else {
							return cec.decreaseVolume(logicalDeviceId);
						}
					}

					if (!adjustVolume()) {
						throw `Failed to adjust volume on step ${i}.`;
					}

					if (commandDelay > 0) {
						await setTimeout(commandDelay);
					}
				}
			} catch (error) {
				const errorMessage =
					"Failed to set an absolute volume value: " +
					error.toString();
				console.error(errorMessage);
				response.error = true;
				response.message = errorMessage;
				return res.status(500).json(response);
			}

			res.status(200).json(response);

			next();
		}
	);

	app.get("/set-mute/:logicalDeviceId/:mute", (req, res, next) => {
		const { logicalDeviceId, mute } = req.params;
		const response = RestResponse();

		if (!logicalDeviceId || mute === undefined) {
			response.error = true;
			response.message =
				"Logical device ID and mute status are required.";
			return res.status(400).json(response);
		}

		// Since we can only perform a toggle, we need to check if the current status is the same as the desired status
		if (cec.getAudioStatus(logicalDeviceId).mute == mute) {
			response.message =
				"Mute status is already set to the desired value.";
			return res.status(200).json(response);
		}

		if (cec.sendUserControl(logicalDeviceId, "mute")) {
			response.message = "Mute command sent successfully.";
		} else {
			response.error = true;
			response.message = "Failed to send mute command.";
			return res.status(500).json(response);
		}

		res.status(200).json(response);

		next();
	});

	app.get("/set-active-source/:address", (req, res, next) => {
		const { address } = req.params;
		const response = RestResponse();

		if (!address) {
			response.error = true;
			response.message = "Physical address is required.";
			return res.status(400).json(response);
		}

		if (cec.call(`--active-source phys-addr=${address}`) !== null) {
			response.message = "Active source set successfully.";
		} else {
			response.error = true;
			response.message = "Failed to set active source.";
			return res.status(500).json(response);
		}

		res.status(200).json(response);

		next();
	});

	app.get("/image-view-on/:logicalDeviceId", (req, res, next) => {
		const { logicalDeviceId } = req.params;
		const response = RestResponse();

		if (!logicalDeviceId) {
			response.error = true;
			response.message = "Logical device ID is required.";
			return res.status(400).json(response);
		}

		if (cec.call(`--image-view-on -t ${logicalDeviceId}`) !== null) {
			response.message = "Image view on command sent successfully.";
		} else {
			response.error = true;
			response.message = "Failed to send image view on command.";
			return res.status(500).json(response);
		}

		res.status(200).json(response);

		next();
	});

	app.get("/standby/:logicalDeviceId", (req, res, next) => {
		const { logicalDeviceId } = req.params;
		const response = RestResponse();

		if (!logicalDeviceId) {
			response.error = true;
			response.message = "Logical device ID is required.";
			return res.status(400).json(response);
		}

		if (cec.call(`--standby -t ${logicalDeviceId}`) !== null) {
			response.message = "Standby command sent successfully.";
		} else {
			response.error = true;
			response.message = "Failed to send standby command.";
			return res.status(500).json(response);
		}

		res.status(200).json(response);

		next();
	});

    app.get('/user-control-pressed/:logicalDeviceId/:control', (req, res, next) => {
        const { logicalDeviceId, control } = req.params;
        const response = RestResponse();
    
        if (!logicalDeviceId || !control) {
            response.error = true;
            response.message = 'Logical device ID and control are required.';
            return res.status(400).json(response);
        }
    
        if (cec.sendUserControl(logicalDeviceId, control)) {
            response.message = 'User control pressed command sent successfully.';
        } else {
            response.error = true;
            response.message = 'Failed to send user control pressed command.';
            return res.status(500).json(response);
        }
    
        res.status(200).json(response);
    
        next();
    });
}

module.exports = RestHandler;
