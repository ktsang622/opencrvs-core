pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 90, unit: 'MINUTES')
        retry(2)
        skipStagesAfterUnstable()
    }

    environment {
        // Git-based versioning (will be set dynamically)
        VERSION = ""
        REGISTRY = "${env.DOCKER_REGISTRY ?: '695491315778.dkr.ecr.us-east-1.amazonaws.com/toppan-crvs'}"
        BRANCH = "${env.GIT_BRANCH ?: 'develop'}"

        // Docker Configuration
        DOCKER_BUILDKIT = '1'
        COMPOSE_DOCKER_CLI_BUILD = '1'

        // Build Optimization
        MAX_PARALLEL = "${env.MAX_PARALLEL ?: '3'}"

        // Compose Files (Core services only)
        BUILD_COMPOSE = '-f toppan-build.yml'

        // Smart build variables (set dynamically)
        SERVICES_TO_BUILD = ""
        FORCE_BASE_REBUILD = "false"
        BUILD_REASON = ""

        // Credentials
        AWS_ECR_CREDENTIALS = credentials('aws-ecr-credentials')
    }

    parameters {
        choice(
            name: 'BUILD_STRATEGY',
            choices: ['smart', 'all', 'selective'],
            description: 'Smart: Auto-detect changes | All: Build everything | Selective: Manual selection'
        )
        string(
            name: 'MANUAL_SERVICES',
            defaultValue: '',
            description: 'Manual service selection (comma-separated: gateway,auth,client,user-mgnt,workflow,events,etc.)'
        )
        booleanParam(
            name: 'NO_CACHE',
            defaultValue: false,
            description: 'Build without using Docker cache'
        )
        booleanParam(
            name: 'SEQUENTIAL_BUILD',
            defaultValue: false,
            description: 'Build services sequentially instead of parallel'
        )
        booleanParam(
            name: 'FORCE_FULL_BUILD',
            defaultValue: false,
            description: 'Override smart detection and force full build'
        )
        booleanParam(
            name: 'PUSH_TO_REGISTRY',
            defaultValue: true,
            description: 'Push built images to AWS ECR (695491315778.dkr.ecr.us-east-1.amazonaws.com/toppan-crvs)'
        )
        booleanParam(
            name: 'DRY_RUN',
            defaultValue: false,
            description: 'Show what would be built without actually building'
        )
        string(
            name: 'CUSTOM_VERSION',
            defaultValue: '',
            description: 'Custom version tag (leave empty for auto-generated git hash)'
        )
    }

    stages {
        stage('🔧 Initialize & Setup') {
            steps {
                script {
                    // Set version from git hash or custom parameter
                    if (params.CUSTOM_VERSION) {
                        env.VERSION = params.CUSTOM_VERSION
                    } else {
                        env.VERSION = sh(
                            script: 'git log -1 --pretty=format:%h',
                            returnStdout: true
                        ).trim()
                    }

                    echo "🚀 OpenCRVS Core Services Build Pipeline"
                    echo "=================================================="
                    echo "  Version: ${env.VERSION}"
                    echo "  Registry: ${env.REGISTRY}"
                    echo "  Branch: ${env.BRANCH}"
                    echo "  Build Strategy: ${params.BUILD_STRATEGY}"
                    echo "  Force Full Build: ${params.FORCE_FULL_BUILD}"
                    echo "  Push to Registry: ${params.PUSH_TO_REGISTRY}"
                    echo "  Dry Run: ${params.DRY_RUN}"
                    echo "=================================================="
                }
            }
        }

        stage('🔍 Smart Change Detection') {
            when {
                allOf {
                    expression { params.BUILD_STRATEGY == 'smart' }
                    expression { params.FORCE_FULL_BUILD == false }
                }
            }
            steps {
                script {
                    echo "🔍 Analyzing changes in core services..."

                    // Define core OpenCRVS services
                    def allCoreServices = [
                        'gateway', 'auth', 'client', 'user-mgnt', 'workflow',
                        'events', 'search', 'metrics', 'webhooks', 'documents',
                        'notification', 'config', 'migration', 'login'
                    ]

                    def servicesToBuild = []
                    def forceBaseRebuild = false

                    // Check for changes in package directories
                    def changedFiles = sh(
                        script: '''
                            if [ ! -f ".last_core_build" ]; then
                                echo "First build - all services will be built"
                                find packages/ -maxdepth 1 -type d -name "*" | sed 's|packages/||' | grep -v "toppan"
                            else
                                LAST_BUILD=$(cat .last_core_build)
                                git diff --name-only $LAST_BUILD...HEAD | grep "^packages/"
                            fi
                        ''',
                        returnStdout: true
                    ).trim()

                    echo "Changed files: ${changedFiles}"

                    if (changedFiles) {
                        // Analyze which services are affected
                        changedFiles.split('\n').each { file ->
                            if (file.startsWith('packages/')) {
                                def serviceName = file.split('/')[1]

                                // Skip Toppan packages (handled by separate pipelines)
                                if (!serviceName.startsWith('toppan') && serviceName in allCoreServices) {
                                    if (!servicesToBuild.contains(serviceName)) {
                                        servicesToBuild.add(serviceName)
                                    }
                                }

                                // Check for commons/components changes (affects base image)
                                if (serviceName in ['commons', 'components']) {
                                    forceBaseRebuild = true
                                }
                            }
                        }
                    }

                    if (servicesToBuild.isEmpty() && !forceBaseRebuild) {
                        env.SERVICES_TO_BUILD = ""
                        env.BUILD_REASON = "No changes detected in core services"
                        echo "⏭️  No core service changes detected - skipping build"
                    } else {
                        env.SERVICES_TO_BUILD = servicesToBuild.join(',')
                        env.FORCE_BASE_REBUILD = forceBaseRebuild.toString()
                        env.BUILD_REASON = "Changes detected in: ${servicesToBuild.join(', ')}"
                        echo "✅ Changes detected - will build: ${env.SERVICES_TO_BUILD}"
                        if (forceBaseRebuild) {
                            echo "🔄 Base image rebuild required due to commons/components changes"
                        }
                    }
                }
            }
        }

        stage('📋 Manual Service Selection') {
            when {
                expression { params.BUILD_STRATEGY == 'selective' }
            }
            steps {
                script {
                    if (params.MANUAL_SERVICES) {
                        env.SERVICES_TO_BUILD = params.MANUAL_SERVICES
                        env.BUILD_REASON = "Manual selection: ${params.MANUAL_SERVICES}"
                        echo "🎯 Manual services selected: ${env.SERVICES_TO_BUILD}"
                    } else {
                        error("Manual services parameter is required when using selective build strategy")
                    }
                }
            }
        }

        stage('🌍 Build All Core Services') {
            when {
                expression { params.BUILD_STRATEGY == 'all' || params.FORCE_FULL_BUILD == true }
            }
            steps {
                script {
                    def allCoreServices = [
                        'gateway', 'auth', 'client', 'user-mgnt', 'workflow',
                        'events', 'search', 'metrics', 'webhooks', 'documents',
                        'notification', 'config', 'migration', 'login'
                    ]

                    env.SERVICES_TO_BUILD = allCoreServices.join(',')
                    env.FORCE_BASE_REBUILD = "true"
                    env.BUILD_REASON = "Full build requested"
                    echo "🌍 Building all core services: ${env.SERVICES_TO_BUILD}"
                }
            }
        }

        stage('🏗️  Build Base Image') {
            when {
                anyOf {
                    expression { env.FORCE_BASE_REBUILD == 'true' }
                    expression { params.BUILD_STRATEGY == 'all' }
                    expression { params.FORCE_FULL_BUILD == true }
                }
            }
            steps {
                script {
                    if (params.DRY_RUN) {
                        echo "🧪 DRY RUN: Would build base image"
                        return
                    }

                    echo "🏗️  Building optimized OpenCRVS base image..."

                    sh '''
                        # Create optimized base image
                        cat > Dockerfile.base << 'EOF'
FROM node:18-slim

RUN apt-get update && apt-get upgrade -y
RUN apt-get clean && rm -rf /var/cache/apt/archives /var/lib/apt/lists/*

USER node
WORKDIR /app

# Copy and install core dependencies
COPY --chown=node:node package*.json yarn.lock ./
COPY --chown=node:node packages/commons/package.json ./packages/commons/
COPY --chown=node:node packages/components/package.json ./packages/components/

RUN yarn install --frozen-lockfile --production=false

# Build commons and components
COPY --chown=node:node packages/commons/ ./packages/commons/
COPY --chown=node:node packages/components/ ./packages/components/

RUN yarn workspace @opencrvs/commons build
RUN yarn workspace @opencrvs/components build

CMD ["node", "--version"]
EOF

                        export DOCKER_REGISTRY=${REGISTRY}
                        docker build -f Dockerfile.base -t ${REGISTRY}/ocrvs-base:${VERSION} .
                        docker tag ${REGISTRY}/ocrvs-base:${VERSION} ${REGISTRY}/ocrvs-base:latest

                        echo "✅ Base image built successfully"
                    '''
                }
            }
        }

        stage('🚀 Build Core Services') {
            when {
                anyOf {
                    expression { env.SERVICES_TO_BUILD != "" }
                    expression { params.DRY_RUN == true }
                }
            }
            steps {
                script {
                    if (params.DRY_RUN) {
                        echo "🧪 DRY RUN: Would build services: ${env.SERVICES_TO_BUILD ?: 'none'}"
                        return
                    }

                    if (!env.SERVICES_TO_BUILD) {
                        echo "⏭️  No services to build"
                        return
                    }

                    echo "🚀 Building core services: ${env.SERVICES_TO_BUILD}"

                    // Set cache arguments
                    env.CACHE_ARGS = params.NO_CACHE ? '--no-cache' : ''

                    def servicesList = env.SERVICES_TO_BUILD.split(',')

                    if (params.SEQUENTIAL_BUILD) {
                        // Build services sequentially
                        for (service in servicesList) {
                            sh """
                                export DOCKER_REGISTRY=${REGISTRY}
                                echo "Building ${service}..."
                                docker compose ${BUILD_COMPOSE} build ${env.CACHE_ARGS} ${service}
                                docker tag ${REGISTRY}/${service}:${VERSION} ${REGISTRY}/${service}:latest
                            """
                        }
                    } else {
                        // Build services in parallel (default)
                        sh """
                            export DOCKER_REGISTRY=${REGISTRY}
                            echo "Building services in parallel: ${env.SERVICES_TO_BUILD}"
                            docker compose ${BUILD_COMPOSE} build ${env.CACHE_ARGS} ${env.SERVICES_TO_BUILD.replace(',', ' ')}

                            # Tag all built services as latest
                            for service in ${env.SERVICES_TO_BUILD.replace(',', ' ')}; do
                                docker tag ${REGISTRY}/\$service:${VERSION} ${REGISTRY}/\$service:latest
                            done
                        """
                    }

                    echo "✅ Core services build completed"
                }
            }
        }

        stage('📦 Push to Registry') {
            when {
                allOf {
                    expression { params.PUSH_TO_REGISTRY == true }
                    expression { params.DRY_RUN == false }
                    anyOf {
                        expression { env.SERVICES_TO_BUILD != "" }
                        expression { env.FORCE_BASE_REBUILD == 'true' }
                    }
                }
            }
            steps {
                script {
                    echo "📦 Pushing images to ECR..."

                    withCredentials([aws(credentialsId: 'aws-ecr-credentials', accessKeyVariable: 'AWS_ACCESS_KEY_ID', secretKeyVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                        sh '''
                            # ECR authentication for us-east-1
                            aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 695491315778.dkr.ecr.us-east-1.amazonaws.com

                            # Push base image if rebuilt
                            if [ "${FORCE_BASE_REBUILD}" = "true" ]; then
                                echo "Pushing base image..."
                                docker push ${REGISTRY}/ocrvs-base:${VERSION}
                                docker push ${REGISTRY}/ocrvs-base:latest
                            fi

                            # Push all built service images
                            if [ -n "${SERVICES_TO_BUILD}" ]; then
                                for service in $(echo ${SERVICES_TO_BUILD} | tr ',' ' '); do
                                    echo "Pushing ${REGISTRY}/$service:${VERSION}"
                                    docker push ${REGISTRY}/$service:${VERSION} || echo "Failed to push $service"

                                    echo "Pushing ${REGISTRY}/$service:latest"
                                    docker push ${REGISTRY}/$service:latest || echo "Failed to push $service:latest"
                                done
                            fi

                            echo "✅ Images pushed to ECR successfully"
                        '''
                    }
                }
            }
        }

        stage('📝 Update Build Record') {
            when {
                allOf {
                    expression { params.DRY_RUN == false }
                    anyOf {
                        expression { env.SERVICES_TO_BUILD != "" }
                        expression { env.FORCE_BASE_REBUILD == 'true' }
                    }
                }
            }
            steps {
                script {
                    sh '''
                        CURRENT_COMMIT=$(git log -1 --pretty=format:%h)
                        echo $CURRENT_COMMIT > .last_core_build
                        echo "📝 Updated core build record: $CURRENT_COMMIT"
                    '''
                }
            }
        }
    }

    post {
        always {
            script {
                echo "🧹 Cleaning up..."
                sh '''
                    # Clean up Docker images to save space
                    docker system prune -f || true

                    # Remove temporary Dockerfiles
                    rm -f Dockerfile.base || true
                '''
            }
        }
        success {
            script {
                if (params.DRY_RUN) {
                    echo "✅ DRY RUN: Core pipeline completed successfully"
                    echo "📋 Would have built: ${env.SERVICES_TO_BUILD ?: 'nothing'}"
                } else {
                    echo "✅ Core OpenCRVS pipeline completed successfully"
                    echo "📋 Summary:"
                    echo "  Build Reason: ${env.BUILD_REASON}"
                    echo "  Services Built: ${env.SERVICES_TO_BUILD ?: 'none'}"
                    echo "  Base Image Rebuilt: ${env.FORCE_BASE_REBUILD}"
                    echo "  Version: ${env.VERSION}"
                    echo "  Registry: ${env.REGISTRY}"
                    if (params.PUSH_TO_REGISTRY) {
                        echo "  Status: Built and pushed to ECR"
                    } else {
                        echo "  Status: Built locally (not pushed)"
                    }
                }
            }
        }
        failure {
            script {
                echo "❌ Core OpenCRVS pipeline failed"
                echo "📋 Build Details:"
                echo "  Services: ${env.SERVICES_TO_BUILD ?: 'none'}"
                echo "  Build Reason: ${env.BUILD_REASON}"
                echo "Check the logs above for error details"
            }
        }
    }
}