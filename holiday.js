/* Solo2Squad holiday layer: travel scene, stamp, trip-type chips, member stepper.
   Purely visual. It never changes ids or values the app code reads. */
(function () {
  var I = "#12213a",
    S = 'stroke="' + I + '" stroke-width="2" stroke-linejoin="round"';
  function wheel(x, y, r) {
    return '<g class="wh"><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + I + '"/><path d="M' + (x - r + 2) + " " + y + "h" + (2 * r - 4) + '" stroke="#fff" stroke-width="2"/></g>';
  }
  function win(x, y, w, h) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="#c4e9f7" stroke="' + I + '" stroke-width="1.5"/>';
  }
  var V = {
    ship:
      '<svg viewBox="0 0 130 64" aria-hidden="true"><path d="M44 18V6l12 4-12 4" fill="#14a3a0" ' + S + '/><rect x="62" y="6" width="14" height="14" fill="#ffc93c" ' + S + '/><rect x="40" y="18" width="52" height="14" rx="3" fill="#fff" ' + S + '/><rect x="22" y="30" width="88" height="14" rx="3" fill="#fff" ' + S + "/>" +
      [34, 47, 60, 73, 86, 99].map(function (x) { return '<circle cx="' + x + '" cy="37" r="2.6" fill="#14a3a0" stroke="' + I + '" stroke-width="1.2"/>'; }).join("") +
      '<path d="M6 44h118l-16 16H24z" fill="#ff6b3d" ' + S + "/></svg>",
    train:
      '<svg viewBox="0 0 230 52" aria-hidden="true"><rect x="4" y="8" width="66" height="30" rx="6" fill="#ff6b3d" ' + S + '/><rect x="76" y="8" width="66" height="30" rx="6" fill="#ffc93c" ' + S + '/><rect x="70" y="26" width="6" height="4" fill="' + I + '"/><rect x="142" y="26" width="8" height="4" fill="' + I + '"/>' +
      [0, 1, 2, 3].map(function (i) { return win(12 + i * 15, 15, 10, 11) + win(84 + i * 15, 15, 10, 11); }).join("") +
      '<rect x="150" y="14" width="74" height="24" rx="5" fill="#14a3a0" ' + S + '/><rect x="152" y="4" width="34" height="14" rx="3" fill="#14a3a0" ' + S + '/><rect x="204" y="4" width="12" height="12" fill="' + I + '"/>' + win(158, 8, 20, 6) +
      '<circle class="puff" cx="210" cy="2" r="5" fill="#fff"/><circle class="puff" style="animation-delay:-1s" cx="210" cy="2" r="5" fill="#fff"/>' +
      [20, 54, 92, 126, 166, 196, 214].map(function (x) { return wheel(x, 42, 6); }).join("") + "</svg>",
    bus:
      '<svg viewBox="0 0 120 56" aria-hidden="true"><rect x="4" y="6" width="108" height="36" rx="8" fill="#ffc93c" ' + S + '/><rect x="4" y="30" width="108" height="5" fill="#ff6b3d"/>' +
      [0, 1, 2, 3].map(function (i) { return win(14 + i * 18, 12, 13, 12); }).join("") + win(88, 12, 18, 18) + '<rect x="108" y="30" width="7" height="5" rx="2" fill="#fff" ' + S + "/>" + wheel(28, 44, 8) + wheel(90, 44, 8) + "</svg>"
  };

  function scene(lanes, before) {
    var el = document.createElement("div");
    el.className = "scene";
    el.setAttribute("aria-hidden", "true");
    var out = '<svg class="hills" viewBox="0 0 1200 56" preserveAspectRatio="none"><path d="M0 56V30Q90 4 210 28T420 24 640 34 860 10 1060 30 1200 20V56z" fill="#a9ddb9" stroke="' + I + '" stroke-width="3"/></svg>';
    lanes.forEach(function (l) {
      var v = { sea: ["ship", "-18s", "60%"], rail: ["train", "-5s", "40%"], road: ["bus", "-9s", "70%"] }[l];
      out += '<div class="lane ' + l + '"><div class="veh ' + v[0] + '" style="--o:' + v[1] + ";--s:" + v[2] + '"><div class="bob">' + V[v[0]] + "</div></div></div>";
    });
    el.innerHTML = out;
    if (before && before.parentNode) before.parentNode.insertBefore(el, before);
    else document.body.appendChild(el);
  }

  var form = document.querySelector(".form-container"),
    cta = document.querySelector(".cta2"),
    foot = document.querySelector(".tm-ecosystem-footer");
  if (form) {
    document.body.classList.add("formpage");
    scene(["rail", "road"], foot);
  } else if (cta) scene(["sea", "rail", "road"], cta);

  var photo = document.querySelector(".hx .photo");
  if (photo)
    photo.insertAdjacentHTML("beforeend", '<svg class="hd-stamp" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="57" fill="#ff6b3d" stroke="#12213a" stroke-width="3"/><path id="hdsp" d="M60 60m-41 0a41 41 0 1 1 82 0a41 41 0 1 1-82 0" fill="none"/><text font-size="13" font-weight="700" fill="#12213a" letter-spacing="1.5" font-family="DM Sans,sans-serif"><textPath href="#hdsp">Happy trails · Safe travels · Happy trails ·</textPath></text><path d="M60 44l4.5 11.5L76 60l-11.5 4.5L60 76l-4.5-11.5L44 60l11.5-4.5z" fill="#12213a"/></svg>');

  /* Trip type chips: mirror the real <select id="tripType"> */
  var sel = document.getElementById("tripType");
  if (sel) {
    var P = {
      Adventure: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
      Beach: '<circle cx="12" cy="8" r="3"/><path d="M3 17q3-3 6 0t6 0 6 0M3 21q3-3 6 0t6 0 6 0"/>',
      "Road Trip": '<path d="M4 15v-3l2.2-5h11.6L20 12v3zM4 15v3M20 15v3"/><circle cx="8" cy="15" r="1.4"/><circle cx="16" cy="15" r="1.4"/>',
      Trekking: '<path d="M2 20l7-12 4 7 3-4 6 9z"/>',
      Cultural: '<path d="M3 20h18M5 20V10M19 20V10M3 10l9-6 9 6M9 20v-5a3 3 0 0 1 6 0v5"/>',
      Relaxation: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>'
    };
    var box = document.createElement("div");
    box.className = "chips";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Travel type");
    Array.prototype.forEach.call(sel.options, function (o) {
      if (!o.value) return;
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.dataset.v = o.value;
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (P[o.value] || "") + "</svg>" + o.value;
      box.appendChild(b);
    });
    function paint() {
      Array.prototype.forEach.call(box.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === sel.value)); });
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      sel.value = b.dataset.v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      paint();
    });
    sel.classList.add("hd-hide");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
    sel.parentNode.appendChild(box);
    paint();
  }

  /* Member count stepper around <input id="members"> */
  var mem = document.getElementById("members");
  if (mem) {
    var wrap = document.createElement("div");
    wrap.className = "stepper";
    function btn(sym, dir, label) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = sym;
      b.setAttribute("aria-label", label);
      b.onclick = function () {
        var min = +mem.min || 2, max = +mem.max || 20, v = (parseInt(mem.value, 10) || 0) + dir;
        mem.value = Math.max(min, Math.min(max, v));
        mem.dispatchEvent(new Event("input", { bubbles: true }));
      };
      return b;
    }
    mem.parentNode.insertBefore(wrap, mem);
    wrap.append(btn("\u2212", -1, "One fewer traveler"), mem, btn("+", 1, "One more traveler"));
  }
})();
