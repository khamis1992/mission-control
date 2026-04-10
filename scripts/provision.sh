#!/usr/bin/env bash
# Mission Control — Pre-Provisioning Script
# Runs during install and on first startup to pre-configure skills, agents, and settings.
#
# Usage:
#   bash scripts/provision.sh [--force] [--skills-only] [--agents-only] [--settings-only]
#
# This script ensures Mission Control is ready to use immediately after installation.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
FORCE=false
SKILLS_ONLY=false
AGENTS_ONLY=false
SETTINGS_ONLY=false
SKIP_OPENCLAW=false
MC_SKILLS_SOURCE="${MC_SKILLS_SOURCE:-$(pwd)/bundle/skills}"
MC_DATA_DIR="${MC_DATA_DIR:-$(pwd)/.data}"
MC_HOME="${MC_HOME:-$HOME}"

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)          FORCE=true; shift ;;
    --skills-only)    SKILLS_ONLY=true; shift ;;
    --agents-only)    AGENTS_ONLY=true; shift ;;
    --settings-only)  SETTINGS_ONLY=true; shift ;;
    --skip-openclaw)  SKIP_OPENCLAW=true; shift ;;
    -h|--help)
      echo "Usage: provision.sh [--force] [--skills-only] [--agents-only] [--settings-only] [--skip-openclaw]"
      echo ""
      echo "Options:"
      echo "  --force         Run even if already provisioned"
      echo "  --skills-only   Only provision skills"
      echo "  --agents-only   Only provision agents"
      echo "  --settings-only Only provision default settings"
      echo "  --skip-openclaw Skip OpenClaw-specific provisioning"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo -e "\033[1;34m[MC Provision]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[!!]\033[0m $*"; }
err()   { echo -e "\033[1;31m[ERR]\033[0m $*" >&2; }
die()   { err "$*"; exit 1; }

command_exists() { command -v "$1" &>/dev/null; }

# ── Check if already provisioned ───────────────────────────────────────────────
PROVISION_FLAG="${MC_DATA_DIR}/.provisioned"
is_already_provisioned() {
  [[ -f "$PROVISION_FLAG" ]] && [[ "$FORCE" != "true" ]]
}

mark_provisioned() {
  mkdir -p "$MC_DATA_DIR"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$PROVISION_FLAG"
  ok "Marked as provisioned"
}

