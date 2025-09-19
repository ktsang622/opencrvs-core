#!/bin/bash

# OpenCRVS ATG Development Environment Starter with tmux
# Fixed version using window numbers instead of names

set -e

SESSION_NAME="opencrvs-atg"

# Function to check if tmux session exists
session_exists() {
    tmux has-session -t $SESSION_NAME 2>/dev/null
}

echo "🚀 Starting OpenCRVS ATG Development Environment with tmux"
echo "Session: $SESSION_NAME"

# Kill existing session if it exists
if session_exists; then
    echo "🔄 Killing existing session: $SESSION_NAME"
    tmux kill-session -t $SESSION_NAME
fi

# Create new tmux session with first window for dependencies
echo "📦 Creating tmux session and starting dependencies..."
if tmux new-session -d -s $SESSION_NAME -c "$PWD"; then
    echo "✅ tmux session '$SESSION_NAME' created successfully"
else
    echo "❌ Failed to create tmux session '$SESSION_NAME'"
    exit 1
fi

# Rename first window and start dependencies
tmux rename-window -t $SESSION_NAME:0 "📦 Dependencies"
echo "🔧 Starting dependencies in window 0..."
tmux send-keys -t $SESSION_NAME:0 "echo '📦 Starting OpenCRVS Dependencies...'" Enter
tmux send-keys -t $SESSION_NAME:0 "yarn dev-atg --only-dependencies" Enter

# Create second window for services
echo "⚙️ Creating services window..."
if tmux new-window -t $SESSION_NAME -c "$PWD"; then
    echo "✅ Services window created"
    tmux rename-window -t $SESSION_NAME:1 "⚙️ Services"
else
    echo "❌ Failed to create services window"
    exit 1
fi

# Start services with delay
echo "🔧 Starting services in window 1..."
tmux send-keys -t $SESSION_NAME:1 "echo '⏳ Waiting for dependencies to initialize...'" Enter
tmux send-keys -t $SESSION_NAME:1 "sleep 30" Enter
tmux send-keys -t $SESSION_NAME:1 "echo '⚙️ Starting OpenCRVS Services...'" Enter
tmux send-keys -t $SESSION_NAME:1 "yarn dev-atg --only-service" Enter

# Create monitor window
echo "📊 Creating monitor window..."
if tmux new-window -t $SESSION_NAME -c "$PWD"; then
    echo "✅ Monitor window created"
    tmux rename-window -t $SESSION_NAME:2 "📊 Monitor"
else
    echo "❌ Failed to create monitor window"
    exit 1
fi

# Set up monitor window
tmux send-keys -t $SESSION_NAME:2 "echo '📊 OpenCRVS ATG Monitor Window'" Enter
tmux send-keys -t $SESSION_NAME:2 "echo 'Use this window to run commands, check logs, etc.'" Enter
tmux send-keys -t $SESSION_NAME:2 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:2 "echo 'Useful commands:'" Enter
tmux send-keys -t $SESSION_NAME:2 "echo '  • docker ps                    - Check running containers'" Enter
tmux send-keys -t $SESSION_NAME:2 "echo '  • docker logs <container>      - View container logs'" Enter
tmux send-keys -t $SESSION_NAME:2 "echo '  • yarn logs                    - View application logs'" Enter
tmux send-keys -t $SESSION_NAME:2 "echo '  • curl http://localhost:3040   - Test country config'" Enter
tmux send-keys -t $SESSION_NAME:2 "echo '  • curl http://localhost:7070   - Test gateway'" Enter
tmux send-keys -t $SESSION_NAME:2 "echo ''" Enter

# Set up the status line
tmux set-option -t $SESSION_NAME status-left-length 20
tmux set-option -t $SESSION_NAME status-left "#[fg=green][#S] "
tmux set-option -t $SESSION_NAME status-right "#[fg=yellow]%Y-%m-%d %H:%M"

# Select the dependencies window initially
tmux select-window -t $SESSION_NAME:0

# Verify session is running
echo ""
echo "🔍 Verifying tmux session..."
if tmux list-sessions | grep -q $SESSION_NAME; then
    echo "✅ Session '$SESSION_NAME' is running with windows:"
    tmux list-windows -t $SESSION_NAME
else
    echo "❌ Session '$SESSION_NAME' not found!"
    exit 1
fi

echo ""
echo "✅ OpenCRVS ATG Development Environment Started!"
echo ""
echo "📋 tmux Session: $SESSION_NAME"
echo "   • Window 0: Dependencies (📦) - yarn dev-atg --only-dependencies"
echo "   • Window 1: Services (⚙️)     - yarn dev-atg --only-service"
echo "   • Window 2: Monitor (📊)      - Command line for monitoring"
echo ""
echo "🔧 tmux Commands:"
echo "   • tmux attach -t $SESSION_NAME                - Attach to session"
echo "   • Ctrl+b then 0/1/2                          - Switch to window 0/1/2"
echo "   • Ctrl+b then d                              - Detach from session"
echo "   • tmux kill-session -t $SESSION_NAME          - Kill the session"
echo ""
echo "🌐 Expected Services (after startup):"
echo "   • Gateway:        http://localhost:7070"
echo "   • Client App:     http://localhost:3000"
echo "   • Country Config: http://localhost:3040"
echo "   • Auth Service:   http://localhost:4040"
echo "   • FHIR Server:    http://localhost:3447/fhir"
echo ""

# Give user options for how to proceed
echo "🔗 To attach to the tmux session, run:"
echo "   tmux attach -t $SESSION_NAME"
echo ""

# Option: Auto-attach or just show instructions
read -p "🚀 Attach to tmux session now? (Y/n): " -r ATTACH_RESPONSE
ATTACH_RESPONSE=${ATTACH_RESPONSE:-Y}

if [[ "$ATTACH_RESPONSE" =~ ^[Yy]$ ]]; then
    echo "🔗 Attaching to tmux session..."
    tmux attach -t $SESSION_NAME
else
    echo "✅ tmux session '$SESSION_NAME' is running in the background"
    echo "   Use: tmux attach -t $SESSION_NAME (when ready)"
fi