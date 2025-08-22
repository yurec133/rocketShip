window.addEventListener("DOMContentLoaded", () => {
  (function () {
    "use strict";

    // ---- GSAP
    if (typeof gsap === "undefined" || !gsap.registerPlugin) {
      console.error("GSAP/плагіни не підключені.");
      return;
    }
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother, ScrollToPlugin);

    // ---- ScrollSmoother
    const smoother = ScrollSmoother.create({
      smooth: 1,
      effects: true,
      smoothTouch: 0.1,
      normalizeScroll: true,
    });

    // ---- Елементи
    const video = document.getElementById("sequenceVideo");
    const dots = document.querySelectorAll(".dot");
    const panels = document.querySelectorAll(".panel");
    const nav = document.querySelector("#nav-dots");
    const line = document.querySelector("#nav-dots .line");
    const scrollButton = document.getElementById("scrollTop");
    const header = document.getElementById("header");
    const burger = document.getElementById("burger-nav");
    const offcanvasNav = document.getElementById("offcanvas-nav");

    const MIN_LOADER_MS = 250;

    if (!video) {
      console.error("#sequenceVideo not found");
      return;
    }
    let loaderShownAt = performance.now();

    function hideLoaderOnce() {
      const loader = document.getElementById("loader");
      if (!loader) return;

      const elapsed = performance.now() - loaderShownAt;
      const delay = Math.max(0, MIN_LOADER_MS - elapsed);

      setTimeout(() => {
        if (typeof gsap !== "undefined") {
          gsap.to(loader, {
            opacity: 0,
            duration: 0.4,
            onComplete: () => loader.remove(),
          });
        } else {
          loader.style.opacity = "0";
          setTimeout(() => loader.remove(), 400);
        }
      }, delay);
    }

    if (video && video.readyState >= 2) {
      hideLoaderOnce();
    } else if (video) {
      video.addEventListener("loadeddata", hideLoaderOnce, { once: true });
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (video.readyState >= 2) hideLoaderOnce();
        },
        { once: true },
      );
    }

    // ---- Параметри (залишаємо твої)
    const frameCount = 2191; // попередня кількість кадрів
    const sections = 6;
    const numberOfArtists = 10;
    const activeFrameRange = 40;
    const panelActiveFrameRange = 200;
    const snapThreshold = 500; // у кадрах (будемо конвертувати у час)
    const throttleDelay = 1000 / 30; // 30fps

    // Ті ж самі старти секцій у кадрах:
    const sectionStarts = [1, 135, 570, 1114, 1333, 2191];
    const sectionEnds = sectionStarts.slice(1).concat(frameCount + 1);

    // Для інтрo (перші 3 кадри кожного артиста)
    const homeFrameCount = sectionStarts[1] - sectionStarts[0];
    const artistFrameLength = Math.floor(homeFrameCount / numberOfArtists);
    const artistStarts = Array.from(
      { length: numberOfArtists },
      (_, i) => sectionStarts[0] + i * artistFrameLength,
    );
    const introFrames = [];
    for (let i = 0; i < numberOfArtists; i++) {
      introFrames.push(
        artistStarts[i],
        artistStarts[i] + 1,
        artistStarts[i] + 2,
      );
    }

    // ---- Стан
    let isHeaderVisible = true;
    let activeSectionIndex = -1;
    const panelStates = new Array(sections).fill(false);
    let lastScrollTop = 0;
    let dotCenters = [];
    let lastRenderTime = 0;
    let videoDuration = 0;
    let mappingReady = false;

    // ---- Утиліти
    const clamp = (min, max, value) => Math.min(max, Math.max(min, value));
    const progressToFrame = (p) => Math.floor(p * (frameCount - 1)) + 1;
    const frameToProgress = (f) => (f - 1) / (frameCount - 1);

    // мапа кадрів у час відео (секунди)
    const frameToTime = (f) => videoDuration * frameToProgress(f);

    // зручності для секцій у часі
    const sectionStartTimes = () => sectionStarts.map((f) => frameToTime(f));
    const sectionEndTimes = () =>
      sectionEnds.map((f) => frameToTime(Math.min(f, frameCount)));

    // ---- Розрахунок позицій дотів для прогрес-лінії
    function updateDotCenters() {
      if (!nav || dots.length === 0) return;
      const navRect = nav.getBoundingClientRect();
      dotCenters = Array.from(dots).map((dot) => {
        const r = dot.getBoundingClientRect();
        return r.top + r.height / 2 - navRect.top;
      });
    }
    updateDotCenters();
    window.addEventListener("resize", updateDotCenters);

    // ---- Анімація панелей (як у тебе)
    function animateSection(sectionIndex, isActive) {
      const panel = panels[sectionIndex];
      if (!panel || panelStates[sectionIndex] === isActive) return;
      panelStates[sectionIndex] = isActive;
      gsap.killTweensOf(panel);

      const children = panel.querySelectorAll(".panel > *");

      if (isActive) {
        gsap.fromTo(
          panel,
          { opacity: 0, y: "10vh", scale: 0.95, rotation: 1 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            rotation: 0,
            duration: 0.8,
            ease: "power3.out",
            onStart: () => panel.classList.add("active"),
          },
        );
        if (children.length) {
          gsap.fromTo(
            children,
            { opacity: 0, y: "20vh" },
            {
              opacity: 1,
              y: 0,
              duration: 0.6,
              stagger: 0.1,
              ease: "power2.out",
              delay: 0.2,
            },
          );
        }
      } else {
        gsap.to(panel, {
          opacity: 0,
          y: "-25vh",
          scale: 0.95,
          rotation: -1,
          duration: 0.8,
          ease: "power3.in",
          onComplete: () => panel.classList.remove("active"),
        });
        if (children.length) {
          gsap.to(children, {
            opacity: 0,
            y: "-20vh",
            duration: 0.6,
            stagger: 0.1,
            ease: "power2.in",
          });
        }
      }
    }

    function updateActiveDot(sectionIndex) {
      if (dots.length === 0 || sectionIndex < 0 || sectionIndex >= sections)
        return;
      dots.forEach((dot, i) => {
        const isActive = i === sectionIndex;
        dot.classList.toggle("active", isActive);
        animateSection(i, isActive);
      });
    }

    function getLineHeightByProgress(progress) {
      if (!nav || dots.length === 0) return 0;
      const progressPoints = sectionStarts.map((s) => frameToProgress(s));
      for (let i = 0; i < sections - 1; i++) {
        if (progress >= progressPoints[i] && progress < progressPoints[i + 1]) {
          const frac =
            (progress - progressPoints[i]) /
            (progressPoints[i + 1] - progressPoints[i]);
          return dotCenters[i] + frac * (dotCenters[i + 1] - dotCenters[i]);
        }
      }
      return dotCenters[sections - 1] || 0;
    }

    function animateHeader(show) {
      if (!header || show === isHeaderVisible) return;
      isHeaderVisible = show;
      gsap.killTweensOf(header);
      gsap.to(header, {
        y: show ? 0 : "-100%",
        opacity: show ? 1 : 0,
        duration: 0.5,
        ease: show ? "power2.out" : "power2.in",
      });
    }

    // ---- Рендер: ми просто оновлюємо кадр відео (через currentTime)
    // нічого малювати на canvas не треба
    let lastAppliedTime = -1;
    function setVideoTimeSafely(t) {
      const now = Date.now();
      if (now - lastRenderTime < throttleDelay) return; // throttle
      if (Math.abs(t - lastAppliedTime) < 1 / 60) return; // дрібна різниця, пропускаємо
      lastRenderTime = now;
      lastAppliedTime = t;
      // Seek без відтворення
      if (!video.seeking) {
        video.currentTime = clamp(0, videoDuration, t);
      }
    }

    // ---- Снап до найближчої секції
    function snapToNearestSectionByTime(currentTime) {
      const starts = sectionStartTimes();
      const closest = starts.reduce(
        (acc, t, i) => {
          const d = Math.abs(currentTime - t);
          return d < acc.dist ? { i, dist: d } : acc;
        },
        { i: -1, dist: Infinity },
      );

      // snapThreshold у кадрах -> у час
      const timeThreshold = frameToTime(snapThreshold);

      if (
        closest.i !== -1 &&
        closest.dist <= timeThreshold &&
        closest.i !== activeSectionIndex
      ) {
        const targetTime = starts[closest.i];
        // Прокрутимо smoother + відео синхронно
        const docMax =
          document.documentElement.scrollHeight - window.innerHeight;
        const targetProgress = frameToProgress(sectionStarts[closest.i]);
        const targetScroll = targetProgress * docMax;

        const tl = gsap.timeline({
          onComplete: () => {
            updateActiveDot(closest.i);
            activeSectionIndex = closest.i;
            const d = dots[closest.i];
            if (d) animateLineToDot(d);
          },
        });

        tl.to({}, { duration: 0.5 }); // просто для таймінгу
        tl.eventCallback("onUpdate", () => {
          // під час твіна рухаємо обидва
          const p = tl.progress(); // 0..1
          const ct = currentTime + (targetTime - currentTime) * p;
          setVideoTimeSafely(ct);
          smoother.scrollTop(
            lastScrollTop + (targetScroll - lastScrollTop) * p,
          );
        });
      }
    }

    function animateLineToDot(dot) {
      if (!line || !dot || !nav) return;
      const navRect = nav.getBoundingClientRect();
      const dotRect = dot.getBoundingClientRect();
      const targetHeight = dotRect.top + dotRect.height / 2 - navRect.top;
      gsap.to(line, {
        height: targetHeight,
        duration: 1,
        ease: "power2.inOut",
        overwrite: "auto",
      });
    }

    // ---- Обробка кліків по дотах
    function hookDots() {
      if (dots.length === 0) return;
      dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
          const section = parseInt(dot.dataset.section, 10);
          if (isNaN(section) || section < 0 || section >= sections) return;

          const targetFrame = sectionStarts[section];
          const targetTime = frameToTime(targetFrame);
          const docMax =
            document.documentElement.scrollHeight - window.innerHeight;
          const targetScroll = frameToProgress(targetFrame) * docMax;

          updateActiveDot(section);
          activeSectionIndex = section;

          // Tween відео
          gsap.to(
            { t: video.currentTime },
            {
              t: targetTime,
              duration: 1,
              ease: "power2.inOut",
              onUpdate: function () {
                setVideoTimeSafely(this.targets()[0].t);
              },
            },
          );

          // Tween скролу
          gsap.to(smoother, {
            scrollTop: targetScroll,
            duration: 1,
            ease: "power2.inOut",
            onComplete: () => updateActiveDot(section),
          });

          animateLineToDot(dot);
        });
      });
    }

    // ---- Кнопка Scroll (вниз до наступної секції)
    function hookScrollButton() {
      if (!scrollButton) return;
      scrollButton.addEventListener("click", () => {
        let nextSection = activeSectionIndex + 1;
        if (nextSection >= sections) return;

        const targetFrame = sectionStarts[nextSection];
        const targetTime = frameToTime(targetFrame);
        const docMax =
          document.documentElement.scrollHeight - window.innerHeight;
        const targetScroll = frameToProgress(targetFrame) * docMax;

        updateActiveDot(nextSection);
        activeSectionIndex = nextSection;

        gsap.to(
          { t: video.currentTime },
          {
            t: targetTime,
            duration: 1,
            ease: "power2.inOut",
            onUpdate: function () {
              setVideoTimeSafely(this.targets()[0].t);
            },
          },
        );

        gsap.to(smoother, {
          scrollTop: targetScroll,
          duration: 1,
          ease: "power2.inOut",
          onComplete: () => {
            updateActiveDot(nextSection);
            if (nextSection === sections - 1) {
              gsap.to(scrollButton, {
                opacity: 0,
                duration: 0.3,
                onComplete: () => {
                  scrollButton.style.display = "none";
                },
              });
            }
          },
        });

        if (dots[nextSection]) animateLineToDot(dots[nextSection]);
      });
    }

    // ---- Бургер/оффканвас (як було)
    function hookBurger() {
      if (!burger || !offcanvasNav) return;
      burger.addEventListener("click", () => {
        const isActive = burger.classList.contains("active");
        const offcanvasBar = offcanvasNav.querySelector(".offcanvas-bar");
        if (!offcanvasBar) return;

        if (isActive) {
          burger.classList.remove("active");
          gsap.to(offcanvasBar, {
            left: "-250px",
            duration: 0.3,
            ease: "power2.inOut",
            onComplete: () => offcanvasNav.classList.remove("open"),
          });
        } else {
          burger.classList.add("active");
          offcanvasNav.classList.add("open");
          gsap.fromTo(
            offcanvasBar,
            { left: "-250px" },
            { left: "0", duration: 0.3, ease: "power2.inOut" },
          );
        }
      });

      offcanvasNav.addEventListener("click", (e) => {
        const offcanvasBar = offcanvasNav.querySelector(".offcanvas-bar");
        if (!offcanvasBar) return;
        if (e.target === offcanvasNav) {
          burger.classList.remove("active");
          gsap.to(offcanvasBar, {
            left: "-250px",
            duration: 0.3,
            ease: "power2.inOut",
            onComplete: () => offcanvasNav.classList.remove("open"),
          });
        }
      });
    }

    // ---- Обробка скролу (хедер/кнопка/снап)
    let scrollTimeout, snapTimeout;
    function handleScroll() {
      const currentScrollTop = smoother.scrollTop();
      const isDown = currentScrollTop > lastScrollTop;

      if (header) {
        if (isDown && isHeaderVisible) animateHeader(false);
        else if (!isDown && !isHeaderVisible) animateHeader(true);
      }

      if (scrollButton) {
        gsap.killTweensOf(scrollButton);
        gsap.set(scrollButton, {
          opacity: 0,
          display: "none",
          overwrite: "auto",
        });
      }

      clearTimeout(scrollTimeout);
      clearTimeout(snapTimeout);

      scrollTimeout = setTimeout(() => {
        if (scrollButton && activeSectionIndex !== sections - 1) {
          gsap.to(scrollButton, {
            opacity: 1,
            duration: 0.3,
            overwrite: "auto",
            onStart: () => {
              scrollButton.style.display = "block";
            },
          });
        }

        // Після зупинки — снап до секції
        const docMax =
          document.documentElement.scrollHeight - window.innerHeight;
        const progress = clamp(0, 1, currentScrollTop / Math.max(1, docMax));
        const currentFrame = progressToFrame(progress);
        const currentTime = frameToTime(currentFrame);

        snapTimeout = setTimeout(() => {
          snapToNearestSectionByTime(currentTime);
        }, 300);
      }, 300);

      lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop;
    }

    ScrollTrigger.create({ onUpdate: handleScroll });
    window.addEventListener("scroll", handleScroll);

    // ---- Головна зв'язка: скрол -> час у відео
    function initScrollSync() {
      // один ScrollTrigger на весь документ, що лінійно мапить прогрес у час
      gsap.to(
        {},
        {
          // dummy tween для scrub
          scrollTrigger: {
            scrub: 0.5,
            pin: "#sequenceVideo",
            trigger: "#sequenceVideo",
            end: "500%",
            onUpdate: (self) => {
              const progress = clamp(
                0,
                1,
                (self.scroll() - self.start) / (self.end - self.start),
              );
              const frame = progressToFrame(progress);
              const time = frameToTime(frame);

              // Оновлюємо відео
              setVideoTimeSafely(time);

              // Оновлюємо лінію в навігації
              if (line && nav && !gsap.isTweening(line)) {
                line.style.height = `${getLineHeightByProgress(progress)}px`;
              }

              // Стани дотів/панелей
              let newSectionIndex = -1;
              dots.forEach((dot, i) => {
                const sFrame = sectionStarts[i];
                const isDotActive =
                  frame >= sFrame && frame < sFrame + activeFrameRange;
                const isPanelActive =
                  frame >= sFrame &&
                  frame <
                    Math.min(sFrame + panelActiveFrameRange, sectionEnds[i]);
                dot.classList.toggle("active", isDotActive);
                if (panelStates[i] !== isPanelActive)
                  animateSection(i, isPanelActive);
                if (isDotActive) newSectionIndex = i;
              });
              activeSectionIndex = newSectionIndex;

              if (scrollButton) {
                if (activeSectionIndex === sections - 1) {
                  gsap.to(scrollButton, {
                    opacity: 0,
                    duration: 0.3,
                    onComplete: () => {
                      scrollButton.style.display = "none";
                    },
                  });
                } else {
                  gsap.to(scrollButton, {
                    opacity: 1,
                    duration: 0.3,
                    onStart: () => {
                      scrollButton.style.display = "block";
                    },
                  });
                }
              }
            },
          },
        },
      );
    }

    // ---- Інтро: 3 сек, «листання» перших кадрів артистів
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
          // показати UI
          if (header)
            gsap.to(header, {
              y: 0,
              opacity: 1,
              duration: 0.8,
              ease: "power2.out",
            });
          if (nav)
            gsap.to(nav, {
              x: "-80px",
              opacity: 1,
              duration: 0.8,
              ease: "power2.out",
            });

          // зупинитися на кінці випадкового артиста:
          const randomArtist = Math.floor(Math.random() * numberOfArtists);
          const endFrame1 =
            randomArtist < numberOfArtists - 1
              ? artistStarts[randomArtist + 1] - 1
              : sectionStarts[1] - 1;
          setVideoTimeSafely(frameToTime(endFrame1));

          if (scrollButton)
            gsap.to(scrollButton, {
              opacity: 1,
              duration: 0.5,
              onStart: () => (scrollButton.style.display = "block"),
            });

          // старт скрол-синхронізації
          initScrollSync();
          activeSectionIndex = 0;
          updateActiveDot(0);
          animateSection(0, true);
          if (line && dotCenters[0]) line.style.height = `${dotCenters[0]}px`;
        },
      });
    }

    // ---- Ініціалізація після завантаження метаданих відео
    function onMetadataReady() {
      videoDuration = video.duration || 0;
      if (!videoDuration) {
        console.error("Не вдалось отримати тривалість відео.");
        return;
      }
      mappingReady = true;

      // зупинити авто-плей (деякі браузери можуть стартувати)
      video.pause();
      video.currentTime = frameToTime(1);

      hookDots();
      hookScrollButton();
      hookBurger();
      runIntro();
    }

    if (video.readyState >= 1) {
      onMetadataReady();
    } else {
      video.addEventListener("loadedmetadata", onMetadataReady, { once: true });
    }
  })();
});
