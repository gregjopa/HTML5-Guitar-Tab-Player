// VexflowParser module - depends on vexflow.js and vextabdiv.js
var VexflowParser = (function() {

    // Use TabDiv Parser object for note names and durations
    var prepareScore = function(tabDiv) {
        var score = [],
        chord = [],
        tabDivNotes = tabDiv.parser.elements.notes,
        numLines = tabDivNotes.length;

        for (var i = 0; i < numLines; i++) {
            var numLineNotes = tabDivNotes[i].length;

            for (var j = 0; j < numLineNotes; j++) {
                // Skip barlines - barline duration = "b"
                if (tabDivNotes[i][j].duration !== "b") {
                    var numNotes = tabDivNotes[i][j].keys.length;

                    for (var k = 0; k < numNotes; k++) {
                        // Subtract 1 from octave since guitar sheet music is written an octave higher
                        chord.push(tabDivNotes[i][j].keyProps[k].key + (tabDivNotes[i][j].keyProps[k].octave - 1));
                    }

                    var duration = tabDivNotes[i][j].ticks / Vex.Flow.RESOLUTION;

                    score.push({
                        "notes": chord,
                        "dur": duration
                    });
                    chord = [];
                }
            }
        }

        return score;
    };



    // Use TabDiv Parser object for stave and note coordinates
    var preparePixelMap = function(tabDiv) {
        var pixelMap = [],
        tabDivStaves = tabDiv.parser.elements.staves,
        numLines = tabDivStaves.length;

        for (var i = 0; i < numLines; i++) {
            pixelMap[i] = {
                "line": i,
                "x": tabDivStaves[i].note.getNoteStartX(),
                "y": tabDivStaves[i].note.getYForLine(0),
                "width": tabDivStaves[i].note.getNoteEndX() - tabDivStaves[i].note.getNoteStartX(),
                "height": tabDivStaves[i].tab.getYForLine(5) - tabDivStaves[i].note.getYForLine(0),
                "notes": []
            };

            var lineNotes = tabDiv.parser.elements.tabnotes[i];
            var numLineNotes = lineNotes.length;

            for (var j = 0; j < numLineNotes; j++) {
                if (lineNotes[j].duration !== "b") {

                    var start_x = lineNotes[j].getX() + (lineNotes[j].tickContext.padding * 2) + pixelMap[i].x;

                    // set end_x for last note in each line to end of stave
                    // TODO - add code to handle when notes overflow stave
                    if (j + 1 < numLineNotes) {
                        if (lineNotes[j + 1].duration === "b") {
                            var end_x = lineNotes[j + 2].getX() + (lineNotes[j].tickContext.padding * 2) + pixelMap[i].x;
                        }
                        else {
                            var end_x = lineNotes[j + 1].getX() + (lineNotes[j].tickContext.padding * 2) + pixelMap[i].x;
                        }
                    }
                    else {
                        var end_x = pixelMap[i].width + pixelMap[i].x;
                    }

                    pixelMap[i].notes.push({
                        "start_x": start_x,
                        "end_x": end_x
                    });
                }
            }
        }

        return pixelMap;
    };


    // TODO: add support for vexflow

    // return public methods
    return {
        prepareScore: prepareScore,
        preparePixelMap: preparePixelMap
    };

} ());
