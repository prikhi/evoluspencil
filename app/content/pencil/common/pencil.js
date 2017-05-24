/*"""
Pencil
======
Initializes a global Pencil namespace & sets up event listeners on boot.
*/

window.onerror = function (message, url, code) {
    //Console.dumpError(message);
    error("SYSTEM ERROR!\n\t* " + message + "\n\t* at: " + url + ":" + code);
    Util.showStatusBarError("SYSTEM ERROR! * " + message + " at: " + url + ":" + code, true);
    return false;
};

/*"""
.. class:: Pencil

    The Pencil namespace contains attributes linked to the application’s
    Controller, Rasterizer, etc. as well as various helper functions.

    .. attribute:: Pencil.controller

      A :class:`Controller` initialized from the XUL window.
*/
var Pencil = {};

pencilSandbox.Pencil = Pencil;

Pencil.SNAP = 4;
Pencil.UNSNAP = 4;
Pencil.editorClasses = [];
Pencil.registerEditor = function (editorClass) {
    Pencil.editorClasses.push(editorClass);
};

Pencil.sharedEditors = [];
Pencil.registerSharedEditor = function (sharedEditor) {
    Pencil.sharedEditors.push(sharedEditor);
};

Pencil.xferHelperClasses = [];
Pencil.registerXferHelper = function (helperClass) {
    Pencil.xferHelperClasses.push(helperClass);
};

Pencil.behaviors = {};

Pencil.documentExporters = [];
Pencil.defaultDocumentExporter = null;
Pencil.registerDocumentExporter = function (exporter, defaultExporter) {
    Pencil.documentExporters.push(exporter);
    if (defaultExporter) Pencil.defaultDocumentExporter = exporter;
};
Pencil.getDocumentExporterById = function (id) {
  /*"""
   .. function:: Pencil.getDocumentExporterById(id)

      :param id: The id of a DocumentExporter.
      :returns: The requested DocumentExporter or ``null`` if a matching
                DocumentExporter cannot be found.
  */
    for (var i = 0; i < Pencil.documentExporters.length; i ++) {
        if (Pencil.documentExporters[i].id == id) {
            return Pencil.documentExporters[i];
        }
    }
    return null;
};

Pencil.toggleHeartBeat = function () {
    if (Pencil.window.hasAttribute("class")) {
        Pencil.window.removeAttribute("class");
    } else {
        Pencil.window.setAttribute("class", "Beat");
    }
    window.setTimeout(Pencil.toggleHeartBeat, 200);
};

