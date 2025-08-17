gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const canvas = document.getElementById("sequence");
const context = canvas.getContext("2d");

const resizeCanvas = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const frameCount = 2191;
const currentFrame = (index) =>
  `images/${index.toString().padStart(4, "0")}.webp`;

const images = new Array(frameCount).fill(null);
const imgSeq = { frame: 0 };
const batchSize = 1000;
let lastLoadedFrame = 0;

// Секції
const sections = 5;
const sectionFrames = Math.floor(frameCount / sections);
const activeFrameRange = 100;

// Ліниве завантаження
const preloadImages = (start, end) => {
  start = Math.max(1, start);
  end = Math.min(end, frameCount);
  for (let i = start; i <= end; i++) {
    if (!images[i - 1]) {
      const img = new Image();
      img.src = currentFrame(i);
      img.onload = () => {
        if (i === 1) render();
      };
      img.onerror = () => console.error(`Failed to load image ${i}`);
      images[i - 1] = img;
    }
  }
  lastLoadedFrame = Math.max(lastLoadedFrame, end);
};

// Рендер кадру
function render() {
  if (!images[imgSeq.frame]) return;

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
}

// Анімація появи секції
function animateSection(sectionIndex) {
  const panels = document.querySelectorAll(".panel");
  panels.forEach((panel, i) => {
    if (i === sectionIndex) {
      gsap.to(panel, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: "power2.out",
        onStart: () => panel.classList.add("active"),
      });
    } else {
      gsap.to(panel, {
        opacity: 0,
        y: 50,
        duration: 0.5,
        ease: "power2.out",
        onComplete: () => panel.classList.remove("active"),
      });
    }
  });
}

// GSAP анімація скролу
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

        preloadImages(currentFrame, currentFrame + batchSize);
        requestAnimationFrame(render);

        const line = document.querySelector("#nav-dots .line");
        const nav = document.querySelector("#nav-dots");
        if (line && nav && !gsap.isTweening(line)) {
          const navHeight = nav.offsetHeight;
          line.style.height = `${self.progress * navHeight}px`;
        }

        if (!gsap.isTweening(window)) {
          const navHeight = nav.offsetHeight;
          const lineHeight = self.progress * navHeight;

          document.querySelectorAll(".dot").forEach((dot, i) => {
            const dotRect = dot.getBoundingClientRect();
            const navRect = nav.getBoundingClientRect();
            const dotCenter = dotRect.top + dotRect.height / 2 - navRect.top;

            const dotFrame = (dotCenter / navHeight) * (frameCount - 1);
            const isActive =
              currentFrame >= dotFrame &&
              currentFrame < dotFrame + activeFrameRange;

            dot.classList.toggle("active", isActive);

            // Синхронізація секцій
            if (isActive) {
              animateSection(i);
            }
          });
        }
      },
    },
  });
};

// Анімація лінії до dot
function animateLineToDot(dot) {
  const line = document.querySelector("#nav-dots .line");
  const nav = document.querySelector("#nav-dots");
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

// Оновлення active стану точок
function updateActiveDot(sectionIndex) {
  document.querySelectorAll(".dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === sectionIndex);
  });
}

// Навігація по точках
document.querySelectorAll(".dot").forEach((dot) => {
  dot.addEventListener("click", () => {
    const section = parseInt(dot.dataset.section, 10);
    const targetFrame = section * sectionFrames;

    updateActiveDot(section);
    animateSection(section);

    gsap.to(imgSeq, {
      frame: targetFrame,
      duration: 1,
      ease: "power2.inOut",
      onUpdate: render,
    });

    gsap.to(window, {
      scrollTo: {
        y: (targetFrame / frameCount) * ScrollTrigger.maxScroll(window),
      },
      duration: 1,
      ease: "power2.inOut",
      onComplete: () => {
        updateActiveDot(section);
      },
    });

    animateLineToDot(dot);
  });
});

// Старт
preloadImages(1, batchSize);
initAnimation();