/* FAD V2 — global DICTATION. A floating mic appears at the right edge of any
   focused text input / textarea and dictates into it. Uses the Web Speech API
   where available; otherwise simulates a transcription. Plain JS — load with
   <script src="fad-dictation.js"></script>. Non-invasive: never mutates React's
   own DOM children, positions a portaled button by the field's bounding box. */
(function(){
  if (window.__fadDictation) return; window.__fadDictation = true;

  var SAMPLES = [
    "Draft a warm reply offering bag drop from 1pm and check-in at 3.",
    "Move the SD-10 follow-up to after lunch and tell Ishant.",
    "Send the April owner statement once the held expense is verified.",
    "Order 8 bath towels and 24 toilet rolls for the West store.",
    "Thanks team — great work on the turnovers today."
  ];

  var mic = null, target = null, listening = false, rec = null, hideTimer = null;

  function isField(el){
    if(!el || el.closest('.voice-ov')) return false;       // voice mode has its own mic
    if(el.closest('[data-no-dictate]')) return false;       // composers with an inline mic
    if(el.tagName==='TEXTAREA') return true;
    if(el.isContentEditable) return true;
    if(el.tagName!=='INPUT') return false;
    var t=(el.getAttribute('type')||'text').toLowerCase();
    return ['text','search','email','tel','url',''].indexOf(t)>=0;
  }

  function ensureMic(){
    if(mic) return mic;
    mic = document.createElement('button');
    mic.className = 'fad-dictate';
    mic.type = 'button';
    mic.setAttribute('aria-label','Dictate');
    mic.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>';
    // mousedown (not click) so the field doesn't blur before we act
    mic.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); toggle(); });
    document.body.appendChild(mic);
    return mic;
  }

  function place(){
    if(!mic || !target) return;
    var r = target.getBoundingClientRect();
    if(r.width===0){ hide(); return; }
    mic.style.top = (r.top + r.height/2 - 15) + 'px';
    mic.style.left = (r.right - 34) + 'px';
  }

  function show(el){
    target = el; ensureMic(); place();
    mic.classList.add('on');
  }
  function hide(){
    if(listening) return;            // keep visible while dictating
    if(mic) mic.classList.remove('on');
    target = null;
  }

  function setValue(el, text){
    if(el.isContentEditable){ el.textContent = text; el.dispatchEvent(new Event('input',{bubbles:true})); return; }
    var proto = el.tagName==='TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto,'value').set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function startReal(el){
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return false;
    try {
      rec = new SR(); rec.lang='en-US'; rec.interimResults=true; rec.continuous=false;
      var base = el.value || ''; var got=false;
      rec.onresult = function(ev){
        got=true; var txt=''; for(var i=0;i<ev.results.length;i++) txt += ev.results[i][0].transcript;
        setValue(el, (base?base+' ':'') + txt);
      };
      rec.onend = function(){ if(listening && !got) simulate(el); else stop(); };
      rec.onerror = function(){ if(listening && !got){ rec=null; simulate(el); } else stop(); };
      rec.start();
      // if nothing within 1.2s (e.g. no mic in this environment), simulate
      setTimeout(function(){ if(listening && !got){ try{ if(rec) rec.abort(); }catch(e){} rec=null; simulate(el); } }, 1200);
      return true;
    } catch(e){ return false; }
  }

  function simulate(el){
    var base = el.value ? el.value + ' ' : '';
    var phrase = SAMPLES[Math.floor(Math.random()*SAMPLES.length)];
    var i = 0;
    (function step(){
      if(!listening){ return; }
      i += Math.max(1, Math.round(phrase.length/22));
      setValue(el, base + phrase.slice(0, Math.min(i, phrase.length)));
      if(i < phrase.length){ window.__fadDictTimer = setTimeout(step, 55); }
      else { setTimeout(stop, 350); }
    })();
  }

  function toggle(){ listening ? stop() : start(); }
  function start(){
    if(!target) return;
    listening = true; mic.classList.add('listening');
    var el = target; el.focus();
    if(!startReal(el)) simulate(el);
  }
  function stop(){
    listening = false;
    if(mic) mic.classList.remove('listening');
    if(rec){ try{ rec.stop(); }catch(e){} rec=null; }
    if(window.__fadDictTimer){ clearTimeout(window.__fadDictTimer); window.__fadDictTimer=null; }
  }

  document.addEventListener('focusin', function(e){ if(isField(e.target)) show(e.target); });
  document.addEventListener('focusout', function(e){ if(e.target===target){ clearTimeout(hideTimer); hideTimer=setTimeout(hide,120); } });
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  // reposition periodically (covers React re-layouts) while a field is active
  setInterval(function(){ if(target) place(); }, 400);

  // public trigger for composers that render their own inline mic
  window.FADDICTATE = {
    toggleFor: function(el){ if(!el) return; target=el; el.focus(); toggle(); },
    isListening: function(){ return listening; }
  };
})();
