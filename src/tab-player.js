// create new TabPlayer from a TabDiv object
function TabPlayer(args) {
  
    this.cursor = {
        width: 5,
        height: 0,
        x: 0,
        y: 0
    };

    this.cursorDiv;

    this.noteIndex = -1;
    this.debug = false;

    this.loadTab(args);
    this.resetCursor = this.setupCursorAnimation();
}


TabPlayer.prototype.loadTab = function(args) {
  
    // mandatory arguments
    this.tabDiv = args.tabDiv;

    // check for optional arguments
    this.tempo = (typeof args.tempo === "number") ? args.tempo : 120;
  
    this.isPlaying = (typeof args.isPlaying === "boolean") ? args.isPlaying : false;

    this.notesPerBeat = (typeof args.notesPerBeat === "number") ? args.notesPerBeat : 4;

		this.cursor.animation = (typeof args.animation === "boolean") ? args.animation : true;

  
    this.score = VexflowParser.prepareScore(this.tabDiv);

    // initialize MusicTracker module
    MusicTracker.init({
        score: this.score,
        tempo: this.tempo,
        isPlaying: false,
        isLooping: false,
        hasMetronome: true,
        drumSample: samples.snare,
        notesPerBeat: this.notesPerBeat
    });

    this.sampleRate = MusicTracker.getSampleRate();
    this.pixelMap = VexflowParser.preparePixelMap(this.tabDiv);

    // reset the cursor when replacing an existing tab
    if (this.resetCursor) {
        this.resetCursor();
    }

    this.initializeCursor();
    this.addToolbar();
}



TabPlayer.prototype.translateCursor = function(x, y) {
    styleStr = "translate3d(" + x + "px, " + y + "px, 0px)";
    this.cursorDiv.style.webkitTransform = this.cursorDiv.style.MozTransform = this.cursorDiv.style.transform = styleStr;
}



TabPlayer.prototype.initializeCursor = function() {

    var $tab,
        $cursor,
        firstStave,
        firstNote,
        $vexCanvas;

    // add cursor div to the dom
    if (!$(this.tabDiv.sel + ' .tab-cursor').length) {
        $tab = $(this.tabDiv.sel);
        $tab.css('position', 'relative');
        $tab.append('<div class="tab-cursor"></div>');
    }

    $cursor = $(this.tabDiv.sel + ' .tab-cursor');
    this.cursorDiv = $cursor[0];

    firstStave = this.pixelMap[0];
    firstNote = this.pixelMap[0].notes[0];

    this.cursor.x = firstNote.start_x;
    this.cursor.y = firstStave.y;
    this.cursor.height = firstStave.height;

    $vexCanvas = $(this.tabDiv.ctx_sel.selector);

    $cursor.css({
        'width': this.cursor.width,
        'height': this.cursor.height,
        'background-color': 'rgba(200,0,0, 0.5)',
        'position': 'absolute',
        'left': ($vexCanvas.outerWidth() - $vexCanvas.width()) / 2,
        'top': ($vexCanvas.outerHeight() - $vexCanvas.height()) / 2,
        // enable hardware acceleration w/ CSS3 3D transforms
        '-webkit-transform-style': 'preserve-3d',
        '-moz-transform-style': 'preserve-3d',
        'overflow': 'hidden'
    });

    this.translateCursor(this.cursor.x, this.cursor.y);
};



