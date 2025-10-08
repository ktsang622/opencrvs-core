// Configuration
const CONFIG = {
    scanInterval: 100, // ms between scan attempts
    pdfVerificationEndpoint: 'http://localhost:5000/api/certificates/verify-pdf',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    // ECDSA P-256 Public Key for signature verification
    publicKeyPEM: `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEw5BlICzzIUVox2gl1TMAB7TZBn79
YJAGNslFMnKRZAfaHlGU6TGc0//iM4I+CcolXzG7/GQU9LhV81wZK6Te3Q==
-----END PUBLIC KEY-----`
};

// State
let videoStream = null;
let scanning = false;
let canvas = null;
let canvasContext = null;
let selectedFile = null;

// DOM Elements - QR
const video = document.getElementById('video');
const videoContainer = document.getElementById('video-container');
const startScanBtn = document.getElementById('startScanBtn');
const stopScanBtn = document.getElementById('stopScanBtn');

// DOM Elements - PDF
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFile');
const verifyPdfBtn = document.getElementById('verifyPdfBtn');

// DOM Elements - Common
const resultDiv = document.getElementById('result');
const loadingDiv = document.getElementById('loading');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.createElement('canvas');
    canvasContext = canvas.getContext('2d');

    // QR Code tab
    startScanBtn.addEventListener('click', startScanning);
    stopScanBtn.addEventListener('click', stopScanning);

    // PDF upload tab
    setupPdfUpload();

    // Tabs
    setupTabs();
});

// Start camera and QR scanning
async function startScanning() {
    try {
        // Request camera permission
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' } // Use back camera on mobile
        });

        video.srcObject = videoStream;
        video.setAttribute('playsinline', true);
        video.play();

        // Show video container
        videoContainer.classList.add('active');
        startScanBtn.classList.add('hidden');
        stopScanBtn.classList.remove('hidden');
        resultDiv.style.display = 'none';

        scanning = true;
        requestAnimationFrame(scanFrame);
    } catch (error) {
        console.error('Error accessing camera:', error);
        showError('Camera Error', 'Could not access camera. Please ensure camera permissions are granted.');
    }
}

// Stop camera and scanning
function stopScanning() {
    scanning = false;

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    videoContainer.classList.remove('active');
    startScanBtn.classList.remove('hidden');
    stopScanBtn.classList.add('hidden');
}

// Scan video frame for QR code
function scanFrame() {
    if (!scanning) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Set canvas size to match video
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;

        // Draw video frame to canvas
        canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data
        const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);

        // Scan for QR code using jsQR library
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });

        if (code) {
            console.log('QR code detected:', code.data);
            handleQRCode(code.data);
            return; // Stop scanning after finding QR code
        }
    }

    // Continue scanning
    setTimeout(() => requestAnimationFrame(scanFrame), CONFIG.scanInterval);
}

// Handle detected QR code
async function handleQRCode(qrData) {
    stopScanning();

    try {
        // Parse QR data (expecting JSON)
        const data = JSON.parse(qrData);
        console.log('Parsed QR data:', data);

        // Show loading
        loadingDiv.classList.remove('hidden');
        resultDiv.style.display = 'none';

        // Verify signature
        const isValid = await verifySignature(data);

        // Hide loading
        loadingDiv.classList.add('hidden');

        // Show result
        if (isValid) {
            showSuccess(data);
        } else {
            showWarning(data, 'Signature verification failed. This certificate may have been tampered with.');
        }
    } catch (error) {
        console.error('Error processing QR code:', error);
        loadingDiv.classList.add('hidden');
        showError('Invalid QR Code', 'The QR code does not contain valid certificate data.');
    }
}

// Verify signature using Web Crypto API (client-side verification)
async function verifySignature(qrData) {
    try {
        const { signature, ...dataToVerify } = qrData;

        if (!signature) {
            console.error('No signature in QR data');
            return false;
        }

        // Import public key
        const publicKey = await importPublicKey(CONFIG.publicKeyPEM);

        // Recreate the signed data (must match what was signed)
        const dataString = JSON.stringify(dataToVerify);
        const dataBuffer = new TextEncoder().encode(dataString);

        // Decode base64 signature
        const signatureBuffer = base64ToArrayBuffer(signature);

        // Verify using Web Crypto API
        const isValid = await crypto.subtle.verify(
            {
                name: 'ECDSA',
                hash: { name: 'SHA-256' }
            },
            publicKey,
            signatureBuffer,
            dataBuffer
        );

        console.log('Signature verification result:', isValid);
        return isValid;
    } catch (error) {
        console.error('Error verifying signature:', error);
        return false;
    }
}

