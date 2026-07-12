var Avro = (typeof Avro !== 'undefined') ? Avro : {};
Avro.UI = Avro.UI || {};

Avro.UI.Controller = function (field) {
    this.field = field;                          
    this.suggestionBuilder = new Avro.SuggestionBuilder();
    this.window = new Avro.UI.CandidateWindow();
    this.window.onSelect(this._onCandidatePicked.bind(this));

    this._queue = null; 
    this._reset();
};

Avro.UI.Controller.prototype = {

    _reset: function () {
        this._active = false;      
        this._rawBuffer = '';      
        this._lastPreview = null;  
        this._suggestion = null;   
        this._reparseScheduled = false; 
    },

    _scheduleReparse: function () {
        if (this._reparseScheduled) return;
        this._reparseScheduled = true;
        var self = this;
        this._enqueue(function () {
            self._reparseScheduled = false;
            self._reparse();
        });
    },

    _enqueue: function (fn) {
        var raf = (typeof requestAnimationFrame === 'function')
            ? requestAnimationFrame
            : function (cb) { setTimeout(cb, 16); };
        var run = function () {
            return new Promise(function (resolve) {
                raf(function () {
                    try { fn(); } finally { resolve(); }
                });
            });
        };
        this._queue = this._queue ? this._queue.then(run) : run();
    },

    finalize: function () {
        if (!this._active) return;
        this._finishComposition(undefined);
    },

    cancelComposition: function () {
        if (!this._active) return;
        var self = this;
        var rawSnapshot = this._rawBuffer;
        this._active = false;
        this._enqueue(function () { self._cancelWithData(rawSnapshot); });
    },

    handleKeyDown: function (e) {
        var self = this;

        if (this._matchesKey(e, Avro.Config.toggleKey)) {
            Avro.UI.toggle();
            return true;
        }

        if (!Avro.UI.isEnabled()) return false;

        if (e.ctrlKey || e.metaKey) {
            if (this._active) {
                this._active = false;
                this._enqueue(function () { self.window.hide(); });
            }
            return false;
        }

        if (this.window.isVisible()) {
            if (e.key === 'ArrowDown') { this.window.moveSelection(1); return true; }
            if (e.key === 'ArrowUp') { this.window.moveSelection(-1); return true; }
            if (Avro.Config.digitSelect && /^[1-9]$/.test(e.key)) {
                var picked = this.window.selectIndex(parseInt(e.key, 10) - 1);
                if (picked !== undefined && picked !== null) {
                    this._finishComposition(picked);
                    return true;
                }
            }
        }

        if (e.key === Avro.Config.cancelKey && this._active) {
            var rawSnapshot = this._rawBuffer;
            this._active = false;
            this._enqueue(function () { self._cancelWithData(rawSnapshot); });
            return true;
        }

        if (Avro.Config.commitKeys.indexOf(e.key) !== -1 && this._active) {
            var rawSnapshot = this._rawBuffer;
            this._active = false;
            this._enqueue(function () {
                var selected = self.window.isVisible() ? self.window.getSelected() : undefined;
                self._commitWithData(rawSnapshot, selected);
            });
            return false;
        }

        if (e.key === 'Backspace' && Avro.Config.smartBackspace) {
            if (this.field.hasSelectionRange()) {
                if (this._active) {
                    this._active = false;
                    this._enqueue(function () { self.window.hide(); });
                }
                return false;
            }

            if (this._active) {
                this._rawBuffer = this._rawBuffer.slice(0, -1);
                if (this._rawBuffer.length === 0) {
                    this._active = false;
                    this._enqueue(function () { self._clearComposition(); });
                } else {
                    this._scheduleReparse();
                }
                return true;
            }

            this._enqueue(function () { self.field.deleteCodepointBeforeCaret(); });
            return true;
        }

        if (e.key.length === 1 && !e.altKey) {
            if (Avro.Config.wordCharRegex.test(e.key)) {
                if (!this._active) {
                    this._active = true;
                    this._rawBuffer = '';
                }
                this._rawBuffer += e.key;
                this._scheduleReparse();
                return true;
            } else if (this._active) {
                this._finishComposition(undefined);
                return false;
            }
        }

        return false;
    },

    _matchesKey: function (e, spec) {
        return e.key === spec.key &&
            !!e.ctrlKey === !!spec.ctrlKey &&
            !!e.altKey === !!spec.altKey &&
            !!e.shiftKey === !!spec.shiftKey;
    },

    _finishComposition: function (word) {
        var self = this;
        var rawSnapshot = this._rawBuffer;
        this._active = false;
        this._enqueue(function () { self._commitWithData(rawSnapshot, word); });
    },

    _onCandidatePicked: function (word) {
        this._finishComposition(word);
    },

    _verifyComposition: function () {
        if (this._lastPreview === null) return null;
        if (this.field.hasSelectionRange()) return null;

        var caretIndex = this.field.getCaretIndex();
        var start = caretIndex - this._lastPreview.length;
        if (start < 0) return null;

        var actual = this.field.getValue().substring(start, caretIndex);
        if (actual !== this._lastPreview) return null;

        return { start: start, end: caretIndex };
    },

    _reparse: function () {
        var hadPreviousWrite = (this._lastPreview !== null);

        var suggestion = this.suggestionBuilder.suggest(this._rawBuffer);
        this._suggestion = suggestion;
        var words = (suggestion.words && suggestion.words.length) ? suggestion.words : [this._rawBuffer];
        var preview = words[0];

        var range = this._verifyComposition();
        if (hadPreviousWrite && !range) {
            this._active = false;
            this._lastPreview = null;
            this._suggestion = null;
            this.window.hide();
            return;
        }

        var caretIndex = this.field.getCaretIndex();
        var start = range ? range.start : caretIndex;

        this.field.replaceRange(start, caretIndex, preview);
        this._lastPreview = preview;

        var rect = this.field.getCaretRect();
        this.window.show(words, rect, this._rawBuffer);
    },

    _clearComposition: function () {
        var range = this._verifyComposition();
        if (range) {
            this.field.replaceRange(range.start, range.end, '');
        }
        this._lastPreview = null;
        this._suggestion = null;
        this.window.hide();
    },

    _commitWithData: function (rawBuffer, word) {
        if (word !== undefined && word !== null) {
            var range = this._verifyComposition();
            if (range) {
                this.field.replaceRange(range.start, range.end, word);
            }
            this._lastPreview = word;
        }

        if (this._suggestion && this._suggestion.words && this._lastPreview !== null) {
            this.suggestionBuilder.updateCandidateSelection(rawBuffer, this._lastPreview);
            this.suggestionBuilder.stringCommitted(rawBuffer, this._lastPreview);
        }

        this._lastPreview = null;
        this._suggestion = null;
        this.window.hide();
    },

    _cancelWithData: function (rawBuffer) {
        var range = this._verifyComposition();
        if (range) {
            this.field.replaceRange(range.start, range.end, rawBuffer);
        }
        this._lastPreview = null;
        this._suggestion = null;
        this.window.hide();
    }
};
