#!/bin/bash

# OpenCRVS ATG Development Environment Starter with tmux
# This script starts the dependencies and services in separate tmux panes

set -e

SESSION_NAME="opencrvs-atg"

# Function to check if tmux session exists
session_exists() {
    tmux has-session -t $SESSION_NAME 2>/dev/null
}

# Function to cleanup on exit (only on error)
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "🧹 Cleaning up due to error..."
        if session_exists; then
            tmux kill-session -t $SESSION_NAME
        fi
    fi
}

# Set up trap for cleanup only on error
trap cleanup ERR

echo "🚀 Starting OpenCRVS ATG Development Environment with tmux"
echo "Session: $SESSION_NAME"

# Kill existing session if it exists
if session_exists; then
    echo "🔄 Killing existing session: $SESSION_NAME"
    tmux kill-session -t $SESSION_NAME
fi

# Create new tmux session with first window for dependencies
echo "📦 Creating tmux session and starting dependencies..."
if tmux new-session -d -s $SESSION_NAME -n "deps" -c "$PWD"; then
    echo "✅ tmux session '$SESSION_NAME' created successfully"
else
    echo "❌ Failed to create tmux session '$SESSION_NAME'"
    exit 1
fi

# Run dependencies in the first pane
echo "🔧 Setting up dependencies window..."
sleep 1
tmux send-keys -t $SESSION_NAME:deps "echo '📦 Starting OpenCRVS Dependencies...'" Enter
tmux send-keys -t $SESSION_NAME:deps "yarn dev-atg --only-dependencies" Enter

# Create second window for services
echo "⚙️ Creating services window..."
if tmux new-window -t $SESSION_NAME -n "svc" -c "$PWD"; then
    echo "✅ Services window created"
else
    echo "❌ Failed to create services window"
    exit 1
fi
sleep 1

# Wait a moment for dependencies to start
tmux send-keys -t $SESSION_NAME:svc "echo '⏳ Waiting for dependencies to initialize...'" Enter
tmux send-keys -t $SESSION_NAME:svc "sleep 30" Enter
tmux send-keys -t $SESSION_NAME:svc "echo '⚙️ Starting OpenCRVS Services...'" Enter
tmux send-keys -t $SESSION_NAME:svc "yarn dev-atg --only-service" Enter

# Create a third window for monitoring/logs (optional)
echo "📊 Creating monitor window..."
if tmux new-window -t $SESSION_NAME -n "mon" -c "$PWD"; then
    echo "✅ Monitor window created"
else
    echo "❌ Failed to create monitor window"
    exit 1
fi
sleep 1

tmux send-keys -t $SESSION_NAME:mon "echo '📊 OpenCRVS ATG Monitor Window'" Enter
tmux send-keys -t $SESSION_NAME:mon "echo 'Use this window to run commands, check logs, etc.'" Enter
tmux send-keys -t $SESSION_NAME:mon "echo ''" Enter
tmux send-keys -t $SESSION_NAME:mon "echo 'Useful commands:'" Enter
tmux send-keys -t $SESSION_NAME:mon "echo '  • docker ps                    - Check running containers'" Enter
tmux send-keys -t $SESSION_NAME:mon "echo '  • docker logs <container>      - View container logs'" Enter
tmux send-keys -t $SESSION_NAME:mon "echo '  • yarn logs                    - View application logs'" Enter
tmux send-keys -t $SESSION_NAME:mon "echo '  • curl http://localhost:3040   - Test country config'" Enter
tmux send-keys -t $SESSION_NAME:mon "echo '  • curl http://localhost:7070   - Test gateway'" Enter
tmux send-keys -t $SESSION_NAME:mon "echo ''" Enter

# Set up the status line to show which window is which
tmux set-option -t $SESSION_NAME status-left-length 20
tmux set-option -t $SESSION_NAME status-left "#[fg=green][#S] "
tmux set-option -t $SESSION_NAME status-right "#[fg=yellow]%Y-%m-%d %H:%M"

# Set window names to be more descriptive
tmux rename-window -t $SESSION_NAME:deps "📦 Dependencies"
tmux rename-window -t $SESSION_NAME:svc "⚙️ Services"
tmux rename-window -t $SESSION_NAME:mon "📊 Monitor"

# Select the dependencies window initially
tmux select-window -t $SESSION_NAME:deps

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
echo "   • Window 1: Dependencies (📦) - yarn dev-atg --only-dependencies"
echo "   • Window 2: Services (⚙️)     - yarn dev-atg --only-service"
echo "   • Window 3: Monitor (📊)      - Command line for monitoring"
echo ""
echo "🔧 tmux Commands:"
echo "   • tmux attach -t $SESSION_NAME                - Attach to session"
echo "   • tmux list-sessions                          - List all sessions"
echo "   • Ctrl+b then c                              - Create new window"
echo "   • Ctrl+b then n/p                            - Next/Previous window"
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
echo "📝 To attach to the session and monitor startup:"
echo "   tmux attach -t $SESSION_NAME"
echo ""

# Give user options for how to proceed
echo "🔗 To attach to the tmux session, run:"
echo "   tmux attach -t $SESSION_NAME"
echo ""
echo "🔍 To check session status:"
echo "   tmux list-sessions"
echo ""
echo "📋 Window navigation (once attached):"
echo "   • Ctrl+b then 0  - Dependencies window"
echo "   • Ctrl+b then 1  - Services window"
echo "   • Ctrl+b then 2  - Monitor window"
echo "   • Ctrl+b then d  - Detach from session"
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