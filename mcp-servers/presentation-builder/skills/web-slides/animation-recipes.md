# Animation Recipes

Ready-to-paste CSS/JS snippets for advanced slide effects.

---

## 1. Typewriter Effect (for quotes or title slides)

```css
.typewriter {
  overflow: hidden;
  white-space: nowrap;
  border-right: 3px solid var(--accent-1);
  width: 0;
  animation: typing 2s steps(40, end) 0.5s forwards,
             blink 0.8s step-end infinite;
}
@keyframes typing { to { width: 100%; } }
@keyframes blink  { 50% { border-color: transparent; } }
```

## 2. Count-Up Number (for stat slides)

```javascript
function countUp(el, target, duration = 1500) {
  let start = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    start += step;
    el.textContent = Math.floor(start).toLocaleString();
    if (start >= target) {
      el.textContent = target.toLocaleString();
      clearInterval(timer);
    }
  }, 16);
}
// Call when slide becomes active:
// countUp(document.querySelector('.stat-number'), 94700);
```

## 3. Blur-in Reveal

```css
@keyframes blurIn {
  from { filter: blur(12px); opacity: 0; transform: scale(1.04); }
  to   { filter: blur(0);    opacity: 1; transform: scale(1); }
}
.blur-reveal { animation: blurIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
```

## 4. Slide-from-Right

```css
@keyframes slideRight {
  from { transform: translateX(60px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
```

## 5. Scale Pop

```css
@keyframes scalePop {
  0%   { transform: scale(0.7); opacity: 0; }
  70%  { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}
```

## 6. Gradient Mesh Background (animated)

```css
.animated-bg {
  background: linear-gradient(135deg, var(--bg-primary), var(--bg-secondary));
  background-size: 400% 400%;
  animation: meshShift 12s ease infinite;
}
@keyframes meshShift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

## 7. Floating Orb (decorative background element)

```css
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.18;
  animation: float 8s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-30px) scale(1.05); }
}
```

## 8. Progress Bar Update

```javascript
function updateProgress() {
  const pct = ((current + 1) / slides.length) * 100;
  document.querySelector('.progress-fill').style.width = pct + '%';
  document.querySelector('.slide-counter').textContent =
    `${current + 1} / ${slides.length}`;
}
```

## 9. Staggered Card Entrance

```css
.card-grid .card {
  opacity: 0;
  transform: translateY(30px) scale(0.96);
}
.slide.active .card-grid .card {
  animation: cardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.slide.active .card-grid .card:nth-child(1) { animation-delay: 0.1s; }
.slide.active .card-grid .card:nth-child(2) { animation-delay: 0.2s; }
.slide.active .card-grid .card:nth-child(3) { animation-delay: 0.3s; }

@keyframes cardIn {
  to { opacity: 1; transform: translateY(0) scale(1); }
}
```

## 10. Swipe Gesture (mobile)

```javascript
let touchStartX = 0;
document.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
document.addEventListener('touchend', e => {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) > 50) goTo(current + (delta < 0 ? 1 : -1));
});
```