TabPlayer.prototype.setupCursorAnimation = function() {

    var lineIndex = 0,
        lineNoteIndex = -1,
        lineCount = this.pixelMap.length,
        lineNoteCount = 0,
        begin_x = 0,
        end_x = 0,
        dynamicTempo = this.tempo,
        notePercentComplete = 0;

    // note duration measured in samples
    var currentNoteDuration = 0,
        noteStartTime = 0,
        // in pixels
        distance = 0;

    var that = this;


    var cursorToNextNote = function() {

        lineNoteIndex++;
        that.noteIndex++;

        lineNoteCount = that.pixelMap[lineIndex].notes.length;

        // check for line breaks
        if (lineNoteIndex === lineNoteCount && lineNoteIndex !== 0) {
            lineIndex++;
            lineNoteIndex = 0;

            // restart cursor at beginning if at end of song
            if (MusicTracker.getNoteIndex() === -1 || typeof that.pixelMap[lineIndex] === "undefined") {
              that.resetCursor();
              that.noteIndex = lineNoteIndex = 0;
            }
            else {
              that.cursor.y = that.pixelMap[lineIndex].y;             
            }

        }


        // in seconds
        noteStartTime = MusicTracker.getPlaybackTime() - MusicTracker.getStartTime();

        currentNoteDuration = that.score[that.noteIndex].dur * 60 * that.notesPerBeat / that.tempo * that.sampleRate;

        begin_x = that.pixelMap[lineIndex].notes[lineNoteIndex].start_x;
        end_x = that.pixelMap[lineIndex].notes[lineNoteIndex].end_x;
        that.cursor.x = begin_x;
        that.cursor.y = that.pixelMap[lineIndex].y;

        // in pixels
        distance = end_x - that.cursor.x;

        dynamicTempo = that.tempo;
    };


    var animateCursor = function(currentTime) {

        // TODO - find a better way to sync animation w/ dynamic tempo
        if (dynamicTempo !== that.tempo) {
            dynamicTempo = that.tempo;

            currentNoteDuration = that.score[that.noteIndex].dur
              * 60 * that.notesPerBeat / that.tempo * that.sampleRate;
        }

        notePercentComplete = (currentTime - noteStartTime) / currentNoteDuration;

        if (notePercentComplete > 1) {
            notePercentComplete = 1;
        }

        that.cursor.x = notePercentComplete * distance + begin_x;
    }


    function render() {
        var currentTime = MusicTracker.getPlaybackTime() - MusicTracker.getStartTime();

        // handle latency by starting animation when song actually starts
        // .getStartTime() returns null when audio is paused or stopped
        if (MusicTracker.getStartTime() && currentTime >= 0) {

            if (that.noteIndex === MusicTracker.getNoteIndex()) {

                if (that.cursor.animation) {
                    animateCursor(currentTime);
                }

                that.translateCursor(that.cursor.x, that.cursor.y);
            }
            else {
                cursorToNextNote();
                
            }

        }
        else {
            // stop animation when at the end of the song
            if (!MusicTracker.getIsPlaying()) {
                that.stop();
            }

        }
    }


    (function animloop() {
        requestAnimFrame(animloop);
        if (that.isPlaying) {
            render();
        }
    })();


    var resetCursor = function() {
        lineIndex = noteStartTime = 0;
        lineNoteIndex = that.noteIndex = -1;
    };


    return resetCursor;
};



TabPlayer.prototype.play = function() {

    if (!MusicTracker.getStartTime()) {
        this.resetCursor();
    }

    this.isPlaying = true;
    MusicTracker.play();
}



TabPlayer.prototype.pause = function() {

    this.isPlaying = false;
    MusicTracker.pause();
}



TabPlayer.prototype.stop = function() {

    var options;

    MusicTracker.stop();
    this.isPlaying = false;

    this.resetCursor();
    this.initializeCursor();

    options = {
        label: "play",
        icons: {
            primary: "ui-icon-play"
        }
    };

    $(this.tabDiv.sel + ' div.tab-toolbar button.play').button("option", options);
};



