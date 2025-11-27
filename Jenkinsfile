pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 120, unit: 'MINUTES')
        skipStagesAfterUnstable()
    }

    environment {
        // Version (git hash or custom)
        VERSION = ""

        // Registry settings
        LOCAL_REGISTRY = "toppancrvs"

        // AWS ECR Configuration
        AWS_REGION = "${env.AWS_REGION ?: 'ap-east-1'}"
        AWS_ACCOUNT = "${env.AWS_ACCOUNT ?: '695491315778'}"
        ECR_REGISTRY = "${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        ECR_REPO_PREFIX = "${env.ECR_REPO_PREFIX ?: 'toppancrvs'}"

        // Docker Configuration
        DOCKER_BUILDKIT = '1'
        COMPOSE_DOCKER_CLI_BUILD = '1'
        COMPOSE_ENV_FILE = 'docker.env'

        // Build control
        MAX_PARALLEL = "${env.MAX_PARALLEL ?: '4'}"
    }

    parameters {
        choice(
            name: 'BUILD_STRATEGY',
            choices: ['all', 'selective', 'smart'],
            description: 'All: Build everything | Selective: Manual selection | Smart: Auto-detect changes'
        )
        string(
            name: 'MANUAL_SERVICES',
            defaultValue: '',
            description: 'For selective mode - comma-separated services (e.g., gateway,auth,client)'
        )
        booleanParam(
            name: 'NO_CACHE',
            defaultValue: false,
            description: 'Build without Docker cache'
        )
        booleanParam(
            name: 'SEQUENTIAL_BUILD',
            defaultValue: false,
            description: 'Build services sequentially (slower but easier to debug)'
        )
        booleanParam(
            name: 'PUSH_TO_ECR',
            defaultValue: true,
            description: 'Push built images to AWS ECR'
        )
        booleanParam(
            name: 'BUILD_EXTERNAL',
            defaultValue: true,
            description: 'Build external services (countryconfig, opensearch, toppan-data-seeder)'
        )
        booleanParam(
            name: 'DRY_RUN',
            defaultValue: false,
            description: 'Preview build plan without executing'
        )
        string(
            name: 'CUSTOM_VERSION',
            defaultValue: '',
            description: 'Custom version tag (leave empty for git hash)'
        )
    }

    stages {
        stage('Initialize') {
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

                    // Update docker.env with VERSION
                    sh """
                        sed -i 's/^VERSION=.*/VERSION=${env.VERSION}/' docker.env || echo "VERSION=${env.VERSION}" >> docker.env
                    """

                    echo "========================================"
                    echo "OpenCRVS Build Pipeline"
                    echo "========================================"
                    echo "Version:        ${env.VERSION}"
                    echo "Local Registry: ${env.LOCAL_REGISTRY}"
                    echo "ECR Registry:   ${env.ECR_REGISTRY}/${env.ECR_REPO_PREFIX}"
                    echo "AWS Region:     ${env.AWS_REGION}"
                    echo "Strategy:       ${params.BUILD_STRATEGY}"
                    echo "Push to ECR:    ${params.PUSH_TO_ECR}"
                    echo "Dry Run:        ${params.DRY_RUN}"
                    echo "========================================"
                }
            }
        }

        stage('Determine Services') {
            steps {
                script {
                    // Define service tiers based on README.md architecture
                    def tiers = [
                        'base': ['base'],  // Tier 0: Base image with commons/components
                        'tier1': ['config', 'auth', 'notification'],  // Core Infrastructure
                        'tier2': ['user-mgnt', 'documents', 'webhooks'],  // Depends on Tier 1
                        'tier3': ['search', 'metrics', 'workflow'],  // Data Services
                        'tier4': ['gateway', 'events'],  // API Gateway & Events
                        'tier5': ['migration', 'data-seeder', 'scheduler', 'dashboards'],  // Support
                        'tier6': ['client', 'login'],  // Frontend
                        'tier7': ['toppan-service', 'toppan', 'toppan-ui', 'toppan-certificate'],  // Toppan Services
                        'external': ['countryconfig', 'opensearch', 'toppan-data-seeder']  // External Services
                    ]

                    env.TIERS = groovy.json.JsonOutput.toJson(tiers)

                    if (params.BUILD_STRATEGY == 'all') {
                        env.BUILD_PLAN = 'all'
                        echo "Build Plan: ALL services in tiered order"
                    } else if (params.BUILD_STRATEGY == 'selective') {
                        if (!params.MANUAL_SERVICES) {
                            error("MANUAL_SERVICES parameter required for selective build")
                        }
                        env.BUILD_PLAN = 'selective'
                        env.SELECTED_SERVICES = params.MANUAL_SERVICES
                        echo "Build Plan: SELECTIVE - ${params.MANUAL_SERVICES}"
                    } else {
                        // Smart mode - detect changes
                        def changedServices = sh(
                            script: '''
                                if [ -f ".last_build_commit" ]; then
                                    LAST=$(cat .last_build_commit)
                                    git diff --name-only $LAST...HEAD 2>/dev/null | \
                                        grep "^packages/" | \
                                        cut -d'/' -f2 | \
                                        sort -u | \
                                        tr '\\n' ','
                                else
                                    echo "all"
                                fi
                            ''',
                            returnStdout: true
                        ).trim()

                        if (changedServices == 'all' || changedServices.contains('commons') || changedServices.contains('components')) {
                            env.BUILD_PLAN = 'all'
                            echo "Build Plan: ALL (first build or commons/components changed)"
                        } else if (changedServices) {
                            env.BUILD_PLAN = 'selective'
                            env.SELECTED_SERVICES = changedServices.replaceAll(',\$', '')
                            echo "Build Plan: SMART detected changes in: ${env.SELECTED_SERVICES}"
                        } else {
                            env.BUILD_PLAN = 'none'
                            echo "Build Plan: No changes detected"
                        }
                    }
                }
            }
        }

        stage('Build Base Image') {
            when {
                expression { env.BUILD_PLAN == 'all' || params.MANUAL_SERVICES?.contains('base') }
            }
            steps {
                script {
                    if (params.DRY_RUN) {
                        echo "[DRY-RUN] Would build: base image"
                        return
                    }

                    echo "Building base image (ocrvs-base)..."

                    def buildArgs = params.NO_CACHE ? '--no-cache' : ''
                    def seqArgs = params.SEQUENTIAL_BUILD ? '--sequential' : ''

                    sh """
                        export VERSION=${env.VERSION}
                        export REGISTRY=${env.LOCAL_REGISTRY}
                        ./scripts/build-docker-compose.sh ${buildArgs} ${seqArgs} base
                    """

                    echo "Base image built successfully"
                }
            }
        }

        stage('Build Tier 1: Core Infrastructure') {
            when {
                expression { env.BUILD_PLAN != 'none' }
            }
            steps {
                script {
                    def services = ['config', 'auth', 'notification']
                    buildTier('Tier 1 - Core Infrastructure', services)
                }
            }
        }

        stage('Build Tier 2: User & Documents') {
            when {
                expression { env.BUILD_PLAN != 'none' }
            }
            steps {
                script {
                    def services = ['user-mgnt', 'documents', 'webhooks']
                    buildTier('Tier 2 - User & Documents', services)
                }
            }
        }

        stage('Build Tier 3: Data Services') {
            when {
                expression { env.BUILD_PLAN != 'none' }
            }
            steps {
                script {
                    def services = ['search', 'metrics', 'workflow']
                    buildTier('Tier 3 - Data Services', services)
                }
            }
        }

        stage('Build Tier 4: Gateway & Events') {
            when {
                expression { env.BUILD_PLAN != 'none' }
            }
            steps {
                script {
                    def services = ['gateway', 'events']
                    buildTier('Tier 4 - Gateway & Events', services)
                }
            }
        }

        stage('Build Tier 5: Support Services') {
            when {
                expression { env.BUILD_PLAN != 'none' }
            }
            steps {
                script {
                    def services = ['migration', 'data-seeder', 'scheduler', 'dashboards']
                    buildTier('Tier 5 - Support Services', services)
                }
            }
        }

        stage('Build Tier 6: Frontend') {
            when {
                expression { env.BUILD_PLAN != 'none' }
            }
            steps {
                script {
                    def services = ['client', 'login']
                    buildTier('Tier 6 - Frontend', services)
                }
            }
        }

        stage('Build Tier 7: Toppan Services') {
            when {
                expression { env.BUILD_PLAN != 'none' }
            }
            steps {
                script {
                    def services = ['toppan-service', 'toppan', 'toppan-ui', 'toppan-certificate']
                    buildTier('Tier 7 - Toppan Services', services)
                }
            }
        }

        stage('Build External Services') {
            when {
                allOf {
                    expression { params.BUILD_EXTERNAL == true }
                    expression { env.BUILD_PLAN != 'none' }
                }
            }
            steps {
                script {
                    def services = ['countryconfig', 'opensearch', 'toppan-data-seeder']
                    buildTier('External Services', services, true)
                }
            }
        }

        stage('Push to ECR') {
            when {
                allOf {
                    expression { params.PUSH_TO_ECR == true }
                    expression { params.DRY_RUN == false }
                    expression { env.BUILD_PLAN != 'none' }
                }
            }
            steps {
                script {
                    echo "Pushing images to ECR..."

                    withCredentials([aws(credentialsId: 'aws-ecr-credentials', accessKeyVariable: 'AWS_ACCESS_KEY_ID', secretKeyVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                        sh """
                            # Use push-to-ecr.sh script
                            export VERSION=${env.VERSION}
                            export REGISTRY=${env.LOCAL_REGISTRY}
                            export AWS_REGION=${env.AWS_REGION}
                            export AWS_ACCOUNT=${env.AWS_ACCOUNT}
                            export ECR_REPO_PREFIX=${env.ECR_REPO_PREFIX}

                            ./scripts/push-to-ecr.sh
                        """
                    }

                    echo "Images pushed to ECR successfully"
                }
            }
        }

        stage('Record Build') {
            when {
                allOf {
                    expression { params.DRY_RUN == false }
                    expression { env.BUILD_PLAN != 'none' }
                }
            }
            steps {
                script {
                    sh '''
                        git log -1 --pretty=format:%H > .last_build_commit
                        echo "Build commit recorded: $(cat .last_build_commit)"
                    '''
                }
            }
        }
    }

    post {
        always {
            script {
                echo "Cleaning up..."
                sh 'docker system prune -f || true'
            }
        }
        success {
            script {
                if (params.DRY_RUN) {
                    echo "DRY RUN completed - no actual builds performed"
                } else {
                    echo "========================================"
                    echo "Build completed successfully!"
                    echo "========================================"
                    echo "Version:     ${env.VERSION}"
                    echo "Build Plan:  ${env.BUILD_PLAN}"
                    if (params.PUSH_TO_ECR) {
                        echo "ECR Images:  ${env.ECR_REGISTRY}/${env.ECR_REPO_PREFIX}/*:${env.VERSION}"
                    }
                    echo "========================================"
                }
            }
        }
        failure {
            script {
                echo "Build FAILED"
                echo "Check logs above for details"
            }
        }
    }
}

// Helper function to build a tier of services
def buildTier(String tierName, List<String> services, boolean isExternal = false) {
    if (params.DRY_RUN) {
        echo "[DRY-RUN] Would build ${tierName}: ${services.join(', ')}"
        return
    }

    // Filter services based on build plan
    def servicesToBuild = services
    if (env.BUILD_PLAN == 'selective' && env.SELECTED_SERVICES) {
        def selected = env.SELECTED_SERVICES.split(',').collect { it.trim() }
        servicesToBuild = services.findAll { selected.contains(it) }
    }

    if (servicesToBuild.isEmpty()) {
        echo "Skipping ${tierName} - no matching services"
        return
    }

    echo "Building ${tierName}: ${servicesToBuild.join(', ')}"

    def buildArgs = params.NO_CACHE ? '--no-cache' : ''
    def seqArgs = params.SEQUENTIAL_BUILD ? '--sequential' : ''
    def serviceList = servicesToBuild.join(' ')

    sh """
        export VERSION=${env.VERSION}
        export REGISTRY=${env.LOCAL_REGISTRY}
        ./scripts/build-docker-compose.sh ${buildArgs} ${seqArgs} ${serviceList}
    """

    echo "${tierName} built successfully"
}