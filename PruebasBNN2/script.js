// 1. SHADER DEL HAZ DE LUZ INFINITO
const beamFragmentShader = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;

    void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        float speed = time * 0.7;
        float r = 0.04 / abs(p.x + sin((p.y * 0.4 + speed) * 1.5) * 0.3); 
        float g = 0.04 / abs(p.x + sin((p.y * 0.4 + speed * 1.1) * 1.6) * 0.3);
        float b = 0.06 / abs(p.x + sin((p.y * 0.4 + speed * 0.9) * 1.4) * 0.4);
        vec3 color = vec3(r * 2.5 + g * 1.0, g * 2.0 + r * 0.5, b * 3.5 + r * 1.0);
        float vignette = 1.2 - length(p * 0.4);
        gl_FragColor = vec4(color * vignette, 1.0);
    }
`;

const imageVertexShader = `
    varying vec2 vUv;
    uniform float uOffset;
    uniform float uTime;
    void main() {
        vUv = uv;
        vec3 pos = position;
        pos.z += sin(uv.y * 3.0 + uTime) * uOffset * 0.1;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const imageFragmentShader = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uBlur;

    float roundedBox(vec2 p, vec2 b, float r) {
        vec2 d = abs(p) - b + vec2(r);
        return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
    }

    void main() {
        vec2 uv = vUv;
        float d = roundedBox(uv - 0.5, vec2(0.48), 0.08); 
        float mask = 1.0 - smoothstep(0.0, 0.015, d);
        
        float blur = uBlur * 0.02;
        vec4 color = vec4(0.0);
        
        if (blur > 0.001) {
            color += texture2D(uTexture, uv + vec2(-blur, 0.0)) * 0.2;
            color += texture2D(uTexture, uv + vec2(blur, 0.0)) * 0.2;
            color += texture2D(uTexture, uv) * 0.6;
        } else {
            color = texture2D(uTexture, uv);
        }
        
        gl_FragColor = vec4(color.rgb, mask);
    }
`;

let scene, camera, renderer, beamMesh, beamUniforms;
const imageMeshes = [];
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

const PERSPECTIVE = 800;
let smoothedScroll = window.scrollY;
let mouseX = 0, mouseY = 0;
let cursorX = 0, cursorY = 0;
let followerX = 0, followerY = 0;

function getAbsoluteTop(element) {
    let top = 0;
    while (element) { top += element.offsetTop; element = element.offsetParent; }
    return top;
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const fov = 2 * Math.atan((window.innerHeight / 2) / PERSPECTIVE) * (180 / Math.PI);
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 20000);
    camera.position.z = PERSPECTIVE;

    beamUniforms = { resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }, time: { value: 0.0 } };
    const beamGeometry = new THREE.PlaneGeometry(window.innerWidth * 2, window.innerHeight * 2);
    const beamMaterial = new THREE.ShaderMaterial({
        vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
        fragmentShader: beamFragmentShader,
        uniforms: beamUniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false
    });
    beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
    // Posicionado en el centro de la órbita de las tarjetas (-600)
    beamMesh.position.z = -600;
    scene.add(beamMesh);

    createPortfolio();
    animate();
}

function createPortfolio() {
    const items = document.querySelectorAll('.portfolio-item');
    items.forEach((cont, index) => {
        const img = cont.querySelector('img');
        const video = cont.querySelector('video');
        if (!img) return;

        console.log(`Cargando card ${index + 1}: ${img.src}`);
        const texture = textureLoader.load(img.src);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.ShaderMaterial({
            vertexShader: imageVertexShader,
            fragmentShader: imageFragmentShader,
            uniforms: {
                uTexture: { value: texture },
                uOffset: { value: 0 },
                uTime: { value: 0 },
                uBlur: { value: 0 }
            },
            transparent: true,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 64, 64), material);
        scene.add(mesh);
        imageMeshes.push({ mesh, container: cont, material, initialTop: getAbsoluteTop(cont), initialWidth: cont.offsetWidth, initialHeight: cont.offsetHeight, details: cont.querySelector('.project-details') });

        // Si hay video, intentamos cargarlo y cambiar la textura cuando esté listo
        if (video) {
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.crossOrigin = "anonymous";

            const startVideo = () => {
                console.log(`Video de card ${index + 1} listo`);
                const videoTexture = new THREE.VideoTexture(video);
                videoTexture.minFilter = THREE.LinearFilter;
                videoTexture.magFilter = THREE.LinearFilter;
                videoTexture.colorSpace = THREE.SRGBColorSpace;
                material.uniforms.uTexture.value = videoTexture;
                material.needsUpdate = true;
            };

            video.play().then(startVideo).catch(() => {
                console.log(`Esperando interacción para card ${index + 1}`);
            });
            video.addEventListener('playing', startVideo, { once: true });
        }

        if (cont.querySelector('.project-details')) initProximityText(cont.querySelector('.project-details'));
    });
}

function updatePortfolio() {
    smoothedScroll += (window.scrollY - smoothedScroll) * 0.1;
    const scrollVelocity = (window.scrollY - smoothedScroll) * 0.1;

    imageMeshes.forEach(item => {
        const itemYInScreen = item.initialTop - smoothedScroll;
        const centerOffset = itemYInScreen + item.initialHeight / 2 - window.innerHeight / 2;
        const progress = centerOffset / (window.innerHeight / 2);

        const radius = 600;
        const theta = progress * Math.PI * 0.8;
        const xOffset = Math.sin(theta) * radius;
        const zFocus = 0;
        const zOffset = Math.cos(theta) * radius - (radius - zFocus);

        item.mesh.position.set(xOffset, -centerOffset, zOffset);
        const scaleFactor = 0.85;
        item.mesh.scale.set(item.initialWidth * scaleFactor, item.initialHeight * scaleFactor, 1);
        item.mesh.rotation.set(progress * 0.3, theta, Math.sin(theta) * 0.05);

        const r = item.mesh.rotation;
        item.container.style.transform = `perspective(${PERSPECTIVE}px) translateX(${xOffset}px) translateZ(${zOffset}px) rotateX(${-r.x * 180 / Math.PI}deg) rotateY(${r.y * 180 / Math.PI}deg) rotateZ(${r.z * 180 / Math.PI}deg) scale(${scaleFactor})`;

        if (item.details) {
            const distFromFocus = Math.max(0, zFocus - zOffset);
            const blurValue = distFromFocus / 150;
            item.details.style.filter = `blur(${Math.min(10, blurValue * 4)}px)`;
            item.details.style.opacity = Math.max(0.2, 1.0 - blurValue * 0.5);
            item.material.uniforms.uBlur.value = blurValue;
        }
        item.material.uniforms.uOffset.value = scrollVelocity;
        item.material.uniforms.uTime.value += 0.01;
    });
}

function updateCursor() {
    const c = document.getElementById('custom-cursor'), f = document.getElementById('cursor-follower');
    if (!c || !f) return;
    cursorX += (mouseX - cursorX) * 0.3; cursorY += (mouseY - cursorY) * 0.3;
    followerX += (mouseX - followerX) * 0.15; followerY += (mouseY - followerY) * 0.15;
    c.style.left = `${cursorX}px`; c.style.top = `${cursorY}px`; c.style.transform = `translate(-50%, -50%)`;
    f.style.left = `${followerX}px`; f.style.top = `${followerY}px`; f.style.transform = `translate(-50%, -50%)`;
}

const proximityItems = [];

function initProximityText(singleTarget = null) {
    const targets = singleTarget ? [singleTarget] : document.querySelectorAll('.headline-xl, .headline-l');
    targets.forEach(target => {
        if (target.dataset.proximityInit) return;
        target.dataset.proximityInit = "true";

        const nodes = Array.from(target.childNodes);
        target.innerHTML = '';
        const chars = [];

        nodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                text.split('').forEach(char => {
                    const span = document.createElement('span');
                    if (char === ' ') {
                        span.innerHTML = '&nbsp;';
                    } else {
                        span.innerText = char;
                    }
                    span.style.display = 'inline-block';
                    span.style.transition = 'color 0.3s ease';
                    span.style.willChange = 'transform, color';
                    target.appendChild(span);
                    chars.push(span);
                });
            } else {
                target.appendChild(node.cloneNode(true));
            }
        });
        proximityItems.push({ element: target, chars });
    });
}

function updateProximityText() {
    const radius = 150;
    proximityItems.forEach(item => {
        item.chars.forEach(span => {
            const rect = span.getBoundingClientRect();
            const charX = rect.left + rect.width / 2;
            const charY = rect.top + rect.height / 2;

            const dx = mouseX - charX;
            const dy = mouseY - charY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < radius) {
                const proximity = Math.exp(-Math.pow(distance / (radius / 2), 2) / 2);
                const scale = 1 + proximity * 0.4;

                if (proximity > 0.1) {
                    span.style.color = `#a855f7`;
                    span.style.transform = `scale(${scale})`;
                    span.style.mixBlendMode = 'difference';
                } else {
                    span.style.color = '';
                    span.style.transform = 'scale(1)';
                    span.style.mixBlendMode = 'normal';
                }
            } else {
                span.style.color = '';
                span.style.transform = 'scale(1)';
                span.style.mixBlendMode = 'normal';
            }
        });
    });
}

