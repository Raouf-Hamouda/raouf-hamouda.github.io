(function () {
  /* ------------ tiny polyfills ------------ */
  var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
  var caf = window.cancelAnimationFrame || clearTimeout;

  // CSS.escape polyfill
  if (!(window.CSS && CSS.escape)) {
    (function () {
      var cssEscape = function (val) { return String(val).replace(/["\\]/g, "\\$&"); };
      window.CSS = window.CSS || {};
      CSS.escape = cssEscape;
    })();
  }

  // Show HTTPS notice when not in a secure context (prevents camera)
  (function showHttpsNoticeIfNeeded(){
    var ok = (location.protocol === "https:" ||
              location.hostname === "localhost" ||
              location.hostname === "127.0.0.1");
    var n = document.getElementById("httpsNotice");
    if (n) n.hidden = !!ok;
  })();

  var canvas = document.getElementById("trail-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;

  var defaultCorner = document.querySelector('.corner-text[data-caption-default]');
  var visibleCorner = defaultCorner;

  /* NEW: topnav instead of hamburger */
  var topnav = document.getElementById("topnav");

  /* Track if user has interacted */
  var hasInteracted = false;

  function resize() {
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (e) {}
    canvas.width  = Math.ceil((window.innerWidth || document.documentElement.clientWidth) * dpr);
    canvas.height = Math.ceil((window.innerHeight || document.documentElement.clientHeight) * dpr);
    canvas.style.width  = "100vw";
    canvas.style.height = "100vh";
    try { ctx.scale(dpr, dpr); } catch (e) {}
    scheduleCornerFallback();
  }
  resize();
  window.addEventListener("resize", resize);

  /* ------- preload images for stamping ------- */
  var images = [];
  var IMAGE_PATHS = [
    "DAS.JPG","LAS.jpg","(y).jpg","MEDS.jpg","WA.jpg","A.jpg","B.jpg","C.jpg","D.jpg","X1.jpg","G.jpg","F.jpg","A copy.jpg","u.jpg","DADA.jpg","00.jpg","XS.jpg","DARK.jpg","FEX.jpg",
    "Mona Lisa by Leo.JPG","BMW.jpg","DA34.jpg","BV.png","still missing her.jpg","VD.jpg"
  ];

  function uniqueArray(list){ var out=[]; for (var i=0;i<list.length;i++) if (out.indexOf(list[i])===-1) out.push(list[i]); return out; }
  function makeVariants(src){
    var clean=(src||"").replace(/\\/g,"/"); var lower=clean.toLowerCase();
    var lowerExt=clean.replace(/\.(jpe?g|png|webp|gif)$/i,function(m){return m.toLowerCase();});
    var swapJpegJpg=/\.jpe?g$/i.test(clean)?clean.replace(/\.jpe?g$/i,".jpeg"):clean.replace(/\.jpeg$/i,".jpg");
    return uniqueArray([clean,lower,lowerExt,swapJpegJpg]);
  }
  function loadWithFallbacks(src,onReady){
    var variants=makeVariants(src); var i=0;
    (function tryNext(){
      if (i>=variants.length) return;
      var img=new Image(); img.decoding="async"; img.loading="eager";
      img.src=encodeURI(variants[i++]); img.onload=function(){ if (img.naturalWidth) onReady(img); };
      img.onerror=tryNext;
    })();
  }
  for (var ii=0; ii<IMAGE_PATHS.length; ii++) loadWithFallbacks(IMAGE_PATHS[ii], function(img){ images.push(img); });

  /* ------- deck / pick ------- */
  var deck=[]; var lastPicked=null;
  function shuffle(arr){ for (var i=arr.length-1;i>0;i--){ var j=(Math.random()*(i+1))|0; var t=arr[i]; arr[i]=arr[j]; arr[j]=t; } return arr; }
  function refillDeck(){ deck=shuffle(images.slice()); }
  function pick(){ if(!deck.length) refillDeck(); if(!deck.length) return null;
    var candidate=deck.pop(); if(candidate===lastPicked && deck.length){ deck.unshift(candidate); candidate=deck.pop(); }
    lastPicked=candidate; return candidate; }

  /* ------- stamping ------- */
  var currentImg=null, stampSize=260, lastX=null, lastY=null, angle=0, stepAccum=0, baseStep=0, minStep=0;

  // PHONE-SAFE SIZE (now ~1/3 bigger than before)
  function isPhone(){ try{ return window.matchMedia && window.matchMedia('(max-width: 640px)').matches; } catch(e){ return (window.innerWidth||0) <= 640; } }
  function computeStampSize(){
    if (!isPhone()){
      // desktop/tablet: keep original range
      return 180 + Math.random()*230; // 180–410 px
    }
    // phone: ~24%–50% of the shorter side (previously ~18%–38%)
    var shorter = Math.min(window.innerWidth || 0, window.innerHeight || 0) || 360;
    var minPx = Math.max(96, Math.round(shorter * 0.44)); // ~24%
    var maxPx = Math.max(minPx + 20, Math.round(shorter * 0.55)); // ~50%
    return minPx + Math.random()*(maxPx - minPx);
  }

  function drawStamp(img,x,y,w,rot){
    if(!img||!img.naturalWidth) return; if(typeof rot!=="number") rot=0;
    var h=w*((img.naturalHeight||1)/(img.naturalWidth||1));
    ctx.save(); ctx.shadowColor="rgba(0,0,0,0.25)"; ctx.shadowBlur=16; ctx.shadowOffsetY=8;
    ctx.translate(x,y); ctx.rotate(rot); ctx.drawImage(img,-w/2,-h/2,w,h); ctx.restore();
    scheduleCornerFallback();
  }
  function setCornerVisible(el){
    el=el||defaultCorner;
    if(visibleCorner!==el){ if(visibleCorner) visibleCorner.classList.remove("is-visible");
      if(el) el.classList.add("is-visible"); visibleCorner=el; scheduleCornerFallback(); }
  }
  function fileKeyFrom(img){
    try{ var src=img&&img.src?img.src:""; var parts=src.split("?")[0].split("#")[0].split("/"); var file=parts[parts.length-1]||"";
      try{ file=decodeURIComponent(file);}catch(e){} return file.toLowerCase(); } catch(e){ return ""; }
  }
  function updateCaptionFor(img){
    var key=fileKeyFrom(img); var sel=CSS.escape?CSS.escape(key):key.replace(/["\\]/g,"\\$&");
    var el=document.querySelector('.corner-text[data-caption-for="'+sel+'"]'); setCornerVisible(el||defaultCorner);
  }
  function endPointer(ev){
    if (ev && typeof ev.pointerId==="number" && canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
    currentImg=null; lastX=lastY=null; inputActive=false;
  }

  function dist(dx,dy){ return Math.sqrt(dx*dx + dy*dy); }
  var inputActive=false;

  /* Mark interaction and trigger color change */
  function markInteraction(){
    if (!hasInteracted){
      hasInteracted = true;
      if(topnav) topnav.classList.add('interacted');
      document.body.classList.add('interacted');
    }
  }

  function startAt(clientX,clientY,maybePointerId){
    inputActive=true;
    markInteraction(); // Trigger color change on first interaction
    if (canvas.setPointerCapture && typeof maybePointerId==="number") { try{ canvas.setPointerCapture(maybePointerId);}catch(e){} }
    currentImg=pick();
    stampSize = computeStampSize();   // mobile-friendly (bigger) size
    angle=0;
    baseStep=Math.max(6,0.4*stampSize); minStep=Math.max(3,baseStep/19); stepAccum=0;
    lastX=clientX; lastY=clientY;
    if(currentImg){ updateCaptionFor(currentImg); drawStamp(currentImg,lastX,lastY,stampSize,angle); }
    var HINT=document.getElementById("onboardingHint"); if (HINT){ if(HINT.remove) HINT.remove(); else if(HINT.parentNode) HINT.parentNode.removeChild(HINT); }
  }

  function moveAt(clientX,clientY){
    if(!inputActive) return; if(!currentImg) currentImg=pick(); if(!currentImg) return;
    updateCaptionFor(currentImg);
    var x=clientX,y=clientY, dx=x-lastX, dy=y-lastY, d=dist(dx,dy); if(d===0) return;
    var nx=dx/d, ny=dy/d, s=stepAccum+d;
    if(s>=minStep){
      var first=minStep-stepAccum, px=lastX+nx*first, py=lastY+ny*first, count=Math.floor(s/minStep);
      for(var k=0;k<count;k++){ drawStamp(currentImg,px,py,stampSize,angle); px+=nx*minStep; py+=ny*minStep; }
      stepAccum=s-count*minStep;
    } else { stepAccum=s; }
    lastX=x; lastY=y;
  }

  /* RAF-based move throttle — one paint per frame max */
  var pendingMoveX=0, pendingMoveY=0, moveRaf=null;
  function flushMove(){ moveRaf=null; moveAt(pendingMoveX, pendingMoveY); }

  /* Input (with guard so clicks on topnav don't stamp) */
  var hasPointer="onpointerdown" in window;

  // include mobile menu/button as UI
  function isInTopnav(target){
    try{ return !!(target && target.closest && target.closest('#topnav, #mobileMenu, #mobileMenuBtn')); } catch(e){ return false; }
  }

  if (hasPointer){
    canvas.addEventListener("pointerdown", function(ev){
      if (typeof ev.button==="number" && ev.button!==0) return;
      if (isInTopnav(ev.target)) return;
      startAt(ev.clientX, ev.clientY, ev.pointerId);
    });
    canvas.addEventListener("pointermove", function(ev){ if(inputActive){ pendingMoveX=ev.clientX; pendingMoveY=ev.clientY; if(!moveRaf){ moveRaf=raf(flushMove); } } });
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("lostpointercapture", endPointer);
  } else {
    canvas.addEventListener("mousedown", function(ev){
      if (typeof ev.button==="number" && ev.button!==0) return;
      if (isInTopnav(ev.target)) return;
      startAt(ev.clientX, ev.clientY); ev.preventDefault();
    });
    document.addEventListener("mousemove", function(ev){ if(inputActive){ pendingMoveX=ev.clientX; pendingMoveY=ev.clientY; if(!moveRaf){ moveRaf=raf(flushMove); } } });
    document.addEventListener("mouseup", function(){ if(inputActive) endPointer(); });

    canvas.addEventListener("touchstart", function(ev){
      if(!ev.touches||!ev.touches.length) return; var t=ev.touches[0]; startAt(t.clientX, t.clientY); ev.preventDefault();
    }, {passive:false});
    canvas.addEventListener("touchmove", function(ev){
      if(!ev.touches||!ev.touches.length) return; var t=ev.touches[0]; pendingMoveX=t.clientX; pendingMoveY=t.clientY; if(!moveRaf){ moveRaf=raf(flushMove); } ev.preventDefault();
    }, {passive:false});
    canvas.addEventListener("touchend", function(){ endPointer(); }, {passive:false});
    canvas.addEventListener("touchcancel", function(){ endPointer(); }, {passive:false});
  }

  /* ESC: close sheet first, else clear canvas */
  document.addEventListener("keydown", function(ev){
    if (ev.key==="Escape"){
      if (closeMobileMenuIfOpen()) return;
      if (!closeTopmostSheet()){
        var dpr=Math.max(1, window.devicePixelRatio||1);
        try{ ctx.setTransform(1,0,0,1,0,0);}catch(e){}
        ctx.clearRect(0,0,canvas.width,canvas.height);
        try{ ctx.scale(dpr,dpr);}catch(e){}
        setCornerVisible(defaultCorner);
        document.documentElement.style.removeProperty("--corner-fg");
      }
    }
  });

  document.addEventListener("dragstart", function(ev){ ev.preventDefault(); });

  /* caption contrast fallback */
  var needsBlendFallback=true;
  try{ if (window.CSS && CSS.supports && CSS.supports("mix-blend-mode","difference")) needsBlendFallback=false; }catch(e){}
  var cornerTimer=null, lastCornerAt=0;
  function scheduleCornerFallback(){
    if(!needsBlendFallback||!visibleCorner) return;
    var now=Date.now(); if(now-lastCornerAt<120) return; lastCornerAt=now;
    if(cornerTimer){ caf(cornerTimer); cornerTimer=null; }
    cornerTimer=raf(updateCornerFallback);
  }
  function updateCornerFallback(){
    if(!needsBlendFallback||!visibleCorner) return;
    try{
      var r=visibleCorner.getBoundingClientRect();
      var dpr=Math.max(1,window.devicePixelRatio||1);
      var sx=Math.max(0,Math.floor(r.left*dpr)), sy=Math.max(0,Math.floor(r.top*dpr));
      var ex=Math.min(canvas.width,Math.ceil(r.right*dpr)), ey=Math.min(canvas.height,Math.ceil(r.bottom*dpr));
      var w=Math.max(1,ex-sx), h=Math.max(1,ey-sy); if(w<=0||h<=0) return;
      var data=ctx.getImageData(sx,sy,w,h).data; var R=0,G=0,B=0, px=data.length/4;
      for(var i=0;i<data.length;i+=4){ R+=data[i]; G+=data[i+1]; B+=data[i+2]; }
      R/=px; G/=px; B/=px; var luminance=(R/255)*0.3126+(G/255)*0.5152+(B/255)*0.6722;
      var fg=luminance>0.1 ? "#000000" : "#ffffff";
      document.documentElement.style.setProperty("--corner-fg", fg);
    }catch(e){ needsBlendFallback=false; }
  }
  if (needsBlendFallback) scheduleCornerFallback();

  /* hint */
  function bootHint(){
    var HINT=document.getElementById("onboardingHint"); if(!HINT) return;
    raf(function(){ HINT.classList.add("is-visible"); });
    var removed=false;
    function remove(){ if(removed) return; removed=true; if(HINT.remove) HINT.remove(); else if(HINT.parentNode) HINT.parentNode.removeChild(HINT); }
    HINT.addEventListener("animationend", remove, {once:true}); setTimeout(remove, 9900);
  }
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", bootHint, {once:true}); else bootHint();

  /* ===== Sheets open/close ===== */
  function qs(sel,root){ return (root||document).querySelector(sel); }
  function qsa(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  // NEW: util to pause/reset videos inside a sheet
  function stopVideosInside(sheetEl, reset) {
    if (!sheetEl) return;
    var vids = sheetEl.querySelectorAll('video');
    vids.forEach(function(v){
      try { v.pause(); } catch(e){}
      if (reset) { try { v.currentTime = 0; } catch(e){} } // remove if you only want pause
    });
  }

  function openSheet(id){
    var el=document.getElementById(id); if(!el) return;

    // NEW: close other open sheets first (and stop their videos)
    qsa('.sheet.is-open').forEach(function(openEl){
      if (openEl !== el) {
        openEl.classList.remove('is-open');
        openEl.setAttribute('aria-hidden','true');
        stopVideosInside(openEl, true); // pause + reset others
        openEl.style.removeProperty('--drag-ty');
      }
    });

    el.classList.add("is-open"); el.setAttribute("aria-hidden","false");
    el.style.setProperty('--drag-ty','0px'); /* open at top */
    var h=qs("h2", el); if(h) setTimeout(function(){ try{ h.focus({preventScroll:true}); }catch(e){} }, 480);
  }

  function closeSheet(el){
    if(!el) return;
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden","true");
    el.style.removeProperty('--drag-ty');

    // NEW: stop (pause + reset) any video inside the sheet we just closed
    stopVideosInside(el, true);
  }

  function closeTopmostSheet(){
    var open=qsa(".sheet.is-open"); if(!open.length) return false;
    closeSheet(open[open.length-1]); return true;
  }

  /* open via topnav/mobile menu */
  qsa('[data-open-panel]').forEach(function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      var id=a.getAttribute('data-open-panel'); if(id) openSheet(id);
      closeMobileMenuIfOpen(); // close menu after selection
    });
  });

  /* close via ✕ button */
  qsa('[data-close-panel]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      var host = btn.closest('.sheet');
      if (host){
        closeSheet(host);
      }
    });
  });

  /* ======= Drag-to-resize for sheets (header drag) ======= */
  (function enableSheetDrag(){
    var DRAG_MIN = 0;
    var DRAG_MAX_VH = 70;
    function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

    function isInteractive(target){
      if (!target) return false;
      return !!target.closest('.sheet__close, [data-close-panel], a, button, input, select, textarea, label');
    }

    function setup(el){
      var header = el.querySelector('.sheet__header'); if(!header) return;
      var startY, startTy = 0, dragging=false;

      function getPixelsFromVar(){
        var v = getComputedStyle(el).getPropertyValue('--drag-ty').trim();
        return v.endsWith('px') ? parseFloat(v) : 0;
      }

      function onDown(ev){
        if (isInteractive(ev.target)) return;
        dragging = true;
        startY = ('touches' in ev && ev.touches[0]) ? ev.touches[0].clientY : ev.clientY;
        startTy = getPixelsFromVar();
        header.setPointerCapture && ev.pointerId && header.setPointerCapture(ev.pointerId);
        ev.preventDefault && ev.preventDefault();
      }
      function onMove(ev){
        if(!dragging) return;
        var y = ('touches' in ev && ev.touches[0]) ? ev.touches[0].clientY : ev.clientY;
        var dy = y - startY;
        var maxPx = (window.innerHeight * DRAG_MAX_VH)/100;
        var ty = clamp(startTy + dy, DRAG_MIN, maxPx);
        el.style.setProperty('--drag-ty', ty + 'px');
      }
      function onUp(){
        if(!dragging) return;
        dragging = false;
        var maxPx = (window.innerHeight * DRAG_MAX_VH)/100;
        var ty = getPixelsFromVar();
        if (ty > maxPx*0.55){
          closeSheet(el);
        }
      }

      var hasPointer = 'onpointerdown' in window;
      if(hasPointer){
        header.addEventListener('pointerdown', onDown);
        header.addEventListener('pointermove', onMove);
        header.addEventListener('pointerup', onUp);
        header.addEventListener('pointercancel', onUp);
        header.addEventListener('lostpointercapture', onUp);
      } else {
        header.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        header.addEventListener('touchstart', onDown, {passive:false});
        header.addEventListener('touchmove', onMove, {passive:false});
        header.addEventListener('touchend', onUp, {passive:false});
        header.addEventListener('touchcancel', onUp, {passive:false});
      }
    }

    Array.prototype.forEach.call(document.querySelectorAll('.sheet'), setup);
    window.addEventListener('resize', function(){
      document.querySelectorAll('.sheet.is-open').forEach(function(el){
        var maxPx = (window.innerHeight * DRAG_MAX_VH)/100;
        var v = parseFloat(getComputedStyle(el).getPropertyValue('--drag-ty'))||0;
        el.style.setProperty('--drag-ty', Math.min(v, maxPx)+'px');
      });
    });
  })();

  /* --- Allow camera/mic on CodePen embeds (result-only iframes) --- */
  (function allowCameraOnCodepenEmbeds(){
    function patchIframe(ifr) {
      try {
        if (!ifr || !ifr.src) return;
        if (ifr._cp_patched) return;
        if (ifr.src.includes("codepen.io") || ifr.src.includes("cdpn.io")) {
          var allow = [
            "camera",
            "microphone",
            "fullscreen",
            "geolocation",
            "autoplay",
            "clipboard-read",
            "clipboard-write"
          ].join("; ");
          ifr.setAttribute("allow", allow);
          ifr.setAttribute("allowfullscreen", "true");
          ifr.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          // remove any sandbox that might block camera (CodePen sets safe sandbox already)
          var sb = ifr.getAttribute("sandbox");
          if (sb && !/allow-same-origin/.test(sb)) {
            ifr.setAttribute("sandbox", (sb + " allow-same-origin").trim());
          }
          ifr._cp_patched = true;
        }
      } catch (e) {}
    }

    Array.prototype.forEach.call(
      document.querySelectorAll('iframe[src*="codepen.io"], iframe[src*="cdpn.io"]'),
      patchIframe
    );

    var mo = new MutationObserver(function(muts){
      muts.forEach(function(m){
        Array.prototype.forEach.call(m.addedNodes || [], function(n){
          if (n.tagName === "IFRAME") patchIframe(n);
          if (n.querySelectorAll) {
            Array.prototype.forEach.call(n.querySelectorAll("iframe"), patchIframe);
          }
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  })();

  /* ========= MOBILE MENU LOGIC ========= */
  var mobileBtn = document.getElementById('mobileMenuBtn');
  var mobileMenu = document.getElementById('mobileMenu');

  function isPhoneNow(){
    try { return window.matchMedia('(max-width: 640px)').matches; }
    catch(e){ return (window.innerWidth||0) <= 640; }
  }

  function openMobileMenu(){
    if (!mobileBtn || !mobileMenu) return;
    mobileBtn.classList.add('is-open');
    mobileMenu.classList.add('is-open');
    mobileBtn.setAttribute('aria-expanded','true');
    mobileMenu.setAttribute('aria-hidden','false');
  }
  function closeMobileMenu(){
    if (!mobileBtn || !mobileMenu) return;
    mobileBtn.classList.remove('is-open');
    mobileMenu.classList.remove('is-open');
    mobileBtn.setAttribute('aria-expanded','false');
    mobileMenu.setAttribute('aria-hidden','true');
  }
  function closeMobileMenuIfOpen(){
    if (mobileMenu && mobileMenu.classList.contains('is-open')) { closeMobileMenu(); return true; }
    return false;
  }
  function toggleMobileMenu(){
    if (!isPhoneNow()) return; // only active on phone
    if (mobileMenu.classList.contains('is-open')) closeMobileMenu(); else openMobileMenu();
  }

  if (mobileBtn){
    mobileBtn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      toggleMobileMenu();
    });
  }

  // close on outside tap
  document.addEventListener('click', function(ev){
    if (!isPhoneNow()) return;
    if (!mobileMenu || !mobileMenu.classList.contains('is-open')) return;
    var inside = ev.target.closest && ev.target.closest('#mobileMenu, #mobileMenuBtn');
    if (!inside) closeMobileMenu();
  });

  // ensure menu closes on resize to desktop
  window.addEventListener('resize', function(){
    if (!isPhoneNow()) closeMobileMenu();
  });

})();


/* ============================================================
   PROJECT CARDS MODAL FUNCTIONALITY
   Wrapped in IIFE to avoid conflicts with existing code
   ============================================================ */
(function() {
  'use strict';

  // Open modal function
  function openPfModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  // Close modal function
  function closePfModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    // Pause any videos inside the modal
    var videos = modal.querySelectorAll('video');
    videos.forEach(function(v) {
      try { v.pause(); } catch(e) {}
    });
  }

  // Initialize when DOM is ready
  function initProjectModals() {
    // Click on project cards to open modals
    var projectCards = document.querySelectorAll('.pf-project-card');
    projectCards.forEach(function(card) {
      card.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent sheet drag
        var modalId = this.getAttribute('data-modal');
        if (modalId) {
          openPfModal(modalId);
        }
      });
    });

    // Close button click
    var closeButtons = document.querySelectorAll('.pf-modal-close');
    closeButtons.forEach(function(button) {
      button.addEventListener('click', function(e) {
        e.stopPropagation();
        var modal = this.closest('.pf-modal');
        closePfModal(modal);
      });
    });

    // Click on overlay to close
    var overlays = document.querySelectorAll('.pf-modal-overlay');
    overlays.forEach(function(overlay) {
      overlay.addEventListener('click', function() {
        var modal = this.closest('.pf-modal');
        closePfModal(modal);
      });
    });

    // Press Escape to close (priority over sheet close)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var activeModal = document.querySelector('.pf-modal.active');
        if (activeModal) {
          e.stopImmediatePropagation(); // Prevent sheet ESC handler
          closePfModal(activeModal);
        }
      }
    }, true); // Use capture phase to run before other handlers
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProjectModals);
  } else {
    initProjectModals();
  }
})();

