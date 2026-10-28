'use client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register once; importing from here (not 'gsap') guarantees the plugin is ready.
if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger);

export const EASE = 'power3.out';
export { gsap, ScrollTrigger };
