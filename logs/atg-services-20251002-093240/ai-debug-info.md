# OpenCRVS ATG Debug Information

**Session Started:** 2025-10-02T09:32:40+01:00
**PID:** 3958
**Mode:** Services Only (Dependencies Running Separately)
**Command:** yarn run start2

## Quick Debug Commands

```bash
# View all service logs combined
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251002-093240/all-services.log

# View specific service logs (AI-friendly)
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251002-093240/gateway.log
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251002-093240/user-mgnt.log
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251002-093240/workflow.log

# Find errors in specific service
grep -i error /home/ktsang/opencrvs-core/logs/atg-services-20251002-093240/gateway.log

# List all service-specific logs
ls /home/ktsang/opencrvs-core/logs/atg-services-20251002-093240/*.log

# View session info
cat /home/ktsang/opencrvs-core/logs/atg-services-20251002-093240/session-info.log

# Check if services are still running
ps -p 3958
```

## Troubleshooting

1. **Services won't start:** Ensure dependencies are running first
2. **Connection errors:** Check if dependency services are accessible
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Service debugging:** Each service has its own .log file for focused debugging

