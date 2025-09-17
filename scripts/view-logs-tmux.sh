#!/bin/bash

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# OpenCRVS is also distributed under the terms of the Civil Registration
# & Healthcare Disclaimer located at http://opencrvs.org/license.
#
# Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
TMUX_SESSION="opencrvs-logs"
COMPOSE_PROJECT="opencrvs"
COMPOSE_FILES="-f toppan-deps.yml -f toppan-base.yml -f toppan-override.yml"
EXTERNAL_DIR="../opensearch"

# Service grouping strategies
declare -A STRATEGY_FUNCTIONAL=(
    ["core-apis"]="auth gateway user-mgnt config countryconfig"
    ["business"]="workflow events search metrics documents webhooks notification"
    ["frontend"]="client login toppan toppan-service toppan-ui"
    ["infrastructure"]="mongo1 redis elasticsearch influxdb hearth minio migration"
)

declare -A STRATEGY_LAYER=(
    ["api-layer"]="auth gateway user-mgnt config countryconfig"
    ["data-layer"]="search metrics documents events workflow webhooks"
    ["ui-layer"]="client login toppan-ui"
    ["service-layer"]="toppan toppan-service notification"
    ["infra-layer"]="mongo1 redis elasticsearch influxdb hearth minio migration"
)

declare -A STRATEGY_CRITICALITY=(
    ["critical-path"]="auth gateway config countryconfig client"
    ["core-business"]="user-mgnt workflow events search documents"
    ["supporting"]="metrics webhooks notification toppan toppan-service"
    ["ui-extras"]="login toppan-ui"
    ["infrastructure"]="mongo1 redis elasticsearch influxdb hearth minio migration"
)

declare -A STRATEGY_MINIMAL=(
    ["essentials"]="auth gateway config countryconfig client workflow"
    ["toppan-stack"]="toppan toppan-service toppan-ui"
    ["everything-else"]="user-mgnt events search metrics documents webhooks notification login migration mongo1 redis elasticsearch influxdb hearth minio"
)

# External services (in opensearch directory)
EXTERNAL_SERVICES="postgres opensearch opensearch-dashboards"

# Parse command line arguments
FILTER_GROUP=""
NO_EXTERNAL=false
TAIL_LINES=50
STRATEGY=""
INTERACTIVE=false

print_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "OpenCRVS Log Viewer with Tmux - Grouped Service Logs"
    echo ""
    echo "Options:"
    echo "  --strategy, -s STRATEGY   Grouping strategy (functional|layer|criticality|minimal)"
    echo "  --group, -g GROUP         Show only specific group from chosen strategy"
    echo "  --interactive, -i         Interactive strategy and group selection"
    echo "  --no-external             Skip external services (postgres, opensearch)"
    echo "  --tail N                  Number of log lines to show initially (default: 50)"
    echo "  --help, -h                Show this help message"
    echo ""
    echo "Grouping Strategies:"
    echo "  functional:  core-apis, business, frontend, infrastructure"
    echo "  layer:       api-layer, data-layer, ui-layer, service-layer, infra-layer"
    echo "  criticality: critical-path, core-business, supporting, ui-extras, infrastructure"
    echo "  minimal:     essentials, toppan-stack, everything-else"
    echo ""
    echo "Tmux Navigation:"
    echo "  Ctrl+b then n/p      # Next/Previous tab"
    echo "  Ctrl+b then 1,2,3,4  # Jump to specific tab"
    echo "  Ctrl+b then [        # Scroll mode (q to exit)"
    echo "  Ctrl+b then d        # Detach from session"
    echo "  Ctrl+b then :        # Command mode"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Interactive mode - choose strategy/groups"
    echo "  $0 --strategy functional              # Use functional grouping (default)"
    echo "  $0 --strategy layer --group api-layer # Only API layer services"
    echo "  $0 --strategy minimal                 # Minimal 3-tab view"
    echo "  $0 --interactive                      # Force interactive selection"
    echo "  $0 --no-external --tail 100           # Skip external, more history"
    echo ""
    echo "Management:"
    echo "  tmux attach -t $TMUX_SESSION           # Reattach to existing session"
    echo "  tmux kill-session -t $TMUX_SESSION     # Kill log viewer session"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --strategy|-s)
            STRATEGY="$2"
            shift 2
            ;;
        --group|-g)
            FILTER_GROUP="$2"
            shift 2
            ;;
        --interactive|-i)
            INTERACTIVE=true
            shift
            ;;
        --no-external)
            NO_EXTERNAL=true
            shift
            ;;
        --tail)
            TAIL_LINES="$2"
            shift 2
            ;;
        --help|-h)
            print_help
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            print_help
            exit 1
            ;;
    esac
