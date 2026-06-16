class Layer {
    constructor(name, width, height, isBackground = false) {
        this.name = name;
        this.visible = true;
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
        layer.ctx.drawImage(this.canvas, 0, 0);
        return layer;
    }
}

class HistoryManager {
    constructor(maxSteps = 10) {
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
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.selection = null;
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.history = new HistoryManager(10);
        this.layerCounter = 1;
        this.isApplyingFilter = false;

        this.init();
    }

    init() {
        this.mainCanvas = document.getElementById('main-canvas');
        this.mainCtx = this.mainCanvas.getContext('2d');
        this.overlayCanvas = document.getElementById('overlay-canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        this.mainCanvas.width = this.canvasWidth;
        this.mainCanvas.height = this.canvasHeight;
        this.overlayCanvas.width = this.canvasWidth;
        this.overlayCanvas.height = this.canvasHeight;

        this.addLayer('背景', true);
        this.saveHistoryState();
        this.bindEvents();
        this.render();
        this.updateLayerPanel();
        this.updateStatusBar();
    }

    addLayer(name, isBackground = false) {
        const layer = new Layer(name || `图层 ${this.layerCounter}`, this.canvasWidth, this.canvasHeight, isBackground);
        this.layers.unshift(layer);
        this.layerCounter++;
        this.activeLayerIndex = 0;
        this.updateLayerPanel();
        this.render();
    }

    deleteLayer(index) {
        if (this.layers.length <= 1) return;
        this.layers.splice(index, 1);
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        this.updateLayerPanel();
        this.render();
    }

    toggleLayerVisibility(index) {
        this.layers[index].visible = !this.layers[index].visible;
        this.saveHistoryState();
        this.updateLayerPanel();
        this.render();
    }

    clearSelection() {
        this.selection = null;
        this.renderSelection();
        this.updateStatusBar();
    }

    getActiveLayer() {
        return this.layers[this.activeLayerIndex];
    }

    render() {
        this.mainCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (layer.visible) {
                this.mainCtx.drawImage(layer.canvas, 0, 0);
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
            this.overlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);

            this.overlayCtx.strokeStyle = '#000';
            this.overlayCtx.lineDashOffset = 4;
            this.overlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);

            this.overlayCtx.restore();
        }
    }

    saveHistoryState() {
        const state = this.layers.map(layer => ({
            name: layer.name,
            visible: layer.visible,
            imageData: layer.getImageData()
        }));
        this.history.push({
            layers: state,
            activeLayerIndex: this.activeLayerIndex
        });
    }

    restoreState(state) {
        const { layers, activeLayerIndex } = state;
        this.layers = layers.map(layerState => {
            const layer = new Layer(layerState.name, this.canvasWidth, this.canvasHeight);
            layer.visible = layerState.visible;
            layer.putImageData(layerState.imageData);
            return layer;
        });
        this.activeLayerIndex = Math.min(activeLayerIndex, this.layers.length - 1);
        this.updateLayerPanel();
        this.render();
    }

    undo() {
        const state = this.history.undo();
        if (state) {
            this.restoreState(state);
            this.updateStatusBar();
        }
    }

    redo() {
        const state = this.history.redo();
        if (state) {
            this.restoreState(state);
            this.updateStatusBar();
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

    drawBrush(x, y) {
        const layer = this.getActiveLayer();
        if (!layer || !layer.visible) return;

        const ctx = layer.ctx;
        ctx.strokeStyle = this.brushColor;
        ctx.lineWidth = this.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (this.selection) {
            this.drawBrushInSelection(ctx, x, y);
        } else {
            ctx.beginPath();
            ctx.moveTo(this.lastX, this.lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
        }

        this.lastX = x;
        this.lastY = y;
        this.render();
    }

    drawBrushInSelection(ctx, x, y) {
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
    }

    applyBlur() {
        const layer = this.getActiveLayer();
        if (!layer || !layer.visible) return;
        if (this.isApplyingFilter) return;

        this.isApplyingFilter = true;
        const imageData = layer.getImageData();
        const { data, width, height } = imageData;
        const output = new Uint8ClampedArray(data);
        const radius = 3;
        const chunkSize = Math.ceil(height / 8);
        let currentY = 0;

        const processChunk = () => {
            const endY = Math.min(currentY + chunkSize, height);
            for (let y = currentY; y < endY; y++) {
                for (let x = 0; x < width; x++) {
                    if (this.selection) {
                        const { x: sx, y: sy, w: sw, h: sh } = this.selection;
                        if (x < sx || x >= sx + sw || y < sy || y >= sy + sh) continue;
                    }

                    let r = 0, g = 0, b = 0, a = 0, count = 0;
                    for (let dy = -radius; dy <= radius; dy++) {
                        for (let dx = -radius; dx <= radius; dx++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const idx = (ny * width + nx) * 4;
                                r += data[idx];
                                g += data[idx + 1];
                                b += data[idx + 2];
                                a += data[idx + 3];
                                count++;
                            }
                        }
                    }
                    const idx = (y * width + x) * 4;
                    output[idx] = r / count;
                    output[idx + 1] = g / count;
                    output[idx + 2] = b / count;
                    output[idx + 3] = a / count;
                }
            }
            currentY = endY;
            if (currentY < height) {
                requestAnimationFrame(processChunk);
            } else {
                const outputData = new ImageData(output, width, height);
                layer.putImageData(outputData);
                this.saveHistoryState();
                this.render();
                this.isApplyingFilter = false;
            }
        };

        requestAnimationFrame(processChunk);
    }

    bindEvents() {
        this.mainCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.mainCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.mainCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.mainCanvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));


        document.getElementById('btn-brush').addEventListener('click', () => {
            this.setTool('brush');
        });

        document.getElementById('btn-select').addEventListener('click', () => {
            this.setTool('select');
        });

        document.getElementById('brush-color').addEventListener('input', (e) => {
            this.brushColor = e.target.value;
        });

        document.getElementById('brush-size').addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brush-size-val').textContent = this.brushSize;
        });

        document.getElementById('btn-blur').addEventListener('click', () => {
            this.applyBlur();
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
            this.saveHistoryState();
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    e.preventDefault();
                    this.undo();
                } else if (e.key === 'y') {
                    e.preventDefault();
                    this.redo();
                }
            }
            if (e.key === 'b' || e.key === 'B') {
                this.setTool('brush');
            }
            if (e.key === 'm' || e.key === 'M') {
                this.setTool('select');
            }
            if (e.key === 'Escape') {
                this.clearSelection();
            }
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        if (tool === 'brush') {
            document.getElementById('btn-brush').classList.add('active');
            this.mainCanvas.style.cursor = 'crosshair';
        } else if (tool === 'select') {
            document.getElementById('btn-select').classList.add('active');
            this.mainCanvas.style.cursor = 'crosshair';
        }
        this.updateStatusBar();
    }

    onMouseDown(e) {
        const coords = this.getCanvasCoords(e);
        if (this.currentTool === 'brush') {
            this.isDrawing = true;
            this.lastX = coords.x;
            this.lastY = coords.y;
            const layer = this.getActiveLayer();
            if (layer && layer.visible) {
                const ctx = layer.ctx;
                ctx.fillStyle = this.brushColor;
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
                this.render();
            }
        } else if (this.currentTool === 'select') {
            this.isSelecting = true;
            this.selectionStart = coords;
            this.selection = null;
            this.renderSelection();
        }
    }

    onMouseMove(e) {
        const coords = this.getCanvasCoords(e);
        document.getElementById('status-pos').textContent = `${coords.x}, ${coords.y}`;

        if (this.currentTool === 'brush' && this.isDrawing) {
            this.drawBrush(coords.x, coords.y);
        } else if (this.currentTool === 'select' && this.isSelecting) {
            const x = Math.min(this.selectionStart.x, coords.x);
            const y = Math.min(this.selectionStart.y, coords.y);
            const w = Math.abs(coords.x - this.selectionStart.x);
            const h = Math.abs(coords.y - this.selectionStart.y);
            this.selection = { x, y, w, h };
            this.renderSelection();
            this.updateStatusBar();
        }
    }

    onMouseUp(e) {
        if (this.currentTool === 'brush' && this.isDrawing) {
            this.isDrawing = false;
            this.saveHistoryState();
        } else if (this.currentTool === 'select' && this.isSelecting) {
            this.isSelecting = false;
            if (this.selection && (this.selection.w < 2 || this.selection.h < 2)) {
                this.selection = null;
                this.renderSelection();
            }
            this.updateStatusBar();
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

            const visSpan = document.createElement('span');
            visSpan.className = 'layer-visibility' + (layer.visible ? '' : ' hidden');
            visSpan.textContent = layer.visible ? '👁' : '👁‍🗨';
            visSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleLayerVisibility(index);
            });

            const previewDiv = document.createElement('div');
            previewDiv.className = 'layer-preview';
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = 36;
            previewCanvas.height = 28;
            const previewCtx = previewCanvas.getContext('2d');
            previewCtx.drawImage(layer.canvas, 0, 0, 36, 28);
            previewDiv.appendChild(previewCanvas);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'layer-name';
            nameSpan.textContent = layer.name;

            li.appendChild(visSpan);
            li.appendChild(previewDiv);
            li.appendChild(nameSpan);

            li.addEventListener('click', () => {
                this.activeLayerIndex = index;
                this.updateLayerPanel();
            });

            list.appendChild(li);
        });
    }

    updateLayerPreviews() {
        const previewCanvases = document.querySelectorAll('.layer-preview canvas');
        previewCanvases.forEach((canvas, index) => {
            if (this.layers[index]) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 36, 28);
                ctx.drawImage(this.layers[index].canvas, 0, 0, 36, 28);
            }
        });
    }

    updateStatusBar() {
        const toolNames = { brush: '画笔工具', select: '矩形选框' };
        document.getElementById('status-tool').textContent = toolNames[this.currentTool] || this.currentTool;
        const selSpan = document.getElementById('status-selection');
        if (this.selection) {
            selSpan.textContent = `选区: ${this.selection.x}, ${this.selection.y}, ${this.selection.w}×${this.selection.h}`;
        } else {
            selSpan.textContent = '';
        }
    }
}

const app = new MiniPhotoshop();
