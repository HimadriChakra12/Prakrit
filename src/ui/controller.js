/*
 * Avro Phonetic engine -- web port (UI chunk: controller)
 * The state machine that replaces ibus's job: watches keystrokes in a
 * field, keeps a raw Latin buffer for the word currently being typed
 * (since Bangla text can't be un-transliterated back to Latin), asks
 * the SuggestionBuilder for a live preview + candidate list, and
 * rewrites the field's text as the user types.
 *
 * Two things make this trickier than it looks, both specific to
 * framework-managed editors (React/Slate-style message boxes, which is
 * what most chat apps use):
 *
 * 1. Position tracking is content-verified, not index-based: rather than
 *    trusting a remembered "word started at character N" across multiple
 *    DOM-mutating operations, every edit first checks that the text
 *    immediately before the caret still matches what we last inserted.
 *    A stored absolute index goes silently stale the moment the host
 *    page's framework restructures its own DOM, which it does routinely.
 *
 * 2. Two different clocks. Deciding "is this keystroke a continuation of
 *    the word I'm already composing" (_active, the raw buffer) has to
 *    happen synchronously and instantly on every keydown, or a fast burst
 *    of typing arrives faster than we could otherwise react and each new
 *    key would look like the start of a brand new word. But actually
 *    writing to the DOM has to happen more carefully: framework-managed
 *    editors re-render *asynchronously* in response to the input events
 *    our own edits fire, and writing again before that settles reads/
 *    writes a DOM that's mid-reconciliation. So: logical state (_active,
 *    the raw buffer) updates immediately, synchronously, every keydown.
 *    Actual DOM reads/writes are serialized one animation frame apart
 *    (see _enqueue) and always operate on whatever the *current* state is
 *    at the moment they run, not whatever it was when they were queued.
 *
 * If content verification fails, composition is abandoned rather than
 * risking an edit at the wrong position.
 */

var Avro = (typeof Avro !== 'undefined') ? Avro : {};
Avro.UI = Avro.UI || {};

Avro.UI.Controller = function (field) {
    this.field = field;                          // Avro.UI.FieldAdapter
    this.suggestionBuilder = new Avro.SuggestionBuilder();
    this.window = new Avro.UI.CandidateWindow();
    this.window.onSelect(this._onCandidatePicked.bind(this));

    this._queue = null; // chain of pending deferred DOM work, see _enqueue
    this._reset();
};

