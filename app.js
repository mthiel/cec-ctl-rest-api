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

// Helper function to execute CEC commands
function callCecCtl(args) {
	const command = `${CEC_CTL_COMMAND} ${CEC_CTL_DEFAULTS} ${args}`;

	try {
		return execSync(command).toString();
	} catch (error) {
		console.error(`Failed to execute command: ${error}`);
	}
}

function getAudioStatus(logicalDeviceId) {
	const result = callCecCtl(`--give-audio-status -t ${logicalDeviceId}`);

	if (result) {
		const mute = result.match(/aud-mute-status: (\w+)/);
		const volume = result.match(/aud-vol-status: (\d+)/);
		
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

app.all('/', (req, res, next) => {
	const { volumeStep, commandDelay } = req.query;

	res.locals.volumeStep = volumeStep ? parseFloat(volumeStep) : VOLUME_STEP;
	res.locals.commandDelay = commandDelay ? parseInt(commandDelay) : COMMAND_DELAY;
	next();
});

app.get('/get-cec-version/:logicalDeviceId', (req, res) => {
	const { logicalDeviceId } = req.params;

	if (!logicalDeviceId) {
		return res.status(400).json({ error: 'Logical device ID is required' });
	}

	const result = callCecCtl(`--get-cec-version -t ${logicalDeviceId}`);

	if (result) {
		const version = result.match(/cec-version: (\S+)/);

		res.json({
			version: version ? version[1] : null
		});
	} else {
		res.status(500).json({ error: 'Failed to get CEC version.' });
	}
});

app.get('/get-audio-status/:logicalDeviceId', (req, res) => {
	const { logicalDeviceId } = req.params;

	if (!logicalDeviceId) {
		return res.status(400).json({ error: 'Logical device ID is required.' });
	}
	
	const audioStatus = getAudioStatus(logicalDeviceId);
	if (audioStatus) {
		res.json(audioStatus);
	} else {
		res.status(500).json({ error: 'Failed to get audio status.' });
	}
});

app.get('/set-volume-relative/:logicalDeviceId/:volume', (req, res) => {
	const { logicalDeviceId, volume } = req.params;

	if (!logicalDeviceId || !volume) {
		return res.status(400).json({ error: 'Logical device ID and volume offset are required.' });
	}
	
	if (volume > 0) {
		increaseVolume(logicalDeviceId);
	} else {
		decreaseVolume(logicalDeviceId);
	}

	res.status(200).json({ message: 'Volume adjusted successfully.' });
});	

app.get('/set-volume-absolute/:logicalDeviceId/:volume', async (req, res, next) => {
	const { logicalDeviceId, volume } = req.params;

	if (!logicalDeviceId || !volume) {
		return res.status(400).json({ error: 'Logical device ID and volume are required.' });
	}

	let response = {
		volumeStep: res.locals.volumeStep,
		commandDelay: res.locals.commandDelay,
		requestedVolume: volume
	};
	
	try {
		const audioStatus = getAudioStatus(logicalDeviceId);
		if (audioStatus) {
			const currentVolume = audioStatus.volume;
			response.currentVolume = currentVolume;
			if (currentVolume !== null) {
				if (currentVolume < volume) {
					for (let i = currentVolume; i < volume; i+=res.locals.volumeStep) {
						increaseVolume(logicalDeviceId);
						if (res.locals.commandDelay > 0) {
							await setTimeout(res.locals.commandDelay);
						}
					}
				} else if (currentVolume > volume) {
					for (let i = currentVolume; i > volume; i-=res.locals.volumeStep) {
						decreaseVolume(logicalDeviceId);
						if (res.locals.commandDelay > 0) {
							await setTimeout(res.locals.commandDelay);
						}
					}
				} else {
					response.message = 'Volume is already set to the desired value.';
				}
			} else {
				throw "The current volume can't be read.";
			}
		} else {
			throw "Failed to get current audio status.";
		}
	} catch (error) {
		const errorMessage = 'Failed to set volume: ' + error;
		console.error(errorMessage);
		response.error = errorMessage;
		res.status(500).json(response);
	}

	res.status(200).json(response);
	next();
});

// 404 handler
app.use((req, res) => {
	let response = {
		volumeStep: res.locals.volumeStep,
		commandDelay: res.locals.commandDelay,
		error: 'Unknown endpoint'
	};
	res.status(404).json(response);
});

// 500 handler
app.use((err, req, res) => {
	let response = {
		volumeStep: res.locals.volumeStep,
		commandDelay: res.locals.commandDelay,
		error: err.message
	};
	res.status(500).json(response);
	console.error(err.stack);
});

// Execute the playback registration command on startup
callCecCtl('--playback');
console.log('Successfully registered as playback device');

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