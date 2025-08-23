window.addEventListener("DOMContentLoaded", () => {
  (function () {
    "use strict";

    // ---- GSAP Check
    if (typeof gsap === "undefined" || !gsap.registerPlugin) {
      console.error("GSAP/plugins are not loaded.");
      return;
    }
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother, ScrollToPlugin);

    // ---- Detect Mobile Device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // ---- ScrollSmoother
    const smoother = ScrollSmoother.create({
      smooth: isMobile ? 0.5 : 1,
      effects: !isMobile,
      smoothTouch: isMobile ? 0.2 : 0.1,
      normalizeScroll: true,
    });

    // ---- DOM Elements
    const elements = {
      video: document.getElementById("sequenceVideo"),
      dots: document.querySelectorAll(".dot"),
      panels: document.querySelectorAll(".panel"),
      nav: document.querySelector("#nav-dots"),
      line: document.querySelector("#nav-dots .line"),
      scrollButton: document.getElementById("scrollTop"),
      header: document.getElementById("header"),
      burger: document.getElementById("burger-nav"),
      offcanvasNav: document.getElementById("offcanvas-nav"),
      loader: document.getElementById("loader"),
    };

    if (!elements.video) {
      console.error("#sequenceVideo not found");
      return;
    }

    const MIN_LOADER_MS = 250;
    const loaderShownAt = performance.now();

    function hideLoader() {
      const elapsed = performance.now() - loaderShownAt;
      const delay = Math.max(0, MIN_LOADER_MS - elapsed);

      setTimeout(() => {
        gsap.to(elements.loader, {
          opacity: 0,
          duration: 0.4,
          onComplete: () => elements.loader.remove(),
        });
      }, delay);
    }

    if (elements.video.readyState >= 2) {
      hideLoader();
    } else {
      elements.video.addEventListener("loadeddata", hideLoader, { once: true });
      elements.video.addEventListener("loadedmetadata", () => {
        if (elements.video.readyState >= 2) hideLoader();
      }, { once: true });
    }

    // ---- Constants
    const frameCount = 2191;
    const sections = 6;
    const numberOfArtists = 10;
    const activeFrameRange = 40;
    const panelActiveFrameRange = 200;
    const snapThreshold = 500; // in frames
    const throttleDelay = isMobile ? 100 : 33; // 10 fps for mobile, 30 fps for others
    const debounceDelay = 1000; // Delay for click and swipe debouncing

    const sectionStarts = [1, 135, 570, 1114, 1333, 2191];
    const sectionEnds = sectionStarts.slice(1).concat(frameCount + 1);

    const homeFrameCount = sectionStarts[1] - sectionStarts[0];
    const artistFrameLength = Math.floor(homeFrameCount / numberOfArtists);
    const artistStarts = Array.from({ length: numberOfArtists }, (_, i) => sectionStarts[0] + i * artistFrameLength);
    const introFrames = artistStarts.flatMap((start) => [start, start + 1, start + 2]);

    // ---- State
    let isHeaderVisible = true;
    let activeSectionIndex = -1;
    const panelStates = new Array(sections).fill(false);
    let lastScrollTop = 0;
    let dotCenters = [];
    let lastRenderTime = 0;
    let videoDuration = 0;
    let mappingReady = false;
    let isScrollingToSection = false;
    let lastClickTime = 0;
    let isFastScrolling = false;
    let lastSwipeTime = 0;

    // ---- Utilities
    const clamp = (min, max, value) => Math.min(max, Math.max(min, value));
    const progressToFrame = (p) => Math.floor(p * (frameCount - 1)) + 1;
    const frameToProgress = (f) => (f - 1) / (frameCount - 1);
    const frameToTime = (f) => videoDuration * frameToProgress(f);
    const sectionStartTimes = () => sectionStarts.map(frameToTime);

    // ---- Update Dot Centers
    function updateDotCenters() {
      if (!elements.nav || elements.dots.length === 0) return;
      const navRect = elements.nav.getBoundingClientRect();
      dotCenters = Array.from(elements.dots).map((dot) => {
        const r = dot.getBoundingClientRect();
        return r.top + r.height / 2 - navRect.top;
      });
    }
    updateDotCenters();
    window.addEventListener("resize", updateDotCenters);

    // ---- Animations
    function animatePanel(sectionIndex, isActive, timeline) {
      const panel = elements.panels[sectionIndex];
      if (!panel || panelStates[sectionIndex] === isActive) return;
      panelStates[sectionIndex] = isActive;
      gsap.killTweensOf(panel);

      const children = panel.querySelectorAll(".panel > *");
      const fromProps = isActive ? { opacity: 0, y: "10vh", scale: 0.95, rotation: 1 } : {};
      const toProps = isActive
        ? { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 0.8, ease: "power3.out", overwrite: true }
        : { opacity: 0, y: "-25vh", scale: 0.95, rotation: -1, duration: 0.8, ease: "power3.in", overwrite: true };

      if (timeline) {
        timeline.fromTo(
          panel,
          fromProps,
          {
            ...toProps,
            onStart: () => isActive && panel.classList.add("active"),
            onComplete: () => !isActive && panel.classList.remove("active"),
          },
          0,
        );
      } else {
        gsap.fromTo(panel, fromProps, {
          ...toProps,
          onStart: () => isActive && panel.classList.add("active"),
          onComplete: () => !isActive && panel.classList.remove("active"),
        });
      }

      if (children.length) {
        const childFrom = isActive ? { opacity: 0, y: "20vh" } : {};
        const childTo = isActive
          ? { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.2, overwrite: true }
          : { opacity: 0, y: "-20vh", duration: 0.6, stagger: 0.1, ease: "power2.in", overwrite: true };
        if (timeline) {
          timeline.fromTo(children, childFrom, childTo, 0);
        } else {
          gsap.fromTo(children, childFrom, childTo);
        }
      }
    }

    function updateActiveDot(sectionIndex) {
      if (elements.dots.length === 0 || sectionIndex < 0 || sectionIndex >= sections) return;
      elements.dots.forEach((dot, i) => {
        const isActive = i === sectionIndex;
        dot.classList.toggle("active", isActive);
        if (!isScrollingToSection) animatePanel(i, isActive);
      });
    }

    function getLineHeightByProgress(progress) {
      if (!elements.nav || elements.dots.length === 0) return 0;
      const progressPoints = sectionStarts.map(frameToProgress);
      for (let i = 0; i < sections - 1; i++) {
        if (progress >= progressPoints[i] && progress < progressPoints[i + 1]) {
          const frac = (progress - progressPoints[i]) / (progressPoints[i + 1] - progressPoints[i]);
          return dotCenters[i] + frac * (dotCenters[i + 1] - dotCenters[i]);
        }
      }
      return dotCenters[sections - 1] || 0;
    }

    function animateHeader(show) {
      if (!elements.header || show === isHeaderVisible) return;
      isHeaderVisible = show;
      gsap.killTweensOf(elements.header);
      gsap.to(elements.header, {
        y: show ? 0 : "-100%",
        opacity: show ? 1 : 0,
        duration: 0.5,
        ease: show ? "power2.out" : "power2.in",
      });
    }

    function animateLineToDot(dot, timeline) {
      if (!elements.line || !dot || !elements.nav) return;
      const navRect = elements.nav.getBoundingClientRect();
      const dotRect = dot.getBoundingClientRect();
      const targetHeight = dotRect.top + dotRect.height / 2 - navRect.top;
      const props = { height: targetHeight, duration: 1, ease: "power2.inOut", overwrite: "auto" };
      if (timeline) {
        timeline.to(elements.line, props, 0);
      } else {
        gsap.to(elements.line, props);
      }
    }

    // ---- Video Control
    let lastAppliedTime = -1;
    function setVideoTimeSafely(t) {
      if (isFastScrolling || elements.video.readyState < 2) {
        return;
      }
      const now = performance.now();
      if (now - lastRenderTime < throttleDelay) return;
      const setTime = () => {
        if (Math.abs(t - lastAppliedTime) < 1 / 60) return;
        lastRenderTime = performance.now();
        lastAppliedTime = t;
        if (!elements.video.seeking) {
          elements.video.currentTime = clamp(0, videoDuration, t);
        }
      };
      requestAnimationFrame(setTime);
    }

    // ---- Snap Logic
    function snapToNearestSectionByTime(currentTime) {
      const starts = sectionStartTimes();
      const closest = starts.reduce(
        (acc, t, i) => {
          const d = Math.abs(currentTime - t);
          return d < acc.dist ? { i, dist: d } : acc;
        },
        { i: -1, dist: Infinity },
      );

      const timeThreshold = frameToTime(snapThreshold);
      if (closest.i === -1 || closest.dist > timeThreshold || closest.i === activeSectionIndex) return;

      scrollToSection(closest.i, currentTime);
    }

    // ---- Shared Scroll to Section
    function scrollToSection(sectionIndex, currentTime = elements.video.currentTime) {
      const now = Date.now();
      if (now - lastClickTime < debounceDelay || isScrollingToSection) return;
      lastClickTime = now;
      lastSwipeTime = now;
      isScrollingToSection = true;

      const targetFrame = sectionStarts[sectionIndex];
      const targetTime = frameToTime(targetFrame);
      const docMax = document.documentElement.scrollHeight - window.innerHeight;
      const targetScroll = frameToProgress(targetFrame) * docMax;

      activeSectionIndex = sectionIndex;

      const tl = gsap.timeline({
        onComplete: () => {
          isScrollingToSection = false;
          updateActiveDot(sectionIndex);
        },
      });

      tl.to(
        { t: currentTime },
        {
          t: targetTime,
          duration: 1,
          ease: "power2.inOut",
          onUpdate: function () {
            setVideoTimeSafely(this.targets()[0].t);
          },
        },
        0,
      );

      tl.to(
        smoother,
        {
          scrollTop: targetScroll,
          duration: 1,
          ease: "power2.inOut",
        },
        0,
      );

      elements.dots.forEach((dot, i) => {
        animatePanel(i, i === sectionIndex, tl);
      });

      const dot = elements.dots[sectionIndex];
      if (dot) animateLineToDot(dot, tl);
    }

    // ---- Hooks
    function hookDots() {
      if (elements.dots.length === 0) return;
      elements.dots.forEach((dot, index) => {
        dot.addEventListener("click", () => scrollToSection(index));
      });
    }

    function hookScrollButton() {
      if (!elements.scrollButton) return;
      elements.scrollButton.addEventListener("click", () => {
        const nextSection = activeSectionIndex + 1;
        if (nextSection >= sections) return;
        scrollToSection(nextSection);

        if (nextSection === sections - 1) {
          gsap.to(elements.scrollButton, {
            opacity: 0,
            duration: 0.3,
            onComplete: () => {
              elements.scrollButton.style.display = "none";
            },
          });
        }
      });
    }

    function hookBurger() {
      if (!elements.burger || !elements.offcanvasNav) return;
      const offcanvasBar = elements.offcanvasNav.querySelector(".offcanvas-bar");
      if (!offcanvasBar) return;

      elements.burger.addEventListener("click", () => {
        const isActive = elements.burger.classList.contains("active");
        if (isActive) {
          elements.burger.classList.remove("active");
          gsap.to(offcanvasBar, {
            left: "-250px",
            duration: 0.3,
            ease: "power2.inOut",
            onComplete: () => elements.offcanvasNav.classList.remove("open"),
          });
        } else {
          elements.burger.classList.add("active");
          elements.offcanvasNav.classList.add("open");
          gsap.fromTo(
            offcanvasBar,
            { left: "-250px" },
            { left: "0", duration: 0.3, ease: "power2.inOut" },
          );
        }
      });

      elements.offcanvasNav.addEventListener("click", (e) => {
        if (e.target === elements.offcanvasNav) {
          elements.burger.classList.remove("active");
          gsap.to(offcanvasBar, {
            left: "-250px",
            duration: 0.3,
            ease: "power2.inOut",
            onComplete: () => elements.offcanvasNav.classList.remove("open"),
          });
        }
      });
    }

    // ---- Scroll Handling
    let scrollTimeout, snapTimeout, fastScrollTimeout;
    function handleScroll() {
      const currentScrollTop = smoother.scrollTop();
      const isDown = currentScrollTop > lastScrollTop;
      const scrollSpeed = Math.abs(currentScrollTop - lastScrollTop);

      if (scrollSpeed > 50 && isMobile) {
        isFastScrolling = true;
        clearTimeout(fastScrollTimeout);
        fastScrollTimeout = setTimeout(() => {
          isFastScrolling = false;
        }, 200);
      }

      if (elements.header) {
        if (isDown && isHeaderVisible) animateHeader(false);
        else if (!isDown && !isHeaderVisible) animateHeader(true);
      }

      if (elements.scrollButton) {
        gsap.killTweensOf(elements.scrollButton);
        gsap.set(elements.scrollButton, { opacity: 0, display: "none", overwrite: "auto" });
      }

      clearTimeout(scrollTimeout);
      clearTimeout(snapTimeout);

      scrollTimeout = setTimeout(() => {
        if (elements.scrollButton && activeSectionIndex !== sections - 1) {
          gsap.to(elements.scrollButton, {
            opacity: 1,
            duration: 0.3,
            overwrite: "auto",
            onStart: () => {
              elements.scrollButton.style.display = "block";
            },
          });
        }

        const docMax = document.documentElement.scrollHeight - window.innerHeight;
        const progress = clamp(0, 1, currentScrollTop / Math.max(1, docMax));
        const currentFrame = progressToFrame(progress);
        const currentTime = frameToTime(currentFrame);

        // For mobile, snap immediately after swipe ends
        if (isMobile && !isFastScrolling && !isScrollingToSection) {
          const now = Date.now();
          if (now - lastSwipeTime >= debounceDelay) {
            snapToNearestSectionByTime(currentTime);
          }
        } else {
          snapTimeout = setTimeout(() => snapToNearestSectionByTime(currentTime), 150); // Reduced delay for non-mobile
        }
      }, 100); // Reduced delay for responsiveness

      lastScrollTop = Math.max(0, currentScrollTop);
    }

    ScrollTrigger.create({ onUpdate: handleScroll });

    // ---- Scroll Sync
    function initScrollSync() {
      gsap.to({}, {
        scrollTrigger: {
          scrub: isMobile ? 0.3 : 0.5,
          pin: "#sequenceVideo",
          trigger: "#sequenceVideo",
          end: "500%",
          onUpdate: (self) => {
            if (isScrollingToSection) return;

            const progress = clamp(0, 1, (self.scroll() - self.start) / (self.end - self.start));
            const frame = progressToFrame(progress);
            const time = frameToTime(frame);

            setVideoTimeSafely(time);

            if (elements.line && elements.nav && !gsap.isTweening(elements.line)) {
              elements.line.style.height = `${getLineHeightByProgress(progress)}px`;
            }

            let newSectionIndex = -1;
            elements.dots.forEach((dot, i) => {
              const sFrame = sectionStarts[i];
              const isDotActive = frame >= sFrame && frame < sFrame + activeFrameRange;
              const isPanelActive = frame >= sFrame && frame < Math.min(sFrame + panelActiveFrameRange, sectionEnds[i]);
              dot.classList.toggle("active", isDotActive);
              if (panelStates[i] !== isPanelActive) animatePanel(i, isPanelActive);
              if (isDotActive) newSectionIndex = i;
            });
            activeSectionIndex = newSectionIndex;

            if (elements.scrollButton) {
              const targetOpacity = activeSectionIndex === sections - 1 ? 0 : 1;
              const targetDisplay = activeSectionIndex === sections - 1 ? "none" : "block";
              gsap.to(elements.scrollButton, {
                opacity: targetOpacity,
                duration: 0.3,
                onStart: () => {
                  if (targetOpacity === 1) elements.scrollButton.style.display = targetDisplay;
                },
                onComplete: () => {
                  if (targetOpacity === 0) elements.scrollButton.style.display = targetDisplay;
                },
              });
            }
          },
        },
      });
    }

    // ---- Intro Animation
    function runIntro() {
      const dummy = { val: 0 };
      gsap.to(dummy, {
        val: 29,
        duration: 3,
        ease: "none",
        snap: "val",
        onUpdate: () => {
          const frameIndex = Math.floor(dummy.val);
          const frame = introFrames[frameIndex];
          if (frame) setVideoTimeSafely(frameToTime(frame));
        },
        onComplete: () => {
          if (elements.header) {
            gsap.to(elements.header, { y: 0, opacity: 1, duration: 0.8, ease: "power2.out" });
          }
          if (elements.nav) {
            gsap.to(elements.nav, { x: 0, opacity: 1, duration: 0.8, ease: "power2.out" });
          }

          const randomArtist = Math.floor(Math.random() * numberOfArtists);
          const endFrame = randomArtist < numberOfArtists - 1 ? artistStarts[randomArtist + 1] - 1 : sectionStarts[1] - 1;
          setVideoTimeSafely(frameToTime(endFrame));

          if (elements.scrollButton) {
            gsap.to(elements.scrollButton, {
              opacity: 1,
              duration: 0.5,
              onStart: () => (elements.scrollButton.style.display = "block"),
            });
          }

          initScrollSync();
          activeSectionIndex = 0;
          updateActiveDot(0);
          animatePanel(0, true);
          if (elements.line && dotCenters[0]) elements.line.style.height = `${dotCenters[0]}px`;
        },
      });
    }

    // ---- Metadata Ready
    function onMetadataReady() {
      videoDuration = elements.video.duration || 0;
      if (!videoDuration) {
        console.error("Failed to get video duration");
        return;
      }
      mappingReady = true;

      elements.video.pause();
      elements.video.currentTime = frameToTime(1);

      // Add video error handling
      elements.video.addEventListener("error", (e) => {
        console.error("Video loading error:", e);
      });

      hookDots();
      hookScrollButton();
      hookBurger();
      runIntro();
    }

    if (elements.video.readyState >= 1) {
      onMetadataReady();
    } else {
      elements.video.addEventListener("loadedmetadata", onMetadataReady, { once: true });
    }
  })();
});