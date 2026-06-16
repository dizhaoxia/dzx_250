class Layer {
    constructor(name, width, height, isBackground = false) {
        this.name = name;
        this.visible = true;
        this.opacity = 100;
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
        if (isBackground) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, width, height);
        }
    }

    getImageData() {
        return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    putImageData(imageData) {
        this.ctx.putImageData(imageData, 0, 0);
    }

    clone() {
        const layer = new Layer(this.name, this.canvas.width, this.canvas.height);
        layer.visible = this.visible;
        layer.opacity = this.opacity;
        layer.ctx.drawImage(this.canvas, 0, 0);
        return layer;
    }
}

class HistoryManager {
    constructor(maxSteps = 50) {
        this.states = [];
        this.currentIndex = -1;
        this.maxSteps = maxSteps;
    }

    push(state) {
        this.states = this.states.slice(0, this.currentIndex + 1);
        this.states.push(state);
        if (this.states.length > this.maxSteps) {
            this.states.shift();
        }
        this.currentIndex = this.states.length - 1;
    }

    undo() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            return this.states[this.currentIndex];
        }
        return null;
    }

    redo() {
        if (this.currentIndex < this.states.length - 1) {
            this.currentIndex++;
            return this.states[this.currentIndex];
        }
        return null;
    }

    get canUndo() {
        return this.currentIndex > 0;
    }

    get canRedo() {
        return this.currentIndex < this.states.length - 1;
    }

    get count() {
        return this.states.length;
    }
}

class MiniPhotoshop {
    constructor() {
        this.canvasWidth = 800;
        this.canvasHeight = 600;
        this.layers = [];
        this.activeLayerIndex = 0;
        this.currentTool = 'brush';
        this.brushColor = '#000000';
        this.brushSize = 5;
        this.brushOpacity = 100;
        this.pressureSensitivity = false;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.lastTime = 0;
        this.lastSpeed = 0;
        this.selection = null;
        this.isSelecting = false;
        this.isMovingSelection = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionMoveStart = { x: 0, y: 0 };
        this.history = new HistoryManager(50);
        this.layerCounter = 1;
        this.isApplyingFilter = false;
        this.filterStrength = 3;
        this.filterPreviewEnabled = true;
        this.currentFilter = null;
        this.clipboard = null;
        this.marchingAntsOffset = 0;
        this.marchingAntsTimer = null;

        this.init();
    }