Pencil.installEditors = function (canvas) {
    for (var factory in Pencil.editorClasses) {
        var constructorFunction = Pencil.editorClasses[factory];
        var editor = new constructorFunction();
        editor.install(canvas);
    }
};
Pencil.installXferHelpers = function (canvas) {
    for (var factory in Pencil.xferHelperClasses) {
        var constructorFunction = Pencil.xferHelperClasses[factory];
        var helper = new constructorFunction(canvas);
        canvas.xferHelpers.push(helper);
    }
};
Pencil.fixUI = function () {
    Dom.workOn(".//xul:*[@image]", Pencil.window, function (node) {
        var image = node.getAttribute("image");
        if (image.match(/^moz\-icon:\/\/([^\?]+)\?size=([a-z]+)$/)) {
            var src = "Icons/MozIcons/" + RegExp.$1 + "-" + RegExp.$2 + ".png";
            node.setAttribute("image", src);
        }
    });
};
Pencil.boot = function (event) {
    try {
        if (Pencil.booted) return;

        Pencil.booted = true;
        Pencil.window = document.documentElement;
        var win = Dom.getSingle("/xul:window", document);

        Pencil.window.setAttribute("chromehidden", "");

        //DEBUG_BEGIN
        // Start Remote Debugging Server
        var windowtype = "PencilMainWindow";
        Components.utils.import('resource://gre/modules/devtools/dbg-server.jsm');
        DebuggerServer.chromeWindowType = windowtype;
        if (!DebuggerServer.initialized) {
            DebuggerServer.init();
            DebuggerServer.addBrowserActors(windowtype);
        }
        var listener = DebuggerServer.createListener();
        listener.portOrPath = 6000;
        listener.open()
        //DEBUG_END

        if (window.arguments) {
            var cmdLine = window.arguments[0];
            if (cmdLine) {
                cmdLine = cmdLine.QueryInterface(Components.interfaces.nsICommandLine);
                var domInspector = cmdLine.handleFlagWithParam("inspector", false);
                if ("true" == domInspector) {
                    document.getElementById("domInspector").style.display = "";
                }
            }
        }

        if (Config.get("collectionPane.floating") == true) {
            document.getElementById("sideBox").style.display = "none";
            Pencil.collectionPane = document.getElementById("collectionPane");
            Pencil.privateCollectionPane = document.getElementById("privateCollectionPane");
        } else {
            Config.set("collectionPane.floating", false);
            document.getElementById("sideBox").style.display = "";
            Pencil.collectionPane = document.getElementById("_collectionPane");
            Pencil.privateCollectionPane = document.getElementById("_privateCollectionPane");
        }

        document.getElementById("floatingCollectionPane").setAttribute("checked", Config.get("collectionPane.floating") == false);

        Pencil.controller = new Controller(win);
        Pencil.rasterizer = new Rasterizer("image/png");
        Pencil.printer = new WebPrinter();

        CollectionManager.loadStencils();
        ExportTemplateManager.loadTemplates();

        Pencil.setTitle(Util.getMessage("no.document"));
        Pencil.activeCanvas = null;
        Pencil.setupCommands();

        Pencil.undoMenuItem = document.getElementById("editUndoMenu");
        Pencil.redoMenuItem = document.getElementById("editRedoMenu");

        Pencil.sideBoxFloat = document.getElementById("sideBoxFloat");
        var collectionPaneSizeGrip = document.getElementById("collectionPaneSizeGrip");

        window.addEventListener("mousedown", function (event) {
            var target = event.target;
            if (target.className && target.className == "CollectionPane") {
                if (Pencil.hideCollectionPaneTimer) {
                    clearTimeout(Pencil.hideCollectionPaneTimer);
                    Pencil.hideCollectionPaneTimer = null;
                }

                if (target.id == "collectionPaneSizeGrip") {
                    collectionPaneSizeGrip._oX = event.clientX;
                    collectionPaneSizeGrip._oY = event.clientY;

                    collectionPaneSizeGrip._width = Pencil.sideBoxFloat.getBoundingClientRect().width;
                    collectionPaneSizeGrip._height = Pencil.sideBoxFloat.getBoundingClientRect().height;

                    collectionPaneSizeGrip._hold = true;
                }
            } else {
                if (Pencil.isCollectionPaneVisibled()) {
                    Pencil.hideCollectionPane();
                }
            }
        }, true);
        window.addEventListener("mousemove", function (event) {
            if (collectionPaneSizeGrip._hold) {
                var dx = event.clientX - collectionPaneSizeGrip._oX;
                var dy = event.clientY - collectionPaneSizeGrip._oY;
                Pencil.sideBoxFloat.setAttribute("width", collectionPaneSizeGrip._width + dx);
                Pencil.sideBoxFloat.setAttribute("height", collectionPaneSizeGrip._height + dy);
                Pencil.setUpSizeGrip();
            }
        }, true);
        window.addEventListener("mouseup", function (event) {
            collectionPaneSizeGrip._hold = false;
        }, true);

        window.addEventListener("DOMMouseScroll", function (event) {
            if (event.VERTICAL_AXIS == event.axis && event.ctrlKey && Pencil.activeCanvas != null) {
                if (event.detail > 0) {
                    Pencil.activeCanvas.zoomTo(Pencil.activeCanvas.zoom / 1.25);
                } else {
                    Pencil.activeCanvas.zoomTo(Pencil.activeCanvas.zoom * 1.25);
                }
            }
        }, true);

        //booting shared editors
        for (var i in Pencil.sharedEditors) {
            try {
                Pencil.sharedEditors[i].setup();
            } catch (e) {
                Console.dumpError(e, "stdout");
            }
        }

        document.documentElement.addEventListener("p:CanvasChanged", Pencil.handleCanvasChange, false);
        document.documentElement.addEventListener("p:TargetChanged", Pencil.handleTargetChange, false);

        document.documentElement.addEventListener("p:ContentModified", Pencil._setupUndoRedoCommand, false);

        Pencil.postBoot();
    } catch (e) {
        Console.dumpError(e, "stdout");
    }
};
Pencil.setTitle = function (s) {
    document.title = s + " - Pencil";
};

