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
	callCecCtl(`--user-control-pressed ui-cmd=${control} -t ${logicalDeviceId}`);
	callCecCtl(`--user-control-released -t ${logicalDeviceId}`);
}

function increaseVolume(logicalDeviceId) {
	sendUserControl(logicalDeviceId, 'volume-up');
}

function decreaseVolume(logicalDeviceId) {
	sendUserControl(logicalDeviceId, 'volume-down');
}

app.get('/get-cec-version/:logicalDeviceId', (req, res, next) => {
	const { logicalDeviceId } = req.params;
	const response = new standardResponse(req);

	if (!logicalDeviceId) {
		response.error = true;
		response.message = 'Logical device ID is required';
		return res.status(400).json(response);
	}

	const output = callCecCtl(`--get-cec-version -t ${logicalDeviceId}`);

	if (output) {
		const version = output.match(/cec-version: (\S+)/);
		response.version = version ? version[1] : null;
	} else {
		response.error = true;
		response.message = 'Failed to get CEC version.';
		return res.status(500).json(response);
	}

	res.json(response);

	next();
});

app.get('/get-audio-status/:logicalDeviceId', (req, res, next) => {
	const { logicalDeviceId } = req.params;
	const response = new standardResponse(req);

	if (!logicalDeviceId) {
		response.error = true;
		response.message = 'Logical device ID is required.';
		return res.status(400).json(response);
	}
	
	const audioStatus = getAudioStatus(logicalDeviceId);
	if (audioStatus) {
		response.audioStatus = audioStatus;
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
		if (audioStatus) {
			const currentVolume = audioStatus.volume;
			if (currentVolume !== null) {
				if (currentVolume < volume) {
					for (let i = currentVolume; i < volume; i+=volumeStep) {
						increaseVolume(logicalDeviceId);
						if (commandDelay > 0) {
							await setTimeout(commandDelay);
						}
					}
				} else if (currentVolume > volume) {
					for (let i = currentVolume; i > volume; i-=res.locals.volumeStep) {
						decreaseVolume(logicalDeviceId);
						if (commandDelay > 0) {
							await setTimeout(commandDelay);
						}
					}
				} else {
					response.message = 'Volume is already set to the desired value.';
				}
			} else {
				throw "The current volume level is not available to compare against. Aborting.";
			}
		} else {
			throw "Failed to get current audio status. Aborting.";
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
if (callCecCtl('--clear') && callCecCtl('--playback')) {
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
		callCecCtl('--clear');
		console.log('Successfully unregistered CEC device.');
	} catch (error) {
		console.error('Failed to unregister CEC device: ', error);
	}

	server.close(() => {
		console.log('Server closed.');
		process.exit(0);
	});
});