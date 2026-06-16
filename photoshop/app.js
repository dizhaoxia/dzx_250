class Layer {
    constructor(name, width, height, isBackground = false, type = 'normal') {
        this.name = name;
        this.visible = true;
        this.opacity = 100;
        this.type = type;
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
        if (isBackground) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, width, height);
        }
        this.mask = null;
        this.maskEnabled = false;
        this.transform = {
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            offsetX: 0,
            offsetY: 0
        };
        this.smartFilters = [];
        this.filterCache = null;
        this.filterCacheDirty = true;
        this.adjustment = null;
        this.textData = null;
    }

    createMask() {
        if (this.mask) return;
        this.mask = document.createElement('canvas');
        this.mask.width = this.canvas.width;
        this.mask.height = this.canvas.height;
        const mctx = this.mask.getContext('2d');
        mctx.fillStyle = '#ffffff';
        mctx.fillRect(0, 0, this.mask.width, this.mask.height);
        this.maskEnabled = true;
    }

    createMaskFromSelection(selection, width, height) {
        this.createMask();
        const mctx = this.mask.getContext('2d');
        mctx.fillStyle = '#000000';
        mctx.fillRect(0, 0, this.mask.width, this.mask.height);
        if (selection) {
            const { x, y, w, h } = selection;
            mctx.fillStyle = '#ffffff';
            mctx.fillRect(x, y, w, h);
        }
    }

    deleteMask() {
        this.mask = null;
        this.maskEnabled = false;
    }

    getImageData() {
        return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    putImageData(imageData) {
        this.ctx.putImageData(imageData, 0, 0);
        this.filterCacheDirty = true;
    }

    clone() {
        const layer = new Layer(this.name, this.canvas.width, this.canvas.height, false, this.type);
        layer.visible = this.visible;
        layer.opacity = this.opacity;
        layer.ctx.drawImage(this.canvas, 0, 0);
        layer.transform = { ...this.transform };
        layer.smartFilters = this.smartFilters.map(f => ({ ...f }));
        layer.filterCacheDirty = true;
        layer.adjustment = this.adjustment ? { ...this.adjustment } : null;
        layer.textData = this.textData ? { ...this.textData } : null;
        if (this.mask) {
            layer.mask = document.createElement('canvas');
            layer.mask.width = this.mask.width;
            layer.mask.height = this.mask.height;
            layer.mask.getContext('2d').drawImage(this.mask, 0, 0);
            layer.maskEnabled = this.maskEnabled;
        }
        return layer;
    }

    addSmartFilter(type, params) {
        this.smartFilters.push({ type, params: { ...params } });
        this.filterCacheDirty = true;
    }

    updateSmartFilter(index, params) {
        if (this.smartFilters[index]) {
            this.smartFilters[index].params = { ...params };
            this.filterCacheDirty = true;
        }
    }

    removeSmartFilter(index) {
        this.smartFilters.splice(index, 1);
        this.filterCacheDirty = true;
    }
}

class AdjustmentLayer extends Layer {
    constructor(name, width, height, type, params = {}) {
        super(name, width, height, false, 'adjustment');
        this.adjustment = {
            type: type,
            params: {
                brightness: params.brightness || 0,
                contrast: params.contrast || 0,
                hue: params.hue || 0,
                saturation: params.saturation || 0,
                lightness: params.lightness || 0
            }
        };
    }
}

class TextLayer extends Layer {
    constructor(name, width, height, textData) {
        super(name, width, height, false, 'text');
        this.textData = {
            text: textData.text || '文字',
            x: textData.x || 100,
            y: textData.y || 100,
            fontSize: textData.fontSize || 24,
            fontFamily: textData.fontFamily || 'Arial',
            color: textData.color || '#000000',
            bold: textData.bold || false,
            italic: textData.italic || false,
            align: textData.align || 'left'
        };
        this.renderText();
    }

