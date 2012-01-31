// MusicTracker module - depends on audiolib.js and music.js
var MusicTracker = (function() {

    // audiolib generators, controls, and effects
    var dev,
        leads,
        adsr,
        adsrTotalTime,
        noise,
        lpf,
        reverb,
        gainControl,
        comp,
        sampler,
        // counters and other misc. variables
        beatTickCounter = 1,
        noteTickCounter = 1,
        tick = 0,
        noteDuration = .25,
        leadCount = 0,
        // in samples
        noteStartTime = 0;


    // song object w/ default values
    var song = {
        isPlaying: true,
        isLooping: true,
        hasMetronome: false,
        drumSample: null,
        tempo: 120,
        notesPerBeat: 4,
        score: [],
        startTime: 0,
        noteIndex: -1
    };



    var audioCallback = function(buffer, channelCount) {
        var bufferLength = buffer.length,
            sampleIndex,
            sample,
            singleTick,
            i,
            n;

        // Loop through each sample in the buffer
        for (sampleIndex = 0; sampleIndex < bufferLength; sampleIndex += channelCount) {

            if (song.isPlaying) {

                // Set startTime for synching animations w/ audio
                if (!song.startTime) {
                    song.startTime = dev.getPlaybackTime() + dev.preBufferSize;
                }

                // Tick counters used to sync metronome w/ song
                singleTick = 1 / dev.sampleRate * song.tempo / 60;
                beatTickCounter = beatTickCounter + singleTick;
                noteTickCounter = noteTickCounter + singleTick / (noteDuration * song.notesPerBeat);

                if (noteTickCounter >= 1) {
                    noteTickCounter = 0;
                    loadNote();
                    noteStartTime = sampleIndex + dev.getPlaybackTime() + dev.preBufferSize;
                }

                if (beatTickCounter >= 1) {
                    beatTickCounter = 0;

                    if (song.hasMetronome) {
                        sampler.noteOn(tick ? 440: 660);
                    }

                    tick = (tick + 1) % song.notesPerBeat;
                }

                // Generate samples
                sampler.generate();
                adsr.generate();
                noise.generate();

                sample = 0;

                for (i = 0; i < leadCount; i++) {
                    // Apply Noise to oscillator's fm parameter
                    leads[i].fm = noise.getMix() * 0.1;
                    leads[i].generate();

                    sample += leads[i].getMix() * adsr.getMix();
                }

                // Add sample to buffer for each channel
                for (n = 0; n < channelCount; n++) {
                    reverb.pushSample(sample, n);
                    buffer[sampleIndex + n] = gainControl.pushSample(lpf.pushSample(reverb.sample[n])
                      + (song.hasMetronome ? sampler.getMix() : 0));
                }

            }
        }

        // apply compressor effect at buffer level
        comp.append(buffer);
    };



    var loadNote = function() {
        var numLeads = leads.length,
            scoreLength = song.score.length,
            noteObj,
            noteTime,
            qtr,
            i;

        // When at end of song restart it when isLooping is true
        if (song.noteIndex >= (scoreLength - 1) && song.isLooping) {
            restart();
        }

        song.noteIndex += 1;

        // If not at end of song load the next note
        if (song.noteIndex < scoreLength) {

            noteObj = song.score[song.noteIndex];
            leadCount = noteObj.notes.length;

            // Reset oscillators
            for (i = 0; i < numLeads; i++) {
                leads[i].frequency = 0;
                leads[i].reset();
            }

            // Set oscillator frequency
            for (i = 0; i < leadCount; i++) {
                leads[i].frequency = Note.fromLatin(noteObj.notes[i]).frequency();
            }

            noteDuration = noteObj.dur;

            noteTime = noteObj.dur * 60 * song.notesPerBeat / song.tempo;

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

        }
        else {
            stop();
        }
    };



    var buildAudio = function() {
        var i,
        len;

        // fix for FireFox bug w/ sink.js - https://bugzilla.mozilla.org/show_bug.cgi?id=699633
        Sink.doInterval.backgroundWork = !/firefox\/8.0/i.test(navigator.userAgent);

        // Initialize audio device
        dev = audioLib.AudioDevice(audioCallback, 2);

        // Initialize 6 oscillators - one for each guitar string
        leads = [
            audioLib.Oscillator(dev.sampleRate, 0),
            audioLib.Oscillator(dev.sampleRate, 0),
            audioLib.Oscillator(dev.sampleRate, 0),
            audioLib.Oscillator(dev.sampleRate, 0),
            audioLib.Oscillator(dev.sampleRate, 0),
            audioLib.Oscillator(dev.sampleRate, 0)
        ];

        // Use sawtooth wave shape for all oscillators
        for (i = 0, len = leads.length; i < len; i++) {
            leads[i].waveShape = 'sawtooth';
        }

        // Initialize ADSR Envelope control
        adsr = audioLib.ADSREnvelope(dev.sampleRate, 35, 15, .4, 100);
        adsrTotalTime = adsr.attack + adsr.decay + adsr.release;

        // Initialize Noise generator
        noise = audioLib.Noise(dev.sampleRate, 'white');

        // Initialize Effects
        lpf = new audioLib.BiquadFilter.LowPass(dev.sampleRate, 1500, 0.6);
        reverb = audioLib.Reverb(dev.sampleRate, 2, .6, .45, .5, .25);
        gainControl = audioLib.GainController(dev.sampleRate, 0.5);

        comp = audioLib.Compressor.createBufferBased(2, dev.sampleRate, 3, 0.5);

        // Initialize Sampler
        sampler = audioLib.Sampler(dev.sampleRate);
        // Load drum sample
        if (song.drumSample) {
            sampler.loadWav(atob(song.drumSample), true);
        }

    };


    var init = function(args) {

        // mandatory arguments
        song.score = args.score;

        // check for optional arguments
        song.tempo = (typeof args.tempo === "number") ? args.tempo: 120;

        song.isPlaying = (typeof args.isPlaying === "boolean") ? args.isPlaying: false;

        song.isLooping = (typeof args.isLooping === "boolean") ? args.isLooping: true;

        song.hasMetronome = (typeof args.hasMetronome === "boolean") ? args.hasMetronome: false;

        song.drumSample = (typeof args.drumSample === "string") ? args.drumSample: null;

        // if audioDevice already exists restart song w/ new arguments
        (typeof dev === 'undefined') ? buildAudio() : restart();
    };


    var play = function() {
        if (song.noteIndex === -1) {
            beatTickCounter = 1;
            noteTickCounter = 1;
            tick = 0;
        }

        song.isPlaying = true;
    };


    var pause = function() {
        song.isPlaying = false;
    };


    var stop = function() {
        song.noteIndex = -1;
        song.startTime = null;
        song.isPlaying = false;
    };


    // Private method
    var restart = function() {
        song.noteIndex = -1;
        song.startTime = null;
    };


    // Setters and getters
    var setIsLooping = function(isLooping) {
        song.isLooping = isLooping;
    };


    var setHasMetronome = function(hasMetronome) {
        song.hasMetronome = hasMetronome;
    };


    var setTempo = function(tempo) {
        song.tempo = tempo;
    };


    var setVolume = function(volume) {
        gainControl.gain = volume / 10;
    };

    var getIsPlaying = function() {
        return song.isPlaying;
    }

    var getTempo = function() {
        return song.tempo;
    };


    var getVolume = function() {
        return gainControl.gain * 10;
    };


    // getters for syncing audio w/ animation
    var getStartTime = function() {
        return song.startTime;
    }

    // handle latency to return the actual current note index
    var getNoteIndex = function() {
        var actualNoteIndex;

        if (noteStartTime < dev.getPlaybackTime()) {
            actualNoteIndex = song.noteIndex;
        }
        else {
            actualNoteIndex = song.noteIndex - 1;
        }

        return actualNoteIndex;
    }


    var getSampleRate = function() {
        return dev.sampleRate;
    }


    var getPlaybackTime = function() {
        return dev.getPlaybackTime();
    }



    // return public methods
    return {
        init: init,
        play: play,
        pause: pause,
        stop: stop,

        setIsLooping: setIsLooping,
        setHasMetronome: setHasMetronome,
        setTempo: setTempo,
        setVolume: setVolume,

        getIsPlaying: getIsPlaying,
        getTempo: getTempo,
        getVolume: getVolume,
        getStartTime: getStartTime,
        getNoteIndex: getNoteIndex,
        getSampleRate: getSampleRate,
        getPlaybackTime: getPlaybackTime
    };

} ());