# ── Skill Provisioning ────────────────────────────────────────────────────────
provision_skills() {
  info "Provisioning skills..."

  # Determine skill roots based on deployment mode
  local user_agents_skills="$MC_HOME/.agents/skills"
  local user_codex_skills="$MC_HOME/.codex/skills"
  local openclaw_skills="$MC_HOME/.openclaw/skills"
  local project_skills="$(pwd)/.agents/skills"

  # Create skill directories
  local skill_roots=(
    "$user_agents_skills"
    "$user_codex_skills"
    "$openclaw_skills"
  )

  # Add project skills if in project directory
  if [[ -d "$(pwd)" ]] && [[ -f "$(pwd)/package.json" ]]; then
    skill_roots+=("$project_skills")
  fi

  # Copy bundled skills to each root
  local bundled_skills="$MC_SKILLS_SOURCE"
  if [[ ! -d "$bundled_skills" ]]; then
    warn "Bundle skills directory not found: $bundled_skills"
    warn "Skipping skill provisioning"
    return 0
  fi

  local skills_copied=0
  for skill_root in "${skill_roots[@]}"; do
    if [[ -d "$skill_root" ]]; then
      # Copy each skill from bundle (but don't overwrite existing)
      for skill_dir in "$bundled_skills"/*/; do
        if [[ -d "$skill_dir" ]]; then
          local skill_name
          skill_name=$(basename "$skill_dir")
          local target_dir="$skill_root/$skill_name"
          
          if [[ ! -d "$target_dir" ]]; then
            mkdir -p "$(dirname "$target_dir")"
            cp -r "$skill_dir" "$target_dir"
            ((skills_copied++))
          fi
        fi
      done
    fi
  done

  if [[ $skills_copied -gt 0 ]]; then
    ok "Copied $skills_copied bundled skill(s)"
  else
    info "No new skills to copy (all already exist or no skill roots found)"
  fi

  # Set permissions on skill directories
  for skill_root in "${skill_roots[@]}"; do
    if [[ -d "$skill_root" ]]; then
      chmod -R u+rwX "$skill_root" 2>/dev/null || true
    fi
  done

  ok "Skills provisioning complete"
}

# ── Agent Provisioning ────────────────────────────────────────────────────────
provision_agents() {
  info "Provisioning default agents..."

  local mc_url="${MC_URL:-http://localhost:3000}"
  local api_key="${MC_API_KEY:-}"

  # Wait for Mission Control to be ready (if running)
  if ! curl -sf "$mc_url/login" &>/dev/null; then
    warn "Mission Control is not running at $mc_url"
    warn "Skipping agent registration (will be retried on next startup)"
    return 0
  fi

  # Check if we have an API key
  if [[ -z "$api_key" ]]; then
    # Try to get from .env
    if [[ -f "$(pwd)/.env" ]]; then
      api_key=$(grep "^API_KEY=" "$(pwd)/.env" | cut -d'=' -f2- | tr -d '"' || echo "")
    fi
  fi

  if [[ -z "$api_key" ]]; then
    warn "No API key found for agent registration"
    warn "Set MC_API_KEY environment variable or ensure .env exists"
    return 0
  fi

  # Register default system agent
  local system_agent='{
    "name": "system",
    "type": "openclaw",
    "role": "system",
    "description": "System management agent for infrastructure tasks",
    "enabled": true
  }'

  # Register research agent
  local research_agent='{
    "name": "researcher",
    "type": "openclaw",
    "role": "researcher",
    "description": "Research agent for web search and information gathering",
    "enabled": true
  }'

  # Register coding agent
  local coding_agent='{
    "name": "coder",
    "type": "openclaw",
    "role": "coder",
    "description": "Coding agent for software development tasks",
    "enabled": true
  }'

  # Register reviewer agent
  local reviewer_agent='{
    "name": "reviewer",
    "type": "openclaw",
    "role": "reviewer",
    "description": "Quality review agent for code and task review",
    "enabled": true
  }'

  local agents_registered=0
  for agent_json in "$system_agent" "$research_agent" "$coding_agent" "$reviewer_agent"; do
    local agent_name
    agent_name=$(echo "$agent_json" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    
    # Check if agent already exists
    local existing
    existing=$(curl -sf -H "x-api-key: $api_key" \
      "$mc_url/api/agents?name=$agent_name" 2>/dev/null | \
      grep -c "\"name\":\"$agent_name\"" || echo "0")
    
    if [[ "$existing" -eq "0" ]]; then
      local response
      if response=$(curl -sf -X POST -H "x-api-key: $api_key" \
        -H "Content-Type: application/json" \
        -d "$agent_json" \
        "$mc_url/api/agents" 2>/dev/null); then
        ((agents_registered++))
      fi
    fi
  done

  if [[ $agents_registered -gt 0 ]]; then
    ok "Registered $agents_registered default agent(s)"
  else
    info "No new agents to register (all already exist)"
  fi

  ok "Agent provisioning complete"
}

# ── Settings Provisioning ──────────────────────────────────────────────────────
provision_settings() {
  info "Provisioning default settings..."

  local mc_url="${MC_URL:-http://localhost:3000}"
  local api_key="${MC_API_KEY:-}"

  # Check if we have an API key
  if [[ -z "$api_key" ]]; then
    if [[ -f "$(pwd)/.env" ]]; then
      api_key=$(grep "^API_KEY=" "$(pwd)/.env" | cut -d'=' -f2- | tr -d '"' || echo "")
    fi
  fi

  if [[ -z "$api_key" ]]; then
    warn "No API key found for settings configuration"
    warn "Settings will use defaults"
    return 0
  fi

  # Default settings to configure
  local settings='{
    "general.auto_backup": "true",
    "general.auto_cleanup": "true",
    "general.backup_retention_count": "10",
    "general.agent_timeout_minutes": "10",
    "general.skill_sync": "true",
    "general.local_agent_sync": "true",
    "general.gateway_agent_sync": "true",
    "general.task_dispatch": "true",
    "general.aegis_review": "true",
    "general.recurring_task_spawn": "true",
    "general.stale_task_requeue": "true",
    "general.recovery_orchestration": "true",
    "general.parallel_dispatch": "true",
    "general.claude_session_scan": "true",
    "security.hook_profile": "standard",
    "security.trust_score_threshold": "50",
    "security.secret_detection": "true",
    "webhooks.retry_enabled": "true",
    "webhooks.max_retries": "3"
  }'

  # Note: Settings are stored in the database and managed through the UI
  # This section provides defaults that can be applied on first run

  # Create default settings file for reference
  local settings_file="${MC_DATA_DIR}/default-settings.json"
  mkdir -p "$(dirname "$settings_file")"
  echo "$settings" > "$settings_file"

  ok "Settings provisioning complete (defaults written to $settings_file)"
}

# ── OpenClaw Provisioning ─────────────────────────────────────────────────────
provision_openclaw() {
  if [[ "$SKIP_OPENCLAW" == "true" ]]; then
    info "Skipping OpenClaw provisioning (--skip-openclaw)"
    return 0
  fi

  info "Provisioning OpenClaw integration..."

  local openclaw_home="${OPENCLAW_HOME:-$MC_HOME/.openclaw}"
  local openclaw_skills="$openclaw_home/skills"

  # Create OpenClaw skills directory
  if [[ ! -d "$openclaw_skills" ]]; then
    mkdir -p "$openclaw_skills"
    ok "Created OpenClaw skills directory: $openclaw_skills"
  fi

  # Copy bundled skills to OpenClaw
  local bundled_skills="$MC_SKILLS_SOURCE"
  if [[ -d "$bundled_skills" ]]; then
    local skills_copied=0
    for skill_dir in "$bundled_skills"/*/; do
      if [[ -d "$skill_dir" ]]; then
        local skill_name
        skill_name=$(basename "$skill_dir")
        local target_dir="$openclaw_skills/$skill_name"
        
        if [[ ! -d "$target_dir" ]]; then
          cp -r "$skill_dir" "$target_dir"
          ((skills_copied++))
        fi
      fi
    done
    if [[ $skills_copied -gt 0 ]]; then
      ok "Copied $skills_copied skill(s) to OpenClaw skills directory"
    fi
  fi

  # Create default OpenClaw workspace if it doesn't exist
  local openclaw_workspace="$openclaw_home/workspace"
  if [[ ! -d "$openclaw_workspace" ]]; then
    mkdir -p "$openclaw_workspace"
    ok "Created OpenClaw workspace directory: $openclaw_workspace"
  fi

  ok "OpenClaw provisioning complete"
}