done

# Interactive selection function
interactive_selection() {
    echo -e "${CYAN}🎯 OpenCRVS Log Viewer - Interactive Mode${NC}"
    echo ""

    # Strategy selection
    echo -e "${YELLOW}Choose a grouping strategy:${NC}"
    echo "  1) Functional    - Group by service function (APIs, Business, Frontend, Infrastructure)"
    echo "  2) Layer         - Group by architectural layer (API, Data, UI, Service, Infrastructure)"
    echo "  3) Criticality   - Group by importance (Critical Path, Core Business, Supporting, etc.)"
    echo "  4) Minimal       - Simple 3-tab view (Essentials, Toppan, Everything Else)"
    echo ""

    while true; do
        read -p "Select strategy (1-4): " strategy_choice
        case $strategy_choice in
            1) STRATEGY="functional"; break ;;
            2) STRATEGY="layer"; break ;;
            3) STRATEGY="criticality"; break ;;
            4) STRATEGY="minimal"; break ;;
            *) echo -e "${RED}Invalid choice. Please select 1-4.${NC}" ;;
        esac
    done

    echo -e "${GREEN}Selected: $STRATEGY${NC}"
    echo ""

    # Get available groups for selected strategy
    local -n strategy_ref="STRATEGY_${STRATEGY^^}"
    local groups=(${!strategy_ref[@]})

    # Group selection
    echo -e "${YELLOW}Choose groups to display:${NC}"
    echo "  0) All groups"
    for i in "${!groups[@]}"; do
        local group=${groups[$i]}
        local services=${strategy_ref[$group]}
        echo "  $((i+1))) $group: $(echo $services | tr ' ' ', ')"
    done
    echo ""

    while true; do
        read -p "Select group (0-${#groups[@]}): " group_choice
        if [[ $group_choice =~ ^[0-9]+$ ]] && [ $group_choice -ge 0 ] && [ $group_choice -le ${#groups[@]} ]; then
            if [ $group_choice -eq 0 ]; then
                FILTER_GROUP=""
                echo -e "${GREEN}Selected: All groups${NC}"
            else
                FILTER_GROUP=${groups[$((group_choice-1))]}
                echo -e "${GREEN}Selected: $FILTER_GROUP${NC}"
            fi
            break
        else
            echo -e "${RED}Invalid choice. Please select 0-${#groups[@]}.${NC}"
        fi
    done

    echo ""

    # External services option
    if [ -d "$EXTERNAL_DIR" ]; then
        read -p "Include external services (postgres, opensearch)? [Y/n]: " include_external
        case $include_external in
            [Nn]* ) NO_EXTERNAL=true ;;
            * ) NO_EXTERNAL=false ;;
        esac
    fi

    echo ""
}

# Check if tmux is installed first
if ! command -v tmux &> /dev/null; then
    echo -e "${RED}❌ tmux is not installed. Please install tmux first:${NC}"
    echo "  Ubuntu/Debian: sudo apt-get install tmux"
    echo "  macOS: brew install tmux"
    exit 1
fi

# Early service check (before interactive mode to avoid wasting user's time)
echo -e "${YELLOW}🔍 Checking running services...${NC}"
RUNNING_CONTAINERS=$(docker ps --format "{{.Names}}" 2>/dev/null | grep "^opencrvs-" | sed 's/^opencrvs-//' || echo "")