/* ============================================================
   JPO LIGHTBOX — Click-to-zoom (only for JPO images)
   ============================================================ */
(function() {
  function initJpoLightbox() {
    // Create lightbox DOM
    var lb = document.createElement('div');
    lb.className = 'jpo-lightbox';
    lb.innerHTML = '<button class="jpo-lightbox-close" aria-label="Fermer">&times;</button>'
      + '<div class="jpo-lightbox-inner"><img class="jpo-lightbox-img" src="" alt="" /></div>'
;
    document.body.appendChild(lb);

    var img = lb.querySelector('.jpo-lightbox-img');
    var closeBtn = lb.querySelector('.jpo-lightbox-close');
    var scale = 1;
    var isZoomed = false;
    var isDragging = false;
    var startX = 0, startY = 0, translateX = 0, translateY = 0, lastTx = 0, lastTy = 0;

    function openLightbox(src, alt) {
      img.src = src;
      img.alt = alt || '';
      scale = 1;
      isZoomed = false;
      translateX = 0; translateY = 0; lastTx = 0; lastTy = 0;
      img.style.transform = 'scale(1) translate(0,0)';
      img.classList.remove('zoomed');
      lb.classList.remove('zoomed-state');
      lb.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      lb.classList.remove('active');
      lb.classList.remove('zoomed-state');
      document.body.style.overflow = '';
      setTimeout(function() { img.src = ''; }, 300);
    }

    function toggleZoom(e) {
      if (isZoomed) {
        // Zoom out
        scale = 1;
        isZoomed = false;
        translateX = 0; translateY = 0; lastTx = 0; lastTy = 0;
        img.style.transform = 'scale(1) translate(0,0)';
        img.classList.remove('zoomed');
        lb.classList.remove('zoomed-state');
      } else {
        // Zoom in at click point
        scale = 1.5;
        isZoomed = true;
        // Center zoom on click position relative to image
        var rect = img.getBoundingClientRect();
        var cx = (e.clientX - rect.left) / rect.width;
        var cy = (e.clientY - rect.top) / rect.height;
        translateX = (0.5 - cx) * rect.width * (scale - 1);
        translateY = (0.5 - cy) * rect.height * (scale - 1);
        lastTx = translateX; lastTy = translateY;
        img.style.transform = 'scale(' + scale + ') translate(' + (translateX/scale) + 'px,' + (translateY/scale) + 'px)';
        img.classList.add('zoomed');
        lb.classList.add('zoomed-state');
      }
    }

    // Click on image to toggle zoom
    img.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!isDragging) toggleZoom(e);
    });

    // Drag to pan when zoomed
    img.addEventListener('mousedown', function(e) {
      if (!isZoomed) return;
      isDragging = false;
      startX = e.clientX - lastTx;
      startY = e.clientY - lastTy;
      img.style.cursor = 'grabbing';
      img.style.transition = 'none';

      function onMove(ev) {
        isDragging = true;
        translateX = ev.clientX - startX;
        translateY = ev.clientY - startY;
        img.style.transform = 'scale(' + scale + ') translate(' + (translateX/scale) + 'px,' + (translateY/scale) + 'px)';
      }
      function onUp() {
        lastTx = translateX; lastTy = translateY;
        img.style.cursor = 'grab';
        img.style.transition = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Reset drag flag after a tick so click handler can check it
        setTimeout(function() { isDragging = false; }, 10);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });

    // Touch support for mobile
    var touchStartDist = 0;
    img.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1 && isZoomed) {
        startX = e.touches[0].clientX - lastTx;
        startY = e.touches[0].clientY - lastTy;
      }
    }, {passive: true});

    img.addEventListener('touchmove', function(e) {
      if (e.touches.length === 1 && isZoomed) {
        translateX = e.touches[0].clientX - startX;
        translateY = e.touches[0].clientY - startY;
        img.style.transform = 'scale(' + scale + ') translate(' + (translateX/scale) + 'px,' + (translateY/scale) + 'px)';
        e.preventDefault();
      }
    }, {passive: false});

    img.addEventListener('touchend', function() {
      lastTx = translateX; lastTy = translateY;
    });

    // Scroll wheel zoom
    lb.addEventListener('wheel', function(e) {
      if (!lb.classList.contains('active')) return;
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.3 : 0.3;
      scale = Math.min(Math.max(scale + delta, 1), 5);
      if (scale <= 1.05) {
        scale = 1; isZoomed = false;
        translateX = 0; translateY = 0; lastTx = 0; lastTy = 0;
        img.classList.remove('zoomed');
        lb.classList.remove('zoomed-state');
      } else {
        isZoomed = true;
        img.classList.add('zoomed');
        lb.classList.add('zoomed-state');
      }
      img.style.transform = 'scale(' + scale + ') translate(' + (translateX/scale) + 'px,' + (translateY/scale) + 'px)';
    }, {passive: false});

    // Close: click background, close button, or Escape
    lb.addEventListener('click', function(e) {
      if (e.target === lb) closeLightbox();
    });
    closeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      closeLightbox();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && lb.classList.contains('active')) {
        e.stopImmediatePropagation();
        closeLightbox();
      }
    }, true);

    // Attach click to all images inside JPO modal only
    var jpoModal = document.getElementById('pf-modal-7');
    if (!jpoModal) return;
    var images = jpoModal.querySelectorAll('.pf-modal-image');
    images.forEach(function(image) {
      image.addEventListener('click', function(e) {
        e.stopPropagation();
        openLightbox(this.src, this.alt);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJpoLightbox);
  } else {
    initJpoLightbox();
  }
})();
/* ============================================================
   MODAL HYDRATION
   Iframes and images inside a .pf-modal ship as data-src and
   load when the modal opens. Same markup, same content, just
   not downloaded while the modal is closed.
   ============================================================ */