// Import PEM public key for Web Crypto API
async function importPublicKey(pemKey) {
    // Remove PEM headers and decode base64
    const pemContents = pemKey
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\s/g, '');

    const binaryDer = base64ToArrayBuffer(pemContents);

    // Import as ECDSA P-256 public key
    return await crypto.subtle.importKey(
        'spki',
        binaryDer,
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        false,
        ['verify']
    );
}

// Helper: Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Show success result
function showSuccess(data) {
    resultDiv.className = 'success';
    resultDiv.style.display = 'block'; // Clear inline display:none
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="icon">✅</span>
            <span>Certificate Valid</span>
        </div>
        <div class="result-data">
            ${data.certificateNumber ? `
                <div class="result-data-item">
                    <div class="result-data-label">Certificate Number</div>
                    <div class="result-data-value">${escapeHtml(data.certificateNumber)}</div>
                </div>
            ` : ''}
            ${data.certificateType ? `
                <div class="result-data-item">
                    <div class="result-data-label">Certificate Type</div>
                    <div class="result-data-value">${escapeHtml(data.certificateType)}</div>
                </div>
            ` : ''}
            ${data.issuedAt ? `
                <div class="result-data-item">
                    <div class="result-data-label">Issued At</div>
                    <div class="result-data-value">${new Date(data.issuedAt * 1000).toLocaleString()}</div>
                </div>
            ` : ''}
            ${data.recordUrl ? `
                <div class="result-data-item">
                    <div class="result-data-label">Record URL</div>
                    <div class="result-data-value">
                        <a href="${escapeHtml(data.recordUrl)}" target="_blank" style="color: #667eea; text-decoration: none; font-weight: 600;">
                            View Full Record →
                        </a>
                    </div>
                </div>
            ` : ''}
            <div class="result-data-item">
                <div class="result-data-label">Signature Status</div>
                <div class="result-data-value">
                    <span class="status-indicator status-valid"></span>
                    Digitally Signed & Verified
                </div>
            </div>
        </div>
        ${data.recordUrl ? `
            <button onclick="window.open('${escapeHtml(data.recordUrl)}', '_blank')" class="button button-primary" style="margin-top: 15px;">
                🔗 View Full Record
            </button>
        ` : ''}
        <button onclick="location.reload()" class="button button-secondary" style="margin-top: 10px;">
            🔄 Scan Another Certificate
        </button>
    `;
}

// Show warning result
function showWarning(data, message) {
    resultDiv.className = 'warning';
    resultDiv.style.display = 'block'; // Clear inline display:none
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="icon">⚠️</span>
            <span>Verification Warning</span>
        </div>
        <p style="margin-bottom: 15px; color: #666;">${escapeHtml(message)}</p>
        <div class="result-data">
            ${data.certificateNumber ? `
                <div class="result-data-item">
                    <div class="result-data-label">Certificate Number</div>
                    <div class="result-data-value">${escapeHtml(data.certificateNumber)}</div>
                </div>
            ` : ''}
            <div class="result-data-item">
                <div class="result-data-label">Signature Status</div>
                <div class="result-data-value">
                    <span class="status-indicator status-invalid"></span>
                    Invalid or Tampered
                </div>
            </div>
        </div>
        <button onclick="location.reload()" class="button button-secondary" style="margin-top: 15px;">
            🔄 Scan Another Certificate
        </button>
    `;
}

