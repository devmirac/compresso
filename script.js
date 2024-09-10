const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({
    log: true,
    corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js',
    wasmOptions: {
        TOTAL_MEMORY: 1024 * 1024 * 1024,
    },
});

const dropArea = document.getElementById('drop-area');
const selectFileButton = document.getElementById('select-file');
const fileNameDisplay = document.getElementById('file-name');
const settingsDiv = document.getElementById('settings');
const qualitySlider = document.getElementById('quality-slider');
const compressButton = document.getElementById('compress-button');
const editFpsCheckbox = document.getElementById('edit-fps');
const fpsOptions = document.getElementById('fps-options');
const fpsRadios = document.getElementsByName('fps');
const audioRadios = document.getElementsByName('audio');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
});

function snapSlider(value) {
    const step = 12.5;
    return Math.round(value / step) * step;
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    dropArea.classList.add('highlight');
}

function unhighlight(e) {
    dropArea.classList.remove('highlight');
}

dropArea.addEventListener('drop', handleDrop, false);

async function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    await handleFiles(files);
}

async function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        const validExtensions = ['mp4', 'mov', 'avi', 'flv', 'webm', 'mkv'];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const maxSizeInBytes = 2000 * 1024 * 1024;

        if (!validExtensions.includes(fileExtension) || file.size > maxSizeInBytes) {
            showErrorMessage(file, validExtensions, maxSizeInBytes);
        } else {
            displayFileName(file.name);
            settingsDiv.style.display = 'block';
            compressButton.onclick = () => compressFile(file);
        }
    }
}

function showErrorMessage(file, validExtensions, maxSizeInBytes) {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    const maxSizeInMB = maxSizeInBytes / (1024 * 1024);

    let errorMessage = '';
    if (!validExtensions.includes(fileExtension)) {
        errorMessage = `Invalid file type. Please upload a video file.`;
    } else if (file.size > maxSizeInBytes) {
        errorMessage = `File size (${fileSizeInMB} MB) exceeds the maximum limit of 2 GB.`;
    }

    document.getElementById('error-message').textContent = errorMessage;
    document.getElementById('error-message').style.display = 'block';
    fileNameDisplay.style.display = 'none';
    settingsDiv.style.display = 'none';
}

function calculateCRF(quality) {
    return Math.round(23 + (quality / 100) * 7);
}

function displayFileName(fileName) {
    fileNameDisplay.textContent = fileName;
    fileNameDisplay.style.display = 'block';
}

async function compressFile(file) {
    document.getElementById('size-display').style.display = 'block';
    Array.from(dropArea.children).forEach(child => {
        if (child.id !== 'size-display') {
            child.classList.add('hidden');
        }
    });
    const originalSize = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    document.getElementById('original-size').textContent = originalSize;
    document.getElementById('after-compression').style.display = 'none';
    document.getElementById('compression-loader').style.display = 'inline-block';
    if (!ffmpeg.isLoaded()) {
        await ffmpeg.load();
    }
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
    const quality = parseFloat(qualitySlider.value);
    const crf = calculateCRF(quality);
    const selectedFps = Array.from(fpsRadios).find(radio => radio.checked)?.value;
    const selectedAudio = Array.from(audioRadios).find(radio => radio.checked)?.value;
    
    try {
        const args = [
            '-i', 'input.mp4',
            '-vcodec', 'libx264',
            '-crf', crf.toString(),
            '-preset', 'superfast',
            '-movflags', 'faststart'
        ];
        if (selectedFps && selectedFps !== 'keep') {
            args.push('-r', selectedFps);
        }
        if (selectedAudio === 'optimize') {
            args.push('-c:a', 'aac');
            args.push('-b:a', '128k');
        } else if (selectedAudio === 'remove') {
            args.push('-an');
        } else if (selectedAudio === 'current') {
            args.push('-c:a', 'copy');
        }
        
        args.push('output.mp4');
        await ffmpeg.run(...args);
        const data = ffmpeg.FS('readFile', 'output.mp4');
        const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
        var compressedSize = (data.buffer.byteLength / (1024 * 1024)).toFixed(1) + ' MB';
        var error = false;
        if (compressedSize === '0.0 MB') {
            compressedSize = 'This codec is not supported at the moment';
            error = true;
        }
        document.getElementById('compressed-size').textContent = compressedSize;

        if (!error) {
            var sizeRatio = data.buffer.byteLength / file.size;
            var percentageChange = ((1 - sizeRatio) * 100).toFixed(1);
            var sizeChangeText = '';
            var sizeChangeColor = '';

            if (sizeRatio < 1) {
                sizeChangeText = percentageChange + '% Smaller';
                sizeChangeColor = '#4CAF50'; // Green
            } else if (sizeRatio > 1) {
                sizeChangeText = Math.abs(percentageChange) + '% Larger';
                sizeChangeColor = '#FFA500'; // Orange
            } else {
                sizeChangeText = 'No Change';
                sizeChangeColor = '#FFFFFF'; // White
            }

            document.getElementById('size-reduction').textContent = sizeChangeText;
            document.getElementById('size-reduction').style.backgroundColor = sizeChangeColor;
        } else {
            document.getElementById('size-reduction').style.display = 'none';
            document.getElementById('download-button').style.display = 'none';
        }
        document.getElementById('compression-loader').style.display = 'none';
        document.getElementById('after-compression').style.display = 'block';
        document.querySelector('.button-container').style.display = 'flex';
        document.getElementById('download-button').onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = 'compressed_video.mp4';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        document.getElementById('new-file-button').onclick = () => {
            location.reload();
        };
    } catch (error) {
        console.error('Error during FFmpeg processing:', error);
        document.getElementById('compression-loader').style.display = 'none';
        document.getElementById('after-compression').style.display = 'block';
        document.getElementById('compressed-size').textContent = 'Error';
    }
}

selectFileButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        await handleFiles([file]);
    };
    input.click();
});