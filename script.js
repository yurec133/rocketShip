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
const activeFrameRange = 100; // Діапазон для класу active на точках
const panelActiveFrameRange = 200; // Розширений діапазон для панелей
let activeSectionIndex = -1; // Для відстеження поточної активної секції
const panelStates = new Array(sections).fill(false); // Відстежуємо стан кожної панелі

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

// Анімація появи/зникнення секції
function animateSection(sectionIndex, isActive) {
  const panels = document.querySelectorAll(".panel");
  const panel = panels[sectionIndex];
  if (!panel) return;

  // Якщо стан не змінився, пропускаємо анімацію
  if (panelStates[sectionIndex] === isActive) return;

  panelStates[sectionIndex] = isActive; // Оновлюємо стан
  gsap.killTweensOf(panel); // Завершуємо попередні анімації

  if (isActive) {
    gsap.fromTo(
      panel,
      { opacity: 0, y: "10vh", scale: 0.95, rotation: 1 }, // Поява знизу з легким обертанням
      {
        opacity: 1,
        y: 0,
        scale: 1,
        rotation: 0,
        duration: 0.8, // Трохи швидше для динаміки
        ease: "power3.out", // Кастомний easing для "пружного" ефекту
        onStart: () => panel.classList.add("active"),
      }
    );

    // Анімація дочірніх елементів із затримкою
    const children = panel.querySelectorAll(".panel > *");
    gsap.fromTo(
      children,
      { opacity: 0, y: "20vh" },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.1, // Затримка 0.1с між елементами
        ease: "power2.out",
        delay: 0.2, // Початок після основної анімації
      }
    );
  } else {
    gsap.to(panel, {
      opacity: 0,
      y: "-25vh", // Зникнення вгору, адаптивне до висоти екрана
      scale: 0.95,
      rotation: -1, // Легке обертання для зникнення
      filter: "blur(5px)", // Додаємо розмиття
      duration: 0.8, // Трохи швидше
      ease: "power3.in", // Плавніше зникнення
      onComplete: () => {
        panel.classList.remove("active");
        gsap.set(panel, { filter: "blur(0px)" }); // Скидаємо розмиття
      },
    });

    // Зникнення дочірніх елементів
    const children = panel.querySelectorAll(".panel > *");
    gsap.to(children, {
      opacity: 0,
      y: '-20vh',
      duration: 0.6,
      stagger: 0.1,
      ease: "power2.in",
    });
  }
}

// Оновлення active стану точок і панелей
function updateActiveDot(sectionIndex) {
  document.querySelectorAll(".dot").forEach((dot, i) => {
    const isActive = i === sectionIndex;
    dot.classList.toggle("active", isActive);
    animateSection(i, isActive); // При кліку анімація негайна
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
          let newSectionIndex = -1;

          document.querySelectorAll(".dot").forEach((dot, i) => {
            const dotRect = dot.getBoundingClientRect();
            const navRect = nav.getBoundingClientRect();
            const dotCenter = dotRect.top + dotRect.height / 2 - navRect.top;

            const dotFrame = (dotCenter / navHeight) * (frameCount - 1);

            // Діапазон для класу active на точці
            const isDotActive =
              currentFrame >= dotFrame &&
              currentFrame < dotFrame + activeFrameRange;

            // Розширений діапазон для видимості панелі
            const isPanelActive =
              currentFrame >= dotFrame &&
              currentFrame < dotFrame + panelActiveFrameRange;

            // Оновлюємо клас active для точки
            dot.classList.toggle("active", isDotActive);

            // Викликаємо анімацію лише якщо стан панелі змінився
            if (panelStates[i] !== isPanelActive) {
              animateSection(i, isPanelActive);
            }

            if (isDotActive) {
              newSectionIndex = i;
            }
          });

          activeSectionIndex = newSectionIndex;
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

// Навігація по точках
document.querySelectorAll(".dot").forEach((dot) => {
  dot.addEventListener("click", () => {
    const section = parseInt(dot.dataset.section, 10);
    const targetFrame = section * sectionFrames;

    // Оновлюємо активну точку та панелі
    updateActiveDot(section);
    activeSectionIndex = section;

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