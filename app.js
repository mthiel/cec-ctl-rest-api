const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
app.use(bodyParser.json());

// cec tool constants
const CEC_CTL_COMMAND = 'cec-ctl';
const CEC_CTL_DEFAULTS = '-s --cec-version-1.4';

// Helper function to execute CEC commands
function executeCecCommand(args, callback) {
	const command = `${CEC_CTL_COMMAND} ${CEC_CTL_DEFAULTS} ${args}`;
	exec(command, (error, stdout, stderr) => {
		if (error) {
			console.error(`CEC command execution error: ${error}`);
			callback(error, null);
		} else {
			callback(null, stdout);
		}
	});
}

function setVolumeAbsolute(logicalDeviceId, volume) {
	executeCecCommand(cecCommands['give-audio-status'].args(logicalDeviceId), (error, result) => {
		if (error) {
			console.error(`Failed to get audio status: ${error}`);
		} else {
			const audioStatus = cecCommands['give-audio-status'].process(result);
			if (audioStatus.volume !== null) {
				const currentVolume = audioStatus.volume;
				
				if (currentVolume < volume) {
					// TODO: Increase the volume
				} else {
					// TODO: Decrease the volume
				}
			} else {
				console.error('Failed to get audio status: Volume is null');
			}
		}
	});
}

// Sub-functions for different CEC commands
const cecCommands = {
	'get-cec-version': {
		args: (logicalDeviceId) => `--get-cec-version -t ${logicalDeviceId}`,
		process: (output) => {
			const versionMatch = output.match(/cec-version: (\S+)/);
			return {
				version: versionMatch ? versionMatch[1] : null
			};
		}
	},
	'give-audio-status': {
		args: (logicalDeviceId) => `--give-audio-status -t ${logicalDeviceId}`,
		process: (output) => {
			const muteMatch = output.match(/aud-mute-status: (\w+)/);
			const volumeMatch = output.match(/aud-vol-status: (\d+)/);
			
			return {
				mute: muteMatch && muteMatch[1] === 'on' ? 1 : 0,
				volume: volumeMatch ? parseInt(volumeMatch[1]) : null
			};
		}
	},
	'custom-set-absolute-volume': {
		args: (logicalDeviceId, volume) => `--set-audio-volume ${volume} -t ${logicalDeviceId}`,
		process: (output) => {
			return {
				success: true
			};
		}
	}
};

// GET request route handler
app.get('/cec-ctl/:command/:logicalDeviceId/:value?', (req, res) => {
	const { command, logicalDeviceId, value } = req.params;
	
	if (!cecCommands[command]) {
		return res.status(400).json({ error: 'Invalid command' });
	}

	if (command.startsWith('custom-')) {
		if (command === 'custom-set-absolute-volume') {
			setVolumeAbsolute(logicalDeviceId, value);
		} else {
			return res.status(400).json({ error: 'Invalid custom command' });
		}
	} else {
		const { args, process } = cecCommands[command];
		const commandArgs = value !== undefined ? args(logicalDeviceId, value) : args(logicalDeviceId);
		
		executeCecCommand(commandArgs, (error, result) => {
			if (error) {
				return res.status(500).json({ error: 'Failed to execute command' });
			}
			const processedResult = process(result);
			res.json(processedResult);
		});
	}
});

// Execute the playback registration command on startup
executeCecCommand('--playback', (error, result) => {
	if (error) {
		console.error('Failed to register as playback device');
	} else {
		console.log('Successfully registered as playback device');
	}
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Server running on port ${port}`));

// Shutdown handler
process.on('SIGINT', () => {
	console.log('Shutting down server...');
	executeCecCommand('--clear', (error, result) => {
		if (error) {
			console.error('Failed to unregister device');
		} else {
			console.log('Successfully unregistered device');
		}
		server.close(() => {
			console.log('Server closed');
			process.exit(0);
		});
	});
});