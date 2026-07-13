/*
 * Avro Phonetic engine -- web port (UI chunk: init / page glue)
 * This is the only chunk that touches `document` at load time. It finds
 * eligible fields, gives each one a Controller, and listens globally so
 * fields added later (SPAs etc.) still work.
 */

var Avro = (typeof Avro !== 'undefined') ? Avro : {};
Avro.UI = Avro.UI || {};

(function () {
    var enabled = false;
    var controllers = new WeakMap(); // element -> Controller
    var activeController = null;

    function controllerFor(el) {
        if (controllers.has(el)) return controllers.get(el);
        var adapter = new Avro.UI.FieldAdapter(el);
        var controller = new Avro.UI.Controller(adapter);
        controllers.set(el, controller);
        return controller;
    }

    function isEligible(el) {
        if (!el || !el.matches) return false;
        return el.matches(Avro.Config.fieldSelector);
    }

    function onKeyDown(e) {
        var el = e.target;

        // The toggle key must work everywhere, even outside an eligible field.
        if (activeController === null && !isEligible(el)) {
            return;
        }

        if (!isEligible(el)) return;

        var controller = controllerFor(el);
        activeController = controller;

        var consumed = controller.handleKeyDown(e);
        if (consumed) {
            e.preventDefault();
            // Not just preventDefault: this runs in the capture phase, so
            // without stopping propagation the event still reaches the
            // host page's own keydown handling further down (Discord's
            // Slate editor, Slack, etc.) completely unaware we've claimed
            // this key. preventDefault() only suppresses the browser's
            // native default action -- it does nothing to stop a
            // framework's own JS keydown handler from independently
            // reacting to the very same event, e.g. "there's a selection
            // and a printable key was pressed, so delete the selection" --
            // which collides with the selection we deliberately leave
            // spanning the current preview while composing, and was the
            // actual cause of fast typing / space appearing to delete the
            // word out from under us.
            e.stopPropagation();
        }
    }

    function onFocusOut(e) {
        if (activeController && e.target === (activeController.field && activeController.field.el)) {
            activeController.finalize();
        }
    }

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusout', onFocusOut, true);

    Avro.UI.isEnabled = function () { return enabled; };
    Avro.UI.enable = function () {
        enabled = true;
        Avro.UI.StatusIndicator.flash(true);
    };
    Avro.UI.disable = function () {
        enabled = false;
        if (activeController) activeController.cancelComposition();
        Avro.UI.StatusIndicator.flash(false);
    };
    Avro.UI.toggle = function () {
        enabled ? Avro.UI.disable() : Avro.UI.enable();
    };
})();
