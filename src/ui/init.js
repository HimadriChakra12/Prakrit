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
