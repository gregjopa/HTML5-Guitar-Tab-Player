// Contsructor - create new TabPlayer from the specified TabDiv object
function TabPlayer(tabDiv, tempo) {
  this.tabDiv = tabDiv;
  this.tempo = tempo || 120;
  this.notesPerBeat = 4;
  this.score = [];
  this.pixelMap = [];

  this.isPlaying = false;
  this.AudioDevice;

  this.cursorCanvas;
  this.cursorCtx;
  this.cursor = { width: 10 };
  this.intervalOn;
  
  this.debug = false;
}


// Parse the TabDiv Parser object for note names and durations
TabPlayer.prototype.prepareScore = function() {
  this.score = [];

  var tabDivNotes = this.tabDiv.parser.elements.notes;
  var numLines = tabDivNotes.length;

  for (var i = 0; i < numLines; i++) {
    var numLineNotes = tabDivNotes[i].length;

    for (var j = 0; j < numLineNotes; j++) {
      // Skip barlines - barline duration = "b"
      if (tabDivNotes[i][j].duration != "b") {
        var note = tabDivNotes[i][j].keyProps[0].key + tabDivNotes[i][j].keyProps[0].octave;
        var duration = tabDivNotes[i][j].ticks/Vex.Flow.RESOLUTION;
    
        this.score.push({ "notes": [note], "dur": duration });
      }
    } 
  }
};


// Parse the TabDiv Parser object for stave and note coordinates
TabPlayer.prototype.preparePixelMap = function() {
  this.pixelMap = [];
  var tabDivStaves = this.tabDiv.parser.elements.staves;
  var numLines = tabDivStaves.length;

  for (var i = 0; i < numLines; i++) { 
    this.pixelMap[i] = { 
      "line": i, 
      "x": tabDivStaves[i].note.getNoteStartX(),
      "y": tabDivStaves[i].note.getYForLine(0),
      "width": tabDivStaves[i].note.getNoteEndX() - tabDivStaves[i].note.getNoteStartX(),
      "height": tabDivStaves[i].tab.getYForLine(5) - tabDivStaves[i].note.getYForLine(0),
      "notes": []
    };
    
    var lineNotes = this.tabDiv.parser.elements.tabnotes[i];
    
    var numLineNotes = lineNotes.length;

    for (var j = 0; j < numLineNotes; j++) {
      if (lineNotes[j].duration != "b") {

        var start_x = lineNotes[j].getX() + (lineNotes[j].tickContext.padding * 2)  + this.pixelMap[i].x;
  
        // set end_x for last note in each line to end of stave
        // TODO - add code to handle when notes overflow stave
        if (j+1 < numLineNotes) {
          if (lineNotes[j+1].duration === "b") {
            var end_x = lineNotes[j+2].getX() + (lineNotes[j].tickContext.padding * 2) + this.pixelMap[i].x;
          }
          else {
            var end_x = lineNotes[j+1].getX() + (lineNotes[j].tickContext.padding * 2) + this.pixelMap[i].x;
          }   
        }
        else {
          var end_x = this.pixelMap[i].width + this.pixelMap[i].x;
        }
  
        this.pixelMap[i].notes.push({ "start_x": start_x, "end_x": end_x });
      }
    } 
  }
  //console.log(this.pixelMap);
};


TabPlayer.prototype.initCursor = function() {
  // create the canvas used to animate the cursor
  if (!$('#cursorCanvas').length) {
  
    $('#tab-wrapper').append(
      $('<canvas></canvas>').attr({ 
        id: "cursorCanvas",
        style: "position: absolute; left: 0; top: 0; z-index: 999; padding: 10px"
        })
    );

  }

  this.cursorCanvas = $("#cursorCanvas")[0];
  this.cursorCtx = this.cursorCanvas.getContext('2d');

  this.cursorCanvas.width = this.tabDiv.width;
  this.cursorCanvas.height = this.tabDiv.height;

  var firstStave = this.pixelMap[0];
  var firstNote = this.pixelMap[0].notes[0];
  
  this.cursor.x = firstNote.start_x;
  this.cursor.y = firstStave.y;
  this.cursor.height = firstStave.height;

  this.cursorCtx.fillStyle = "rgba(200,0,0, 0.5)";
  this.cursorCtx.fillRect(this.cursor.x, this.cursor.y, this.cursor.width, this.cursor.height);
  
  if (this.debug) {
    this.drawDebugRectangles(); 
  }

};