if [ -z "$RUNNING_CONTAINERS" ]; then
    echo -e "${RED}❌ No OpenCRVS services are running${NC}"
    echo -e "${BLUE}💡 Start services first:${NC}"
    echo "    ./scripts/start-complete-stack.sh"
    echo "    # or"
    echo "    ./scripts/start-docker.sh"
    echo ""
    echo -e "${YELLOW}Note: Run this script after starting your services.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found running services:${NC}"
echo "$RUNNING_CONTAINERS" | tr '\n' ' '
echo ""

# Store for later use
RUNNING_SERVICES="$RUNNING_CONTAINERS"

# Apply interactive mode or set defaults
if [ "$INTERACTIVE" = true ] || ([ -z "$STRATEGY" ] && [ -z "$FILTER_GROUP" ]); then
    interactive_selection
fi

# Set default strategy if not specified
if [ -z "$STRATEGY" ]; then
    STRATEGY="functional"
fi

# Get the selected strategy groups
declare -n SELECTED_STRATEGY="STRATEGY_${STRATEGY^^}"

# Validate group filter
if [ -n "$FILTER_GROUP" ] && [ "$FILTER_GROUP" != "external" ]; then
    if [[ ! " ${!SELECTED_STRATEGY[@]} " =~ " ${FILTER_GROUP} " ]]; then
        echo -e "${RED}❌ Invalid group: $FILTER_GROUP${NC}"
        echo -e "${BLUE}Available groups for $STRATEGY strategy: ${!SELECTED_STRATEGY[@]} external${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}🔍 OpenCRVS Tmux Log Viewer${NC}"
echo -e "${BLUE}Strategy: ${STRATEGY}${NC}"
echo -e "${BLUE}Session: ${TMUX_SESSION}${NC}"
if [ -n "$FILTER_GROUP" ]; then
    echo -e "${BLUE}Filter: ${FILTER_GROUP}${NC}"
fi
echo ""

# Function to get list of running services (used by filter functions)
get_running_services() {
    docker ps --format "{{.Names}}" 2>/dev/null | grep "^opencrvs-" | sed 's/^opencrvs-//' || echo ""
}

# Function to filter services to only include running ones
filter_running_services() {
    local service_list="$1"
    local running_services="$2"
    local filtered=""

    for service in $service_list; do
        if echo "$running_services" | grep -q "^${service}$"; then
            filtered="$filtered $service"
        fi
    done

    echo "$filtered" | sed 's/^ *//'
}

# Function to warn about missing services
warn_missing_services() {
    local requested_services="$1"
    local running_services="$2"
    local missing=""

    for service in $requested_services; do
        if ! echo "$running_services" | grep -q "^${service}$"; then
            missing="$missing $service"
        fi
    done

    if [ -n "$missing" ]; then
        echo -e "${YELLOW}⚠️  Some services are not running and will be skipped:${NC}"
        echo "   Missing:$missing"
        echo ""
    fi
}


# Function to suggest recovery actions
suggest_recovery() {
    local missing_count=$1
    local total_count=$2

    if [ $missing_count -gt 0 ]; then
        echo -e "${YELLOW}💡 Recovery options:${NC}"
        if [ $missing_count -eq $total_count ]; then
            echo "   • Start all services: ./scripts/start-complete-stack.sh"
        else
            echo "   • Start missing services: docker compose -p $COMPOSE_PROJECT $COMPOSE_FILES up -d [service-name]"
            echo "   • Restart all services: docker compose -p $COMPOSE_PROJECT $COMPOSE_FILES restart"
            echo "   • Check service status: docker compose -p $COMPOSE_PROJECT ps"
        fi
        echo ""

        read -p "Continue with available services? [Y/n]: " continue_choice
        case $continue_choice in
            [Nn]* )
                echo "Exiting. Start your services and try again."
                exit 0
                ;;
            * )
                echo "Continuing with available services..."
                echo ""
                ;;
        esac
    fi
}

