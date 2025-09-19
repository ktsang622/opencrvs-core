#!/bin/bash

# OpenCRVS ATG Development Environment Stopper
# This script stops all ATG development services and cleans up resources

set -e

SESSION_NAME="opencrvs-atg"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🛑 Stopping OpenCRVS ATG Development Environment"
echo "Working directory: $SCRIPT_DIR"

# Function to check if tmux session exists
session_exists() {
    tmux has-session -t $SESSION_NAME 2>/dev/null
}

# Function to show progress
show_progress() {
    local message="$1"
    echo "🔄 $message"
}

# Function to show completion
show_done() {
    local message="$1"
    echo "✅ $message"
}

# Step 1: Stop tmux session
if session_exists; then
    show_progress "Stopping tmux session: $SESSION_NAME"

    # Send Ctrl+C to all windows to gracefully stop processes
    echo "   • Sending interrupt signals to running processes..."
    tmux send-keys -t $SESSION_NAME:deps C-c 2>/dev/null || true
    tmux send-keys -t $SESSION_NAME:svc C-c 2>/dev/null || true

    # Wait a moment for graceful shutdown
    sleep 3

    # Kill the session
    tmux kill-session -t $SESSION_NAME
    show_done "tmux session stopped"
else
    echo "ℹ️  No tmux session '$SESSION_NAME' found"
fi

# Step 2: Stop Docker containers and dependencies
show_progress "Stopping Docker containers and dependencies"
if [ -f "package.json" ]; then
    # Use the compose:down:deps-atg command from package.json
    if npm run compose:down:deps-atg > /dev/null 2>&1; then
        show_done "Docker containers stopped successfully"
    else
        echo "⚠️  Warning: compose:down:deps-atg command failed or not found"

        # Fallback: Try to stop known containers manually
        echo "   • Attempting manual container cleanup..."

        # Stop OpenCRVS related containers
        docker stop $(docker ps -q --filter "name=opencrvs") 2>/dev/null || echo "     - No OpenCRVS containers running"
        docker stop $(docker ps -q --filter "name=mongo") 2>/dev/null || echo "     - No MongoDB containers running"
        docker stop $(docker ps -q --filter "name=redis") 2>/dev/null || echo "     - No Redis containers running"
        docker stop $(docker ps -q --filter "name=elastic") 2>/dev/null || echo "     - No Elasticsearch containers running"
        docker stop $(docker ps -q --filter "name=influx") 2>/dev/null || echo "     - No InfluxDB containers running"
        docker stop $(docker ps -q --filter "name=hearth") 2>/dev/null || echo "     - No Hearth containers running"

        show_done "Manual container cleanup completed"
    fi
else
    echo "⚠️  Warning: package.json not found in current directory"
    echo "   Make sure you're running this script from the OpenCRVS core directory"
fi

# Step 3: Clean up any remaining processes (optional)
show_progress "Checking for remaining Node.js processes"
ATG_PROCESSES=$(pgrep -f "(dev-atg|opencrvs)" | wc -l)
if [ "$ATG_PROCESSES" -gt 0 ]; then
    echo "⚠️  Found $ATG_PROCESSES OpenCRVS-related processes still running"
    echo "   • You may want to check these processes manually:"
    pgrep -f "(dev-atg|opencrvs)" | head -5 | xargs ps -p 2>/dev/null || true
    echo ""
    echo "   • To kill them manually: pkill -f 'dev-atg'"
else
    show_done "No remaining Node.js processes found"
fi

# Step 4: Show Docker status
show_progress "Checking Docker container status"
RUNNING_CONTAINERS=$(docker ps -q | wc -l)
if [ "$RUNNING_CONTAINERS" -eq 0 ]; then
    show_done "All Docker containers stopped"
else
    echo "ℹ️  $RUNNING_CONTAINERS Docker containers still running:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -10
fi

# Step 5: Clean up resources (optional)
echo ""
echo "🧹 Optional cleanup commands:"
echo "   • Remove stopped containers:     docker container prune -f"
echo "   • Remove unused images:          docker image prune -f"
echo "   • Remove unused volumes:         docker volume prune -f"
echo "   • Remove unused networks:        docker network prune -f"
echo ""
echo "💡 Run cleanup? (y/N): "
read -r CLEANUP_RESPONSE

if [[ "$CLEANUP_RESPONSE" =~ ^[Yy]$ ]]; then
    show_progress "Running Docker cleanup"
    docker container prune -f >/dev/null 2>&1 || true
    docker image prune -f >/dev/null 2>&1 || true
    docker volume prune -f >/dev/null 2>&1 || true
    docker network prune -f >/dev/null 2>&1 || true
    show_done "Docker cleanup completed"
fi

# Step 6: Final status
echo ""
echo "🎯 OpenCRVS ATG Development Environment Status:"
echo "   • tmux session:     $(if session_exists; then echo "❌ Still running"; else echo "✅ Stopped"; fi)"
echo "   • Docker containers: $(docker ps -q | wc -l) running"
echo "   • Node processes:   $(pgrep -f "(dev-atg|opencrvs)" | wc -l) found"

echo ""
echo "✨ Stop operation completed!"
echo ""
echo "📋 Quick reference:"
echo "   • Check running containers:    docker ps"
echo "   • Check tmux sessions:         tmux list-sessions"
echo "   • Kill remaining processes:    pkill -f 'dev-atg'"
echo "   • Start environment again:     ./start_dev_atg.sh"
echo ""