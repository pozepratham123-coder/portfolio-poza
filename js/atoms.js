/**
 * atoms.js — Visual Effects
 *
 * This file creates two independent visual effects:
 *
 *  1. THREE.JS BLACK HOLE (right side of the hero section)
 *     Uses WebGL (3D graphics in the browser) via the Three.js library
 *     to render an interactive spinning black hole with:
 *     - A dark singularity (the black sphere in the centre)
 *     - A photon ring (glowing edge around the sphere)
 *     - An accretion disk (the flat rotating ring, like Saturn's rings)
 *     The user can click and drag to rotate it.
 *
 *  2. PARTICLE BACKGROUND (the floating dots across the whole page)
 *     Uses the HTML5 Canvas 2D API to draw and animate particles that:
 *     - Float around the page slowly
 *     - React to the mouse (repel when you hover, attract when you click)
 *     - Connect nearby particles with faint lines
 *     - Get pulled toward the black hole position on screen
 *
 * Everything is wrapped in an IIFE so variables stay private.
 */

(function () {
    'use strict';

    // Check if the user has "Reduce Motion" enabled in their OS.
    // If they do, we skip the particle animation entirely.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


    // ─────────────────────────────────────────────
    // MOUSE / TOUCH TRACKING
    //
    // We track the cursor position globally so both the black hole
    // and particle systems can react to it.
    //
    // mouse.vx / mouse.vy = velocity (how fast the cursor is moving)
    // This lets us "throw" particles when you release a click.
    // ─────────────────────────────────────────────

    const mouse = {
        x: -1000, y: -1000,   // Current position (starts off-screen)
        px: -1000, py: -1000, // Previous position (used to calculate velocity)
        vx: 0, vy: 0,         // Velocity (current minus previous position)
        down: false           // Whether the mouse button is held down
    };

    // Update mouse position and calculate velocity on every move
    document.addEventListener('mousemove', (e) => {
        mouse.px = mouse.x;  // Save previous position
        mouse.py = mouse.y;
        mouse.x = e.clientX; // Update to new position
        mouse.y = e.clientY;
        mouse.vx = mouse.x - mouse.px; // Velocity = distance moved since last frame
        mouse.vy = mouse.y - mouse.py;
    });

    document.addEventListener('mousedown', () => mouse.down = true);
    document.addEventListener('mouseup',   () => mouse.down = false);

    // When the cursor leaves the browser window, move it off-screen
    // so particles stop reacting to a ghost position
    document.addEventListener('mouseleave', () => {
        mouse.x = -1000;
        mouse.y = -1000;
    });

    // ── Touch support (same logic, but for fingers on mobile) ──

    document.addEventListener('touchmove', (e) => {
        const t = e.touches[0]; // First finger
        mouse.px = mouse.x;
        mouse.py = mouse.y;
        mouse.x = t.clientX;
        mouse.y = t.clientY;
        mouse.vx = mouse.x - mouse.px;
        mouse.vy = mouse.y - mouse.py;
    }, { passive: true }); // passive: true = better scroll performance on mobile

    document.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        mouse.x = t.clientX;
        mouse.y = t.clientY;
        mouse.down = true;
    }, { passive: true });

    document.addEventListener('touchend', () => { mouse.down = false; });


    // ═══════════════════════════════════════════════
    // 1. THREE.JS BLACK HOLE
    //
    // Three.js is a library that wraps WebGL (the browser's 3D engine).
    // The key concepts:
    //   - Scene:    A container that holds all 3D objects
    //   - Camera:   The "eye" that looks into the scene
    //   - Renderer: Converts the scene to pixels and draws on the <canvas>
    //   - Mesh:     A 3D object = Geometry (shape) + Material (appearance)
    //   - Group:    A parent container for multiple meshes (move them together)
    // ═══════════════════════════════════════════════

    const threeContainer = document.getElementById('threeHeroCanvas');

    // Only run if the container exists AND Three.js loaded successfully
    if (threeContainer && window.THREE) {

        // ── Scene, Camera, Renderer setup ──

        const scene = new THREE.Scene(); // Empty 3D world

        // PerspectiveCamera(fov, aspect, near, far)
        // fov = field of view in degrees (45 = natural, human-like)
        // aspect = width / height ratio of the canvas
        // near/far = objects closer than 0.1 or farther than 1000 units are clipped
        const camera = new THREE.PerspectiveCamera(
            45,
            threeContainer.clientWidth / (threeContainer.clientHeight || 1),
            0.1,
            1000
        );
        camera.position.z = 6.8; // Move camera back 6.8 units so we can see the scene

        // WebGLRenderer draws the 3D scene onto a <canvas> element
        // alpha: true = transparent background (shows our site background)
        // antialias: true = smooth edges instead of jagged pixels
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

        // Handle case where container has zero size on first load
        const w = threeContainer.clientWidth  || 300;
        const h = threeContainer.clientHeight || 300;
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio || 1); // Crisp on Retina displays
        threeContainer.appendChild(renderer.domElement); // Add the <canvas> to the page

        // OrbitControls — lets the user click and drag to rotate the black hole
        // dampingFactor = how much "friction" slows rotation after releasing
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping  = true;
        controls.dampingFactor  = 0.05;
        controls.enableZoom     = false; // Disable scroll-to-zoom
        controls.enablePan      = false; // Disable panning

        // Restrict how far up/down the user can rotate
        // (prevents flipping upside down)
        controls.minPolarAngle = Math.PI / 4;
        controls.maxPolarAngle = Math.PI / 1.5;


        // ── SINGULARITY (the black sphere in the centre) ──
        // SphereGeometry(radius, widthSegments, heightSegments)
        // More segments = smoother sphere, but more processing
        const singularityGeo = new THREE.SphereGeometry(1.1, 32, 32);
        const singularityMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Pure black
        const singularity    = new THREE.Mesh(singularityGeo, singularityMat);


        // ── PHOTON RING (the glowing edge/halo around the black sphere) ──
        // This uses a custom GLSL shader — a small program that runs on the GPU.
        // The shader creates a "rim light" effect: brighter at edges, dark in centre.
        const photonRingGeo = new THREE.SphereGeometry(1.14, 32, 32);

        const photonRingShader = {
            // Vertex shader: runs once per vertex (corner of a triangle).
            // It calculates where each point goes on screen.
            // vNormal is the surface direction at each point — passed to fragment shader.
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            // Fragment shader: runs once per pixel.
            // It calculates the colour of each pixel.
            // The dot product of vNormal and (0,0,1) measures how much
            // each face points toward the camera — edges point least toward
            // camera so they get the highest intensity (rim glow).
            fragmentShader: `
                varying vec3 vNormal;
                void main() {
                    float intensity = pow(1.0 - abs(dot(vNormal, vec3(0, 0, 1.0))), 2.5);
                    gl_FragColor = vec4(0.45, 0.88, 0.94, intensity * 2.0); // Cyan glow at edges
                }
            `
        };

        const photonRingMat = new THREE.ShaderMaterial({
            vertexShader:   photonRingShader.vertexShader,
            fragmentShader: photonRingShader.fragmentShader,
            transparent:    true,
            blending:       THREE.AdditiveBlending, // Bright where colours overlap
            side:           THREE.BackSide,         // Render the inside of the sphere
            depthWrite:     false                   // Don't block objects behind it
        });

        const photonRing = new THREE.Mesh(photonRingGeo, photonRingMat);


        // ── ACCRETION DISK (the flat ring around the black hole) ──
        // RingGeometry(innerRadius, outerRadius, thetaSegments, phiSegments)
        const diskGeo = new THREE.RingGeometry(1.25, 2.5, 64, 16);

        // "uniforms" are variables passed from JS into the shader.
        // They update every frame so the shader can animate over time.
        const diskUniforms = {
            u_time:      { value: 0 },              // Elapsed time (seconds)
            u_cameraPos: { value: camera.position }, // Camera position for lighting
            u_darkMode:  { value: document.documentElement.getAttribute('data-theme') === 'dark' ? 1.0 : 0.0 }
        };

        const diskShader = {
            vertexShader: `
                varying vec3 vLocalPos;
                varying vec3 vWorldPosition;
                void main() {
                    vLocalPos = position;
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform float u_time;
                uniform vec3  u_cameraPos;
                uniform float u_darkMode;
                varying vec3  vLocalPos;
                varying vec3  vWorldPosition;

                // Dark mode colour palette
                vec3 dm_hotWhite = vec3(0.85, 0.92, 1.0);
                vec3 dm_cyan     = vec3(0.45, 0.88, 0.94);
                vec3 dm_purple   = vec3(0.48, 0.39, 1.0);
                vec3 dm_indigo   = vec3(0.36, 0.30, 1.0);

                // Light mode colour palette (dark navy tones so the disk
                // stays visible on a white background)
                vec3 lm_hotWhite = vec3(0.22, 0.20, 0.55);
                vec3 lm_cyan     = vec3(0.12, 0.22, 0.68);
                vec3 lm_purple   = vec3(0.35, 0.10, 0.60);
                vec3 lm_indigo   = vec3(0.18, 0.08, 0.48);

                void main() {
                    // radius goes 0.0 at inner edge to 1.0 at outer edge
                    float dist   = length(vLocalPos.xy);
                    float radius = clamp((dist - 1.25) / 1.25, 0.0, 1.0);

                    // ── Ring bands: distinct bright/dark rings like Saturn ──
                    // smoothstep(edge0, edge1, x) — smooth 0→1 transition between edges
                    float rings = 0.0;
                    float band1 = smoothstep(0.0,  0.04, radius) * smoothstep(0.22, 0.12, radius); rings += band1 * 1.0;
                    float band2 = smoothstep(0.24, 0.28, radius) * smoothstep(0.58, 0.48, radius); rings += band2 * 0.9;
                    float band3 = smoothstep(0.62, 0.65, radius) * smoothstep(0.80, 0.72, radius); rings += band3 * 0.6;
                    float band4 = smoothstep(0.84, 0.87, radius) * smoothstep(0.98, 0.92, radius); rings += band4 * 0.3;

                    // Fine detail: tiny ripples using fract() to repeat a pattern
                    float fineDetail = smoothstep(0.35, 0.55, fract(radius * 40.0)) * 0.15 + 0.85;
                    rings *= fineDetail;

                    // Mix between light and dark palette based on current theme
                    vec3 hotWhite = mix(lm_hotWhite, dm_hotWhite, u_darkMode);
                    vec3 cyan     = mix(lm_cyan,     dm_cyan,     u_darkMode);
                    vec3 purple   = mix(lm_purple,   dm_purple,   u_darkMode);
                    vec3 indigo   = mix(lm_indigo,   dm_indigo,   u_darkMode);

                    // Colour gradient from inner (hot/bright) to outer (dark/indigo)
                    vec3 diskColor = mix(hotWhite, cyan,   smoothstep(0.0,  0.25, radius));
                    diskColor      = mix(diskColor, purple, smoothstep(0.25, 0.65, radius));
                    diskColor      = mix(diskColor, indigo, smoothstep(0.65, 1.0,  radius));
                    diskColor     += hotWhite * band1 * 0.5; // Extra brightness at inner edge

                    // ── Doppler beaming ──
                    // Real accretion disks appear brighter on the side moving toward you.
                    // We fake this by checking if the tangent velocity points toward the camera.
                    vec3  camDir    = normalize(u_cameraPos - vWorldPosition);
                    vec3  tangent   = normalize(vec3(-vLocalPos.y, vLocalPos.x, 0.0));
                    float doppler   = dot(camDir, tangent);
                    float brightness = 1.0 + doppler * 0.7;

                    gl_FragColor = vec4(diskColor * brightness * 1.2, rings * (0.85 + doppler * 0.3));
                }
            `
        };

        const accretionDiskMat = new THREE.ShaderMaterial({
            vertexShader:   diskShader.vertexShader,
            fragmentShader: diskShader.fragmentShader,
            uniforms:       diskUniforms,
            transparent:    true,
            blending:       THREE.AdditiveBlending,
            side:           THREE.DoubleSide, // Render both front and back of the ring
            depthWrite:     false
        });

        const accretionDisk = new THREE.Mesh(diskGeo, accretionDiskMat);
        // By default the ring is vertical — rotate it flat (like a table top)
        accretionDisk.rotation.x = -Math.PI / 2;

        // Group all three parts together so we can move/rotate them as one unit
        const blackHoleGroup = new THREE.Group();
        blackHoleGroup.add(singularity);
        blackHoleGroup.add(photonRing);
        blackHoleGroup.add(accretionDisk);

        // Tilt the whole group so the ring is seen at an angle (not perfectly flat)
        blackHoleGroup.rotation.x = Math.PI * 0.15;
        blackHoleGroup.rotation.z = -Math.PI * 0.1;

        scene.add(blackHoleGroup); // Add the group to the scene

        // ── Resize handler ──
        // When the browser window resizes, we update the renderer size
        // and camera aspect ratio to match
        window.addEventListener('resize', () => {
            if (!threeContainer) return;
            const rw = threeContainer.clientWidth;
            const rh = threeContainer.clientHeight;
            if (rw > 0 && rh > 0) {
                renderer.setSize(rw, rh);
                camera.aspect = rw / rh;
                camera.updateProjectionMatrix(); // Must call this after changing aspect
            }
        });

        // THREE.Clock tracks elapsed time since it was created
        let clock = new THREE.Clock();

        // ── Animation loop ──
        // requestAnimationFrame tells the browser to call our function
        // before the next repaint — usually 60 times per second.
        // This creates a smooth animation loop.
        function animate() {
            requestAnimationFrame(animate);

            const time = clock.getElapsedTime(); // Seconds since start

            // Gently float the black hole up and down using a sine wave
            // Math.sin oscillates between -1 and 1 over time
            blackHoleGroup.position.y = Math.sin(time * 1.5) * 0.15;

            // Very slow continuous rotation
            blackHoleGroup.rotation.y = time * 0.03;

            // Update shader uniforms so the disk animation stays in sync
            diskUniforms.u_time.value = time;
            diskUniforms.u_cameraPos.value.copy(camera.position);

            // Update dark mode flag every frame so the disk colour switches
            // immediately when the user toggles the theme
            diskUniforms.u_darkMode.value =
                document.documentElement.getAttribute('data-theme') === 'dark' ? 1.0 : 0.0;

            controls.update();               // Apply damping to orbit controls
            renderer.render(scene, camera);  // Draw everything
        }

        animate(); // Start the loop
    }


    // ═══════════════════════════════════════════════
    // 2. INTERACTIVE PARTICLE BACKGROUND
    //
    // We use the HTML5 2D Canvas API here — simpler than WebGL,
    // good enough for 2D drawing. Every frame we:
    //   1. Clear the canvas
    //   2. Update each particle's physics (position, velocity)
    //   3. Draw each particle (circle + optional glow)
    //   4. Draw lines between nearby particles
    //   5. Draw lines from particles to the mouse cursor
    // ═══════════════════════════════════════════════

    const bgCanvas = document.getElementById('particleBg');

    // Skip if reduced motion is preferred or if the canvas element doesn't exist
    if (bgCanvas && !prefersReducedMotion) {

        const bgCtx = bgCanvas.getContext('2d'); // Get the 2D drawing context
        let bgW, bgH; // Canvas width and height (updated on resize)

        // Screen coordinates of the black hole centre
        // (so particles can be pulled toward it)
        let bhScreenX = -1000;
        let bhScreenY = -1000;

        // Resize the canvas to fill the screen.
        // We multiply by devicePixelRatio for crisp rendering on Retina/HiDPI screens
        function resizeBg() {
            const dpr = window.devicePixelRatio || 1;
            bgW = window.innerWidth;
            bgH = window.innerHeight;
            bgCanvas.width  = bgW * dpr;
            bgCanvas.height = bgH * dpr;
            bgCanvas.style.width  = bgW + 'px';
            bgCanvas.style.height = bgH + 'px';
            bgCtx.scale(dpr, dpr); // Scale drawing context to match DPR
            updateBHScreenCoords();
        }

        // Calculate where the black hole appears on screen.
        // getBoundingClientRect() returns an element's position relative
        // to the viewport (the visible area of the browser).
        function updateBHScreenCoords() {
            const threeContainer = document.getElementById('threeHeroCanvas');
            if (threeContainer) {
                const rect = threeContainer.getBoundingClientRect();
                bhScreenX = rect.left + rect.width  / 2; // Centre X
                bhScreenY = rect.top  + rect.height / 2; // Centre Y
            }
        }

        // Update black hole coordinates when the user scrolls
        // (the canvas is fixed but the Three.js container scrolls with the page)
        window.addEventListener('scroll', updateBHScreenCoords, { passive: true });

        resizeBg();
        window.addEventListener('resize', resizeBg);


        // ── Atom (Particle) class ──
        // Each particle is an instance of this class.
        // "class" is ES6 syntax for a blueprint/template for objects.
        class Atom {

            constructor(x, y) {
                // Starting position
                this.x = x;
                this.y = y;

                // Random starting velocity — small random number in each direction
                // Math.random() returns 0–1, so (Math.random() - 0.5) gives -0.5 to 0.5
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;

                // Random size between 2 and 5 pixels
                this.baseSize = 2 + Math.random() * 3;
                this.size     = this.baseSize;
                this.mass     = this.baseSize; // Bigger particles feel heavier

                this.grabbed  = false;   // Whether the mouse is holding this particle
                this.friction = 0.985;   // Velocity multiplier per frame (slows movement)
                this.opacity  = 0.15 + Math.random() * 0.25; // Random transparency

                // Randomly assign one of four brand colours
                const colorChoice = Math.random();
                if (colorChoice < 0.35) {
                    this.color = '91, 76, 255';   // Indigo
                } else if (colorChoice < 0.65) {
                    this.color = '122, 99, 255';  // Purple
                } else if (colorChoice < 0.85) {
                    this.color = '79, 125, 245';  // Blue
                } else {
                    this.color = '116, 224, 239'; // Cyan
                }
            }

            // update() runs every frame and handles physics
            update() {
                // ── Mouse interaction ──
                const dx   = mouse.x - this.x;
                const dy   = mouse.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy); // Distance to cursor
                const interactRadius = 150;

                if (dist < interactRadius && dist > 0) {
                    // force is 1.0 when cursor is right on top, 0.0 at the edge of range
                    const force = (interactRadius - dist) / interactRadius;

                    if (mouse.down) {
                        // Click held: attract particle toward cursor
                        this.vx += (dx / dist) * force * 0.8;
                        this.vy += (dy / dist) * force * 0.8;
                        this.size  = this.baseSize * (1 + force * 0.8); // Grow when attracted
                        this.grabbed = true;
                    } else {
                        // Hover only: gently push particle away
                        this.vx -= (dx / dist) * force * 0.3;
                        this.vy -= (dy / dist) * force * 0.3;
                        this.size  = this.baseSize * (1 + force * 0.3);
                        this.grabbed = false;
                    }
                } else {
                    // Out of range: gradually return to base size
                    this.size   += (this.baseSize - this.size) * 0.1;
                    this.grabbed = false;
                }

                // ── Black hole gravity ──
                // Particles within 450px of the black hole get pulled toward it
                // and orbit it slightly (swirl effect)
                if (bhScreenX !== -1000 && bhScreenY !== -1000) {
                    const bhDx   = bhScreenX - this.x;
                    const bhDy   = bhScreenY - this.y;
                    const bhDist = Math.sqrt(bhDx * bhDx + bhDy * bhDy);
                    const eventHorizonPullRange = 450;

                    if (bhDist < eventHorizonPullRange && bhDist > 30) {
                        // gravForce is stronger closer to the black hole (squared curve)
                        const gravForce = Math.pow(
                            (eventHorizonPullRange - bhDist) / eventHorizonPullRange, 2.0
                        );

                        // Swirl vector: perpendicular to the gravity direction
                        // This makes particles orbit rather than just fall straight in
                        const swirlX = -bhDy / bhDist;
                        const swirlY =  bhDx / bhDist;

                        this.vx += (bhDx / bhDist) * gravForce * 0.3 + swirlX * gravForce * 0.2;
                        this.vy += (bhDy / bhDist) * gravForce * 0.3 + swirlY * gravForce * 0.2;
                        this.size = this.baseSize * (1 + gravForce * 0.6);

                        // Heavy drag near the core — particles slow down as they approach
                        const proximityDamping = 1.0 - gravForce * 0.6;
                        this.vx *= proximityDamping;
                        this.vy *= proximityDamping;

                        // Mark as "grabbed" (glowing) when very close to the black hole
                        if (bhDist < 120) {
                            this.grabbed = true;
                        }
                    }
                }

                // ── Throw on release ──
                // When the mouse button is released, particles inherit the
                // cursor's velocity so they fly in the direction you were moving
                if (this.grabbed && !mouse.down) {
                    this.vx += mouse.vx * 0.5;
                    this.vy += mouse.vy * 0.5;
                }

                // Apply friction (slow down a tiny bit each frame)
                this.vx *= this.friction;
                this.vy *= this.friction;

                // Move particle
                this.x += this.vx;
                this.y += this.vy;

                // Soft bounce off screen edges — reverse velocity and dampen
                if (this.x < 0)   { this.x = 0;   this.vx *= -0.5; }
                if (this.x > bgW) { this.x = bgW;  this.vx *= -0.5; }
                if (this.y < 0)   { this.y = 0;    this.vy *= -0.5; }
                if (this.y > bgH) { this.y = bgH;  this.vy *= -0.5; }
            }

            // draw() renders the particle as a circle on the canvas
            draw(ctx) {
                // Faster particles appear more opaque
                const speed         = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                const dynamicOpacity = Math.min(this.opacity + speed * 0.05, 0.7);

                // ── Glow effect ──
                // A radial gradient goes from coloured centre to transparent edge.
                // We only draw it when the particle is moving or grabbed
                // (saves drawing lots of invisible gradients each frame)
                if (speed > 0.5 || this.grabbed) {
                    const glowSize = this.size * (3 + speed * 0.5);
                    const glow = ctx.createRadialGradient(
                        this.x, this.y, 0,         // Inner circle: at particle centre, radius 0
                        this.x, this.y, glowSize   // Outer circle: same centre, larger radius
                    );
                    glow.addColorStop(0, `rgba(${this.color}, ${dynamicOpacity * 0.5})`);
                    glow.addColorStop(1, `rgba(${this.color}, 0)`); // Fades to transparent
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, glowSize, 0, Math.PI * 2); // Full circle
                    ctx.fill();
                }

                // ── Core dot ──
                ctx.fillStyle = `rgba(${this.color}, ${dynamicOpacity})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ── Create all particles ──
        // Fewer particles on small screens/screens (calculated from screen area)
        const atoms = [];
        const count = Math.min(60, Math.floor((bgW * bgH) / 18000));
        for (let i = 0; i < count; i++) {
            atoms.push(new Atom(
                Math.random() * bgW, // Random X across the screen
                Math.random() * bgH  // Random Y across the screen
            ));
        }

        // Max distance between two particles for a connecting line to be drawn
        const connectionDist = 120;

        // ── Main draw loop ──
        function drawBg() {
            bgCtx.clearRect(0, 0, bgW, bgH); // Wipe the canvas clean each frame

            // Clip out the 3D canvas region so 2D particles don't bleed through
            // the transparent WebGL scene background (alpha: true on the renderer).
            // evenodd fill rule: the outer rect = draw; inner rect = punch hole.
            bgCtx.save();
            if (threeContainer) {
                const r = threeContainer.getBoundingClientRect();
                bgCtx.beginPath();
                bgCtx.rect(0, 0, bgW, bgH);                    // Full canvas — draw here
                bgCtx.rect(r.left, r.top, r.width, r.height);  // 3D area — exclude this
                bgCtx.clip('evenodd');
            }

            // Update physics and draw each particle
            atoms.forEach(atom => {
                atom.update();
                atom.draw(bgCtx);
            });

            // ── Draw lines between nearby particles ──
            // We compare every pair (i, j) — nested loops.
            // Starting j at i+1 avoids drawing the same line twice.
            for (let i = 0; i < atoms.length; i++) {
                for (let j = i + 1; j < atoms.length; j++) {
                    const dx   = atoms[i].x - atoms[j].x;
                    const dy   = atoms[i].y - atoms[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < connectionDist) {
                        // Lines closer together are more opaque
                        const opacity = 0.06 * (1 - dist / connectionDist);

                        // Lines between fast-moving particles are more visible
                        const speed = Math.sqrt(
                            atoms[i].vx ** 2 + atoms[i].vy ** 2 +
                            atoms[j].vx ** 2 + atoms[j].vy ** 2
                        );
                        const boostedOpacity = Math.min(opacity + speed * 0.01, 0.2);

                        bgCtx.strokeStyle = `rgba(91, 76, 255, ${boostedOpacity})`;
                        bgCtx.lineWidth   = 0.5;
                        bgCtx.beginPath();
                        bgCtx.moveTo(atoms[i].x, atoms[i].y);
                        bgCtx.lineTo(atoms[j].x, atoms[j].y);
                        bgCtx.stroke();
                    }
                }
            }

            // ── Draw lines from particles to the mouse cursor ──
            // Creates a "web" effect when you hover over the particles
            if (mouse.x > 0 && mouse.y > 0) {
                atoms.forEach(atom => {
                    const dx   = mouse.x - atom.x;
                    const dy   = mouse.y - atom.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 200) {
                        const opacity = 0.1 * (1 - dist / 200); // Fade out with distance
                        bgCtx.strokeStyle = `rgba(122, 99, 255, ${opacity})`;
                        bgCtx.lineWidth   = 0.8;
                        bgCtx.beginPath();
                        bgCtx.moveTo(atom.x, atom.y);
                        bgCtx.lineTo(mouse.x, mouse.y);
                        bgCtx.stroke();
                    }
                });
            }

            bgCtx.restore(); // Remove the clipping path for the next frame
            requestAnimationFrame(drawBg); // Schedule next frame
        }

        drawBg(); // Start the loop
    }

})();
