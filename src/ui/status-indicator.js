/*
 * Avro Phonetic engine -- web port (UI chunk: status indicator)
 * The one thing ibus's system-tray icon did that this project didn't
 * have yet: a visible answer to "is it actually on right now?". A pill
 * flashes in the corner on every toggle, then collapses down to a small
 * persistent dot for as long as the IME stays enabled, and disappears
 * completely when disabled.
 */

var Avro = (typeof Avro !== 'undefined') ? Avro : {};
Avro.UI = Avro.UI || {};

Avro.UI.StatusIndicator = (function () {
    var host, shadow, pill, dot, label;
    var collapseTimer = null;

    function build() {
        var theme = Avro.Config.theme;

        host = document.createElement('div');
        host.setAttribute('data-avro-ui', 'status-indicator');
        host.style.position = 'fixed';
        host.style.zIndex = '2147483647';
        host.style.bottom = '16px';
        host.style.right = '16px';
        host.style.display = 'none';

        shadow = host.attachShadow({ mode: 'open' });

        var style = document.createElement('style');
        style.textContent =
            ':host { all: initial; }' +
            '.pill {' +
            '  display: flex; align-items: center; gap: 7px;' +
            '  background: ' + theme.bg + '; color: ' + theme.fg + ';' +
            '  border: 1px solid ' + theme.border + '; border-radius: 999px;' +
            '  padding: 6px 12px; font-family: ' + theme.fontFamily + ';' +
            '  font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);' +
            '  transform: scale(1); transition: transform 0.15s ease, ' +
            '    padding 0.2s ease, opacity 0.2s ease;' +
            '  cursor: default;' +
            '}' +
            '.pill.pulse { transform: scale(1.12); }' +
            '.pill.collapsed { padding: 6px; }' +
            '.pill.collapsed .label { display: none; }' +
            '.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }' +
            '.dot.on { background: #4caf50; }' +
            '.dot.off { background: #888; }';

        pill = document.createElement('div');
        pill.className = 'pill';

        dot = document.createElement('span');
        dot.className = 'dot';

        label = document.createElement('span');
        label.className = 'label';

        pill.appendChild(dot);
        pill.appendChild(label);
        shadow.appendChild(style);
        shadow.appendChild(pill);
    }

    function mount() {
        if (!host) build();
        if (!host.isConnected) document.body.appendChild(host);
    }

    return {
        // Called every time the IME is toggled. `enabled` is the new state.
        flash: function (enabled) {
            mount();
            if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }

            dot.className = 'dot ' + (enabled ? 'on' : 'off');
            label.textContent = enabled ? 'অভ্র চালু \u2014 Avro ON' : 'অভ্র বন্ধ \u2014 Avro OFF';

            pill.className = 'pill pulse';
            host.style.display = 'block';

            setTimeout(function () { pill.classList.remove('pulse'); }, 150);

            if (enabled) {
                // Settle down to just the dot after a moment, but keep it visible
                // so a glance at the corner answers "is this on right now?".
                collapseTimer = setTimeout(function () {
                    pill.classList.add('collapsed');
                }, 1200);
            } else {
                // Nothing to keep showing once it's off.
                collapseTimer = setTimeout(function () {
                    host.style.display = 'none';
                }, 1200);
            }
        }
    };
})();
