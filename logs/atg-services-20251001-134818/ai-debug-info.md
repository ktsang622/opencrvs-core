# OpenCRVS ATG Debug Information

**Session Started:** 2025-10-01T13:48:18+01:00
**PID:** 81361
**Mode:** Services Only (Dependencies Running Separately)
**Command:** yarn run start2

## Quick Debug Commands

```bash
# View all service logs combined
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251001-134818/all-services.log

# View specific service logs (AI-friendly)
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251001-134818/gateway.log
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251001-134818/user-mgnt.log
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251001-134818/workflow.log

# Find errors in specific service
grep -i error /home/ktsang/opencrvs-core/logs/atg-services-20251001-134818/gateway.log

# List all service-specific logs
ls /home/ktsang/opencrvs-core/logs/atg-services-20251001-134818/*.log

# View session info
cat /home/ktsang/opencrvs-core/logs/atg-services-20251001-134818/session-info.log

# Check if services are still running
ps -p 81361
```

## Troubleshooting

1. **Services won't start:** Ensure dependencies are running first
2. **Connection errors:** Check if dependency services are accessible
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Service debugging:** Each service has its own .log file for focused debugging

