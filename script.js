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
const buffer = 20;

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

// Рендер кадру (завжди cover)
function render() {
  if (!images[imgSeq.frame]) return;

  const img = images[imgSeq.frame];
  context.clearRect(0, 0, canvas.width, canvas.height);

  const canvasRatio = canvas.width / canvas.height;
  const imgRatio = img.width / img.height;

  let drawWidth, drawHeight, offsetX, offsetY;

  // Завжди cover
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

// GSAP анімація
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
        const currentFrame = Math.floor(
          self.progress * (frameCount - 1)
        ) + 1;

        preloadImages(currentFrame, currentFrame + batchSize);
        requestAnimationFrame(render);

        // Визначаємо секцію
        const sectionIndex = Math.floor(currentFrame / sectionFrames);
        const sectionStart = sectionIndex * sectionFrames;
        const sectionMiddle = sectionStart + sectionFrames / 2;

        const inBuffer =
          currentFrame >= sectionMiddle - buffer &&
          currentFrame <= sectionMiddle + buffer;

        document.querySelectorAll(".dot").forEach((dot, i) => {
          dot.classList.toggle("active", i === sectionIndex && inBuffer);
        });

        const line = document.querySelector("#nav-dots .line");
        if (line) line.style.height = `${self.progress * 100}%`;
      },
    },
  });
};

// Навігація по точках
document.querySelectorAll(".dot").forEach((dot) => {
  dot.addEventListener("click", () => {
    const section = parseInt(dot.dataset.section, 10);
    const targetFrame = section * sectionFrames;

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
    });
  });
});

// Старт
preloadImages(1, batchSize);
initAnimation();
