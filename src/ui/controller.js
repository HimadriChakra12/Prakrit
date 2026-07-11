/*
 * Avro Phonetic engine -- web port (UI chunk: controller)
 * The state machine that replaces ibus's job: watches keystrokes in a
 * field, keeps a raw Latin buffer for the word currently being typed
 * (since Bangla text can't be un-transliterated back to Latin), asks
 * the SuggestionBuilder for a live preview + candidate list, and
 * rewrites the field's text as the user types.
 */

var Avro = (typeof Avro !== 'undefined') ? Avro : {};
Avro.UI = Avro.UI || {};

Avro.UI.Controller = function (field) {
    this.field = field;                          // Avro.UI.FieldAdapter
    this.suggestionBuilder = new Avro.SuggestionBuilder();
    this.window = new Avro.UI.CandidateWindow();
    this.window.onSelect(this._onCandidatePicked.bind(this));

    this._reset();
};

Avro.UI.Controller.prototype = {

    _reset: function () {
        this._active = false;      // is a word currently being composed?
        this._rawBuffer = '';      // raw Latin typed so far, e.g. "bangla"
        this._wordStart = 0;       // index into field value where word begins
        this._previewLen = 0;      // length of the currently-inserted preview text
        this._suggestion = null;   // last suggest() result
    },

    // ---- key handling ----
    // Returns true if the event was consumed (caller should preventDefault).
    handleKeyDown: function (e) {
        if (this._matchesKey(e, Avro.Config.toggleKey)) {
            Avro.UI.toggle();
            return true;
        }

        if (!Avro.UI.isEnabled()) return false;

        // Standard editing shortcuts (select-all, copy, cut, paste, undo, redo,
        // find, etc.) operate on the whole field or document, not just our
        // tracked word. Let them through untouched, and drop any in-progress
        // composition since our tracked [wordStart, wordStart+previewLen)
        // range is meaningless the moment a selection like Ctrl+A happens.
        if (e.ctrlKey || e.metaKey) {
            if (this._active) { this._reset(); this.window.hide(); }
            return false;
        }

        if (this.window.isVisible()) {
            if (e.key === 'ArrowDown') { this.window.moveSelection(1); return true; }
            if (e.key === 'ArrowUp') { this.window.moveSelection(-1); return true; }
            if (Avro.Config.digitSelect && /^[1-9]$/.test(e.key)) {
                var picked = this.window.selectIndex(parseInt(e.key, 10) - 1);
                if (picked !== undefined && picked !== null) {
                    this._applyCandidate(picked);
                    return true;
                }
            }
        }

        if (e.key === Avro.Config.cancelKey && this._active) {
            this._cancel();
            return true;
        }

        if (Avro.Config.commitKeys.indexOf(e.key) !== -1 && this._active) {
            // Commit current preview (or highlighted candidate), then let the
            // key's own default behavior happen (e.g. actually insert the space).
            if (this.window.isVisible()) {
                this._applyCandidate(this.window.getSelected());
            } else {
                this._commit();
            }
            return false;
        }

        if (e.key === 'Backspace' && Avro.Config.smartBackspace) {
            return this._handleBackspace();
        }

        if (e.key.length === 1 && !e.altKey) {
            if (Avro.Config.wordCharRegex.test(e.key)) {
                this._appendChar(e.key);
                return true;
            } else if (this._active) {
                // Non-word character (punctuation etc.) ends the word.
                this._commit();
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

    // True only while backspacing would still be operating on the exact word
    // we're tracking: composition is active, caret sits right at the end of
    // our inserted preview, and nothing external (like a Ctrl+A selection)
    // has changed the field out from under us.
    _selectionMatchesComposition: function () {
        if (!this._active) return false;
        if (this.field.hasSelectionRange()) return false;
        return this.field.getCaretIndex() === (this._wordStart + this._previewLen);
    },

    // ---- word composition ----

    _appendChar: function (ch) {
        if (!this._active) {
            this._active = true;
            this._rawBuffer = '';
            this._wordStart = this.field.getCaretIndex();
            this._previewLen = 0;
        }
        this._rawBuffer += ch;
        this._reparse();
    },

    // Returns true if consumed (caller should preventDefault).
    _handleBackspace: function () {
        if (this._selectionMatchesComposition()) {
            // Still actively typing this exact word: shrink the raw Latin
            // buffer by one character and re-parse, same as before.
            if (this._rawBuffer.length <= 1) {
                this.field.replaceRange(this._wordStart, this._wordStart + this._previewLen, '');
                this._reset();
                this.window.hide();
                return true;
            }
            this._rawBuffer = this._rawBuffer.slice(0, -1);
            this._reparse();
            return true;
        }

        if (this._active) { this._reset(); this.window.hide(); }

        if (this.field.hasSelectionRange()) {
            // A real selection (e.g. from Ctrl+A, or manual drag-select) --
            // let the browser delete it natively.
            return false;
        }

        // Not composing, no selection: override the browser's default
        // backspace, which deletes an entire Bangla grapheme cluster
        // (consonant + vowel sign) in one press. Delete exactly one Unicode
        // codepoint instead, so e.g. \u09B9\u09BF steps back to \u09B9 first.
        return this.field.deleteCodepointBeforeCaret();
    },

    _reparse: function () {
        var suggestion = this.suggestionBuilder.suggest(this._rawBuffer);
        this._suggestion = suggestion;

        // words[0] is already the engine's best pick: autocorrect exact match,
        // else top dictionary suggestion, else classic phonetic fallback --
        // same priority ibus-avro's own lookup table uses for the preedit.
        var words = (suggestion.words && suggestion.words.length) ? suggestion.words : [this._rawBuffer];
        var preview = words[0];

        this.field.replaceRange(this._wordStart, this._wordStart + this._previewLen, preview);
        this._previewLen = preview.length;

        var rect = this.field.getCaretRect();
        this.window.show(words, rect, this._rawBuffer);
    },

    _applyCandidate: function (word) {
        if (word === undefined || word === null) { this._commit(); return; }
        this.field.replaceRange(this._wordStart, this._wordStart + this._previewLen, word);
        this._previewLen = word.length;
        this.suggestionBuilder.updateCandidateSelection(this._rawBuffer, word);
        this._commit();
    },

    _onCandidatePicked: function (word) {
        this._applyCandidate(word);
    },

    _commit: function () {
        if (this._suggestion && this._suggestion.words) {
            var finalWord = this.field.getValue().substr(this._wordStart, this._previewLen);
            this.suggestionBuilder.stringCommitted(this._rawBuffer, finalWord);
        }
        this._reset();
        this.window.hide();
    },

    _cancel: function () {
        // Revert to the raw Latin text the user actually typed.
        this.field.replaceRange(this._wordStart, this._wordStart + this._previewLen, this._rawBuffer);
        this._reset();
        this.window.hide();
    }
};
