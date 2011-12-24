// Contsructor - create new TabPlayer from a TabDiv object
function TabPlayer(tabDiv, tempo) {
  this.tabDiv = tabDiv;
  this.tempo = tempo || 120;
  this.notesPerBeat = 4;
  this.score = [];
  this.pixelMap = [];

  this.isPlaying = false;
  this.audioDevice;
  this.startTime = null;

  this.cursorDiv;
  this.cursor = { width: 5 };

  this.noteIndex = 0;

  this.beatTickCounter = 1;  
  this.noteTickCounter = 1;
  this.tick = 0;

  this.debug = false;

  // funtions to prepare tab player
  this.prepareScore();
  this.preparePixelMap();
  this.initializeCursor();
  this.setupAudio();
  this.resetCursor = this.setupCursorAnimation();
}


// fix for FireFox bug w/ sink.js - https://bugzilla.mozilla.org/show_bug.cgi?id=699633
Sink.doInterval.backgroundWork = !/firefox\/8.0/i.test(navigator.userAgent);


// Parse the TabDiv Parser object for note names and durations
TabPlayer.prototype.prepareScore = function() {
  this.score = [];

  var tabDivNotes = this.tabDiv.parser.elements.notes;
  var numLines = tabDivNotes.length;

  var chord = [];

  for (var i = 0; i < numLines; i++) {
    var numLineNotes = tabDivNotes[i].length;

    for (var j = 0; j < numLineNotes; j++) {
      // Skip barlines - barline duration = "b"
      if (tabDivNotes[i][j].duration != "b") {
        var numNotes = tabDivNotes[i][j].keys.length;
  
        for (var k = 0; k < numNotes; k++) {
          // Subtract 1 from octave since guitar sheet music is written an octave higher
          chord.push(tabDivNotes[i][j].keyProps[k].key + (tabDivNotes[i][j].keyProps[k].octave - 1));         
        }
  
        var duration = tabDivNotes[i][j].ticks/Vex.Flow.RESOLUTION;
    
        this.score.push({ "notes": chord, "dur": duration });
        chord = [];
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


TabPlayer.prototype.translateCursor = function(x, y) {
  styleStr = "translate("+ x +"px, "+ y +"px)";
  this.cursorDiv.style.webkitTransform = this.cursorDiv.style.MozTransform = this.cursorDiv.style.transform = styleStr;   
}


TabPlayer.prototype.initializeCursor = function() {

  // add cursor div to the dom
  if (!$('#tab-cursor').length) {
    $('#tab-wrapper').append('<div id="tab-cursor"></div>');
  }

  var $cursor = $("#tab-cursor");
  this.cursorDiv = $cursor[0];

  var firstStave = this.pixelMap[0];
  var firstNote = this.pixelMap[0].notes[0];

  this.cursor.x = firstNote.start_x;
  this.cursor.y = firstStave.y;
  this.cursor.height = firstStave.height;

  $cursor.css({
      'width' : this.cursor.width,
      'height' : this.cursor.height,
      'background-color' : 'rgba(200,0,0, 0.5)',
      'position' : 'absolute',
      'left' : 10,
      'top' : 10,
      '-webkit-transform' : 'translateZ(0px)'
  });
  
  this.translateCursor(this.cursor.x, this.cursor.y);
};


TabPlayer.prototype.setupCursorAnimation = function() {
  
  var lineIndex = 0,
      lineNoteIndex = 0,
      lineCount = this.pixelMap.length,
      lineNoteCount = 0,
      noteIndex = 0,
      begin_x = 0,
      end_x = 0;

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

    noteStartTime = (that.audioDevice.getPlaybackTime() - that.startTime) / that.audioDevice.sampleRate;

    // in pixels
    distance = end_x - that.cursor.x;

    // in seconds
    currentNoteDuration = that.score[noteIndex].dur * 60 * that.notesPerBeat / that.tempo;

    noteEndTime += currentNoteDuration;

    noteIndex++;
    lineNoteIndex++;

    lineNoteCount = that.pixelMap[lineIndex].notes.length;
  };


  function render() {
    var currentTime = (that.audioDevice.getPlaybackTime() - that.startTime) / that.audioDevice.sampleRate;

    // handles preBufferSize by starting animation when song actually starts
    if (that.startTime && currentTime >= 0) {

      if (currentTime < noteEndTime) {  
        var notePercentComplete = (currentTime - noteStartTime) / currentNoteDuration;
        that.cursor.x = notePercentComplete * distance + begin_x;

        that.translateCursor(that.cursor.x, that.cursor.y);
      }
      else {
        // check for line breaks
        if (lineNoteIndex === lineNoteCount && lineNoteIndex != 0) {
          lineIndex++;
          lineNoteIndex = 0;
          that.cursor.y = that.pixelMap[lineIndex].y;        
        }

        cursorToNextNote();
      }

    }
  }
 
  (function animloop(){
    requestAnimFrame(animloop);
    if (that.isPlaying) {
      render();     
    }
  })();

  var resetCursor = function() {  
    lineIndex = 0,
    lineNoteIndex = 0,
    noteIndex = 0,
    noteStartTime = 0,
    noteEndTime = 0;
  };

  return resetCursor;
};


TabPlayer.prototype.setupAudio = function() {

  var totalNoteCount = this.score.length,
      leadCount = 0,
      noteDuration = .25;

  var that = this;

  var audioCallback = function(buffer, channelCount) {
  
    var l = buffer.length,
        sample, note, n, current, singleTick;

    // loop through each sample in the buffer
    for (current = 0; current < l; current += channelCount) {

      if (that.isPlaying) {
  
        if (!that.startTime) {
          that.startTime = that.audioDevice.getPlaybackTime() + that.audioDevice.preBufferSize;
        }

        singleTick = 1 / that.audioDevice.sampleRate * that.tempo / 60;

        that.beatTickCounter = that.beatTickCounter + singleTick;
        that.noteTickCounter = that.noteTickCounter + singleTick / (noteDuration*4);

        if (that.noteTickCounter >= 1) {
          that.noteTickCounter = 0;
          loadNote();
        }
        
        if (that.beatTickCounter >= 1) {
          that.beatTickCounter = 0;
          sampler.noteOn(that.tick ? 440 : 659.26);
          that.tick = (that.tick + 1) % that.notesPerBeat;
        }

        sampler.generate();
        adsr.generate();
        noise.generate();

        sample = 0;

        for (i=0; i<leadCount; i++){
          // Apply Noise to oscilator's fm parameter
          leads[i].fm = noise.getMix() * 0.1;         
          leads[i].generate();

          sample += lpf.pushSample(leads[i].getMix() * adsr.getMix() * 0.5); 
        }

        // Fill buffer for each channel
        for (n=0; n<channelCount; n++) {
	        reverb.pushSample(sample, n);
          buffer[current + n] = reverb.sample[n] + sampler.getMix();
        }

      } 
    }


    // apply effects    
    comp.append(buffer);
    // distort.append(buffer);
  };


  var loadNote = function() {
    
    // When at the end of the song stop the audio loop
    if (that.noteIndex >= totalNoteCount) {
      that.stop();
    }
    else {
  
      var noteObj = that.score[that.noteIndex],
          noteTime, qtr, i;
          
      leadCount = noteObj.notes.length;   
       
      for (i=0; i < leads.length; i++) {
        leads[i].frequency = 0;
        leads[i].reset();
      }

      // Set oscillator frequency
      for (i=0; i < leadCount; i++) {
        leads[i].frequency = Note.fromLatin(noteObj.notes[i]).frequency();
      }

      noteDuration = noteObj.dur;

      noteTime = noteObj.dur * 60 * that.notesPerBeat / that.tempo;

      // Reset ADSR Envelope
      adsr.triggerGate(true);

      // Set ADSR Envelope Time
      if (noteTime * 1000 > adsrTotalTime) {
        adsr.sustainTime = noteTime * 1000 - adsrTotalTime;
        adsr.attack = adsr.decay = adsr.release = 50;       
      }
      else {  
        qtr = (noteTime * 1000) / 4;
        adsr.attack = adsr.decay = adsr.sustainTime = adsr.release = qtr;
      }

      that.noteIndex += 1;
    }
  }


  // Create an instance of the AudioDevice class
  this.audioDevice = audioLib.AudioDevice(audioCallback, 2);

  var sampleRate = this.audioDevice.sampleRate;
  //var lead = audioLib.Oscillator(sampleRate, 440);
  var leads = [
    audioLib.Oscillator(sampleRate, 0),
    audioLib.Oscillator(sampleRate, 0),
    audioLib.Oscillator(sampleRate, 0),
    audioLib.Oscillator(sampleRate, 0),
    audioLib.Oscillator(sampleRate, 0),
    audioLib.Oscillator(sampleRate, 0)
  ];
  
  for (var i=0; i < leads.length; i++) {
    leads[i].waveShape = 'sawtooth';  
  }

  
  var adsr = audioLib.ADSREnvelope(sampleRate, 35, 15, .4, 100);
  var adsrTotalTime = adsr.attack + adsr.decay + adsr.release;

  var noise = audioLib.Noise(sampleRate, 'white');

  // effects
  var lpf = new audioLib.BiquadFilter.LowPass(sampleRate, 1500, 0.6);
  var comp  = audioLib.Compressor.createBufferBased(2, sampleRate, 3, 0.5);
  // var distort = audioLib.Distortion.createBufferBased(2, sampleRate);
  var reverb = audioLib.Reverb(sampleRate, 2, .1, .8, .5, .25);

  // metronome
  var sampler = audioLib.Sampler(sampleRate);
  var sample = atob(samples.snare);
  sampler.loadWav(sample, true);
}


TabPlayer.prototype.play = function() {
  if (!this.isPlaying) {
  
    if (this.noteIndex === 0) {
      this.beatTickCounter = 1;
      this.noteTickCounter = 1;
      this.tick = 0;
    }
  
    this.isPlaying = true;
  }
}


TabPlayer.prototype.stop = function() {
  if (this.isPlaying) {
  
    this.isPlaying = false;
    this.noteIndex = 0;
    this.startTime = null;
    
    this.resetCursor();
    this.initializeCursor();
  }
};


TabPlayer.prototype.drawDebugRectangles = function() {
  
  // create a canvas on top of tab for drawing rectangles 
  if (!$('#debugCanvas').length) {
    $('#tab-wrapper').append(
      $('<canvas></canvas>').attr({ 
        id: "debugCanvas",
        style: "position: absolute; left: 0; top: 0; z-index: 999; padding: 10px",
        width: this.tabDiv.width,
        height: this.tabDiv.height
      })
    );
  }

  var debugCtx = $('#debugCanvas')[0].getContext('2d');
  var numLines = this.pixelMap.length;
  
  for (var i = 0; i < numLines; i++ ) {
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
  var debugCanvas = $('#debugCanvas')[0];
  debugCanvas.width = this.tabDiv.width;
  debugCanvas.height = this.tabDiv.height;
}


// shim layer with setTimeout fallback
window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame       || 
          window.webkitRequestAnimationFrame || 
          window.mozRequestAnimationFrame    || 
          window.oRequestAnimationFrame      || 
          window.msRequestAnimationFrame     || 
          function( callback ){
            window.setTimeout(callback, 1000 / 60);
          };
})();
