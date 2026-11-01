/* Carbon copies: pin the pad, tear each copy off with the scroll to reveal the next one */
(() => {
  const scenes = document.querySelectorAll('[data-carbon]');
  if (!scenes.length || !window.gsap || !window.ScrollTrigger) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || innerHeight < 600) return;
  gsap.registerPlugin(ScrollTrigger);

  // build each scene only when it comes near the viewport, so GSAP stays off the main thread during load
  const build = (scene) => {
    let tl;
    const pin = scene.querySelector('[data-carbon-pin]');
    const copies = [...scene.querySelectorAll('[data-copy]')];
    if (copies.length < 2) return;
    scene.classList.add('is-live');

    const header = document.querySelector('.slip-head');
    const top = () => (header ? header.offsetHeight : 0);
    tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: pin,
        start: () => `top top+=${top()}`,
        end: () => `+=${(copies.length - 1) * innerHeight * 0.85}`,
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });

    copies.forEach((copy, i) => {
      if (i === copies.length - 1) return;
      const next = copies[i + 1];
      const at = i;
      // the copy is lifted at its bottom-left corner and torn up off the pad
      tl.to(copy, { rotation: -2.5, y: -18, duration: 0.25, ease: 'power1.out' }, at)
        .to(copy, { yPercent: -118, xPercent: -5, rotation: -8, duration: 0.75, ease: 'power2.in' }, at + 0.25)
        // the copy beneath settles into the top position
        .fromTo(next, { x: 10, y: 10 }, { x: 0, y: 0, duration: 0.6, ease: 'power2.out' }, at + 0.4)
        .fromTo(next.querySelectorAll('.print-photo'), { y: 24, opacity: 0.4 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.5, ease: 'power2.out' }, at + 0.5)
        .fromTo(next.querySelector('.copy__stamp') || {}, { scale: 1.8, rotation: -14, opacity: 0 }, { scale: 1, rotation: -5, opacity: 1, duration: 0.25, ease: 'back.out(2)' }, at + 0.8);
    });

    // a keyboard user tabbing into a copy beneath gets it brought to the top of the pad
    copies.forEach((copy, i) => copy.addEventListener('focusin', () => {
      const st = tl.scrollTrigger;
      if (st) window.scrollTo(0, st.start + ((st.end - st.start) * i) / (copies.length - 1));
    }));
  };
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    build(e.target);
  }), { rootMargin: '100% 0px' });
  scenes.forEach((s) => io.observe(s));
})();
