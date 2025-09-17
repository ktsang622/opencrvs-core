# OpenCRVS Docker Path Mapping Guide

## 🔍 Problem Overview

OpenCRVS uses TypeScript path mappings (`@service/*`) for cross-service imports, but these don't work in Docker containers by default.

### The Issue

**Development Mode (`yarn dev`):**
- ✅ All services run on same machine with shared `node_modules`
- ✅ TypeScript path mappings work because all modules are accessible
- ✅ `@gateway/utils` resolves to `packages/gateway/src/utils`

**Docker Mode:**
- ❌ Each service built in isolated container
- ❌ Only service's own code copied into container
- ❌ `@user-mgnt/something` doesn't exist in gateway container
- ❌ Results in "Cannot find module" errors

## 🏗️ Solution Architecture

### Two-Part Fix Required

1. **Keep TypeScript path mappings** (for development and build-time resolution)
2. **Copy required modules into Docker containers** (for runtime resolution)

### Current Working Example

Gateway service already works because its Dockerfile copies the events module:

```dockerfile
# packages/gateway/Dockerfile
COPY --chown=node:node packages/events /app/packages/events  # ✅ This works
```

## 🔧 Implementation Strategy

### 1. Identify Cross-Service Dependencies

**Gateway service needs:**
- `packages/events` (already copied ✅)
- `packages/user-mgnt` (missing ❌)
- `packages/auth` (missing ❌)

**User-mgnt service needs:**
- `packages/auth` (missing ❌)

**Other services:**
- Most services are self-contained
- Only copy what's actually imported

### 2. Update Dockerfiles

**Example: Fix Gateway Dockerfile**
```dockerfile
ARG  BRANCH=develop
FROM ghcr.io/opencrvs/ocrvs-base:${BRANCH}

USER node

# Copy required cross-service dependencies
COPY --chown=node:node packages/events /app/packages/events
COPY --chown=node:node packages/user-mgnt /app/packages/user-mgnt  # Add this
COPY --chown=node:node packages/auth /app/packages/auth            # Add this

WORKDIR /app/packages/gateway
COPY --chown=node:node packages/gateway/*.json /app/packages/gateway/

RUN yarn install --frozen-lockfile
COPY --chown=node:node packages/gateway /app/packages/gateway
RUN yarn build

CMD [ "yarn", "start:prod" ]
```

### 3. Use Docker Compose Build

Instead of building images individually, use Docker Compose to handle dependencies:

```bash
# Build all services with proper dependency order
docker compose -f toppan-base.yml build

# Build specific service
docker compose -f toppan-base.yml build gateway

# Build with no cache (force rebuild)
docker compose -f toppan-base.yml build --no-cache gateway
```

## 🚀 Recommended Workflow

### For Development

1. **Use existing development setup** (no changes needed):
```bash
yarn dev  # Path mappings work automatically
```

2. **For Docker testing**:
```bash
# Build with updated Dockerfiles
docker compose -f toppan-base.yml build

# Start services
docker compose -f toppan-base.yml -f toppan-override.yml up -d
```

### For Production

1. **Build images with dependencies**:
```bash
./scripts/build-docker-images.sh
```

2. **Deploy with proper module resolution**:
```bash
./scripts/start-docker.sh --mode production
```

## 🔍 Debugging Path Mapping Issues

### Check if modules are copied correctly

```bash
# Inspect container filesystem
docker exec -it opencrvs-gateway ls -la /app/packages/

# Should show:
# drwxr-xr-x events/
# drwxr-xr-x gateway/
# drwxr-xr-x user-mgnt/    # This should exist
# drwxr-xr-x auth/         # This should exist
```

### Test path resolution

```bash
# Test import resolution inside container
docker exec -it opencrvs-gateway node -e "
  console.log(require.resolve('@user-mgnt/server'));
"
```

### Check build logs

```bash
# View build output for errors
docker compose -f toppan-base.yml build gateway 2>&1 | grep -i error
```

## 📋 Service Dependency Matrix

| Service | Needs Modules | Status |
|---------|---------------|--------|
| gateway | events, user-mgnt, auth | events ✅, others ❌ |
| user-mgnt | auth | ❌ |
| auth | (self-contained) | ✅ |
| workflow | (self-contained) | ✅ |
| search | (self-contained) | ✅ |
| metrics | (self-contained) | ✅ |
| documents | (self-contained) | ✅ |
| notification | (self-contained) | ✅ |
| webhooks | (self-contained) | ✅ |

## 🎯 Next Steps

1. **Audit all Dockerfiles** to identify missing cross-service dependencies
2. **Update Dockerfiles** to copy required modules
3. **Test each service** in Docker to ensure path resolution works
4. **Update build scripts** to use `docker compose build` for dependency management

## ⚠️ Important Notes

- **Don't remove TypeScript path mappings** - they're needed for development
- **Only copy modules that are actually imported** - avoid unnecessary bloat
- **Use Docker Compose build** - it handles dependency order automatically
- **Test thoroughly** - path mapping issues only appear at runtime

## 🔄 Migration Checklist

- [ ] Audit cross-service imports in each service
- [ ] Update Dockerfiles to copy required modules
- [ ] Test each service builds successfully
- [ ] Test each service starts without module resolution errors
- [ ] Update documentation and build scripts
- [ ] Verify end-to-end functionality works