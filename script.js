const { createFFmpeg } = FFmpeg;
const ffmpeg = createFFmpeg({
    corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js',
    log: false
});


let currentFile = null;
let originalVideo = null;
let compressedVideo = null;
let comparisonCanvas = null;
let sliderPosition = 0.5;

function mapQualityValue(value) {
    const percentage = value;
    return percentage <= 12.5 ? 30 : 
           percentage <= 25 ? 29 :
           percentage <= 37.5 ? 28 :
           percentage <= 50 ? 27 :
           percentage <= 75 ? 26 : 25;
}

document.addEventListener('DOMContentLoaded', () => {
    if (/Mobi|Android/i.test(navigator.userAgent)) {
        showPopup('only works on desktop browsers', '#ff4444', true);
        return;
    }
    (async function loadFFmpeg() {
        try {
            await ffmpeg.load();
        } catch (err) {
            showPopup('ffmpeg failed to load: ' + err, '#ff4444');
        }
    })();

    const container = document.getElementById('upload-container');
    const fileInput = document.getElementById('file-input');
    let dragCounter = 0;

    container.addEventListener('click', (e) => {
        const isUploadArea = e.target.closest('.upload-area');
        const isExpanded = container.classList.contains('expanded');
        
        if (isUploadArea && !isExpanded) {
            fileInput.click();
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
        [container, document.body].forEach(element => {
            element.addEventListener(event, e => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
    });

    container.addEventListener('dragenter', () => {
        dragCounter++;
        container.classList.add('dragging');
    });

    container.addEventListener('dragleave', () => {
        dragCounter--;
        if (dragCounter === 0) container.classList.remove('dragging');
    });

    container.addEventListener('drop', e => {
        dragCounter = 0;
        container.classList.remove('dragging');
        if (e.dataTransfer.files.length) validateAndProcessFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) validateAndProcessFile(fileInput.files[0]);
    });

    function highlight(e) {
        container.classList.add('dragging');
    }

    function unhighlight(e) {
        container.classList.remove('dragging');
    }

    function updateFileName(fileName) {
        const subtext = document.querySelector('.upload-subtext');
        subtext.textContent = fileName || '';
        if (fileName) {
            container.classList.add('file-selected');
            setTimeout(() => container.classList.remove('file-selected'), 800);
        }
    }

    function showPopup(text, color, persistent = false) {
        const existingPopup = document.querySelector('.popup-overlay');
        if (existingPopup) {
            existingPopup.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        
        const content = document.createElement('div');
        content.className = 'popup-content';
        content.style.backgroundColor = color;
        content.textContent = text;

        overlay.appendChild(content);
        document.body.appendChild(overlay);

        if (!persistent) {
            overlay.addEventListener('click', () => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            });

            setTimeout(() => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            }, 3000);
        }

        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    }

    function validateAndProcessFile(file) {
        const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
        const allowedExts = ['.mp4', '.webm', '.mov', '.mkv'];
        const fileExt = file.name.toLowerCase().match(/\.[^.]*$/)?.[0] || '';

        if (!allowedTypes.includes(file.type) || !allowedExts.includes(fileExt)) {
            showPopup('please upload a supported video file format', '#ff4444');
            return;
        }

        if (file.size > 1000 * 1024 * 1024) {
            showPopup('file size exceeds the limit', '#ff4444');
            return;
        }

        const sanitizedName = sanitizeFilename(file.name);
        if (sanitizedName !== file.name) {
            showPopup('invalid file', '#ff4444');
            return;
        }

        currentFile = file;
        updateFileName(sanitizedName);
        container.classList.add('expanded');
    }

    function sanitizeFilename(filename) {
        const sanitized = filename
            .replace(/[/\\?%*:|"<>]/g, '-')
            .replace(/^\.+/, '')
            .trim();

        return sanitized.slice(0, 40);
    }

    document.querySelectorAll('.slider').forEach(slider => {
        function updateSlider(value) {
            const percentage = (value / slider.max) * 100;
            slider.style.background = `linear-gradient(to right, #7B68EE 0%, #7B68EE ${percentage}%, #333 ${percentage}%, #333 100%)`;
        }

        slider.addEventListener('input', () => {
            updateSlider(slider.value);
            currentQuality = mapQualityValue(slider.value);
        });

        updateSlider(slider.value);
    });

    const audioButtons = document.querySelectorAll('.audio-button');

    audioButtons.forEach(button => {
        button.addEventListener('click', () => {
            audioButtons.forEach(btn => btn.classList.remove('selected'));
            
            button.classList.add('selected');

            button.style.animation = 'none';
            button.offsetHeight;
            button.style.animation = null;
            button.classList.add('selected');
        });
    });

    const processButton = document.querySelector('.process-button');
    let currentQuality = mapQualityValue(35);

    processButton.addEventListener('click', async () => {   
        if (!currentFile) {
            showPopup('please select a video first', '#ff4444');
            return;
        }

        try {
            const audioButton = document.querySelector('.audio-button.selected');
            const keepAudio = audioButton.dataset.action === 'keep';
            
            const inputFileName = 'input.mp4';
            const outputFileName = 'output.mp4';
            
            const overlay = document.createElement('div');
            overlay.className = 'processing-overlay';
            const spinner = document.createElement('div');
            spinner.className = 'processing-spinner';
            overlay.appendChild(spinner);
            container.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            const ffmpegProcess = (async () => {
                ffmpeg.FS('writeFile', inputFileName, new Uint8Array(await currentFile.arrayBuffer()));

                const ffmpegArgs = [
                    '-i', inputFileName,
                    '-c:v', 'libx264',
                    '-crf', currentQuality.toString(),
                    '-preset', 'superfast',
                    '-movflags', '+faststart'
                ];

                if (keepAudio) {
                    ffmpegArgs.push('-c:a', 'copy');
                } else {
                    ffmpegArgs.push('-an');
                }

                ffmpegArgs.push('-y', outputFileName);

                await ffmpeg.run(...ffmpegArgs);
                return ffmpeg.FS('readFile', outputFileName);
            })();

            await new Promise(resolve => setTimeout(resolve, 500));
            
            const ffmpegStatus = await Promise.race([
                ffmpegProcess,
                Promise.resolve('still-processing')
            ]);

            if (ffmpegStatus !== 'still-processing') {
                overlay.remove();
                showPopup('av1 codec is currently not supported', '#ff4444');
                return;
            }

            showComparison();
            
            const data = await ffmpegProcess;
            const blob = new Blob([data.buffer], { type: 'video/mp4' });
            const compressedUrl = URL.createObjectURL(blob);
            const originalUrl = URL.createObjectURL(currentFile);
            
            const originalVideo = document.querySelector('.comparison-video.original');
            const compressedVideo = document.querySelector('.comparison-video.compressed');
            
            originalVideo.src = originalUrl;
            compressedVideo.src = compressedUrl;
            
            originalVideo.style.display = 'block';
            compressedVideo.style.display = 'block';
            const slider = document.querySelector('.comparison-slider');
            slider.style.display = 'block';
            
            compressedVideo.style.clipPath = 'inset(0 0 0 50%)';
            slider.style.left = '50%';
            
            ffmpeg.FS('unlink', inputFileName);
            ffmpeg.FS('unlink', outputFileName);

        } catch (error) {
            showPopup('error during compression', '#ff4444');
        }
    });

    async function showComparison() {
        const originalContainer = document.querySelector('.container');

        originalContainer.classList.add('fade-out');

        originalContainer.addEventListener('animationend', () => {
            originalContainer.style.display = 'none';

            const wrapper = document.createElement('div');
            wrapper.className = 'result-wrapper fade-in';

            const sizeComparison = document.createElement('div');
            sizeComparison.className = 'size-comparison';
            wrapper.appendChild(sizeComparison);

            const newContainer = document.createElement('div');
            newContainer.className = 'result-container';

            const comparisonContainer = document.createElement('div');
            comparisonContainer.className = 'comparison-container';

            const loadingContainer = document.createElement('div');
            loadingContainer.className = 'loading-message';
            loadingContainer.textContent = 'Loading... Please keep still until your video is prepared';
            comparisonContainer.appendChild(loadingContainer);

            const originalVideo = document.createElement('video');
            originalVideo.className = 'comparison-video original';
            originalVideo.loop = false;
            originalVideo.muted = true;
            originalVideo.style.display = 'none';

            const compressedVideo = document.createElement('video');
            compressedVideo.className = 'comparison-video compressed';
            compressedVideo.loop = false;
            compressedVideo.muted = true;
            compressedVideo.style.display = 'none';

            const slider = document.createElement('div');
            slider.className = 'comparison-slider';
            slider.style.display = 'none';

            comparisonContainer.appendChild(originalVideo);
            comparisonContainer.appendChild(compressedVideo);
            comparisonContainer.appendChild(slider);

            newContainer.appendChild(comparisonContainer);

            const mediaControls = document.createElement('div');
            mediaControls.className = 'media-controls';
            mediaControls.style.display = 'none';

            const playButton = document.createElement('button');
            playButton.className = 'play-button';
            playButton.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            `;

            const timeline = document.createElement('div');
            timeline.className = 'timeline';
            const timelineProgress = document.createElement('div');
            timelineProgress.className = 'timeline-progress';
            const timelineHandle = document.createElement('div');
            timelineHandle.className = 'timeline-handle';
            timeline.appendChild(timelineProgress);
            timeline.appendChild(timelineHandle);
            mediaControls.appendChild(playButton);
            mediaControls.appendChild(timeline);
            wrapper.appendChild(newContainer);
            wrapper.appendChild(mediaControls);
            document.body.appendChild(wrapper);

            Promise.all([
                originalVideo.play(),
                compressedVideo.play()
            ]).then(() => {
                mediaControls.style.display = 'flex';
                isPlaying = true;
                updateTimeline();

                const originalSize = currentFile.size;
                fetch(compressedVideo.src)
                    .then(r => r.blob())
                    .then(blob => {
                        const compressedSize = blob.size;
                        const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
                        
                        sizeComparison.innerHTML = `    
                            <div class="size-row">
                                <span class="size-label">Original</span>
                                <span class="size-value">${formatFileSize(originalSize)}</span>
                            </div>
                            <div class="size-row">
                                <span class="size-label">Compressed</span>
                                <span class="size-value">${formatFileSize(compressedSize)}</span>
                            </div>
                            <div class="reduction-row">
                                <div class="button-group">
                                    <button class="download-button">Download</button>
                                    <button class="trash-button">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="reduction-text">-${reduction}%</div>
                            </div>
                        `;

                        const downloadButton = sizeComparison.querySelector('.download-button');
                        const trashButton = sizeComparison.querySelector('.trash-button');

                        downloadButton.addEventListener('click', () => {
                            const a = document.createElement('a');
                            a.href = compressedVideo.src;
                            a.download = 'compressed-' + currentFile.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        });

                        trashButton.addEventListener('click', () => {
                            URL.revokeObjectURL(originalVideo.src);
                            URL.revokeObjectURL(compressedVideo.src);
                            
                            currentFile = null;
                            
                            window.location.reload();
                        });
                        
                        setTimeout(() => {
                            sizeComparison.classList.add('visible');
                        }, 100);
                    });
            });

            originalVideo.addEventListener('loadedmetadata', () => {
                timelineProgress.style.width = '0%';
                timelineHandle.style.left = '0%';
            });

            compressedVideo.style.clipPath = 'inset(0 0 0 50%)';
            slider.style.left = '50%';
            
            let isPlaying = true;
            
            const playIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 5v14l11-7z"/>
            </svg>`;
            
            const pauseIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
            </svg>`;

            playButton.addEventListener('click', () => {
                if (isPlaying) {
                    originalVideo.pause();
                    compressedVideo.pause();
                    playButton.innerHTML = playIcon;
                    playButton.classList.remove('to-pause');
                    playButton.classList.add('to-play');
                } else {
                    originalVideo.play();
                    compressedVideo.play();
                    playButton.innerHTML = pauseIcon;
                    playButton.classList.remove('to-play');
                    playButton.classList.add('to-pause');
                }
                
                setTimeout(() => {
                    playButton.classList.remove('to-play', 'to-pause');
                }, 300);
                
                isPlaying = !isPlaying;
            });
            originalVideo.addEventListener('play', () => {
                isPlaying = true;
                playButton.innerHTML = pauseIcon;
                playButton.classList.remove('to-play');
                playButton.classList.add('to-pause');
                setTimeout(() => {
                    playButton.classList.remove('to-pause');
                }, 300);
                updateTimeline();
            });

            originalVideo.addEventListener('pause', () => {
                isPlaying = false;
                playButton.innerHTML = playIcon;
                playButton.classList.remove('to-pause');
                playButton.classList.add('to-play');
                setTimeout(() => {
                    playButton.classList.remove('to-play');
                }, 300);
            });
            
            function updateTimeline() {
                if (!originalVideo.duration || originalVideo.paused) return;
                
                const progress = (originalVideo.currentTime / originalVideo.duration) * 100;
                
                requestAnimationFrame(() => {
                    timelineProgress.style.width = `${progress}%`;
                    timelineHandle.style.left = `${progress}%`;
                });
                
                if (isPlaying) {
                    requestAnimationFrame(updateTimeline);
                }
            }
            
            timeline.addEventListener('mousedown', (e) => {
                isPlaying = false;
                originalVideo.pause();
                compressedVideo.pause();
                playButton.innerHTML = playIcon;
                updateTimelinePosition(e);
            });

            timeline.addEventListener('mousemove', (e) => {
                if (e.buttons === 1) {
                    updateTimelinePosition(e);
                }
            });

            timeline.addEventListener('mouseup', () => {
                // Remove the auto-play behavior
            });

            function updateTimelinePosition(e) {
                const rect = timeline.getBoundingClientRect();
                const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const time = position * originalVideo.duration;
                
                Promise.all([
                    new Promise(resolve => {
                        originalVideo.currentTime = time;
                        originalVideo.addEventListener('seeked', resolve, { once: true });
                    }),
                    new Promise(resolve => {
                        compressedVideo.currentTime = time;
                        compressedVideo.addEventListener('seeked', resolve, { once: true });
                    })
                ]).then(() => {
                    const progress = position * 100;
                    timelineProgress.style.width = `${progress}%`;
                    timelineHandle.style.left = `${progress}%`;
                });
            }
            
            originalVideo.addEventListener('play', () => {
                isPlaying = true;
                updateTimeline();
            });
            
            originalVideo.addEventListener('pause', () => {
                isPlaying = false;
            });
            
            let isDragging = false;
            let sliderBounds = { left: 0, right: 0 };
            
            slider.addEventListener('mousedown', () => {
                isDragging = true;
            });
            
            function updateSliderBounds() {
                const video = originalVideo;
                const container = comparisonContainer;
                
                const videoAspect = video.videoWidth / video.videoHeight;
                const containerAspect = container.clientWidth / container.clientHeight;
                
                let videoWidth, offset;
                if (videoAspect > containerAspect) {
                    videoWidth = container.clientWidth;
                    offset = 0;
                } else {

                    videoWidth = container.clientHeight * videoAspect;
                    offset = (container.clientWidth - videoWidth) / 2;
                }
                
                sliderBounds.left = offset;
                sliderBounds.right = container.clientWidth - offset;
            }
            
            originalVideo.addEventListener('loadedmetadata', updateSliderBounds);
            window.addEventListener('resize', updateSliderBounds);
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const rect = comparisonContainer.getBoundingClientRect();
                const x = Math.max(sliderBounds.left, Math.min(sliderBounds.right, e.clientX - rect.left));
                const position = (x - sliderBounds.left) / (sliderBounds.right - sliderBounds.left);
                
                compressedVideo.style.clipPath = `inset(0 0 0 ${position * 100}%)`;
                slider.style.left = `${(x / rect.width) * 100}%`;
            });
            
            document.addEventListener('mouseup', () => {
                isDragging = false;
            });

            function updateVideoBounds() {
                const container = document.querySelector('.comparison-container');
                const bounds = document.querySelector('.video-bounds');
                

                const videoAspect = originalVideo.videoWidth / originalVideo.videoHeight;
                const containerAspect = container.clientWidth / container.clientHeight;
                
                let videoWidth;
                if (videoAspect > containerAspect) {
                    videoWidth = container.clientWidth;
                } else {
                    videoWidth = container.clientHeight * videoAspect;
                }
                
                const offset = (container.clientWidth - videoWidth) / 2;
                if (bounds) {
                    bounds.style.left = `${offset}px`;
                    bounds.style.right = `${offset}px`;
                }
            }

            originalVideo.addEventListener('loadedmetadata', updateVideoBounds);
            window.addEventListener('resize', updateVideoBounds);
        }, { once: true });
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const decimals = i >= 2 ? 2 : 0;
        return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
    }
    
});