(function () {
  'use strict';

  function hydrate(modal, selector) {
    var nodes = modal.querySelectorAll(selector || 'iframe[data-src], img[data-src]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].src = nodes[i].getAttribute('data-src');
      nodes[i].removeAttribute('data-src');
    }
  }

  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].target.classList.contains('active')) hydrate(records[i].target);
    }
  });

  function warmFromCard(ev) {
    var card = ev.target.closest ? ev.target.closest('[data-modal]') : null;
    if (!card) return;
    var modal = document.getElementById(card.getAttribute('data-modal'));
    if (modal) hydrate(modal);
  }

  function start() {
    var modals = document.querySelectorAll('.pf-modal');
    for (var i = 0; i < modals.length; i++) {
      if (modals[i].classList.contains('active')) hydrate(modals[i]);
      observer.observe(modals[i], { attributes: true, attributeFilter: ['class'] });
    }
    document.addEventListener('pointerenter', warmFromCard, true);
    document.addEventListener('touchstart', warmFromCard, { capture: true, passive: true });

    if (window.matchMedia('(min-width:900px)').matches) {
      var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 2000); };
      idle(function () {
        for (var i = 0; i < modals.length; i++) hydrate(modals[i], 'iframe[data-src]');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

/* ============================================================
   VIDEO PLAYER
   Every <video> keeps its markup, its src and its poster. Only
   the native black bar is replaced. Videos are all present in
   the markup at load, so this runs once, no observer.
   ============================================================ */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var PLAY = ['M4.5 3.2 12.4 8 4.5 12.8z'];
  var PAUSE = ['M5 3h2v10H5z', 'M9 3h2v10H9z'];
  var SOUND = ['M3.2 6.2h2.1L8 4v8L5.3 9.8H3.2z', 'M10.4 6.1a2.6 2.6 0 0 1 0 3.8'];
  var MUTED = ['M3.2 6.2h2.1L8 4v8L5.3 9.8H3.2z', 'M10.6 6.4l3 3.2', 'M13.6 6.4l-3 3.2'];
  var FULL = ['M2.6 6V2.6H6', 'M10 2.6h3.4V6', 'M13.4 10v3.4H10', 'M6 13.4H2.6V10'];

  function icon(paths, filled, size) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 16 16');
    s.setAttribute('width', size || 16);
    s.setAttribute('height', size || 16);
    paths.forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      if (filled) { p.setAttribute('fill', 'currentColor'); }
      else {
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', '1.2');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
      }
      s.appendChild(p);
    });
    return s;
  }

  function button(cls, paths, label, filled, size) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('aria-label', label);
    b.appendChild(icon(paths, filled, size));
    return b;
  }

  function swap(b, paths, filled) {
    while (b.firstChild) b.removeChild(b.firstChild);
    b.appendChild(icon(paths, filled));
  }

  function clock(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function upgrade(video) {
    if (!video.parentNode || video.parentNode.classList.contains('rp')) return;

    var wrap = document.createElement('div');
    wrap.className = 'rp';
    video.parentNode.insertBefore(wrap, video);
    wrap.appendChild(video);
    video.removeAttribute('controls');
    video.setAttribute('playsinline', '');

    var big = button('rp-big', PLAY, 'Lire la video', true, 20);
    var play = button('rp-play', PLAY, 'Lire', true);
    var mute = button('rp-mute', video.muted ? MUTED : SOUND, 'Son');
    var full = button('rp-full', FULL, 'Plein ecran');

    var track = document.createElement('div');
    track.className = 'rp-track';
    var fill = document.createElement('div');
    fill.className = 'rp-fill';
    track.appendChild(fill);

    var time = document.createElement('span');
    time.className = 'rp-time';
    time.textContent = '0:00';

    var bar = document.createElement('div');
    bar.className = 'rp-bar';
    bar.appendChild(play); bar.appendChild(track); bar.appendChild(time);
    bar.appendChild(mute); bar.appendChild(full);
    wrap.appendChild(big);
    wrap.appendChild(bar);

    function toggle() { if (video.paused) { video.play(); } else { video.pause(); } }
    function toggleAndDrop(ev) { toggle(); if (ev.currentTarget.blur) ev.currentTarget.blur(); }
    big.addEventListener('click', toggleAndDrop);
    play.addEventListener('click', toggleAndDrop);
    video.addEventListener('click', toggle);

    video.addEventListener('play', function () { wrap.classList.add('is-playing'); swap(play, PAUSE, true); });
    video.addEventListener('pause', function () { wrap.classList.remove('is-playing'); swap(play, PLAY, true); });
    video.addEventListener('ended', function () { wrap.classList.remove('is-playing'); swap(play, PLAY, true); });

    video.addEventListener('timeupdate', function () {
      var d = video.duration;
      fill.style.width = (d ? (video.currentTime / d) * 100 : 0) + '%';
      time.textContent = clock(video.currentTime) + (d && isFinite(d) ? ' / ' + clock(d) : '');
    });
    video.addEventListener('loadedmetadata', function () {
      time.textContent = '0:00 / ' + clock(video.duration);
    });

    function seek(ev) {
      var r = track.getBoundingClientRect();
      var x = Math.min(Math.max(ev.clientX - r.left, 0), r.width);
      if (video.duration) video.currentTime = (x / r.width) * video.duration;
    }
    track.addEventListener('pointerdown', function (ev) {
      seek(ev);
      track.setPointerCapture(ev.pointerId);
      track.addEventListener('pointermove', seek);
    });
    track.addEventListener('pointerup', function (ev) {
      track.releasePointerCapture(ev.pointerId);
      track.removeEventListener('pointermove', seek);
    });

    mute.addEventListener('click', function () { video.muted = !video.muted; });
    video.addEventListener('volumechange', function () { swap(mute, video.muted ? MUTED : SOUND); });

    full.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (wrap.requestFullscreen) wrap.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });
  }

  function start() {
    // only the videos meant to be watched, not the tiles that play by themselves
    var vids = document.querySelectorAll('video[controls]');
    for (var i = 0; i < vids.length; i++) upgrade(vids[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

/* ============================================================
   WEB SHEET
   Six site recordings, 30 MB in total. They load and play only
   while their tile is on screen, and stop when it leaves, so
   opening the sheet costs a poster image per tile.
   ============================================================ */
(function () {
  'use strict';

  var sheet = document.getElementById('sheet-web');
  if (!sheet || !('IntersectionObserver' in window)) return;

  var watcher = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var video = entry.target;
      if (entry.isIntersecting) {
        if (video.dataset.src) {
          video.src = video.dataset.src;
          delete video.dataset.src;
        }
        var playing = video.play();
        if (playing && playing.catch) playing.catch(function () {});
      } else if (!video.paused) {
        video.pause();
      }
    });
  }, { root: sheet, rootMargin: '50px 0px', threshold: 0.2 });

  var videos = sheet.querySelectorAll('video');
  for (var i = 0; i < videos.length; i++) watcher.observe(videos[i]);
})();

