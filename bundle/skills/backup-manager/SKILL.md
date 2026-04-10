# backup-manager

Automated backup management skill for Mission Control. Handles database backups, restoration, and backup rotation.

## Usage

```bash
# Create a manual backup
curl -X POST -H "x-api-key: $API_KEY" http://localhost:3000/api/backup

# List available backups
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/backups

# Restore from backup
curl -X POST -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"backup_id": "mc-backup-2024-01-15_12-00-00.db"}' \
  http://localhost:3000/api/backup/restore
```

## Features

- **Automated Backups**: Configured via scheduler (default: daily at 3 AM)
- **Backup Retention**: Keeps last N backups (configurable, default: 10)
- **Compression**: Backups are compressed to save space
- **Integrity Check**: Validates backup file integrity before restoration

## Configuration

Environment variables:
- `MC_BACKUP_RETENTION_COUNT`: Number of backups to retain (default: 10)
- `MC_BACKUP_SCHEDULE`: Cron expression for backup schedule (default: "0 3 * * *")

## Backup Location

Backups are stored in `.data/backups/` relative to the Mission Control data directory.

## Restoration

To restore from a backup:
1. Stop Mission Control
2. Run restoration command
3. Restart Mission Control

Warning: Restoration will replace the current database. Ensure you have a current backup before proceeding.