# Count total services in selected strategy
TOTAL_SERVICES=0
MISSING_SERVICES=0
for group in "${!SELECTED_STRATEGY[@]}"; do
    group_services="${SELECTED_STRATEGY[$group]}"
    for service in $group_services; do
        TOTAL_SERVICES=$((TOTAL_SERVICES + 1))
        if ! echo "$RUNNING_SERVICES" | grep -q "^${service}$"; then
            MISSING_SERVICES=$((MISSING_SERVICES + 1))
        fi
    done
done

# Services already checked earlier - just validate strategy coverage

# Count total services in selected strategy and suggest recovery if needed
TOTAL_SERVICES=0
MISSING_SERVICES=0
for group in "${!SELECTED_STRATEGY[@]}"; do
    group_services="${SELECTED_STRATEGY[$group]}"
    for service in $group_services; do
        TOTAL_SERVICES=$((TOTAL_SERVICES + 1))
        if ! echo "$RUNNING_SERVICES" | grep -q "^${service}$"; then
            MISSING_SERVICES=$((MISSING_SERVICES + 1))
        fi
    done
done

# Suggest recovery if many services are missing
if [ $MISSING_SERVICES -gt $((TOTAL_SERVICES / 2)) ]; then
    suggest_recovery $MISSING_SERVICES $TOTAL_SERVICES
fi

# Kill existing session if it exists
tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true

# Create new session
echo -e "${BLUE}🔨 Creating tmux session: $TMUX_SESSION${NC}"
tmux new-session -d -s "$TMUX_SESSION"