Avro.UI.Controller.prototype = {

    _reset: function () {
        this._active = false;      // is a word currently being composed? (synchronous)
        this._rawBuffer = '';      // raw Latin typed so far, e.g. "bangla" (synchronous)
        this._lastPreview = null;  // exact string last confirmed written to the DOM (deferred layer only; null = nothing written yet)
        this._suggestion = null;   // last suggest() result
    },

    // Runs `fn` only after any previously-queued edit has both run AND had
    // one animation frame to let the host page react to it (React/Slate
    // etc. typically finish their re-render within a frame). Every actual
    // DOM mutation goes through here instead of running immediately off
    // the keydown handler, so a burst of fast typing can't get ahead of
    // the framework's own reconciliation and read/write stale positions.
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

    // ---- public API for init.js (blur handling, disable-while-active) ----

    // Equivalent to what a commit key does: accept whatever's currently
    // composed as final. Used when the field loses focus.
    finalize: function () {
        if (!this._active) return;
        this._finishComposition(undefined);
    },

    // Equivalent to Escape: revert to the raw Latin text typed so far.
    // Used when the IME is toggled off mid-word.
    cancelComposition: function () {
        if (!this._active) return;
        var self = this;
        var rawSnapshot = this._rawBuffer;
        this._active = false;
        this._enqueue(function () { self._cancelWithData(rawSnapshot); });
    },

    // ---- key handling ----
    // Returns true if the event was consumed (caller should preventDefault).
    // Every decision here, and every _active/_rawBuffer update, happens
    // synchronously -- this must not wait on the DOM queue, or a fast burst
    // of keystrokes would each see stale state from before the previous
    // one had "happened" yet.
    handleKeyDown: function (e) {
        var self = this;

        if (this._matchesKey(e, Avro.Config.toggleKey)) {
            Avro.UI.toggle();
            return true;
        }

        if (!Avro.UI.isEnabled()) return false;

        // Standard editing shortcuts (select-all, copy, cut, paste, undo, redo,
        // find, etc.) operate on the whole field or document, not just our
        // tracked word. Let them through untouched, and drop any in-progress
        // composition since it's meaningless the moment something like
        // Ctrl+A changes the selection out from under us.
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
            // Commit current preview (or highlighted candidate), then let the
            // key's own default behavior happen (e.g. actually insert the space).
            var selected = this.window.isVisible() ? this.window.getSelected() : undefined;
            this._finishComposition(selected);
            return false;
        }

        if (e.key === 'Backspace' && Avro.Config.smartBackspace) {
            if (this.field.hasSelectionRange()) {
                // A real selection (e.g. Ctrl+A, drag-select) -- this is a
                // plain read of live browser selection state, not something
                // we just mutated ourselves, so it's safe to check
                // synchronously. Let the browser delete it natively.
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
                    this._enqueue(function () { self._reparse(); });
                }
                return true;
            }

            // Not composing: delete exactly one Unicode codepoint from
            // already-committed text (see FieldAdapter for why).
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
                this._enqueue(function () { self._reparse(); });
                return true;
            } else if (this._active) {
                // Non-word character (punctuation etc.) ends the word.
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

    // Synchronously closes out the current composition (active flag) and
    // defers the actual DOM/candidate-learning work. `word`, if given, is
    // a specific candidate the user picked; otherwise whatever's already
    // been written stands as the final answer. Deliberately does NOT
    // clear this._rawBuffer here: any reparse() calls still pending in the
    // queue from this same word need to keep reading the full buffer
    // until this commit step (enqueued after them, so it runs last) has
    // captured what it needs. The buffer only gets cleared when a genuinely
    // new word starts (the next word-char keystroke, once it sees _active
    // is false).
    _finishComposition: function (word) {
        var self = this;
        var rawSnapshot = this._rawBuffer;
        this._active = false;
        this._enqueue(function () { self._commitWithData(rawSnapshot, word); });
    },

    _onCandidatePicked: function (word) {
        this._finishComposition(word);
    },

    // Checks that the field's actual current content still has our last
    // confirmed-written preview sitting immediately before the caret, with
    // nothing else selected. Returns the {start, end} range to replace if
    // so, or null if reality has drifted from what we expect -- caret
    // moved, external edit happened, or the host page's framework rewrote
    // its DOM in a way that shifted things, or nothing's been written yet
    // this composition. Checked fresh before every single edit; nothing is
    // ever trusted from a previous step.
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

    // ---- deferred DOM work (all of these run only from inside _enqueue) ----

    // Always reads this._rawBuffer fresh (not a captured value), so if
    // several keystrokes queued up faster than frames are available, later
    // reparse calls naturally supersede earlier ones with the fuller,
    // more current buffer instead of each doing separate, increasingly
    // stale partial work.
    _reparse: function () {
        // Was anything already written to the DOM for this composition?
        // Only true once an earlier step has actually put a preview on
        // screen -- see the note on _verifyComposition below.
        var hadPreviousWrite = (this._lastPreview !== null);

        var suggestion = this.suggestionBuilder.suggest(this._rawBuffer);
        this._suggestion = suggestion;

        // words[0] is already the engine's best pick: autocorrect exact match,
        // else top dictionary suggestion, else classic phonetic fallback --
        // same priority ibus-avro's own lookup table uses for the preedit.
        var words = (suggestion.words && suggestion.words.length) ? suggestion.words : [this._rawBuffer];
        var preview = words[0];

        var range = this._verifyComposition();

        // _verifyComposition() returns null in two very different cases,
        // which must NOT be handled the same way:
        //  (a) nothing has been written for this composition yet (fresh
        //      word, this._lastPreview is still null) -- there's nothing to
        //      replace, so writing the first preview at the caret is
        //      correct.
        //  (b) something WAS written, but the field no longer matches what
        //      we expect (caret moved, external edit, host page's
        //      framework re-rendered the DOM). Here the caret position is
        //      no longer trustworthy as "end of our text", so blindly
        //      inserting at it would leave the old, stale preview sitting
        //      in the field and glue the new preview onto it -- producing
        //      the "backspacing repeats old text" corruption. Per the
        //      design note at the top of this file, composition must be
        //      abandoned instead: stop composing and leave the field alone
        //      rather than risk an edit at the wrong position.
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

    // word: a specific candidate to write instead of whatever's already
    // there, or undefined to just accept what's currently shown.
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
            // Revert to the raw Latin text the user actually typed.
            this.field.replaceRange(range.start, range.end, rawBuffer);
        }
        this._lastPreview = null;
        this._suggestion = null;
        this.window.hide();
    }
};
