#!/bin/bash

# Start the WebSocket server in the background
npm run server &

# Wait a moment for the server to start
sleep 2

# Start the development server
npm run dev