Pencil.handleCanvasChange = function (event) {
    Pencil.activeCanvas = event.canvas;
    Pencil.setupCommands();
    Pencil.invalidateSharedEditor();
};
Pencil.handleTargetChange = function (event) {
    Pencil.setupCommands();
    Pencil.invalidateSharedEditor();
};
Pencil.invalidateSharedEditor = function() {
    var canvas = Pencil.activeCanvas;
    var target = canvas ? canvas.currentController : null;

    if (!target) {
        for (var i in Pencil.sharedEditors) {
            try {
                Pencil.sharedEditors[i].detach();
            } catch (e) {
                Console.dumpError(e, "stdout");
            }
        }
        return;
    }
    for (var i in Pencil.sharedEditors) {
        try {
            Pencil.sharedEditors[i].attach(target);
        } catch (e) {
            Console.dumpError(e, "stdout");
        }
    }
};
Pencil.setPainterCommandChecked = function (v) {
    /*"""
     .. function:: Pencil.setPainterCommandChecked(id)

        :param v: boolean; currently only as false; determines state of the format painter function.
        :returns: undefined

        Side Effect: If passed value v is false, it deactivates the format painter tool (used for copying formats
        of stencils on canvas)
        Side Effect: If passed value v is false, it removes the painter class from all canvas ("pages" in the GUI) if passed value v is false.

        Called on click on stencils on canvas or if the toolbarFormatPainterCommand button is clicked.
    */

    var painterCommand = document.getElementById("toolbarFormatPainterCommand");
    if (painterCommand) {
        painterCommand.checked = v;
        if (!v) {
            var canvasList = Pencil.getCanvasList();
            for (var i = 0; i < canvasList.length; i++) {
                Dom.removeClass(canvasList[i], "Painter");
            }
        }
    }
};
Pencil.getCanvasList = function () {
    var r = [];
    Dom.workOn("//xul:pcanvas", document.documentElement, function (node) {
        r.push(node);
    });
    return r;
};
Pencil.setupCommands = function () {
    /*"""
     .. function:: Pencil.setupCommands()

         Activates & deactivates commands via the :func:`Pencil._enableCommand`
         function along with the ids of the ``<command>`` XUL Elements from
         ``mainWindow.xul``.
         
         Called e.g. if an element is selected in order to provide applicable commands. 
         
         Whether a command is activated or deactivated depends on the state of
         the application(if a document has been created, if there is an active
         ``canvas`` element, etc.) and the active element (e.g. a selected stencil)
    */

    var canvas = Pencil.activeCanvas;
    var target = canvas ? canvas.currentController : null;

    Pencil._enableCommand("newPageCommand", Pencil.controller.hasDoc());
    Pencil._enableCommand("duplicatePageCommand", Pencil.controller.hasDoc());
    Pencil._enableCommand("saveDocumentCommand", Pencil.controller.hasDoc());
    Pencil._enableCommand("saveDocumentAsCommand", Pencil.controller.hasDoc());
    Pencil._enableCommand("rasterizeSelectionCommand", target && target.getGeometry);
    Pencil._enableCommand("rasterizeCommand", canvas != null);

    Pencil._enableCommand("zoomInCommand", canvas != null);
    Pencil._enableCommand("zoom1Command", canvas != null);
    Pencil._enableCommand("zoomOutCommand", canvas != null);

    Pencil._enableCommand("moveLeftCommand", canvas != null);
    Pencil._enableCommand("moveRightCommand", canvas != null);

    Pencil._enableCommand("makeSameHorizontalSpaceCommand", target && target.makeSameHorizontalSpace);
    Pencil._enableCommand("makeSameVerticalSpaceCommand", target && target.makeSameVerticalSpace);

    Pencil._enableCommand("alignLeftCommand", target && target.alignLeft);
    Pencil._enableCommand("alignCenterCommand", target && target.alignCenter);
    Pencil._enableCommand("alignRightCommand", target && target.alignRight);
    Pencil._enableCommand("alignTopCommand", target && target.alignTop);
    Pencil._enableCommand("alignMiddleCommand", target && target.alignMiddle);
    Pencil._enableCommand("alignBottomCommand", target && target.alignBottom);

    Pencil._enableCommand("makeSameWidthCommand", target && target.makeSameWidth);
    Pencil._enableCommand("makeSameHeightCommand", target && target.makeSameHeight);
    Pencil._enableCommand("makeSameMinWidthCommand", target && target.makeSameMinWidth);
    Pencil._enableCommand("makeSameMinHeightCommand", target && target.makeSameMinHeight);

    Pencil._enableCommand("bringToFrontCommand", target && target.bringToFront);
    Pencil._enableCommand("bringForwardCommand", target && target.bringForward);
    Pencil._enableCommand("sendBackwardCommand", target && target.sendBackward);
    Pencil._enableCommand("sendToBackCommand", target && target.sendToBack);

    Pencil._enableCommand("formatPainterCommand", canvas && canvas.beginFormatPainter && target && (target.constructor == Group || target.constructor == Shape));

    Pencil._enableCommand("copyCommand", canvas && canvas.doCopy && target);
    Pencil._enableCommand("cutCommand", canvas && canvas.doCopy && target);
    Pencil._enableCommand("pasteCommand", canvas && canvas.doPaste);
    Pencil._enableCommand("deleteSelectedCommand", target != null);
    Pencil._enableCommand("duplicateCommand", canvas && canvas.doDuplicate && target);

    Pencil._enableCommand("groupCommand", target && target.constructor == TargetSet);
    Pencil._enableCommand("unGroupCommand", target && target.constructor == Group);

    Pencil._setupUndoRedoCommand();
};
Pencil._setupUndoRedoCommand = function () {
    var canvas = Pencil.activeCanvas;

    Pencil._enableCommand("undoCommand", canvas && canvas.careTaker && canvas.careTaker.canUndo());
    Pencil._enableCommand("redoCommand", canvas && canvas.careTaker && canvas.careTaker.canRedo());

    if (canvas && canvas.careTaker) {
        var currentAction = canvas.careTaker.getCurrentAction();
        var prevAction = canvas.careTaker.getPrevAction();
        if (canvas.careTaker.canUndo() && canvas.careTaker.canRedo()) {
            Pencil.updateUndoRedoMenu(currentAction, prevAction);
        } else if (canvas.careTaker.canUndo()) {
            Pencil.updateUndoRedoMenu(currentAction, "");
        } else {
            Pencil.updateUndoRedoMenu("", prevAction);
        }
    }
};
Pencil._enableCommand = function (name, condition) {
    /*"""
     .. function:: Pencil._enableCommand(name, condition)

         :param string name: An ``id`` of a ``<command>`` XUL Element.
         :param boolean condition: Determines whether the command is activated
             or deactivated. A value of ``true`` activates the command.
    */
    var command = document.getElementById(name);
    if (command) {
        if (condition) {
            command.removeAttribute("disabled");
        } else {
            command.setAttribute("disabled", true);
        }
    }
};