TabPlayer.prototype.animateCursor = function() {
  
  var lineIndex = 0,
      lineNoteIndex = 0,
      lineCount = 0,
      lineNoteCount = 0,
      noteIndex = 0;

      end_x = 0,
      frameRate = 60,
      intervalTime = 1000/frameRate,
      framesPerBeat = 60 / this.tempo * frameRate;

  var distance, moves, speed;

  var that = this;
  
  var cursorToNextNote = function() {
    that.cursor.y = that.pixelMap[lineIndex].y;
    that.cursor.x = that.pixelMap[lineIndex].notes[lineNoteIndex].start_x;
    end_x = that.pixelMap[lineIndex].notes[lineNoteIndex].end_x;

    // in pixels
    distance = end_x - that.cursor.x;

    // in frames per sec
    moves =  that.score[noteIndex].dur * that.notesPerBeat * framesPerBeat;

    // in pixels
    speed = distance / moves;

    lineCount = that.pixelMap.length;
    lineNoteCount = that.pixelMap[lineIndex].notes.length;

    noteIndex++;
    lineNoteIndex++;
    // console.log('distance ', distance);
    // console.log('moves ', moves);
    // console.log('speed ', speed);  
  };
 
  intervalOn = setInterval(function() {
    if (moves > 0) {
      that.cursorCtx.clearRect(0, 0, that.cursorCanvas.width, that.cursorCanvas.height);
      that.cursorCtx.fillStyle = "rgba(200,0,0, 0.5)";

      that.cursor.x += speed;

      that.cursorCtx.fillRect(that.cursor.x, that.cursor.y, that.cursor.width, that.cursor.height);
      
      if (that.debug) {
        that.drawDebugRectangles();
      } 

      moves--;      
      
    }
    else {
  
      // check for line breaks and end of song
      if (lineNoteIndex === lineNoteCount && lineNoteIndex != 0) {

        if (lineCount-1 === lineIndex) {
          // stop animation at end of song
          // console.log('end of song');
          clearInterval(intervalOn);
          that.cursorCtx.clearRect(that.cursor.x, that.cursor.y, that.cursor.width, that.cursor.height);
        }
        else {
          lineIndex++;
          lineNoteIndex = 0;
          that.cursor.y = that.pixelMap[lineIndex].y;
          cursorToNextNote();         
        }

      }
      else {
        cursorToNextNote();
      }
    }

  },
  intervalTime);

};


TabPlayer.prototype.stop = function() {
  if (this.isPlaying) {
    this.AudioDevice.kill();
    this.isPlaying = false; 
  }
  if (intervalOn) {
    clearInterval(intervalOn);
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
  }
};


TabPlayer.prototype.play = function() { 
  if (!this.isPlaying) {
    this.animateCursor();

    var noteIndex = 0,
      totalNotes = this.score.length,
      leadNoteLength = 0,
      fade = 0,
      fadePoint = 0;

      var that = this;


      var loadNote = function() {
        // When at the end of the song stop the audio loop
        if (noteIndex >= that.score.length) {
          that.stop();
        }
        else {
          var noteObj = that.score[noteIndex];

          // Reset oscillator
          lead.frequency = 0;
          lead.reset();

          // Set oscillator frequency
          lead.frequency = Note.fromLatin(noteObj.notes[0]).frequency();

          // Calculate note length in samples
          leadNoteLength = Math.floor(noteObj.dur * sampleRate * 60 * that.notesPerBeat / that.tempo);

          // reset fade
          fade = 0;
          // define fade point
          fadePoint = leadNoteLength - 300;

          noteIndex += 1;
        }
      }


      function audioCallback(buffer, channelCount) {

      var l = buffer.length,
        sample, note, n, current;

      // loop through each sample in the buffer     
      for (current=0; current<l; current+= channelCount){

        if (leadNoteLength === 0) {
          loadNote();
        }

        // fade in
        if (leadNoteLength > fadePoint) {
          fade = 1 - (leadNoteLength-fadePoint)/300;
        // fade out
        } else if (leadNoteLength<300) {
          fade = leadNoteLength/300;
        } else {
          fade = 1;
        }

        sample = 0;

        // Generate oscillator
        lead.generate();

        // Get oscillator mix and multiply by .5 to reduce amplitude
        sample = lead.getMix()*0.5*fade;

        // Fill buffer for each channel
        for (n=0; n<channelCount; n++) {
          buffer[current + n] = sample;
        }

        leadNoteLength -= 1;
      } 
    };


    // Create an instance of the AudioDevice class
    this.AudioDevice = audioLib.AudioDevice(audioCallback, 2);

    var sampleRate = this.AudioDevice.sampleRate;
    var lead = audioLib.Oscillator(sampleRate, 440);
  
    this.isPlaying = true;  
  }
}


TabPlayer.prototype.drawDebugRectangles = function() {
  var numLines = this.pixelMap.length;
  for (var i = 0; i < numLines; i++ ) {
    this.cursorCtx.strokeStyle = "#00ff00";
    this.cursorCtx.strokeRect(this.pixelMap[i].x, this.pixelMap[i].y, 
      this.pixelMap[i].width, this.pixelMap[i].height);

    var numLineNotes = this.pixelMap[i].notes.length;

    for (var j = 0; j < numLineNotes; j++) {
      this.cursorCtx.strokeStyle = "#0000ff";
      this.cursorCtx.strokeRect(this.pixelMap[i].notes[j].start_x, this.pixelMap[i].y - 10, 
       this.pixelMap[i].notes[j].end_x - this.pixelMap[i].notes[j].start_x, this.pixelMap[i].height + 30);  
    }

  }
}