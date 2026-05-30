/* FridayOS — self-drawing F mark for boot splash & route loaders.
   Reads window.ORIGINAL_F (friday-f-paths.js). Plain JS, no build step. */
(function(){
  var NS = "http://www.w3.org/2000/svg";
  function buildDrawF(opts){
    opts = opts || {};
    var size  = opts.size  || 76,
        color = opts.color || "#3E74D9",
        width = opts.width || 2.4,
        dur   = opts.dur   || 2.1,
        ghost = opts.ghost !== false;
    var paths = window.ORIGINAL_F || [];
    var wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;width:"+size+"px;height:"+size+"px";
    if (ghost){
      var g = document.createElementNS(NS,"svg");
      g.setAttribute("viewBox","0 0 100 100");
      g.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:.16";
      paths.forEach(function(d){
        var p = document.createElementNS(NS,"path");
        p.setAttribute("d",d); p.setAttribute("fill",color); g.appendChild(p);
      });
      wrap.appendChild(g);
    }
    var svg = document.createElementNS(NS,"svg");
    svg.setAttribute("viewBox","0 0 100 100");
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    paths.forEach(function(d,i){
      var p = document.createElementNS(NS,"path");
      p.setAttribute("d",d);
      p.setAttribute("fill","none");
      p.setAttribute("stroke",color);
      p.setAttribute("stroke-width",width);
      p.setAttribute("stroke-linejoin","round");
      p.setAttribute("stroke-linecap","round");
      p.setAttribute("pathLength","1");
      p.style.strokeDasharray = "1";
      p.style.strokeDashoffset = "1";
      p.style.animation = "fos-draw "+dur+"s "+(i*0.16)+"s ease-in-out infinite alternate";
      svg.appendChild(p);
    });
    wrap.appendChild(svg);
    return wrap;
  }
  window.fosDrawF = function(el, opts){
    if (!el) return;
    el.innerHTML = "";
    el.appendChild(buildDrawF(opts));
  };
  function mountAll(){
    var slots = document.querySelectorAll("[data-fos-draw]");
    for (var i=0;i<slots.length;i++){
      var el = slots[i];
      window.fosDrawF(el, {
        size:  parseInt(el.getAttribute("data-size")||"76",10),
        color: el.getAttribute("data-color")||"#3E74D9",
        width: parseFloat(el.getAttribute("data-w")||"2.4"),
        dur:   parseFloat(el.getAttribute("data-dur")||"2.1")
      });
    }
  }
  if (document.readyState !== "loading") mountAll();
  else document.addEventListener("DOMContentLoaded", mountAll);
})();
