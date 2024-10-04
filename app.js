'use strict';

const express = require('express');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse command-line arguments
const argv = yargs(hideBin(process.argv))
	.option('port', {
		alias: 'p',
		type: 'number',
		description: 'Port number for the web server',
		default: 3000
	})
	.option('cec-params', {
		alias: 'c',
		type: 'string',
		description: 'CEC-CTL parameters'
	})
	.option('volume-step', {
		alias: 'v',
		type: 'number',
		description: 'Volume step value',
		default: 0.5
	})
	.option('command-delay', {
		alias: 'd',
		type: 'number',
		description: 'Command delay in milliseconds',
		default: 50
	})
	.help().argv;

/**
 * CEC module
 * @type {import('./cec')}
 */
const cec = require('./cec');

// Init CEC and pass command-line arguments to the module
if (
	!cec.initCEC({
		cecCtlParams: argv['cec-params'],
		volumeStep: argv['volume-step'],
		commandDelay: argv['command-delay']
	})
) {
	console.error('Failed to initialize CEC module. Aborting.');
	process.exit(1);
}

const app = express();

// Initialize WebSocket and REST handlers
require('./ws')(cec, app);
require('./rest')(cec, app);

// 404 handler
app.use((req, res, next) => {
	if (res.headersSent) {
		return next();
	}
	res.status(404).json({
		error: true,
		message: 'Unknown endpoint.'
	});
});

// Start the server
const port = argv.port;
const server = app.listen(port, () => console.log(`Server running on port ${port}`));

// Shutdown handler
process.on('SIGINT', () => {
	console.log('Shutting down server...');

	server.close(() => {
		console.log('Server closed.');
	});
});
