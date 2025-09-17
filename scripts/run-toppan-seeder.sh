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

echo "🌱 Running OpenCRVS Data Seeder..."

# Set defaults
export VERSION=${VERSION:-latest}
export DOCKER_REGISTRY=${DOCKER_REGISTRY:-toppan-crvs}

# Set environment variables for local development
export AUTH_HOST=http://localhost:4040
export GATEWAY_HOST=http://localhost:7070
export COUNTRY_CONFIG_HOST=http://localhost:3040

# Run the data seeder independently without affecting existing services
docker compose -p opencrvs-seeder \
  -f toppan-seeder.yml \
  --profile seeder \
  run --rm data-seeder

echo "✅ Data seeding completed!"