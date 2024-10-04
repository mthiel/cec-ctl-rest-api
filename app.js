'use strict';

const express = require('express');

const cec = require('./cec');
if (!cec) {
    console.error('Failed to initialize CEC module. Aborting.');
    process.exit(1);
}

const app = express();
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
const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Server running on port ${port}`));

// Shutdown handler
process.on('SIGINT', () => {
	console.log('Shutting down server...');
	try {
		if (cec.unregisterCEC()) {
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