/* ============================================================
   LEGAL BLOCK, ABOUT SHEET
   ============================================================ */
(function () {
  'use strict';
  var toggle = document.querySelector('.legal-toggle');
  var panel = document.getElementById('legal-panel');
  if (!toggle || !panel) return;
  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    panel.hidden = open;
    if (!open) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
})();

/* ============================================================
   LEGAL PANEL RESET
   Closing About folds the legal text back, so reopening the
   sheet lands on the bio again instead of the mentions.
   ============================================================ */
(function () {
  'use strict';
  var sheet = document.getElementById('sheet-info');
  var toggle = document.querySelector('.legal-toggle');
  var panel = document.getElementById('legal-panel');
  if (!sheet || !toggle || !panel) return;

  new MutationObserver(function () {
    if (sheet.classList.contains('is-open')) return;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    var body = sheet.querySelector('.sheet__body');
    if (body) body.scrollTop = 0;
  }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
})();

/* ============================================================
   LEGAL PANEL, CLOSE FROM THE BOTTOM
   ============================================================ */
(function () {
  'use strict';
  var close = document.querySelector('.legal-close');
  var toggle = document.querySelector('.legal-toggle');
  var panel = document.getElementById('legal-panel');
  var sheet = document.getElementById('sheet-info');
  if (!close || !toggle || !panel || !sheet) return;
  close.addEventListener('click', function () {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    var body = sheet.querySelector('.sheet__body');
    if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
    toggle.focus({ preventScroll: true });
  });
})();
