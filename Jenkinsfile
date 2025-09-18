pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 120, unit: 'MINUTES')
        retry(2)
        skipStagesAfterUnstable()
    }

    environment {
        // Git-based versioning (will be set dynamically)
        VERSION = ""
        REGISTRY = "${env.DOCKER_REGISTRY ?: 'toppan-crvs'}"
        BRANCH = "${env.GIT_BRANCH ?: 'develop'}"

        // Docker Configuration
        DOCKER_BUILDKIT = '1'
        COMPOSE_DOCKER_CLI_BUILD = '1'

        // Build Optimization
        MAX_PARALLEL = "${env.MAX_PARALLEL ?: '3'}"

        // Compose Files
        BUILD_COMPOSE = '-f toppan-build.yml'
        EXTERNAL_COMPOSE = '-f toppan-build-ext.yml'

        // Smart build variables (set dynamically)
        SERVICES_TO_BUILD = ""
        EXTERNAL_SERVICES_TO_BUILD = ""
        FORCE_BASE_REBUILD = "false"
        BUILD_REASON = ""

        // Credentials
        DOCKER_REGISTRY_CREDENTIALS = credentials('docker-registry-credentials')
        AWS_CREDENTIALS = credentials('aws-codecommit-credentials')
    }

    parameters {
        choice(
            name: 'BUILD_STRATEGY',
            choices: ['smart', 'all', 'core-only', 'external-only', 'selective'],
            description: 'Smart: Auto-detect changes | All: Build everything | Selective: Manual selection'
        )
        string(
            name: 'MANUAL_SERVICES',
            defaultValue: '',
            description: 'Manual service selection (only used when BUILD_STRATEGY=selective)'
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
            description: 'Push built images to Docker registry'
        )
        booleanParam(
            name: 'DRY_RUN',
            defaultValue: false,
            description: 'Show what would be built without actually building'
        )
    }

    stages {
        stage('Initialize') {
            steps {
                script {
                    // Clean workspace
                    cleanWs()

                    echo "🚀 OpenCRVS Smart Docker Build Pipeline"
                    echo "Build Strategy: ${params.BUILD_STRATEGY}"
                    echo "Branch: ${BRANCH}"
                    echo "Force Full Build: ${params.FORCE_FULL_BUILD}"
                    echo "Dry Run: ${params.DRY_RUN}"
                }
            }
        }

        stage('Generate Version') {
            steps {
                dir('opencrvs-core') {
                    script {
                        echo "🏷️ Generating version from Git..."

                        // Get git information
                        def gitCommit = sh(
                            script: "git rev-parse --short=8 HEAD",
                            returnStdout: true
                        ).trim()

                        def gitTag = sh(
                            script: "git describe --tags --abbrev=0 2>/dev/null || echo 'v1.8.0'",
                            returnStdout: true
                        ).trim().replaceAll('^v', '')

                        def branch = env.BRANCH_NAME ?: 'develop'
                        def buildNumber = env.BUILD_NUMBER ?: '1'

                        // Generate version based on branch
                        def version
                        if (branch == 'main' || branch == 'master') {
                            version = "${gitTag}"
                        } else if (branch == 'develop') {
                            version = "${gitTag}-dev.${buildNumber}.${gitCommit}"
                        } else {
                            def safeBranch = branch.replaceAll('[^a-zA-Z0-9]', '-').take(20)
                            version = "${gitTag}-${safeBranch}.${buildNumber}.${gitCommit}"
                        }

                        env.VERSION = version
                        env.GIT_COMMIT = gitCommit

                        echo "📦 Generated Version: ${version}"
                        echo "🔗 Git Commit: ${gitCommit}"
                    }
                }
            }
        }

        stage('Detect Changes') {
            when {
                anyOf {
                    expression { params.BUILD_STRATEGY == 'smart' }
                    expression { params.FORCE_FULL_BUILD == false && params.BUILD_STRATEGY != 'selective' }
                }
            }
            steps {
                dir('opencrvs-core') {
                    script {
                        echo "🔍 Smart Change Detection..."

                        // Get changed files since last successful build or last commit
                        def changedFiles = []
                        try {
                            def changes = sh(
                                script: """
                                    # Try to get changes since last successful build
                                    if [ "\${BUILD_NUMBER}" != "1" ]; then
                                        git diff --name-only HEAD~1 2>/dev/null || git diff --name-only HEAD^ 2>/dev/null || echo ""
                                    else
                                        # First build - check last 5 commits for changes
                                        git diff --name-only HEAD~5 HEAD 2>/dev/null || echo ""
                                    fi
                                """,
                                returnStdout: true
                            ).trim()

                            if (changes) {
                                changedFiles = changes.split('\n').findAll { it.trim() }
                            }
                        } catch (Exception e) {
                            echo "⚠️ Could not detect changes, will do full build: ${e.message}"
                            changedFiles = ['**/*']
                        }

                        if (!changedFiles) {
                            echo "ℹ️ No changes detected, will skip build unless forced"
                            env.SERVICES_TO_BUILD = ""
                            env.EXTERNAL_SERVICES_TO_BUILD = ""
                            env.BUILD_REASON = "No changes detected"
                            return
                        }

                        echo "📋 Changed files:"
                        changedFiles.each { echo "  - ${it}" }

                        // Analyze changes to determine what to build
                        def coreServices = [] as Set
                        def externalServices = [] as Set
                        def forceBaseRebuild = false
                        def forceFullBuild = false

                        def allCoreServices = [
                            'config', 'auth', 'user-mgnt', 'notification', 'search',
                            'metrics', 'documents', 'gateway', 'workflow', 'webhooks',
                            'events', 'client', 'login', 'migration', 'data-seeder',
                            'toppan', 'toppan-service', 'toppan-ui'
                        ]

                        def allExternalServices = ['countryconfig', 'opensearch', 'toppan-data-seeder']

                        changedFiles.each { file ->
                            echo "🔍 Analyzing: ${file}"

                            // Base infrastructure changes - force full rebuild
                            if (file.matches(/(Dockerfile\.base|package\.json|yarn\.lock|tsconfig\.json)/)) {
                                echo "  ⚡ Infrastructure change detected - force full build"
                                forceFullBuild = true
                                return
                            }

                            // Commons/Components changes - affects all services
                            if (file.startsWith('packages/commons/') || file.startsWith('packages/components/')) {
                                echo "  ⚡ Commons/Components change - rebuilding all core services"
                                forceBaseRebuild = true
                                coreServices.addAll(allCoreServices)
                            }

                            // Individual service changes
                            if (file.startsWith('packages/')) {
                                def parts = file.split('/')
                                if (parts.length > 1) {
                                    def service = parts[1]
                                    if (allCoreServices.contains(service)) {
                                        echo "  📦 Core service change: ${service}"
                                        coreServices.add(service)
                                    }
                                }
                            }

                            // Docker compose changes
                            if (file.matches(/(toppan-.*\.yml|docker-compose.*\.yml)/)) {
                                echo "  🐳 Docker configuration change detected"
                                forceBaseRebuild = true
                            }

                            // Scripts changes
                            if (file.startsWith('scripts/')) {
                                echo "  📜 Build script change detected"
                                forceBaseRebuild = true
                            }

                            // External service detection (check if external repos changed)
                            // Note: This would require additional logic to check external repos
                        }

                        // Commit message analysis
                        def commitMessage = sh(
                            script: "git log -1 --pretty=%B",
                            returnStdout: true
                        ).trim().toLowerCase()

                        if (commitMessage.contains('[full-build]') || commitMessage.contains('[build-all]')) {
                            echo "🏗️ Full build requested in commit message"
                            forceFullBuild = true
                        }

                        if (commitMessage.contains('[no-cache]')) {
                            echo "🚫 No cache requested in commit message"
                            env.NO_CACHE = 'true'
                        }

                        // Extract specific services from commit message
                        def servicePattern = /\[build:([\w\-,\s]+)\]/
                        def matcher = commitMessage =~ servicePattern
                        if (matcher) {
                            def requestedServices = matcher[0][1].split(',').collect { it.trim() }
                            echo "🎯 Specific services requested in commit: ${requestedServices}"
                            requestedServices.each { service ->
                                if (allCoreServices.contains(service)) {
                                    coreServices.add(service)
                                } else if (allExternalServices.contains(service)) {
                                    externalServices.add(service)
                                }
                            }
                        }

                        // Set build variables
                        if (forceFullBuild || params.FORCE_FULL_BUILD) {
                            env.SERVICES_TO_BUILD = allCoreServices.join(' ')
                            env.EXTERNAL_SERVICES_TO_BUILD = allExternalServices.join(' ')
                            env.FORCE_BASE_REBUILD = 'true'
                            env.BUILD_REASON = "Full build (infrastructure changes or requested)"
                        } else {
                            env.SERVICES_TO_BUILD = coreServices.join(' ')
                            env.EXTERNAL_SERVICES_TO_BUILD = externalServices.join(' ')
                            env.FORCE_BASE_REBUILD = forceBaseRebuild.toString()
                            env.BUILD_REASON = "Smart build (${coreServices.size()} core, ${externalServices.size()} external services)"
                        }

                        // Display build plan
                        echo "📋 Smart Build Plan:"
                        echo "  Build Reason: ${env.BUILD_REASON}"
                        echo "  Force Base Rebuild: ${env.FORCE_BASE_REBUILD}"
                        echo "  Core Services: ${env.SERVICES_TO_BUILD ?: 'none'}"
                        echo "  External Services: ${env.EXTERNAL_SERVICES_TO_BUILD ?: 'none'}"
                    }
                }
            }
        }

        stage('Manual Build Configuration') {
            when {
                expression { params.BUILD_STRATEGY != 'smart' }
            }
            steps {
                script {
                    echo "⚙️ Configuring manual build strategy..."

                    def allCoreServices = [
                        'config', 'auth', 'user-mgnt', 'notification', 'search',
                        'metrics', 'documents', 'gateway', 'workflow', 'webhooks',
                        'events', 'client', 'login', 'migration', 'data-seeder',
                        'toppan', 'toppan-service', 'toppan-ui'
                    ]
                    def allExternalServices = ['countryconfig', 'opensearch', 'toppan-data-seeder']

                    switch(params.BUILD_STRATEGY) {
                        case 'all':
                            env.SERVICES_TO_BUILD = allCoreServices.join(' ')
                            env.EXTERNAL_SERVICES_TO_BUILD = allExternalServices.join(' ')
                            env.FORCE_BASE_REBUILD = 'true'
                            env.BUILD_REASON = "Manual full build"
                            break
                        case 'core-only':
                            env.SERVICES_TO_BUILD = allCoreServices.join(' ')
                            env.EXTERNAL_SERVICES_TO_BUILD = ""
                            env.FORCE_BASE_REBUILD = 'true'
                            env.BUILD_REASON = "Manual core-only build"
                            break
                        case 'external-only':
                            env.SERVICES_TO_BUILD = ""
                            env.EXTERNAL_SERVICES_TO_BUILD = allExternalServices.join(' ')
                            env.FORCE_BASE_REBUILD = 'false'
                            env.BUILD_REASON = "Manual external-only build"
                            break
                        case 'selective':
                            def requestedServices = params.MANUAL_SERVICES ? params.MANUAL_SERVICES.split(' ') : []
                            def coreServices = requestedServices.findAll { allCoreServices.contains(it) }
                            def externalServices = requestedServices.findAll { allExternalServices.contains(it) }

                            env.SERVICES_TO_BUILD = coreServices.join(' ')
                            env.EXTERNAL_SERVICES_TO_BUILD = externalServices.join(' ')
                            env.FORCE_BASE_REBUILD = (coreServices.size() > 0).toString()
                            env.BUILD_REASON = "Manual selective build"
                            break
                    }

                    echo "📋 Manual Build Plan:"
                    echo "  Build Reason: ${env.BUILD_REASON}"
                    echo "  Force Base Rebuild: ${env.FORCE_BASE_REBUILD}"
                    echo "  Core Services: ${env.SERVICES_TO_BUILD ?: 'none'}"
                    echo "  External Services: ${env.EXTERNAL_SERVICES_TO_BUILD ?: 'none'}"
                }
            }
        }

        stage('Build Summary & Dry Run') {
            steps {
                script {
                    echo "📊 Final Build Configuration:"
                    echo "  Version: ${env.VERSION}"
                    echo "  Registry: ${env.REGISTRY}"
                    echo "  Build Reason: ${env.BUILD_REASON}"
                    echo "  Force Base Rebuild: ${env.FORCE_BASE_REBUILD}"
                    echo "  No Cache: ${params.NO_CACHE}"
                    echo "  Sequential Build: ${params.SEQUENTIAL_BUILD}"
                    echo ""
                    echo "🎯 Services to Build:"
                    if (env.SERVICES_TO_BUILD) {
                        env.SERVICES_TO_BUILD.split(' ').each {
                            echo "  📦 Core: ${it}"
                        }
                    }
                    if (env.EXTERNAL_SERVICES_TO_BUILD) {
                        env.EXTERNAL_SERVICES_TO_BUILD.split(' ').each {
                            echo "  🌍 External: ${it}"
                        }
                    }
                    if (!env.SERVICES_TO_BUILD && !env.EXTERNAL_SERVICES_TO_BUILD) {
                        echo "  ℹ️ No services to build"
                    }

                    if (params.DRY_RUN) {
                        echo ""
                        echo "🔍 DRY RUN MODE - Build would proceed with above configuration"
                        echo "Set DRY_RUN to false to execute actual build"
                        currentBuild.result = 'SUCCESS'
                        return
                    }

                    // Skip build if nothing to build
                    if (!env.SERVICES_TO_BUILD && !env.EXTERNAL_SERVICES_TO_BUILD) {
                        echo "✅ No services need building - skipping build stages"
                        env.SKIP_BUILD = 'true'
                    } else {
                        env.SKIP_BUILD = 'false'
                    }

                    // Set build arguments
                    env.CACHE_ARGS = params.NO_CACHE ? '--no-cache' : ''
                    env.PARALLEL_MODE = params.SEQUENTIAL_BUILD ? 'false' : 'true'
                }
            }
        }

        stage('Checkout') {
            when {
                expression { env.SKIP_BUILD != 'true' }
            }
            parallel {
                stage('Checkout Core') {
                    steps {
                        dir('opencrvs-core') {
                            checkout([
                                $class: 'GitSCM',
                                branches: [[name: "*/${BRANCH}"]],
                                userRemoteConfigs: [[
                                    url: 'https://git-codecommit.ap-east-1.amazonaws.com/v1/repos/opencrvs_core',
                                    credentialsId: 'aws-codecommit-credentials'
                                ]]
                            ])
                        }
                    }
                }
                stage('Checkout CountryConfig') {
                    when {
                        expression { env.EXTERNAL_SERVICES_TO_BUILD?.contains('countryconfig') }
                    }
                    steps {
                        dir('opencrvs-countryconfig') {
                            checkout([
                                $class: 'GitSCM',
                                branches: [[name: "*/${BRANCH}"]],
                                userRemoteConfigs: [[
                                    url: 'https://git-codecommit.ap-east-1.amazonaws.com/v1/repos/opencrvs_countryconfig',
                                    credentialsId: 'aws-codecommit-credentials'
                                ]]
                            ])
                        }
                    }
                }
                stage('Checkout OpenSearch') {
                    when {
                        anyOf {
                            expression { env.EXTERNAL_SERVICES_TO_BUILD?.contains('opensearch') }
                            expression { env.EXTERNAL_SERVICES_TO_BUILD?.contains('toppan-data-seeder') }
                        }
                    }
                    steps {
                        dir('opensearch') {
                            checkout([
                                $class: 'GitSCM',
                                branches: [[name: "*/master"]],
                                userRemoteConfigs: [[
                                    url: 'https://git-codecommit.ap-east-1.amazonaws.com/v1/repos/opencrvs_opensearch',
                                    credentialsId: 'aws-codecommit-credentials'
                                ]]
                            ])
                        }
                    }
                }
            }
        }

        stage('Pre-build Setup') {
            steps {
                dir('opencrvs-core') {
                    script {
                        // Export environment variables
                        sh '''
                            export VERSION=${VERSION}
                            export DOCKER_REGISTRY=${REGISTRY}
                            export BRANCH=${BRANCH}

                            echo "Environment variables set:"
                            echo "VERSION=${VERSION}"
                            echo "DOCKER_REGISTRY=${REGISTRY}"
                            echo "BRANCH=${BRANCH}"
                        '''

                        // Check available services
                        def availableServices = sh(
                            script: "docker compose ${BUILD_COMPOSE} config --services",
                            returnStdout: true
                        ).trim().split('\n')

                        echo "Available services: ${availableServices.join(', ')}"

                        // Validate selective services if specified
                        if (params.BUILD_MODE == 'selective' && params.SERVICES) {
                            def requestedServices = params.SERVICES.split(' ')
                            def externalServices = ['countryconfig', 'opensearch', 'toppan-data-seeder']

                            for (service in requestedServices) {
                                if (!availableServices.contains(service) && !externalServices.contains(service)) {
                                    error("Service '${service}' not found in available services")
                                }
                            }
                        }
                    }
                }
            }
        }

        stage('Build Base Image') {
            when {
                allOf {
                    expression { env.SKIP_BUILD != 'true' }
                    anyOf {
                        expression { env.FORCE_BASE_REBUILD == 'true' }
                        expression { env.SERVICES_TO_BUILD?.contains('base') }
                        expression { env.SERVICES_TO_BUILD?.trim() != '' } // Any core service needs base
                    }
                }
            }
            steps {
                dir('opencrvs-core') {
                    script {
                        echo "🏗️ Building base image (commons/components)..."

                        sh """
                            export VERSION=${VERSION}
                            export DOCKER_REGISTRY=${REGISTRY}
                            export BRANCH=${BRANCH}

                            docker compose ${BUILD_COMPOSE} build ${env.CACHE_ARGS} base

                            # Tag with latest
                            docker tag ${REGISTRY}/ocrvs-base:${VERSION} ${REGISTRY}/ocrvs-base:latest
                        """
                    }
                }
            }
            post {
                success {
                    echo "✅ Base image built successfully"
                }
                failure {
                    echo "❌ Base image build failed"
                }
            }
        }

        stage('Build Core Services') {
            when {
                allOf {
                    expression { env.SKIP_BUILD != 'true' }
                    expression { env.SERVICES_TO_BUILD?.trim() != '' }
                }
            }
            steps {
                dir('opencrvs-core') {
                    script {
                        echo "🚀 Building core services with dynamic Dockerfiles..."

                        def servicesToBuild = env.SERVICES_TO_BUILD?.trim() ?: ''
                        echo "Selected core services: ${servicesToBuild}"
                        echo "Build reason: ${env.BUILD_REASON}"

                        sh """
                            export VERSION=${VERSION}
                            export DOCKER_REGISTRY=${REGISTRY}
                            export BRANCH=${BRANCH}

                            # Make build script executable
                            chmod +x scripts/build-docker-compose.sh

                            # Set build flags
                            BUILD_FLAGS=""
                            if [ "${params.SEQUENTIAL_BUILD}" = "true" ]; then
                                BUILD_FLAGS="\$BUILD_FLAGS --sequential"
                            fi
                            if [ "${params.NO_CACHE}" = "true" ]; then
                                BUILD_FLAGS="\$BUILD_FLAGS --no-cache"
                            fi
                            if [ "${env.MAX_PARALLEL}" != "0" ]; then
                                BUILD_FLAGS="\$BUILD_FLAGS --max-parallel ${env.MAX_PARALLEL}"
                            fi

                            echo "🔧 Build flags: \$BUILD_FLAGS"
                            echo "🎯 Services to build: ${servicesToBuild}"

                            # Execute build with proper service selection
                            if [ -n "${servicesToBuild}" ]; then
                                ./scripts/build-docker-compose.sh \$BUILD_FLAGS ${servicesToBuild}
                            else
                                ./scripts/build-docker-compose.sh \$BUILD_FLAGS
                            fi
                        """
                    }
                }
            }
            post {
                always {
                    script {
                        // List any temporary files created
                        sh '''
                            echo "📋 Temporary files created during build:"
                            find . -name "Dockerfile.*.temp" -type f || echo "No temporary Dockerfiles found"
                            ls -la toppan-build-dynamic.yml 2>/dev/null || echo "No dynamic compose file found"
                        '''
                    }
                }
                success {
                    echo "✅ Core services built successfully"
                }
                failure {
                    echo "❌ Core services build failed"
                    script {
                        // Show build logs for debugging
                        sh '''
                            echo "🔍 Checking for build artifacts:"
                            ls -la packages/*/Dockerfile.*.temp 2>/dev/null || echo "No temp Dockerfiles found"
                            cat toppan-build-dynamic.yml 2>/dev/null || echo "No dynamic compose file to show"
                        '''
                    }
                }
            }
        }

        stage('Build External Services') {
            when {
                allOf {
                    expression { env.SKIP_BUILD != 'true' }
                    expression { env.EXTERNAL_SERVICES_TO_BUILD?.trim() != '' }
                }
            }
            parallel {
                stage('Build CountryConfig') {
                    when {
                        expression { env.EXTERNAL_SERVICES_TO_BUILD?.contains('countryconfig') }
                    }
                    steps {
                        dir('opencrvs-core') {
                            script {
                                echo "🌍 Building CountryConfig..."
                                sh """
                                    export VERSION=${VERSION}
                                    export DOCKER_REGISTRY=${REGISTRY}
                                    export BRANCH=${BRANCH}

                                    docker compose ${EXTERNAL_COMPOSE} build ${env.CACHE_ARGS} countryconfig
                                    docker tag ${REGISTRY}/countryconfig:${VERSION} ${REGISTRY}/countryconfig:latest
                                """
                            }
                        }
                    }
                    post {
                        success {
                            echo "✅ CountryConfig built successfully"
                        }
                        failure {
                            echo "❌ CountryConfig build failed"
                        }
                    }
                }

                stage('Build OpenSearch Services') {
                    when {
                        anyOf {
                            expression { env.EXTERNAL_SERVICES_TO_BUILD?.contains('opensearch') }
                            expression { env.EXTERNAL_SERVICES_TO_BUILD?.contains('toppan-data-seeder') }
                        }
                    }
                    steps {
                        dir('opencrvs-core') {
                            script {
                                echo "🔍 Building OpenSearch services..."

                                def opensearchServices = []
                                def externalServices = env.EXTERNAL_SERVICES_TO_BUILD?.split(' ') ?: []

                                externalServices.each { service ->
                                    if (service in ['opensearch', 'toppan-data-seeder']) {
                                        opensearchServices.add(service)
                                    }
                                }

                                echo "OpenSearch services to build: ${opensearchServices}"

                                for (service in opensearchServices) {
                                    sh """
                                        export VERSION=${VERSION}
                                        export DOCKER_REGISTRY=${REGISTRY}
                                        export BRANCH=${BRANCH}

                                        docker compose ${EXTERNAL_COMPOSE} build ${env.CACHE_ARGS} ${service}
                                        docker tag ${REGISTRY}/${service}:${VERSION} ${REGISTRY}/${service}:latest
                                    """
                                }
                            }
                        }
                    }
                    post {
                        success {
                            echo "✅ OpenSearch services built successfully"
                        }
                        failure {
                            echo "❌ OpenSearch services build failed"
                        }
                    }
                }
            }
        }

        stage('Push to Registry') {
            when {
                expression { params.PUSH_TO_REGISTRY == true }
            }
            steps {
                script {
                    echo "📦 Pushing images to registry..."

                    withCredentials([usernamePassword(credentialsId: 'docker-registry-credentials', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                        sh '''
                            echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin

                            # Push all built images
                            docker images | grep ${REGISTRY} | grep ${VERSION} | awk '{print $1":"$2}' | while read image; do
                                echo "Pushing $image"
                                docker push $image || echo "Failed to push $image"
                            done

                            # Push latest tags
                            docker images | grep ${REGISTRY} | grep latest | awk '{print $1":"$2}' | while read image; do
                                echo "Pushing $image"
                                docker push $image || echo "Failed to push $image"
                            done
                        '''
                    }
                }
            }
            post {
                success {
                    echo "✅ Images pushed to registry successfully"
                }
                failure {
                    echo "⚠️ Some images failed to push to registry"
                }
            }
        }

        stage('Cleanup') {
            steps {
                script {
                    echo "🧹 Cleaning up temporary build files..."
                    sh '''
                        # Remove dangling images
                        docker image prune -f || true

                        # Clean up dynamic Dockerfiles created by build script
                        echo "Removing temporary Dockerfiles..."
                        find . -name "Dockerfile.*.temp" -type f -exec echo "Removing: {}" \\; -delete || true

                        # Clean up dynamic compose file created by build script
                        echo "Removing dynamic compose files..."
                        rm -f toppan-build-dynamic.yml || true

                        # Clean up any other temporary build artifacts
                        find . -name "*.tmp" -type f -delete || true
                        find . -name ".dockerignore.temp" -type f -delete || true
                    '''
                }
            }
        }
    }

    post {
        always {
            script {
                // Display build summary
                echo "📊 Build Summary:"
                echo "Version: ${VERSION}"
                echo "Registry: ${REGISTRY}"
                echo "Build Mode: ${params.BUILD_MODE}"

                if (params.BUILD_MODE == 'selective' && params.SERVICES) {
                    echo "Services Built: ${params.SERVICES}"
                }

                // Show built images
                sh '''
                    echo "📦 Built Images:"
                    docker images | grep ${REGISTRY} | grep ${VERSION} | head -20 || echo "No images found"
                '''
            }
        }

        success {
            echo "🎉 Build completed successfully!"

            // Archive build artifacts if needed
            archiveArtifacts artifacts: '**/*.log', allowEmptyArchive: true
        }

        failure {
            echo "❌ Build failed!"

            // Archive logs and build artifacts for debugging
            archiveArtifacts artifacts: '**/*.log', allowEmptyArchive: true

            script {
                // Show any remaining temporary files for debugging
                sh '''
                    echo "🔍 Checking remaining temporary files for debugging:"
                    find . -name "Dockerfile.*.temp" -type f -exec echo "Found temp Dockerfile: {}" \\; || true
                    ls -la toppan-build-dynamic.yml 2>/dev/null && echo "Found dynamic compose file" || echo "No dynamic compose file"
                '''
            }

            // Clean up on failure
            sh '''
                # Clean up dynamic build files on failure
                echo "🧹 Emergency cleanup after build failure..."
                find . -name "Dockerfile.*.temp" -type f -exec echo "Removing: {}" \\; -delete || true
                rm -f toppan-build-dynamic.yml || true
                find . -name "*.tmp" -type f -delete || true
                docker image prune -f || true
            '''
        }

        unstable {
            echo "⚠️ Build completed with warnings!"
        }

        cleanup {
            // Final cleanup
            cleanWs()
        }
    }
}