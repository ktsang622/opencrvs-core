# OpenCRVS ATG Debug Information

**Session Started:** 2025-10-03T21:09:13+01:00
**PID:** 79014
**Mode:** Services Only (Dependencies Running Separately)
**Command:** yarn run start2

## Quick Debug Commands

```bash
# View all service logs combined
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251003-210913/all-services.log

# View specific service logs (AI-friendly)
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251003-210913/gateway.log
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251003-210913/user-mgnt.log
tail -f /home/ktsang/opencrvs-core/logs/atg-services-20251003-210913/workflow.log

# Find errors in specific service
grep -i error /home/ktsang/opencrvs-core/logs/atg-services-20251003-210913/gateway.log

# List all service-specific logs
ls /home/ktsang/opencrvs-core/logs/atg-services-20251003-210913/*.log

# View session info
cat /home/ktsang/opencrvs-core/logs/atg-services-20251003-210913/session-info.log

# Check if services are still running
ps -p 79014
```

## Troubleshooting

1. **Services won't start:** Ensure dependencies are running first
2. **Connection errors:** Check if dependency services are accessible
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Service debugging:** Each service has its own .log file for focused debugging

