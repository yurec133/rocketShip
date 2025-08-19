(function () {
  "use strict";

  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

  // Constants
  const canvas = document.getElementById("sequence");
  const context = canvas.getContext("2d");
  const frameCount = 2191;
  const sections = 6;
  const numberOfArtists = 10;
  const activeFrameRange = 100; // Range for dot active class
  const panelActiveFrameRange = 200; // Extended range for panels
  const batchSize = 1000;

  // Custom section starts (1-based frame indices)
  const sectionStarts = [1, 164, 637, 1135, 1397, 2191];

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

  // Cached elements
  const dots = document.querySelectorAll(".dot");
  const panels = document.querySelectorAll(".panel");
  const line = document.querySelector("#nav-dots .line");
  const nav = document.querySelector("#nav-dots");
  const scrollButton = document.getElementById("scrollTop");

  // State
  const images = new Array(frameCount).fill(null);
  const imgSeq = { frame: 0, lastRenderedFrame: -1 };
  let lastLoadedFrame = 0;
  let activeSectionIndex = -1;
  const panelStates = new Array(sections).fill(false);
  let dotCenters = [];

  // Resize canvas and update dot centers
  const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  const updateDotCenters = () => {
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

  // Frame URL generator
  const currentFrame = (index) =>
    `images/${index.toString().padStart(4, "0")}.webp`;

  // Async preload images in batch
  const preloadImages = async (start, end) => {
    start = Math.max(1, start);
    end = Math.min(end, frameCount);
    const promises = [];
    for (let i = start; i <= end; i++) {
      if (!images[i - 1]) {
        const img = new Image();
        img.src = currentFrame(i);
        promises.push(
          new Promise((resolve, reject) => {
            img.onload = () => {
              images[i - 1] = img;
              if (i - 1 === imgSeq.frame) render(); // Render if current frame loaded
              resolve();
            };
            img.onerror = () => {
              console.error(`Failed to load image ${i}`);
              reject();
            };
          }),
        );
      }
    }
    await Promise.all(promises);
    lastLoadedFrame = Math.max(lastLoadedFrame, end);
  };

  // Render frame (only if changed and loaded)
  function render() {
    if (!images[imgSeq.frame] || imgSeq.frame === imgSeq.lastRenderedFrame)
      return;

    const img = images[imgSeq.frame];
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

    const children = panel.querySelectorAll(".panel > *"); // Cache children once per call

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
      gsap.to(children, {
        opacity: 0,
        y: "-20vh",
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.in",
      });
    }
  }

  // Update active dots and panels (for click)
  function updateActiveDot(sectionIndex) {
    dots.forEach((dot, i) => {
      const isActive = i === sectionIndex;
      dot.classList.toggle("active", isActive);
      animateSection(i, isActive);
    });
  }

  // Calculate line height based on progress
  function getLineHeight(progress) {
    const progressPoints = sectionStarts.map((s) => (s - 1) / (frameCount - 1));
    for (let i = 0; i < sections - 1; i++) {
      if (progress >= progressPoints[i] && progress < progressPoints[i + 1]) {
        const frac =
          (progress - progressPoints[i]) /
          (progressPoints[i + 1] - progressPoints[i]);
        return dotCenters[i] + frac * (dotCenters[i + 1] - dotCenters[i]);
      }
    }
    return dotCenters[sections - 1];
  }

  // Init scroll animation
  const initAnimation = () => {
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
          const currentFrame = Math.floor(self.progress * (frameCount - 1)) + 1;
          preloadImages(currentFrame, currentFrame + batchSize); // Async, non-blocking
          requestAnimationFrame(render);

          if (line && nav && !gsap.isTweening(line)) {
            line.style.height = `${getLineHeight(self.progress)}px`;
          }

          if (!gsap.isTweening(window)) {
            let newSectionIndex = -1;
            dots.forEach((dot, i) => {
              const sectionFrame = sectionStarts[i];
              const isDotActive =
                currentFrame >= sectionFrame &&
                currentFrame < sectionFrame + activeFrameRange;
              const isPanelActive =
                currentFrame >= sectionFrame &&
                currentFrame < sectionFrame + panelActiveFrameRange;

              dot.classList.toggle("active", isDotActive);

              if (panelStates[i] !== isPanelActive) {
                animateSection(i, isPanelActive);
              }

              if (isDotActive) newSectionIndex = i;
            });
            activeSectionIndex = newSectionIndex;
          }
        },
      },
    });
  };

  // Animate line to dot position
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

  // Dot click handlers
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const section = parseInt(dot.dataset.section, 10);
      const targetFrame = sectionStarts[section];

      updateActiveDot(section);
      activeSectionIndex = section;

      gsap.to(imgSeq, {
        frame: targetFrame - 1,
        duration: 1,
        ease: "power2.inOut",
        onUpdate: render,
      });

      gsap.to(window, {
        scrollTo: {
          y:
            ((targetFrame - 1) / (frameCount - 1)) *
            (document.documentElement.scrollHeight - window.innerHeight),
        },
        duration: 1,
        ease: "power2.inOut",
        onComplete: () => updateActiveDot(section),
      });

      animateLineToDot(dot);
    });
  });

  // Scroll button click handler
  scrollButton.addEventListener("click", () => {
    let nextSection = activeSectionIndex + 1;
    if (nextSection >= sections) return; // Don't loop, or set to 0 if needed

    const targetFrame = sectionStarts[nextSection];

    updateActiveDot(nextSection);
    activeSectionIndex = nextSection;

    gsap.to(imgSeq, {
      frame: targetFrame - 1,
      duration: 1,
      ease: "power2.inOut",
      onUpdate: render,
    });

    gsap.to(window, {
      scrollTo: {
        y:
          ((targetFrame - 1) / (frameCount - 1)) *
          (document.documentElement.scrollHeight - window.innerHeight),
      },
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

    animateLineToDot(dots[nextSection]);
  });

  // Detect scroll start/stop for scroll button visibility
  let scrollTimeout;
  window.addEventListener("scroll", () => {
    // Only show scroll button if not on the last section
    if (activeSectionIndex === sections - 1) {
      gsap.to(scrollButton, {
        opacity: 0,
        duration: 0.3,
        onComplete: () => {
          scrollButton.style.display = "none";
        },
      });
      return;
    }

    gsap.to(scrollButton, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        scrollButton.style.display = "none";
      },
    });

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      // Only show scroll button if not on the last section
      if (activeSectionIndex !== sections - 1) {
        gsap.to(scrollButton, {
          opacity: 1,
          duration: 0.3,
          onStart: () => {
            scrollButton.style.display = "block";
          },
        });
      }
    }, 600); // Show after 600ms of no scrolling
  });

  // Intro animation
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
        // Select random artist
        const randomArtist = Math.floor(Math.random() * numberOfArtists);
        const startFrame1 = artistStarts[randomArtist];
        const endFrame1 =
          randomArtist < numberOfArtists - 1
            ? artistStarts[randomArtist + 1] - 1
            : sectionStarts[1] - 1;
        const frameLength = endFrame1 - startFrame1 + 1;
        const videoDuration = frameLength / 30; // 30 FPS

        gsap.to(imgSeq, {
          frame: endFrame1 - 1,
          duration: videoDuration,
          ease: "none",
          onStart: () => {
            imgSeq.frame = startFrame1 - 1;
            render();
            // Show scroll button at the start of full video (31st frame effectively)
            gsap.to(scrollButton, {
              opacity: 1,
              duration: 0.5,
              onStart: () => (scrollButton.style.display = "block"),
            });
          },
          onUpdate: render,
          onComplete: () => {
            // Reset to home start
            imgSeq.frame = 0;
            render();
            // Enable scrolling
            document.body.classList.remove("no-scroll");
            // Initialize scroll animation
            initAnimation();
            // Set initial section
            activeSectionIndex = 0;
            updateActiveDot(0);
            animateSection(0, true);
            line.style.height = `${dotCenters[0]}px`;
          },
        });
      },
    });
  };

  // Start
  document.body.classList.add("no-scroll");
  updateDotCenters();
  preloadImages(1, sectionStarts[1] - 1).then(() => {
    runIntro();
  });
  preloadImages(sectionStarts[1], batchSize);
})();
