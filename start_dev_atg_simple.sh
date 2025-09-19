#!/bin/bash

# Simple OpenCRVS ATG Development Environment Starter
# Minimal version for debugging

set -e

SESSION_NAME="opencrvs-atg"

echo "🚀 Starting OpenCRVS ATG (Simple Version)"

# Kill existing session if it exists
if tmux has-session -t $SESSION_NAME 2>/dev/null; then
    echo "🔄 Killing existing session"
    tmux kill-session -t $SESSION_NAME
fi

# Create session with first window
echo "📦 Creating tmux session..."
tmux new-session -d -s $SESSION_NAME -c "$PWD"

# Rename first window
tmux rename-window -t $SESSION_NAME:0 "deps"

# Start dependencies
echo "🔧 Starting dependencies..."
tmux send-keys -t $SESSION_NAME:deps "echo 'Starting dependencies...'" Enter
tmux send-keys -t $SESSION_NAME:deps "yarn dev-atg --only-dependencies" Enter

# Create second window
echo "⚙️ Creating services window..."
tmux new-window -t $SESSION_NAME -c "$PWD"
tmux rename-window -t $SESSION_NAME:1 "svc"

# Start services (with delay)
echo "🔧 Starting services..."
tmux send-keys -t $SESSION_NAME:svc "echo 'Waiting 30 seconds for dependencies...'" Enter
tmux send-keys -t $SESSION_NAME:svc "sleep 30" Enter
tmux send-keys -t $SESSION_NAME:svc "echo 'Starting services...'" Enter
tmux send-keys -t $SESSION_NAME:svc "yarn dev-atg --only-services" Enter

# Create monitor window
echo "📊 Creating monitor window..."
tmux new-window -t $SESSION_NAME -c "$PWD"
tmux rename-window -t $SESSION_NAME:2 "mon"
tmux send-keys -t $SESSION_NAME:mon "echo 'Monitor window ready'" Enter

# Select first window
tmux select-window -t $SESSION_NAME:0

# Show status
echo ""
echo "✅ tmux session created!"
echo "📋 Windows:"
tmux list-windows -t $SESSION_NAME

echo ""
echo "🔗 To attach: tmux attach -t $SESSION_NAME"
echo "📝 To detach: Ctrl+b then d"
echo "🔄 Switch windows: Ctrl+b then 0/1/2"

echo ""
read -p "Attach to session now? (Y/n): " -r
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "Session running in background"
else
    tmux attach -t $SESSION_NAME
fi