const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
app.use(bodyParser.json());

// cec tool constants
const CEC_CTL_COMMAND = 'cec-ctl';
const CEC_CTL_DEFAULTS = '-s';

// Helper function to execute CEC commands
function executeCecCommand(args, callback) {
	const command = `${CEC_CTL_COMMAND} ${CEC_CTL_DEFAULTS} ${args}`;
	exec(command, (error, stdout, stderr) => {
		if (error) {
			console.error(`CEC command execution error: ${error}`);
			callback(error, null);
		} else {
			callback(null, { stdout, stderr });
		}
	});
}

// Execute the playback registration command on startup
executeCecCommand('--playback', (error, result) => {
	if (error) {
		console.error('Failed to register as playback device');
	} else {
		console.log('Successfully registered as playback device');
	}
});

app.get('/cec-ctl', (req, res) => {
	executeCecCommand(req.query.command, (error, result) => {
		if (error) {
			return res.status(500).json({ error: 'Failed to execute command' });
		}
		res.json(result);
	});
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