# Function to create a tab for a service group
create_service_group_tab() {
    local group_name=$1
    local services=$2
    local tab_index=$3

    # Filter services to only include running ones
    local filtered_services
    if [ "$group_name" = "external" ]; then
        # For external services, check if they're running in the opensearch directory
        local external_running=$(cd "$EXTERNAL_DIR" && docker compose ps --format "{{.Service}}" 2>/dev/null | tr '\n' ' ' || echo "")
        filtered_services=$(filter_running_services "$services" "$external_running")
    else
        filtered_services=$(filter_running_services "$services" "$RUNNING_SERVICES")
    fi

    # Warn about missing services
    warn_missing_services "$services" "$RUNNING_SERVICES"

    # Convert filtered services to array
    local service_array=($filtered_services)
    local service_count=${#service_array[@]}

    if [ $service_count -eq 0 ]; then
        echo -e "${YELLOW}⚠️  No running services found for group '$group_name', skipping tab${NC}"
        return
    fi

    # Create or select window
    if [ $tab_index -eq 0 ]; then
        tmux rename-window -t "$TMUX_SESSION:0" "$group_name"
        local window_name="$TMUX_SESSION:0"
    else
        tmux new-window -t "$TMUX_SESSION" -n "$group_name"
        local window_name="$TMUX_SESSION:$group_name"
    fi

    # Set up initial pane
    local first_service=${service_array[0]}
    echo -e "${CYAN}   Adding ${first_service} to ${group_name} tab${NC}"

    if [ "$group_name" = "external" ]; then
        # External services use different compose project
        tmux send-keys -t "$window_name" "cd $EXTERNAL_DIR && docker compose logs -f --tail $TAIL_LINES $first_service 2>/dev/null || echo 'Service $first_service not available'" C-m
    else
        tmux send-keys -t "$window_name" "docker compose -p $COMPOSE_PROJECT $COMPOSE_FILES logs -f --tail $TAIL_LINES $first_service 2>/dev/null || echo 'Service $first_service not available'" C-m
    fi

    # Add remaining services in split panes
    for ((i=1; i<service_count; i++)); do
        local service=${service_array[$i]}
        echo -e "${CYAN}   Adding ${service} to ${group_name} tab${NC}"

        if [ $i -eq 1 ]; then
            # First split - vertical
            tmux split-window -t "$window_name" -h
        else
            # Subsequent splits - cycle between horizontal and vertical
            if [ $((i % 2)) -eq 0 ]; then
                tmux split-window -t "$window_name" -v
            else
                tmux split-window -t "$window_name" -h
            fi
        fi

        if [ "$group_name" = "external" ]; then
            tmux send-keys -t "$window_name" "cd $EXTERNAL_DIR && docker compose logs -f --tail $TAIL_LINES $service 2>/dev/null || echo 'Service $service not available'" C-m
        else
            tmux send-keys -t "$window_name" "docker compose -p $COMPOSE_PROJECT $COMPOSE_FILES logs -f --tail $TAIL_LINES $service 2>/dev/null || echo 'Service $service not available'" C-m
        fi

        # Balance the layout every few panes
        if [ $((i % 4)) -eq 0 ]; then
            tmux select-layout -t "$window_name" tiled
        fi
    done

    # Final layout adjustment
    tmux select-layout -t "$window_name" tiled
}

# Create tabs for service groups
tab_index=0

# Handle filtered group view
if [ -n "$FILTER_GROUP" ]; then
    if [ "$FILTER_GROUP" = "external" ]; then
        if [ "$NO_EXTERNAL" = false ] && [ -d "$EXTERNAL_DIR" ]; then
            echo -e "${YELLOW}📋 Creating tab: external${NC}"
            create_service_group_tab "external" "$EXTERNAL_SERVICES" $tab_index
        fi
    else
        echo -e "${YELLOW}📋 Creating tab: $FILTER_GROUP${NC}"
        create_service_group_tab "$FILTER_GROUP" "${SELECTED_STRATEGY[$FILTER_GROUP]}" $tab_index
    fi
else
    # Create all tabs for selected strategy
    for group in "${!SELECTED_STRATEGY[@]}"; do
        echo -e "${YELLOW}📋 Creating tab: $group${NC}"
        create_service_group_tab "$group" "${SELECTED_STRATEGY[$group]}" $tab_index
        tab_index=$((tab_index + 1))
    done

    # Add external services tab if not skipped
    if [ "$NO_EXTERNAL" = false ] && [ -d "$EXTERNAL_DIR" ]; then
        echo -e "${YELLOW}📋 Creating tab: external${NC}"
        create_service_group_tab "external" "$EXTERNAL_SERVICES" $tab_index
    fi
fi

# Add a status/control tab
if [ -z "$FILTER_GROUP" ]; then
    tmux new-window -t "$TMUX_SESSION" -n "control"
    tmux send-keys -t "$TMUX_SESSION:control" "echo 'OpenCRVS Log Viewer Control Panel'" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo ''" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo 'Available commands:'" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo '  docker compose -p $COMPOSE_PROJECT ps                    # List running services'" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo '  docker compose -p $COMPOSE_PROJECT restart <service>    # Restart a service'" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo '  docker compose -p $COMPOSE_PROJECT logs <service>       # View specific service logs'" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo ''" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo 'Navigation: Ctrl+b then 1,2,3,4 to switch tabs'" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo 'Exit: Ctrl+b then d (detach) or Ctrl+c then exit'" C-m
    tmux send-keys -t "$TMUX_SESSION:control" "echo ''" C-m
fi

# Select first tab
tmux select-window -t "$TMUX_SESSION:0"

echo ""
echo -e "${GREEN}🎉 Tmux log viewer started successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Tmux Controls:${NC}"
echo "  Ctrl+b then n/p      # Next/Previous tab"
echo "  Ctrl+b then 1,2,3,4  # Jump to specific tab"
echo "  Ctrl+b then [        # Scroll mode (q to exit)"
echo "  Ctrl+b then d        # Detach from session"
echo ""
echo -e "${BLUE}🔄 Reconnect later:${NC}"
echo "  tmux attach -t $TMUX_SESSION"
echo ""
echo -e "${BLUE}🛑 Stop log viewer:${NC}"
echo "  tmux kill-session -t $TMUX_SESSION"
echo ""
echo -e "${BLUE}Attaching to session...${NC}"

# Attach to the session
tmux attach-session -t "$TMUX_SESSION"