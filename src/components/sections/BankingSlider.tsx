import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Building2, Landmark } from 'lucide-react';

const slides = [
  {
    img: '/images/hero/branded/slide-01-banking-hall.jpg',
    label: 'Wexfordfin Grand Banking Hall',
    caption: 'Step into marble-clad halls designed around you — where every Wexfordfin client is received like a private-banking guest.',
    tag: 'Banking Halls',
    icon: Landmark,
  },
  {
    img: '/images/hero/branded/slide-02-banking-lobby.jpg',
    label: 'Wexfordfin Banking Lobby',
    caption: 'Bright, welcoming client lounges where Wexfordfin advisors help you plan every next step — in person or online.',
    tag: 'Banking Halls',
    icon: Landmark,
  },
  {
    img: '/images/hero/branded/slide-03-global-hq.jpg',
    label: 'Wexfordfin Global HQ',
    caption: 'A global headquarters built for scale — the engineering heart behind every instant Wexfordfin transfer.',
    tag: 'Our Buildings',
    icon: Building2,
  },
  {
    img: '/images/hero/branded/slide-04-heritage.jpg',
    label: 'Wexfordfin Heritage Building',
    caption: 'Where classical architecture meets modern banking — a heritage of trust, rebuilt for the digital age.',
    tag: 'Our Buildings',
    icon: Building2,
  },
  {
    img: '/images/hero/branded/slide-05-tower-night.jpg',
    label: 'Wexfordfin Tower — Night',
    caption: 'From dawn to midnight and beyond, Wexfordfin keeps watch over your money — 24/7, without pause.',
    tag: 'Our Buildings',
    icon: Building2,
  },
];

export function BankingSlider() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = slides.length;

  const next = useCallback(() => setCurrent((p) => (p + 1) % total), [total]);
  const prev = useCallback(() => setCurrent((p) => (p - 1 + total) % total), [total]);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(next, 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, next]);

  const slide = slides[current];

  return (
    <section className="banking-slider-section py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Section header */}
        <div className="mb-12 text-center">
          <span className="banking-slider-tag inline-block rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase mb-3">
            Our Spaces
          </span>
          <h2 className="banking-slider-heading font-heading text-3xl font-extrabold tracking-tight md:text-4xl text-balance">
            Where Tradition Meets Innovation
          </h2>
          <p className="banking-slider-sub mx-auto mt-3 max-w-2xl text-base text-pretty">
            Step inside Wexfordfin — from grand banking halls to iconic headquarters buildings
            — all built to serve you with excellence.
          </p>
        </div>

        {/* Main slider */}
        <div
          className="banking-slider-frame relative overflow-hidden rounded-3xl shadow-2xl"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Images */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, scale: 1.04, x: 40 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.97, x: -40 }}
              transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-full"
            >
              <img
                src={slide.img}
                alt={slide.label}
                className="w-full object-cover banking-slider-img"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 banking-slider-overlay" />

              {/* Caption */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="absolute bottom-0 left-0 right-0 p-6 md:p-10"
              >
                <span className="banking-slider-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-3">
                  <slide.icon className="h-3.5 w-3.5" />
                  {slide.tag}
                </span>
                <h3 className="banking-slider-caption-title font-heading text-xl md:text-2xl font-bold text-white">
                  {slide.label}
                </h3>
                <p className="banking-slider-caption-body mt-1 max-w-xl text-sm leading-relaxed text-white/80">
                  {slide.caption}
                </p>
              </motion.div>
            </motion.div>
          </AnimatePresence>

          {/* Prev / Next buttons */}
          <button
            onClick={() => { prev(); setPaused(true); }}
            aria-label="Previous slide"
            className="banking-slider-arrow absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => { next(); setPaused(true); }}
            aria-label="Next slide"
            className="banking-slider-arrow absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 h-[3px] banking-slider-progress-bg">
            {!paused && (
              <motion.div
                key={current}
                className="h-full banking-slider-progress-bar"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 4.5, ease: 'linear' }}
              />
            )}
          </div>
        </div>

        {/* Thumbnail dots + counter */}
        <div className="mt-8 flex items-center justify-center gap-3">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => { setCurrent(i); setPaused(true); }}
              aria-label={`Go to slide ${i + 1}`}
              className="relative overflow-hidden rounded-xl transition-all duration-300"
              style={{
                width: i === current ? 72 : 48,
                height: 40,
              }}
            >
              <img
                src={s.img}
                alt={s.label}
                className="w-full h-full object-cover transition-opacity duration-300"
                style={{ opacity: i === current ? 1 : 0.45 }}
              />
              {i === current && (
                <div className="absolute inset-0 rounded-xl banking-slider-thumb-active-ring" />
              )}
            </button>
          ))}

          <span className="banking-slider-counter ml-4 text-sm font-semibold tabular-nums">
            {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
        </div>
      </div>
    </section>
  );
}
