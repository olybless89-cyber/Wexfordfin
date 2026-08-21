import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ShieldCheck, TrendingUp, CreditCard, ChevronLeft, ChevronRight } from 'lucide-react';

const bgSlides = [
  { img: '/images/hero/branded/slide-01-banking-hall.jpg', label: 'Wexfordfin Grand Banking Hall' },
  { img: '/images/hero/branded/slide-02-banking-lobby.jpg', label: 'Wexfordfin Banking Lobby' },
  { img: '/images/hero/branded/slide-03-global-hq.jpg', label: 'Wexfordfin Global HQ' },
  { img: '/images/hero/branded/slide-04-heritage.jpg', label: 'Wexfordfin Heritage Building' },
  { img: '/images/hero/branded/slide-05-tower-night.jpg', label: 'Wexfordfin Tower — Night' },
];

export function Hero() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = bgSlides.length;

  const next = useCallback(() => setCurrent((p) => (p + 1) % total), [total]);
  const prev = useCallback(() => setCurrent((p) => (p - 1 + total) % total), [total]);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(next, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, next]);

  return (
    <section
      id="hero"
      className="relative overflow-hidden min-h-screen flex items-center pt-16 md:pt-20"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Sliding background images ── */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence mode="sync">
          <motion.div
            key={current}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 1.1, ease: [0.32, 0.72, 0, 1] }}
          >
            <img
              src={bgSlides[current].img}
              alt={bgSlides[current].label}
              className="w-full h-full object-cover"
            />
            {/* Large WEXFORDFIN watermark — bottom-left on every slide */}
            <div className="pointer-events-none absolute inset-0 flex items-end justify-start p-5 md:p-14">
              <span
                className="font-heading font-extrabold tracking-[0.18em] text-white/20 select-none uppercase leading-none"
                style={{ fontSize: 'clamp(1.8rem, 7vw, 5.5rem)' }}
              >
                WEXFORDFIN
              </span>
            </div>
            {/* Top-right logo badge */}
            <div className="pointer-events-none absolute top-20 right-4 md:right-10 flex items-center gap-2 opacity-60">
              <ShieldCheck className="h-5 w-5 md:h-6 md:w-6 text-white" />
              <span className="font-heading text-sm md:text-base font-bold tracking-widest text-white uppercase">
                Wexfordfin
              </span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Dark overlay so text remains readable */}
        <div className="absolute inset-0 hero-bg-overlay" />
        {/* Bottom fade into white landing sections */}
        <div className="absolute bottom-0 left-0 right-0 h-32 hero-bg-fade" />
      </div>

      {/* ── Auto-advance progress bar ── */}
      <div className="absolute top-0 left-0 right-0 z-20 h-[3px] bg-white/10">
        {!paused && (
          <motion.div
            key={current}
            className="h-full bg-white/70"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 5, ease: 'linear' }}
          />
        )}
      </div>

      {/* ── Slide nav arrows — hidden on small phones, show on sm+ ── */}
      <button
        onClick={() => { prev(); setPaused(true); }}
        aria-label="Previous slide"
        className="hero-arrow-btn absolute left-2 sm:left-4 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full transition-all duration-200"
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>
      <button
        onClick={() => { next(); setPaused(true); }}
        aria-label="Next slide"
        className="hero-arrow-btn absolute right-2 sm:right-4 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full transition-all duration-200"
      >
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>

      {/* ── Slide dots ── */}
      <div className="absolute bottom-10 sm:bottom-12 left-1/2 z-20 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2">
        {bgSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); setPaused(true); }}
            aria-label={`Slide ${i + 1}`}
            className="transition-all duration-300 rounded-full"
            style={{
              width: i === current ? 24 : 7,
              height: 7,
              background: i === current ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
            }}
          />
        ))}
      </div>

      {/* ── Foreground: Hero copy ── */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-16 sm:py-20 md:px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-4 md:mb-5 text-xs font-bold tracking-[0.25em] uppercase text-white/80"
        >
          Simple, Quick, Secured
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.1 }}
          className="font-heading text-3xl sm:text-4xl font-extrabold leading-[1.12] tracking-tight text-white md:text-6xl lg:text-7xl text-balance drop-shadow-[0_2px_24px_rgba(0,0,0,0.5)]"
        >
          Transfer Money Across<br className="hidden sm:block" />
          {' '}The World{' '}
          <span className="hero-accent-text">In Real Time</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.22 }}
          className="mx-auto mt-5 md:mt-6 max-w-xl text-base md:text-lg font-light leading-relaxed text-white/70 tracking-wide text-pretty"
        >
          Trusted by millions. Built for everyone.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.34 }}
          className="mt-8 md:mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href="/register"
            className="hero-cta-primary group inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-8 py-4 text-sm font-bold transition-all duration-200"
          >
            Online Banking
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#features"
            className="hero-cta-outline inline-flex w-full sm:w-auto items-center justify-center gap-3 rounded-lg px-7 py-4 text-sm font-semibold transition-all duration-200"
          >
            <span className="hero-cta-play flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/70">
              <svg viewBox="0 0 16 16" fill="white" className="h-3 w-3 ml-0.5">
                <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
              </svg>
            </span>
            Learn More
          </a>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.48 }}
          className="mt-10 md:mt-12 flex flex-wrap items-center justify-center gap-4 md:gap-6"
        >
          {[
            { icon: ShieldCheck, label: 'FDIC Insured' },
            { icon: TrendingUp, label: 'Up to 4.50% APY' },
            { icon: CreditCard, label: 'Zero Fees' },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Icon className="h-3.5 w-3.5 text-white/60" />
              {label}
            </span>
          ))}
        </motion.div>

        {/* Current slide label */}
        <motion.p
          key={current}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="mt-6 md:mt-8 text-xs font-medium tracking-widest uppercase text-white/40"
        >
          {bgSlides[current].label}
        </motion.p>
      </div>
    </section>
  );
}
