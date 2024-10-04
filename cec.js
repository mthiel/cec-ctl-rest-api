const { execSync } = require('child_process');

const CEC_CTL_COMMAND = 'cec-ctl';
const CEC_CTL_DEFAULTS = '-s --cec-version-1.4';

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

    const command = `${CEC_CTL_COMMAND} ${CEC_CTL_DEFAULTS} ${args}`;

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
        throw new Error('Logical device ID is required');
    }

    return call(`--get-cec-version -t ${logicalDeviceId}`);
}

function getAudioStatus(logicalDeviceId) {
    if (!logicalDeviceId) {
        throw new Error('Logical device ID is required');
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

/**
 * Initializes the CEC device by clearing the device and registering as a playback device.
 * @returns {boolean} True if the initialization was successful, false otherwise.
 */
function initCEC() {
    return call('--clear').error === false && call('--playback').error === false;
}

/**
 * Unregisters the CEC device by clearing the device.
 * @returns {boolean} True if the unregistration was successful, false otherwise.
 */
function unregisterCEC() {
    return call('--clear').error === false;
}

/**
 * A module for interacting with CEC (Consumer Electronics Control) devices using the cec-ctl command.
 * @module cec
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
const cec = {
    call,
    getCECVersion,
    getAudioStatus,
    sendUserControl,
    increaseVolume,
    decreaseVolume,
    unregisterCEC
};

if (initCEC()) {
    module.exports = cec;
} else {
    module.exports = null;
}