# ── First-Run Initialization ───────────────────────────────────────────────────
first_run_init() {
  info "Running first-run initialization..."

  # This runs when Mission Control starts for the first time
  # It triggers skill sync and other first-run tasks

  local mc_url="${MC_URL:-http://localhost:3000}"
  local api_key="${MC_API_KEY:-}"

  # Get API key from .env if not set
  if [[ -z "$api_key" ]] && [[ -f "$(pwd)/.env" ]]; then
    api_key=$(grep "^API_KEY=" "$(pwd)/.env" | cut -d'=' -f2- | tr -d '"' || echo "")
  fi

  # Trigger skill sync via API if available
  if [[ -n "$api_key" ]] && curl -sf "$mc_url/api/status" &>/dev/null; then
    info "Triggering skill sync..."
    curl -sf -X POST -H "x-api-key: $api_key" \
      "$mc_url/api/tasks/trigger?task=skill_sync" &>/dev/null || true
  fi

  ok "First-run initialization complete"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║   Mission Control Provisioning           ║"
  echo "  ║   Pre-configure skills, agents, settings ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo ""

  # Check if already provisioned (unless --force)
  if is_already_provisioned; then
    info "Already provisioned (use --force to re-provision)"
    if [[ "$FORCE" == "true" ]]; then
      info "Re-provisioning due to --force flag..."
    else
      echo ""
      info "To manually trigger provisioning, run:"
      info "  bash scripts/provision.sh --force"
      echo ""
      return 0
    fi
  fi

  # Ensure MC_DATA_DIR exists
  mkdir -p "$MC_DATA_DIR"

  # Run provisioning tasks
  if [[ "$SKILLS_ONLY" == "false" ]]; then
    provision_skills
    echo ""
  fi

  if [[ "$AGENTS_ONLY" == "false" ]]; then
    provision_agents
    echo ""
  fi

  if [[ "$SETTINGS_ONLY" == "false" ]]; then
    provision_settings
    echo ""
  fi

  if [[ "$SKILLS_ONLY" == "false" ]] && [[ "$AGENTS_ONLY" == "false" ]] && [[ "$SETTINGS_ONLY" == "false" ]]; then
    provision_openclaw
    echo ""
  fi

  # Mark as provisioned
  mark_provisioned

  # Run first-run init if MC is running
  if curl -sf "http://localhost:3000/login" &>/dev/null; then
    echo ""
    first_run_init
  fi

  echo ""
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║   Provisioning Complete                  ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo ""
  info "Mission Control is now pre-configured and ready to use!"
  echo ""
  info "Next steps:"
  info "  1. Open http://localhost:3000 in your browser"
  info "  2. Create your admin account at /setup"
  info "  3. Browse available skills in the Skills Hub panel"
  info "  4. Register agents via the Agents panel or API"
  echo ""
}

main "$@"