window.addEventListener('load', () => {
    document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

    const unlockVideos = () => {
        document.querySelectorAll('video').forEach(v => v.play().catch(() => { }));
        document.removeEventListener('click', unlockVideos);
    };
    document.addEventListener('click', unlockVideos);

    setTimeout(() => {
        init();
        initProximityText();
    }, 200);
});

function updateExpansionSection() {
    const section = document.getElementById('agency-life');
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const scrollProgress = Math.min(Math.max(-rect.top / (rect.height - window.innerHeight), 0), 1);

    const mediaWrapper = section.querySelector('.expansion-media-wrapper');
    const bg = section.querySelector('.expansion-bg');
    const titleLeft = section.querySelector('.expansion-title.left');
    const titleRight = section.querySelector('.expansion-title.right');

    if (mediaWrapper) {
        const startW = window.innerWidth < 768 ? 200 : 300;
        const startH = window.innerWidth < 768 ? 300 : 400;
        const targetW = window.innerWidth;
        const targetH = window.innerHeight;
        const currentW = startW + (targetW - startW) * scrollProgress;
        const currentH = startH + (targetH - startH) * scrollProgress;
        const borderRadius = 20 * (1 - scrollProgress);
        mediaWrapper.style.width = `${currentW}px`;
        mediaWrapper.style.height = `${currentH}px`;
        mediaWrapper.style.borderRadius = `${borderRadius}px`;
    }

    if (bg) bg.style.opacity = 1 - scrollProgress;

    if (titleLeft && titleRight) {
        const moveX = scrollProgress * 100;
        titleLeft.style.transform = `translateX(-${moveX}vw)`;
        titleRight.style.transform = `translateX(${moveX}vw)`;
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (beamUniforms) beamUniforms.time.value += 0.015;
    updatePortfolio();
    updateCursor();
    updateProximityText();
    updateExpansionSection();
    imageMeshes.forEach(i => {
        const material = i.mesh.material;
        if (material.uniforms) {
            material.uniforms.uTime.value += 0.01;
            const tex = material.uniforms.uTexture.value;
            if (tex && tex.image instanceof HTMLVideoElement) {
                tex.needsUpdate = true;
            }
        }
    });
    if (renderer && scene && camera) renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    if (!renderer) return;
    const width = window.innerWidth, height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.fov = 2 * Math.atan((height / 2) / PERSPECTIVE) * (180 / Math.PI);
    camera.updateProjectionMatrix();
    if (beamUniforms) beamUniforms.resolution.value.set(width, height);
});
