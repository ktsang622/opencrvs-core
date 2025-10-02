# OpenCRVS ATG Debug Information

**Session Started:** 2025-09-24T12:41:35+01:00
**PID:** 42496
**Mode:** Services Only (Dependencies Running Separately)
**Command:** yarn run start2

## Quick Debug Commands

```bash
# View all service logs combined
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20250924-124135/all-services.log

# View specific service logs (AI-friendly)
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20250924-124135/gateway.log
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20250924-124135/user-mgnt.log
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20250924-124135/workflow.log

# Find errors in specific service
grep -i error /home/ktsang/opencrvs-core/logs/atg-services-20250924-124135/gateway.log

# List all service-specific logs
ls /home/ktsang/opencrvs-core/logs/atg-services-20250924-124135/*.log

# View session info
cat /home/ktsang/opencrvs-core/logs/atg-services-20250924-124135/session-info.log

# Check if services are still running
ps -p 42496
```

## Troubleshooting

1. **Services won't start:** Ensure dependencies are running first
2. **Connection errors:** Check if dependency services are accessible
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Service debugging:** Each service has its own .log file for focused debugging

