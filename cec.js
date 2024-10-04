const { execSync } = require("child_process");

var CEC_CTL_COMMAND = "cec-ctl";
var CEC_CTL_PARAMS = "-s --cec-version-1.4";
var VOLUME_STEP = 0.5;
var COMMAND_DELAY = 50;

/**
 * @typedef {Object} CECResponse
 * @property {boolean} error - Indicates if an error occurred during execution.
 * @property {string} output - Contains the command output or error message.
 */

/**
 * CEC response object factory
 * @returns {CECResponse}
 */
function CECResponse() {
	return {
		error: false,
		output: "",
	};
}

/**
 * Executes the CEC command with the specified arguments.
 * @function
 * @param {string} args The arguments to pass to the CEC command.
 * @returns {CECResponse} The response object
 */
function call(args) {
	const response = CECResponse();

	const command = `${CEC_CTL_COMMAND} ${CEC_CTL_PARAMS} ${args}`;

	try {
		response.output = execSync(command).toString();
	} catch (error) {
		response.error = true;
		response.output = error.toString();
	}

	return response;
}

/**
 * Gets the CEC version for a given logical device ID.
 * @param {string} logicalDeviceId The logical device ID.
 * @returns {CECResponse} The response object.
 */
function getCECVersion(logicalDeviceId) {
	if (!logicalDeviceId) {
		throw new Error("Logical device ID is required");
	}

	return call(`--get-cec-version -t ${logicalDeviceId}`);
}

function getAudioStatus(logicalDeviceId) {
	if (!logicalDeviceId) {
		throw new Error("Logical device ID is required");
	}

	/*
		Sample output:

		Transmit from Playback Device 2 to Audio System (8 to 5):
		GIVE_AUDIO_STATUS (0x71)
	    	Received from Audio System (5):
			REPORT_AUDIO_STATUS (0x7a):
				aud-mute-status: off (0x00)
				aud-vol-status: 40 (0x28)
				Sequence: 911 Tx Timestamp: 72024.122s Rx Timestamp: 72024.214s
				Approximate response time: 19 ms
	*/
	const result = call(`--give-audio-status -t ${logicalDeviceId}`);

	if (result.error === false && result.output) {
		const mute = result.output.match(/aud-mute-status: (\w+)/); // aud-mute-status: off (0x00)
		const volume = result.output.match(/aud-vol-status: (\d+)/); // aud-vol-status: 40 (0x28)

		result.mute = mute && mute[1] === "on" ? 1 : 0;
		result.volume = volume ? parseInt(volume[1]) : null;
	}

	return result;
}

function sendUserControl(logicalDeviceId, control) {
	const result = call(
		`--user-control-pressed ui-cmd=${control} -t ${logicalDeviceId}`
	);

	if (result.error === false) {
		const releaseResult = call(
			`--user-control-released -t ${logicalDeviceId}`
		);
		if (releaseResult.error === false) {
			result.output = [result.output, releaseResult.output].join("\n");
		}
	}

	return result;
}

function increaseVolume(logicalDeviceId) {
	return sendUserControl(logicalDeviceId, "volume-up");
}

function decreaseVolume(logicalDeviceId) {
	return sendUserControl(logicalDeviceId, "volume-down");
}

/**
 * Initializes the CEC device by clearing the device and registering as a playback device.
 * @returns {boolean} True if the initialization was successful, false otherwise.
 */
function initCEC() {
	console.log("Initializing CEC...");

	const clearResult = call("--clear");
	if (clearResult.error) {
		console.error("Failed to clear CEC device:", clearResult.output);
		return false;
	}

	const playbackResult = call("--playback");
	if (playbackResult.error) {
		console.error(
			"Failed to register as a playback device:",
			playbackResult.output
		);
		return false;
	}

	console.log("CEC initialized successfully");
	return true;
}

/**
 * Unregisters the CEC device by clearing the device.
 * @returns {boolean} True if the unregistration was successful, false otherwise.
 */
function unregisterCEC() {
	console.log("Unregistering CEC...");

	const result = call("--clear");
	if (result.error) {
		console.error("Failed to unregister CEC:", result.output);
		return false;
	}

	console.log("CEC unregistered successfully");
	return true;
}

/**
 * Unregisters the CEC device during shutdown.
 */
process.on("SIGINT", () => {
	try {
		if (unregisterCEC()) {
			console.log("Successfully unregistered CEC device.");
		} else {
			console.log("Unable to unregister CEC device during shutdown.");
		}
	} catch (error) {
		console.error(
			"Error unregistering CEC device during shutdown: ",
			error
		);
	}
});

/**
 * Initializes the CEC module with the specified options.
 * @param {Object} options - The options object.
 * @param {string} options.cecCtlParams - The parameters for the cec-ctl command.
 * @param {number} options.volumeStep - The volume step value.
 * @param {number} options.commandDelay - The command delay in milliseconds.
 * @returns {Object|null} The CEC module or null if initialization failed.
 *
 * @example
 * const cec = require('./cec');
 * if (cec) {
 *   const result = cec.call('--some-cec-command');
 *   console.log(result);
 * } else {
 *   console.error('CEC initialization failed');
 * }
 */
function init(options) {
	CEC_CTL_PARAMS = options.cecCtlParams || CEC_CTL_PARAMS;
	VOLUME_STEP = options.volumeStep || VOLUME_STEP;
	COMMAND_DELAY = options.commandDelay || COMMAND_DELAY;

	if (initCEC()) {
		return {
			call,
			getCECVersion,
			getAudioStatus,
			sendUserControl,
			increaseVolume,
			decreaseVolume,
		};
	}
	return null;
}

module.exports = init;