    renderText() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        const style = `${this.textData.italic ? 'italic ' : ''}${this.textData.bold ? 'bold ' : ''}${this.textData.fontSize}px ${this.textData.fontFamily}`;
        this.ctx.font = style;
        this.ctx.fillStyle = this.textData.color;
        this.ctx.textAlign = this.textData.align;
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(this.textData.text, this.textData.x, this.textData.y);
        this.ctx.restore();
    }

    updateText(newData) {
        this.textData = { ...this.textData, ...newData };
        this.renderText();
        this.filterCacheDirty = true;
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
        this.selectionMask = null;
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
        this.wandTolerance = 32;
        this.smartFilterMode = false;
        this.transformMode = false;
        this.transformHandles = null;
        this.activeTransformHandle = null;
        this.transformStartData = null;
        this.textEditing = null;
        this.gradientType = 'linear';
        this.gradientStops = [
            { offset: 0, color: '#ffffff' },
            { offset: 1, color: '#000000' }
        ];
        this.gradientStart = null;
        this.gradientEnd = null;
        this.editingMask = false;
        this.maskBrushColor = '#ffffff';
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
        this.bindNewEvents();
    }

    startMarchingAnts() {
        if (this.marchingAntsTimer) return;
        this.marchingAntsTimer = setInterval(() => {
            this.marchingAntsOffset = (this.marchingAntsOffset + 1) % 8;
            this.renderSelection();
            if (this.transformMode) this.renderTransformHandles();
        }, 100);
    }

    addLayer(name, isBackground = false, type = 'normal', extra = {}) {
        let layer;
        if (type === 'text') {
            layer = new TextLayer(name || `文字 ${this.layerCounter}`, this.canvasWidth, this.canvasHeight, extra.textData || {});
        } else if (type === 'adjustment') {
            layer = new AdjustmentLayer(name || extra.adjustName || '调整图层', this.canvasWidth, this.canvasHeight, extra.adjustType, extra.adjustParams);
        } else {
            layer = new Layer(name || `图层 ${this.layerCounter}`, this.canvasWidth, this.canvasHeight, isBackground, 'normal');
        }
        this.layers.unshift(layer);
        this.layerCounter++;
        this.activeLayerIndex = 0;
        this.updateLayerPanel();
        this.render();
    }

    duplicateLayer() {
        const layer = this.getActiveLayer();
        if (!layer) return;
        let newLayer;
        if (layer.type === 'text') {
            newLayer = new TextLayer(layer.name + ' 副本', this.canvasWidth, this.canvasHeight, layer.textData);
            newLayer.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
            newLayer.ctx.drawImage(layer.canvas, 0, 0);
            newLayer.smartFilters = layer.smartFilters.map(f => ({ ...f }));
        } else if (layer.type === 'adjustment') {
            newLayer = new AdjustmentLayer(layer.name + ' 副本', this.canvasWidth, this.canvasHeight, layer.adjustment.type, layer.adjustment.params);
        } else {
            newLayer = layer.clone();
            newLayer.name = layer.name + ' 副本';
        }
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
        this.renderLayersToCanvas(mergedLayer.ctx, visibleLayers);

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
        this.selectionMask = null;
        this.isMovingSelection = false;
        this.clearPreview();
        this.renderSelection();
        this.updateStatusBar();
    }

    fillSelection() {
        const layer = this.getActiveLayer();
        if (!layer || !layer.visible) return;
        if (this.editingMask && layer.mask) {
            const { x, y, w, h } = this.selection || { x: 0, y: 0, w: this.canvasWidth, h: this.canvasHeight };
            const mctx = layer.mask.getContext('2d');
            mctx.save();
            mctx.fillStyle = this.maskBrushColor;
            mctx.fillRect(x, y, w, h);
            mctx.restore();
            this.saveHistoryState();
            this.render();
            return;
        }
        if (!this.selection) return;

        const { x, y, w, h } = this.selection;
        const ctx = layer.ctx;
        ctx.save();
        ctx.globalAlpha = this.brushOpacity / 100;
        ctx.fillStyle = this.brushColor;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        layer.filterCacheDirty = true;
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
        layer.filterCacheDirty = true;

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

    renderLayersToCanvas(ctx, layerList) {
        for (let i = layerList.length - 1; i >= 0; i--) {
            const layer = layerList[i];
            if (layer.visible) {
                this.renderSingleLayer(ctx, layer);
            }
        }
    }

    renderSingleLayer(ctx, layer) {
        const sourceCanvas = this.getProcessedLayerCanvas(layer);
        if (!sourceCanvas) return;

        ctx.save();
        ctx.globalAlpha = layer.opacity / 100;

        const t = layer.transform;
        const cx = this.canvasWidth / 2;
        const cy = this.canvasHeight / 2;

        ctx.translate(cx + t.offsetX, cy + t.offsetY);
        ctx.rotate(t.rotation * Math.PI / 180);
        ctx.scale(t.scaleX, t.scaleY);
        ctx.translate(-cx, -cy);

        if (layer.mask && layer.maskEnabled) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.canvasWidth;
            tempCanvas.height = this.canvasHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(sourceCanvas, 0, 0);
            tempCtx.globalCompositeOperation = 'destination-in';
            tempCtx.drawImage(layer.mask, 0, 0);
            ctx.drawImage(tempCanvas, 0, 0);
        } else {
            ctx.drawImage(sourceCanvas, 0, 0);
        }

        ctx.restore();

        if (layer.type === 'adjustment' && layer.adjustment) {
            this.applyAdjustmentToContext(ctx, layer.adjustment);
        }
    }

    getProcessedLayerCanvas(layer) {
        if (layer.smartFilters && layer.smartFilters.length > 0) {
            if (!layer.filterCache || layer.filterCacheDirty) {
                const cacheCanvas = document.createElement('canvas');
                cacheCanvas.width = layer.canvas.width;
                cacheCanvas.height = layer.canvas.height;
                const cacheCtx = cacheCanvas.getContext('2d');
                cacheCtx.drawImage(layer.canvas, 0, 0);

                let imageData = cacheCtx.getImageData(0, 0, cacheCanvas.width, cacheCanvas.height);
                let data = new Uint8ClampedArray(imageData.data);

                for (const filter of layer.smartFilters) {
                    const output = new Uint8ClampedArray(data);
                    if (filter.type === 'blur') {
                        this.processBlur(data, output, cacheCanvas.width, cacheCanvas.height, filter.params.strength || 3);
                    } else if (filter.type === 'sharpen') {
                        this.processSharpen(data, output, cacheCanvas.width, cacheCanvas.height, filter.params.strength || 3);
                    }
                    data = output;
                }

                const finalData = new ImageData(data, cacheCanvas.width, cacheCanvas.height);
                cacheCtx.putImageData(finalData, 0, 0);
                layer.filterCache = cacheCanvas;
                layer.filterCacheDirty = false;
            }
            return layer.filterCache;
        }
        return layer.canvas;
    }

    applyAdjustmentToContext(ctx, adjustment) {
        const imageData = ctx.getImageData(0, 0, this.canvasWidth, this.canvasHeight);
        const { data } = imageData;
        const { type, params } = adjustment;

        if (type === 'brightness_contrast') {
            const brightness = params.brightness || 0;
            const contrast = params.contrast || 0;
            const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            for (let i = 0; i < data.length; i += 4) {
                data[i] = Math.max(0, Math.min(255, contrastFactor * (data[i] - 128) + 128 + brightness));
                data[i + 1] = Math.max(0, Math.min(255, contrastFactor * (data[i + 1] - 128) + 128 + brightness));
                data[i + 2] = Math.max(0, Math.min(255, contrastFactor * (data[i + 2] - 128) + 128 + brightness));
            }
        } else if (type === 'hue_saturation') {
            const hue = params.hue || 0;
            const sat = params.saturation || 0;
            const light = params.lightness || 0;
            for (let i = 0; i < data.length; i += 4) {
                const { h, s, l } = this.rgbToHsl(data[i], data[i + 1], data[i + 2]);
                const newH = (h + hue / 360 + 1) % 1;
                const newS = Math.max(0, Math.min(1, s + sat / 100));
                const newL = Math.max(0, Math.min(1, l + light / 100));
                const { r, g, b } = this.hslToRgb(newH, newS, newL);
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h, s, l };
    }

    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    render() {
        this.mainCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.renderLayersToCanvas(this.mainCtx, this.layers);
        this.renderSelection();
        if (this.transformMode) this.renderTransformHandles();
        this.updateLayerPreviews();
    }

    renderSelection() {
        this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        if (this.selectionMask) {
            this.renderSelectionFromMask();
        } else if (this.selection) {
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

    renderSelectionFromMask() {
        if (!this.selectionMask) return;
        const maskCtx = this.selectionMask.getContext('2d');
        const maskData = maskCtx.getImageData(0, 0, this.canvasWidth, this.canvasHeight).data;

        this.overlayCtx.save();
        const imageData = this.overlayCtx.createImageData(this.canvasWidth, this.canvasHeight);
        for (let i = 0; i < maskData.length; i += 4) {
            const maskVal = maskData[i];
            if (maskVal > 128) {
                const pos = (i / 4);
                const x = pos % this.canvasWidth;
                const y = Math.floor(pos / this.canvasWidth);
                const isAnt = (Math.floor(x / 4) + Math.floor(y / 4) + Math.floor(this.marchingAntsOffset / 4)) % 2 === 0;
                if (isAnt) {
                    imageData.data[i] = 0;
                    imageData.data[i + 1] = 0;
                    imageData.data[i + 2] = 0;
                    imageData.data[i + 3] = 255;
                } else {
                    imageData.data[i] = 255;
                    imageData.data[i + 1] = 255;
                    imageData.data[i + 2] = 255;
                    imageData.data[i + 3] = 255;
                }
            } else if (maskVal > 0) {
                imageData.data[i] = 0;
                imageData.data[i + 1] = 120;
                imageData.data[i + 2] = 212;
                imageData.data[i + 3] = Math.floor(maskVal * 0.3);
            }
        }
        this.overlayCtx.putImageData(imageData, 0, 0);
        this.overlayCtx.restore();
    }

    clearPreview() {
        this.previewCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    saveHistoryState() {
        const state = this.layers.map(layer => ({
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity,
            type: layer.type,
            imageData: layer.getImageData(),
            maskData: layer.mask ? layer.mask.getContext('2d').getImageData(0, 0, layer.mask.width, layer.mask.height) : null,
            maskEnabled: layer.maskEnabled,
            transform: { ...layer.transform },
            smartFilters: layer.smartFilters.map(f => ({ ...f })),
            adjustment: layer.adjustment ? { type: layer.adjustment.type, params: { ...layer.adjustment.params } } : null,
            textData: layer.textData ? { ...layer.textData } : null
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
            let layer;
            if (layerState.type === 'text') {
                layer = new TextLayer(layerState.name, this.canvasWidth, this.canvasHeight, layerState.textData);
            } else if (layerState.type === 'adjustment') {
                layer = new AdjustmentLayer(layerState.name, this.canvasWidth, this.canvasHeight, layerState.adjustment.type, layerState.adjustment.params);
            } else {
                layer = new Layer(layerState.name, this.canvasWidth, this.canvasHeight, false, layerState.type || 'normal');
            }
            layer.visible = layerState.visible;
            layer.opacity = layerState.opacity;
            layer.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
            layer.putImageData(layerState.imageData);
            layer.transform = { ...layerState.transform };
            layer.smartFilters = layerState.smartFilters.map(f => ({ ...f }));
            layer.filterCacheDirty = true;
            layer.adjustment = layerState.adjustment ? { type: layerState.adjustment.type, params: { ...layerState.adjustment.params } } : null;
            layer.textData = layerState.textData ? { ...layerState.textData } : null;
            if (layerState.maskData) {
                layer.mask = document.createElement('canvas');
                layer.mask.width = this.canvasWidth;
                layer.mask.height = this.canvasHeight;
                layer.mask.getContext('2d').putImageData(layerState.maskData, 0, 0);
                layer.maskEnabled = layerState.maskEnabled;
            }
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
        if (this.selectionMask) {
            const maskCtx = this.selectionMask.getContext('2d');
            try {
                const pixel = maskCtx.getImageData(x, y, 1, 1).data;
                return pixel[0] > 128;
            } catch (e) { return false; }
        }
        if (!this.selection) return false;
        const { x: sx, y: sy, w: sw, h: sh } = this.selection;
        return x >= sx && x <= sx + sw && y >= sy && y <= sy + sh;
    }

    drawBrush(x, y, isEraser = false) {
        const layer = this.getActiveLayer();
        if (!layer || !layer.visible) return;

        const targetCanvas = this.editingMask && layer.mask ? layer.mask : layer.canvas;
        const ctx = targetCanvas.getContext('2d');
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

        if (this.editingMask) {
            ctx.strokeStyle = this.maskBrushColor;
            ctx.fillStyle = this.maskBrushColor;
        } else if (isEraser) {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.strokeStyle = this.brushColor;
            ctx.fillStyle = this.brushColor;
        }

        const doClip = !this.editingMask && this.selection;
        if (doClip) {
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
        if (!this.editingMask) layer.filterCacheDirty = true;
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

        if (this.smartFilterMode) {
            layer.addSmartFilter(type, { strength: this.filterStrength });
            this.isApplyingFilter = false;
            this.currentFilter = null;
            this.saveHistoryState();
            this.render();
            this.updateLayerPanel();
            return;
        }

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

    magicWandSelect(x, y, tolerance) {
        const layer = this.getActiveLayer();
        if (!layer) return;

        try {
            const imageData = layer.ctx.getImageData(0, 0, this.canvasWidth, this.canvasHeight);
            const { data, width, height } = imageData;

            const startIdx = (y * width + x) * 4;
            const startR = data[startIdx];
            const startG = data[startIdx + 1];
            const startB = data[startIdx + 2];
            const startA = data[startIdx + 3];

            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const mctx = maskCanvas.getContext('2d');
            const maskImageData = mctx.createImageData(width, height);
            const maskData = maskImageData.data;

            const visited = new Uint8Array(width * height);
            const stack = [[x, y]];

            while (stack.length > 0) {
                const [cx, cy] = stack.pop();
                const cidx = cy * width + cx;

                if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
                if (visited[cidx]) continue;

                visited[cidx] = 1;
                const idx = cidx * 4;

                const dr = Math.abs(data[idx] - startR);
                const dg = Math.abs(data[idx + 1] - startG);
                const db = Math.abs(data[idx + 2] - startB);
                const da = Math.abs(data[idx + 3] - startA);

                if (dr <= tolerance && dg <= tolerance && db <= tolerance && da <= tolerance) {
                    maskData[idx] = 255;
                    maskData[idx + 1] = 255;
                    maskData[idx + 2] = 255;
                    maskData[idx + 3] = 255;

                    stack.push([cx + 1, cy]);
                    stack.push([cx - 1, cy]);
                    stack.push([cx, cy + 1]);
                    stack.push([cx, cy - 1]);
                }
            }

            mctx.putImageData(maskImageData, 0, 0);
            this.selectionMask = maskCanvas;
            this.selection = this.getMaskBoundingBox(maskCanvas);
            this.renderSelection();
            this.updateStatusBar();
        } catch (e) {
            console.error('Magic wand error:', e);
        }
    }

    getMaskBoundingBox(maskCanvas) {
        const ctx = maskCanvas.getContext('2d');
        const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
        let minX = maskCanvas.width, minY = maskCanvas.height, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < maskCanvas.height; y++) {
            for (let x = 0; x < maskCanvas.width; x++) {
                const idx = (y * maskCanvas.width + x) * 4;
                if (data[idx] > 128) {
                    found = true;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (!found) return null;
        return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    enterTransformMode() {
        const layer = this.getActiveLayer();
        if (!layer) return;
        if (!this.selection && !layer.textData) {
            this.selection = { x: 0, y: 0, w: this.canvasWidth, h: this.canvasHeight };
        }
        this.transformMode = true;
        this.renderTransformHandles();
        this.updateStatusBar();
    }

    exitTransformMode(apply = true) {
        this.transformMode = false;
        this.activeTransformHandle = null;
        this.transformStartData = null;
        if (!apply) {
            this.restoreState(this.history.states[this.history.currentIndex]);
        } else {
            this.applyTransformToLayer();
            this.saveHistoryState();
        }
        this.render();
        this.updateStatusBar();
    }

    applyTransformToLayer() {
        const layer = this.getActiveLayer();
        if (!layer) return;
        const t = layer.transform;
        const sel = this.selection || { x: 0, y: 0, w: this.canvasWidth, h: this.canvasHeight };

        if (t.scaleX === 1 && t.scaleY === 1 && t.rotation === 0 && t.offsetX === 0 && t.offsetY === 0) {
            return;
        }

        const srcX = Math.max(0, sel.x);
        const srcY = Math.max(0, sel.y);
        const srcW = Math.min(this.canvasWidth, sel.x + sel.w) - srcX;
        const srcH = Math.min(this.canvasHeight, sel.y + sel.h) - srcY;
        if (srcW <= 0 || srcH <= 0) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = srcW;
        tempCanvas.height = srcH;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(layer.canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

        const newW = Math.max(1, Math.round(srcW * Math.abs(t.scaleX)));
        const newH = Math.max(1, Math.round(srcH * Math.abs(t.scaleY)));

        const transformed = this.bilinearTransform(tempCanvas, srcW, srcH, newW, newH, t.scaleX, t.scaleY, t.rotation);

        const cx = srcX + srcW / 2;
        const cy = srcY + srcH / 2;
        const dx = cx - transformed.width / 2 + t.offsetX;
        const dy = cy - transformed.height / 2 + t.offsetY;

        const lctx = layer.ctx;
        lctx.save();
        lctx.globalCompositeOperation = 'destination-out';
        lctx.fillRect(srcX, srcY, srcW, srcH);
        lctx.restore();
        lctx.drawImage(transformed, Math.round(dx), Math.round(dy));
        layer.filterCacheDirty = true;

        layer.transform = { scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 };
    }

    bilinearTransform(srcCanvas, srcW, srcH, dstW, dstH, scaleX, scaleY, rotation) {
        const result = document.createElement('canvas');
        const angle = rotation * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const corners = [
            [0, 0], [srcW, 0], [srcW, srcH], [0, srcH]
        ];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [cx, cy] of corners) {
            const nx = cx * scaleX;
            const ny = cy * scaleY;
            const rx = nx * cos - ny * sin;
            const ry = nx * sin + ny * cos;
            if (rx < minX) minX = rx;
            if (rx > maxX) maxX = rx;
            if (ry < minY) minY = ry;
            if (ry > maxY) maxY = ry;
        }
        const outW = Math.ceil(maxX - minX);
        const outH = Math.ceil(maxY - minY);
        result.width = Math.max(1, outW);
        result.height = Math.max(1, outH);

        const resCtx = result.getContext('2d');
        const outData = resCtx.createImageData(result.width, result.height);
        const srcData = srcCanvas.getContext('2d').getImageData(0, 0, srcW, srcH).data;

        const invCos = Math.cos(-angle);
        const invSin = Math.sin(-angle);
        const invScaleX = 1 / scaleX;
        const invScaleY = 1 / scaleY;
        const offsetX = (minX + maxX) / 2;
        const offsetY = (minY + maxY) / 2;
        const origOffsetX = (srcW * scaleX) / 2;
        const origOffsetY = (srcH * scaleY) / 2;

        for (let y = 0; y < result.height; y++) {
            for (let x = 0; x < result.width; x++) {
                const idx = (y * result.width + x) * 4;

                const tx1 = x - result.width / 2 + offsetX;
                const ty1 = y - result.height / 2 + offsetY;
                const tx2 = tx1 * invCos - ty1 * invSin;
                const ty2 = tx1 * invSin + ty1 * invCos;
                const tx3 = (tx2 + origOffsetX) * invScaleX;
                const ty3 = (ty2 + origOffsetY) * invScaleY;

                if (tx3 < 0 || tx3 >= srcW - 1 || ty3 < 0 || ty3 >= srcH - 1) {
                    continue;
                }

                const x0 = Math.floor(tx3);
                const y0 = Math.floor(ty3);
                const x1 = Math.min(srcW - 1, x0 + 1);
                const y1 = Math.min(srcH - 1, y0 + 1);
                const fx = tx3 - x0;
                const fy = ty3 - y0;

                const i00 = (y0 * srcW + x0) * 4;
                const i10 = (y0 * srcW + x1) * 4;
                const i01 = (y1 * srcW + x0) * 4;
                const i11 = (y1 * srcW + x1) * 4;

                for (let c = 0; c < 4; c++) {
                    const v00 = srcData[i00 + c];
                    const v10 = srcData[i10 + c];
                    const v01 = srcData[i01 + c];
                    const v11 = srcData[i11 + c];
                    const top = v00 * (1 - fx) + v10 * fx;
                    const bottom = v01 * (1 - fx) + v11 * fx;
                    outData[idx + c] = Math.round(top * (1 - fy) + bottom * fy);
                }
            }
        }
        resCtx.putImageData(outData, 0, 0);
        return result;
    }

    getTransformHandles() {
        const sel = this.selection || { x: 0, y: 0, w: this.canvasWidth, h: this.canvasHeight };
        const layer = this.getActiveLayer();
        const t = layer ? layer.transform : { scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 };

        const cx = sel.x + sel.w / 2 + t.offsetX;
        const cy = sel.y + sel.h / 2 + t.offsetY;
        const hw = (sel.w * t.scaleX) / 2;
        const hh = (sel.h * t.scaleY) / 2;
        const angle = t.rotation * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const rotatePoint = (px, py) => {
            const dx = px - cx;
            const dy = py - cy;
            return {
                x: cx + dx * cos - dy * sin,
                y: cy + dx * sin + dy * cos
            };
        };

        return {
            nw: rotatePoint(cx - hw, cy - hh),
            n: rotatePoint(cx, cy - hh),
            ne: rotatePoint(cx + hw, cy - hh),
            e: rotatePoint(cx + hw, cy),
            se: rotatePoint(cx + hw, cy + hh),
            s: rotatePoint(cx, cy + hh),
            sw: rotatePoint(cx - hw, cy + hh),
            w: rotatePoint(cx - hw, cy),
            rotate: rotatePoint(cx, cy - hh - 30),
            center: { x: cx, y: cy },
            bounds: sel
        };
    }

    renderTransformHandles() {
        const handles = this.getTransformHandles();
        this.overlayCtx.save();

        this.overlayCtx.strokeStyle = '#0078d4';
        this.overlayCtx.lineWidth = 1;
        this.overlayCtx.setLineDash([4, 4]);
        this.overlayCtx.lineDashOffset = -this.marchingAntsOffset;
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(handles.nw.x, handles.nw.y);
        this.overlayCtx.lineTo(handles.ne.x, handles.ne.y);
        this.overlayCtx.lineTo(handles.se.x, handles.se.y);
        this.overlayCtx.lineTo(handles.sw.x, handles.sw.y);
        this.overlayCtx.closePath();
        this.overlayCtx.stroke();
        this.overlayCtx.setLineDash([]);

        this.overlayCtx.strokeStyle = '#0078d4';
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(handles.n.x, handles.n.y);
        this.overlayCtx.lineTo(handles.rotate.x, handles.rotate.y);
        this.overlayCtx.stroke();

        const handleSize = 8;
        const drawHandle = (pos, color = '#fff') => {
            this.overlayCtx.fillStyle = color;
            this.overlayCtx.strokeStyle = '#0078d4';
            this.overlayCtx.lineWidth = 1;
            this.overlayCtx.fillRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
            this.overlayCtx.strokeRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
        };

        drawHandle(handles.nw);
        drawHandle(handles.n);
        drawHandle(handles.ne);
        drawHandle(handles.e);
        drawHandle(handles.se);
        drawHandle(handles.s);
        drawHandle(handles.sw);
        drawHandle(handles.w);

        this.overlayCtx.fillStyle = '#ffff00';
        this.overlayCtx.strokeStyle = '#0078d4';
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(handles.rotate.x, handles.rotate.y, 6, 0, Math.PI * 2);
        this.overlayCtx.fill();
        this.overlayCtx.stroke();

        this.overlayCtx.fillStyle = '#0078d4';
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(handles.center.x, handles.center.y, 3, 0, Math.PI * 2);
        this.overlayCtx.fill();

        this.overlayCtx.restore();
    }

    hitTestTransformHandle(x, y) {
        const handles = this.getTransformHandles();
        const hitRadius = 10;
        const dist = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

        if (dist({ x, y }, handles.rotate) < hitRadius) return 'rotate';
        if (dist({ x, y }, handles.nw) < hitRadius) return 'nw';
        if (dist({ x, y }, handles.n) < hitRadius) return 'n';
        if (dist({ x, y }, handles.ne) < hitRadius) return 'ne';
        if (dist({ x, y }, handles.e) < hitRadius) return 'e';
        if (dist({ x, y }, handles.se) < hitRadius) return 'se';
        if (dist({ x, y }, handles.s) < hitRadius) return 's';
        if (dist({ x, y }, handles.sw) < hitRadius) return 'sw';
        if (dist({ x, y }, handles.w) < hitRadius) return 'w';

        const sel = handles.bounds;
        const layer = this.getActiveLayer();
        const t = layer.transform;
        const angle = t.rotation * Math.PI / 180;
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);
        const cx = sel.x + sel.w / 2 + t.offsetX;
        const cy = sel.y + sel.h / 2 + t.offsetY;
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        const hw = (sel.w * t.scaleX) / 2;
        const hh = (sel.h * t.scaleY) / 2;
        if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return 'move';

        return null;
    }

    startTransform(x, y, handle) {
        const layer = this.getActiveLayer();
        if (!layer) return;
        this.activeTransformHandle = handle;
        this.transformStartData = {
            x, y,
            transform: { ...layer.transform },
            selection: { ...this.selection }
        };
    }

    updateTransform(x, y, shiftKey) {
        if (!this.activeTransformHandle || !this.transformStartData) return;
        const layer = this.getActiveLayer();
        if (!layer) return;

        const dx = x - this.transformStartData.x;
        const dy = y - this.transformStartData.y;
        const sel = this.transformStartData.selection;
        const origT = this.transformStartData.transform;
        const handle = this.activeTransformHandle;

        if (handle === 'move') {
            layer.transform.offsetX = origT.offsetX + dx;
            layer.transform.offsetY = origT.offsetY + dy;
        } else if (handle === 'rotate') {
            const cx = sel.x + sel.w / 2 + origT.offsetX;
            const cy = sel.y + sel.h / 2 + origT.offsetY;
            const angle1 = Math.atan2(this.transformStartData.y - cy, this.transformStartData.x - cx);
            const angle2 = Math.atan2(y - cy, x - cx);
            let deg = ((angle2 - angle1) * 180 / Math.PI);
            if (shiftKey) {
                deg = Math.round(deg / 15) * 15;
            }
            layer.transform.rotation = origT.rotation + deg;
        } else {
            let scaleX = origT.scaleX;
            let scaleY = origT.scaleY;

            const baseW = sel.w;
            const baseH = sel.h;

            if (handle.includes('e')) {
                scaleX = origT.scaleX * (baseW + dx) / baseW;
            }
            if (handle.includes('w')) {
                scaleX = origT.scaleX * (baseW - dx) / baseW;
            }
            if (handle.includes('s')) {
                scaleY = origT.scaleY * (baseH + dy) / baseH;
            }
            if (handle.includes('n')) {
                scaleY = origT.scaleY * (baseH - dy) / baseH;
            }

            if (shiftKey || handle.length === 1) {
                if (handle.length === 2) {
                    const avg = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
                    scaleX = avg * Math.sign(scaleX || 1);
                    scaleY = avg * Math.sign(scaleY || 1);
                }
            }

            scaleX = Math.max(-5, Math.min(5, scaleX)) || 0.01;
            scaleY = Math.max(-5, Math.min(5, scaleY)) || 0.01;

            layer.transform.scaleX = scaleX;
            layer.transform.scaleY = scaleY;
        }

        this.render();
    }

    applyGradient() {
        const layer = this.getActiveLayer();
        if (!layer || !layer.visible || !this.gradientStart || !this.gradientEnd) return;

        const ctx = layer.ctx;
        ctx.save();
        ctx.globalAlpha = this.brushOpacity / 100;

        let gradient;
        if (this.gradientType === 'linear') {
            gradient = ctx.createLinearGradient(
                this.gradientStart.x, this.gradientStart.y,
                this.gradientEnd.x, this.gradientEnd.y
            );
        } else {
            const dx = this.gradientEnd.x - this.gradientStart.x;
            const dy = this.gradientEnd.y - this.gradientStart.y;
            const radius = Math.sqrt(dx * dx + dy * dy);
            gradient = ctx.createRadialGradient(
                this.gradientStart.x, this.gradientStart.y, 0,
                this.gradientStart.x, this.gradientStart.y, radius
            );
        }

        for (const stop of this.gradientStops) {
            gradient.addColorStop(stop.offset, stop.color);
        }

        if (this.selection) {
            const { x, y, w, h } = this.selection;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
            ctx.restore();
        } else {
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        }

        ctx.restore();
        layer.filterCacheDirty = true;
        this.gradientStart = null;
        this.gradientEnd = null;
        this.saveHistoryState();
        this.render();
    }

    createTextLayer(x, y) {
        this.addLayer(null, false, 'text', {
            textData: {
                text: '文字',
                x: x,
                y: y,
                fontSize: 24,
                fontFamily: 'Arial',
                color: this.brushColor,
                bold: false,
                italic: false,
                align: 'left'
            }
        });
        this.textEditing = {
            layerIndex: 0,
            inputX: x,
            inputY: y
        };
        this.showTextEditor();
        this.saveHistoryState();
    }

    showTextEditor() {
        if (!this.textEditing) return;
        const layer = this.layers[this.textEditing.layerIndex];
        if (!layer || layer.type !== 'text') return;

        const existing = document.getElementById('text-editor-input');
        if (existing) existing.remove();

        const rect = this.mainCanvas.getBoundingClientRect();
        const scaleX = rect.width / this.canvasWidth;
        const scaleY = rect.height / this.canvasHeight;

        const td = layer.textData;
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'text-editor-input';
        input.value = td.text;
        input.style.position = 'fixed';
        input.style.left = (rect.left + td.x * scaleX) + 'px';
        input.style.top = (rect.top + td.y * scaleY) + 'px';
        input.style.fontSize = (td.fontSize * scaleX) + 'px';
        input.style.fontFamily = td.fontFamily;
        input.style.fontWeight = td.bold ? 'bold' : 'normal';
        input.style.fontStyle = td.italic ? 'italic' : 'normal';
        input.style.color = td.color;
        input.style.background = 'rgba(255, 255, 255, 0.9)';
        input.style.border = '1px dashed #0078d4';
        input.style.outline = 'none';
        input.style.padding = '2px 4px';
        input.style.minWidth = '100px';
        input.style.zIndex = '9999';

        document.body.appendChild(input);
        input.focus();
        input.select();

        const finish = (save) => {
            if (save) {
                const newText = input.value;
                if (newText !== td.text) {
                    layer.updateText({ text: newText });
                    this.saveHistoryState();
                }
            }
            input.remove();
            this.textEditing = null;
            this.render();
            this.updateLayerPanel();
        };

        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            }
        });
    }

    createMask() {
        const layer = this.getActiveLayer();
        if (!layer) return;
        if (layer.mask) {
            layer.deleteMask();
        }
        if (this.selection) {
            layer.createMaskFromSelection(this.selection, this.canvasWidth, this.canvasHeight);
        } else {
            layer.createMask();
        }
        this.saveHistoryState();
        this.render();
        this.updateLayerPanel();
    }

    toggleMask() {
        const layer = this.getActiveLayer();
        if (!layer || !layer.mask) return;
        layer.maskEnabled = !layer.maskEnabled;
        this.render();
        this.updateLayerPanel();
    }

    deleteMask() {
        const layer = this.getActiveLayer();
        if (!layer) return;
        layer.deleteMask();
        this.editingMask = false;
        this.saveHistoryState();
        this.render();
        this.updateLayerPanel();
    }

    addBrightnessContrastLayer() {
        this.addLayer(null, false, 'adjustment', {
            adjustName: '亮度/对比度',
            adjustType: 'brightness_contrast',
            adjustParams: { brightness: 0, contrast: 0 }
        });
        this.saveHistoryState();
    }

    addHueSaturationLayer() {
        this.addLayer(null, false, 'adjustment', {
            adjustName: '色相/饱和度',
            adjustType: 'hue_saturation',
            adjustParams: { hue: 0, saturation: 0, lightness: 0 }
        });
        this.saveHistoryState();
    }

    updateAdjustmentParams(params) {
        const layer = this.getActiveLayer();
        if (!layer || layer.type !== 'adjustment') return;
        layer.adjustment.params = { ...layer.adjustment.params, ...params };
        this.render();
    }

    applyAdjustmentChange() {
        const layer = this.getActiveLayer();
        if (!layer || layer.type !== 'adjustment') return;
        this.saveHistoryState();
    }

    updateSmartFilter(filterIndex, params) {
        const layer = this.getActiveLayer();
        if (!layer) return;
        layer.updateSmartFilter(filterIndex, params);
        this.saveHistoryState();
        this.render();
        this.updateLayerPanel();
    }

    removeSmartFilter(filterIndex) {
        const layer = this.getActiveLayer();
        if (!layer) return;
        layer.removeSmartFilter(filterIndex);
        this.saveHistoryState();
        this.render();
        this.updateLayerPanel();
    }

    bindNewEvents() {
        const btnText = document.getElementById('btn-text');
        if (btnText) btnText.addEventListener('click', () => this.setTool('text'));

        const btnWand = document.getElementById('btn-wand');
        if (btnWand) btnWand.addEventListener('click', () => this.setTool('wand'));

        const btnTransform = document.getElementById('btn-transform');
        if (btnTransform) btnTransform.addEventListener('click', () => {
            if (this.transformMode) {
                this.exitTransformMode(true);
            } else {
                this.enterTransformMode();
            }
        });

        const btnGradient = document.getElementById('btn-gradient');
        if (btnGradient) btnGradient.addEventListener('click', () => this.setTool('gradient'));

        const wandTolerance = document.getElementById('wand-tolerance');
        if (wandTolerance) wandTolerance.addEventListener('input', (e) => {
            this.wandTolerance = parseInt(e.target.value);
            document.getElementById('wand-tolerance-val').textContent = this.wandTolerance;
        });

        const smartMode = document.getElementById('smart-filter-mode');
        if (smartMode) smartMode.addEventListener('change', (e) => {
            this.smartFilterMode = e.target.checked;
        });

        const btnAddMask = document.getElementById('btn-add-mask');
        if (btnAddMask) btnAddMask.addEventListener('click', () => this.createMask());

        const btnToggleMask = document.getElementById('btn-toggle-mask');
        if (btnToggleMask) btnToggleMask.addEventListener('click', () => this.toggleMask());

        const btnDeleteMask = document.getElementById('btn-delete-mask');
        if (btnDeleteMask) btnDeleteMask.addEventListener('click', () => this.deleteMask());

        const editMaskMode = document.getElementById('edit-mask-mode');
        if (editMaskMode) editMaskMode.addEventListener('change', (e) => {
            this.editingMask = e.target.checked;
            const layer = this.getActiveLayer();
            if (this.editingMask && layer && !layer.mask) {
                this.createMask();
                editMaskMode.checked = true;
            }
        });

        const maskBrushColor = document.getElementById('mask-brush-color');
        if (maskBrushColor) maskBrushColor.addEventListener('change', (e) => {
            const v = parseInt(e.target.value);
            this.maskBrushColor = v === 0 ? '#000000' : v === 128 ? '#808080' : '#ffffff';
        });

        const btnSelToMask = document.getElementById('btn-selection-to-mask');
        if (btnSelToMask) btnSelToMask.addEventListener('click', () => this.createMask());

        const btnBCLayer = document.getElementById('btn-bc-layer');
        if (btnBCLayer) btnBCLayer.addEventListener('click', () => this.addBrightnessContrastLayer());

        const btnHSLayer = document.getElementById('btn-hs-layer');
        if (btnHSLayer) btnHSLayer.addEventListener('click', () => this.addHueSaturationLayer());

        ['adj-brightness', 'adj-contrast', 'adj-hue', 'adj-saturation', 'adj-lightness'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', (e) => {
                const params = {};
                const key = id.replace('adj-', '');
                const realKey = key === 'lightness' ? 'lightness' : key;
                params[realKey] = parseInt(e.target.value);
                const valEl = document.getElementById(id + '-val');
                if (valEl) valEl.textContent = e.target.value;
                this.updateAdjustmentParams(params);
            });
            el.addEventListener('change', () => this.applyAdjustmentChange());
        });

        const gradientType = document.getElementById('gradient-type');
        if (gradientType) gradientType.addEventListener('change', (e) => {
            this.gradientType = e.target.value;
        });
    }

    bindEvents() {
        this.mainCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.mainCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.mainCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.mainCanvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        this.mainCanvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));

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
            if (this.textEditing) return;
            if (this.transformMode) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.exitTransformMode(true);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.exitTransformMode(false);
                    return;
                }
            }
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
                if (e.key === 't') {
                    e.preventDefault();
                    if (this.transformMode) {
                        this.exitTransformMode(true);
                    } else {
                        this.enterTransformMode();
                    }
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
            if (e.key === 'w' || e.key === 'W') {
                this.setTool('wand');
            }
            if (e.key === 't' || e.key === 'T') {
                if (!e.ctrlKey && !e.metaKey) {
                    this.setTool('text');
                }
            }
            if (e.key === 'g' || e.key === 'G') {
                this.setTool('gradient');
            }
            if (e.key === 'Escape') {
                this.clearSelection();
                this.textEditing = null;
                const input = document.getElementById('text-editor-input');
                if (input) input.remove();
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
            'moveSelection': 'btn-move-selection',
            'text': 'btn-text',
            'wand': 'btn-wand',
            'gradient': 'btn-gradient'
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
        } else if (tool === 'text') {
            this.mainCanvas.style.cursor = 'text';
        } else if (tool === 'wand') {
            this.mainCanvas.style.cursor = 'crosshair';
        } else if (tool === 'gradient') {
            this.mainCanvas.style.cursor = 'crosshair';
        } else {
            this.mainCanvas.style.cursor = 'crosshair';
        }

        this.updateStatusBar();
    }

    onDoubleClick(e) {
        const coords = this.getCanvasCoords(e);
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            if (layer.type === 'text' && layer.textData) {
                const ctx = layer.ctx;
                const style = `${layer.textData.italic ? 'italic ' : ''}${layer.textData.bold ? 'bold ' : ''}${layer.textData.fontSize}px ${layer.textData.fontFamily}`;
                ctx.font = style;
                const metrics = ctx.measureText(layer.textData.text);
                const textW = metrics.width;
                const textH = layer.textData.fontSize * 1.2;
                const tx = layer.textData.x;
                const ty = layer.textData.y;
                if (coords.x >= tx && coords.x <= tx + textW && coords.y >= ty && coords.y <= ty + textH) {
                    this.activeLayerIndex = i;
                    this.textEditing = {
                        layerIndex: i,
                        inputX: tx,
                        inputY: ty
                    };
                    this.updateLayerPanel();
                    this.showTextEditor();
                    return;
                }
            }
            if (layer.smartFilters && layer.smartFilters.length > 0) {
                this.activeLayerIndex = i;
                const strength = layer.smartFilters[0].params.strength || 3;
                const newStrength = prompt(`编辑智能滤镜 (${layer.smartFilters[0].type === 'blur' ? '模糊' : '锐化'})\n当前强度: ${strength}\n请输入新的强度 (1-20):`, strength);
                if (newStrength !== null) {
                    const parsed = parseInt(newStrength);
                    if (!isNaN(parsed) && parsed >= 1 && parsed <= 20) {
                        this.updateSmartFilter(0, { strength: parsed });
                    }
                }
                return;
            }
        }
    }

    onMouseDown(e) {
        const coords = this.getCanvasCoords(e);
        const shiftKey = e.shiftKey;

        if (this.transformMode) {
            const handle = this.hitTestTransformHandle(coords.x, coords.y);
            if (handle) {
                this.startTransform(coords.x, coords.y, handle);
                return;
            }
        }

        if (this.currentTool === 'text') {
            this.createTextLayer(coords.x, coords.y);
            return;
        }

        if (this.currentTool === 'wand') {
            this.magicWandSelect(coords.x, coords.y, this.wandTolerance);
            return;
        }

        if (this.currentTool === 'gradient') {
            this.gradientStart = coords;
            this.gradientEnd = coords;
            this.isDrawing = true;
            this.renderGradientPreview();
            return;
        }

        if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.isDrawing = true;
            this.lastX = coords.x;
            this.lastY = coords.y;
            this.lastTime = Date.now();
            this.lastSpeed = 0;

            const layer = this.getActiveLayer();
            if (layer && layer.visible) {
                const targetCanvas = this.editingMask && layer.mask ? layer.mask : layer.canvas;
                const ctx = targetCanvas.getContext('2d');
                const isEraser = this.currentTool === 'eraser';
                const opacity = this.brushOpacity / 100;

                ctx.save();
                ctx.globalAlpha = opacity;
                if (this.editingMask) {
                    ctx.fillStyle = this.maskBrushColor;
                } else if (isEraser) {
                    ctx.globalCompositeOperation = 'destination-out';
                } else {
                    ctx.fillStyle = this.brushColor;
                }

                const doClip = !this.editingMask && this.selection;
                if (doClip) {
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
                if (!this.editingMask) layer.filterCacheDirty = true;
                this.render();
            }
        } else if (this.currentTool === 'select') {
            this.isSelecting = true;
            this.selectionStart = coords;
            this.selection = null;
            this.selectionMask = null;
            this.clearPreview();
            this.renderSelection();
        } else if (this.currentTool === 'moveSelection' && this.selection && this.isInSelection(coords.x, coords.y)) {
            this.isMovingSelection = true;
            this.selectionMoveStart = { x: coords.x, y: coords.y };
            this.selectionStart = { ...this.selection };
        }
    }

    renderGradientPreview() {
        if (!this.gradientStart || !this.gradientEnd) return;
        this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.renderSelection();
        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = '#ffff00';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(this.gradientStart.x, this.gradientStart.y);
        this.overlayCtx.lineTo(this.gradientEnd.x, this.gradientEnd.y);
        this.overlayCtx.stroke();

        this.overlayCtx.fillStyle = '#0078d4';
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(this.gradientStart.x, this.gradientStart.y, 6, 0, Math.PI * 2);
        this.overlayCtx.fill();
        this.overlayCtx.fillStyle = '#ffff00';
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(this.gradientEnd.x, this.gradientEnd.y, 6, 0, Math.PI * 2);
        this.overlayCtx.fill();
        this.overlayCtx.restore();
    }

    onMouseMove(e) {
        const coords = this.getCanvasCoords(e);
        const statusPos = document.getElementById('status-pos');
        if (statusPos) statusPos.textContent = `${coords.x}, ${coords.y}`;

        if (this.transformMode && this.activeTransformHandle) {
            this.updateTransform(coords.x, coords.y, e.shiftKey);
            return;
        }

        if (this.currentTool === 'gradient' && this.isDrawing && this.gradientStart) {
            this.gradientEnd = coords;
            this.renderGradientPreview();
            return;
        }

        if ((this.currentTool === 'brush' || this.currentTool === 'eraser') && this.isDrawing) {
            this.drawBrush(coords.x, coords.y, this.currentTool === 'eraser');
        } else if (this.currentTool === 'select' && this.isSelecting) {
            const x = Math.min(this.selectionStart.x, coords.x);
            const y = Math.min(this.selectionStart.y, coords.y);
            const w = Math.abs(coords.x - this.selectionStart.x);
            const h = Math.abs(coords.y - this.selectionStart.y);
            this.selection = { x, y, w, h };
            this.selectionMask = null;
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
        } else if (this.transformMode) {
            const handle = this.hitTestTransformHandle(coords.x, coords.y);
            const cursorMap = {
                'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
                'n': 'n-resize', 's': 's-resize', 'w': 'w-resize', 'e': 'e-resize',
                'rotate': 'grab', 'move': 'move'
            };
            this.mainCanvas.style.cursor = handle ? (cursorMap[handle] || 'crosshair') : 'default';
        }
    }

    onMouseUp(e) {
        if (this.transformMode && this.activeTransformHandle) {
            this.activeTransformHandle = null;
            this.transformStartData = null;
            return;
        }

        if (this.currentTool === 'gradient' && this.isDrawing) {
            this.isDrawing = false;
            this.applyGradient();
            return;
        }

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
            if (layer.mask) {
                const maskThumb = document.createElement('canvas');
                maskThumb.width = 16;
                maskThumb.height = 24;
                maskThumb.className = 'mask-thumb';
                maskThumb.title = layer.maskEnabled ? '蒙版 (已启用)' : '蒙版 (已禁用)';
                maskThumb.style.position = 'absolute';
                maskThumb.style.right = '-18px';
                maskThumb.style.top = '0';
                maskThumb.style.border = '1px solid #555';
                const mtctx = maskThumb.getContext('2d');
                mtctx.drawImage(layer.mask, 0, 0, 16, 24);
                previewDiv.style.position = 'relative';
                previewDiv.appendChild(maskThumb);
            }
            previewDiv.appendChild(previewCanvas);

            const typeBadge = document.createElement('span');
            typeBadge.className = 'layer-type-badge';
            typeBadge.textContent = layer.type === 'text' ? 'T' : layer.type === 'adjustment' ? '⚙' : '';
            typeBadge.title = layer.type === 'text' ? '文字图层' : layer.type === 'adjustment' ? '调整图层' : '普通图层';

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

            const smartFilterBadge = document.createElement('span');
            if (layer.smartFilters && layer.smartFilters.length > 0) {
                smartFilterBadge.className = 'smart-filter-badge';
                smartFilterBadge.textContent = '★';
                smartFilterBadge.title = '智能滤镜 (' + layer.smartFilters.length + ' 个) - 双击图层编辑';
            }

            li.appendChild(orderDiv);
            li.appendChild(visSpan);
            li.appendChild(previewDiv);
            li.appendChild(typeBadge);
            li.appendChild(nameSpan);
            if (smartFilterBadge.textContent) li.appendChild(smartFilterBadge);

            li.addEventListener('click', () => {
                this.activeLayerIndex = index;
                document.getElementById('layer-opacity').value = layer.opacity;
                document.getElementById('layer-opacity-val').textContent = layer.opacity + '%';
                if (layer.type === 'adjustment' && layer.adjustment) {
                    const p = layer.adjustment.params;
                    const map = {
                        'brightness': 'adj-brightness',
                        'contrast': 'adj-contrast',
                        'hue': 'adj-hue',
                        'saturation': 'adj-saturation',
                        'lightness': 'adj-lightness'
                    };
                    for (const [key, id] of Object.entries(map)) {
                        const el = document.getElementById(id);
                        if (el && p[key] !== undefined) {
                            el.value = p[key];
                            const valEl = document.getElementById(id + '-val');
                            if (valEl) valEl.textContent = p[key];
                        }
                    }
                }
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
        const previewCanvases = document.querySelectorAll('.layer-preview canvas:first-child');
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
            moveSelection: '移动选区',
            text: '文字工具',
            wand: '魔棒工具',
            gradient: '渐变工具'
        };
        const statusTool = document.getElementById('status-tool');
        if (statusTool) statusTool.textContent = (this.transformMode ? '自由变换 | ' : '') + (toolNames[this.currentTool] || this.currentTool);
        const selSpan = document.getElementById('status-selection');
        if (selSpan) {
            if (this.selection) {
                selSpan.textContent = `选区: ${this.selection.x}, ${this.selection.y}, ${this.selection.w}×${this.selection.h}`;
            } else {
                selSpan.textContent = '';
            }
        }
        const histSpan = document.getElementById('status-history');
        if (histSpan) histSpan.textContent = `历史: ${this.history.currentIndex + 1}/${this.history.count}`;
    }
}

const app = new MiniPhotoshop();