# OpenCRVS ATG Debug Information

**Session Started:** 2025-09-24T14:18:59+01:00
**PID:** 43048
**Mode:** Full ATG Environment
**Command:** yarn run start2

## Quick Debug Commands

```bash
# View all service logs combined
tail -f /home/ktsang/opencrvs-core/logs/atg-20250924-141859/all-services.log

# View specific service logs (AI-friendly)
tail -f /home/ktsang/opencrvs-core/logs/atg-20250924-141859/gateway.log
tail -f /home/ktsang/opencrvs-core/logs/atg-20250924-141859/user-mgnt.log
tail -f /home/ktsang/opencrvs-core/logs/atg-20250924-141859/workflow.log

# Find errors in specific service
grep -i error /home/ktsang/opencrvs-core/logs/atg-20250924-141859/gateway.log

# List all service-specific logs
ls /home/ktsang/opencrvs-core/logs/atg-20250924-141859/*.log

# View session info
cat /home/ktsang/opencrvs-core/logs/atg-20250924-141859/session-info.log

# Check if services are still running
ps -p 43048
```

## Troubleshooting

1. **Services won't start:** Check dependency containers are running
2. **Port conflicts:** Check the port availability output above
3. **Environment issues:** Verify atg.env file exists and is valid
4. **Service debugging:** Each service has its own .log file for focused debugging

