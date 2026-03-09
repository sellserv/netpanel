#!/bin/bash
set -e

# Install Node.js 22 if not present
if ! command -v node &> /dev/null || [[ "$(node -v)" != v22* ]]; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
  sudo apt install -y nodejs
fi

# Install dependencies and build
echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build

# Create systemd service
echo "Setting up systemd service..."
sudo tee /etc/systemd/system/netpanel.service > /dev/null << EOF
[Unit]
Description=NetPanel
After=network.target

[Service]
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/npx tsx server/index.ts
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now netpanel

echo ""
echo "NetPanel is running on port 3001"
echo "  Status: sudo systemctl status netpanel"
echo "  Logs:   sudo journalctl -u netpanel -f"
echo "  Restart: sudo systemctl restart netpanel"
