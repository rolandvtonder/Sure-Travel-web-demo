/* ==========================================================================
   Sure Penzance Travel — interactions & motion
   GSAP 3 (ScrollTrigger, SplitText) + Lenis. Everything degrades gracefully:
   no GSAP or reduced motion => content is shown immediately, features still work.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const motion = hasGSAP && !reduceMotion;

  const CONTACT = {
    whatsapp: '27650790665',
    email: 'info@penzancetravel.co.za',
  };

  const store = {
    get(key) {
      try { return sessionStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
    },
    remove(key) {
      try { sessionStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
    },
  };

  if (!motion) {
    root.classList.remove('js', 'show-preloader', 'is-arriving');
  } else {
    gsap.registerPlugin(ScrollTrigger);
    if (window.SplitText) gsap.registerPlugin(SplitText);
  }

  let lenis = null;

  /* ---------- Small utilities ---------- */
  const pad = (n) => String(n).padStart(2, '0');

  const onFontsReady = (cb) => {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      try { cb(); } catch (err) { console.error('[spt] init failed', err && err.stack); root.classList.remove('js'); }
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
    setTimeout(run, 1500);
  };

  /* ---------- Footer year ---------- */
  function initYear() {
    const year = new Date().getFullYear();
    $$('[data-year]').forEach((el) => { el.textContent = year; });
    // "57 years" stays correct next year too
    $$('[data-years-since]').forEach((el) => {
      const years = year - Number(el.dataset.yearsSince);
      el.textContent = years;
      if (el.hasAttribute('data-count')) el.dataset.count = String(years);
    });
  }

  /* ---------- Smooth scroll ---------- */
  function initLenis() {
    if (!motion || typeof window.Lenis === 'undefined') return null;
    const instance = new Lenis({
      lerp: 0.1,
      anchors: { offset: -90 },
      autoRaf: false,
    });
    instance.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => instance.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    return instance;
  }

  /* ---------- Header: glass on scroll, hide on scroll down ---------- */
  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const menuOpen = document.body.classList.contains('menu-open');
      header.classList.toggle('is-scrolled', y > 24);
      if (!menuOpen) {
        if (y > 520 && y > lastY + 6) header.classList.add('is-hidden');
        else if (y < lastY - 6 || y <= 520) header.classList.remove('is-hidden');
      }
      document.body.classList.toggle('header-visible', !header.classList.contains('is-hidden'));
      lastY = y;
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });

    // Keyboard users must always see where focus is
    header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
    update();
  }

  /* ---------- Mobile menu ---------- */
  function initMobileMenu() {
    const toggle = $('.menu-toggle');
    const menu = $('#mobile-menu');
    if (!toggle || !menu) return;
    const label = $('.sr-only', toggle);
    const isOpen = () => menu.classList.contains('is-open');

    const open = () => {
      menu.classList.add('is-open');
      menu.removeAttribute('inert');
      toggle.setAttribute('aria-expanded', 'true');
      if (label) label.textContent = 'Close menu';
      document.body.classList.add('menu-open');
      if (lenis) lenis.stop();
      else document.body.style.overflow = 'hidden';
      setTimeout(() => { const first = $('a', menu); if (first) first.focus(); }, 400);
    };

    const close = (returnFocus = true) => {
      if (!isOpen()) return;
      menu.classList.remove('is-open');
      menu.setAttribute('inert', '');
      toggle.setAttribute('aria-expanded', 'false');
      if (label) label.textContent = 'Open menu';
      document.body.classList.remove('menu-open');
      if (lenis) lenis.start();
      else document.body.style.overflow = '';
      if (returnFocus) toggle.focus();
    };

    toggle.addEventListener('click', () => (isOpen() ? close() : open()));

    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'Tab') {
        const items = [toggle, ...$$('a[href], button', menu)];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    $$('a', menu).forEach((a) => a.addEventListener('click', () => close(false)));
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) close(false); });
  }

  /* ---------- Home hero slideshow ---------- */
  function initHeroSlider() {
    const hero = $('[data-hero]');
    if (!hero) return;
    const slides = $$('.hero__slide', hero);
    const dots = $$('.hero__dot', hero);
    const caption = $('[data-hero-caption]', hero);
    const count = $('[data-hero-count]', hero);
    const pauseBtn = $('[data-hero-pause]', hero);
    if (slides.length < 2) return;

    const DURATION = 7000;
    let index = 0;
    let paused = reduceMotion;
    let startedAt = performance.now();
    let lastFrame = startedAt;
    let inView = true;

    const ensureImage = (i) => {
      const slide = slides[i];
      if (!slide || $('img', slide)) return;
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.sizes = '100vw';
      img.srcset = slide.dataset.srcset;
      img.src = slide.dataset.src;
      slide.appendChild(img);
    };

    const setPaused = (value) => {
      paused = value;
      if (pauseBtn) {
        pauseBtn.setAttribute('aria-pressed', String(value));
        pauseBtn.setAttribute('aria-label', value ? 'Play slideshow' : 'Pause slideshow');
        const use = $('use', pauseBtn);
        if (use) use.setAttribute('href', value ? '#i-play-fill' : '#i-pause-fill');
      }
    };

    const go = (next) => {
      slides[index].classList.remove('is-active');
      index = (next + slides.length) % slides.length;
      ensureImage(index);
      ensureImage((index + 1) % slides.length);
      slides[index].classList.add('is-active');
      if (caption) caption.textContent = slides[index].dataset.caption || '';
      if (count) count.textContent = `${pad(index + 1)} / ${pad(slides.length)}`;
      dots.forEach((dot, i) => {
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
        const bar = $('span', dot);
        if (bar) bar.style.transform = `scaleX(${i < index ? 1 : 0})`;
      });
      startedAt = performance.now();
    };

    dots.forEach((dot, i) => dot.addEventListener('click', () => go(i)));
    if (pauseBtn) pauseBtn.addEventListener('click', () => setPaused(!paused));

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
      }).observe(hero);
    }

    const tick = (now) => {
      const delta = now - lastFrame;
      lastFrame = now;
      // Hold progress while paused, off-screen or after the tab was in the background
      if (paused || !inView || delta > 250) {
        startedAt += delta;
      } else {
        const progress = Math.min(1, (now - startedAt) / DURATION);
        const bar = dots[index] && $('span', dots[index]);
        if (bar) bar.style.transform = `scaleX(${progress})`;
        if (progress >= 1) go(index + 1);
      }
      requestAnimationFrame(tick);
    };

    // Preload the second slide once the page has settled
    window.addEventListener('load', () => ensureImage(1));
    setPaused(reduceMotion);
    requestAnimationFrame(tick);
  }

  /* ---------- Intro: preloader / page curtain / hero ---------- */
  function heroIntro() {
    const tl = gsap.timeline();
    const title = $('[data-hero-title]');
    if (title && window.SplitText) {
      const split = SplitText.create(title, {
        type: 'lines,words,chars',
        mask: 'lines',
        charsClass: 'char',
        ignore: '.serif-accent',
      });
      gsap.set(title, { visibility: 'visible' });
      const pieces = $$('.char, .serif-accent', title);
      tl.from(pieces, {
        yPercent: 115,
        rotate: 4,
        duration: 1.3,
        ease: 'expo.out',
        stagger: 0.03,
      }, 0);
      tl.eventCallback('onComplete', () => split.revert());
    } else if (title) {
      gsap.set(title, { visibility: 'visible' });
    }
    const introBits = $$('[data-hero-intro]');
    if (introBits.length) {
      gsap.set(introBits, { opacity: 1 });
      tl.from(introBits, { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, 0.35);
    }
    return tl;
  }

  function runIntro() {
    const preloader = $('.preloader');
    const curtain = $('.curtain');
    const showPreloader = root.classList.contains('show-preloader') && preloader;
    const arriving = root.classList.contains('is-arriving') && curtain;
    const master = gsap.timeline();

    if (showPreloader) {
      const bar = $('.preloader__bar span', preloader);
      const mark = $('.preloader__mark', preloader);
      master
        .from(mark, { scale: 0.6, rotate: -30, opacity: 0, duration: 0.9, ease: 'expo.out' })
        .to(bar, { scaleX: 1, duration: 0.9, ease: 'power2.inOut' }, 0.1)
        .to(preloader, { yPercent: -100, duration: 0.95, ease: 'expo.inOut' }, '+=0.1')
        .add(() => {
          root.classList.remove('show-preloader');
          gsap.set(preloader, { clearProps: 'all' });
        });
      store.set('spt-visited', '1');
    } else if (arriving) {
      gsap.set(curtain, { yPercent: 0 });
      root.classList.remove('is-arriving');
      master.to(curtain, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' });
    }
    store.remove('spt-transition');

    master.add(heroIntro(), showPreloader || arriving ? '-=0.45' : 0);
    master.add(() => ScrollTrigger.refresh());
  }

  /* ---------- Page transitions ---------- */
  function initPageTransitions() {
    const curtain = $('.curtain');
    if (!curtain) return;

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return;

      const url = new URL(link.href, window.location.href);
      if (url.protocol !== window.location.protocol || url.host !== window.location.host) return;
      const samePage = url.pathname === window.location.pathname;
      if (samePage && (url.hash || url.search === window.location.search)) return;
      if (!/(\.html?|\/)$/.test(url.pathname)) return;

      e.preventDefault();
      store.set('spt-transition', '1');
      if (lenis) lenis.stop();
      gsap.timeline({ onComplete: () => { window.location.href = url.href; } })
        .set(curtain, { yPercent: 100 })
        .to(curtain, { yPercent: 0, duration: 0.75, ease: 'expo.inOut' });
    });

    // Returning via back/forward cache: make sure the curtain is out of the way
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        gsap.set(curtain, { yPercent: 100 });
        root.classList.remove('is-arriving');
        if (lenis) lenis.start();
      }
    });
  }

  /* ---------- Scroll reveals ---------- */
  function initSplitHeadings() {
    if (!window.SplitText) {
      $$('[data-split]').forEach((el) => gsap.set(el, { visibility: 'visible' }));
      return;
    }
    $$('[data-split]').forEach((el) => {
      const mode = el.dataset.split || 'words';
      const split = SplitText.create(el, {
        type: mode === 'chars' ? 'lines,words,chars' : 'lines,words',
        mask: 'lines',
        wordsClass: 'word',
        charsClass: 'char',
        ignore: '.serif-accent',
      });
      gsap.set(el, { visibility: 'visible' });
      const pieces = $$(mode === 'chars' ? '.char, .serif-accent' : '.word, .serif-accent', el);
      gsap.from(pieces, {
        yPercent: 115,
        duration: 1.15,
        ease: 'expo.out',
        stagger: mode === 'chars' ? 0.018 : 0.045,
        scrollTrigger: { trigger: el, start: 'top 88%' },
        // Restore the original markup so headings re-wrap naturally on resize
        onComplete: () => split.revert(),
      });
    });
  }

  function initReveals() {
    $$('[data-reveal]').forEach((el) => {
      const type = el.dataset.reveal;
      if (type === 'clip') {
        const img = $('img', el);
        gsap.set(el, { opacity: 1 });
        const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 85%' } });
        tl.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.inOut' });
        if (img && !img.closest('[data-parallax]')) tl.from(img, { scale: 1.3, duration: 1.8, ease: 'expo.out' }, 0);
        return;
      }
      gsap.fromTo(el, { opacity: 0, y: 40 }, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: 'expo.out',
        delay: parseFloat(el.dataset.delay || 0),
        scrollTrigger: { trigger: el, start: 'top 90%' },
      });
    });

    $$('[data-stagger]').forEach((group) => {
      const items = Array.from(group.children);
      gsap.fromTo(items, { opacity: 0, y: 50 }, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.09,
        scrollTrigger: { trigger: group, start: 'top 85%' },
      });
    });

    $$('[data-parallax]').forEach((wrap) => {
      const img = $('img', wrap) || wrap;
      const amount = parseFloat(wrap.dataset.parallax || 10);
      gsap.fromTo(img, { yPercent: -amount }, {
        yPercent: amount,
        ease: 'none',
        scrollTrigger: { trigger: wrap.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // Hero image drifts and fades as you scroll away
    const heroMedia = $('.hero__media, .page-hero__media');
    if (heroMedia) {
      gsap.to(heroMedia, {
        yPercent: 18,
        ease: 'none',
        scrollTrigger: { trigger: heroMedia.parentElement, start: 'top top', end: 'bottom top', scrub: true },
      });
    }
  }

  function initScrubWords() {
    $$('[data-scrub-words]').forEach((el) => {
      if (!window.SplitText) return;
      const split = SplitText.create(el, { type: 'words', wordsClass: 'word' });
      gsap.fromTo(split.words, { opacity: 0.16 }, {
        opacity: 1,
        ease: 'none',
        stagger: 0.1,
        scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true },
      });
    });
  }

  function initCounters() {
    $$('[data-count]').forEach((el) => {
      const target = parseFloat(el.dataset.count);
      const decimals = (el.dataset.count.split('.')[1] || '').length;
      const obj = { value: 0 };
      el.textContent = (0).toFixed(decimals);
      gsap.to(obj, {
        value: target,
        duration: 2.2,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
        onUpdate: () => { el.textContent = obj.value.toFixed(decimals); },
      });
    });
  }

  function initMarquee() {
    $$('[data-marquee]').forEach((marquee) => {
      const track = $('.marquee__track', marquee);
      if (!track) return;
      gsap.fromTo(track, { xPercent: 0 }, {
        xPercent: -30,
        ease: 'none',
        scrollTrigger: { trigger: marquee, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      });
    });
  }

  function initHorizontalScroll() {
    const section = $('[data-hscroll]');
    const track = $('[data-hscroll-track]');
    if (!section || !track) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px)', () => {
      const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
      gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });
    });
  }

  function initSteps() {
    const list = $('[data-steps]');
    if (!list) return;
    const bars = $$('.step__bar span', list);
    gsap.to(bars, {
      scaleX: 1,
      duration: 1.2,
      ease: 'power3.inOut',
      stagger: 0.35,
      scrollTrigger: { trigger: list, start: 'top 75%' },
    });
  }

  function initMap() {
    const map = $('[data-map]');
    if (!map) return;
    const arcs = $$('.world-map__arc', map);
    const pins = $$('.world-map__dest', map);
    const labels = $$('.world-map__label', map);

    arcs.forEach((arc) => {
      const len = arc.getTotalLength();
      arc.style.strokeDasharray = `${len}`;
      arc.style.strokeDashoffset = `${len}`;
    });
    gsap.set(pins, { scale: 0, transformOrigin: '50% 50%' });
    gsap.set(labels, { opacity: 0 });

    const tl = gsap.timeline({ scrollTrigger: { trigger: map, start: 'top 75%' } });
    tl.to(arcs, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', stagger: 0.06 })
      .to(pins, { scale: 1, duration: 0.6, ease: 'back.out(3)', stagger: 0.02 }, 0.4)
      .to(labels, { opacity: 1, duration: 0.6, stagger: 0.12 }, 1.2)
      .add(() => {
        // Gentle "flights" travelling along the arcs, forever
        arcs.forEach((arc, i) => {
          const len = arc.getTotalLength();
          const seg = Math.max(1.2, len * 0.12);
          const comet = arc.cloneNode();
          comet.classList.add('world-map__comet');
          comet.style.stroke = '#eef6f9';
          comet.style.strokeWidth = '0.32';
          comet.style.strokeDasharray = `${seg} ${len + seg}`;
          comet.style.strokeDashoffset = `${seg}`;
          arc.after(comet);
          gsap.to(comet, {
            strokeDashoffset: -len,
            duration: 2.4 + len / 18,
            ease: 'power1.inOut',
            repeat: -1,
            repeatDelay: 1.5 + (i % 5),
            delay: i * 0.45,
          });
        });
      });
  }

  // When a page opens part-way down (refresh, #anchor links), reveal triggers above the
  // fold never fire, so that content would stay hidden. Finish or play those now.
  function catchUpPassedReveals() {
    const viewportTop = window.scrollY;
    ScrollTrigger.getAll().forEach((st) => {
      const anim = st.animation;
      if (!anim || st.vars.scrub || st.vars.pin || anim.progress() > 0 || anim.isActive()) return;
      if (st.scroll() < st.start) return;
      const trigger = st.trigger;
      const bottom = trigger ? trigger.getBoundingClientRect().bottom + viewportTop : st.end;
      if (bottom < viewportTop) anim.progress(1);
      else anim.play();
    });
  }

  function initMagnetic() {
    if (!finePointer) return;
    $$('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'expo.out' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'expo.out' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.25);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------- Services page: sticky chip nav ---------- */
  function initJumpNav() {
    const nav = $('[data-jump-nav]');
    if (!nav || !('IntersectionObserver' in window)) return;
    const links = $$('a[href^="#"]', nav);
    const list = $('.jump-nav__list', nav);
    const map = new Map();
    links.forEach((a) => {
      const target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) map.set(target, a);
    });

    const setActive = (link) => {
      links.forEach((l) => {
        l.classList.toggle('is-active', l === link);
        if (l === link) l.setAttribute('aria-current', 'true');
        else l.removeAttribute('aria-current');
      });
      if (link && list) {
        const left = link.offsetLeft - list.clientWidth / 2 + link.clientWidth / 2;
        list.scrollTo({ left, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(map.get(entry.target));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, target) => observer.observe(target));
  }

  /* ---------- WhatsApp button tucks away over the footer ---------- */
  function initFab() {
    const fab = $('.fab');
    if (!fab || !('IntersectionObserver' in window)) return;
    // Stay out of the way of the hero slideshow controls and the footer links
    const targets = $$('.hero__bar, .footer-bottom');
    const visible = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      fab.classList.toggle('is-tucked', visible.size > 0);
    });
    targets.forEach((t) => observer.observe(t));
  }

  /* ---------- Enquiry forms -> WhatsApp / email ---------- */
  function initForms() {
    $$('form[data-enquiry]').forEach((form) => {
      const summary = $('.form-summary', form);
      const success = document.getElementById(form.dataset.success);
      const params = new URLSearchParams(window.location.search);

      // Prefill from links such as contact.html?trip=Mauritius&service=Flights
      $$('[data-prefill]', form).forEach((input) => {
        const value = params.get(input.dataset.prefill);
        if (!value) return;
        if (input.type === 'radio') {
          if (input.value.toLowerCase() === value.toLowerCase()) input.checked = true;
        } else if (input.tagName === 'SELECT') {
          const match = Array.from(input.options).find((o) => o.value.toLowerCase() === value.toLowerCase());
          if (match) input.value = match.value;
        } else {
          input.value = value;
        }
      });

      const fields = $$('[data-validate]', form);

      const fieldWrap = (input) => input.closest('.field');

      const errorFor = (input) => {
        const value = input.value.trim();
        const label = input.dataset.label || 'This field';
        if (input.required && !value) return `Please enter your ${label.toLowerCase()}.`;
        if (!value) return '';
        if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
          return 'Please enter an email address like name@example.com.';
        }
        if (input.type === 'tel' && value.replace(/\D/g, '').length < 9) {
          return 'Please enter a phone number with at least 9 digits, e.g. 082 123 4567.';
        }
        if (input.dataset.after) {
          const start = form.querySelector(`[name="${input.dataset.after}"]`);
          if (start && start.value && value < start.value) return 'Your return date needs to be after your departure date.';
        }
        return '';
      };

      const showError = (input, message) => {
        const wrap = fieldWrap(input);
        if (!wrap) return;
        const box = $('.field__error', wrap);
        wrap.classList.toggle('has-error', Boolean(message));
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (box) $('span', box).textContent = message;
      };

      fields.forEach((input) => {
        input.addEventListener('blur', () => {
          if (input.value.trim() || input.dataset.touched) showError(input, errorFor(input));
          input.dataset.touched = '1';
        });
        input.addEventListener('input', () => {
          if (fieldWrap(input) && fieldWrap(input).classList.contains('has-error')) showError(input, errorFor(input));
        });
      });

      const buildMessage = () => {
        const data = new FormData(form);
        const lines = [form.dataset.greeting || 'Hi Sure Penzance Travel, I would like some help with a trip.', ''];
        $$('[data-summary]', form).forEach((input) => {
          if ((input.type === 'radio' || input.type === 'checkbox') && !input.checked) return;
          let value = input.value.trim();
          if (!value || (input.type === 'number' && Number(value) === 0)) return;
          if (input.type === 'date') {
            const d = new Date(`${value}T00:00:00`);
            value = d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
          }
          lines.push(`• ${input.dataset.summary}: ${value}`);
        });
        const message = (data.get('message') || '').toString().trim();
        if (message) lines.push('', message);
        return lines.join('\n');
      };

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const errors = [];
        fields.forEach((input) => {
          const message = errorFor(input);
          showError(input, message);
          if (message) errors.push({ input, message });
        });

        if (errors.length) {
          if (summary) {
            const list = $('ul', summary);
            list.innerHTML = '';
            errors.forEach(({ input, message }) => {
              const li = document.createElement('li');
              const a = document.createElement('a');
              a.href = `#${input.id}`;
              a.textContent = message;
              a.addEventListener('click', (ev) => {
                ev.preventDefault();
                input.focus();
              });
              li.appendChild(a);
              list.appendChild(li);
            });
            summary.classList.add('is-visible');
            summary.focus();
          } else {
            errors[0].input.focus();
          }
          return;
        }

        if (summary) summary.classList.remove('is-visible');
        const via = (e.submitter && e.submitter.value) || 'whatsapp';
        const text = buildMessage();
        const subjectBits = [form.dataset.subject || 'Trip enquiry'];
        const dest = form.querySelector('[name="destination"]');
        if (dest && dest.value.trim()) subjectBits.push(dest.value.trim());
        const waUrl = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
        const mailUrl = `mailto:${CONTACT.email}?subject=${encodeURIComponent(subjectBits.join(': '))}&body=${encodeURIComponent(text)}`;

        if (via === 'email') {
          window.location.href = mailUrl;
        } else {
          window.open(waUrl, '_blank', 'noopener');
        }

        if (success) {
          $$('[data-success-channel]', success).forEach((el) => {
            el.textContent = via === 'email' ? 'your email app' : 'WhatsApp';
          });
          const waLink = $('[data-success-wa]', success);
          const mailLink = $('[data-success-mail]', success);
          if (waLink) waLink.href = waUrl;
          if (mailLink) mailLink.href = mailUrl;
          const copyBtn = $('[data-copy]', success);
          if (copyBtn) {
            copyBtn.onclick = async () => {
              try {
                await navigator.clipboard.writeText(text);
                $('span', copyBtn).textContent = 'Copied';
              } catch (err) {
                $('span', copyBtn).textContent = 'Copy failed';
              }
              setTimeout(() => { $('span', copyBtn).textContent = 'Copy my message'; }, 2500);
            };
          }
          success.hidden = false;
          success.focus();
        }
      });
    });
  }

  /* ---------- Boot ---------- */
  initYear();
  lenis = initLenis();
  initHeader();
  initMobileMenu();
  initHeroSlider();
  initJumpNav();
  initFab();
  initForms();

  if (motion) {
    initPageTransitions();
    onFontsReady(() => {
      initSplitHeadings();
      initReveals();
      initScrubWords();
      initCounters();
      initMarquee();
      initHorizontalScroll();
      initSteps();
      initMap();
      initMagnetic();
      runIntro();
      ScrollTrigger.refresh();
      requestAnimationFrame(catchUpPassedReveals);
    });
  }

  window.__sptReady = true;
})();
