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
    // and move the caret to start + text.length.
    replaceRange: function (start, end, text) {
        if (!this.isContentEditable) {
            var val = this.el.value;
            this.el.value = val.slice(0, start) + text + val.slice(end);
            var pos = start + text.length;
            this.el.setSelectionRange(pos, pos);
        } else {
            this._replaceRangeCE(start, end, text);
        }
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
        return this.el.textContent;
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
            if (idx <= 0) return false;

            var value = this.getValue();
            var deleteLen = 1;
            var code = value.charCodeAt(idx - 1);
            if (code >= 0xDC00 && code <= 0xDFFF && idx >= 2) {
                var high = value.charCodeAt(idx - 2);
                if (high >= 0xD800 && high <= 0xDBFF) deleteLen = 2;
            }

            this.replaceRange(idx - deleteLen, idx, '');
            return true;
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
        if (!sel.rangeCount) return false;
        var range = sel.getRangeAt(0);
        if (!range.collapsed) return false;

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
            return false;
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

        if (this._insertViaExecCommand('')) {
            return true;
        }

        node.textContent = text.slice(0, offset - deleteLen) + text.slice(offset);
        var caretRange = document.createRange();
        caretRange.setStart(node, offset - deleteLen);
        caretRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(caretRange);
        return true;
    },

    // ---- contenteditable (best-effort: works for plain divs; editors that
    // fully own their own DOM model, e.g. rich text frameworks, may not
    // reflect these mutations back into their internal state) ----

    _getTextNodeAndOffset: function (globalIndex) {
        var walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT, null, false);
        var node, count = 0;
        while ((node = walker.nextNode())) {
            var len = node.textContent.length;
            if (globalIndex <= count + len) {
                return { node: node, offset: globalIndex - count };
            }
            count += len;
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
        return pre.toString().length;
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

        // Framework-managed editors (Discord/Slack-style Slate.js or React/Draft.js
        // composers) re-render from their own internal state, so directly mutating
        // the DOM gets silently overwritten -- the change never appears. Routing
        // through execCommand goes through the browser's native text-editing
        // pipeline instead, which fires the real input/beforeinput events these
        // frameworks are actually listening to.
        if (this._insertViaExecCommand(text)) {
            return;
        }

        // Fallback for plain contenteditable divs (no framework watching them),
        // or browsers where execCommand is unavailable/deprecated away.
        range.deleteContents();
        var textNode = document.createTextNode(text);
        range.insertNode(textNode);

        var newRange = document.createRange();
        newRange.setStart(textNode, textNode.length);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        this.el.normalize();
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
