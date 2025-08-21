window.addEventListener("DOMContentLoaded", () => {
  (function () {
    "use strict";

    // Register plugins
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother, ScrollToPlugin);

    // ScrollSmoother setup
    let smoother = ScrollSmoother.create({
      smooth: 1,
      effects: true,
      smoothTouch: 0.1,
      normalizeScroll: true,
    });

    // Hide native scrollbar
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.msOverflowStyle = "none";
    document.body.style.scrollbarWidth = "none";
    document.body.style.setProperty("::-webkit-scrollbar", "display: none");

    // Constants
    const canvas = document.getElementById("sequence");
    const context = canvas ? canvas.getContext("2d") : null;
    const frameCount = 2191;
    const sections = 6;
    const numberOfArtists = 10;
    const activeFrameRange = 40;
    const panelActiveFrameRange = 200;
    const baseBatchSize = 300; // Base batch size, will be dynamic
    const snapThreshold = 500;
    const scrollVelocityThreshold = 1000; // Pixels per second; above this = fast scroll, use lq
    const stopThreshold = 50; // If velocity below this and stopped, load hq
    const neighborFramesToUpgrade = 50; // When stopped, upgrade hq for current frame +/- this many

    // Check canvas availability
    if (!canvas || !context) {
      console.error(
        "Canvas or context not found. Ensure #sequence element exists.",
      );
      return;
    }

    // Custom section starts (0-based frame indices)
    const sectionStarts = [1, 135, 570, 1114, 1333, 2191];

    const sectionEnds = sectionStarts.slice(1).concat(frameCount + 1);

    // Artists in home section (section 0)
    const homeFrameCount = sectionStarts[1] - sectionStarts[0];
    const artistFrameLength = Math.floor(homeFrameCount / numberOfArtists);
    const artistStarts = Array.from(
      { length: numberOfArtists },
      (_, i) => sectionStarts[0] + i * artistFrameLength,
    );

    // Precompute intro frames: first 3 frames of each artist
    const introFrames = [];
    for (let i = 0; i < numberOfArtists; i++) {
      introFrames.push(artistStarts[i]);
      introFrames.push(artistStarts[i] + 1);
      introFrames.push(artistStarts[i] + 2);
    }

    // Cached elements with checks
    const dots = document.querySelectorAll(".dot");
    const panels = document.querySelectorAll(".panel");
    const line = document.querySelector("#nav-dots .line");
    const nav = document.querySelector("#nav-dots");
    const scrollButton = document.getElementById("scrollTop");
    const header = document.getElementById("header");
    const burger = document.getElementById("burger-nav");
    const offcanvasNav = document.getElementById("offcanvas-nav");

    // Check critical elements
    if (dots.length === 0) {
      console.warn(
        "No .dot elements found. Check your HTML for .dot selectors.",
      );
    }
    if (panels.length === 0) {
      console.warn(
        "No .panel elements found. Check your HTML for .panel selectors.",
      );
    }
    if (!nav) {
      console.warn("#nav-dots element not found.");
    }
    if (!line) {
      console.warn("#nav-dots .line element not found.");
    }
    if (!scrollButton) {
      console.warn("#scrollTop element not found.");
    }
    if (!header) {
      console.warn("#header element not found.");
    }
    if (!burger) {
      console.warn("#burger-nav element not found.");
    }
    if (!offcanvasNav) {
      console.warn("#offcanvas-nav element not found.");
    }
    if (offcanvasNav && !offcanvasNav.querySelector(".offcanvas-bar")) {
      console.warn(".offcanvas-bar not found inside #offcanvas-nav.");
    }

    // State
    const images = {}; // Object to store images by frame and quality: images[frame][quality]
    const imgSeq = { frame: 0, lastRenderedFrame: -1, currentQuality: "lq" };
    let lastLoadedFrame = 0;
    let activeSectionIndex = -1;
    const panelStates = new Array(sections).fill(false);
    let dotCenters = [];
    let lastScrollTop = 0;
    let isHeaderVisible = true;
    let currentBatchSize = baseBatchSize;
    let lastScrollTime = Date.now();
    let scrollVelocity = 0;
    let connectionType = "4g"; // Default to fast
    let stopTimeout; // For detecting scroll stop

    // Detect connection speed
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    if (connection) {
      connectionType = connection.effectiveType || "4g";
      connection.addEventListener("change", () => {
        connectionType = connection.effectiveType || "4g";
      });
    }

    function clamp(min, max, value) {
      return Math.min(max, Math.max(min, value));
    }

    // Resize canvas and update dot centers
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const updateDotCenters = () => {
      if (!nav || dots.length === 0) {
        console.warn("Cannot update dot centers: nav or dots missing.");
        return;
      }
      const navRect = nav.getBoundingClientRect();
      dotCenters = Array.from(dots).map((dot) => {
        const dotRect = dot.getBoundingClientRect();
        return dotRect.top + dotRect.height / 2 - navRect.top;
      });
    };

    resizeCanvas();
    window.addEventListener("resize", () => {
      resizeCanvas();
      updateDotCenters();
    });

    // Frame URL generator with quality
    const currentFrame = (index, quality = "hq") =>
      `images/${quality}/${index.toString().padStart(4, "0")}.webp`;

    // Determine quality based on factors
    function getQualityForFrame(frame, isPreload = false) {
      if (connectionType === "slow-2g" || connectionType === "2g") {
        return "lq"; // Always low quality on slow connections
      }
      if (isPreload && scrollVelocity > scrollVelocityThreshold) {
        return "lq"; // Low quality for preloading during fast scroll
      }
      // For key frames or stopped: prefer hq
      return "hq";
    }

    // Async preload images in batch with quality
    const preloadImages = async (start, end, quality) => {
      start = Math.max(1, start);
      end = Math.min(end, frameCount);
      const promises = [];
      for (let i = start; i <= end; i++) {
        if (!images[i - 1]) images[i - 1] = {};
        if (!images[i - 1][quality]) {
          const img = new Image();
          img.src = currentFrame(i, quality);
          promises.push(
            new Promise((resolve, reject) => {
              img.onload = () => {
                images[i - 1][quality] = img;
                if (i - 1 === imgSeq.frame) render();
                resolve();
              };
              img.onerror = () => {
                console.error(
                  `Failed to load image ${i} at quality ${quality}`,
                );
                reject();
              };
            }),
          );
        }
      }
      await Promise.all(promises);
      lastLoadedFrame = Math.max(lastLoadedFrame, end);
    };

    // Upgrade quality for a range of frames (e.g., when stopped)
    const upgradeToHQ = async (centerFrame) => {
      const start = Math.max(1, centerFrame - neighborFramesToUpgrade);
      const end = Math.min(frameCount, centerFrame + neighborFramesToUpgrade);
      await preloadImages(start, end, "hq");
      // Re-render if current frame was upgraded
      if (centerFrame - 1 === imgSeq.frame) {
        imgSeq.currentQuality = "hq";
        render();
      }
    };

    // Render frame (use best available quality, prefer hq if loaded)
    function render() {
      const frameIndex = imgSeq.frame;
      if (imgSeq.frame === imgSeq.lastRenderedFrame) return;

      let img;
      if (images[frameIndex] && images[frameIndex]["hq"]) {
        img = images[frameIndex]["hq"];
        imgSeq.currentQuality = "hq";
      } else if (images[frameIndex] && images[frameIndex]["lq"]) {
        img = images[frameIndex]["lq"];
        imgSeq.currentQuality = "lq";
      } else {
        return; // Not loaded yet
      }

      context.clearRect(0, 0, canvas.width, canvas.height);

      const canvasRatio = canvas.width / canvas.height;
      const imgRatio = img.width / img.height;
      let drawWidth, drawHeight, offsetX, offsetY;

      if (canvasRatio > imgRatio) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgRatio;
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
      } else {
        drawHeight = canvas.height;
        drawWidth = canvas.height * imgRatio;
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = 0;
      }

      context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      imgSeq.lastRenderedFrame = imgSeq.frame;
    }

    // Animate panel show/hide
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
        if (children.length > 0) {
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
          onComplete: () => {
            panel.classList.remove("active");
          },
        });
        if (children.length > 0) {
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

    // Update active dots and panels (for click)
    function updateActiveDot(sectionIndex) {
      if (dots.length === 0 || sectionIndex < 0 || sectionIndex >= sections)
        return;
      dots.forEach((dot, i) => {
        const isActive = i === sectionIndex;
        dot.classList.toggle("active", isActive);
        animateSection(i, isActive);
      });
    }

    // Calculate line height based on progress
    function getLineHeight(progress) {
      if (!nav || dots.length === 0) {
        console.warn("Cannot calculate line height: nav or dots missing.");
        return 0;
      }
      const progressPoints = sectionStarts.map(
        (s) => (s - 1) / (frameCount - 1),
      );
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

    // Animate header show/hide
    function animateHeader(show) {
      if (!header || show === isHeaderVisible) return;
      isHeaderVisible = show;
      gsap.killTweensOf(header);
      if (show) {
        gsap.to(header, {
          y: 0,
          opacity: 1,
          duration: 0.5,
          ease: "power2.out",
        });
      } else {
        gsap.to(header, {
          y: "-100%",
          opacity: 0,
          duration: 0.5,
          ease: "power2.in",
        });
      }
    }

    // Snap to nearest section
    function snapToNearestSection(currentFrame) {
      let closestSectionIndex = -1;
      let minDistance = Infinity;

      sectionStarts.forEach((startFrame, index) => {
        const distance = Math.abs(currentFrame - startFrame);
        if (distance < minDistance && distance <= snapThreshold) {
          minDistance = distance;
          closestSectionIndex = index;
        }
      });

      if (
        closestSectionIndex !== -1 &&
        closestSectionIndex !== activeSectionIndex
      ) {
        const targetFrame = sectionStarts[closestSectionIndex];
        const targetScroll =
          ((targetFrame - 1) / (frameCount - 1)) *
          (document.documentElement.scrollHeight - window.innerHeight);

        const timeline = gsap.timeline({
          onComplete: () => {
            updateActiveDot(closestSectionIndex);
            activeSectionIndex = closestSectionIndex;
            if (dots[closestSectionIndex]) {
              animateLineToDot(dots[closestSectionIndex]);
            }
          },
        });

        timeline.to(
          imgSeq,
          {
            frame: targetFrame - 1,
            duration: 0.5,
            ease: "power2.inOut",
            snap: "frame",
            onUpdate: () => {
              imgSeq.frame = Math.round(imgSeq.frame);
              render();
            },
            overwrite: "auto",
          },
          0,
        );

        timeline.to(
          smoother,
          {
            scrollTop: targetScroll,
            duration: 0.5,
            ease: "power2.inOut",
            overwrite: "auto",
          },
          0,
        );
      }
    }

    // Init scroll animation
    const initAnimation = () => {
      if (!canvas) {
        console.error("Cannot initialize animation: #sequence canvas missing.");
        return;
      }

      let snapTimeout;

      gsap.to(imgSeq, {
        frame: frameCount - 1,
        snap: "frame",
        ease: "none",
        scrollTrigger: {
          scrub: 0.5,
          pin: "#sequence",
          trigger: "#sequence",
          end: "500%",
          onUpdate: (self) => {
            const instantProgress = clamp(
              0,
              1,
              (self.scroll() - self.start) / (self.end - self.start),
            );
            const currentFrame =
              Math.floor(instantProgress * (frameCount - 1)) + 1;

            // Calculate scroll velocity
            const now = Date.now();
            const timeDelta = now - lastScrollTime;
            if (timeDelta > 0) {
              const scrollDelta = Math.abs(self.scroll() - lastScrollTop);
              scrollVelocity = (scrollDelta / timeDelta) * 1000; // pixels per second
              lastScrollTime = now;
            }

            // Dynamic batch size: larger batch for faster scroll to preload more
            currentBatchSize = baseBatchSize + Math.floor(scrollVelocity / 10); // e.g., add 100 for every 1000 px/s
            currentBatchSize = clamp(
              baseBatchSize,
              baseBatchSize * 2,
              currentBatchSize,
            );

            // Determine quality for preload
            const preloadQuality = getQualityForFrame(currentFrame, true);
            preloadImages(
              currentFrame,
              currentFrame + currentBatchSize,
              preloadQuality,
            );

            // If slow or stopped, upgrade to hq around key frames
            clearTimeout(stopTimeout);
            if (scrollVelocity < stopThreshold) {
              stopTimeout = setTimeout(() => {
                upgradeToHQ(currentFrame);
              }, 200); // After 200ms of low velocity, upgrade
            }

            requestAnimationFrame(render);

            if (line && nav && !gsap.isTweening(line)) {
              line.style.height = `${getLineHeight(instantProgress)}px`;
            }

            if (!gsap.isTweening(smoother)) {
              let newSectionIndex = -1;
              if (dots.length > 0) {
                dots.forEach((dot, i) => {
                  const sectionFrame = sectionStarts[i];
                  const isDotActive =
                    currentFrame >= sectionFrame &&
                    currentFrame < sectionFrame + activeFrameRange;
                  const isPanelActive =
                    currentFrame >= sectionFrame &&
                    currentFrame <
                      Math.min(
                        sectionFrame + panelActiveFrameRange,
                        sectionEnds[i],
                      );

                  dot.classList.toggle("active", isDotActive);

                  if (panelStates[i] !== isPanelActive) {
                    animateSection(i, isPanelActive);
                  }

                  if (isDotActive) newSectionIndex = i;
                });
              }
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

              clearTimeout(snapTimeout);
              snapTimeout = setTimeout(() => {
                snapToNearestSection(currentFrame);
              }, 300);
            }
          },
        },
      });
    };

    // Animate line to dot position
    function animateLineToDot(dot) {
      if (!line || !dot || !nav) {
        console.warn("Cannot animate line: line, dot, or nav missing.");
        return;
      }

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

    // Dot click handlers
    if (dots.length > 0) {
      dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
          const section = parseInt(dot.dataset.section, 10);
          if (isNaN(section) || section < 0 || section >= sections) {
            console.warn(
              `Invalid data-section for dot ${index}: ${dot.dataset.section}`,
            );
            return;
          }
          const targetFrame = sectionStarts[section];
          const targetScroll =
            ((targetFrame - 1) / (frameCount - 1)) *
            (document.documentElement.scrollHeight - window.innerHeight);

          updateActiveDot(section);
          activeSectionIndex = section;

          gsap.to(imgSeq, {
            frame: targetFrame - 1,
            duration: 1,
            ease: "power2.inOut",
            onUpdate: render,
          });

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

    // Scroll button click handler
    if (scrollButton) {
      scrollButton.addEventListener("click", () => {
        let nextSection = activeSectionIndex + 1;
        if (nextSection >= sections) return;

        const targetFrame = sectionStarts[nextSection];
        const targetScroll =
          ((targetFrame - 1) / (frameCount - 1)) *
          (document.documentElement.scrollHeight - window.innerHeight);

        updateActiveDot(nextSection);
        activeSectionIndex = nextSection;

        gsap.to(imgSeq, {
          frame: targetFrame - 1,
          duration: 1,
          ease: "power2.inOut",
          onUpdate: render,
        });

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

        if (dots[nextSection]) {
          animateLineToDot(dots[nextSection]);
        }
      });
    }

    // Burger menu toggle and offcanvas navigation
    if (burger && offcanvasNav) {
      burger.addEventListener("click", () => {
        const isActive = burger.classList.contains("active");
        const offcanvasBar = offcanvasNav.querySelector(".offcanvas-bar");

        if (!offcanvasBar) {
          console.warn(".offcanvas-bar not found for burger menu.");
          return;
        }

        if (isActive) {
          burger.classList.remove("active");
          gsap.to(offcanvasBar, {
            left: "-250px",
            duration: 0.3,
            ease: "power2.inOut",
            onComplete: () => {
              offcanvasNav.classList.remove("open");
            },
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

        if (
          e.target === offcanvasNav ||
          e.target === offcanvasNav.querySelector(":before")
        ) {
          burger.classList.remove("active");
          gsap.to(offcanvasBar, {
            left: "-250px",
            duration: 0.3,
            ease: "power2.inOut",
            onComplete: () => {
              offcanvasNav.classList.remove("open");
            },
          });
        }
      });
    }

    // Detect scroll start/stop for scroll button and header visibility
    let scrollTimeout;
    let snapTimeout;
    const handleScroll = () => {
      const currentScrollTop = smoother.scrollTop();
      const isScrollingDown = currentScrollTop > lastScrollTop;

      if (header) {
        if (isScrollingDown && isHeaderVisible) {
          animateHeader(false);
        } else if (
          !isScrollingDown &&
          !isHeaderVisible &&
          currentScrollTop > 0
        ) {
          animateHeader(true);
        }
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
        } else {
          console.log("Not showing scroll button: on last section");
        }

        const instantProgress = clamp(
          0,
          1,
          smoother.scrollTop() /
            (document.documentElement.scrollHeight - window.innerHeight),
        );
        const currentFrame = Math.floor(instantProgress * (frameCount - 1)) + 1;
        snapTimeout = setTimeout(() => {
          snapToNearestSection(currentFrame);
        }, 300);
      }, 300);

      lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop;
    };

    ScrollTrigger.create({
      onUpdate: () => {
        handleScroll();
      },
    });

    window.addEventListener("scroll", handleScroll);

    // Intro animation with header slide-in
    const runIntro = () => {
      const dummy = { val: 0 };
      gsap.to(dummy, {
        val: 29,
        duration: 3,
        ease: "none",
        snap: "val",
        onUpdate: () => {
          const frameIndex = Math.floor(dummy.val);
          imgSeq.frame = introFrames[frameIndex] - 1;
          render();
        },
        onComplete: () => {
          if (header) {
            gsap.to(header, {
              y: 0,
              opacity: 1,
              duration: 0.8,
              ease: "power2.out",
            });
          }

          if (nav) {
            gsap.to(nav, {
              x: "-80px",
              opacity: 1,
              duration: 0.8,
              ease: "power2.out",
            });
          }

          const randomArtist = Math.floor(Math.random() * numberOfArtists);
          const endFrame1 =
            randomArtist < numberOfArtists - 1
              ? artistStarts[randomArtist + 1] - 1
              : sectionStarts[1] - 1;

          imgSeq.frame = endFrame1 - 1;
          render();

          if (scrollButton) {
            gsap.to(scrollButton, {
              opacity: 1,
              duration: 0.5,
              onStart: () => (scrollButton.style.display = "block"),
            });
          }

          initAnimation();
          activeSectionIndex = 0;
          updateActiveDot(0);
          animateSection(0, true);
          if (line && dotCenters[0]) {
            line.style.height = `${dotCenters[0]}px`;
          }
        },
      });
    };

    updateDotCenters();
    preloadImages(1, sectionStarts[1] - 1, getQualityForFrame(1)).then(() => {
      runIntro();
    });
    preloadImages(
      sectionStarts[1],
      currentBatchSize,
      getQualityForFrame(sectionStarts[1], true),
    );
  })();
});