// Show error result
function showError(title, message) {
    resultDiv.className = 'error';
    resultDiv.style.display = 'block'; // Clear inline display:none
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="icon">❌</span>
            <span>${escapeHtml(title)}</span>
        </div>
        <p style="color: #666;">${escapeHtml(message)}</p>
        <button onclick="location.reload()" class="button button-secondary" style="margin-top: 15px;">
            🔄 Try Again
        </button>
    `;
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ===== TAB SWITCHING =====

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Clear results when switching tabs
    resultDiv.style.display = 'none';
    loadingDiv.classList.add('hidden');

    // Stop camera if switching away from QR tab
    if (tabName !== 'qr' && scanning) {
        stopScanning();
    }
}

// ===== PDF UPLOAD & VERIFICATION =====

function setupPdfUpload() {
    // Click to upload
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // File selected
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFileSelect(e.dataTransfer.files[0]);
    });

    // Remove file
    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearFileSelection();
    });

    // Verify button
    verifyPdfBtn.addEventListener('click', verifyPdfFile);
}

function handleFileSelect(file) {
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        showError('Invalid File', 'Please select a PDF file.');
        return;
    }

    // Validate file size
    if (file.size > CONFIG.maxFileSize) {
        showError('File Too Large', `Maximum file size is ${CONFIG.maxFileSize / 1024 / 1024}MB.`);
        return;
    }

    selectedFile = file;

    // Show file info
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.classList.add('active');
    verifyPdfBtn.classList.remove('hidden');
    uploadArea.style.display = 'none';

    // Clear previous results
    resultDiv.style.display = 'none';
}

function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.remove('active');
    verifyPdfBtn.classList.add('hidden');
    uploadArea.style.display = 'block';
    resultDiv.style.display = 'none';
}

async function verifyPdfFile() {
    if (!selectedFile) return;

    try {
        // Show loading
        loadingDiv.classList.remove('hidden');
        resultDiv.style.display = 'none';

        // Create form data
        const formData = new FormData();
        formData.append('file', selectedFile);

        console.log('Sending PDF verification request...');

        // Call verification endpoint
        const response = await fetch(CONFIG.pdfVerificationEndpoint, {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API error:', errorText);
            throw new Error(`API returned ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('Verification result:', result);

        // Hide loading
        loadingDiv.classList.add('hidden');

        // Show result
        if (result.valid) {
            showPdfSuccess(result);
        } else {
            showPdfError(result);
        }
    } catch (error) {
        console.error('Error verifying PDF:', error);
        loadingDiv.classList.add('hidden');
        showError('Verification Failed', 'Could not connect to verification service. Error: ' + error.message);
    }
}

function showPdfSuccess(result) {
    resultDiv.className = 'success';
    resultDiv.style.display = 'block'; // Clear inline display:none
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="icon">✅</span>
            <span>PDF Verified Successfully</span>
        </div>
        <div class="result-data">
            <div class="result-data-item">
                <div class="result-data-label">File Name</div>
                <div class="result-data-value">${escapeHtml(result.fileName)}</div>
            </div>
            <div class="result-data-item">
                <div class="result-data-label">File Size</div>
                <div class="result-data-value">${formatFileSize(result.fileSize)}</div>
            </div>
            <div class="result-data-item">
                <div class="result-data-label">Signature Status</div>
                <div class="result-data-value">
                    <span class="status-indicator status-valid"></span>
                    ${escapeHtml(result.message)}
                </div>
            </div>
        </div>
        <button onclick="clearFileSelection()" class="button button-secondary" style="margin-top: 15px;">
            🔄 Verify Another PDF
        </button>
    `;
}

function showPdfError(result) {
    resultDiv.className = 'error';
    resultDiv.style.display = 'block'; // Clear inline display:none
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="icon">⚠️</span>
            <span>Verification Failed</span>
        </div>
        <div class="result-data">
            <div class="result-data-item">
                <div class="result-data-label">File Name</div>
                <div class="result-data-value">${escapeHtml(result.fileName)}</div>
            </div>
            <div class="result-data-item">
                <div class="result-data-label">Signature Status</div>
                <div class="result-data-value">
                    <span class="status-indicator status-invalid"></span>
                    ${escapeHtml(result.message)}
                </div>
            </div>
        </div>
        <button onclick="clearFileSelection()" class="button button-secondary" style="margin-top: 15px;">
            🔄 Verify Another PDF
        </button>
    `;
}

// Utility: Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
