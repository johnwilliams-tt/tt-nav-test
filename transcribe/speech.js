/* Speech to text through the browser's own recogniser (Chrome and Safari;
   Chrome sends the audio to Google, Safari to Apple). It listens for as long
   as the waveform runs and shows nothing while it does: finish() ends the
   session and resolves with everything it heard. Without a recogniser, or
   without permission, it resolves with an empty string. */
(function () {
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  // How long finish() waits for the recogniser's last result before settling
  // on what it has.
  var SETTLE_MS = 4000;

  var recognition = null;
  var finals = [];
  var interim = '';
  var settle = null;

  function heard() {
    return finals.concat(interim ? [interim] : []).join(' ').replace(/\s+/g, ' ').trim();
  }

  // The recogniser ends a session on its own after a pause; while the person
  // is still listening it is started again, so a long dictation is one take.
  function begin() {
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = document.documentElement.lang || 'en-US';

    recognition.onresult = function (event) {
      interim = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var text = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) finals.push(text);
        else interim += ' ' + text;
      }
      interim = interim.trim();
    };

    recognition.onerror = function (event) {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Transcribe: speech recognition failed —', event.error);
      }
    };

    recognition.onend = function () {
      if (settle) {
        var done = settle;
        settle = null;
        recognition = null;
        done(heard());
      } else if (recognition) {
        if (interim) finals.push(interim);
        interim = '';
        try {
          recognition.start();
        } catch (error) {
          recognition = null;
        }
      }
    };

    try {
      recognition.start();
    } catch (error) {
      recognition = null;
    }
  }

  window.transcribeSpeech = {
    start: function () {
      finals = [];
      interim = '';
      settle = null;
      if (Recognition) begin();
    },

    finish: function () {
      return new Promise(function (resolve) {
        if (!recognition) {
          resolve(heard());
          return;
        }
        var timer = setTimeout(function () {
          if (!settle) return;
          settle = null;
          var stale = recognition;
          recognition = null;
          if (stale) stale.abort();
          resolve(heard());
        }, SETTLE_MS);
        settle = function (text) {
          clearTimeout(timer);
          resolve(text);
        };
        recognition.stop();
      });
    },

    cancel: function () {
      settle = null;
      var stale = recognition;
      recognition = null;
      if (stale) stale.abort();
      finals = [];
      interim = '';
    },
  };
})();