    init() {
        this.mainCanvas = document.getElementById('main-canvas');
        this.mainCtx = this.mainCanvas.getContext('2d');
        this.overlayCanvas = document.getElementById('overlay-canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.previewCanvas = document.getElementById('preview-canvas');
        this.previewCtx = this.previewCanvas.getContext('2d');

        this.mainCanvas.width = this.canvasWidth;
        this.mainCanvas.height = this.canvasHeight;
        this.overlayCanvas.width = this.canvasWidth;
        this.overlayCanvas.height = this.canvasHeight;
        this.previewCanvas.width = this.canvasWidth;
        this.previewCanvas.height = this.canvasHeight;
        this.previewCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        this.addLayer('背景', true);
        this.saveHistoryState();
        this.bindEvents();
        this.render();
        this.updateLayerPanel();
        this.updateStatusBar();
        this.startMarchingAnts();
    }

    startMarchingAnts() {
        if (this.marchingAntsTimer) return;
        this.marchingAntsTimer = setInterval(() => {
            this.marchingAntsOffset = (this.marchingAntsOffset + 1) % 8;
            this.renderSelection();
        }, 100);
    }

    addLayer(name, isBackground = false) {
        const layer = new Layer(name || `图层 ${this.layerCounter}`, this.canvasWidth, this.canvasHeight, isBackground);
        this.layers.unshift(layer);
        this.layerCounter++;
        this.activeLayerIndex = 0;
        this.updateLayerPanel();
        this.render();
    }

    duplicateLayer() {
        const layer = this.getActiveLayer();
        if (!layer) return;
        const newLayer = layer.clone();
        newLayer.name = layer.name + ' 副本';
        this.layers.splice(this.activeLayerIndex, 0, newLayer);
        this.saveHistoryState();
        this.updateLayerPanel();
        this.render();
    }

    deleteLayer(index) {
        if (this.layers.length <= 1) return;
        this.layers.splice(index, 1);
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        this.saveHistoryState();
        this.updateLayerPanel();
        this.render();
    }

    toggleLayerVisibility(index) {
        this.layers[index].visible = !this.layers[index].visible;
        this.saveHistoryState();
        this.updateLayerPanel();
        this.render();
    }

    renameLayer(index, newName) {
        if (newName && newName.trim()) {
            this.layers[index].name = newName.trim();
            this.saveHistoryState();
            this.updateLayerPanel();
        }
    }

    moveLayerUp(index) {
        if (index <= 0) return;
        const temp = this.layers[index];
        this.layers[index] = this.layers[index - 1];
        this.layers[index - 1] = temp;
        if (this.activeLayerIndex === index) {
            this.activeLayerIndex = index - 1;
        } else if (this.activeLayerIndex === index - 1) {
            this.activeLayerIndex = index;
        }
        this.saveHistoryState();
        this.updateLayerPanel();
        this.render();
    }

    moveLayerDown(index) {
        if (index >= this.layers.length - 1) return;
        const temp = this.layers[index];
        this.layers[index] = this.layers[index + 1];
        this.layers[index + 1] = temp;
        if (this.activeLayerIndex === index) {
            this.activeLayerIndex = index + 1;
        } else if (this.activeLayerIndex === index + 1) {
            this.activeLayerIndex = index;
        }
        this.saveHistoryState();
        this.updateLayerPanel();
        this.render();
    }

    setLayerOpacity(opacity) {
        const layer = this.getActiveLayer();
        if (!layer) return;
        layer.opacity = opacity;
        this.updateLayerPanel();
        this.render();
    }

    applyLayerOpacityChange() {
        const layer = this.getActiveLayer();
        if (!layer) return;
        this.saveHistoryState();
    }

    mergeVisibleLayers() {
        if (this.layers.length <= 1) return;
        const visibleLayers = this.layers.filter(l => l.visible);
        if (visibleLayers.length <= 1) return;

        const mergedLayer = new Layer('合并图层', this.canvasWidth, this.canvasHeight);
        const mergedCtx = mergedLayer.ctx;

        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (layer.visible) {
                mergedCtx.save();
                mergedCtx.globalAlpha = layer.opacity / 100;
                mergedCtx.drawImage(layer.canvas, 0, 0);
                mergedCtx.restore();
            }
        }

        const newLayers = this.layers.filter(l => !l.visible);
        newLayers.unshift(mergedLayer);
        this.layers = newLayers;
        this.activeLayerIndex = 0;
        this.saveHistoryState();
        this.updateLayerPanel();
        this.render();
    }

    clearSelection() {
        this.selection = null;
        this.isMovingSelection = false;
        this.clearPreview();
        this.renderSelection();
        this.updateStatusBar();
    }

    fillSelection() {
        const layer = this.getActiveLayer();
        if (!layer || !layer.visible || !this.selection) return;

        const { x, y, w, h } = this.selection;
        const ctx = layer.ctx;
        ctx.save();
        ctx.globalAlpha = this.brushOpacity / 100;
        ctx.fillStyle = this.brushColor;
        ctx.fillRect(x, y, w, h);
        ctx.restore();

        this.saveHistoryState();
        this.render();
    }

    copySelection() {
        const layer = this.getActiveLayer();
        if (!layer || !this.selection) return;

        const { x, y, w, h } = this.selection;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(layer.canvas, x, y, w, h, 0, 0, w, h);

        this.clipboard = {
            canvas: tempCanvas,
            width: w,
            height: h
        };
    }

    cutSelection() {
        const layer = this.getActiveLayer();
        if (!layer || !this.selection) return;

        this.copySelection();

        const { x, y, w, h } = this.selection;
        const ctx = layer.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(x, y, w, h);
        ctx.restore();

        this.saveHistoryState();
        this.render();
    }

    pasteSelection() {
        if (!this.clipboard) return;

        const newLayer = new Layer('粘贴图层', this.canvasWidth, this.canvasHeight);
        const centerX = (this.canvasWidth - this.clipboard.width) / 2;
        const centerY = (this.canvasHeight - this.clipboard.height) / 2;
        newLayer.ctx.drawImage(this.clipboard.canvas, centerX, centerY);

        this.layers.unshift(newLayer);
        this.activeLayerIndex = 0;

        this.selection = {
            x: centerX,
            y: centerY,
            w: this.clipboard.width,
            h: this.clipboard.height
        };

        this.saveHistoryState();
        this.updateLayerPanel();
        this.render();
    }

