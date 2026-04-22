/**
 * Atomic Visualization
 * Canvas-based atom graphic + interactive physics particles
 */

(function () {
    'use strict';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Mouse tracking (global) ──
    const mouse = { x: -1000, y: -1000, px: -1000, py: -1000, vx: 0, vy: 0, down: false };

    document.addEventListener('mousemove', (e) => {
        mouse.px = mouse.x;
        mouse.py = mouse.y;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.vx = mouse.x - mouse.px;
        mouse.vy = mouse.y - mouse.py;
    });
    document.addEventListener('mousedown', () => mouse.down = true);
    document.addEventListener('mouseup', () => mouse.down = false);
    document.addEventListener('mouseleave', () => { mouse.x = -1000; mouse.y = -1000; });

    // Touch support
    document.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        mouse.px = mouse.x;
        mouse.py = mouse.y;
        mouse.x = t.clientX;
        mouse.y = t.clientY;
        mouse.vx = mouse.x - mouse.px;
        mouse.vy = mouse.y - mouse.py;
    }, { passive: true });
    document.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        mouse.x = t.clientX;
        mouse.y = t.clientY;
        mouse.down = true;
    }, { passive: true });
    document.addEventListener('touchend', () => { mouse.down = false; });

    // ── Three.js Hero Canvas ──
    const threeContainer = document.getElementById('threeHeroCanvas');
    if (threeContainer && window.THREE) {
        // Scene setup
        const scene = new THREE.Scene();
        
        // Camera setup
        const camera = new THREE.PerspectiveCamera(45, threeContainer.clientWidth / (threeContainer.clientHeight || 1), 0.1, 1000);
        camera.position.z = 6.8;
        
        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        
        // Support when the container has zero height at init
        const w = threeContainer.clientWidth || 300;
        const h = threeContainer.clientHeight || 300;
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        threeContainer.appendChild(renderer.domElement);
        
        // Orbit controls (click + drag revolving)
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = false;
        controls.enablePan = false;
        // Restrict vertical rotation slightly
        controls.minPolarAngle = Math.PI / 4;
        controls.maxPolarAngle = Math.PI / 1.5;
        
        // ── 3D Black Hole Setup ──

        const singularityGeo = new THREE.SphereGeometry(1.1, 32, 32);
        const singularityMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const singularity = new THREE.Mesh(singularityGeo, singularityMat);

        // Photon Ring (Glowing edge around singularity)
        const photonRingGeo = new THREE.SphereGeometry(1.14, 32, 32);
        const photonRingShader = {
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                void main() {
                    // Rim lighting effect
                    float intensity = pow(1.0 - abs(dot(vNormal, vec3(0, 0, 1.0))), 2.5);
                    gl_FragColor = vec4(0.45, 0.88, 0.94, intensity * 2.0); // Cyan glow
                }
            `
        };
        const photonRingMat = new THREE.ShaderMaterial({
            vertexShader: photonRingShader.vertexShader,
            fragmentShader: photonRingShader.fragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false
        });
        const photonRing = new THREE.Mesh(photonRingGeo, photonRingMat);

        // Accretion Disk (Saturn-like crisp rings)
        const diskGeo = new THREE.RingGeometry(1.25, 2.5, 64, 16);
        
        const diskUniforms = {
            u_time:     { value: 0 },
            u_cameraPos: { value: camera.position },
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

                // Dark mode colors (unchanged)
                vec3 dm_hotWhite = vec3(0.85, 0.92, 1.0);
                vec3 dm_cyan     = vec3(0.45, 0.88, 0.94);
                vec3 dm_purple   = vec3(0.48, 0.39, 1.0);
                vec3 dm_indigo   = vec3(0.36, 0.30, 1.0);

                // Light mode colors — dark navy + deep purple
                vec3 lm_hotWhite = vec3(0.22, 0.20, 0.55);  // deep indigo near-white
                vec3 lm_cyan     = vec3(0.12, 0.22, 0.68);  // dark cobalt blue  #1f38ad
                vec3 lm_purple   = vec3(0.35, 0.10, 0.60);  // deep purple       #591699
                vec3 lm_indigo   = vec3(0.18, 0.08, 0.48);  // very dark indigo  #2e147a

                void main() {
                    float dist   = length(vLocalPos.xy);
                    float radius = clamp((dist - 1.25) / 1.25, 0.0, 1.0);

                    // ── Ring bands ──
                    float rings = 0.0;
                    float band1 = smoothstep(0.0,  0.04, radius) * smoothstep(0.22, 0.12, radius); rings += band1 * 1.0;
                    float band2 = smoothstep(0.24, 0.28, radius) * smoothstep(0.58, 0.48, radius); rings += band2 * 0.9;
                    float band3 = smoothstep(0.62, 0.65, radius) * smoothstep(0.80, 0.72, radius); rings += band3 * 0.6;
                    float band4 = smoothstep(0.84, 0.87, radius) * smoothstep(0.98, 0.92, radius); rings += band4 * 0.3;
                    float fineDetail = smoothstep(0.35, 0.55, fract(radius * 40.0)) * 0.15 + 0.85;
                    rings *= fineDetail;

                    // ── Choose palette based on mode ──
                    vec3 hotWhite = mix(lm_hotWhite, dm_hotWhite, u_darkMode);
                    vec3 cyan     = mix(lm_cyan,     dm_cyan,     u_darkMode);
                    vec3 purple   = mix(lm_purple,   dm_purple,   u_darkMode);
                    vec3 indigo   = mix(lm_indigo,   dm_indigo,   u_darkMode);

                    // Color gradient: inner hot → cyan → purple → indigo
                    vec3 diskColor = mix(hotWhite, cyan,   smoothstep(0.0,  0.25, radius));
                    diskColor      = mix(diskColor, purple, smoothstep(0.25, 0.65, radius));
                    diskColor      = mix(diskColor, indigo, smoothstep(0.65, 1.0,  radius));
                    diskColor     += hotWhite * band1 * 0.5;

                    // Doppler beaming
                    vec3  camDir    = normalize(u_cameraPos - vWorldPosition);
                    vec3  tangent   = normalize(vec3(-vLocalPos.y, vLocalPos.x, 0.0));
                    float doppler   = dot(camDir, tangent);
                    float brightness = 1.0 + doppler * 0.7;

                    gl_FragColor = vec4(diskColor * brightness * 1.2, rings * (0.85 + doppler * 0.3));
                }
            `
        };

        const accretionDiskMat = new THREE.ShaderMaterial({
            vertexShader: diskShader.vertexShader,
            fragmentShader: diskShader.fragmentShader,
            uniforms: diskUniforms,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const accretionDisk = new THREE.Mesh(diskGeo, accretionDiskMat);
        // Align horizontally
        accretionDisk.rotation.x = -Math.PI / 2;
        
        const blackHoleGroup = new THREE.Group();
        blackHoleGroup.add(singularity);
        blackHoleGroup.add(photonRing);
        blackHoleGroup.add(accretionDisk);
        
        // Add tilt
        blackHoleGroup.rotation.x = Math.PI * 0.15;
        blackHoleGroup.rotation.z = -Math.PI * 0.1;
        scene.add(blackHoleGroup);

        // Resize handler
        window.addEventListener('resize', () => {
            if (!threeContainer) return;
            const rw = threeContainer.clientWidth;
            const rh = threeContainer.clientHeight;
            if(rw > 0 && rh > 0){
                renderer.setSize(rw, rh);
                camera.aspect = rw / rh;
                camera.updateProjectionMatrix();
            }
        });

        let clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);
            
            const time = clock.getElapsedTime();
                // Continuous smooth rotation and float effect
                blackHoleGroup.position.y = Math.sin(time * 1.5) * 0.15;
                // Slowly spin the whole system
                blackHoleGroup.rotation.y = time * 0.03;
                // Update shader uniforms
                diskUniforms.u_time.value = time;
                diskUniforms.u_cameraPos.value.copy(camera.position);
                diskUniforms.u_darkMode.value = document.documentElement.getAttribute('data-theme') === 'dark' ? 1.0 : 0.0;
            controls.update();
            renderer.render(scene, camera);
        }
        
        animate();
    }

    // ── Interactive Physics Particles (Full Page) ──

    const bgCanvas = document.getElementById('particleBg');
    if (bgCanvas && !prefersReducedMotion) {
        const bgCtx = bgCanvas.getContext('2d');
        let bgW, bgH;
        
        let bhScreenX = -1000;
        let bhScreenY = -1000;

        function resizeBg() {
            const dpr = window.devicePixelRatio || 1;
            bgW = window.innerWidth;
            bgH = window.innerHeight;
            bgCanvas.width = bgW * dpr;
            bgCanvas.height = bgH * dpr;
            bgCanvas.style.width = bgW + 'px';
            bgCanvas.style.height = bgH + 'px';
            bgCtx.scale(dpr, dpr);
            
            updateBHScreenCoords();
        }

        function updateBHScreenCoords() {
            if (threeContainer) {
                const rect = threeContainer.getBoundingClientRect();
                bhScreenX = rect.left + rect.width / 2;
                bhScreenY = rect.top + rect.height / 2;
            }
        }

        window.addEventListener('scroll', updateBHScreenCoords, { passive: true });

        resizeBg();
        window.addEventListener('resize', resizeBg);

        // Physics particles — interactive atoms
        class Atom {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.baseSize = 2 + Math.random() * 3;
                this.size = this.baseSize;
                this.mass = this.baseSize;
                this.grabbed = false;
                this.friction = 0.985;
                this.opacity = 0.15 + Math.random() * 0.25;

                // Color variety — more purple/blue/indigo
                const colorChoice = Math.random();
                if (colorChoice < 0.35) {
                    this.color = '91, 76, 255';    // indigo
                } else if (colorChoice < 0.65) {
                    this.color = '122, 99, 255';   // purple
                } else if (colorChoice < 0.85) {
                    this.color = '79, 125, 245';   // blue
                } else {
                    this.color = '116, 224, 239';  // cyan
                }
            }

            update() {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const interactRadius = 150;

                if (dist < interactRadius && dist > 0) {
                    const force = (interactRadius - dist) / interactRadius;

                    if (mouse.down) {
                        // Attract and grab — pull toward cursor
                        this.vx += (dx / dist) * force * 0.8;
                        this.vy += (dy / dist) * force * 0.8;
                        this.size = this.baseSize * (1 + force * 0.8);
                        this.grabbed = true;
                    } else {
                        // Gentle repel — push away from cursor
                        this.vx -= (dx / dist) * force * 0.3;
                        this.vy -= (dy / dist) * force * 0.3;
                        this.size = this.baseSize * (1 + force * 0.3);
                        this.grabbed = false;
                    }
                } else {
                    this.size += (this.baseSize - this.size) * 0.1;
                    this.grabbed = false;
                }

                // Gravity pull to Black Hole
                if (bhScreenX !== -1000 && bhScreenY !== -1000) {
                    const bhDx = bhScreenX - this.x;
                    const bhDy = bhScreenY - this.y;
                    const bhDist = Math.sqrt(bhDx * bhDx + bhDy * bhDy);
                    const eventHorizonPullRange = 450; 
                    
                    if (bhDist < eventHorizonPullRange && bhDist > 30) {
                        const gravForce = Math.pow((eventHorizonPullRange - bhDist) / eventHorizonPullRange, 2.0);
                        // Swirl vector perpendicular to the gravity vector
                        const swirlX = -bhDy / bhDist;
                        const swirlY = bhDx / bhDist;
                        
                        // Pull inward plus slow orbital drift
                        this.vx += (bhDx / bhDist) * gravForce * 0.3 + swirlX * gravForce * 0.2;
                        this.vy += (bhDy / bhDist) * gravForce * 0.3 + swirlY * gravForce * 0.2;
                        this.size = this.baseSize * (1 + gravForce * 0.6);
                        
                        // Progressive friction — particles crawl as they approach the center
                        const proximityDamping = 1.0 - gravForce * 0.6; // heavy drag near core
                        this.vx *= proximityDamping;
                        this.vy *= proximityDamping;
                        
                        // Add glow if trapped
                        if (bhDist < 120) {
                            this.grabbed = true;
                        }
                    }
                }

                // Release throw — inherit cursor velocity
                if (this.grabbed && !mouse.down) {
                    this.vx += mouse.vx * 0.5;
                    this.vy += mouse.vy * 0.5;
                }

                // Apply velocity with friction
                this.vx *= this.friction;
                this.vy *= this.friction;
                this.x += this.vx;
                this.y += this.vy;

                // Soft bounce off edges
                if (this.x < 0) { this.x = 0; this.vx *= -0.5; }
                if (this.x > bgW) { this.x = bgW; this.vx *= -0.5; }
                if (this.y < 0) { this.y = 0; this.vy *= -0.5; }
                if (this.y > bgH) { this.y = bgH; this.vy *= -0.5; }
            }

            draw(ctx) {
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                const dynamicOpacity = Math.min(this.opacity + speed * 0.05, 0.7);

                // Glow
                if (speed > 0.5 || this.grabbed) {
                    const glowSize = this.size * (3 + speed * 0.5);
                    const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowSize);
                    glow.addColorStop(0, `rgba(${this.color}, ${dynamicOpacity * 0.5})`);
                    glow.addColorStop(1, `rgba(${this.color}, 0)`);
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, glowSize, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Core
                ctx.fillStyle = `rgba(${this.color}, ${dynamicOpacity})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Create atoms
        const atoms = [];
        const count = Math.min(60, Math.floor((bgW * bgH) / 18000));
        for (let i = 0; i < count; i++) {
            atoms.push(new Atom(Math.random() * bgW, Math.random() * bgH));
        }

        // Connection distance
        const connectionDist = 120;

        function drawBg() {
            bgCtx.clearRect(0, 0, bgW, bgH);

            // Update & draw atoms
            atoms.forEach(atom => {
                atom.update();
                atom.draw(bgCtx);
            });

            // Draw connections
            for (let i = 0; i < atoms.length; i++) {
                for (let j = i + 1; j < atoms.length; j++) {
                    const dx = atoms[i].x - atoms[j].x;
                    const dy = atoms[i].y - atoms[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < connectionDist) {
                        const opacity = 0.06 * (1 - dist / connectionDist);
                        const speed = Math.sqrt(
                            atoms[i].vx * atoms[i].vx + atoms[i].vy * atoms[i].vy +
                            atoms[j].vx * atoms[j].vx + atoms[j].vy * atoms[j].vy
                        );
                        const boostedOpacity = Math.min(opacity + speed * 0.01, 0.2);

                        bgCtx.strokeStyle = `rgba(91, 76, 255, ${boostedOpacity})`;
                        bgCtx.lineWidth = 0.5;
                        bgCtx.beginPath();
                        bgCtx.moveTo(atoms[i].x, atoms[i].y);
                        bgCtx.lineTo(atoms[j].x, atoms[j].y);
                        bgCtx.stroke();
                    }
                }
            }

            // Draw connections to mouse when nearby
            if (mouse.x > 0 && mouse.y > 0) {
                atoms.forEach(atom => {
                    const dx = mouse.x - atom.x;
                    const dy = mouse.y - atom.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 200) {
                        const opacity = 0.1 * (1 - dist / 200);
                        bgCtx.strokeStyle = `rgba(122, 99, 255, ${opacity})`;
                        bgCtx.lineWidth = 0.8;
                        bgCtx.beginPath();
                        bgCtx.moveTo(atom.x, atom.y);
                        bgCtx.lineTo(mouse.x, mouse.y);
                        bgCtx.stroke();
                    }
                });
            }

            requestAnimationFrame(drawBg);
        }

        drawBg();
    }
})();
