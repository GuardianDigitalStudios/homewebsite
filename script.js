// The mobile menu, and nothing else.
//
// What used to be here, and deliberately is not any more:
//
//   * A scroll-reveal observer. Elements were given `opacity: 0` in CSS and
//     only this script brought them back, so if it failed to run the About and
//     Products sections stayed permanently invisible. The page rendered as a
//     hero above a footer with nothing between them. That is a bad trade for a
//     fade, and worse on a site whose job is being the SEO front door.
//
//   * A scroll listener toggling a `scrolled` class on the nav. The nav is
//     translucent and blurred at every scroll position now, so there was
//     nothing left for the class to change.
//
// Nothing here hides content. If this file fails to load the page is still
// complete, and only the mobile menu stops opening.

function toggleMenu() {
  const links = document.getElementById('navLinks');
  const burger = document.querySelector('.burger');
  const open = links.classList.toggle('open');
  burger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeMenu() {
  const links = document.getElementById('navLinks');
  const burger = document.querySelector('.burger');
  links.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
}

// Escape and click-away. Without these the only ways out of an open menu were
// the burger itself and picking a link, so a mistaken tap left it covering the
// page with no obvious dismissal.
//
// The click handler ignores anything inside <nav>: the burger's own click
// bubbles to document, and closing here would fight toggleMenu() and leave the
// menu shut on every attempt to open it.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('navLinks').classList.contains('open')) closeMenu();
});

document.addEventListener('click', (e) => {
  if (e.target.closest('nav')) return;
  if (document.getElementById('navLinks').classList.contains('open')) closeMenu();
});
