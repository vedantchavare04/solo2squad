(() => {
  const home = "https://homepage-indol-psi.vercel.app/";
  const bar = document.createElement("div");
  bar.className = "tm-ecosystem";
  bar.setAttribute("role", "navigation");
  bar.setAttribute("aria-label", "TourMate ecosystem");
  bar.innerHTML = `<div class="tm-ecosystem__identity"><span class="tm-ecosystem__mark" aria-hidden="true">T</span><a class="tm-ecosystem__wordmark" href="${home}">TourMate</a><span class="tm-ecosystem__divider" aria-hidden="true">/</span><span class="tm-ecosystem__product">Solo2Squad</span><span class="tm-ecosystem__note">Part of the TourMate travel toolkit</span></div><a class="tm-ecosystem__home" href="${home}" aria-label="Return to TourMate home"><span aria-hidden="true">←</span> TourMate Home</a>`;
  document.body.insertBefore(bar, document.body.firstChild);

  const footer = document.createElement("div");
  footer.className = "tm-ecosystem-footer";
  footer.innerHTML = `<span>Solo2Squad is part of the TourMate travel toolkit.</span><a href="${home}"><span class="tm-ecosystem-footer__arrow" aria-hidden="true">←</span>Back to TourMate Home</a>`;
  const projectFooter = document.querySelector("footer.ft");
  if (projectFooter) {
    const base = projectFooter.querySelector(".base");
    projectFooter.insertBefore(footer, base || null);
  } else {
    document.body.append(footer);
  }
})();
