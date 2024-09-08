const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
app.use(bodyParser.json());

// Execute the playback registration command on startup
exec('cec-ctl --playback', (error, stdout, stderr) => {
    if (error) {
        console.error(`Failed to register as playback device: ${error}`);
    } else {
        console.log('Successfully registered as playback device');
    }
});

app.get('/cec-ctl', (req, res) => {
    const command = `cec-ctl ${req.query.command}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ error: 'Failed to execute command' });
        }

        res.json({ stdout, stderr });
    });
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Server running on port ${port}`));

// Shutdown handler
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    exec('cec-ctl --clear', (error, stdout, stderr) => {
        if (error) {
            console.error(`Failed to unregister device: ${error}`);
        } else {
            console.log('Successfully unregistered device');
        }
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
});