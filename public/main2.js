const typewriterEl = document.getElementById('typewriter');
if (typewriterEl && typeof Typewriter !== 'undefined') {
  new Typewriter(typewriterEl, { loop: true, delay: 75 })
    .typeString('Semillero de Talento')
    .pauseFor(200)
    .start();
}

const btnTop = document.getElementById("btn-top");

if (btnTop) {
  window.addEventListener("scroll", () => {
    if (window.scrollY > 280) {
      btnTop.style.display = "flex";
    } else {
      btnTop.style.display = "none";
    }
  });

  btnTop.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
