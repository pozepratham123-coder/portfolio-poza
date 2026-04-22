/**
 * main.js — Controls all the interactive behaviour on every page
 *
 * This file handles three things:
 *   1. The navigation bar changing appearance when you scroll down
 *   2. The hamburger menu opening/closing on mobile
 *   3. Smooth scrolling when you click anchor links (e.g. #contact)
 *   4. "Scroll reveal" — elements fade in as you scroll past them
 *   5. The dark/light mode toggle button
 *
 * Everything is wrapped in an IIFE (Immediately Invoked Function Expression)
 * — that just means the code runs straight away and keeps its variables
 * private so they don't clash with other scripts.
 */

(function () {
    'use strict'; // Strict mode — catches common JS mistakes early

    // ─────────────────────────────────────────────
    // 1. NAV SCROLL EFFECT
    // When the user scrolls more than 50px down,
    // we add the class "scrolled" to the nav bar.
    // The CSS then makes the nav background more opaque.
    // ─────────────────────────────────────────────

    const nav = document.getElementById('nav'); // Grab the <nav> element

    function handleScroll() {
        const scrollY = window.scrollY; // How many pixels the page has been scrolled

        if (scrollY > 50) {
            nav.classList.add('scrolled');    // User scrolled down — darken nav
        } else {
            nav.classList.remove('scrolled'); // Back at top — keep nav transparent
        }
    }

    // { passive: true } tells the browser this listener won't call preventDefault()
    // which lets the browser optimise scrolling performance
    window.addEventListener('scroll', handleScroll, { passive: true });


    // ─────────────────────────────────────────────
    // 2. MOBILE HAMBURGER MENU
    // On small screens the nav links are hidden.
    // Clicking the ☰ button toggles them open/closed.
    // ─────────────────────────────────────────────

    const navToggle = document.getElementById('navToggle'); // The ☰ button
    const navLinks  = document.getElementById('navLinks');  // The <ul> of links

    if (navToggle && navLinks) {

        // Toggle the menu open/closed when ☰ is clicked
        navToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('active');  // CSS shows/hides the menu
            navToggle.classList.toggle('active'); // Animates the ☰ into an ✕
            // Add/remove body class so CSS can hide WebGL canvases
            // (WebGL bypasses z-index via GPU compositing and bleeds through overlays)
            document.body.classList.toggle('menu-open', isOpen);
        });

        // Helper to close the sidebar
        function closeMenu() {
            navLinks.classList.remove('active');
            navToggle.classList.remove('active');
            document.body.classList.remove('menu-open');
        }

        // Close when any nav link is clicked
        navLinks.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', closeMenu);
        });

        // Close when tapping the dimmed backdrop (body::before)
        document.addEventListener('click', (e) => {
            if (document.body.classList.contains('menu-open') &&
                !navLinks.contains(e.target) &&
                !navToggle.contains(e.target)) {
                closeMenu();
            }
        });
    }


    // ─────────────────────────────────────────────
    // 3. SMOOTH SCROLL FOR ANCHOR LINKS
    // Links like <a href="#contact"> jump to a section.
    // This code makes that jump smooth instead of instant,
    // and also accounts for the fixed nav bar height.
    // ─────────────────────────────────────────────

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href'); // e.g. "#contact"
            if (targetId === '#') return; // Ignore bare # links

            const targetEl = document.querySelector(targetId); // Find the section
            if (targetEl) {
                e.preventDefault(); // Stop the default instant jump

                // Calculate position: section top minus nav height so the nav
                // doesn't overlap the section heading
                const navHeight = nav ? nav.offsetHeight : 0;
                const targetPos = targetEl.getBoundingClientRect().top + window.scrollY - navHeight;

                window.scrollTo({ top: targetPos, behavior: 'smooth' });
            }
        });
    });


    // ─────────────────────────────────────────────
    // 4. SCROLL REVEAL
    // Elements with the class "reveal" start invisible (opacity 0, shifted down).
    // When they enter the viewport, we add "visible" which fades them in.
    // IntersectionObserver watches elements and fires a callback when they
    // enter or leave the visible area — much more efficient than listening
    // to scroll events for this.
    // ─────────────────────────────────────────────

    const revealElements = document.querySelectorAll('.reveal');

    if (revealElements.length > 0) {
        const revealObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {          // Element entered the screen
                        entry.target.classList.add('visible'); // Trigger the CSS animation
                        revealObserver.unobserve(entry.target); // Stop watching it — saves memory
                    }
                });
            },
            {
                threshold: 0.1,             // Fire when 10% of the element is visible
                rootMargin: '0px 0px -60px 0px' // Trigger slightly before the very bottom edge
            }
        );

        revealElements.forEach(el => revealObserver.observe(el)); // Start watching each element
    }


    // ─────────────────────────────────────────────
    // 5. AUTO-UPDATE FOOTER YEAR
    // Instead of hard-coding "2025" in the HTML,
    // we replace it with the current year automatically.
    // ─────────────────────────────────────────────

    const footerYear = document.querySelector('.footer-text');
    if (footerYear) {
        const year = new Date().getFullYear();
        footerYear.textContent = footerYear.textContent.replace('2025', year);
    }


    // ─────────────────────────────────────────────
    // 6. DARK / LIGHT MODE TOGGLE
    // The toggle button switches between dark and light theme.
    // We store the user's preference in localStorage so it
    // persists across page loads and visits.
    // The sun icon shows in dark mode (click to go light).
    // The moon icon shows in light mode (click to go dark).
    // ─────────────────────────────────────────────

    const themeToggle = document.getElementById('themeToggle');
    const sunIcon     = document.querySelector('.sun-icon');
    const moonIcon    = document.querySelector('.moon-icon');

    if (themeToggle) {
        // On load, read which theme is currently active and show the right icon
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        if (currentTheme === 'dark') {
            sunIcon.style.display  = 'block'; // Dark mode → show sun (to switch to light)
            moonIcon.style.display = 'none';
        } else {
            sunIcon.style.display  = 'none';
            moonIcon.style.display = 'block'; // Light mode → show moon (to switch to dark)
        }

        // When the button is clicked, flip the theme
        themeToggle.addEventListener('click', () => {
            const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
            const newTheme = isDark ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', newTheme); // Apply instantly
            localStorage.setItem('theme', newTheme); // Remember for next visit

            if (newTheme === 'dark') {
                sunIcon.style.display  = 'block';
                moonIcon.style.display = 'none';
            } else {
                sunIcon.style.display  = 'none';
                moonIcon.style.display = 'block';
            }
        });
    }

})();
