/*
 * Avro Phonetic engine -- web port (UI chunk: field adapter)
 * Wraps <input>, <textarea>, and contenteditable elements behind one
 * interface so the controller never needs to know which kind of field
 * it's typing into.
 */

var Avro = (typeof Avro !== 'undefined') ? Avro : {};
Avro.UI = Avro.UI || {};

Avro.UI.FieldAdapter = function (el) {
    this.el = el;
    this.isContentEditable = !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
};

Avro.UI.FieldAdapter.prototype = {

    // ---- plain text field (input/textarea) ----

    _nativeCaret: function () {
        return this.el.selectionStart;
    },

    // Replace the range [start, end) of the field's text with `text`,
    // and move the caret to start + text.length. Always returns a Promise
    // (resolved immediately for a plain input/textarea, since that path
    // is fully synchronous) so callers have one uniform async interface
    // regardless of field type.
    replaceRange: function (start, end, text) {
        if (!this.isContentEditable) {
            var val = this.el.value;
            this.el.value = val.slice(0, start) + text + val.slice(end);
            var pos = start + text.length;
            this.el.setSelectionRange(pos, pos);
            return Promise.resolve();
        }
        return this._replaceRangeCE(start, end, text);
    },

    getCaretIndex: function () {
        if (!this.isContentEditable) {
            return this._nativeCaret();
        }
        return this._caretIndexCE();
    },

    getValue: function () {
        if (!this.isContentEditable) {
            return this.el.value;
        }
        return this._stripInvisible(this.el.textContent);
    },

    // Framework-managed editors (Slate.js -- Discord's message box, Slack,
    // etc.) commonly insert zero-width placeholder characters into the DOM
    // purely for cursor-stability around empty/void positions, and add or
    // remove them opportunistically the moment real content appears there
    // -- most commonly the very first character typed into an empty
    // message box, or right after backspacing it back to empty. They carry
    // no actual text meaning, but left in, they silently shift every
    // absolute character index this file computes by one exactly at that
    // moment, desyncing _verifyComposition and making composition
    // intermittently glitch. Stripped here so getValue()/getCaretIndex()/
    // _getTextNodeAndOffset() all agree on the same "real text only" count
    // regardless of whether the host editor's placeholder happens to be
    // present right now.
    _stripInvisible: function (s) {
        return s.replace(/[\uFEFF\u200B]/g, '');
    },

    // True when there's a real, non-collapsed selection (e.g. from Ctrl+A or
    // a manual drag-select), as opposed to just a blinking caret.
    hasSelectionRange: function () {
        if (!this.isContentEditable) {
            return this.el.selectionStart !== this.el.selectionEnd;
        }
        var sel = window.getSelection();
        return sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
    },

    // Deletes exactly one Unicode codepoint immediately before the caret
    // (handling surrogate pairs so astral characters aren't split), rather
    // than relying on the browser's own backspace, which treats a Bangla
    // consonant + vowel sign as a single grapheme cluster and deletes both
    // at once.
    deleteCodepointBeforeCaret: function () {
        if (!this.isContentEditable) {
            var idx = this.getCaretIndex();
            if (idx <= 0) return Promise.resolve(false);

            var value = this.getValue();
            var deleteLen = 1;
            var code = value.charCodeAt(idx - 1);
            if (code >= 0xDC00 && code <= 0xDFFF && idx >= 2) {
                var high = value.charCodeAt(idx - 2);
                if (high >= 0xD800 && high <= 0xDBFF) deleteLen = 2;
            }

            return this.replaceRange(idx - deleteLen, idx, '').then(function () { return true; });
        }
        return this._deleteCodepointCE();
    },

    // Operates directly on the live Selection's node/offset rather than
    // converting to and from a flattened character index. Two independent
    // tree-walks (one to find the caret, a second inside replaceRange to
    // find where to edit) can disagree by a character or two in a
    // framework-managed editor whose DOM shifts between calls -- which is
    // what was causing backspace to occasionally eat the wrong text.
    // Operating on the Selection's own current node/offset sidesteps that
    // entirely for the common case.
    _deleteCodepointCE: function () {
        var sel = window.getSelection();
        if (!sel.rangeCount) return Promise.resolve(false);
        var range = sel.getRangeAt(0);
        if (!range.collapsed) return Promise.resolve(false);

        var node = range.startContainer;
        var offset = range.startOffset;

        if (node.nodeType !== 3 || offset <= 0) {
            // Caret is at the very start of a text node, or sitting on an
            // element boundary (e.g. between two separately-rendered leaf
            // spans). There's no previous character within this same node
            // to delete directly, and guessing which neighboring node to
            // reach into is exactly the kind of cross-node assumption that
            // breaks in framework-managed editors. Defer to the browser's
            // own native backspace for this one edge case instead.
            return Promise.resolve(false);
        }

        var text = node.textContent;
        var deleteLen = 1;
        var code = text.charCodeAt(offset - 1);
        if (code >= 0xDC00 && code <= 0xDFFF && offset >= 2) {
            var high = text.charCodeAt(offset - 2);
            if (high >= 0xD800 && high <= 0xDBFF) deleteLen = 2;
        }

        var deleteRange = document.createRange();
        deleteRange.setStart(node, offset - deleteLen);
        deleteRange.setEnd(node, offset);
        sel.removeAllRanges();
        sel.addRange(deleteRange);

        var self = this;
        return this._insertViaInputEvent('').then(function (ok) {
            if (ok) return true;

            if (self._insertViaExecCommand('')) {
                return true;
            }

            node.textContent = text.slice(0, offset - deleteLen) + text.slice(offset);
            var caretRange = document.createRange();
            caretRange.setStart(node, offset - deleteLen);
            caretRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(caretRange);
            return true;
        });
    },

    // ---- contenteditable (best-effort: works for plain divs; editors that
    // fully own their own DOM model, e.g. rich text frameworks, may not
    // reflect these mutations back into their internal state) ----

    _getTextNodeAndOffset: function (globalIndex) {
        var walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT, null, false);
        var node, count = 0;
        while ((node = walker.nextNode())) {
            var raw = node.textContent;
            var logicalLen = this._stripInvisible(raw).length;
            if (globalIndex <= count + logicalLen) {
                // Translate the (invisible-stripped) logical offset within
                // this node back to a raw offset, skipping over any
                // invisible characters interspersed before it so the
                // Range we hand back always lands on real content.
                var need = globalIndex - count;
                var rawOffset = 0, seen = 0;
                while (rawOffset < raw.length && seen < need) {
                    if (raw.charAt(rawOffset) !== '\uFEFF' && raw.charAt(rawOffset) !== '\u200B') seen++;
                    rawOffset++;
                }
                return { node: node, offset: rawOffset };
            }
            count += logicalLen;
        }
        return { node: this.el, offset: this.el.childNodes.length };
    },

    _caretIndexCE: function () {
        var sel = window.getSelection();
        if (!sel.rangeCount) return 0;
        var range = sel.getRangeAt(0);
        var pre = range.cloneRange();
        pre.selectNodeContents(this.el);
        pre.setEnd(range.endContainer, range.endOffset);
        return this._stripInvisible(pre.toString()).length;
    },

    _replaceRangeCE: function (start, end, text) {
        var sel = window.getSelection();
        var range = document.createRange();
        var startPos = this._getTextNodeAndOffset(start);
        var endPos = this._getTextNodeAndOffset(end);
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        sel.removeAllRanges();
        sel.addRange(range);

        var self = this;

        // Framework-managed editors (Discord/Slack-style Slate.js, or React/
        // Draft.js/Lexical composers) maintain their OWN internal document
        // model and re-render the DOM from it -- they don't just read
        // whatever's sitting in the DOM. document.execCommand DOES perform a
        // real DOM edit, but Slate never finds out about it: confirmed
        // directly against Discord, where execCommand-inserted text got
        // silently reverted (or desynced from the caret) the moment
        // anything else re-rendered the box, and repeated inserts landed on
        // top of each other instead of appending. Dispatching a real
        // `beforeinput` event is what actually gets Slate's attention --
        // it's the specific event these frameworks are built to intercept
        // and apply through their own model, which is the only way an edit
        // here reliably sticks (see _insertViaInputEvent for why this has
        // to wait for selectionchange first).
        return this._insertViaInputEvent(text).then(function (ok) {
            if (ok) return;

            // Not intercepted by a framework -- try the browser's native
            // editing command, which performs a real DOM edit regardless of
            // whether anything is listening.
            if (self._insertViaExecCommand(text)) {
                return;
            }

            // Last resort: raw DOM manipulation for plain contenteditable
            // divs, or browsers where neither of the above is available.
            range.deleteContents();
            var textNode = document.createTextNode(text);
            range.insertNode(textNode);

            var newRange = document.createRange();
            newRange.setStart(textNode, textNode.length);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);

            self.el.normalize();
        });
    },

    // Dispatches a real `beforeinput` event -- but only after first
    // confirming the selection change we just made (via sel.addRange
    // above) has actually been processed. selectionchange fires
    // asynchronously, and a framework's beforeinput handler reads *its
    // own* already-updated internal model (not a live DOM read) to decide
    // what's being replaced. Dispatching immediately, in the same
    // synchronous tick as addRange(), meant the framework's model hadn't
    // caught up yet -- confirmed directly against Discord: replacing an
    // existing selection this way inserted the new text at Slate's stale
    // (still collapsed, still-at-the-old-position) caret instead of
    // actually replacing the selected range, producing duplicated text
    // like "চক্রচক্রবর্তী" instead of "চক্রবর্তী". Waiting for the real
    // selectionchange notification (with a short timeout fallback in case
    // one doesn't fire, e.g. the selection didn't actually move) gives
    // Slate's own listener -- registered well before ours, since Discord's
    // app initializes long before this script runs -- a chance to run
    // first and update its model to match.
    //
    // Returns a Promise<boolean>: true only if something actually
    // intercepted the dispatched event (called preventDefault()) -- that's
    // the signal a framework picked it up and applied it; if nothing did,
    // this had no effect at all (synthetic events don't trigger the
    // browser's native edit the way a real one would), so the caller needs
    // to fall back to another method.
    _insertViaInputEvent: function (text) {
        var self = this;
        return new Promise(function (resolve) {
            if (typeof InputEvent !== 'function') { resolve(false); return; }

            var fired = false;
            var onSelectionChange = function () {
                if (fired) return;
                fired = true;
                document.removeEventListener('selectionchange', onSelectionChange, true);
                dispatch();
            };
            document.addEventListener('selectionchange', onSelectionChange, true);
            // Safety net: don't hang forever if selectionchange never fires
            // (e.g. the selection didn't actually change position).
            setTimeout(function () {
                if (fired) return;
                fired = true;
                document.removeEventListener('selectionchange', onSelectionChange, true);
                dispatch();
            }, 0);

            function dispatch() {
                try {
                    var isDelete = (text === '');
                    var evt = new InputEvent('beforeinput', {
                        inputType: isDelete ? 'deleteContentBackward' : 'insertText',
                        data: isDelete ? null : text,
                        bubbles: true,
                        cancelable: true,
                        composed: true
                    });
                    self.el.dispatchEvent(evt);
                    resolve(evt.defaultPrevented);
                } catch (e) {
                    resolve(false);
                }
            }
        });
    },

    _insertViaExecCommand: function (text) {
        try {
            if (typeof document.execCommand !== 'function') return false;
            var ok = document.execCommand('insertText', false, text);
            return !!ok;
        } catch (e) {
            return false;
        }
    },

    // ---- pixel position of the caret, for placing the popup ----

    getCaretRect: function () {
        if (this.isContentEditable) {
            return this._caretRectCE();
        }
        return this._caretRectPlain();
    },

    _caretRectCE: function () {
        var sel = window.getSelection();
        if (!sel.rangeCount) return this.el.getBoundingClientRect();
        var range = sel.getRangeAt(0).cloneRange();
        range.collapse(true);
        if (typeof range.getClientRects === 'function') {
            var rects = range.getClientRects();
            if (rects.length) return rects[0];
        }
        return this.el.getBoundingClientRect();
    },

    // Mirror-div technique: clone the field's text-affecting CSS onto an
    // offscreen div, split the text at the caret, and measure where a
    // marker span at that split point lands.
    _caretRectPlain: function () {
        var el = this.el;
        var mirror = document.createElement('div');
        var style = window.getComputedStyle(el);

        var props = [
            'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
            'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
            'letterSpacing', 'wordSpacing', 'whiteSpace'
        ];
        props.forEach(function (p) { mirror.style[p] = style[p]; });

        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.top = '0';
        mirror.style.left = '-9999px';
        mirror.style.whiteSpace = (el.tagName === 'TEXTAREA') ? 'pre-wrap' : 'pre';
        mirror.style.wordWrap = 'break-word';

        var caret = this.getCaretIndex();
        var value = el.value;
        var before = value.substring(0, caret);
        var after = value.substring(caret) || '.';

        mirror.textContent = before;
        var marker = document.createElement('span');
        marker.textContent = after.charAt(0);
        mirror.appendChild(marker);
        mirror.appendChild(document.createTextNode(after.substring(1)));

        document.body.appendChild(mirror);
        var elRect = el.getBoundingClientRect();
        var markerRect = marker.getBoundingClientRect();
        var mirrorRect = mirror.getBoundingClientRect();

        var rect = {
            left: elRect.left + (markerRect.left - mirrorRect.left) - el.scrollLeft,
            top: elRect.top + (markerRect.top - mirrorRect.top) - el.scrollTop,
            height: markerRect.height || parseInt(style.lineHeight, 10) || 16
        };

        document.body.removeChild(mirror);
        return rect;
    }
};