Pencil.getGridSize = function () {
    var size = Config.get("edit.gridSize");
    if (size == null) {
        size = 5;
        Config.set("edit.gridSize", size);
    }
    return {w: size, h: size};
};

Pencil.getCurrentTarget = function () {
    var canvas = Pencil.activeCanvas;
    return canvas ? canvas.currentController : null;
};
Pencil.isCollectionPaneVisibled = function () {
    return Pencil.sideBoxFloat.style.display != 'none';
}
Pencil._hideCollectionPane = function (c) {
    if (c <= 0) {
        Pencil.sideBoxFloat.style.display = "none";
        Pencil.hideCollectionPaneTimer = null;
        Pencil.setUpSizeGrip();
    } else {
        Pencil.sideBoxFloat.style.opacity = c;
        window.setTimeout("Pencil._hideCollectionPane(" + parseFloat(c - 0.5) + ")", 1);
    }
};
Pencil.hideCollectionPane = function () {
    if (!Pencil.hideCollectionPaneTimer) {
        if (Util.platform == "Linux") {
            Pencil.hideCollectionPaneTimer = window.setTimeout("Pencil._hideCollectionPane(0)", 1);
        } else {
            Pencil.hideCollectionPaneTimer = window.setTimeout("Pencil._hideCollectionPane(1)", 300);
        }
    }
}
Pencil.setUpSizeGrip = function () {
    var box = Pencil.sideBoxFloat.getBoundingClientRect();
    var sizeGrip = document.getElementById("collectionPaneSizeGrip");
    sizeGrip.setAttribute("left", (box.width - 15));
    sizeGrip.setAttribute("top", (box.height - 19));
    sizeGrip.style.display = Pencil.isCollectionPaneVisibled() ? '' : "none";
};
Pencil._showCollectionPane = function (c) {
    if (c == 0) {
        Pencil.sideBoxFloat.style.opacity = 0;
        Pencil.sideBoxFloat.style.display = "";
        Pencil.setUpSizeGrip();
    }
    if (c <= 1) {
        Pencil.sideBoxFloat.style.opacity = c;
        window.setTimeout("Pencil._showCollectionPane(" + parseFloat(c + 0.5) + ")", 1);
    }
};
Pencil.showCollectionPane = function () {
    if (Util.platform == "Linux") {
        Pencil.sideBoxFloat.style.opacity = 1;
        Pencil.sideBoxFloat.style.display = "";
        Pencil.setUpSizeGrip();
    } else {
        Pencil._showCollectionPane(0);
    }
};
Pencil.toggleCollectionPane = function (dockable) {
    if (!dockable) {
        if (Config.get("collectionPane.floating") == true) {
            if (Pencil.isCollectionPaneVisibled()) {
                if (Util.platform == "Linux") {
                    Pencil._hideCollectionPane(0);
                } else {
                    Pencil._hideCollectionPane(1);
                }
            } else {
                Pencil.showCollectionPane();
            }
        }
    } else {
        if (!Config.get("collectionPane.floating")) {
            Config.set("collectionPane.floating", true);
            document.getElementById("sideBox").style.display = "none";
            Pencil.collectionPane = document.getElementById("collectionPane");
            Pencil.privateCollectionPane = document.getElementById("privateCollectionPane");
            Pencil.collectionPane.reloadCollections();
            Pencil.privateCollectionPane.reloadCollections();
        } else {
            Pencil._hideCollectionPane(0);
            Config.set("collectionPane.floating", false);
            document.getElementById("sideBox").style.display = "";
            Pencil.collectionPane = document.getElementById("_collectionPane");
            Pencil.privateCollectionPane = document.getElementById("_privateCollectionPane");
            Pencil.collectionPane.reloadCollections();
            Pencil.privateCollectionPane.reloadCollections();
        }

        document.getElementById("floatingCollectionPane").setAttribute("checked", Config.get("collectionPane.floating") == false);
    }
};
Pencil.handlePropertiesCommand = function () {
    if (Pencil.activeCanvas.currentController) {
        Pencil.activeCanvas._showPropertyDialog();
    } else {
        if (!Pencil.controller._pageToEdit) {
            Pencil.controller._pageToEdit = Pencil.controller.getCurrentPage();
        }

        Pencil.controller.editPageProperties(Pencil.controller._pageToEdit);
        Pencil.controller._pageToEdit = null;
    }
};
Pencil.updateUndoRedoMenu = function (currentAction, prevAction) {
    Pencil.undoMenuItem.setAttribute("label", Util.getMessage("menu.undo.label") + currentAction);
    Pencil.redoMenuItem.setAttribute("label", Util.getMessage("menu.redo.label") + prevAction);
    Pencil.activeCanvas.updateContextMenu(currentAction, prevAction);
};

window.addEventListener("load", Pencil.boot, false);
window.addEventListener("keypress", function(event) {
    if (event.keyCode == event.DOM_VK_F5) {
        CollectionManager.loadStencils();
    }
}, false);

window.addEventListener("close", function (event) {
    if (Pencil.controller.modified) {
        if (!Pencil.controller._confirmAndSaveDocument()) {
            event.preventDefault();
            return;
        }
    }
    Pencil.rasterizer.cleanup();
}, false);
