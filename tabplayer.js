// Contsructor - create new TabPlayer from the specified TabDiv object
function TabPlayer(tabDiv, tempo) {
  this.tabDiv = tabDiv;
  this.tempo = tempo || 120;
  this.notesPerBeat = 4;
  this.score = [];
  this.pixelMap = [];

  this.isPlaying = false;
  this.audioDevice;

  this.cursorCanvas;
  this.cursorCtx;
  this.cursor = { width: 10 };
  this.cursorStop; // function to stop animation
  
  this.debug = false;
}


// fix for FireFox bug w/ sink.js - https://bugzilla.mozilla.org/show_bug.cgi?id=699633
Sink.doInterval.backgroundWork = !/firefox\/8.0/i.test(navigator.userAgent);


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
      noteIndex = 0,
      begin_x = 0,
      end_x = 0,

      frameRate = 60,
      intervalTime = 1000/frameRate;

  // note duration measured in seconds
  var currentNoteDuration = 0,
      noteStartTime = 0,
      noteEndTime = 0,
      distance = 0;

  var that = this;
  
  var cursorToNextNote = function() {
    begin_x = that.pixelMap[lineIndex].notes[lineNoteIndex].start_x;
    end_x = that.pixelMap[lineIndex].notes[lineNoteIndex].end_x;
    that.cursor.x = begin_x;
    that.cursor.y = that.pixelMap[lineIndex].y;
    
    noteStartTime = that.audioDevice.getPlaybackTime() / that.audioDevice.sampleRate;

    // in pixels
    distance = end_x - that.cursor.x;

    // in seconds
    currentNoteDuration = that.score[noteIndex].dur * 60 * that.notesPerBeat / that.tempo;

    noteEndTime += currentNoteDuration;
    
    noteIndex++;
    lineNoteIndex++;

    lineCount = that.pixelMap.length;
    lineNoteCount = that.pixelMap[lineIndex].notes.length;
  };
 
  that.cursorStop = Sink.doInterval(function() {
  
    var currentTime = that.audioDevice.getPlaybackTime() / that.audioDevice.sampleRate;

    if (currentTime < noteEndTime) {

      var notePercentComplete = (currentTime - noteStartTime) / currentNoteDuration;
      that.cursor.x = notePercentComplete * distance + begin_x;

      that.cursorCtx.clearRect(0, 0, that.cursorCanvas.width, that.cursorCanvas.height);
      that.cursorCtx.fillRect(that.cursor.x, that.cursor.y, that.cursor.width, that.cursor.height);
      
      if (that.debug) {
        that.drawDebugRectangles();
      }
    
    }
    else {
  
      // check for line breaks and end of song
      if (lineNoteIndex === lineNoteCount && lineNoteIndex != 0) {

        if (lineCount-1 === lineIndex) {
          // stop animation at end of song
          that.cursorStop();
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
    this.audioDevice.kill();
    this.isPlaying = false; 

    this.cursorStop();
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);  
  }
};


TabPlayer.prototype.play = function() { 
  if (!this.isPlaying) {

    var noteIndex = 0,
      totalNotes = this.score.length,
      leadNoteLength = 0,

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

        // Generate ADSR Envelope
        adsr.generate();

        // Get oscillator mix and multiply by .5 to reduce amplitude
        sample = lead.getMix() * adsr.getMix() * 0.5;

          noteIndex += 1;
        }
      }


      function audioCallback(buffer, channelCount) {

      var l = buffer.length,
        sample, note, n, current;
      // Reset ADSR Envelope
      adsr.triggerGate(true);

      // loop through each sample in the buffer     
      for (current=0; current<l; current+= channelCount){

        if (leadNoteLength === 0) {
          loadNote();
        }

      var noteTime = noteObj.dur * 60 * that.notesPerBeat / that.tempo;

        sample = 0;
      // Calculate note length in samples
      that.leadNoteLength = Math.floor(noteTime * sampleRate);

        // Generate oscillator
        lead.generate();
      // Set ADSR Envelope Time
      if (noteTime * 1000 > adsrTotalTime) {
        adsr.sustainTime = noteTime * 1000 - adsrTotalTime;
        adsr.attack = adsr.decay = adsr.release = 50;       
      }
      else {  
        var qtr = (noteTime * 1000) / 4;
        adsr.attack = adsr.decay = adsr.sustainTime = adsr.release = qtr;
      }


        // Fill buffer for each channel
        for (n=0; n<channelCount; n++) {
          buffer[current + n] = sample;
        }

        leadNoteLength -= 1;
      } 
    };

  var adsr = audioLib.ADSREnvelope(sampleRate, 50, 50, .4, 50);
  var adsrTotalTime = adsr.attack + adsr.decay + adsr.release;

    // Create an instance of the AudioDevice class
    this.audioDevice = audioLib.AudioDevice(audioCallback, 2);

    var sampleRate = this.audioDevice.sampleRate;
    var lead = audioLib.Oscillator(sampleRate, 440);
  
    this.isPlaying = true;

    // start animation
    this.animateCursor();
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