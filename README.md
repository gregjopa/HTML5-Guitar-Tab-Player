## Example usage

```javascript
/* Using TavDiv */

// disable tabdiv processing on page load
Vex.Flow.TabDiv.SEL = null;

$(document).ready(function() {

    // tabdiv - parse, create canvas, and draw
    var tabDiv = new Vex.Flow.TabDiv("#tab");

    // initialize tab player
    var player = new TabPlayer({
        'tabDiv': tabDiv,
        'tempo': 120,
        'notesPerBeat': 4,
        'animation': true ,
        'volume': 2 ,
        'autoScroll': true
    });

});

```