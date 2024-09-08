#!/bin/bash

# Check if the script is run with root privileges
if [ "$EUID" -ne 0 ]; then
    echo "Please run this script as root or using sudo."
    echo "Usage: sudo $0"
    exit 1
fi

# Update and install dependencies
apt-get update
apt-get install -y nodejs npm git

# Create a dedicated user for the service
adduser --system --no-create-home --group cec-api

# Clone or update the repository
if [ -d "/opt/cec-ctl-rest-api" ]; then
    cd /opt/cec-ctl-rest-api
    sudo -u cec-api git pull
else
    git clone https://github.com/mthiel/cec-ctl-rest-api.git /opt/cec-ctl-rest-api
fi

# Set correct permissions
chown -R cec-api:cec-api /opt/cec-ctl-rest-api

# Install Node.js dependencies
cd /opt/cec-ctl-rest-api
sudo -u cec-api npm install

# Copy systemd service file
cp cec-ctl-rest-api.service /etc/systemd/system/

# Reload systemd and enable the service
systemctl daemon-reload
systemctl enable cec-ctl-rest-api
systemctl start cec-ctl-rest-api

echo "Installation complete. The service should now be running."