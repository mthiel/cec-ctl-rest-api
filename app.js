const express = require('express');
const bodyParser = require('body-parser');
const { execSync } = require('child_process');
const { setTimeout } = require('timers/promises');

const app = express();
app.use(bodyParser.json());

// cec tool constants
const CEC_CTL_COMMAND = 'cec-ctl';
const CEC_CTL_DEFAULTS = '-s --cec-version-1.4';

// Other default values
const VOLUME_STEP = 0.5;
const COMMAND_DELAY = 50;

// Response object factory
function standardResponse(req) {
	const { debug, volumeStep, commandDelay } = req.query;

	const response = {
		error: false,
		message: ''
	};

	if (debug) {
		response.debug = {
			volumeStep: volumeStep ? parseFloat(volumeStep) : VOLUME_STEP,
			commandDelay: commandDelay ? parseInt(commandDelay) : COMMAND_DELAY
		};
	}

	return response;
}

// Helper function to execute CEC commands
function callCecCtl(args) {
	const command = `${CEC_CTL_COMMAND} ${CEC_CTL_DEFAULTS} ${args}`;

	try {
		return execSync(command).toString();
	} catch (error) {
		console.error(`Failed to execute command: ${error}`);
		return null;
	}
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
	const output = callCecCtl(`--give-audio-status -t ${logicalDeviceId}`);

	if (output) {
		const mute = output.match(/aud-mute-status: (\w+)/);	// aud-mute-status: off (0x00)
		const volume = output.match(/aud-vol-status: (\d+)/);	// aud-vol-status: 40 (0x28)
		
		return {
			mute: mute && mute[1] === 'on' ? 1 : 0,
			volume: volume ? parseInt(volume[1]) : null
		};
	}
}

function sendUserControl(logicalDeviceId, control) {
	if (callCecCtl(`--user-control-pressed ui-cmd=${control} -t ${logicalDeviceId}`) !== null) {
		if (callCecCtl(`--user-control-released -t ${logicalDeviceId}`) !== null) {
			return true;
		}
	}

	return false;
}

function increaseVolume(logicalDeviceId) {
	return sendUserControl(logicalDeviceId, 'volume-up');
}

function decreaseVolume(logicalDeviceId) {
	return sendUserControl(logicalDeviceId, 'volume-down');
}

app.get('/get-cec-version/:logicalDeviceId', (req, res, next) => {
	const { logicalDeviceId } = req.params;
	const response = new standardResponse(req);

	if (!logicalDeviceId) {
		response.error = true;
		response.message = 'Logical device ID is required';
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
	const output = callCecCtl(`--get-cec-version -t ${logicalDeviceId}`);

	if (output !== null) {
		const version = output.match(/cec-version: (\S+)/); // cec-version: version-1-4 (0x05)
		response.version = version ? version[1] : null;
	} else {
		response.error = true;
		response.message = 'Failed to get CEC version.';
		return res.status(500).json(response);
	}

	res.json(response);

	next();
});

app.get('/give-audio-status/:logicalDeviceId', (req, res, next) => {
	const { logicalDeviceId } = req.params;
	let response = new standardResponse(req);

	if (!logicalDeviceId) {
		response.error = true;
		response.message = 'Logical device ID is required.';
		return res.status(400).json(response);
	}
	
	const audioStatus = getAudioStatus(logicalDeviceId);
	if (audioStatus) {
		response = {...response, audioStatus};
	} else {
		response.error = true;
		response.message = 'Failed to get audio status.';
		return res.status(500).json(response);
	}

	res.json(response);

	next();
});

app.get('/set-volume-relative/:logicalDeviceId/:volume', (req, res, next) => {
	const { logicalDeviceId, volume } = req.params;
	const response = new standardResponse(req);

	if (!logicalDeviceId || !volume) {
		response.error = true;
		response.message = 'Logical device ID and volume offset are required.';
		return res.status(400).json(response);
	}
	
	// TODO: Implement multiple volume steps
	if (volume > 0) {
		increaseVolume(logicalDeviceId);
	} else {
		decreaseVolume(logicalDeviceId);
	}

	res.status(200).json(response);

	next();
});	

app.get('/set-volume-absolute/:logicalDeviceId/:volume', async (req, res, next) => {
	const { logicalDeviceId, volume } = req.params;
	const { debug } = req.query;

	const response = new standardResponse(req);
	
	if (!logicalDeviceId || !volume) {
		response.error = true;
		response.message = 'Logical device ID and volume are required.';
		return res.status(400).json(response);
	}

	if (debug) {
		response.debug = response.debug || {};
		response.debug.requestedVolume = volume;
	}

	// Default values are what work for my setup
	const volumeStep = req.query.volumeStep ? parseFloat(req.query.volumeStep) : VOLUME_STEP;
	const commandDelay = req.query.commandDelay ? parseInt(req.query.commandDelay) : COMMAND_DELAY;

	try {
		const audioStatus = getAudioStatus(logicalDeviceId);
		if (!audioStatus) {
			throw "Failed to get current audio status. Aborting.";
		}

		const currentVolume = audioStatus.volume;
		if (currentVolume === null) {
			throw "The current volume level is not available to compare against. Aborting.";
		}

		if (currentVolume === volume) {
			response.message = 'Volume is already set to the desired value.';
			return res.status(200).json(response);
		}

		const adjustmentSteps = Math.abs(currentVolume - volume) / volumeStep;
		for (let i = 0; i < adjustmentSteps; i++) {
			function adjustVolume() {
				if (currentVolume < volume) {
					return increaseVolume(logicalDeviceId);
				} else {
					return decreaseVolume(logicalDeviceId);
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
		const errorMessage = 'Failed to set an absolute volume value: ' + error.toString();
		console.error(errorMessage);
		response.error = true;
		response.message = errorMessage;
		return res.status(500).json(response);
	}

	res.status(200).json(response);

	next();
});

// 404 handler
app.use((req, res) => {
	const response = new standardResponse(req);
	response.error = true;
	response.message = 'Unknown endpoint.';
	res.status(404).json(response);
});

// Re-set the CEC device and execute the playback registration command on startup
if (callCecCtl('--clear') !== null && callCecCtl('--playback') !== null) {
	console.log('Successfully registered as playback device');
} else {
	console.error('Failed to reset CEC device. Aborting.');
	process.exit(1);
}

// Start the server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Server running on port ${port}`));

// Shutdown handler
process.on('SIGINT', () => {
	console.log('Shutting down server...');
	try {
		if (callCecCtl('--clear') !== null) {
			console.log('Successfully unregistered CEC device.');
		} else {
			throw 'Command failed.';
		}
	} catch (error) {
		console.error('Failed to unregister CEC device: ', error);
	}

	server.close(() => {
		console.log('Server closed.');
		process.exit(0);
	});
});