TabPlayer.prototype.addToolbar = function() {

    var that = this,
        $toolbar,
        $window,
        $placeholder,
        toolbarOffset,
        html,
        didScroll = false;

    if (!$(this.tabDiv.sel + ' .tab-toolbar').length) {

        html = '<div class="tab-toolbar ui-widget-header ui-corner-all">';

        // beginning/stop button
        html += '<button class="stop">go to beginning</button>';

        // play button
        html += '<button class="play">play</button>';

        // metronome checkbox
        html += '<input type="checkbox" id="metronome" checked /><label for="metronome">Beat</label>';

        // loop checkbox
        html += '<input type="checkbox" id="loop" /><label for="loop">Loop</label>';

        // toolbar divider
        html += '<div class="divider"></div>';

        // tempo slider
        html += '<div class="slider"><label>Tempo: </label><span class="tempo-val">'
          + this.tempo + '</span><div class="tempo"></div></div>';

        // volume slider
        html += '<div class="slider"><label>Volume: </label><span class="volume-val">'
          + MusicTracker.getVolume() + '</span><div class="volume"></div></div>';

        // debug grid button
        if (this.debug) {
            html += '<button class="debug-grid">debug grid</button>';
        }
        
        // end tab-toolbar
        html += '</div>';

        // placeholder for conditional fixed positioning        
        html += '<div class="tab-toolbar-placeholder"></div>';

        // append to dom
        $(this.tabDiv.sel).append(html);



        // set toolbar width
        $toolbar = $('.tab-toolbar');

        $toolbar.css({
            'width': parseFloat(this.tabDiv.width) - ($toolbar.outerWidth() - $toolbar.width())
        });


        // jquery ui widgets and events
        $(this.tabDiv.sel + ' div.tab-toolbar button.stop').button({
            text: false,
            icons: {
                primary: "ui-icon-seek-start"
            }
        })
        .click(function() {
            that.stop();
        });


        $(this.tabDiv.sel + ' div.tab-toolbar button.play').button({
            text: false,
            icons: {
                primary: "ui-icon-play"
            }
        })
        .click(function() {
            var options;
            if ($(this).text() === "play") {
                options = {
                    label: "pause",
                    icons: {
                        primary: "ui-icon-pause"
                    }
                };

                that.play();
            }
            else {
                options = {
                    label: "play",
                    icons: {
                        primary: "ui-icon-play"
                    }
                };

                that.pause();
            }
            $(this).button("option", options);
        });


        $(this.tabDiv.sel + ' div.tab-toolbar #metronome').button().change(function() {
            var $this = $(this);

            if ($this.is(':checked')) {
                MusicTracker.setHasMetronome(true);
            } else {
                MusicTracker.setHasMetronome(false);
            }
        });



        $(this.tabDiv.sel + ' div.tab-toolbar #loop').button().change(function() {
            var $this = $(this);

            if ($this.is(':checked')) {
                MusicTracker.setIsLooping(true);
            } else {
                MusicTracker.setIsLooping(false);
            }
        });



        $(this.tabDiv.sel + ' .tab-toolbar .tempo').slider({
            min: 10,
            max: 200,
            value: that.tempo,
            range: "min",
            slide: function(event, ui) {
                $(".tab-toolbar .tempo-val").text(ui.value);
                that.tempo = ui.value;
                MusicTracker.setTempo(ui.value);
            }

        });


        $(this.tabDiv.sel + ' .tab-toolbar .volume').slider({
            min: 0,
            max: 10,
            value: MusicTracker.getVolume(),
            range: "min",
            slide: function(event, ui) {
                $(".tab-toolbar .volume-val").text(ui.value);
                MusicTracker.setVolume(ui.value);
            }
        });


        // add debug grid button
        if (this.debug) {
            this.debug = false;
            $(this.tabDiv.sel + ' .debug-grid').button().click(function() {
                if (that.debug) {
                    that.debug = false;
                    that.clearDebugRectangles();
                }
                else {
                    that.debug = true;
                    that.drawDebugRectangles();
                }
            });
        }

        // conditional fixed positioning for toolbar
        $window = $(window);
        $placeholder = $('div.tab-toolbar-placeholder');
        toolbarOffset = $toolbar.offset();

        function fixedToolbarCheck() {

            if ($window.scrollTop() + $window.height() < toolbarOffset.top + $toolbar.height()) {
                $toolbar.addClass('tab-toolbar-fixed');
                $placeholder.show();
            }
            else {
                if ($placeholder.is(':visible')) {
                    $toolbar.removeClass('tab-toolbar-fixed');
                    $placeholder.hide();
                }
            }

        }

        fixedToolbarCheck();

        $window.scroll(function() {
            didScroll = true;
        });

        setInterval(function() {
            if (didScroll) {
                didScroll = false;
                fixedToolbarCheck();
            }
        }, 250);
    }
}



TabPlayer.prototype.drawDebugRectangles = function() {

    // create a canvas on top of tab for drawing rectangles
    if (!$(this.tabDiv.sel + ' .debugCanvas').length) {
        $(this.tabDiv.sel).append(
        $('<canvas></canvas>').attr({
            class: "debugCanvas",
            style: "position: absolute; z-index: 1; left: " +
            this.cursorDiv.style.left + "; top: " + this.cursorDiv.style.top + ";",
            width: this.tabDiv.width,
            height: this.tabDiv.height
        })
        );
    }

    var debugCtx = $(this.tabDiv.sel + ' .debugCanvas')[0].getContext('2d');
    var numLines = this.pixelMap.length;

    for (var i = 0; i < numLines; i++) {
        debugCtx.strokeStyle = "#00ff00";
        debugCtx.strokeRect(this.pixelMap[i].x, this.pixelMap[i].y,
        this.pixelMap[i].width, this.pixelMap[i].height);

        var numLineNotes = this.pixelMap[i].notes.length;

        for (var j = 0; j < numLineNotes; j++) {
            debugCtx.strokeStyle = "#0000ff";
            debugCtx.strokeRect(this.pixelMap[i].notes[j].start_x, this.pixelMap[i].y - 10,
            this.pixelMap[i].notes[j].end_x - this.pixelMap[i].notes[j].start_x, this.pixelMap[i].height + 30);
        }

    }
}



TabPlayer.prototype.clearDebugRectangles = function() {
    var debugCanvas = $(this.tabDiv.sel + ' .debugCanvas')[0];
    debugCanvas.width = this.tabDiv.width;
    debugCanvas.height = this.tabDiv.height;
}



// shim layer with setTimeout fallback
window.requestAnimFrame = (function() {
    return window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function(callback) {
        window.setTimeout(callback, 1000 / 60);
    };
})();