    getActiveLayer() {
        return this.layers[this.activeLayerIndex];
    }

    render() {
        this.mainCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (layer.visible) {
                this.mainCtx.save();
                this.mainCtx.globalAlpha = layer.opacity / 100;
                this.mainCtx.drawImage(layer.canvas, 0, 0);
                this.mainCtx.restore();
            }
        }
        this.renderSelection();
        this.updateLayerPreviews();
    }

    renderSelection() {
        this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        if (this.selection) {
            const { x, y, w, h } = this.selection;
            this.overlayCtx.save();

            this.overlayCtx.fillStyle = 'rgba(0, 120, 212, 0.15)';
            this.overlayCtx.fillRect(x, y, w, h);

            this.overlayCtx.strokeStyle = '#fff';
            this.overlayCtx.lineWidth = 1;
            this.overlayCtx.setLineDash([4, 4]);
            this.overlayCtx.lineDashOffset = -this.marchingAntsOffset;
            this.overlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);

            this.overlayCtx.strokeStyle = '#000';
            this.overlayCtx.lineDashOffset = -this.marchingAntsOffset - 4;
            this.overlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);

            this.overlayCtx.restore();
        }
    }

    clearPreview() {
        this.previewCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    saveHistoryState() {
        const state = this.layers.map(layer => ({
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity,
            imageData: layer.getImageData()
        }));
        this.history.push({
            layers: state,
            activeLayerIndex: this.activeLayerIndex
        });
        this.updateStatusBar();
    }

    restoreState(state) {
        const { layers, activeLayerIndex } = state;
        this.layers = layers.map(layerState => {
            const layer = new Layer(layerState.name, this.canvasWidth, this.canvasHeight);
            layer.visible = layerState.visible;
            layer.opacity = layerState.opacity;
            layer.putImageData(layerState.imageData);
            return layer;
        });
        this.activeLayerIndex = Math.min(activeLayerIndex, this.layers.length - 1);
        this.updateLayerPanel();
        this.render();
        this.updateStatusBar();
    }

    undo() {
        const state = this.history.undo();
        if (state) {
            this.restoreState(state);
        }
    }

    redo() {
        const state = this.history.redo();
        if (state) {
            this.restoreState(state);
        }
    }

    getCanvasCoords(e) {
        const rect = this.mainCanvas.getBoundingClientRect();
        const scaleX = this.canvasWidth / rect.width;
        const scaleY = this.canvasHeight / rect.height;
        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY)
        };
    }

    isInSelection(x, y) {
        if (!this.selection) return false;
        const { x: sx, y: sy, w: sw, h: sh } = this.selection;
        return x >= sx && x <= sx + sw && y >= sy && y <= sy + sh;
    }

    drawBrush(x, y, isEraser = false) {
        const layer = this.getActiveLayer();
        if (!layer || !layer.visible) return;

        const ctx = layer.ctx;
        const now = Date.now();
        const dt = now - this.lastTime;
        const dx = x - this.lastX;
        const dy = y - this.lastY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const speed = dt > 0 ? distance / dt : 0;

        let size = this.brushSize;
        let opacity = this.brushOpacity / 100;

        if (this.pressureSensitivity && dt > 0) {
            const smoothedSpeed = this.lastSpeed * 0.7 + speed * 0.3;
            const pressure = Math.max(0.2, Math.min(1, 1 - smoothedSpeed * 2));
            size = this.brushSize * pressure;
            opacity = (this.brushOpacity / 100) * pressure;
            this.lastSpeed = smoothedSpeed;
        }

        this.lastTime = now;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (isEraser) {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.strokeStyle = this.brushColor;
            ctx.fillStyle = this.brushColor;
        }

        if (this.selection) {
            const { x: sx, y: sy, w: sw, h: sh } = this.selection;
            ctx.save();
            ctx.beginPath();
            ctx.rect(sx, sy, sw, sh);
            ctx.clip();
            ctx.beginPath();
            ctx.moveTo(this.lastX, this.lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.moveTo(this.lastX, this.lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
        }

        ctx.restore();

        this.lastX = x;
        this.lastY = y;
        this.render();
    }

    applyBlur() {
        this.applyFilter('blur');
    }

    applySharpen() {
        this.applyFilter('sharpen');
    }

    applyFilter(type) {
        const layer = this.getActiveLayer();
        if (!layer || !layer.visible) return;
        if (this.isApplyingFilter) return;

        this.isApplyingFilter = true;
        this.currentFilter = type;

        if (this.filterPreviewEnabled && this.selection) {
            this.showFilterPreview(type);
        }

        const imageData = layer.getImageData();
        const { data, width, height } = imageData;
        const output = new Uint8ClampedArray(data);
        const strength = this.filterStrength;

        setTimeout(() => {
            if (type === 'blur') {
                this.processBlur(data, output, width, height, strength, this.selection);
            } else if (type === 'sharpen') {
                this.processSharpen(data, output, width, height, strength, this.selection);
            }

            const outputData = new ImageData(output, width, height);
            layer.putImageData(outputData);
            this.saveHistoryState();
            this.clearPreview();
            this.render();
            this.isApplyingFilter = false;
            this.currentFilter = null;
        }, 10);
    }

    showFilterPreview(type) {
        if (!this.selection) return;
        const layer = this.getActiveLayer();
        if (!layer) return;

        const { x, y, w, h } = this.selection;
        this.previewCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        try {
            const sourceData = layer.ctx.getImageData(x, y, w, h);
            const { data, width: sw, height: sh } = sourceData;
            const output = new Uint8ClampedArray(data);

            if (type === 'blur') {
                this.processBlur(data, output, sw, sh, this.filterStrength);
            } else if (type === 'sharpen') {
                this.processSharpen(data, output, sw, sh, this.filterStrength);
            }

            const outputData = new ImageData(output, sw, sh);
            this.previewCtx.putImageData(outputData, x, y);
        } catch (e) {
            console.error('Preview error:', e);
        }
    }

    processBlur(src, dst, width, height, strength, selection = null) {
        const radius = Math.max(1, Math.floor(strength));
        let startX = 0, startY = 0, endX = width, endY = height;

        if (selection) {
            startX = Math.max(0, selection.x);
            startY = Math.max(0, selection.y);
            endX = Math.min(width, selection.x + selection.w);
            endY = Math.min(height, selection.y + selection.h);
        }

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const idx = (ny * width + nx) * 4;
                            r += src[idx];
                            g += src[idx + 1];
                            b += src[idx + 2];
                            a += src[idx + 3];
                            count++;
                        }
                    }
                }
                const idx = (y * width + x) * 4;
                dst[idx] = r / count;
                dst[idx + 1] = g / count;
                dst[idx + 2] = b / count;
                dst[idx + 3] = a / count;
            }
        }
    }

    processSharpen(src, dst, width, height, strength, selection = null) {
        const amount = strength / 5;
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];
        let startX = 0, startY = 0, endX = width, endY = height;

        if (selection) {
            startX = Math.max(1, selection.x);
            startY = Math.max(1, selection.y);
            endX = Math.min(width - 1, selection.x + selection.w);
            endY = Math.min(height - 1, selection.y + selection.h);
        }

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const idx = (y * width + x) * 4;

                if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                    continue;
                }

                let r = 0, g = 0, b = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const ki = (ky + 1) * 3 + (kx + 1);
                        const ni = ((y + ky) * width + (x + kx)) * 4;
                        r += src[ni] * kernel[ki];
                        g += src[ni + 1] * kernel[ki];
                        b += src[ni + 2] * kernel[ki];
                    }
                }

                const originalR = src[idx];
                const originalG = src[idx + 1];
                const originalB = src[idx + 2];

                dst[idx] = Math.max(0, Math.min(255, originalR + (r - originalR) * amount));
                dst[idx + 1] = Math.max(0, Math.min(255, originalG + (g - originalG) * amount));
                dst[idx + 2] = Math.max(0, Math.min(255, originalB + (b - originalB) * amount));
                dst[idx + 3] = src[idx + 3];
            }
        }
    }

    bindEvents() {
        this.mainCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.mainCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.mainCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.mainCanvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));

        document.getElementById('btn-brush').addEventListener('click', () => {
            this.setTool('brush');
        });

        document.getElementById('btn-eraser').addEventListener('click', () => {
            this.setTool('eraser');
        });

        document.getElementById('btn-select').addEventListener('click', () => {
            this.setTool('select');
        });

        document.getElementById('btn-move-selection').addEventListener('click', () => {
            this.setTool('moveSelection');
        });

        document.getElementById('brush-color').addEventListener('input', (e) => {
            this.brushColor = e.target.value;
        });

        document.getElementById('brush-size').addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brush-size-val').textContent = this.brushSize;
        });

        document.getElementById('brush-opacity').addEventListener('input', (e) => {
            this.brushOpacity = parseInt(e.target.value);
            document.getElementById('brush-opacity-val').textContent = this.brushOpacity + '%';
        });

        document.getElementById('pressure-sensitivity').addEventListener('change', (e) => {
            this.pressureSensitivity = e.target.checked;
        });

        document.getElementById('btn-blur').addEventListener('click', () => {
            this.applyBlur();
        });

        document.getElementById('btn-sharpen').addEventListener('click', () => {
            this.applySharpen();
        });

        document.getElementById('filter-strength').addEventListener('input', (e) => {
            this.filterStrength = parseInt(e.target.value);
            document.getElementById('filter-strength-val').textContent = this.filterStrength;
        });

        document.getElementById('filter-preview').addEventListener('change', (e) => {
            this.filterPreviewEnabled = e.target.checked;
            if (!this.filterPreviewEnabled) {
                this.clearPreview();
            }
        });

        document.getElementById('btn-undo').addEventListener('click', () => {
            this.undo();
        });

        document.getElementById('btn-redo').addEventListener('click', () => {
            this.redo();
        });

        document.getElementById('btn-add-layer').addEventListener('click', () => {
            this.addLayer();
            this.saveHistoryState();
        });

        document.getElementById('btn-delete-layer').addEventListener('click', () => {
            this.deleteLayer(this.activeLayerIndex);
        });

        document.getElementById('btn-duplicate-layer').addEventListener('click', () => {
            this.duplicateLayer();
        });

        document.getElementById('btn-merge-visible').addEventListener('click', () => {
            this.mergeVisibleLayers();
        });

        document.getElementById('btn-clear-selection').addEventListener('click', () => {
            this.clearSelection();
        });

        document.getElementById('btn-fill-selection').addEventListener('click', () => {
            this.fillSelection();
        });

        document.getElementById('btn-copy-selection').addEventListener('click', () => {
            this.copySelection();
        });

        document.getElementById('btn-cut-selection').addEventListener('click', () => {
            this.cutSelection();
        });

        document.getElementById('btn-paste-selection').addEventListener('click', () => {
            this.pasteSelection();
        });

        document.getElementById('layer-opacity').addEventListener('input', (e) => {
            const opacity = parseInt(e.target.value);
            document.getElementById('layer-opacity-val').textContent = opacity + '%';
            this.setLayerOpacity(opacity);
        });

        document.getElementById('layer-opacity').addEventListener('change', () => {
            this.applyLayerOpacityChange();
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' && e.shiftKey) {
                    e.preventDefault();
                    this.redo();
                    return;
                }
                if (e.key === 'z') {
                    e.preventDefault();
                    this.undo();
                    return;
                }
                if (e.key === 'y') {
                    e.preventDefault();
                    this.redo();
                    return;
                }
                if (e.key === 'c') {
                    e.preventDefault();
                    this.copySelection();
                    return;
                }
                if (e.key === 'x') {
                    e.preventDefault();
                    this.cutSelection();
                    return;
                }
                if (e.key === 'v') {
                    e.preventDefault();
                    this.pasteSelection();
                    return;
                }
                if (e.key === 'd' && !e.shiftKey) {
                    e.preventDefault();
                    this.duplicateLayer();
                    return;
                }
            }
            if (e.key === 'b' || e.key === 'B') {
                this.setTool('brush');
            }
            if (e.key === 'e' || e.key === 'E') {
                this.setTool('eraser');
            }
            if (e.key === 'm' || e.key === 'M') {
                this.setTool('select');
            }
            if (e.key === 'v' || e.key === 'V') {
                if (!e.ctrlKey && !e.metaKey) {
                    this.setTool('moveSelection');
                }
            }
            if (e.key === 'Escape') {
                this.clearSelection();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selection && (this.currentTool === 'select' || this.currentTool === 'moveSelection')) {
                    this.cutSelection();
                }
            }
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

        const toolMap = {
            'brush': 'btn-brush',
            'eraser': 'btn-eraser',
            'select': 'btn-select',
            'moveSelection': 'btn-move-selection'
        };

        const btnId = toolMap[tool];
        if (btnId) {
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.add('active');
        }

        if (tool === 'moveSelection' && !this.selection) {
            this.mainCanvas.style.cursor = 'not-allowed';
        } else if (tool === 'moveSelection') {
            this.mainCanvas.style.cursor = 'move';
        } else {
            this.mainCanvas.style.cursor = 'crosshair';
        }

        this.updateStatusBar();
    }

    onMouseDown(e) {
        const coords = this.getCanvasCoords(e);

        if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.isDrawing = true;
            this.lastX = coords.x;
            this.lastY = coords.y;
            this.lastTime = Date.now();
            this.lastSpeed = 0;

            const layer = this.getActiveLayer();
            if (layer && layer.visible) {
                const ctx = layer.ctx;
                const isEraser = this.currentTool === 'eraser';
                const opacity = this.brushOpacity / 100;

                ctx.save();
                ctx.globalAlpha = opacity;
                if (isEraser) {
                    ctx.globalCompositeOperation = 'destination-out';
                } else {
                    ctx.fillStyle = this.brushColor;
                }

                if (this.selection) {
                    const { x: sx, y: sy, w: sw, h: sh } = this.selection;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(sx, sy, sw, sh);
                    ctx.clip();
                    ctx.beginPath();
                    ctx.arc(coords.x, coords.y, this.brushSize / 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else {
                    ctx.beginPath();
                    ctx.arc(coords.x, coords.y, this.brushSize / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                this.render();
            }
        } else if (this.currentTool === 'select') {
            this.isSelecting = true;
            this.selectionStart = coords;
            this.selection = null;
            this.clearPreview();
            this.renderSelection();
        } else if (this.currentTool === 'moveSelection' && this.selection && this.isInSelection(coords.x, coords.y)) {
            this.isMovingSelection = true;
            this.selectionMoveStart = { x: coords.x, y: coords.y };
            this.selectionStart = { ...this.selection };
        }
    }

    onMouseMove(e) {
        const coords = this.getCanvasCoords(e);
        document.getElementById('status-pos').textContent = `${coords.x}, ${coords.y}`;

        if ((this.currentTool === 'brush' || this.currentTool === 'eraser') && this.isDrawing) {
            this.drawBrush(coords.x, coords.y, this.currentTool === 'eraser');
        } else if (this.currentTool === 'select' && this.isSelecting) {
            const x = Math.min(this.selectionStart.x, coords.x);
            const y = Math.min(this.selectionStart.y, coords.y);
            const w = Math.abs(coords.x - this.selectionStart.x);
            const h = Math.abs(coords.y - this.selectionStart.y);
            this.selection = { x, y, w, h };
            this.renderSelection();
            this.updateStatusBar();
        } else if (this.currentTool === 'moveSelection' && this.isMovingSelection) {
            const dx = coords.x - this.selectionMoveStart.x;
            const dy = coords.y - this.selectionMoveStart.y;
            this.selection = {
                x: this.selectionStart.x + dx,
                y: this.selectionStart.y + dy,
                w: this.selectionStart.w,
                h: this.selectionStart.h
            };
            this.renderSelection();
            this.updateStatusBar();
        } else if (this.currentTool === 'moveSelection' && this.selection) {
            if (this.isInSelection(coords.x, coords.y)) {
                this.mainCanvas.style.cursor = 'move';
            } else {
                this.mainCanvas.style.cursor = 'default';
            }
        }
    }

    onMouseUp(e) {
        if ((this.currentTool === 'brush' || this.currentTool === 'eraser') && this.isDrawing) {
            this.isDrawing = false;
            this.saveHistoryState();
        } else if (this.currentTool === 'select' && this.isSelecting) {
            this.isSelecting = false;
            if (this.selection && (this.selection.w < 2 || this.selection.h < 2)) {
                this.selection = null;
                this.renderSelection();
            }
            this.updateStatusBar();
        } else if (this.currentTool === 'moveSelection' && this.isMovingSelection) {
            this.isMovingSelection = false;
        }
    }

    updateLayerPanel() {
        const list = document.getElementById('layer-list');
        list.innerHTML = '';

        this.layers.forEach((layer, index) => {
            const li = document.createElement('li');
            if (index === this.activeLayerIndex) {
                li.classList.add('active');
            }

            const orderDiv = document.createElement('div');
            orderDiv.className = 'layer-order-buttons';
            const upBtn = document.createElement('button');
            upBtn.textContent = '▲';
            upBtn.title = '上移图层';
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.moveLayerUp(index);
            });
            const downBtn = document.createElement('button');
            downBtn.textContent = '▼';
            downBtn.title = '下移图层';
            downBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.moveLayerDown(index);
            });
            orderDiv.appendChild(upBtn);
            orderDiv.appendChild(downBtn);

            const visSpan = document.createElement('span');
            visSpan.className = 'layer-visibility' + (layer.visible ? '' : ' hidden');
            visSpan.textContent = layer.visible ? '👁' : '👁‍🗨';
            visSpan.title = layer.visible ? '隐藏图层' : '显示图层';
            visSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleLayerVisibility(index);
            });

            const previewDiv = document.createElement('div');
            previewDiv.className = 'layer-preview';
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = 32;
            previewCanvas.height = 24;
            const previewCtx = previewCanvas.getContext('2d');
            previewCtx.drawImage(layer.canvas, 0, 0, 32, 24);
            previewDiv.appendChild(previewCanvas);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'layer-name';
            nameSpan.textContent = layer.name;
            nameSpan.title = '双击重命名';
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'layer-name-input';
                input.value = layer.name;
                nameSpan.replaceWith(input);
                input.focus();
                input.select();

                const finish = (save) => {
                    const newName = input.value;
                    if (save && newName && newName.trim() && newName.trim() !== layer.name) {
                        this.renameLayer(index, newName.trim());
                    } else {
                        this.updateLayerPanel();
                    }
                };

                input.addEventListener('blur', () => finish(true));
                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        finish(true);
                    } else if (ev.key === 'Escape') {
                        ev.preventDefault();
                        finish(false);
                    }
                });
            });

            li.appendChild(orderDiv);
            li.appendChild(visSpan);
            li.appendChild(previewDiv);
            li.appendChild(nameSpan);

            li.addEventListener('click', () => {
                this.activeLayerIndex = index;
                document.getElementById('layer-opacity').value = layer.opacity;
                document.getElementById('layer-opacity-val').textContent = layer.opacity + '%';
                this.updateLayerPanel();
            });

            list.appendChild(li);
        });

        const activeLayer = this.getActiveLayer();
        if (activeLayer) {
            document.getElementById('layer-opacity').value = activeLayer.opacity;
            document.getElementById('layer-opacity-val').textContent = activeLayer.opacity + '%';
        }
    }

    updateLayerPreviews() {
        const previewCanvases = document.querySelectorAll('.layer-preview canvas');
        previewCanvases.forEach((canvas, index) => {
            if (this.layers[index]) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 32, 24);
                ctx.drawImage(this.layers[index].canvas, 0, 0, 32, 24);
            }
        });
    }

    updateStatusBar() {
        const toolNames = {
            brush: '画笔工具',
            eraser: '橡皮擦工具',
            select: '矩形选框',
            moveSelection: '移动选区'
        };
        document.getElementById('status-tool').textContent = toolNames[this.currentTool] || this.currentTool;
        const selSpan = document.getElementById('status-selection');
        if (this.selection) {
            selSpan.textContent = `选区: ${this.selection.x}, ${this.selection.y}, ${this.selection.w}×${this.selection.h}`;
        } else {
            selSpan.textContent = '';
        }
        const histSpan = document.getElementById('status-history');
        histSpan.textContent = `历史: ${this.history.currentIndex + 1}/${this.history.count}`;
    }
}

const app = new MiniPhotoshop();
