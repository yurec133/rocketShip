(function () {
  function Trail(x, y, hue) {
    this.x = x;
    this.y = y;
    this.radius = 60;
    this.opacity = 0.05;
    this.hue = hue;
  }

  Trail.prototype.update = function () {
    this.radius += 0.5;
    this.opacity -= 0.002;
    return this.opacity > 0;
  };

  Trail.prototype.draw = function (ctx) {
    ctx.beginPath();
    const gradient = ctx.createRadialGradient(
      this.x,
      this.y,
      0,
      this.x,
      this.y,
      this.radius,
    );
    gradient.addColorStop(0, `hsla(${this.hue}, 90%, 65%, ${this.opacity})`);
    gradient.addColorStop(
      0.5,
      `hsla(${(this.hue + 60) % 360}, 80%, 60%, ${this.opacity * 0.8})`,
    );
    gradient.addColorStop(1, `hsla(${(this.hue + 120) % 360}, 70%, 55%, 0)`);
    ctx.fillStyle = gradient;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  };

  function initCursorTrail() {
    const canvas = document.getElementById("oilCanvas");
    const ctx = canvas.getContext("2d");
    const blurLayer = document.getElementById("blurLayer");
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    let trails = [];
    let hue = 100;
    let lastX = null;
    let lastY = null;
    let lastTrailTime = 0;
    const trailThrottle = 16; // ~60 FPS

    function createCursorTrail(e) {
      const x = e.clientX;
      const y = e.clientY;

      blurLayer.style.setProperty("--x", `${x}px`);
      blurLayer.style.setProperty("--y", `${y}px`);

      if (lastX !== null && lastY !== null) {
        const dx = x - lastX;
        const dy = y - lastY;
        const distance = Math.hypot(dx, dy);
        if (distance < 5) return;
        const steps = Math.min(5, Math.ceil(distance / 10));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const xi = lastX + dx * t + (Math.random() * 2 - 1);
          const yi = lastY + dy * t + (Math.random() * 2 - 1);
          trails.push(new Trail(xi, yi, hue));
        }
      }
      lastX = x;
      lastY = y;
    }

    function animateCursorTrail() {
      ctx.clearRect(0, 0, width, height);
      trails = trails.filter((t) => t.update());
      trails.forEach((t) => t.draw(ctx));
      hue = (hue + 0.3) % 360;
      requestAnimationFrame(animateCursorTrail);
    }

    window.addEventListener("mousemove", (e) => {
      const now = performance.now();
      if (now - lastTrailTime < trailThrottle) return;
      lastTrailTime = now;
      createCursorTrail(e);
    });

    window.addEventListener("resize", () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    });

    animateCursorTrail();
  }

  initCursorTrail();
})();
