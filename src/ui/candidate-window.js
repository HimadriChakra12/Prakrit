/*
 * Avro Phonetic engine -- web port (UI chunk: candidate window)
 * A small floating popup that lists suggestion words. Built on Shadow DOM
 * so host-page CSS can't bleed in and this widget's CSS can't bleed out.
 */

var Avro = (typeof Avro !== 'undefined') ? Avro : {};
Avro.UI = Avro.UI || {};

Avro.UI.CandidateWindow = function () {
    this._selectedIndex = 0;
    this._words = [];
    this._onSelect = null;
    this._build();
};

Avro.UI.CandidateWindow.prototype = {

    _build: function () {
        var theme = Avro.Config.theme;

        this.host = document.createElement('div');
        this.host.setAttribute('data-avro-ui', 'candidate-window');
        this.host.style.position = 'fixed';
        this.host.style.zIndex = '2147483647'; // max, so it sits above host page UI
        this.host.style.display = 'none';

        this.shadow = this.host.attachShadow({ mode: 'open' });

        var style = document.createElement('style');
        style.textContent =
            ':host { all: initial; }' +
            '.avro-box {' +
            '  background: ' + theme.bg + ';' +
            '  color: ' + theme.fg + ';' +
            '  border: 1px solid ' + theme.border + ';' +
            '  border-radius: 6px;' +
            '  box-shadow: 0 4px 14px rgba(0,0,0,0.35);' +
            '  font-family: ' + theme.fontFamily + ';' +
            '  font-size: ' + theme.fontSize + ';' +
            '  padding: 4px;' +
            '  display: flex;' +
            '  flex-direction: column;' +
            '  gap: 4px;' +
            '  max-width: 480px;' +
            '}' +
            '.avro-row {' +
            '  display: flex;' +
            '  flex-direction: row;' +
            '  flex-wrap: wrap;' +
            '  gap: 2px;' +
            '}' +
            '.avro-raw {' +
            '  font-family: monospace;' +
            '  font-size: 0.85em;' +
            '  opacity: 0.6;' +
            '  padding: 2px 6px;' +
            '  border-bottom: 1px solid ' + theme.border + ';' +
            '}' +
            '.avro-item {' +
            '  padding: 3px 8px;' +
            '  border-radius: 4px;' +
            '  cursor: pointer;' +
            '  white-space: nowrap;' +
            '}' +
            '.avro-item .avro-idx {' +
            '  opacity: 0.55;' +
            '  margin-right: 4px;' +
            '  font-size: 0.85em;' +
            '}' +
            '.avro-item.avro-selected {' +
            '  background: ' + theme.accent + ';' +
            '  color: #fff;' +
            '}' +
            '.avro-item.avro-selected .avro-idx { opacity: 0.85; }';

        this.box = document.createElement('div');
        this.box.className = 'avro-box';

        this.rawEl = document.createElement('div');
        this.rawEl.className = 'avro-raw';
        this.rawEl.style.display = 'none';

        this.itemsRow = document.createElement('div');
        this.itemsRow.className = 'avro-row';

        this.box.appendChild(this.rawEl);
        this.box.appendChild(this.itemsRow);

        this.shadow.appendChild(style);
        this.shadow.appendChild(this.box);
    },

    mount: function () {
        if (!this.host.isConnected) {
            document.body.appendChild(this.host);
        }
    },

    unmount: function () {
        if (this.host.isConnected) {
            this.host.parentNode.removeChild(this.host);
        }
    },

    onSelect: function (cb) {
        this._onSelect = cb;
    },

    // rawText (optional) is the Latin text actually typed so far, shown as a
    // small header above the candidates -- e.g. typing "hi" shows "hi" above
    // the ranked Bangla candidates, so what you typed and what it became are
    // both visible at once.
    show: function (words, rect, rawText) {
        this.mount();
        this._words = words.slice(0, Avro.Config.maxSuggestions);
        this._selectedIndex = 0;

        if (rawText) {
            this.rawEl.textContent = rawText;
            this.rawEl.style.display = 'block';
        } else {
            this.rawEl.style.display = 'none';
        }

        this._render();

        this.host.style.display = 'block';
        var top = rect.top + rect.height + Avro.Config.windowOffsetY;
        var left = rect.left + Avro.Config.windowOffsetX;

        // Clamp so the popup doesn't run off the right/bottom of the viewport.
        var vw = window.innerWidth, vh = window.innerHeight;
        this.host.style.left = '0px';
        this.host.style.top = '0px';
        var boxWidth = this.box.offsetWidth || 200;
        var boxHeight = this.box.offsetHeight || 30;
        if (left + boxWidth > vw) left = Math.max(0, vw - boxWidth - 8);
        if (top + boxHeight > vh) top = rect.top - boxHeight - Avro.Config.windowOffsetY;

        this.host.style.left = left + 'px';
        this.host.style.top = top + 'px';
    },

    hide: function () {
        this.host.style.display = 'none';
        this._words = [];
    },

    isVisible: function () {
        return this.host.style.display !== 'none';
    },

    moveSelection: function (delta) {
        if (!this._words.length) return;
        var n = this._words.length;
        this._selectedIndex = ((this._selectedIndex + delta) % n + n) % n;
        this._render();
    },

    selectIndex: function (i) {
        if (i < 0 || i >= this._words.length) return null;
        this._selectedIndex = i;
        this._render();
        return this._words[i];
    },

    getSelected: function () {
        return this._words[this._selectedIndex];
    },

    _render: function () {
        var self = this;
        this.itemsRow.innerHTML = '';
        this._words.forEach(function (word, i) {
            var item = document.createElement('div');
            item.className = 'avro-item' + (i === self._selectedIndex ? ' avro-selected' : '');

            if (Avro.Config.digitSelect && i < 9) {
                var idx = document.createElement('span');
                idx.className = 'avro-idx';
                idx.textContent = String(i + 1);
                item.appendChild(idx);
            }

            var label = document.createElement('span');
            label.textContent = word;
            item.appendChild(label);

            item.addEventListener('mousedown', function (e) {
                // mousedown (not click) so we fire before the field loses focus.
                e.preventDefault();
                self._selectedIndex = i;
                if (self._onSelect) self._onSelect(word, i);
            });

            self.itemsRow.appendChild(item);
        });
    }
};
