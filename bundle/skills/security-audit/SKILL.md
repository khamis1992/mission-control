# security-audit

Security auditing and monitoring skill for Mission Control. Monitor security events, trust scores, and potential threats.

## Usage

```bash
# Get security overview
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/security-overview

# Get trust scores
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/agents/trust-scores

# Get security events
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/security-events?limit=100

# Scan a skill for security issues
curl -X POST -H "x-api-key: $API_KEY" \
  -d '{"source": "user-agents", "name": "my-skill"}' \
  http://localhost:3000/api/skills?mode=check
```

## Security Layers

### Layer 1: Output Evals
Automated quality and safety scoring of agent outputs.

### Layer 2: Trace Evals
Detect infinite loops, convergence issues, and execution anomalies.

### Layer 3: Component Evals
Monitor tool reliability with p50/p95/p99 latency tracking.

### Layer 4: Drift Detection
Compare current behavior against 4-week rolling baseline (threshold: 10%).

## Trust Scoring

Each agent receives a trust score (0-100) based on:
- Historical task completion rate
- Security event frequency
- Output quality metrics
- Response time consistency

### Trust Levels

| Score | Level | Description |
|-------|-------|-------------|
| 80-100 | High | Trusted agent, minimal oversight |
| 50-79 | Medium | Standard oversight, occasional review |
| 20-49 | Low | Enhanced monitoring, frequent review |
| 0-19 | Critical | Blocked from task assignment |

## Security Hook Profiles

| Profile | Description |
|---------|-------------|
| `minimal` | Basic filtering, logs only |
| `standard` | Balance of security and usability |
| `strict` | Maximum security, may impact performance |

## Secret Detection

Automatically scans agent messages for:
- API keys
- Passwords
- Authentication tokens
- Private keys
- Database credentials

Configure notification thresholds in Mission Control settings.
