const { execSync } = require('child_process');
const { setTimeout } = require('timers/promises');

// Default values are what work for my setup
var CEC_CTL_COMMAND = 'cec-ctl';
var CEC_CTL_PARAMS = '-s --cec-version-1.4';
var VOLUME_STEP = 0.5;
var COMMAND_DELAY = 50;

/**
 * @typedef {Object} CECResponse
 * @property {boolean} error - Indicates if an error occurred during execution.
 * @property {string} output - Contains the command output or error message.
 * @property {string} [version] - Contains the CEC version.
 * @property {number} [volume] - Contains the current volume level.
 * @property {number} [mute] - Indicates if the mute status is on (1) or off (0).
 */

/**
 * CEC response object factory
 * @returns {CECResponse}
 */
function CECResponse() {
	return {
		error: false,
		output: ''
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
	const result = call(`--get-cec-version -t ${logicalDeviceId}`);

	if (result.error === false && result.output) {
		const version = result.output.match(/cec-version: (\S+)/); // cec-version: version-1-4 (0x05)
		result.version = version ? version[1] : null;
	}

	return result;
}

function getAudioStatus(logicalDeviceId) {
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

		result.mute = mute && mute[1] === 'on' ? 1 : 0;
		result.volume = volume ? parseInt(volume[1]) : null;
	}

	return result;
}

function sendUserControl(logicalDeviceId, control) {
	const result = call(`--user-control-pressed ui-cmd=${control} -t ${logicalDeviceId}`);

	if (result.error === false) {
		const releaseResult = call(`--user-control-released -t ${logicalDeviceId}`);
		if (releaseResult.error === false) {
			result.output = [result.output, releaseResult.output].join('\n');
		}
	}

	return result;
}

function increaseVolume(logicalDeviceId) {
	return sendUserControl(logicalDeviceId, 'volume-up');
}

function decreaseVolume(logicalDeviceId) {
	return sendUserControl(logicalDeviceId, 'volume-down');
}

async function setVolumeAbsolute(logicalDeviceId, volume) {
	const result = getAudioStatus(logicalDeviceId);
	if (result.error === true) {
		return result;
	}

	const currentVolume = result.volume;
	if (currentVolume === null) {
		result.error = true;
		result.output = 'The current volume level is not available to compare against. Aborting.';
		return result;
	}

	if (currentVolume === volume) {
		result.output = 'Volume is already set to the desired value.';
		return result;
	}

	const adjustmentSteps = Math.abs(currentVolume - volume) / VOLUME_STEP;
	for (let i = 0; i < adjustmentSteps; i++) {
		const stepResult = currentVolume < volume ? increaseVolume(logicalDeviceId) : decreaseVolume(logicalDeviceId);

		if (stepResult.error === true) {
			return stepResult;
		}

		// TODO: Rework this to use promises?
		if (COMMAND_DELAY > 0) {
			await setTimeout(COMMAND_DELAY);
		}
	}

	return getAudioStatus(logicalDeviceId);
}

function setMute(logicalDeviceId, mute) {
	const result = getAudioStatus(logicalDeviceId);
	if (result.error === true) {
		return result;
	}

	// Since we can only perform a toggle, we need to check if the current status is the same as the desired status
	if (result.mute == mute) {
		result.output = 'Mute status is already set to the desired value.';
		return result;
	}

	return sendUserControl(logicalDeviceId, 'mute');
}

function setActiveSource(physicalAddress) {
	return call(`--active-source phys-addr=${physicalAddress}`);
}

function setStandby(logicalDeviceId) {
	return call(`--standby -t ${logicalDeviceId}`);
}

function setImageViewOn(logicalDeviceId) {
	return call(`--image-view-on -t ${logicalDeviceId}`);
}

/**
 * Initializes the CEC device by clearing the device and registering as a playback device.
 * @param {Object} options - The options object.
 * @param {string} [options.cecCtlParams] - The parameters for the cec-ctl command.
 * @param {number} [options.volumeStep] - The volume step value.
 * @param {number} [options.commandDelay] - The command delay in milliseconds.
 * @returns {boolean} True if the initialization was successful, false otherwise.
 */
function initCEC(options) {
	CEC_CTL_PARAMS = options.cecCtlParams || CEC_CTL_PARAMS;
	VOLUME_STEP = options.volumeStep || VOLUME_STEP;
	COMMAND_DELAY = options.commandDelay || COMMAND_DELAY;

	console.log('Initializing CEC...');

	const clearResult = call('--clear');
	if (clearResult.error) {
		console.error('Failed to clear CEC device:', clearResult.output);
		return false;
	}

	const playbackResult = call('--playback');
	if (playbackResult.error) {
		console.error('Failed to register as a playback device:', playbackResult.output);
		return false;
	}

	console.log('CEC initialized successfully');
	return true;
}

/**
 * Unregisters the CEC device by clearing the device.
 * @returns {boolean} True if the unregistration was successful, false otherwise.
 */
function unregisterCEC() {
	console.log('Unregistering CEC...');

	const result = call('--clear');
	if (result.error) {
		console.error('Failed to unregister CEC:', result.output);
		return false;
	}

	console.log('CEC unregistered successfully');
	return true;
}

/**
 * Unregisters the CEC device during shutdown.
 */
process.on('SIGINT', () => {
	try {
		if (unregisterCEC()) {
			console.log('Successfully unregistered CEC device.');
		} else {
			console.log('Unable to unregister CEC device during shutdown.');
		}
	} catch (error) {
		console.error('Error unregistering CEC device during shutdown: ', error);
	}
});

module.exports = {
	initCEC,
	unregisterCEC,
	call,
	getCECVersion,
	getAudioStatus,
	sendUserControl,
	increaseVolume,
	decreaseVolume,
	setVolumeAbsolute,
	setMute,
	setActiveSource,
	setStandby,
	setImageViewOn
};
